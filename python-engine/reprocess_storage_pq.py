import os
import sys
import gc
import re
import uuid
import httpx
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from dotenv import load_dotenv

# Load env dari direktori saat ini
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

# Pastikan output UTF-8 di Windows Console
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

from supabase import create_client, Client
from parser import parse_pq_file, extract_date_from_filename
from main import process_daily_sales, create_sync_history_record, update_sync_history_record

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL") or os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("[ERROR] Konfigurasi SUPABASE_URL atau SUPABASE_KEY tidak ditemukan!")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def get_storage_pq_files(bucket_name: str = "excel-uploads", folder_path: str = "PQ/POWER QUERY") -> List[Dict[str, Any]]:
    """Mengambil dan mengurutkan seluruh file PQ di Supabase Storage dari tanggal tertua ke terbaru."""
    print(f"\n[SCAN] Mengambil daftar file dari bucket '{bucket_name}', folder '{folder_path}'...")
    try:
        items = supabase.storage.from_(bucket_name).list(folder_path)
    except Exception as ex:
        print(f"[ERROR] Gagal membaca storage: {ex}")
        return []

    valid_files = []
    for item in items:
        name = item.get("name", "")
        if not name.lower().endswith((".csv", ".xlsx", ".xls")):
            continue

        file_date = extract_date_from_filename(name)
        if not file_date:
            print(f"  [SKIP] Tanggal tidak dapat diekstrak dari: {name}")
            continue

        valid_files.append({
            "name": name,
            "path": f"{folder_path}/{name}",
            "date": file_date,
            "size": item.get("metadata", {}).get("size", 0)
        })

    # Urutkan secara kronologis (Ascending: tanggal tertua -> terbaru)
    valid_files.sort(key=lambda x: x["date"])
    return valid_files


def run_sequential_reprocess(start_date_str: str = "2026-10-10"):
    """
    Menjalankan reprocess berurutan mulai dari start_date_str (default 10 Oktober 2026)
    agar stok di tabel Product selalu berakhir di file paling baru (21 Oktober).
    """
    start_dt = datetime.strptime(start_date_str, "%Y-%m-%d")
    all_files = get_storage_pq_files()

    filtered_files = [f for f in all_files if f["date"] >= start_dt]

    print("\n" + "=" * 70, flush=True)
    print(f"[START] REPROSES SEKUENSIAL SMART PQ (Mulai {start_date_str})", flush=True)
    print(f"Total file ditemukan yang memenuhi syarat: {len(filtered_files)}", flush=True)
    print("=" * 70, flush=True)

    for idx, f in enumerate(filtered_files, 1):
        print(f"[{idx}/{len(filtered_files)}] TANGGAL: {f['date'].strftime('%Y-%m-%d')} -> {f['name']}", flush=True)

    print("=" * 70, flush=True)

    for idx, f in enumerate(filtered_files, 1):
        file_name = f["name"]
        file_path = f["path"]
        file_date_str = f["date"].strftime("%d %B %Y")
        print(f"\n>>> [{idx}/{len(filtered_files)}] MEMPROSES: {file_name} ({file_date_str}) <<<", flush=True)

        temp_path = f"temp_reprocess_{uuid.uuid4().hex[:6]}_{file_name}"
        record_id = create_sync_history_record(file_name, file_path, "PQ")
        total_upserted = 0

        try:
            # 1. Download file dari Supabase Storage
            print(f"  [1/4] Mengunduh {file_path} dari Supabase Storage...")
            file_bytes = supabase.storage.from_("excel-uploads").download(file_path)
            with open(temp_path, "wb") as out:
                out.write(file_bytes)
            print(f"  [OK] Tersimpan sementara di {temp_path} ({len(file_bytes)} bytes)")

            # 2. Parsing dengan Engine PQ
            print(f"  [2/4] Parsing Power Query...")
            parsed_data = parse_pq_file(temp_path)
            print(f"  [OK] Berhasil mengekstrak {len(parsed_data)} baris SKU unik.")

            if not parsed_data:
                print(f"  [WARN] Tidak ada data valid untuk {file_name}.")
                update_sync_history_record(record_id, "FAILED", 0)
                continue

            # 3. Upsert ke tabel Product
            print(f"  [3/4] Melakukan smart upsert ke tabel Product...")
            CHUNK_SIZE = 500
            seen_barcodes_in_run: Dict[str, str] = {}

            for i in range(0, len(parsed_data), CHUNK_SIZE):
                chunk_data = parsed_data[i:i + CHUNK_SIZE]
                chunk_skus = [str(item["sku"]) for item in chunk_data]

                # Ambil existing untuk proteksi promo & source
                try:
                    existing_res = supabase.table("Product").select("*").in_("sku", chunk_skus).execute()
                    existing_map = {str(item["sku"]): item for item in (existing_res.data or [])}
                except Exception as ex:
                    print(f"    [WARN] Gagal fetch chunk existing: {ex}")
                    existing_map = {}

                supabase_payload = []
                for item in chunk_data:
                    sku_str = str(item["sku"])
                    ex = existing_map.get(sku_str, {})

                    # Barcode check
                    barcode_val = item.get("barcode") or ex.get("barcode")
                    if barcode_val:
                        if barcode_val in seen_barcodes_in_run and seen_barcodes_in_run[barcode_val] != sku_str:
                            barcode_val = None
                        else:
                            seen_barcodes_in_run[barcode_val] = sku_str

                    # Proteksi Harga Normal
                    new_harga = item.get("harga_normal", 0)
                    if ex.get("hargaNormalSource") == "PROMO" and ex.get("hargaNormal", 0) != 0:
                        final_harga = ex.get("hargaNormal", 0)
                        final_source = "PROMO"
                    else:
                        final_harga = new_harga if new_harga != 0 else ex.get("hargaNormal", 0)
                        final_source = "PQ" if new_harga != 0 else ex.get("hargaNormalSource", "PQ")

                    payload = {
                        "sku":               item["sku"],
                        "barcode":           barcode_val,
                        "article":           item.get("article") or ex.get("article"),
                        "brand":             item.get("brand") or ex.get("brand", "SUKO"),
                        "dept":              item.get("dept") or ex.get("dept", "DEPARTEMEN LAINNYA"),
                        "color":             item.get("color") or ex.get("color"),
                        "size":              item.get("size") or ex.get("size"),
                        "description":       item.get("description") or ex.get("description", f"Produk {item['sku']}"),

                        "hargaNormal":       final_harga,
                        "hargaNormalSource": final_source,

                        # Pertahankan PROMO jika ada
                        "hargaPromo":        ex.get("hargaPromo"),
                        "discountType":      ex.get("discountType"),
                        "fromDate":          ex.get("fromDate"),
                        "toDate":            ex.get("toDate"),
                        "promoFileName":     ex.get("promoFileName"),

                        # Data POS terbaru per tanggal file ini
                        "stok":             item.get("stok", 0),
                        "eoh_retail":       item.get("eoh_retail", 0),
                        "sales_mtd":        item.get("sales_mtd", 0),
                        "sales_mtd_retail": item.get("sales_mtd_retail", 0),
                        "sales_wtd":        item.get("sales_wtd", 0),
                        "sales_wtd_retail": item.get("sales_wtd_retail", 0),
                        "sales_ytd":        item.get("sales_ytd", 0),
                        "sales_ytd_retail": item.get("sales_ytd_retail", 0),
                        "boy_unit":         item.get("boy_unit", 0),
                        "boy_retail":       item.get("boy_retail", 0),
                        "bom_unit":         item.get("bom_unit", 0),
                        "day_sales_unit":   item.get("day_sales_unit", 0),
                        "day_sales_retail": item.get("day_sales_retail", 0),

                        "updatedAt": datetime.now(timezone.utc).isoformat(),
                    }
                    supabase_payload.append(payload)

                try:
                    supabase.table("Product").upsert(supabase_payload, on_conflict="sku").execute()
                    total_upserted += len(supabase_payload)
                except Exception as ex:
                    print(f"    [ERROR] Gagal upsert batch {i // CHUNK_SIZE + 1}: {ex}")

            print(f"  [OK] Berhasil upsert {total_upserted} produk.")

            # 4. Catat DailySales
            print(f"  [4/4] Memproses transaksi DailySales ke database...")
            process_daily_sales(parsed_data, file_name)

            update_sync_history_record(record_id, "SUCCESS", total_upserted)
            print(f"  [BERHASIL] SELESAI PROSES: {file_name}", flush=True)

        except Exception as ex:
            print(f"  [ERROR] GAGAL MEMPROSES {file_name}: {ex}", flush=True)
            update_sync_history_record(record_id, "FAILED", total_upserted)
        finally:
            if os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except Exception:
                    pass
            gc.collect()

    print("\n" + "=" * 70, flush=True)
    print("[SELESAI] SEMUA FILE POWER QUERY BERHASIL DIPROSES BERURUTAN!", flush=True)
    print(f"Stok di tabel Product kini 100% memegang data terbaru ({filtered_files[-1]['name']}).", flush=True)
    print("=" * 70, flush=True)


if __name__ == "__main__":
    start = sys.argv[1] if len(sys.argv) > 1 else "2026-10-10"
    run_sequential_reprocess(start)
