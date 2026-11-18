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

import json
import os
import sys
import re
import uuid
import httpx
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv
from supabase import create_client, Client

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(line_buffering=True)

# Load environment variables
load_dotenv()
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

# Import fungsi parser promo dari parser.py & helper storage CDN dari build_offline_snapshot.py
sys.path.append(os.path.dirname(__file__))
from parser import parse_promo_file
from build_offline_snapshot import _storage_upload, _supabase_credentials

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


MONTH_MAP = {
    'JANUARI': 1, 'JANUARY': 1, 'JAN': 1,
    'FEBRUARI': 2, 'FEBRUARY': 2, 'FEB': 2,
    'MARET': 3, 'MARCH': 3, 'MAR': 3,
    'APRIL': 4, 'APR': 4,
    'MEI': 5, 'MAY': 5,
    'JUNI': 6, 'JUNE': 6, 'JUN': 6,
    'JULI': 7, 'JULY': 7, 'JUL': 7,
    'AGUSTUS': 8, 'AUGUST': 8, 'AGU': 8, 'AUG': 8,
    'SEPTEMBER': 9, 'SEP': 9,
    'OKTOBER': 10, 'OCTOBER': 10, 'OKT': 10, 'OCT': 10,
    'NOVEMBER': 11, 'NOV': 11,
    'DESEMBER': 12, 'DECEMBER': 12, 'DES': 12, 'DEC': 12,
}


def extract_folder_date_info(folder_name: str):
    """
    Mengekstrak (score, start_iso, end_iso) dari nama folder promo.
    Mendukung spasi/tanda hubung, lintas bulan, serta format ISO 'UPCOMING_2026-11-26'.
    """
    name_upper = folder_name.upper().strip()

    # Format eksplisit ISO (mis. UPCOMING_2026-11-26)
    iso_matches = re.findall(r'(202\d)-(\d{2})-(\d{2})', name_upper)
    if iso_matches:
        y1, m1, d1 = int(iso_matches[0][0]), int(iso_matches[0][1]), int(iso_matches[0][2])
        y2, m2, d2 = int(iso_matches[-1][0]), int(iso_matches[-1][1]), int(iso_matches[-1][2])
        score = (y2 * 1000000) + (m2 * 10000) + (d2 * 100) + d1
        return score, f"{y1:04d}-{m1:02d}-{d1:02d}", f"{y2:04d}-{m2:02d}-{d2:02d}"

    year = 2026
    year_match = re.search(r'202\d', name_upper)
    if year_match:
        year = int(year_match.group())

    found_months = []
    for m_str in sorted(MONTH_MAP.keys(), key=len, reverse=True):
        for match in re.finditer(rf'\b{re.escape(m_str)}\b', name_upper):
            found_months.append((match.start(), MONTH_MAP[m_str]))
    found_months.sort(key=lambda x: x[0])

    if len(found_months) >= 2:
        start_month = found_months[0][1]
        end_month = found_months[-1][1]
    elif len(found_months) == 1:
        start_month = end_month = found_months[0][1]
    else:
        return 0, None, None

    cleaned = re.sub(r'202\d', ' ', name_upper)
    cleaned = re.sub(r'\bW(?:EEK|K)?\s*\d+\b', ' ', cleaned)
    nums = [int(n) for n in re.findall(r'\b(\d{1,2})\b', cleaned) if 1 <= int(n) <= 31]

    if len(nums) >= 2:
        start_day, end_day = nums[0], nums[-1]
        # Bila bulan tunggal tetapi tanggal kecil-ke-besar atau lintas bulan
        if len(found_months) == 1 and end_day < start_day:
            end_month = 1 if start_month == 12 else start_month + 1
        end_year = year + 1 if (start_month == 12 and end_month == 1) else year
        score_day = end_day if len(found_months) > 1 or end_day >= start_day else start_day
    elif len(nums) == 1:
        start_day = end_day = score_day = nums[0]
        end_year = year
    else:
        return 0, None, None

    start_iso = f"{year:04d}-{start_month:02d}-{start_day:02d}"
    end_iso = f"{end_year:04d}-{end_month:02d}-{end_day:02d}"
    score = (end_year * 1000000) + (end_month * 10000) + (score_day * 100) + start_day
    return score, start_iso, end_iso


def parse_folder_date_score(folder_name: str) -> int:
    return extract_folder_date_info(folder_name)[0]


def list_promo_folders_from_storage():
    """Mengembalikan daftar folder PROMO diurutkan kronologis terbaru (paling tinggi di index 0)."""
    folders = []
    try:
        res = supabase.storage.from_("excel-uploads").list("PROMO")
        if not res:
            return []
        subfolders = [item for item in res if "." not in item.get("name", "")]
        for sf in subfolders:
            fname = sf.get("name", "")
            score, start_iso, end_iso = extract_folder_date_info(fname)
            is_upcoming_tag = any(k in fname.upper() for k in ("UPCOMING", "DRAFT", "NEXT", "POP"))
            sub_res = supabase.storage.from_("excel-uploads").list(f"PROMO/{fname}")
            files = []
            for item in (sub_res or []):
                name = item.get("name", "")
                if name.lower().endswith((".xlsx", ".csv", ".xls")):
                    path = f"PROMO/{fname}/{name}"
                    url = supabase.storage.from_("excel-uploads").get_public_url(path)
                    files.append({"name": name, "url": url})
            if files:
                folders.append({
                    "name": fname,
                    "score": score,
                    "start_date": start_iso,
                    "end_date": end_iso,
                    "is_upcoming_tag": is_upcoming_tag,
                    "files": files,
                })
        folders.sort(key=lambda x: (1 if x["is_upcoming_tag"] else 0, x["score"]), reverse=True)
    except Exception as e:
        print(f"⚠️ Gagal membaca daftar folder PROMO di Storage: {e}")
    return folders


def get_latest_promo_files_from_storage():
    """Mencari file promo dari folder terbaru bucket excel-uploads/PROMO/."""
    folders = list_promo_folders_from_storage()
    if folders:
        top = folders[0]
        print(f"📁 Menggunakan folder promo terbaru: '{top['name']}' ({top.get('start_date')} s/d {top.get('end_date')})")
        return top["files"]

    try:
        res = supabase.storage.from_("excel-uploads").list("PROMO")
        direct_files = []
        for item in (res or []):
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

        def compute_mds_sku8(sku7: str) -> str:
            if len(sku7) == 7 and sku7.isdigit():
                weights = [1, 2, 1, 2, 1, 2, 1]
                s = sum(int(sku7[idx]) * weights[idx] for idx in range(7))
                return f"{sku7}{(10 - (s % 10)) % 10}"
            return sku7

        CHUNK_SIZE = 500
        total_updated = 0
        now_iso = datetime.now(timezone.utc).isoformat()

        for i in range(0, total_rows, CHUNK_SIZE):
            chunk = parsed_data[i:i + CHUNK_SIZE]
            candidate_skus = set()
            candidate_barcodes = set()
            for x in chunk:
                s = str(x["sku"]).strip()
                if s:
                    candidate_skus.add(s)
                    if len(s) == 7 and s.isdigit():
                        candidate_skus.add(compute_mds_sku8(s))
                    if len(s) >= 12 and s.isdigit():
                        candidate_barcodes.add(s)
                bc = x.get("barcode")
                if bc:
                    candidate_barcodes.add(str(bc).strip())

            ex_map = {}
            ex_barcode_map = {}
            try:
                if candidate_skus:
                    ex_res = (
                        supabase.table("Product")
                        .select("sku, barcode, article, brand, dept, color, size, description, hargaNormal, stok, imageUrl, images, createdAt")
                        .in_("sku", list(candidate_skus))
                        .execute()
                    )
                    for row_ex in (ex_res.data or []):
                        ex_map[str(row_ex["sku"])] = row_ex
                        if row_ex.get("barcode"):
                            ex_barcode_map[str(row_ex["barcode"])] = row_ex

                if candidate_barcodes:
                    bc_res = (
                        supabase.table("Product")
                        .select("sku, barcode, article, brand, dept, color, size, description, hargaNormal, stok, imageUrl, images, createdAt")
                        .in_("barcode", list(candidate_barcodes))
                        .execute()
                    )
                    for row_bc in (bc_res.data or []):
                        ex_map[str(row_bc["sku"])] = row_bc
                        if row_bc.get("barcode"):
                            ex_barcode_map[str(row_bc["barcode"])] = row_bc
            except Exception as ex:
                print(f"⚠️ Gagal fetch existing chunk {i}: {ex}")

            payload_by_sku = {}
            for item in chunk:
                sku_str = str(item["sku"]).strip()
                ex = ex_map.get(sku_str)
                if not ex and len(sku_str) == 7 and sku_str.isdigit():
                    sku8 = compute_mds_sku8(sku_str)
                    if sku8 in ex_map:
                        ex = ex_map[sku8]
                        sku_str = sku8
                if not ex and item.get("barcode") and str(item["barcode"]) in ex_barcode_map:
                    ex = ex_barcode_map[str(item["barcode"])]
                    sku_str = str(ex["sku"])
                if not ex and len(sku_str) >= 12 and sku_str in ex_barcode_map:
                    ex = ex_barcode_map[sku_str]
                    sku_str = str(ex["sku"])

                ex = ex or {}
                item_desc = (item.get("description") or "").strip()
                if item_desc.upper().startswith("PRODUK "):
                    item_desc = ""

                ex_desc = (ex.get("description") or "").strip()
                final_desc = ex_desc or item_desc or f"Produk {sku_str}"

                item_dept = item.get("dept")
                if item_dept == "DEPARTEMEN LAINNYA":
                    item_dept = None

                p_item = {
                    "sku": sku_str,
                    "barcode": ex.get("barcode") or item.get("barcode"),
                    "article": ex.get("article") or item.get("article"),
                    "description": final_desc,
                    "brand": ex.get("brand") or item.get("brand"),
                    "dept": ex.get("dept") or item_dept or "DEPARTEMEN LAINNYA",
                    "color": ex.get("color") or item.get("color"),
                    "size": ex.get("size") or item.get("size"),
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
                payload_by_sku[sku_str] = p_item

            payload = list(payload_by_sku.values())
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


def _compute_mds_sku8(sku7: str) -> str:
    if len(sku7) == 7 and sku7.isdigit():
        weights = [1, 2, 1, 2, 1, 2, 1]
        s = sum(int(sku7[idx]) * weights[idx] for idx in range(7))
        return f"{sku7}{(10 - (s % 10)) % 10}"
    return sku7


def _load_parsed_rows_from_source(file_url: str, file_name: str = None):
    temp_path = f"temp_promo_{uuid.uuid4().hex[:8]}_{file_name or 'promo.xlsx'}"
    try:
        if file_url.startswith("http://") or file_url.startswith("https://"):
            with httpx.Client(timeout=60) as client:
                res = client.get(file_url)
                res.raise_for_status()
                with open(temp_path, "wb") as f:
                    f.write(res.content)
        else:
            temp_path = file_url
        return parse_promo_file(temp_path)
    finally:
        if os.path.exists(temp_path) and temp_path.startswith("temp_promo_"):
            try:
                os.remove(temp_path)
            except Exception:
                pass


def _lookup_existing_products(candidate_skus: set, candidate_barcodes: set):
    ex_map = {}
    ex_barcode_map = {}
    cols = "sku, barcode, article, brand, dept, color, size, description, hargaNormal, hargaPromo, diskon, discountType, acara, toDate, stok, imageUrl, images, createdAt"
    sku_list = list(candidate_skus)
    bc_list = list(candidate_barcodes)

    for i in range(0, len(sku_list), 400):
        batch = sku_list[i:i + 400]
        try:
            ex_res = supabase.table("Product").select(cols).in_("sku", batch).execute()
            for row_ex in (ex_res.data or []):
                ex_map[str(row_ex["sku"])] = row_ex
                if row_ex.get("barcode"):
                    ex_barcode_map[str(row_ex["barcode"])] = row_ex
        except Exception as exc:
            print(f"⚠️ Gagal fetch existing SKU preview batch {i}: {exc}")

    for i in range(0, len(bc_list), 400):
        batch = bc_list[i:i + 400]
        try:
            bc_res = supabase.table("Product").select(cols).in_("barcode", batch).execute()
            for row_bc in (bc_res.data or []):
                ex_map[str(row_bc["sku"])] = row_bc
                if row_bc.get("barcode"):
                    ex_barcode_map[str(row_bc["barcode"])] = row_bc
        except Exception as exc:
            print(f"⚠️ Gagal fetch existing barcode preview batch {i}: {exc}")

    return ex_map, ex_barcode_map


def build_upcoming_promo_preview(
    files_to_process: list,
    folder_name: str,
    start_date: str = None,
    end_date: str = None,
):
    """
    MODE PERSIAPAN POP (H-2 / H-1 — 100% READ-ONLY TERHADAP DB KASIR):
    Mem-parsing seluruh file promo mendatang dan membandingkannya dengan promo berjalan,
    lalu mengunggah JSON siap tampil ke `analytics/upcoming-promo.json` di Supabase CDN.
    """
    print("=" * 60)
    print(f"🏷️ [PERSIAPAN POP H-2/H-1] Menyusun pratinjau promo '{folder_name}' tanpa mengubah DB berjalan...")
    print("=" * 60)

    all_parsed = []
    source_names = []
    for f in files_to_process:
        fname = f.get("name") or os.path.basename(f.get("url", ""))
        source_names.append(fname)
        try:
            rows = _load_parsed_rows_from_source(f["url"], fname)
            for r in rows:
                r["_source_file"] = fname
            all_parsed.extend(rows)
            print(f"  📄 {fname}: {len(rows):,} baris promo terbaca.")
        except Exception as e:
            print(f"  ⚠️ Gagal parsing {fname}: {e}")

    if not all_parsed:
        print("ℹ️ Tidak ada baris promo pada folder draft ini.")
        return 0

    cand_skus, cand_bcs = set(), set()
    for x in all_parsed:
        s = str(x.get("sku") or "").strip()
        if s:
            cand_skus.add(s)
            if len(s) == 7 and s.isdigit():
                cand_skus.add(_compute_mds_sku8(s))
            if len(s) >= 12 and s.isdigit():
                cand_bcs.add(s)
        if x.get("barcode"):
            cand_bcs.add(str(x["barcode"]).strip())

    ex_map, ex_barcode_map = _lookup_existing_products(cand_skus, cand_bcs)
    today_wib = datetime.now(timezone(timedelta(hours=7))).strftime("%Y-%m-%d")

    variant_by_sku = {}
    min_from_date = start_date
    max_to_date = end_date

    for item in all_parsed:
        sku_str = str(item.get("sku") or "").strip()
        ex = ex_map.get(sku_str)
        if not ex and len(sku_str) == 7 and sku_str.isdigit():
            sku8 = _compute_mds_sku8(sku_str)
            if sku8 in ex_map:
                ex = ex_map[sku8]
                sku_str = sku8
        if not ex and item.get("barcode") and str(item["barcode"]) in ex_barcode_map:
            ex = ex_barcode_map[str(item["barcode"])]
            sku_str = str(ex["sku"])
        if not ex and len(sku_str) >= 12 and sku_str in ex_barcode_map:
            ex = ex_barcode_map[sku_str]
            sku_str = str(ex["sku"])

        ex = ex or {}
        next_promo = item.get("harga_promo") if item.get("is_promo") else None
        next_diskon = item.get("diskon") or (f"SP {next_promo}" if next_promo else None)
        if not next_promo and not next_diskon and not item.get("tipe_diskon"):
            continue

        cur_to = (ex.get("toDate") or "").strip()[:10]
        cur_active = bool(
            (ex.get("hargaPromo") or ex.get("diskon"))
            and (not cur_to or cur_to >= today_wib)
        )
        cur_promo = ex.get("hargaPromo") if cur_active else None
        cur_diskon = ex.get("diskon") if cur_active else None

        if not cur_active:
            status_change = "NEW_PROMO"
        elif (next_promo and cur_promo and abs(float(next_promo) - float(cur_promo)) > 0.5) or (
            next_diskon and cur_diskon and str(next_diskon).strip().upper() != str(cur_diskon).strip().upper()
        ):
            status_change = "PRICE_CHANGE"
        else:
            status_change = "CONTINUED"

        f_dt = item.get("tgl_mulai") or start_date
        t_dt = item.get("tgl_akhir") or end_date
        if f_dt and (not min_from_date or str(f_dt)[:10] < str(min_from_date)):
            min_from_date = str(f_dt)[:10]
        if t_dt and (not max_to_date or str(t_dt)[:10] > str(max_to_date)):
            max_to_date = str(t_dt)[:10]

        desc = (ex.get("description") or item.get("description") or f"Produk {sku_str}").strip()
        art = (ex.get("article") or item.get("article") or desc.split(":")[0].strip() or sku_str).strip()
        variant_by_sku[sku_str] = {
            "sku": sku_str,
            "barcode": ex.get("barcode") or item.get("barcode"),
            "article": art,
            "description": desc,
            "brand": ex.get("brand") or item.get("brand") or "SUKO",
            "dept": ex.get("dept") or item.get("dept") or "DEPARTEMEN LAINNYA",
            "color": ex.get("color") or item.get("color") or "",
            "size": ex.get("size") or item.get("size") or "",
            "stok": int(ex.get("stok") or 0),
            "imageUrl": ex.get("imageUrl"),
            "hargaNormal": float(item.get("harga_normal") or ex.get("hargaNormal") or 0),
            "currentPromo": float(cur_promo) if cur_promo is not None else None,
            "currentDiskon": cur_diskon,
            "nextHargaPromo": float(next_promo) if next_promo is not None else None,
            "nextDiskon": next_diskon,
            "nextDiscountType": item.get("tipe_diskon"),
            "nextAcara": item.get("acara") or item.get("sumber_sheet"),
            "nextFromDate": f_dt,
            "nextToDate": t_dt,
            "sourceFile": item.get("_source_file"),
            "statusChange": status_change,
        }

    # Kelompokkan per Parent Artikel agar crew mudah cek & cetak POP
    article_groups = {}
    for v in variant_by_sku.values():
        key = v["article"]
        grp = article_groups.get(key)
        if not grp:
            grp = {
                "article": key,
                "description": v["description"].split(":")[0].strip(),
                "brand": v["brand"],
                "dept": v["dept"],
                "imageUrl": v["imageUrl"],
                "totalStok": 0,
                "variantCount": 0,
                "hargaNormal": v["hargaNormal"],
                "currentPromo": v["currentPromo"],
                "currentDiskon": v["currentDiskon"],
                "nextHargaPromo": v["nextHargaPromo"],
                "nextDiskon": v["nextDiskon"],
                "nextDiscountType": v["nextDiscountType"],
                "nextAcara": v["nextAcara"],
                "nextFromDate": v["nextFromDate"],
                "nextToDate": v["nextToDate"],
                "sourceFile": v["sourceFile"],
                "statusChange": v["statusChange"],
                "variants": [],
            }
            article_groups[key] = grp
        grp["totalStok"] += v["stok"]
        grp["variantCount"] += 1
        if not grp["imageUrl"] and v["imageUrl"]:
            grp["imageUrl"] = v["imageUrl"]
        if v["statusChange"] == "NEW_PROMO" and grp["statusChange"] == "CONTINUED":
            grp["statusChange"] = "NEW_PROMO"
        elif v["statusChange"] == "PRICE_CHANGE":
            grp["statusChange"] = "PRICE_CHANGE"
        grp["variants"].append(v)

    priority_rank = {"NEW_PROMO": 0, "PRICE_CHANGE": 1, "CONTINUED": 2}
    articles = list(article_groups.values())
    articles.sort(
        key=lambda a: (
            0 if a["totalStok"] > 0 else 1,
            priority_rank.get(a["statusChange"], 9),
            -a["totalStok"],
            a["description"],
        )
    )

    summary = {
        "newPromo": sum(1 for a in articles if a["statusChange"] == "NEW_PROMO"),
        "priceChange": sum(1 for a in articles if a["statusChange"] == "PRICE_CHANGE"),
        "continued": sum(1 for a in articles if a["statusChange"] == "CONTINUED"),
        "withStock": sum(1 for a in articles if a["totalStok"] > 0),
    }

    payload = {
        "success": True,
        "mode": "UPCOMING_POP_DRAFT",
        "folderName": folder_name,
        "fromDate": min_from_date,
        "toDate": max_to_date,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sourceFiles": source_names,
        "totalSkus": len(variant_by_sku),
        "totalArticles": len(articles),
        "summary": summary,
        "articles": articles,
    }

    raw_bytes = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    supa_url, supa_key = _supabase_credentials()
    _storage_upload(supa_url, supa_key, "analytics/upcoming-promo.json", raw_bytes, "application/json", "120")
    print(f"✅ Draf POP tersimpan aman di CDN `analytics/upcoming-promo.json` ({len(raw_bytes)/1024:.1f} KB, {len(articles):,} Artikel, {len(variant_by_sku):,} SKU). Promo berjalan 100% aman!")
    return len(articles)


def run_promo_sync(
    target_file_or_url: str = None,
    explicit_name: str = None,
    upcoming_only: bool = False,
    force_apply: bool = False,
):
    print("=" * 60)
    print("🚀 [PYTHON ENGINE] Memulai Sinkronisasi File Promo")
    print("=" * 60)

    today_wib = datetime.now(timezone(timedelta(hours=7))).strftime("%Y-%m-%d")

    if target_file_or_url:
        fname = explicit_name or os.path.basename(target_file_or_url)
        if upcoming_only:
            build_upcoming_promo_preview([{"name": fname, "url": target_file_or_url}], fname)
            return
        total = process_single_promo_file(target_file_or_url, explicit_name)
        if total > 0:
            log_sync_history(fname, total)
        else:
            print("ℹ️ Tidak ada baris promo yang diperbarui — lewati pencatatan SyncHistory.")
        return

    print("🔍 Mencari folder promo di Supabase Storage (PROMO/)...")
    folders = list_promo_folders_from_storage()

    if not folders:
        files_fallback = get_latest_promo_files_from_storage()
        if not files_fallback:
            print("ℹ️ Tidak ada file promo yang ditemukan di Storage.")
            return
        if upcoming_only:
            build_upcoming_promo_preview(files_fallback, "PROMO Draft")
            return
        grand_total = sum(process_single_promo_file(f["url"], f["name"]) for f in files_fallback)
        if grand_total > 0:
            log_sync_history(f"Batch Promo ({len(files_fallback)} file)", grand_total)
        return

    # MODE PERSIAPAN POP KHUSUS (--upcoming)
    if upcoming_only:
        top = folders[0]
        build_upcoming_promo_preview(top["files"], top["name"], top.get("start_date"), top.get("end_date"))
        return

    # AUTO-GUARD H-2 / H-1: Jika folder paling baru bertanggal masa depan (> today_wib) atau bertag DRAFT/UPCOMING,
    # simpan otomatis ke draft POP (`upcoming-promo.json`) dan JANGAN timpa promo kasir hari ini kecuali `--force-apply`!
    active_folder = None
    for fld in folders:
        is_future = bool(fld.get("start_date") and fld["start_date"] > today_wib)
        if (fld["is_upcoming_tag"] or is_future) and not force_apply:
            print(f"🛡️ Auto-Guard H-2/H-1: Folder '{fld['name']}' belum mulai ({fld.get('start_date')} > {today_wib}). Dialihkan ke Persiapan POP agar promo hari ini tidak rusak!")
            build_upcoming_promo_preview(fld["files"], fld["name"], fld.get("start_date"), fld.get("end_date"))
            continue
        active_folder = fld
        break

    if not active_folder:
        print("ℹ️ Tidak ada folder promo aktif hari ini untuk ditimpa ke Product DB.")
        return

    files_to_process = active_folder["files"]
    print(f"📦 Memproses folder aktif '{active_folder['name']}' ({len(files_to_process)} file)...")
    grand_total = 0
    for f in files_to_process:
        grand_total += process_single_promo_file(f["url"], f["name"])

    print("=" * 60)
    print(f"🎉 [SUKSES BATCH] Total {grand_total} produk berhasil diperbarui dari {len(files_to_process)} file!")
    print("=" * 60)

    # Bersihkan promo lama di PostgreSQL yang toDate-nya sudah lewat dari hari ini WIB
    try:
        cleanup_res = (
            supabase.table("Product")
            .update({
                "hargaPromo": None,
                "diskon": None,
                "discountType": None,
                "acara": None,
                "fromDate": None,
                "toDate": None,
            })
            .lt("toDate", today_wib)
            .not_.is_("hargaPromo", "null")
            .execute()
        )
        cleaned_cnt = len(cleanup_res.data) if cleanup_res and getattr(cleanup_res, "data", None) else 0
        if cleaned_cnt > 0:
            print(f"🧹 Membersihkan {cleaned_cnt} produk promo kedaluwarsa (< {today_wib}).")
    except Exception as cln_err:
        print(f"⚠️ Lewati pembersihan promo kedaluwarsa: {cln_err}")

    if grand_total > 0:
        log_sync_history(f"Batch Promo ({len(files_to_process)} file)", grand_total)
    else:
        print("ℹ️ 0 produk promo berubah — lewati pencatatan SyncHistory.")


if __name__ == "__main__":
    file_arg = None
    name_arg = None
    upcoming_flag = False
    force_flag = False

    for arg in sys.argv[1:]:
        if arg.startswith("--file="):
            file_arg = arg.split("=", 1)[1]
        elif arg.startswith("--name="):
            name_arg = arg.split("=", 1)[1]
        elif arg == "--upcoming":
            upcoming_flag = True
        elif arg == "--force-apply":
            force_flag = True

    run_promo_sync(file_arg, name_arg, upcoming_only=upcoming_flag, force_apply=force_flag)
