import os
import gc
import uuid
import httpx
import uvicorn
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from dotenv import load_dotenv

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from supabase import create_client, Client

from parser import (
    parse_promo_file,
    parse_pq_file,
    extract_date_from_filename,
    get_last_ai_advice
)

load_dotenv()
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

# ─────────────────────────────────────────────────────────────
#  Konfigurasi Environment
# ─────────────────────────────────────────────────────────────
SUPABASE_URL  = os.getenv("NEXT_PUBLIC_SUPABASE_URL") or os.getenv("SUPABASE_URL")
SUPABASE_KEY  = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")
VERCEL_URL    = os.getenv("VERCEL_URL", "")
SECRET_TOKEN  = os.getenv("WEBHOOK_SECRET", "B4mb4ng123!Aman")

supabase: Optional[Client] = None
if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("[ENGINE] Berhasil terhubung ke Supabase.")
    except Exception as e:
        print(f"[ENGINE ERROR] Gagal inisialisasi client Supabase: {e}")

app = FastAPI(
    title="Price Checker — High Performance Python Data Engine",
    version="2.0.0",
    description="Engine pemrosesan data ritel (Power Query & Promo Excel/CSV) terintegrasi dengan Supabase & Vercel."
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────────────────────
#  Helper: Supervisor User Cache untuk SyncHistory
# ─────────────────────────────────────────────────────────────
_cached_supervisor_id: Optional[str] = None

def get_supervisor_user_id() -> str:
    """Ambil ID user Supervisor untuk pencatatan di tabel SyncHistory."""
    global _cached_supervisor_id
    if _cached_supervisor_id:
        return _cached_supervisor_id

    fallback_id = "cmuiptoiz0000r94j61sfmw4i"
    if not supabase:
        return fallback_id

    try:
        res = supabase.table("User").select("id").eq("role", "SUPERVISOR").limit(1).execute()
        if res.data and len(res.data) > 0:
            _cached_supervisor_id = res.data[0]["id"]
            return _cached_supervisor_id
        
        # Coba ambil sembarang user jika tidak ada supervisor
        res_any = supabase.table("User").select("id").limit(1).execute()
        if res_any.data and len(res_any.data) > 0:
            _cached_supervisor_id = res_any.data[0]["id"]
            return _cached_supervisor_id
    except Exception as ex:
        print(f"[ENGINE] Gagal lookup supervisor ID: {ex}")

    _cached_supervisor_id = fallback_id
    return fallback_id


def create_sync_history_record(file_name: str, file_url: str, folder: str) -> Optional[str]:
    """Catat awal sinkronisasi ke tabel SyncHistory dengan status PROCESSING."""
    if not supabase:
        return None
    try:
        user_id = get_supervisor_user_id()
        record_id = f"sync_{uuid.uuid4().hex[:20]}"
        sync_type = "PROMO_MINGGUAN" if folder == "PROMO" else "PQ_HARIAN"

        payload = {
            "id": record_id,
            "userId": user_id,
            "type": sync_type,
            "fileName": file_name,
            "fileUrl": file_url,
            "status": "PROCESSING",
            "records": 0,
            "createdAt": datetime.now(timezone.utc).isoformat()
        }
        res = supabase.table("SyncHistory").insert(payload).execute()
        if res.data:
            return record_id
    except Exception as ex:
        print(f"[ENGINE] Error create SyncHistory: {ex}")
    return None


def update_sync_history_record(record_id: Optional[str], status: str, records_count: int):
    """Update status akhir SyncHistory (SUCCESS / FAILED) dan jumlah data."""
    if not supabase or not record_id:
        return
    try:
        supabase.table("SyncHistory").update({
            "status": status,
            "records": records_count
        }).eq("id", record_id).execute()
        print(f"[ENGINE] SyncHistory [{record_id}] diupdate ke {status} ({records_count} records).")
    except Exception as ex:
        print(f"[ENGINE] Error update SyncHistory [{record_id}]: {ex}")


# ─────────────────────────────────────────────────────────────
#  Helper: DailySales Recording dari File PQ
# ─────────────────────────────────────────────────────────────
def process_daily_sales(parsed_pq_data: List[Dict[str, Any]], file_name: str):
    """
    Catat metrik penjualan harian (DAY_SALES_UNIT & DAY_SALES_RETAIL)
    dari file PQ ke tabel DailySales.
    """
    if not supabase or not parsed_pq_data:
        return

    # 1. Tentukan tanggal target dari nama file atau hari ini
    extracted_date = extract_date_from_filename(file_name)
    if not extracted_date:
        extracted_date = datetime.now(timezone.utc)
    
    target_date_iso = extracted_date.strftime("%Y-%m-%dT00:00:00.000Z")
    date_key = extracted_date.strftime("%Y%m%d")

    # 2. Filter produk yang ada penjualan harian
    items_with_sales = [
        item for item in parsed_pq_data
        if item.get("day_sales_unit", 0) > 0 or item.get("day_sales_retail", 0) > 0
    ]

    if not items_with_sales:
        print(f"[DAILY-SALES] Tidak ada transaksi harian untuk tanggal {target_date_iso}.")
        return

    print(f"[DAILY-SALES] Menemukan {len(items_with_sales)} produk dengan transaksi harian pada {target_date_iso}.")

    # 3. Lookup Product ID per chunk
    CHUNK_SIZE = 300
    total_inserted = 0

    for i in range(0, len(items_with_sales), CHUNK_SIZE):
        chunk = items_with_sales[i:i + CHUNK_SIZE]
        skus = [str(x["sku"]) for x in chunk]

        try:
            prod_res = supabase.table("Product").select("id, sku").in_("sku", skus).execute()
            sku_to_id = {str(p["sku"]): p["id"] for p in (prod_res.data or [])}

            daily_payload = []
            for item in chunk:
                sku_str = str(item["sku"])
                pid = sku_to_id.get(sku_str)
                if not pid:
                    continue

                daily_id = f"ds_{pid}_{date_key}"
                daily_payload.append({
                    "id": daily_id,
                    "productId": pid,
                    "date": target_date_iso,
                    "qtySold": int(item.get("day_sales_unit", 0)),
                    "omzet": float(item.get("day_sales_retail", 0.0)),
                    "createdAt": datetime.now(timezone.utc).isoformat()
                })

            if daily_payload:
                supabase.table("DailySales").upsert(daily_payload, on_conflict="productId,date").execute()
                total_inserted += len(daily_payload)

        except Exception as ex:
            print(f"[DAILY-SALES ERROR] Gagal upsert batch DailySales: {ex}")

    print(f"[DAILY-SALES] ✅ Selesai upsert {total_inserted} record ke DailySales.")


# ─────────────────────────────────────────────────────────────
#  Health Check & Info Endpoints
# ─────────────────────────────────────────────────────────────
@app.get("/")
def read_root():
    return {
        "status": "online",
        "engine": "Price Checker High-Performance Python Data Engine",
        "version": "2.0.0",
        "features": [
            "Smart Power Query & Promo Multi-Format Parser",
            "Automatic Product Attribute Extraction (Barcode, Article, Brand, Color, Size)",
            "SyncHistory Real-time Audit Logging",
            "Automated DailySales Tracking",
            "Safe Partial Upserting (Zero-Overwrite Protection)"
        ]
    }

@app.get("/health")
def health_check():
    supabase_ok = False
    if supabase:
        try:
            test_res = supabase.table("Product").select("id").limit(1).execute()
            supabase_ok = True
        except Exception:
            supabase_ok = False

    return {
        "status": "healthy" if supabase_ok else "degraded",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "supabase_connected": supabase_ok,
        "vercel_configured": bool(VERCEL_URL),
    }


# ─────────────────────────────────────────────────────────────
#  ENDPOINT UTAMA — Dipanggil Google Apps Script (GAS)
# ─────────────────────────────────────────────────────────────
class ProcessFromStorageRequest(BaseModel):
    file_url:  str
    file_name: str
    folder:    str = "PQ"   # "PQ" atau "PROMO"


@app.post("/api/process-from-storage")
async def process_from_storage(req: ProcessFromStorageRequest, background_tasks: BackgroundTasks):
    """
    Dipanggil oleh Google Apps Script setelah upload ke Supabase Storage.
    Menjalankan proses parsing, deduplikasi, kalkulasi, dan upsert di latar belakang.
    """
    print(f"\n[ENGINE] Request proses diterima: {req.file_name} ({req.folder})")

    background_tasks.add_task(
        _process_and_notify,
        file_url=req.file_url,
        file_name=req.file_name,
        folder=req.folder
    )

    return {
        "success": True,
        "message": f"Mulai memproses file {req.file_name} di background task.",
        "folder": req.folder
    }


async def _process_and_notify(file_url: str, file_name: str, folder: str):
    """
    Alur terpadu:
    1. Catat status PROCESSING di SyncHistory
    2. Download file dari Storage
    3. Parsing sesuai jalur (PROMO vs PQ)
    4. Smart Upsert ke tabel Product
    5. Rekam DailySales (jika PQ)
    6. Update status SUCCESS/FAILED di SyncHistory
    7. Notifikasi Vercel ISR Revalidate
    """
    temp_path = f"temp_{uuid.uuid4().hex[:8]}_{file_name}"
    history_record_id = create_sync_history_record(file_name, file_url, folder)
    total_upserted = 0

    try:
        # 1. Download file dari Storage
        print(f"[ENGINE] Mengunduh file dari Storage: {file_url}")
        async with httpx.AsyncClient(timeout=90) as client:
            response = await client.get(file_url)
            response.raise_for_status()

        with open(temp_path, "wb") as f:
            f.write(response.content)
        print(f"[ENGINE] File tersimpan sementara di {temp_path} ({len(response.content)} bytes)")

        # 2. Parsing Excel / CSV
        if folder == "PQ":
            parsed_data = parse_pq_file(temp_path)
        else:
            parsed_data = parse_promo_file(temp_path)

        print(f"[ENGINE] Berhasil mem-parse {len(parsed_data)} baris dari {file_name}")

        if not parsed_data:
            print("[ENGINE] Tidak ada data valid ditemukan. Proses dihentikan.")
            update_sync_history_record(history_record_id, "FAILED", 0)
            return

        # 3. Smart Batch Upsert ke Supabase
        if supabase:
            CHUNK_SIZE = 500
            seen_barcodes_in_run: Dict[str, str] = {}

            for i in range(0, len(parsed_data), CHUNK_SIZE):
                chunk_data = parsed_data[i:i + CHUNK_SIZE]
                chunk_skus = [str(item["sku"]) for item in chunk_data]

                # Ambil data existing untuk preservasi proteksi harga & atribut
                try:
                    existing_res = supabase.table("Product").select("*").in_("sku", chunk_skus).execute()
                    existing_map = {str(item["sku"]): item for item in (existing_res.data or [])}
                except Exception as ex:
                    print(f"[ENGINE] Peringatan: Gagal fetch data existing chunk {i}: {ex}")
                    existing_map = {}

                supabase_payload = []

                if folder == "PROMO":
                    # --- JALUR PROMO ---
                    for item in chunk_data:
                        sku_str = str(item["sku"])
                        ex = existing_map.get(sku_str, {})

                        # Proteksi Barcode unik
                        barcode_val = item.get("barcode") or ex.get("barcode")
                        if barcode_val:
                            if barcode_val in seen_barcodes_in_run and seen_barcodes_in_run[barcode_val] != sku_str:
                                barcode_val = None
                            else:
                                seen_barcodes_in_run[barcode_val] = sku_str

                        payload = {
                            "sku":               item["sku"],
                            "barcode":           barcode_val,
                            "article":           item.get("article") or ex.get("article"),
                            "brand":             item.get("brand") or ex.get("brand", "SUKO"),
                            "dept":              item.get("dept") or ex.get("dept"),
                            "color":             item.get("color") or ex.get("color"),
                            "size":              item.get("size") or ex.get("size"),
                            "description":       item.get("description") or ex.get("description", f"Produk {item['sku']}"),

                            # Harga Normal (Pertahankan atau update dari PROMO)
                            "hargaNormal":       item.get("harga_normal", 0) if item.get("harga_normal", 0) != 0 else ex.get("hargaNormal", 0),
                            "hargaNormalSource": "PROMO" if item.get("harga_normal", 0) != 0 else ex.get("hargaNormalSource", "PROMO"),

                            # PROMO DATA (Overwrites)
                            "hargaPromo":        item.get("harga_promo") if item.get("is_promo") else None,
                            "discountType":      item.get("tipe_diskon") if item.get("is_promo") else None,
                            "fromDate":          item.get("tgl_mulai"),
                            "toDate":            item.get("tgl_akhir"),
                            "promoFileName":     file_name,

                            # PROTEKSI STOK & SALES (JANGAN DIUBAH/DIPERBAHARUI OLEH PROMO)
                            "stok":             ex.get("stok", 0),
                            "eoh_retail":       ex.get("eoh_retail", 0),
                            "sales_mtd":        ex.get("sales_mtd", 0),
                            "sales_mtd_retail": ex.get("sales_mtd_retail", 0),
                            "sales_wtd":        ex.get("sales_wtd", 0),
                            "sales_wtd_retail": ex.get("sales_wtd_retail", 0),
                            "sales_ytd":        ex.get("sales_ytd", 0),
                            "sales_ytd_retail": ex.get("sales_ytd_retail", 0),
                            "boy_unit":         ex.get("boy_unit", 0),
                            "boy_retail":       ex.get("boy_retail", 0),
                            "bom_unit":         ex.get("bom_unit", 0),
                            "day_sales_unit":   ex.get("day_sales_unit", 0),
                            "day_sales_retail": ex.get("day_sales_retail", 0),

                            "updatedAt": datetime.now(timezone.utc).isoformat(),
                        }
                        supabase_payload.append(payload)

                else:
                    # --- JALUR PQ ---
                    for item in chunk_data:
                        sku_str = str(item["sku"])
                        ex = existing_map.get(sku_str, {})

                        # Proteksi Barcode unik
                        barcode_val = item.get("barcode") or ex.get("barcode")
                        if barcode_val:
                            if barcode_val in seen_barcodes_in_run and seen_barcodes_in_run[barcode_val] != sku_str:
                                barcode_val = None
                            else:
                                seen_barcodes_in_run[barcode_val] = sku_str

                        # Harga Normal: PQ tidak boleh menimpa harga PROMO kecuali jika masih 0
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

                            # PROTEKSI PROMO DATA (JANGAN DIUBAH OLEH PQ)
                            "hargaPromo":        ex.get("hargaPromo"),
                            "discountType":      ex.get("discountType"),
                            "fromDate":          ex.get("fromDate"),
                            "toDate":            ex.get("toDate"),
                            "promoFileName":     ex.get("promoFileName"),

                            # STOK & METRICS SALES (Overwrites dengan data POS terbaru)
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

                # Eksekusi upsert ke Supabase
                try:
                    supabase.table("Product").upsert(supabase_payload, on_conflict="sku").execute()
                    total_upserted += len(supabase_payload)
                    print(f"[ENGINE] Sukses upsert batch {i // CHUNK_SIZE + 1}: {len(supabase_payload)} produk.")
                except Exception as ex:
                    print(f"[ENGINE ERROR] Gagal upsert batch {i // CHUNK_SIZE + 1}: {ex}")

            print(f"[ENGINE] ✅ Selesai upsert {total_upserted} produk ke tabel Product.")

        # 4. Catat DailySales jika ini file PQ
        if folder == "PQ":
            process_daily_sales(parsed_data, file_name)

        # 5. Update status audit di SyncHistory
        update_sync_history_record(history_record_id, "SUCCESS", total_upserted)

        # 6. Notifikasi Vercel agar display data terbaru (sertakan ringkasan saran AI)
        advice_summary = get_last_ai_advice()
        if advice_summary:
            print(f"[ENGINE AI SUMMARY] {advice_summary[:200]}...")
        await _notify_vercel(folder, total_upserted, file_name, advice=advice_summary)

    except Exception as e:
        print(f"[ENGINE ❌ ERROR] Terjadi kesalahan fatal: {e}")
        update_sync_history_record(history_record_id, "FAILED", total_upserted)
    finally:
        # Bersihkan file temp & bebaskan RAM
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
                print(f"[ENGINE] File temp dibersihkan: {temp_path}")
            except Exception:
                pass
        gc.collect()


async def _notify_vercel(folder: str, records_count: int, file_name: str, advice: str = ""):
    """Kirim sinyal revalidasi on-demand ke aplikasi Next.js (Vercel)."""
    if not VERCEL_URL:
        print("[ENGINE] VERCEL_URL tidak diatur. Melewati notifikasi Vercel.")
        return

    try:
        notify_url = f"{VERCEL_URL.rstrip('/')}/api/revalidate"
        payload = {
            "secret": SECRET_TOKEN,
            "type":   "UPDATE_PROMO" if folder == "PROMO" else "PQ_HARIAN",
            "records": records_count,
            "file": file_name,
            "ai_advice": advice,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        async with httpx.AsyncClient(timeout=30) as client:
            res = await client.post(notify_url, json=payload)
        print(f"[ENGINE] Sinyal Vercel terkirim [{res.status_code}]: {res.text[:150]}")
    except Exception as e:
        print(f"[ENGINE] Gagal menghubungi endpoint Vercel (data di DB tetap aman): {e}")


# ─────────────────────────────────────────────────────────────
#  ENDPOINT MULTIPART — Alternatif Upload Langsung
# ─────────────────────────────────────────────────────────────
@app.post("/api/webhook/gmail")
async def gmail_webhook(
    file: UploadFile = File(...),
    token: str       = Form(...),
    folder: str      = Form("PQ"),
    fileName: Optional[str] = Form(None)
):
    """Endpoint upload multipart langsung untuk integrasi webhook atau testing."""
    if token != SECRET_TOKEN:
        raise HTTPException(status_code=401, detail="Token autentikasi tidak valid.")

    final_file_name = fileName or file.filename or "uploaded_file"
    if not final_file_name.lower().endswith(('.xlsx', '.csv', '.xls')):
        raise HTTPException(status_code=400, detail="Format file harus berupa .xlsx, .xls, atau .csv.")

    print(f"[DIRECT-UPLOAD] Menerima file langsung: {final_file_name} ({folder})")
    temp_path = f"direct_{uuid.uuid4().hex[:8]}_{final_file_name}"

    try:
        with open(temp_path, "wb") as buffer:
            buffer.write(await file.read())

        # Gunakan parser terpadu sesuai folder
        if folder == "PROMO":
            parsed_data = parse_promo_file(temp_path)
        else:
            parsed_data = parse_pq_file(temp_path)

        count_rows = len(parsed_data)

        # Upsert langsung jika ada data dan supabase client aktif
        if parsed_data and supabase:
            CHUNK_SIZE = 500
            for i in range(0, count_rows, CHUNK_SIZE):
                chunk = parsed_data[i:i + CHUNK_SIZE]
                chunk_skus = [str(x["sku"]) for x in chunk]

                try:
                    ex_res = supabase.table("Product").select("sku, hargaNormal, hargaNormalSource, stok").in_("sku", chunk_skus).execute()
                    ex_map = {str(item["sku"]): item for item in (ex_res.data or [])}
                except Exception:
                    ex_map = {}

                payload = []
                for item in chunk:
                    sku_str = str(item["sku"])
                    ex = ex_map.get(sku_str, {})

                    p_item = {
                        "sku": item["sku"],
                        "barcode": item.get("barcode"),
                        "article": item.get("article"),
                        "brand": item.get("brand", "SUKO"),
                        "dept": item.get("dept"),
                        "color": item.get("color"),
                        "size": item.get("size"),
                        "description": item.get("description", f"Produk {item['sku']}"),
                        "hargaNormal": item.get("harga_normal", 0) if item.get("harga_normal", 0) != 0 else ex.get("hargaNormal", 0),
                        "hargaNormalSource": "PROMO" if folder == "PROMO" else ex.get("hargaNormalSource", "PQ"),
                        "updatedAt": datetime.now(timezone.utc).isoformat()
                    }

                    if folder == "PROMO":
                        p_item["hargaPromo"] = item.get("harga_promo") if item.get("is_promo") else None
                        p_item["discountType"] = item.get("tipe_diskon") if item.get("is_promo") else None
                        p_item["fromDate"] = item.get("tgl_mulai")
                        p_item["toDate"] = item.get("tgl_akhir")
                        p_item["promoFileName"] = final_file_name
                    else:
                        p_item["stok"] = item.get("stok", 0)
                        p_item["sales_mtd"] = item.get("sales_mtd", 0)
                        p_item["sales_mtd_retail"] = item.get("sales_mtd_retail", 0)

                    payload.append(p_item)

                try:
                    supabase.table("Product").upsert(payload, on_conflict="sku").execute()
                except Exception as ex:
                    print(f"[DIRECT-UPLOAD ERROR] Gagal upsert chunk: {ex}")

        # Catat SyncHistory
        create_sync_history_record(final_file_name, "direct_upload", folder)

        return {
            "success": True,
            "message": f"Berhasil memproses {final_file_name} dengan total {count_rows} baris.",
            "type": folder,
            "rows": count_rows
        }

    except Exception as e:
        print(f"[DIRECT-UPLOAD ERROR] {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass
        gc.collect()


# ─────────────────────────────────────────────────────────────
#  Image Audit & Quality Control Endpoints
# ─────────────────────────────────────────────────────────────
@app.get("/api/audit-images")
def audit_images_endpoint(limit: int = 10000):
    """Analisis kecocokan foto dengan SKU produk."""
    try:
        from audit_images import analyze_sku_images
        return analyze_sku_images(limit=limit)
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

class CleanImagesRequest(BaseModel):
    category: str = "BAGS_AND_ACCESSORIES"

@app.post("/api/clean-mismatched-images")
def clean_mismatched_images_endpoint(req: CleanImagesRequest):
    """Bersihkan foto-foto yang tidak sesuai dengan model produk."""
    try:
        from audit_images import clean_mismatched_images
        return clean_mismatched_images(category=req.category)
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

# ─────────────────────────────────────────────────────────────
#  Reprocess Storage PQ Sequentially
# ─────────────────────────────────────────────────────────────
@app.get("/api/reprocess-storage-pq")
@app.post("/api/reprocess-storage-pq")
async def reprocess_storage_pq_endpoint(background_tasks: BackgroundTasks, start_date: str = "2026-10-10"):
    """
    Mengurutkan seluruh file PQ di Supabase Storage dari tanggal tertua ke terbaru
    mulai dari start_date (default 2026-10-10) dan memprosesnya secara berurutan.
    """
    from reprocess_storage_pq import run_sequential_reprocess
    background_tasks.add_task(run_sequential_reprocess, start_date_str=start_date)
    return {
        "success": True,
        "message": f"Reproses sekuensial seluruh file PQ dari Supabase Storage (mulai {start_date}) telah dijalankan di background.",
        "start_date": start_date
    }


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)

