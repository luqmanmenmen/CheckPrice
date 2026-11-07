"""
run_promo_sync.py
============================================================
Mesin CLI Python untuk Memproses File Promo Ritel (Excel/CSV)
Langsung ke Database Supabase.
Bekerja di GitHub Actions Runner & Local Environment.

Fitur:
1. Download file promo terbaru dari Supabase Storage (folder PROMO/)
   atau menerima parameter --file=<path_atau_url>.
2. Parsing promo via parser.py (pandas, regex, Gemini AI advice).
3. Update hargaPromo, diskon, discountType, acara, tanggal promo.
4. PROTEKSI TOTAL: Tidak akan menimpa stok fisik atau barcode MDS BISA.
5. Catat log ke tabel SyncHistory.
============================================================
"""

import os
import sys
import uuid
import httpx
from datetime import datetime, timezone
from dotenv import load_dotenv
from supabase import create_client, Client

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(line_buffering=True)

# Load environment variables
load_dotenv()
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

# Import fungsi parser promo dari parser.py
sys.path.append(os.path.dirname(__file__))
from parser import parse_promo_file

SUPABASE_URL = (
    os.getenv("SUPABASE_URL")
    or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    or "https://lzynugpistiyhxqkgwmk.supabase.co"
)
SUPABASE_KEY = (
    os.getenv("SUPABASE_KEY")
    or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    or os.getenv("SUPABASE_ANON_KEY", "")
)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


def get_latest_promo_file_from_storage():
    """Mencari file promo terbaru di bucket excel-uploads/PROMO/."""
    try:
        res = supabase.storage.from_("excel-uploads").list("PROMO")
        if not res:
            return None, None
        
        # Cari file di subfolder atau langsung di PROMO/
        valid_files = []
        for item in res:
            name = item.get("name", "")
            if name.lower().endswith((".xlsx", ".csv", ".xls")):
                valid_files.append({
                    "name": name,
                    "path": f"PROMO/{name}",
                    "updated_at": item.get("updated_at") or item.get("created_at") or ""
                })
            elif not "." in name:
                # Ini subfolder (misal PROMO/Subject Email/)
                sub_res = supabase.storage.from_("excel-uploads").list(f"PROMO/{name}")
                for sub_item in sub_res:
                    sub_name = sub_item.get("name", "")
                    if sub_name.lower().endswith((".xlsx", ".csv", ".xls")):
                        valid_files.append({
                            "name": sub_name,
                            "path": f"PROMO/{name}/{sub_name}",
                            "updated_at": sub_item.get("updated_at") or sub_item.get("created_at") or ""
                        })
        
        if not valid_files:
            return None, None
            
        # Urutkan berdasarkan tanggal terbaru
        valid_files.sort(key=lambda x: x["updated_at"], reverse=True)
        latest = valid_files[0]
        
        public_url = supabase.storage.from_("excel-uploads").get_public_url(latest["path"])
        return public_url, latest["name"]
    except Exception as e:
        print(f"⚠️ Gagal mencari file promo di Storage: {e}")
        return None, None


def run_promo_sync(target_file_or_url: str = None, explicit_name: str = None):
    print("=" * 60)
    print("🚀 [PYTHON ENGINE] Memulai Sinkronisasi File Promo")
    print("=" * 60)

    file_url = target_file_or_url
    file_name = explicit_name

    # Jika tidak ada file spesifik dari argumen, ambil yang terbaru dari Storage
    if not file_url:
        print("🔍 Mencari file promo terbaru di Supabase Storage (PROMO/)...")
        file_url, file_name = get_latest_promo_file_from_storage()

    if not file_url:
        print("ℹ️ Tidak ada file promo baru yang ditemukan di Storage.")
        print("   Silakan kirim file via email atau tentukan --file=<path_atau_url>.")
        return

    print(f"📄 Memproses file: {file_name}")
    print(f"🔗 Sumber URL: {file_url}")

    temp_path = f"temp_promo_{uuid.uuid4().hex[:8]}_{file_name or 'promo.xlsx'}"

    try:
        # 1. Download file jika berupa URL, atau copy jika lokal
        if file_url.startswith("http://") or file_url.startswith("https://"):
            print("⬇️  Mengunduh file dari cloud storage...")
            with httpx.Client(timeout=60) as client:
                res = client.get(file_url)
                res.raise_for_status()
                with open(temp_path, "wb") as f:
                    f.write(res.content)
        else:
            temp_path = file_url

        # 2. Parsing file promo menggunakan parser.py
        print("⚙️  Menjalankan parser.py (ekstraksi kolom & diskon)...")
        parsed_data = parse_promo_file(temp_path)
        total_rows = len(parsed_data)
        print(f"✅ Berhasil mengekstrak {total_rows} baris data promo.")

        if total_rows == 0:
            print("⚠️ Tidak ada data promo yang valid di dalam file.")
            return

        # 3. Smart Batch Upsert ke Supabase
        CHUNK_SIZE = 500
        total_updated = 0

        for i in range(0, total_rows, CHUNK_SIZE):
            chunk = parsed_data[i:i + CHUNK_SIZE]
            chunk_skus = [str(x["sku"]) for x in chunk]

            # Ambil data existing untuk memproteksi stok & barcode dari MDS BISA
            try:
                ex_res = (
                    supabase.table("Product")
                    .select("sku, barcode, article, brand, dept, color, size, description, hargaNormal, stok")
                    .in_("sku", chunk_skus)
                    .execute()
                )
                ex_map = {str(item["sku"]): item for item in (ex_res.data or [])}
            except Exception as ex:
                print(f"⚠️ Gagal fetch existing chunk {i}: {ex}")
                ex_map = {}

            payload = []
            for item in chunk:
                sku_str = str(item["sku"])
                ex = ex_map.get(sku_str, {})

                # HANYA UPDATE DATA PROMO — PRESERVASI DATA MDS BISA (STOK & BARCODE)
                p_item = {
                    "sku": item["sku"],
                    # Pertahankan barcode fisik & style code dari MDS BISA jika sudah ada
                    "barcode": ex.get("barcode") or item.get("barcode"),
                    "article": ex.get("article") or item.get("article"),
                    "brand": ex.get("brand") or item.get("brand", "SUKO"),
                    "dept": ex.get("dept") or item.get("dept"),
                    "color": ex.get("color") or item.get("color"),
                    "size": ex.get("size") or item.get("size"),
                    "description": ex.get("description") or item.get("description", f"Produk {item['sku']}"),

                    # Update Harga Normal dari PROMO jika belum ada
                    "hargaNormal": item.get("harga_normal", 0) if item.get("harga_normal", 0) != 0 else ex.get("hargaNormal", 0),
                    "hargaNormalSource": "PROMO",

                    # Kolom Promo Utama
                    "hargaPromo": item.get("harga_promo") if item.get("is_promo") else None,
                    "discountType": item.get("tipe_diskon") if item.get("is_promo") else None,
                    "diskon": item.get("diskon") if item.get("is_promo") else None,
                    "acara": item.get("acara"),
                    "fromDate": item.get("tgl_mulai"),
                    "toDate": item.get("tgl_akhir"),
                    "promoFileName": file_name,

                    # 🛡️ PROTEKSI STOK: JANGAN UBAH STOK DARI MDS BISA!
                    "stok": ex.get("stok", 0),

                    "updatedAt": datetime.now(timezone.utc).isoformat(),
                }
                payload.append(p_item)

            try:
                supabase.table("Product").upsert(payload, on_conflict="sku").execute()
                total_updated += len(payload)
                print(f"  [Chunk {i // CHUNK_SIZE + 1}] Berhasil memperbarui {len(payload)} produk promo.")
            except Exception as upsert_err:
                print(f"❌ Error saat upsert chunk {i}: {upsert_err}")

        print("=" * 60)
        print(f"🎉 [SUKSES] Total {total_updated} produk berhasil diperbarui harga promonya!")
        print("=" * 60)

        # 4. Catat Log ke SyncHistory
        try:
            # Ambil supervisor user id
            user_res = supabase.table("User").select("id").eq("nik", "22054178").limit(1).execute()
            user_id = user_res.data[0]["id"] if user_res.data else None
            if not user_id:
                u_fallback = supabase.table("User").select("id").limit(1).execute()
                user_id = u_fallback.data[0]["id"] if u_fallback.data else None

            if user_id:
                sync_id = f"sync_{uuid.uuid4().hex[:20]}"
                supabase.table("SyncHistory").insert({
                    "id": sync_id,
                    "userId": user_id,
                    "type": "UPDATE_PROMO",
                    "fileName": file_name or "PromoFile",
                    "fileUrl": file_url,
                    "status": "SUCCESS",
                    "records": total_updated
                }).execute()
                print("📝 Log sinkronisasi tersimpan di SyncHistory.")
        except Exception as log_err:
            print(f"⚠️ Gagal mencatat SyncHistory: {log_err}")

    except Exception as e:
        print(f"💥 FATAL ERROR sinkronisasi promo: {e}")
        sys.exit(1)
    finally:
        if os.path.exists(temp_path) and temp_path.startswith("temp_promo_"):
            try:
                os.remove(temp_path)
            except Exception:
                pass


if __name__ == "__main__":
    file_arg = None
    name_arg = None

    for arg in sys.argv[1:]:
        if arg.startswith("--file="):
            file_arg = arg.split("=", 1)[1]
        elif arg.startswith("--name="):
            name_arg = arg.split("=", 1)[1]

    run_promo_sync(file_arg, name_arg)
