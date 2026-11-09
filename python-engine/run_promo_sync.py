"""
run_promo_sync.py
============================================================
Mesin CLI Python untuk Memproses File Promo Ritel (Excel/CSV)
Langsung ke Database Supabase.
Bekerja di GitHub Actions Runner & Local Environment.

Fitur:
1. Memindai seluruh file promo di folder terbaru Supabase Storage (folder PROMO/)
   atau menerima parameter --file=<path_atau_url>.
2. Parsing promo via parser.py (pandas, regex, openpyxl).
3. Update hargaPromo, diskon, discountType, acara, tanggal promo.
4. PROTEKSI TOTAL: Tidak akan menimpa stok fisik atau barcode MDS BISA.
5. Catat log ke tabel SyncHistory.
============================================================
"""

import os
import sys
import re
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


def parse_folder_date_score(folder_name: str) -> int:
    """Mengekstrak skor tanggal dari nama folder promo agar urutan kronologis tepat."""
    name_upper = folder_name.upper()
    month_map = {
        'JAN': 1, 'FEB': 2, 'MAR': 3, 'APR': 4, 'MEI': 5, 'MAY': 5,
        'JUN': 6, 'JUL': 7, 'AGU': 8, 'AUG': 8, 'SEP': 9, 'OKT': 10,
        'OCT': 10, 'NOV': 11, 'DES': 12, 'DEC': 12
    }
    
    year = 2026
    year_match = re.search(r'202\d', name_upper)
    if year_match:
        year = int(year_match.group())

    month = 1
    for m_str, m_num in month_map.items():
        if m_str in name_upper:
            month = m_num
            break

    day = 1
    day_match = re.search(r'(\d{1,2})\s*[-_]\s*(\d{1,2})?', name_upper)
    if day_match:
        day = int(day_match.group(1))

    return year * 10000 + month * 100 + day


def get_latest_promo_files_from_storage():
    """Mencari semua file promo di folder terbaru bucket excel-uploads/PROMO/."""
    try:
        res = supabase.storage.from_("excel-uploads").list("PROMO")
        if not res:
            return []
        
        # 1. Cari subfolder promo (contoh: 'PROMO 5 - 11 NOV 2026', dll)
        subfolders = [item for item in res if "." not in item.get("name", "")]
        if subfolders:
            subfolders.sort(key=lambda x: parse_folder_date_score(x.get("name", "")), reverse=True)
            latest_folder = subfolders[0]["name"]
            print(f"📁 Menggunakan folder promo terbaru: '{latest_folder}'")
            
            sub_res = supabase.storage.from_("excel-uploads").list(f"PROMO/{latest_folder}")
            files = []
            for item in (sub_res or []):
                name = item.get("name", "")
                if name.lower().endswith((".xlsx", ".csv", ".xls")):
                    path = f"PROMO/{latest_folder}/{name}"
                    url = supabase.storage.from_("excel-uploads").get_public_url(path)
                    files.append({"name": name, "url": url})
            if files:
                return files
        
        # 2. Fallback jika file langsung di root PROMO/
        direct_files = []
        for item in res:
            name = item.get("name", "")
            if name.lower().endswith((".xlsx", ".csv", ".xls")):
                path = f"PROMO/{name}"
                url = supabase.storage.from_("excel-uploads").get_public_url(path)
                direct_files.append({"name": name, "url": url})
        return direct_files
    except Exception as e:
        print(f"⚠️ Gagal mencari file promo di Storage: {e}")
        return []


def log_sync_history(file_name: str, total_records: int, file_url: str = None):
    try:
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
                "fileName": file_name,
                "fileUrl": file_url,
                "status": "SUCCESS",
                "records": total_records
            }).execute()
            print("📝 Log sinkronisasi tersimpan di SyncHistory.")
    except Exception as log_err:
        print(f"⚠️ Gagal mencatat SyncHistory: {log_err}")


def process_single_promo_file(file_url: str, file_name: str = None) -> int:
    print(f"\n📄 Memproses file: {file_name}")
    print(f"🔗 Sumber URL: {file_url}")

    temp_path = f"temp_promo_{uuid.uuid4().hex[:8]}_{file_name or 'promo.xlsx'}"

    try:
        if file_url.startswith("http://") or file_url.startswith("https://"):
            print("⬇️  Mengunduh file dari cloud storage...")
            with httpx.Client(timeout=60) as client:
                res = client.get(file_url)
                res.raise_for_status()
                with open(temp_path, "wb") as f:
                    f.write(res.content)
        else:
            temp_path = file_url

        print("⚙️  Menjalankan parser.py (ekstraksi kolom & diskon)...")
        parsed_data = parse_promo_file(temp_path)
        total_rows = len(parsed_data)
        print(f"✅ Berhasil mengekstrak {total_rows} baris data promo.")

        if total_rows == 0:
            return 0

        CHUNK_SIZE = 500
        total_updated = 0
        now_iso = datetime.now(timezone.utc).isoformat()

        for i in range(0, total_rows, CHUNK_SIZE):
            chunk = parsed_data[i:i + CHUNK_SIZE]
            chunk_skus = [str(x["sku"]) for x in chunk]

            try:
                ex_res = (
                    supabase.table("Product")
                    .select("sku, barcode, article, brand, dept, color, size, description, hargaNormal, stok, imageUrl, images, createdAt")
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

                p_item = {
                    "sku": item["sku"],
                    "barcode": ex.get("barcode") or item.get("barcode"),
                    "article": ex.get("article") or item.get("article"),
                    "description": item.get("description") or ex.get("description") or "",
                    "brand": item.get("brand") or ex.get("brand"),
                    "dept": item.get("dept") or ex.get("dept"),
                    "color": item.get("color") or ex.get("color"),
                    "size": item.get("size") or ex.get("size"),
                    "imageUrl": ex.get("imageUrl"),
                    "images": ex.get("images") or [],
                    "hargaNormal": item.get("harga_normal") or ex.get("hargaNormal") or 0,
                    "hargaNormalSource": "PROMO",
                    "hargaPromo": item.get("harga_promo") if item.get("is_promo") else None,
                    "diskon": item.get("diskon") or (f"SP {item.get('harga_promo')}" if item.get("is_promo") else None),
                    "discountType": item.get("tipe_diskon"),
                    "acara": item.get("acara") or item.get("sumber_sheet"),
                    "fromDate": item.get("tgl_mulai"),
                    "toDate": item.get("tgl_akhir"),
                    "promoFileName": file_name or os.path.basename(file_url),
                    "stok": ex.get("stok", 0),
                    "updatedAt": now_iso,
                    "createdAt": ex.get("createdAt") or now_iso,
                }
                payload.append(p_item)

            try:
                up_res = supabase.table("Product").upsert(payload, on_conflict="sku").execute()
                total_updated += len(payload)
                print(f"  [Chunk {i // CHUNK_SIZE + 1}] Berhasil memperbarui {len(payload)} produk promo.")
            except Exception as up_err:
                print(f"❌ Error saat upsert chunk {i}: {up_err}")

        return total_updated
    except Exception as e:
        print(f"❌ Gagal memproses file {file_name}: {e}")
        return 0
    finally:
        if os.path.exists(temp_path) and temp_path.startswith("temp_promo_"):
            try:
                os.remove(temp_path)
            except Exception:
                pass


def run_promo_sync(target_file_or_url: str = None, explicit_name: str = None):
    print("=" * 60)
    print("🚀 [PYTHON ENGINE] Memulai Sinkronisasi File Promo")
    print("=" * 60)

    if target_file_or_url:
        total = process_single_promo_file(target_file_or_url, explicit_name)
        log_sync_history(explicit_name or target_file_or_url, total)
        return

    print("🔍 Mencari file promo terbaru di Supabase Storage (PROMO/)...")
    files_to_process = get_latest_promo_files_from_storage()

    if not files_to_process:
        print("ℹ️ Tidak ada file promo baru yang ditemukan di Storage.")
        return

    print(f"📦 Ditemukan {len(files_to_process)} file promo dalam batch terbaru.")
    grand_total = 0
    for f in files_to_process:
        grand_total += process_single_promo_file(f["url"], f["name"])

    print("=" * 60)
    print(f"🎉 [SUKSES BATCH] Total {grand_total} produk berhasil diperbarui dari {len(files_to_process)} file!")
    print("=" * 60)
    log_sync_history(f"Batch Promo ({len(files_to_process)} file)", grand_total)


if __name__ == "__main__":
    file_arg = None
    name_arg = None

    for arg in sys.argv[1:]:
        if arg.startswith("--file="):
            file_arg = arg.split("=", 1)[1]
        elif arg.startswith("--name="):
            name_arg = arg.split("=", 1)[1]

    run_promo_sync(file_arg, name_arg)
