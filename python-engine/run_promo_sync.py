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
from urllib.parse import quote, unquote, urlsplit, urlunsplit
import httpx
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(line_buffering=True)

# Load environment variables
load_dotenv()
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

# Import fungsi parser promo dari parser.py & Turso Cloud DB/Storage (0% Supabase)
sys.path.append(os.path.dirname(__file__))
from parser import parse_promo_file
from build_offline_snapshot import _storage_upload, _supabase_credentials
from turso_db import (
    get_turso_table_client,
    storage_download,
    storage_list,
    storage_upload,
)

db = get_turso_table_client(timeout=60)


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


def _safe_encode_url(url: str) -> str:
    """Meng-encode aman spasi & karakter khusus di path URL Storage tanpa mendouble-encode."""
    if not url or not url.startswith(("http://", "https://")):
        return url
    parts = urlsplit(url)
    clean_path = quote(unquote(parts.path), safe="/:@!$&'()*+,;=-._~")
    return urlunsplit((parts.scheme, parts.netloc, clean_path, parts.query, parts.fragment))


def _sanitize_temp_filename(name: str, fallback: str = "promo.xlsx") -> str:
    base = os.path.basename(unquote(name or fallback))
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", base).strip("_")
    return cleaned or fallback


def _normalize_iso_date(val) -> str | None:
    if not val:
        return None
    s = str(val).strip()
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", s)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    m2 = re.match(r"^(\d{1,2})[/-](\d{1,2})[/-](\d{4})", s)
    if m2:
        p1, p2, yr = int(m2.group(1)), int(m2.group(2)), int(m2.group(3))
        if p2 > 12:
            month, day = p1, p2
        else:
            day, month = p1, p2
        if 1 <= month <= 12 and 1 <= day <= 31:
            return f"{yr:04d}-{month:02d}-{day:02d}"
    return None


def extract_folder_date_info(folder_name: str):
    """
    Mengekstrak (score, start_iso, end_iso) dari Subject email, nama folder, atau nama file promo.
    Mendukung format spasi ('PROMO 19 25 NOV 2026'), kompak tanpa spasi ('05-11NOV2026', '26NOV-02DES2026'),
    lintas bulan/tahun, serta format ISO ('UPCOMING_2026-11-26').
    """
    raw = unquote(folder_name or "").upper().strip()
    if not raw:
        return 0, None, None

    # Hapus ekstensi file jika input berasal dari nama berkas Excel/CSV
    raw = re.sub(r"\.(XLSX|XLS|CSV)$", "", raw).strip()

    # Format eksplisit ISO (mis. UPCOMING_2026-11-26 atau MANUAL_2026-11-19)
    iso_matches = re.findall(r"(202\d)-(\d{2})-(\d{2})", raw)
    if iso_matches:
        y1, m1, d1 = int(iso_matches[0][0]), int(iso_matches[0][1]), int(iso_matches[0][2])
        y2, m2, d2 = int(iso_matches[-1][0]), int(iso_matches[-1][1]), int(iso_matches[-1][2])
        score = (y2 * 1000000) + (m2 * 10000) + (d2 * 100) + d1
        return score, f"{y1:04d}-{m1:02d}-{d1:02d}", f"{y2:04d}-{m2:02d}-{d2:02d}"

    years = [int(y) for y in re.findall(r"202\d", raw)]
    start_year = years[0] if years else 2026
    end_year = years[-1] if years else 2026

    # Hapus nomor urut di awal nama file (mis. '18. PROMO ...'), penanda week ('WEEK45', 'W47'), & tahun 202x
    cleaned = re.sub(r"^\s*\d{1,3}[\.\)]\s*", " ", raw)
    cleaned = re.sub(r"\bW(?:EEK|K)?\s*\d+\b", " ", cleaned)
    cleaned = re.sub(r"202\d", " ", cleaned)
    cleaned = re.sub(r"[-_/,()\[\]]+", " ", cleaned)
    # Pisahkan angka & huruf agar '05-11NOV2026' -> '05 11 NOV' dan '26NOV-02DES' -> '26 NOV 02 DES'
    cleaned = re.sub(r"(\d)([A-Z])", r"\1 \2", cleaned)
    cleaned = re.sub(r"([A-Z])(\d)", r"\1 \2", cleaned)
    cleaned = re.sub(r"\b(?:S\.?D\.?|SAMPAI|HINGGA|TO)\b", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()

    found_months = []
    occupied_spans = []
    for m_str in sorted(MONTH_MAP.keys(), key=len, reverse=True):
        for match in re.finditer(rf"\b{re.escape(m_str)}\b", cleaned):
            s_idx, e_idx = match.start(), match.end()
            if any(not (e_idx <= os_idx or s_idx >= oe_idx) for os_idx, oe_idx in occupied_spans):
                continue
            occupied_spans.append((s_idx, e_idx))
            found_months.append((s_idx, e_idx, MONTH_MAP[m_str]))
    found_months.sort(key=lambda x: x[0])

    if not found_months:
        return 0, None, None

    def _valid_pair(n1_str, n2_str=None):
        vals = []
        for tok in (n1_str, n2_str):
            if tok and tok.isdigit():
                v = int(tok)
                if 1 <= v <= 31:
                    vals.append(v)
        return vals

    if len(found_months) >= 2:
        ms0, me0, start_month = found_months[0]
        msk, mek, end_month = found_months[-1]

        pre0 = re.search(r"(?:^|\s)(\d{1,2})(?:\s+(\d{1,2}))?\s*$", cleaned[:ms0])
        post0 = re.match(r"^\s*(\d{1,2})\b", cleaned[me0:msk])
        nums0 = _valid_pair(*(pre0.groups() if pre0 else ()))
        if nums0:
            start_day = nums0[0]
        elif post0 and 1 <= int(post0.group(1)) <= 31:
            start_day = int(post0.group(1))
        else:
            return 0, None, None

        pre_last = re.search(r"(?:^|\s)(\d{1,2})(?:\s+(\d{1,2}))?\s*$", cleaned[me0:msk])
        post_last = re.match(r"^\s*(\d{1,2})\b", cleaned[mek:])
        nums_last = _valid_pair(*(pre_last.groups() if pre_last else ()))
        if nums_last:
            end_day = nums_last[-1]
        elif post_last and 1 <= int(post_last.group(1)) <= 31:
            end_day = int(post_last.group(1))
        else:
            return 0, None, None

        if len(years) <= 1 and start_month == 12 and end_month == 1:
            end_year = start_year + 1
        score_day = end_day
    else:
        ms0, me0, start_month = found_months[0]
        end_month = start_month
        pre = re.search(r"(?:^|\s)(\d{1,2})(?:\s+(\d{1,2}))?\s*$", cleaned[:ms0])
        post = re.match(r"^\s*(\d{1,2})(?:\s+(\d{1,2}))?\b", cleaned[me0:])
        nums = _valid_pair(*(pre.groups() if pre else ()))
        if not nums:
            nums = _valid_pair(*(post.groups() if post else ()))
        if len(nums) >= 2:
            start_day, end_day = nums[0], nums[-1]
            if end_day < start_day:
                end_month = 1 if start_month == 12 else start_month + 1
                if start_month == 12 and end_month == 1 and len(years) <= 1:
                    end_year = start_year + 1
            score_day = end_day if end_day >= start_day else start_day
        elif len(nums) == 1:
            start_day = end_day = score_day = nums[0]
        else:
            return 0, None, None

    start_iso = f"{start_year:04d}-{start_month:02d}-{start_day:02d}"
    end_iso = f"{end_year:04d}-{end_month:02d}-{end_day:02d}"
    score = (end_year * 1000000) + (end_month * 10000) + (score_day * 100) + start_day
    return score, start_iso, end_iso


def parse_folder_date_score(folder_name: str) -> int:
    return extract_folder_date_info(folder_name)[0]


def _extract_storage_folder_from_url(url: str) -> tuple[str | None, str]:
    """Mengambil (folder_name, file_name) bila URL berasal dari Storage PROMO/<folder>/<file> atau folder batch PROMO/<folder>."""
    if not url:
        return None, ""
    decoded = unquote(str(url)).split("?", 1)[0].strip()
    marker = "/PROMO/"
    idx = decoded.upper().find(marker)
    if idx != -1:
        rel = decoded[idx + len(marker):].strip("/")
        if "/" in rel:
            folder_part, file_part = rel.split("/", 1)
            return folder_part, os.path.basename(file_part)
        if rel and not rel.lower().endswith((".xlsx", ".csv", ".xls", ".xlsm", ".xlsb")):
            return rel, ""
        return None, os.path.basename(rel)
    return None, os.path.basename(decoded)


def _list_files_in_promo_folder(folder_name: str) -> list[dict]:
    """Mengembalikan seluruh berkas promo valid di Turso Storage subfolder PROMO/<folder_name>."""
    files = []
    if not folder_name:
        return files
    try:
        sub_res = storage_list(f"PROMO/{folder_name}")
        for item in (sub_res or []):
            name = item.get("name", "")
            if name.lower().endswith((".xlsx", ".csv", ".xls", ".xlsm", ".xlsb")):
                path = f"PROMO/{folder_name}/{name}"
                files.append({"name": name, "url": f"turso://{path}"})
    except Exception as e:
        print(f"⚠️ Gagal membaca daftar berkas folder PROMO/{folder_name}: {e}")
    return files


def detect_promo_launch_window(
    parsed_rows: list,
    file_name: str = "",
    folder_name: str = "",
    today_wib: str = None,
    all_file_names: list[str] = None,
) -> dict:
    """
    Auto-Guard 3-Lapis untuk mendeteksi promo yang belum launching (H-2 / H-1):
      - Tag eksplisit folder ('UPCOMING', 'DRAFT', 'NEXT', 'POP')
      - Lapis 1 (Terakurat): Kolom `tgl_mulai` pada baris promo di dalam isi Excel
      - Lapis 2: Tanggal periode pada nama file Excel (termasuk format kompak e.g. 26NOV-02DES2026)
      - Lapis 3: Subject email / nama folder Storage
    """
    if not today_wib:
        today_wib = datetime.now(timezone(timedelta(hours=7))).strftime("%Y-%m-%d")

    folder_upper = (folder_name or "").upper()
    is_upcoming_tag = any(k in folder_upper for k in ("UPCOMING", "DRAFT", "NEXT", "POP"))

    # Lapis 1: Isi Excel (`tgl_mulai` & `tgl_akhir`)
    valid_froms = []
    valid_tos = []
    for r in (parsed_rows or []):
        is_promo_row = bool(r.get("is_promo") or r.get("harga_promo") or r.get("diskon") or r.get("tipe_diskon"))
        if not is_promo_row:
            continue
        f_iso = _normalize_iso_date(r.get("tgl_mulai"))
        t_iso = _normalize_iso_date(r.get("tgl_akhir"))
        if f_iso:
            valid_froms.append(f_iso)
        if t_iso:
            valid_tos.append(t_iso)

    future_froms = [d for d in valid_froms if d > today_wib]
    active_froms = [d for d in valid_froms if d <= today_wib]

    # Lapis 2: Nama file Excel (cek semua file di folder bila tersedia)
    candidate_names = [n for n in (all_file_names or []) if n]
    if file_name and file_name not in candidate_names:
        candidate_names.insert(0, file_name)

    file_starts = []
    file_ends = []
    for cname in candidate_names:
        _, f_start, f_end = extract_folder_date_info(cname)
        if f_start:
            file_starts.append(f_start)
        if f_end:
            file_ends.append(f_end)

    # Lapis 3: Subject email / Nama folder
    _, folder_start, folder_end = extract_folder_date_info(folder_name or "")

    # Keputusan prioritas 3 lapis
    if is_upcoming_tag:
        start_dt = (min(future_froms) if future_froms else None) or (min(file_starts) if file_starts else None) or folder_start
        end_dt = (max(valid_tos) if valid_tos else None) or (max(file_ends) if file_ends else None) or folder_end
        return {
            "is_future": True,
            "reason": "TAG_FOLDER_UPCOMING",
            "start_date": start_dt,
            "end_date": end_dt,
            "future_cnt": len(future_froms),
            "active_cnt": len(active_froms),
        }

    if len(future_froms) > 0 and len(future_froms) >= len(active_froms):
        return {
            "is_future": True,
            "reason": "ISI_EXCEL_TGL_MULAI",
            "start_date": min(future_froms),
            "end_date": (max(valid_tos) if valid_tos else None) or max(future_froms),
            "future_cnt": len(future_froms),
            "active_cnt": len(active_froms),
        }

    if len(active_froms) == 0:
        future_file_starts = [d for d in file_starts if d > today_wib]
        active_file_starts = [d for d in file_starts if d <= today_wib]
        if future_file_starts and not active_file_starts:
            return {
                "is_future": True,
                "reason": "NAMA_FILE_EXCEL",
                "start_date": min(future_file_starts),
                "end_date": (max(file_ends) if file_ends else None) or max(future_file_starts),
                "future_cnt": 0,
                "active_cnt": 0,
            }

        if folder_start and folder_start > today_wib:
            return {
                "is_future": True,
                "reason": "SUBJECT_EMAIL_FOLDER",
                "start_date": folder_start,
                "end_date": folder_end or folder_start,
                "future_cnt": 0,
                "active_cnt": 0,
            }

    return {
        "is_future": False,
        "reason": "ACTIVE_TODAY",
        "start_date": (min(active_froms) if active_froms else None) or (min(file_starts) if file_starts else None) or folder_start,
        "end_date": (max(valid_tos) if valid_tos else None) or (max(file_ends) if file_ends else None) or folder_end,
        "future_cnt": len(future_froms),
        "active_cnt": len(active_froms),
    }


def list_promo_folders_from_storage():
    """Mengembalikan daftar folder PROMO diurutkan kronologis terbaru (paling tinggi di index 0)."""
    folders = []
    try:
        res = storage_list("PROMO")
        if not res:
            return []
        subfolders = [item for item in res if "." not in item.get("name", "")]
        for sf in subfolders:
            fname = sf.get("name", "")
            score, start_iso, end_iso = extract_folder_date_info(fname)
            is_upcoming_tag = any(k in fname.upper() for k in ("UPCOMING", "DRAFT", "NEXT", "POP"))
            files = _list_files_in_promo_folder(fname)
            if files:
                # Fallback Layer 2: jika Subject/nama folder belum mencantumkan tanggal, ambil dari nama file di dalamnya
                if score == 0:
                    best_fscore, best_fs, best_fe = 0, None, None
                    for fl in files:
                        fs_score, fs_start, fs_end = extract_folder_date_info(fl["name"])
                        if fs_score > best_fscore:
                            best_fscore, best_fs, best_fe = fs_score, fs_start, fs_end
                    if best_fscore > 0:
                        score, start_iso, end_iso = best_fscore, best_fs, best_fe
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
        print(f"⚠️ Gagal membaca daftar folder PROMO di Turso Storage: {e}")
    return folders


def get_latest_promo_files_from_storage():
    """Mencari file promo dari folder terbaru Turso Storage PROMO/."""
    folders = list_promo_folders_from_storage()
    if folders:
        top = folders[0]
        print(f"📁 Menggunakan folder promo terbaru: '{top['name']}' ({top.get('start_date')} s/d {top.get('end_date')})")
        return top["files"]

    try:
        res = storage_list("PROMO")
        direct_files = []
        for item in (res or []):
            name = item.get("name", "")
            if name.lower().endswith((".xlsx", ".csv", ".xls")):
                path = f"PROMO/{name}"
                direct_files.append({"name": name, "url": f"turso://{path}"})
        return direct_files
    except Exception as e:
        print(f"⚠️ Gagal mencari file promo di Turso Storage: {e}")
        return []


def log_sync_history(file_name: str, total_records: int, file_url: str = None):
    try:
        user_res = db.table("User").select("id").eq("nik", "22054178").limit(1).execute()
        user_id = user_res.data[0]["id"] if user_res.data else None
        if not user_id:
            u_fallback = db.table("User").select("id").limit(1).execute()
            user_id = u_fallback.data[0]["id"] if u_fallback.data else None

        if user_id:
            sync_id = f"sync_{uuid.uuid4().hex[:20]}"
            db.table("SyncHistory").insert({
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


def process_single_promo_file(
    file_url: str,
    file_name: str = None,
    parsed_data: list = None,
    force_apply: bool = False,
    today_wib: str = None,
) -> int:
    print(f"\n📄 Memproses file: {file_name or os.path.basename(unquote(file_url or ''))}")
    print(f"🔗 Sumber URL: {file_url}")

    if not today_wib:
        today_wib = datetime.now(timezone(timedelta(hours=7))).strftime("%Y-%m-%d")

    try:
        if parsed_data is None:
            print("⚙️  Mengunduh & menjalankan parser.py (ekstraksi kolom & diskon)...")
            parsed_data = _load_parsed_rows_from_source(file_url, file_name)
        else:
            print("⚙️  Menggunakan hasil parsing tercache (tanpa unduh ulang)...")

        if not force_apply:
            filtered_rows = []
            skipped_future = 0
            for row in (parsed_data or []):
                f_iso = _normalize_iso_date(row.get("tgl_mulai"))
                if f_iso and f_iso > today_wib:
                    skipped_future += 1
                    continue
                filtered_rows.append(row)
            if skipped_future > 0:
                print(
                    f"🛡️ Guard baris campuran: {skipped_future:,} baris promo masa depan (> {today_wib}) "
                    "dilewati agar tidak menimpa harga kasir hari ini."
                )
            parsed_data = filtered_rows

        total_rows = len(parsed_data)
        print(f"✅ Siap memperbarui {total_rows} baris data promo aktif.")

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
                        db.table("Product")
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
                        db.table("Product")
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

                is_row_promo = bool(item.get("is_promo"))
                raw_acara = item.get("acara") or (item.get("sumber_sheet") if is_row_promo else None)
                if raw_acara and any(k in str(raw_acara).upper() for k in ["NORMAL", "REGULAR"]):
                    raw_acara = None

                raw_tipe_diskon = item.get("tipe_diskon") if is_row_promo else None
                if raw_tipe_diskon and any(k in str(raw_tipe_diskon).upper() for k in ["NORMAL", "REGULAR"]):
                    raw_tipe_diskon = None

                raw_diskon = item.get("diskon") if is_row_promo else None
                if raw_diskon and any(k in str(raw_diskon).upper() for k in ["NORMAL", "REGULAR"]):
                    raw_diskon = None

                promo_price = item.get("harga_promo") if is_row_promo else None
                normal_price = float(item.get("harga_normal") or ex.get("hargaNormal") or 0)
                if promo_price is not None and normal_price > 0 and float(promo_price) >= normal_price:
                    promo_price = None

                if not raw_diskon and is_row_promo and promo_price:
                    raw_diskon = f"SP {promo_price}"

                has_real_promo = bool(promo_price or raw_diskon or raw_tipe_diskon or raw_acara)

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
                    "hargaNormal": normal_price,
                    "hargaNormalSource": "PROMO",
                    "hargaPromo": promo_price if has_real_promo else None,
                    "diskon": raw_diskon if has_real_promo else None,
                    "discountType": raw_tipe_diskon if has_real_promo else None,
                    "acara": raw_acara if has_real_promo else None,
                    "fromDate": item.get("tgl_mulai") if has_real_promo else None,
                    "toDate": item.get("tgl_akhir") if has_real_promo else None,
                    "promoFileName": file_name or os.path.basename(unquote(file_url)),
                    "stok": ex.get("stok", 0),
                    "updatedAt": now_iso,
                    "createdAt": ex.get("createdAt") or now_iso,
                }
                payload_by_sku[sku_str] = p_item

            payload = list(payload_by_sku.values())
            try:
                up_res = db.table("Product").upsert(payload, on_conflict="sku").execute()
                total_updated += len(payload)
                print(f"  [Chunk {i // CHUNK_SIZE + 1}] Berhasil memperbarui {len(payload)} produk promo.")
            except Exception as up_err:
                saved_safe = 0
                for rec in payload:
                    try:
                        db.table("Product").upsert(rec, on_conflict="sku").execute()
                        saved_safe += 1
                    except Exception:
                        try:
                            rec_safe = dict(rec)
                            rec_safe.pop("barcode", None)
                            db.table("Product").upsert(rec_safe, on_conflict="sku").execute()
                            saved_safe += 1
                        except Exception:
                            pass
                total_updated += saved_safe
                print(f"  [Chunk {i // CHUNK_SIZE + 1} SAFE] Berhasil memperbarui {saved_safe}/{len(payload)} produk promo ({up_err}).")

        return total_updated
    except Exception as e:
        print(f"❌ Gagal memproses file {file_name}: {e}")
        return 0


def _compute_mds_sku8(sku7: str) -> str:
    if len(sku7) == 7 and sku7.isdigit():
        weights = [1, 2, 1, 2, 1, 2, 1]
        s = sum(int(sku7[idx]) * weights[idx] for idx in range(7))
        return f"{sku7}{(10 - (s % 10)) % 10}"
    return sku7


def _load_parsed_rows_from_source(file_url: str, file_name: str = None):
    safe_name = _sanitize_temp_filename(file_name or os.path.basename(unquote(file_url or "")))
    temp_path = f"temp_promo_{uuid.uuid4().hex[:8]}_{safe_name}"
    try:
        raw_url = str(file_url or "").strip()
        turso_rel_path = None
        if raw_url.startswith("turso://"):
            turso_rel_path = unquote(raw_url[len("turso://"):]).lstrip("/")
        elif "/api/storage/" in raw_url:
            turso_rel_path = unquote(raw_url.split("/api/storage/", 1)[1].split("?", 1)[0]).lstrip("/")

        if turso_rel_path:
            raw_bytes = storage_download(turso_rel_path)
            if not raw_bytes:
                raise RuntimeError(f"File tidak ditemukan di Turso Storage: {turso_rel_path}")
            with open(temp_path, "wb") as f:
                f.write(raw_bytes)
        elif raw_url.startswith("http://") or raw_url.startswith("https://"):
            encoded_url = _safe_encode_url(raw_url)
            with httpx.Client(timeout=60, follow_redirects=True) as client:
                res = client.get(encoded_url)
                res.raise_for_status()
                with open(temp_path, "wb") as f:
                    f.write(res.content)
        else:
            temp_path = raw_url
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
            ex_res = db.table("Product").select(cols).in_("sku", batch).execute()
            for row_ex in (ex_res.data or []):
                ex_map[str(row_ex["sku"])] = row_ex
                if row_ex.get("barcode"):
                    ex_barcode_map[str(row_ex["barcode"])] = row_ex
        except Exception as exc:
            print(f"⚠️ Gagal fetch existing SKU preview batch {i}: {exc}")

    for i in range(0, len(bc_list), 400):
        batch = bc_list[i:i + 400]
        try:
            bc_res = db.table("Product").select(cols).in_("barcode", batch).execute()
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
    preloaded_rows: dict = None,
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
    preloaded_rows = preloaded_rows or {}
    for f in files_to_process:
        fname = f.get("name") or os.path.basename(unquote(f.get("url", "")))
        source_names.append(fname)
        try:
            if fname in preloaded_rows:
                rows = preloaded_rows[fname]
            elif f.get("url") in preloaded_rows:
                rows = preloaded_rows[f["url"]]
            else:
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
        is_row_promo = bool(item.get("is_promo"))
        raw_acara = item.get("acara") or (item.get("sumber_sheet") if is_row_promo else None)
        if raw_acara and any(k in str(raw_acara).upper() for k in ["NORMAL", "REGULAR"]):
            raw_acara = None

        raw_tipe_diskon = item.get("tipe_diskon") if is_row_promo else None
        if raw_tipe_diskon and any(k in str(raw_tipe_diskon).upper() for k in ["NORMAL", "REGULAR"]):
            raw_tipe_diskon = None

        raw_diskon = next_diskon if is_row_promo else None
        if raw_diskon and any(k in str(raw_diskon).upper() for k in ["NORMAL", "REGULAR"]):
            raw_diskon = None

        promo_price = float(next_promo) if (next_promo is not None and is_row_promo) else None
        normal_price = float(item.get("harga_normal") or ex.get("hargaNormal") or 0)
        if promo_price is not None and normal_price > 0 and promo_price >= normal_price:
            promo_price = None

        has_real_promo = bool(promo_price or raw_diskon or raw_tipe_diskon or raw_acara)

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
            "hargaNormal": normal_price,
            "currentPromo": float(cur_promo) if cur_promo is not None else None,
            "currentDiskon": cur_diskon,
            "nextHargaPromo": promo_price if has_real_promo else None,
            "nextDiskon": raw_diskon if has_real_promo else None,
            "nextDiscountType": raw_tipe_diskon if has_real_promo else None,
            "nextAcara": raw_acara if has_real_promo else None,
            "nextFromDate": f_dt if has_real_promo else None,
            "nextToDate": t_dt if has_real_promo else None,
            "sourceFile": item.get("_source_file"),
            "statusChange": status_change if has_real_promo else "NORMAL",
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


def _preload_files_for_guard(files_list: list) -> tuple[dict, list]:
    """Mem-parsing seluruh file dalam satu batch ke memori untuk verifikasi 3-lapis tanpa unduh ganda."""
    preloaded = {}
    aggregated = []
    for f in files_list:
        fname = f.get("name") or os.path.basename(unquote(f.get("url", "")))
        try:
            rows = _load_parsed_rows_from_source(f["url"], fname)
            preloaded[fname] = rows
            aggregated.extend(rows)
        except Exception as exc:
            print(f"  ⚠️ Gagal preload {fname}: {exc}")
            preloaded[fname] = []
    return preloaded, aggregated


def _cleanup_expired_promos_wib(today_wib: str):
    """Membersihkan promo lama di PostgreSQL yang toDate-nya sudah lewat dari hari ini WIB."""
    try:
        cleanup_res = (
            db.table("Product")
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

    # 1. JALUR SINGLE-FILE / FOLDER BATCH EKSPLISIT (Dipanggil Gmail GAS Webhook / WA Promo / --file=<url>)
    if target_file_or_url:
        folder_name, inferred_name = _extract_storage_folder_from_url(target_file_or_url)
        normalized_url = _safe_encode_url(target_file_or_url)

        # 1A. JALUR FOLDER BATCH EKSPLISIT (contoh: turso://PROMO/WA_DIRECT_... atau turso://PROMO/UPCOMING_WA_...)
        if folder_name and not inferred_name and not explicit_name:
            batch_files = _list_files_in_promo_folder(folder_name)
            if not batch_files:
                print(f"⚠️ Folder batch PROMO/{folder_name} kosong — tidak ada file Excel untuk diproses.")
                return
            print(f"📁 [BATCH FOLDER EKSPLISIT] PROMO/{folder_name} ({len(batch_files)} file) | upcoming={upcoming_only} | force={force_apply}")
            _, fld_start, fld_end = extract_folder_date_info(folder_name)

            if upcoming_only:
                build_upcoming_promo_preview(
                    batch_files,
                    folder_name,
                    start_date=fld_start,
                    end_date=fld_end,
                )
                return

            preloaded, agg_rows = _preload_files_for_guard(batch_files)
            if not force_apply:
                guard = detect_promo_launch_window(
                    agg_rows,
                    file_name=batch_files[0]["name"],
                    folder_name=folder_name,
                    today_wib=today_wib,
                    all_file_names=[f["name"] for f in batch_files],
                )
                if guard["is_future"]:
                    print(
                        f"🛡️ Auto-Guard 3-Lapis ({guard['reason']}): Batch '{folder_name}' mulai {guard['start_date']} "
                        f"(> {today_wib}). Dialihkan ke Draf POP (/promo-mendatang)!"
                    )
                    build_upcoming_promo_preview(
                        batch_files,
                        folder_name,
                        start_date=guard.get("start_date"),
                        end_date=guard.get("end_date"),
                        preloaded_rows=preloaded,
                    )
                    return

            grand_total = 0
            for f in batch_files:
                grand_total += process_single_promo_file(
                    f["url"],
                    f["name"],
                    parsed_data=preloaded.get(f["name"]),
                    force_apply=force_apply,
                    today_wib=today_wib,
                )
            print("=" * 60)
            print(f"🎉 [SUKSES BATCH EKSPLISIT] Total {grand_total} produk diperbarui dari {len(batch_files)} file ({folder_name})!")
            print("=" * 60)
            if grand_total > 0:
                log_sync_history(f"WA Promo Direct ({len(batch_files)} file • {folder_name})", grand_total, normalized_url)
            else:
                print("ℹ️ 0 produk promo berubah — lewati pencatatan SyncHistory.")
            return

        fname = explicit_name or inferred_name or os.path.basename(unquote(target_file_or_url))

        if upcoming_only:
            files_for_preview = _list_files_in_promo_folder(folder_name) if folder_name else []
            if not any(f["name"] == fname for f in files_for_preview):
                files_for_preview.append({"name": fname, "url": normalized_url})
            _, fld_start, fld_end = extract_folder_date_info(folder_name or fname)
            build_upcoming_promo_preview(
                files_for_preview,
                folder_name or fname,
                start_date=fld_start,
                end_date=fld_end,
            )
            return

        print(f"🔎 [Auto-Guard 3-Lapis] Memeriksa kelayakan promo '{fname}' (Folder/Subject: '{folder_name or '-'}')...")
        rows = _load_parsed_rows_from_source(normalized_url, fname)
        guard = detect_promo_launch_window(
            rows,
            file_name=fname,
            folder_name=folder_name or "",
            today_wib=today_wib,
        )

        if guard["is_future"] and not force_apply:
            print(
                f"🛡️ Auto-Guard 3-Lapis ({guard['reason']}): File '{fname}' mulai {guard['start_date']} "
                f"(> {today_wib}). Dialihkan ke Draf POP (/promo-mendatang) tanpa menyentuh promo kasir!"
            )
            files_for_preview = _list_files_in_promo_folder(folder_name) if folder_name else []
            if not any(f["name"] == fname for f in files_for_preview):
                files_for_preview.append({"name": fname, "url": normalized_url})
            build_upcoming_promo_preview(
                files_for_preview,
                folder_name or fname,
                start_date=guard.get("start_date"),
                end_date=guard.get("end_date"),
                preloaded_rows={fname: rows},
            )
            return

        print(f"✅ Terverifikasi aktif ({guard['reason']}). Menerapkan '{fname}' ke Product DB...")
        total = process_single_promo_file(
            normalized_url,
            fname,
            parsed_data=rows,
            force_apply=force_apply,
            today_wib=today_wib,
        )
        if total > 0:
            log_sync_history(fname, total)
        else:
            print("ℹ️ Tidak ada baris promo yang diperbarui — lewati pencatatan SyncHistory.")
        return

    # 2. JALUR FOLDER PROMO DI SUPABASE STORAGE (PROMO/)
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
        preloaded, agg_rows = _preload_files_for_guard(files_fallback)
        guard = detect_promo_launch_window(
            agg_rows,
            file_name=files_fallback[0]["name"],
            folder_name="PROMO",
            today_wib=today_wib,
            all_file_names=[f["name"] for f in files_fallback],
        )
        if guard["is_future"] and not force_apply:
            print(
                f"🛡️ Auto-Guard 3-Lapis ({guard['reason']}): Berkas promo mulai {guard['start_date']} "
                f"(> {today_wib}). Dialihkan ke Persiapan POP (/promo-mendatang)!"
            )
            build_upcoming_promo_preview(
                files_fallback,
                "PROMO Draft",
                start_date=guard.get("start_date"),
                end_date=guard.get("end_date"),
                preloaded_rows=preloaded,
            )
            return
        grand_total = sum(
            process_single_promo_file(
                f["url"],
                f["name"],
                parsed_data=preloaded.get(f["name"]),
                force_apply=force_apply,
                today_wib=today_wib,
            )
            for f in files_fallback
        )
        _cleanup_expired_promos_wib(today_wib)
        if grand_total > 0:
            log_sync_history(f"Batch Promo ({len(files_fallback)} file)", grand_total)
        return

    # MODE PERSIAPAN POP KHUSUS (--upcoming)
    if upcoming_only:
        top = folders[0]
        build_upcoming_promo_preview(top["files"], top["name"], top.get("start_date"), top.get("end_date"))
        return

    # AUTO-GUARD 3-LAPIS UNTUK FOLDER BATCH:
    # Cek Lapis 3 (Tag/Subject folder), dan jika lolos cek Lapis 1 (Isi `tgl_mulai` Excel) + Lapis 2 (Nama file)
    active_folder = None
    active_preloaded = None
    for fld in folders:
        is_future_tag_or_folder = bool(
            fld["is_upcoming_tag"] or (fld.get("start_date") and fld["start_date"] > today_wib)
        )
        if is_future_tag_or_folder and not force_apply:
            print(
                f"🛡️ Auto-Guard H-2/H-1 (Folder/Subject): '{fld['name']}' belum mulai "
                f"({fld.get('start_date')} > {today_wib}). Dialihkan ke Persiapan POP!"
            )
            build_upcoming_promo_preview(fld["files"], fld["name"], fld.get("start_date"), fld.get("end_date"))
            continue

        preloaded, agg_rows = _preload_files_for_guard(fld["files"])
        guard = detect_promo_launch_window(
            agg_rows,
            file_name=fld["files"][0]["name"],
            folder_name=fld["name"],
            today_wib=today_wib,
            all_file_names=[f["name"] for f in fld["files"]],
        )
        if guard["is_future"] and not force_apply:
            print(
                f"🛡️ Auto-Guard 3-Lapis ({guard['reason']}): Folder '{fld['name']}' ternyata promo mendatang "
                f"(mulai {guard.get('start_date')} > {today_wib}). Dialihkan ke Persiapan POP (/promo-mendatang)!"
            )
            build_upcoming_promo_preview(
                fld["files"],
                fld["name"],
                start_date=guard.get("start_date"),
                end_date=guard.get("end_date"),
                preloaded_rows=preloaded,
            )
            continue

        active_folder = fld
        active_preloaded = preloaded
        break

    if not active_folder:
        print("ℹ️ Tidak ada folder promo aktif hari ini untuk ditimpa ke Product DB.")
        return

    files_to_process = active_folder["files"]
    print(f"📦 Memproses folder aktif '{active_folder['name']}' ({len(files_to_process)} file)...")
    grand_total = 0
    for f in files_to_process:
        grand_total += process_single_promo_file(
            f["url"],
            f["name"],
            parsed_data=(active_preloaded or {}).get(f["name"]),
            force_apply=force_apply,
            today_wib=today_wib,
        )

    print("=" * 60)
    print(f"🎉 [SUKSES BATCH] Total {grand_total} produk berhasil diperbarui dari {len(files_to_process)} file!")
    print("=" * 60)

    _cleanup_expired_promos_wib(today_wib)

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
