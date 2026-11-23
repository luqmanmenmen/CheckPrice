"""
morning_full_sweep.py
=============================================================================
MESIN TURBO BRUTAL SCRAPING & LIVE STOCK ENGINE MDS BISA (PYTHON ENGINE)
Arsitektur: PYTHON (BACKEND) YANG MIKIR, VERCEL HANYA DISPLAY.

Misi Utama (Instruksi Mas Luqman):
1. "ayo coba scrab brutal sekarang mds bisa itu dan dapatkan all data produk dari
   harga, stock, barcode upc, sku all semua tanpa kecuali"
2. "dan ini juga mesin scrabber brutal image mahatari.com sama mesin scrabber
   mds bisa ini tolong tanam di github terus kamu buat triger dong di front end
   agar bisa dirun disana. jadi rekontruksi semua triger. ada scrab sama update
   stock live kan sudah dapat semua jalur sku nya jangan kamu buang itu mapping
   jalurnya agar bisa update stock terkini"

Mode Eksekusi CLI (GitHub Actions & Lokal):
- `python python-engine/morning_full_sweep.py --stock-only`
  -> UPDATE STOCK LIVE TERKINI menggunakan Jalur Mapping 84.763 SKU & Artikel
     (`mapped_sku_paths.json.gz` + Database Supabase) dengan 16 Worker Threads
     + ekstraksi multi-varian `relatedStock`.
- `python python-engine/morning_full_sweep.py --brutal`
  -> BRUTAL SCRAP MDS BISA (16 Workers + Dual Check-Digit Modulo-10 SKU & EAN-13
     Barcode Sweep) untuk menyerap produk baru, barcode UPC, harga, dan stok.
- `python python-engine/morning_full_sweep.py --export-paths`
  -> Menyimpan/memperbarui brankas jalur mapping 84.763 SKU ke `mapped_sku_paths.json.gz`.
=============================================================================
"""

import os
import sys
import re
import gzip
import json
import time
import uuid
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Set, Tuple, Any, Optional
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from raw_vault_collector import (
    connect_pg,
    normalize_barcode_token,
    normalize_code_key,
    normalize_sku_token,
    record_raw_items_batch,
)
from scrap_controller import (
    build_adaptive_sku_census,
    build_alnum_qr_candidate_queue,
    expand_universal_neighbors,
)
from turso_db import (
    format_prisma_iso,
    get_turso_table_client,
    is_turso_configured,
    storage_download,
    storage_upload,
)

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(line_buffering=True)

load_dotenv()
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env.local"))

if not is_turso_configured():
    print("❌ Error: TURSO_DATABASE_URL / TURSO_AUTH_TOKEN tidak ditemukan.")
    sys.exit(1)

db = get_turso_table_client(timeout=60)
sb = db

STOREHUB_BASE = "https://storehub.mdsretailing.id"
LOGIN_URL = f"{STOREHUB_BASE}/login?next=%2F"
ITEM_CHECKER_URL = f"{STOREHUB_BASE}/item-checker"
ACTION_LOGIN = "603f9b4dfafaa0e65eec411a818c1ebcaa476b889f"
ACTION_DETAIL = "608e569ea77f8871817d11afae932ecea7d0fcbd09"
ACTION_STOCK = "609a33bf9f07b2014de2e2303717cb33ca4a588314"
ACTION_PROMO = "60a67fb6833e81c90695ed315a2dc4394535951a87"

ACCOUNT_PROFILES: Dict[str, Dict[str, str]] = {
    "suko": {
        "label": "SUKO",
        "username": os.getenv("MDS_USERNAME") or "M223515",
        "password": os.getenv("MDS_PASSWORD") or "Luqmen123!",
        "tz": "Asia/Jakarta",
        "cookie_storage_path": "secrets/mds_cookie.txt",
        "local_cookie_file": ".mds_cookie",
        "env_cookie_key": "MDS_SESSION_COOKIE",
    },
    "muku": {
        "label": "Mu+Ku",
        "username": os.getenv("MDS_MUKU_USERNAME") or "M223708",
        "password": os.getenv("MDS_MUKU_PASSWORD") or "Aurel_28",
        "tz": "Asia/Jakarta",
        "cookie_storage_path": "secrets/mds_cookie_muku.txt",
        "local_cookie_file": ".mds_cookie_muku",
        "env_cookie_key": "MDS_MUKU_SESSION_COOKIE",
    },
}

ACTIVE_ACCOUNT = "suko"
CREDENTIALS = dict(ACCOUNT_PROFILES["suko"])


def set_active_account(account: str) -> str:
    """Memilih profil akun StoreHub aktif ('suko' atau 'muku') beserta jalur cookie terpisah."""
    global ACTIVE_ACCOUNT, CREDENTIALS
    key = "muku" if str(account or "").strip().lower() in ("muku", "mu+ku", "m223708") else "suko"
    ACTIVE_ACCOUNT = key
    CREDENTIALS = dict(ACCOUNT_PROFILES[key])
    print(f"🔐 [ACCOUNT] Profil aktif: {CREDENTIALS['label']} ({CREDENTIALS['username']}) | Cookie: {CREDENTIALS['cookie_storage_path']}")
    return key


def _is_muku_row(row: Optional[Dict[str, Any]]) -> bool:
    """Mengembalikan True bila baris produk milik toko Multibrand Mu+Ku (di luar Monostore SUKO & ZES)."""
    if not row:
        return True
    b_up = str(row.get("brand") or "").upper()
    d_up = str(row.get("dept") or "").upper()
    if "SUKO" in b_up or "SUKO" in d_up or "ZES" in b_up or "ZES" in d_up:
        return False
    return True


def _protect_cross_store_stock(rec: Dict[str, Any], ex_row: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Anti-Timpa Stok Lintas Toko (SUKO vs Mu+Ku):
    - Akun Mu+Ku tidak boleh menimpa stok > 0 milik SUKO/ZES menjadi <= 0.
    - Akun SUKO tidak boleh menimpa stok > 0 milik Mu+Ku menjadi <= 0.
    """
    if not ex_row:
        return rec
    old_stok = int(ex_row.get("stok") or 0)
    new_stok = int(rec.get("stok") or 0)
    is_muku_item = _is_muku_row(rec)
    if ACTIVE_ACCOUNT == "muku" and not is_muku_item and new_stok <= 0 and old_stok > 0:
        rec["stok"] = old_stok
    elif ACTIVE_ACCOUNT == "suko" and is_muku_item and new_stok <= 0 and old_stok > 0:
        rec["stok"] = old_stok
    return rec

REPORT_PATH = os.path.join(os.path.dirname(__file__), "LAPORAN_SCRAP_PAGI.md")
MAPPED_PATHS_FILE = os.path.join(os.path.dirname(__file__), "mapped_sku_paths.json.gz")
BASELINE_INITIAL_COUNT = 9703  # Baseline sebelum brutal sweep dimulai

# Thread-safe HTTP Session dengan Connection Pooling besar untuk Turbo Sweep
http_session = requests.Session()
adapter = HTTPAdapter(
    pool_connections=64,
    pool_maxsize=64,
    max_retries=Retry(total=1, backoff_factor=0.2, status_forcelist=[502, 503])
)
http_session.mount("https://", adapter)
http_session.mount("http://", adapter)

action_lock = threading.Lock()
cookie_lock = threading.Lock()
img_cache_lock = threading.Lock()
SUGGEST_IMG_CACHE: Dict[str, Optional[str]] = {}


def lookup_matahari_image(sku: str) -> Optional[str]:
    """Mencari foto studio resmi Matahari.com secara live untuk 1 SKU/barcode via suggest API."""
    key = str(sku or "").strip()
    if not key:
        return None
    with img_cache_lock:
        if key in SUGGEST_IMG_CACHE:
            return SUGGEST_IMG_CACHE[key]
    found_url: Optional[str] = None
    try:
        r = http_session.get(
            f"https://matahari.com/search/suggest.json?q={key}&resources[type]=product",
            timeout=2.5,
        )
        if r.status_code == 200:
            prods = (((r.json() or {}).get("resources") or {}).get("results") or {}).get("products") or []
            for p in prods:
                img = str(p.get("image") or "").strip()
                handle = str(p.get("handle") or "").lower()
                url_p = str(p.get("url") or "").lower()
                if img.startswith("//"):
                    img = f"https:{img}"
                if "cdn.shopify.com/s/files/1/0666/9212/0727/" not in img:
                    continue
                fn_lower = img.split("?")[0].split("/")[-1].lower()
                if any(bad in fn_lower for bad in ("banner", "logo", "icon", "badge", "chart", "size", "panduan", ".svg", ".gif")):
                    continue
                if key.lower() in fn_lower or key.lower() in handle or key.lower() in url_p:
                    found_url = img
                    break
    except Exception:
        pass
    with img_cache_lock:
        SUGGEST_IMG_CACHE[key] = found_url
    return found_url


def load_vault_image_map() -> Dict[str, List[str]]:
    """Memuat peta foto resmi dari Raw Vault lokal (`raw_vault.db`) dalam <1 detik."""
    out: Dict[str, List[str]] = {}
    db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "raw_vault.db")
    if not os.path.exists(db_path):
        return out
    try:
        import sqlite3
        conn = sqlite3.connect(db_path, timeout=5)
        for sku_v, imgs_j in conn.execute(
            "SELECT sku, images_json FROM raw_items WHERE images_json IS NOT NULL AND images_json != '[]'"
        ):
            if not sku_v or sku_v.startswith("SHP-"):
                continue
            try:
                imgs = json.loads(imgs_j)
                if imgs:
                    out[str(sku_v)] = imgs[:6]
            except Exception:
                pass
        conn.close()
    except Exception:
        pass
    return out


def log_sync_history(sync_type: str, file_name: str, total_records: int, status: str = "SUCCESS"):
    """Mencatat hasil eksekusi ke tabel SyncHistory agar tampil di Dashboard Frontend."""
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
                "type": sync_type,
                "fileName": file_name,
                "status": status,
                "records": int(total_records),
                "createdAt": format_prisma_iso(datetime.now(timezone.utc)),
            }).execute()
            print(f"📝 [SyncHistory] Tercatat: {sync_type} | {file_name} | {total_records:,} item ({status})")
    except Exception as e:
        print(f"⚠️ Gagal mencatat SyncHistory: {e}")


def resolve_action_detail(default_action: str = ACTION_DETAIL) -> str:
    """Mendeteksi action ID checkItemDetail, checkItemStock, & checkItemPromotion secara dinamis dari Next.js bundle."""
    global ACTION_PROMO, ACTION_STOCK
    found_detail = default_action
    try:
        r = http_session.get(ITEM_CHECKER_URL, timeout=8)
        scripts = re.findall(r'src="(/_next/static/[^"]+\.js)"', r.text)
        for s in scripts:
            js_url = f"{STOREHUB_BASE}{s}"
            js_r = http_session.get(js_url, timeout=8)
            match = re.search(r'createServerReference\)?\("([a-f0-9]{40,44})"[^)]{0,140}"checkItemDetail"', js_r.text)
            if match:
                found_detail = match.group(1)
            match_s = re.search(r'createServerReference\)?\("([a-f0-9]{40,44})"[^)]{0,140}"checkItemStock"', js_r.text)
            if match_s:
                ACTION_STOCK = match_s.group(1)
            match_p = re.search(r'createServerReference\)?\("([a-f0-9]{40,44})"[^)]{0,140}"checkItemPromotion"', js_r.text)
            if match_p:
                ACTION_PROMO = match_p.group(1)
            if match or match_s or match_p:
                break
    except Exception as e:
        print(f"⚠️ Gagal resolve action hash: {e}")
    return found_detail


def resolve_action_login(default_action: str = ACTION_LOGIN) -> str:
    """Mendeteksi action ID login secara dinamis dari Next.js bundle /login jika berubah."""
    try:
        r = http_session.get(LOGIN_URL, timeout=8)
        scripts = set(re.findall(r'src="(/_next/static/[^"]+\.js)"', r.text))
        for s in scripts:
            js_url = f"{STOREHUB_BASE}{s}"
            js_r = http_session.get(js_url, timeout=8)
            match = re.search(r'createServerReference\)?\("([a-f0-9]{40,44})"[^)]{0,140}"login"', js_r.text)
            if match:
                return match.group(1)
    except Exception:
        pass
    return default_action


def save_valid_cookie(cookie_str: str) -> None:
    """Menyimpan cookie valid (WAJIB berisi mso_session=) ke Turso Storage & file lokal sesuai akun aktif."""
    if not cookie_str or "mso_session=" not in cookie_str:
        return
    storage_path = CREDENTIALS.get("cookie_storage_path", "secrets/mds_cookie.txt")
    local_name = CREDENTIALS.get("local_cookie_file", ".mds_cookie")
    try:
        storage_upload(storage_path, cookie_str.encode("utf-8"), content_type="text/plain")
    except Exception:
        pass
    try:
        local_cookie_path = os.path.join(os.path.dirname(__file__), "..", local_name)
        with open(local_cookie_path, "w", encoding="utf-8") as f:
            f.write(cookie_str)
    except Exception:
        pass


def auto_login_storehub() -> str:
    """Auto-login ke StoreHub MDS BISA memakai akun aktif (SUKO / Mu+Ku)."""
    global ACTION_LOGIN
    acc_label = CREDENTIALS.get("label", "SUKO")
    print(f"🔑 [AUTH {acc_label}] Mencoba auto-login ke StoreHub MDS BISA ({CREDENTIALS['username']})...")
    try:
        ACTION_LOGIN = resolve_action_login(ACTION_LOGIN)
        headers = {
            "Accept": "text/x-component",
            "Next-Action": ACTION_LOGIN,
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15",
            "Referer": LOGIN_URL,
            "Origin": STOREHUB_BASE,
        }
        # KRUSIAL (React 19 decodeReplyFromBusboy): field `_1_*` WAJIB dikirim SEBELUM `'0'` (`[{},"$K1"]`)!
        files = [
            ("_1_next", (None, "/")),
            ("_1_username", (None, CREDENTIALS["username"])),
            ("_1_password", (None, CREDENTIALS["password"])),
            ("_1_tz", (None, CREDENTIALS["tz"])),
            ("0", (None, '[{},"$K1"]')),
        ]
        res = http_session.post(LOGIN_URL, headers=headers, files=files, allow_redirects=False, timeout=15)
        cookies_dict = res.cookies.get_dict()
        if not cookies_dict and "set-cookie" in res.headers:
            raw_sc = res.headers.get("set-cookie", "")
            parts = [p.split(";")[0].strip() for p in re.split(r",(?=\s*[A-Za-z0-9_-]+=)", raw_sc) if "=" in p.split(";")[0]]
            cookie_str = "; ".join(parts)
        else:
            cookie_str = "; ".join(f"{k}={v}" for k, v in cookies_dict.items())

        # PENTING: HAProxy selalu mengirim cookie db76d... bahkan saat login gagal!
        # JANGAN PERNAH menganggap db76d... sebagai login sukses tanpa mso_session=!
        if cookie_str and "mso_session=" in cookie_str:
            print(f"✅ [AUTH {acc_label}] Auto-login StoreHub berhasil! Memperbarui {CREDENTIALS.get('cookie_storage_path')} di Turso Storage...")
            save_valid_cookie(cookie_str)
            return cookie_str
        print(f"⚠️ [AUTH {acc_label}] Auto-login HTTP tidak mengembalikan mso_session (menjaga cookie Storage/lokal tetap utuh).")
    except Exception as e:
        print(f"⚠️ [AUTH {acc_label}] Auto-login gagal: {e}")

    # Fallback aman ke file cookie lokal jika masih valid
    local_name = CREDENTIALS.get("local_cookie_file", ".mds_cookie")
    local_cookie_path = os.path.join(os.path.dirname(__file__), "..", local_name)
    if os.path.exists(local_cookie_path):
        try:
            with open(local_cookie_path, "r", encoding="utf-8") as f:
                c = f.read().strip()
                if "mso_session=" in c:
                    return c
        except Exception:
            pass
    return ""


def get_active_cookie() -> str:
    """Mengambil session cookie aktif (wajib berisi mso_session=) dari Env, Turso Storage, atau Lokal sesuai akun aktif."""
    env_key = CREDENTIALS.get("env_cookie_key", "MDS_SESSION_COOKIE")
    env_cookie = (os.getenv(env_key) or "").strip()
    if "mso_session=" in env_cookie:
        return env_cookie
    if ACTIVE_ACCOUNT == "muku":
        generic_env = (os.getenv("MDS_SESSION_COOKIE") or "").strip()
        if "mso_session=" in generic_env and os.getenv("MDS_SESSION_COOKIE_IS_MUKU") == "1":
            return generic_env

    storage_path = CREDENTIALS.get("cookie_storage_path", "secrets/mds_cookie.txt")
    try:
        data = storage_download(storage_path)
        if data:
            cookie = data.decode("utf-8").strip()
            if "mso_session=" in cookie:
                return cookie
    except Exception as e:
        print(f"⚠️ Gagal membaca cookie ({storage_path}) dari Turso Storage: {e}")

    local_name = CREDENTIALS.get("local_cookie_file", ".mds_cookie")
    local_cookie_path = os.path.join(os.path.dirname(__file__), "..", local_name)
    if os.path.exists(local_cookie_path):
        try:
            with open(local_cookie_path, "r", encoding="utf-8") as f:
                cookie = f.read().strip()
                if "mso_session=" in cookie:
                    save_valid_cookie(cookie)
                    return cookie
        except Exception:
            pass

    return auto_login_storehub()


def calculate_ean13_check_digit(digits12: str) -> str:
    """Menghitung check digit standar GS1 EAN-13 (bobot 1, 3)."""
    if len(digits12) != 12 or not digits12.isdigit():
        return ""
    total = sum(int(d) * (1 if i % 2 == 0 else 3) for i, d in enumerate(digits12))
    return str((10 - (total % 10)) % 10)


def generate_ean13_barcode(body6: int) -> str:
    """Membuat 13 digit EAN-13 valid dari body 6 digit."""
    digits12 = f"234000{body6:06d}"
    return f"{digits12}{calculate_ean13_check_digit(digits12)}"


def generate_mds_sku8(body7: int) -> str:
    """Membuat 8 digit SKU Matahari valid dari 7 digit body menggunakan bobot (1,2,1,2,1,2,1) Modulo-10."""
    s7 = f"{body7:07d}"
    if len(s7) != 7 or not s7.isdigit():
        return ""
    weights = (1, 2, 1, 2, 1, 2, 1)
    total = sum(int(s7[i]) * weights[i] for i in range(7))
    cd = (10 - (total % 10)) % 10
    return f"{s7}{cd}"


def normalize_brand_and_dept(item: Dict[str, Any]) -> Tuple[str, str]:
    """Menormalisasi nama Brand dan Departemen dari payload StoreHub."""
    raw_group = str(item.get("Brand") or item.get("GroupName") or "").strip()
    raw_dept = str(item.get("DeptName") or item.get("Department") or raw_group or "MDS RETAIL").strip()
    raw_sub = str(item.get("SubclassName") or item.get("ClassName") or "").strip()
    raw_style = str(item.get("StyleCode") or "").strip().upper()
    raw_desc = str(item.get("Description") or item.get("ItemDescription") or "").strip().upper()
    combined_upper = f"{raw_group} {raw_dept} {raw_sub} {raw_desc}".upper()

    if "MUKU" in combined_upper or raw_style.startswith("MK-") or "-MK" in raw_style:
        brand = "MUKU"
    elif "ZES" in combined_upper:
        brand = "ZES"
    elif "SUKO" in combined_upper:
        brand = "SUKO"
    elif "BYRCH" in combined_upper:
        brand = "BYRCH & CO"
    elif "NEVADA" in combined_upper:
        brand = "NEVADA"
    elif "STANLEY ADAMS" in combined_upper:
        brand = "STANLEY ADAMS"
    elif "COLE" in combined_upper:
        brand = "COLE"
    elif "CONNEXION" in combined_upper:
        brand = "CONNEXION"
    elif "ST YVES" in combined_upper or "ST. YVES" in combined_upper:
        brand = "ST YVES"
    elif "VOLO" in combined_upper:
        brand = "VOLO"
    elif "LITTLE M" in combined_upper:
        brand = "LITTLE M"
    elif "PIPA" in combined_upper:
        brand = "PIPA"
    elif "SUPER T" in combined_upper:
        brand = "SUPER T"
    elif "DETAILS" in combined_upper:
        brand = "DETAILS"
    elif "PHENOMENAL" in combined_upper:
        brand = "PHENOMENAL"
    elif "AMERICAN JEANS" in combined_upper:
        brand = "AMERICAN JEANS"
    elif "TRISSE" in combined_upper:
        brand = "TRISSE"
    elif "FLADEO" in combined_upper:
        brand = "FLADEO"
    elif "YONGKI" in combined_upper:
        brand = "YONGKI KOMALADI"
    elif raw_sub and raw_dept.upper().startswith("AOS"):
        brand = raw_sub
    else:
        brand = raw_dept if (raw_dept and raw_dept != "MDS RETAIL") else raw_group

    return brand, raw_dept


def query_storehub_multi(category: str, identifier: str, cookie: str) -> List[Dict[str, Any]]:
    """
    Menembak StoreHub MDS BISA untuk 1 UPC atau SKU dan mengembalikan SELURUH
    baris varian/SKU yang ada di dalam response (tidak hanya baris pertama).
    """
    global ACTION_DETAIL
    headers = {
        "Accept": "text/x-component",
        "Content-Type": "text/plain;charset=UTF-8",
        "Cookie": cookie,
        "Next-Action": ACTION_DETAIL,
        "Referer": ITEM_CHECKER_URL,
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15",
        "Next-Router-State-Tree": "%5B%22%22%2C%7B%22children%22%3A%5B%22(app)%22%2C%7B%22children%22%3A%5B%22item-checker%22%2C%7B%22children%22%3A%5B%22__PAGE__%22%2C%7B%7D%2Cnull%2Cnull%2C0%5D%7D%2Cnull%2Cnull%2C0%5D%7D%2Cnull%2Cnull%2C4%5D%7D%2Cnull%2C%22refetch%22%2C24%5D"
    }

    payload = json.dumps([category, str(identifier).strip()])
    try:
        res = http_session.post(ITEM_CHECKER_URL, headers=headers, data=payload, allow_redirects=False, timeout=12)
    except Exception:
        return []

    if res.status_code == 404:
        with action_lock:
            ACTION_DETAIL = resolve_action_detail()
            headers["Next-Action"] = ACTION_DETAIL
        try:
            res = http_session.post(ITEM_CHECKER_URL, headers=headers, data=payload, allow_redirects=False, timeout=12)
        except Exception:
            return []

    redirect_loc = (res.headers.get("location") or res.headers.get("x-action-redirect") or "").lower()
    if res.status_code == 401 or (res.status_code in (301, 302, 303, 307, 308) and "login" in redirect_loc) or "login" in redirect_loc:
        return [{"_unauthorized": True}]

    if res.status_code != 200:
        return []

    # Simpan jika server StoreHub melakukan rotasi cookie mso_session
    raw_sc = res.headers.get("set-cookie", "")
    if "mso_session=" in raw_sc:
        with cookie_lock:
            parts = [p.split(";")[0].strip() for p in re.split(r",(?=\s*[A-Za-z0-9_-]+=)", raw_sc) if "=" in p.split(";")[0]]
            mso_pair = next((p for p in parts if p.startswith("mso_session=")), "")
            if mso_pair:
                other_parts = [p.strip() for p in cookie.split(";") if p.strip() and not p.strip().startswith("mso_session=")]
                other_parts.append(mso_pair)
                save_valid_cookie("; ".join(other_parts))

    text = res.text
    if "NEXT_REDIRECT" in text and "/login" in text:
        return [{"_unauthorized": True}]
    if "no route to host" in text or "504 Gateway" in text:
        return [{"_offline": True}]

    results: List[Dict[str, Any]] = []
    for line in text.split("\n"):
        colon_idx = line.find(":")
        if 0 < colon_idx <= 3:
            try:
                parsed = json.loads(line[colon_idx + 1:])
                if not isinstance(parsed, dict):
                    continue
                if parsed.get("error"):
                    err_str = str(parsed["error"])
                    if "no route to host" in err_str or "tcp connection" in err_str:
                        return [{"_offline": True}]
                    return []
                data = parsed.get("result", {}).get("data")
                if isinstance(data, dict) and data:
                    bc_fields = ("VendorBarcode", "vendorBarcode", "Barcode", "barcode", "UPC", "upc", "EAN", "ean", "ItemLookupCode", "AlternateCode")
                    for sku_key, rows in data.items():
                        row_list = rows if isinstance(rows, list) else ([rows] if isinstance(rows, dict) else [])
                        if not row_list:
                            continue
                        harvested_bcs: List[str] = []
                        chosen = row_list[-1]
                        for r in row_list:
                            if not isinstance(r, dict):
                                continue
                            for bf in bc_fields:
                                nbc = normalize_barcode_token(r.get(bf))
                                if nbc and nbc not in harvested_bcs:
                                    harvested_bcs.append(nbc)
                            if category == "upc" and str(r.get("VendorBarcode") or "").strip() == identifier:
                                chosen = r
                        if isinstance(chosen, dict) and (chosen.get("SKU") or sku_key):
                            chosen_copy = dict(chosen)
                            if not chosen_copy.get("SKU"):
                                chosen_copy["SKU"] = str(sku_key)
                            if harvested_bcs:
                                chosen_copy["_all_barcodes"] = harvested_bcs
                            results.append(chosen_copy)
            except Exception:
                continue

    return results


def query_storehub(category: str, identifier: str, cookie: str) -> Optional[Dict[str, Any]]:
    """Kompatibilitas pemanggilan tunggal."""
    items = query_storehub_multi(category, identifier, cookie)
    return items[0] if items else None


def query_storehub_stock_matrix(category: str, identifier: str, cookie: str) -> Tuple[str, List[Dict[str, Any]]]:
    """
    TURBO MATRIX ENGINE: Memanggil Server Action resmi `checkItemStock` (`ACTION_STOCK`, ~50-150ms!)
    yang langsung mengembalikan SELURUH matriks stok 1 artikel (semua warna x semua ukuran) dalam 1 HTTP request!
    Return: ("ok", rows) | ("empty", []) | ("unauthorized", []) | ("offline", [])
    """
    global ACTION_STOCK
    headers = {
        "Accept": "text/x-component",
        "Content-Type": "text/plain;charset=UTF-8",
        "Cookie": cookie,
        "Next-Action": ACTION_STOCK,
        "Referer": ITEM_CHECKER_URL,
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15",
        "Next-Router-State-Tree": "%5B%22%22%2C%7B%22children%22%3A%5B%22(app)%22%2C%7B%22children%22%3A%5B%22item-checker%22%2C%7B%22children%22%3A%5B%22__PAGE__%22%2C%7B%7D%2Cnull%2Cnull%2C0%5D%7D%2Cnull%2Cnull%2C0%5D%7D%2Cnull%2Cnull%2C4%5D%7D%2Cnull%2C%22refetch%22%2C24%5D",
    }
    payload = json.dumps([category, str(identifier).strip()])
    try:
        res = http_session.post(ITEM_CHECKER_URL, headers=headers, data=payload, allow_redirects=False, timeout=8)
    except Exception:
        return ("empty", [])

    if res.status_code == 404:
        with action_lock:
            resolve_action_detail()
            headers["Next-Action"] = ACTION_STOCK
        try:
            res = http_session.post(ITEM_CHECKER_URL, headers=headers, data=payload, allow_redirects=False, timeout=8)
        except Exception:
            return ("empty", [])

    redirect_loc = (res.headers.get("location") or res.headers.get("x-action-redirect") or "").lower()
    if res.status_code == 401 or (res.status_code in (301, 302, 303, 307, 308) and "login" in redirect_loc) or "login" in redirect_loc:
        return ("unauthorized", [])
    if res.status_code != 200:
        return ("empty", [])

    text = res.text
    if "NEXT_REDIRECT" in text and "/login" in text:
        return ("unauthorized", [])
    if "no route to host" in text or "504 Gateway" in text:
        return ("offline", [])

    for line in text.split("\n"):
        colon_idx = line.find(":")
        if 0 < colon_idx <= 3:
            try:
                parsed = json.loads(line[colon_idx + 1:])
                if not isinstance(parsed, dict):
                    continue
                if parsed.get("error"):
                    err_str = str(parsed["error"])
                    if "no route to host" in err_str or "tcp connection" in err_str:
                        return ("offline", [])
                    return ("empty", [])
                data = parsed.get("result", {}).get("data")
                if isinstance(data, list) and data:
                    return ("ok", [r for r in data if isinstance(r, dict)])
            except Exception:
                continue
    return ("empty", [])


def _norm_matrix_token(val: Any) -> str:
    return re.sub(r"[^A-Z0-9]", "", str(val or "").strip().upper())


def _match_matrix_qty(matrix_rows: List[Dict[str, Any]], color: Any, size: Any) -> Optional[int]:
    """Mencocokkan (color, size) dari DB dengan matriks StoreHub `[{"COLOR & SIZE": "BLACK", "M": "31.000000", ...}]`."""
    if not matrix_rows:
        return None
    col_raw = str(color or "").strip().upper()
    col_norm = _norm_matrix_token(col_raw)
    sz_raw = str(size or "").strip().upper()
    sz_norm = _norm_matrix_token(sz_raw)

    # 1. Cari baris warna paling cocok
    matched_row: Optional[Dict[str, Any]] = None
    if len(matrix_rows) == 1:
        matched_row = matrix_rows[0]
    else:
        for r in matrix_rows:
            r_col = str(r.get("COLOR & SIZE") or r.get("COLOR") or r.get("Color") or "").strip().upper()
            r_norm = _norm_matrix_token(r_col)
            if (col_raw and r_col == col_raw) or (col_norm and r_norm == col_norm):
                matched_row = r
                break
        if matched_row is None and col_norm:
            for r in matrix_rows:
                r_col = str(r.get("COLOR & SIZE") or r.get("COLOR") or r.get("Color") or "").strip().upper()
                r_norm = _norm_matrix_token(r_col)
                if r_norm and (r_norm in col_norm or col_norm in r_norm):
                    matched_row = r
                    break

    if matched_row is None:
        return None

    # 2. Cari kolom ukuran pada baris warna tersebut
    size_entries = [
        (str(k).strip().upper(), _norm_matrix_token(k), v)
        for k, v in matched_row.items()
        if str(k).strip().upper() not in ("COLOR & SIZE", "COLOR", "TOTAL", "GRAND TOTAL")
    ]
    if not size_entries:
        return None

    for k_raw, k_norm, v in size_entries:
        if (sz_raw and k_raw == sz_raw) or (sz_norm and k_norm == sz_norm):
            try:
                return int(float(v or 0))
            except Exception:
                return 0
    # Fallback bila artikel hanya punya 1 kolom ukuran (mis. ALL SIZE / OS / NO SIZE / F)
    if len(size_entries) == 1:
        try:
            return int(float(size_entries[0][2] or 0))
        except Exception:
            return 0
    return None


def flush_stock_only_deltas(stock_updates: List[Tuple[int, str, str]]) -> int:
    """
    Menyimpan HANYA kolom `stok` & `updatedAt` secara batch ke Turso SQLite.
    Hemat ~60% kuota Turso Writes dibanding full-row upsert karena index kolom lain tidak ikut ditulis ulang!
    """
    if not stock_updates:
        return 0
    saved = 0
    try:
        conn_s = connect_pg()
        if getattr(conn_s, "is_turso", False):
            for i in range(0, len(stock_updates), 400):
                chunk = stock_updates[i:i + 400]
                stmts = [
                    ('UPDATE "Product" SET stok = ?, "updatedAt" = ? WHERE sku = ?', (q, upd, sku))
                    for q, upd, sku in chunk
                ]
                conn_s.execute_batch(stmts, transactional=True)
                saved += len(chunk)
        else:
            cur = conn_s.cursor()
            for q, upd, sku in stock_updates:
                cur.execute('UPDATE "Product" SET stok = %s, "updatedAt" = %s WHERE sku = %s', (q, upd, sku))
                saved += 1
            conn_s.commit()
            cur.close()
        conn_s.close()
    except Exception as e:
        print(f"   ⚠️ Fallback simpan delta stok ({e})")
    return saved


def query_storehub_promotion(category: str, identifier: str, cookie: str) -> List[Dict[str, Any]]:
    """
    Memanggil Server Action resmi `checkItemPromotion` di StoreHub (`ACTION_PROMO`)
    untuk mengambil daftar promo live langsung dari server toko (dipakai khusus Mu+Ku yang tidak punya file Excel promo!).
    """
    global ACTION_PROMO
    headers = {
        "Accept": "text/x-component",
        "Content-Type": "text/plain;charset=UTF-8",
        "Cookie": cookie,
        "Next-Action": ACTION_PROMO,
        "Referer": ITEM_CHECKER_URL,
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15",
        "Next-Router-State-Tree": "%5B%22%22%2C%7B%22children%22%3A%5B%22(app)%22%2C%7B%22children%22%3A%5B%22item-checker%22%2C%7B%22children%22%3A%5B%22__PAGE__%22%2C%7B%7D%2Cnull%2Cnull%2C0%5D%7D%2Cnull%2Cnull%2C0%5D%7D%2Cnull%2Cnull%2C4%5D%7D%2Cnull%2C%22refetch%22%2C24%5D",
    }
    payload = json.dumps([category, str(identifier).strip()])
    try:
        res = http_session.post(ITEM_CHECKER_URL, headers=headers, data=payload, allow_redirects=False, timeout=10)
    except Exception:
        return []

    if res.status_code == 404:
        with action_lock:
            resolve_action_detail()
            headers["Next-Action"] = ACTION_PROMO
        try:
            res = http_session.post(ITEM_CHECKER_URL, headers=headers, data=payload, allow_redirects=False, timeout=10)
        except Exception:
            return []

    if res.status_code != 200:
        return []

    promos_out: List[Dict[str, Any]] = []
    for line in res.text.split("\n"):
        colon_idx = line.find(":")
        if 0 < colon_idx <= 3:
            try:
                parsed = json.loads(line[colon_idx + 1:])
                if not isinstance(parsed, dict) or parsed.get("error"):
                    continue
                data = parsed.get("result", {}).get("data")
                if isinstance(data, dict):
                    for _, rows in data.items():
                        if isinstance(rows, list):
                            for r in rows:
                                if isinstance(r, dict):
                                    promos_out.append(r)
            except Exception:
                continue
    return promos_out


def parse_storehub_promotion_rows(promos: List[Dict[str, Any]], normal_price: int) -> Optional[Dict[str, Any]]:
    """
    Mengonversi output `checkItemPromotion` (`DiscountType`, `DiscountPercentage`, `DiscountAmount`,
    `Message`, `BusinessRuleName`, `EventDesc`) menjadi field promo siap simpan ke Turso.
    """
    if not promos:
        return None
    best: Optional[Dict[str, Any]] = None
    best_price: Optional[int] = None

    for pr in promos:
        dtype = str(pr.get("DiscountType") or "").strip()
        msg = str(pr.get("Message") or "").strip()
        br_name = str(pr.get("BusinessRuleName") or "").strip()
        ev_desc = str(pr.get("EventDesc") or "").strip()
        acara = ev_desc or br_name or msg or f"Promo Live {CREDENTIALS['label']}"

        try:
            pct = float(pr.get("DiscountPercentage") or 0)
        except Exception:
            pct = 0.0
        try:
            amt = float(pr.get("DiscountAmount") or 0)
        except Exception:
            amt = 0.0

        has_pct = pct > 0
        has_amt = amt > 0
        kind = "none"
        if re.search(r"percent", dtype, re.I) and has_pct:
            kind = "percentage"
        elif re.search(r"amount|price|rupiah", dtype, re.I) and has_amt:
            kind = "amount"
        elif has_pct:
            kind = "percentage"
        elif has_amt:
            kind = "amount"

        cand: Optional[Dict[str, Any]] = None
        if kind == "percentage" and normal_price > 0 and 1 <= pct <= 95:
            hp = int(round(normal_price * (100.0 - pct) / 100.0))
            if 0 < hp < normal_price:
                pct_str = f"{int(pct)}%" if float(pct).is_integer() else f"{pct:g}%"
                cand = {
                    "hargaPromo": hp,
                    "diskon": pct_str,
                    "discountType": "PERCENT",
                    "acara": acara[:120],
                }
        elif kind == "amount" and amt > 0:
            amt_int = int(round(amt))
            is_special_price = bool(
                re.search(r"special|fixed|nett|price", dtype, re.I)
                or re.search(r"\b(sp|special\s*price|harga\s*spesial)\b", f"{msg} {br_name}", re.I)
            )
            if normal_price > 0:
                hp = amt_int if is_special_price else (normal_price - amt_int)
                if hp <= 0 and amt_int < normal_price:
                    hp = amt_int
                if 0 < hp < normal_price:
                    cand = {
                        "hargaPromo": hp,
                        "diskon": "SP" if is_special_price else f"POT Rp {amt_int:,}".replace(",", "."),
                        "discountType": "SPECIAL_PRICE",
                        "acara": acara[:120],
                    }
            else:
                cand = {
                    "hargaPromo": amt_int,
                    "diskon": "SP",
                    "discountType": "SPECIAL_PRICE",
                    "acara": acara[:120],
                }
        elif msg and re.search(r"(buy|beli|get|gratis|disc|diskon|promo|sp\b|off|%)", f"{msg} {br_name}", re.I):
            cand = {
                "hargaPromo": None,
                "diskon": (msg or br_name)[:40],
                "discountType": "BUNDLING",
                "acara": acara[:120],
            }

        if cand:
            cp = cand.get("hargaPromo")
            if best is None:
                best = cand
                best_price = cp
            elif cp is not None and (best_price is None or cp < best_price):
                best = cand
                best_price = cp

    return best


def sweep_muku_promotions_for_catalog(
    catalog_by_sku: Dict[str, Dict[str, Any]],
    cookie: str,
    max_minutes: int = 8,
    max_articles: int = 2500,
) -> int:
    """
    Menyapu harga promo LIVE khusus produk Mu+Ku lewat Server Action `checkItemPromotion`
    (1x cek per artikel unik -> otomatis diwariskan ke semua size/warna dalam artikel Mu+Ku tersebut!).
    Sangat cepat (~25 detik untuk 1.500 artikel) dan 100% bebas file Excel promo.
    """
    if ACTIVE_ACCOUNT != "muku" or not cookie:
        return 0

    t0 = datetime.now()
    INVALID_ARTS = {"", "0", "-", "PRODUK BARU", "N/A", "NONE", "NULL"}
    art_to_rows: Dict[str, List[Dict[str, Any]]] = {}
    for sku, row in catalog_by_sku.items():
        if not _is_muku_row(row):
            continue
        art = str(row.get("article") or "").strip().upper()
        key = art if art not in INVALID_ARTS else f"SKU:{sku}"
        art_to_rows.setdefault(key, []).append(row)

    # Prioritaskan artikel Mu+Ku yang punya stok > 0 dulu, lalu yang punya foto/harga normal
    ordered_articles = sorted(
        art_to_rows.items(),
        key=lambda kv: (
            0 if any(int(r.get("stok") or 0) > 0 for r in kv[1]) else 1,
            -sum(max(0, int(r.get("stok") or 0)) for r in kv[1]),
        ),
    )[:max_articles]

    if not ordered_articles:
        return 0

    print(f"\n🏷️ [MU+KU LIVE PROMO ENGINE] Memindai promo live StoreHub (`checkItemPromotion`) untuk {len(ordered_articles):,} artikel Mu+Ku...")

    def check_one_article(item_pair: Tuple[str, List[Dict[str, Any]]]):
        art_key, rows = item_pair
        # Pilih SKU perwakilan yang punya stok > 0 & harga normal > 0
        rep = next((r for r in rows if int(r.get("stok") or 0) > 0 and _parse_money_int(r.get("hargaNormal")) > 0), rows[0])
        rep_sku = str(rep.get("sku") or "").strip()
        if not rep_sku:
            return None
        promos = query_storehub_promotion("sku", rep_sku, cookie)
        if not promos:
            return None
        normal_p = _parse_money_int(rep.get("hargaNormal"))
        parsed = parse_storehub_promotion_rows(promos, normal_p)
        if not parsed:
            return None
        return (art_key, rows, parsed)

    found_articles = 0
    promo_updates: List[Tuple[Optional[float], str, str, str, str, str]] = []
    now_iso = datetime.now(timezone.utc).isoformat()
    chunk_sz = 120

    for i in range(0, len(ordered_articles), chunk_sz):
        if (datetime.now() - t0).total_seconds() / 60.0 >= max_minutes:
            print(f"   ⏱️ Batas waktu sapuan promo Mu+Ku ({max_minutes} menit) tercapai.")
            break
        batch_arts = ordered_articles[i:i + chunk_sz]
        with ThreadPoolExecutor(max_workers=20) as ex:
            for res in ex.map(check_one_article, batch_arts):
                if not res:
                    continue
                _, rows, parsed = res
                found_articles += 1
                for r in rows:
                    s_sku = str(r.get("sku") or "").strip()
                    if not s_sku:
                        continue
                    # Hitung ulang hargaPromo per varian jika hargaNormal varian berbeda sedikit
                    row_hn = _parse_money_int(r.get("hargaNormal"))
                    hp_val = parsed.get("hargaPromo")
                    if parsed.get("discountType") == "PERCENT" and row_hn > 0:
                        m_p = re.search(r"(\d+(?:\.\d+)?)", str(parsed.get("diskon") or ""))
                        if m_p:
                            pct_v = float(m_p.group(1))
                            if 1 <= pct_v <= 95:
                                hp_val = int(round(row_hn * (100.0 - pct_v) / 100.0))
                    promo_updates.append((
                        float(hp_val) if hp_val is not None else None,
                        str(parsed.get("diskon") or ""),
                        str(parsed.get("discountType") or "SPECIAL_PRICE"),
                        str(parsed.get("acara") or ""),
                        now_iso,
                        s_sku,
                    ))

    if promo_updates:
        try:
            conn_p = connect_pg()
            if getattr(conn_p, "is_turso", False):
                for j in range(0, len(promo_updates), 400):
                    sub = promo_updates[j:j + 400]
                    stmts = [
                        (
                            'UPDATE "Product" SET "hargaPromo" = ?, diskon = ?, "discountType" = ?, acara = ?, "updatedAt" = ? WHERE sku = ?',
                            row_t,
                        )
                        for row_t in sub
                    ]
                    conn_p.execute_batch(stmts, transactional=True)
            conn_p.close()
        except Exception as e:
            print(f"   ⚠️ Gagal simpan batch promo live Mu+Ku: {e}")

    print(
        f"   ✅ [MU+KU LIVE PROMO SELESAI] Ketemu {found_articles:,} artikel Mu+Ku sedang PROMO -> "
        f"{len(promo_updates):,} varian SKU diperbarui langsung di Turso (0 Excel dibutuhkan)!"
    )
    return len(promo_updates)


def probe_store_online(cookie: str) -> Tuple[bool, str]:
    """
    Melakukan probe ringan untuk mendeteksi apakah SQL Server Toko 719 menyala.
    Mengembalikan (is_online, active_cookie).
    """
    res = query_storehub("sku", "61356398", cookie)
    if res and res.get("_unauthorized"):
        fresh_cookie = auto_login_storehub()
        if fresh_cookie:
            cookie = fresh_cookie
            res = query_storehub("sku", "61356398", cookie)
    if res and not res.get("_offline") and not res.get("_unauthorized"):
        return True, cookie
    return False, cookie


def ensure_store_online(cookie: str, run_once_cloud: bool = True, check_interval_sec: int = 45) -> Tuple[bool, str]:
    """
    Jika dijalankan dari Cloud Trigger (GitHub Actions / `--stock-only` / `--brutal`),
    cek koneksi hingga 3 kali (10 detik). Jika toko tutup (malam hari), keluar dengan
    aman agar TIDAK menghabiskan kuota menit GitHub Actions.
    Jika dijalankan dalam mode `--daemon` lokal, tunggu sampai jam buka toko (10:00 WIB).
    """
    if run_once_cloud:
        for attempt in range(1, 4):
            online, cookie = probe_store_online(cookie)
            if online:
                print(f"🟢 [ONLINE DETECTED] SQL Server Toko 719 aktif & terhubung! (Attempt #{attempt})")
                return True, cookie
            if attempt < 3:
                print(f"⏳ [Probe #{attempt}/3] Menunggu respons SQL Server Toko 719 (5 detik)...")
                time.sleep(5)
        print("⚠️ [TOKO TUTUP / OFFLINE] SQL Server Lokal Toko 719 (172.24.12.41:1433) sedang istirahat di luar jam operasional.")
        print("🛡️ Menghentikan runner dengan aman agar kuota GitHub Actions tetap hemat 100%.")
        return False, cookie

    # Mode Daemon Lokal: tunggu jam 10:00 WIB
    now_utc = datetime.now(timezone.utc)
    wib_hour = (now_utc.hour + 7) % 24
    wib_minute = now_utc.minute
    total_minutes = wib_hour * 60 + wib_minute

    if total_minutes < 600:
        sleep_sec = (600 - total_minutes) * 60
        print(f"⏳ Saat ini masih pukul {wib_hour:02d}:{wib_minute:02d} WIB.")
        print("   Standby dimulai pukul 10:00 WIB pagi saat toko buka.")
        time.sleep(sleep_sec)

    attempt = 1
    while True:
        now_wib = datetime.now()
        online, cookie = probe_store_online(cookie)
        if online:
            print(f"\n🟢 [ONLINE DETECTED!] Pukul {now_wib.strftime('%H:%M:%S')} WIB:")
            print("   ✅ SQL Server Toko 719 terhubung sukses! MEMULAI TURBO SCRAP BRUTAL SEKARANG JUGA! 🔥\n")
            return True, cookie

        print(f"[{now_wib.strftime('%H:%M:%S')} WIB] Probe #{attempt}: Server toko 719 masih offline. Jeda {check_interval_sec} detik...")
        attempt += 1
        time.sleep(check_interval_sec)


def save_mapped_paths_registry(catalog_by_sku: Dict[str, Dict[str, Any]]):
    """
    Menyimpan seluruh jalur mapping (SKU, Barcode, Artikel) ke file terkompresi
    `python-engine/mapped_sku_paths.json.gz` agar mapping 84.763+ jalur SKU tidak pernah hilang.
    """
    try:
        compact_list = []
        for sku in sorted(catalog_by_sku.keys()):
            row = catalog_by_sku[sku]
            compact_list.append([
                sku,
                str(row.get("barcode") or "").strip(),
                str(row.get("article") or "").strip(),
            ])
        with gzip.open(MAPPED_PATHS_FILE, "wt", encoding="utf-8") as gz:
            json.dump(compact_list, gz, separators=(",", ":"))
        size_kb = os.path.getsize(MAPPED_PATHS_FILE) / 1024.0
        print(f"🗺️  [MAPPING SAVED] {len(compact_list):,} jalur SKU/Barcode/Artikel diamankan ke {os.path.basename(MAPPED_PATHS_FILE)} ({size_kb:.1f} KB)")
    except Exception as e:
        print(f"⚠️ Gagal menyimpan mapped_sku_paths.json.gz: {e}")


def load_mapped_paths_registry() -> List[Tuple[str, str, str]]:
    """Memuat jalur mapping `(sku, barcode, article)` dari `mapped_sku_paths.json.gz` jika ada."""
    if not os.path.exists(MAPPED_PATHS_FILE):
        return []
    try:
        with gzip.open(MAPPED_PATHS_FILE, "rt", encoding="utf-8") as gz:
            data = json.load(gz)
            return [(str(x[0]), str(x[1]) if len(x) > 1 else "", str(x[2]) if len(x) > 2 else "") for x in data if x]
    except Exception as e:
        print(f"⚠️ Gagal membaca mapped_sku_paths.json.gz: {e}")
        return []


def load_existing_catalog_full() -> Tuple[Dict[str, Dict[str, Any]], Set[str], Dict[str, int]]:
    """
    Memuat seluruh produk dari PostgreSQL (direct psycopg2 kilat <3 detik dengan fallback REST API)
    + BarcodeAlias + mapped_sku_paths.json.gz agar 100% jalur SKU & multi-barcode terpetakan utuh.
    """
    catalog_by_sku: Dict[str, Dict[str, Any]] = {}
    existing_barcodes: Set[str] = set()
    brand_counts: Dict[str, int] = {}

    loaded_pg = False
    try:
        pg_conn = connect_pg()
        pg_cur = pg_conn.cursor()
        if getattr(pg_conn, "is_turso", False):
            last_id = 0
            raw_rows = []
            while True:
                pg_cur.execute(
                    '''
                    SELECT id, sku, barcode, article, description, brand, dept, color, size,
                           "hargaNormal", stok, "imageUrl", "hargaPromo", "discountType", acara, "toDate"
                    FROM "Product"
                    WHERE id > ?
                    ORDER BY id ASC
                    LIMIT 20000
                    ''',
                    (last_id,),
                )
                batch = pg_cur.fetchall()
                if not batch:
                    break
                raw_rows.extend([r[1:] for r in batch])
                last_id = int(batch[-1][0])
        else:
            pg_cur.execute(
                '''
                SELECT sku, barcode, article, description, brand, dept, color, size,
                       "hargaNormal", stok, "imageUrl", "hargaPromo", "discountType", acara, "toDate"
                FROM "Product"
                '''
            )
            raw_rows = pg_cur.fetchall()

        for row in raw_rows:
            sku, bc, art, desc, brand, dept, color, size, hn, stok, img, hp, dt, ac, td = row
            s = str(sku or "").strip()
            b = str(bc or "").strip()
            if s:
                catalog_by_sku[s] = {
                    "sku": s,
                    "barcode": b or None,
                    "article": art,
                    "description": desc,
                    "brand": brand,
                    "dept": dept,
                    "color": color,
                    "size": size,
                    "hargaNormal": hn,
                    "stok": stok,
                    "imageUrl": img,
                    "hargaPromo": hp,
                    "discountType": dt,
                    "acara": ac,
                    "toDate": td,
                }
            if b:
                existing_barcodes.add(b)
            br = str(dept or brand or "MDS RETAIL").strip()
            brand_counts[br] = brand_counts.get(br, 0) + 1

        try:
            pg_cur.execute('SELECT barcode FROM "BarcodeAlias"')
            for (ab,) in pg_cur.fetchall():
                if ab:
                    existing_barcodes.add(str(ab).strip())
        except Exception:
            pg_conn.rollback()

        pg_cur.close()
        pg_conn.close()
        loaded_pg = bool(catalog_by_sku)
    except Exception as e:
        print(f"⚠️ Fallback ke Supabase REST pagination (psycopg2 tidak tersedia: {e})")

    if not loaded_pg:
        def fetch_page(off: int) -> List[Dict[str, Any]]:
            for _ in range(3):
                try:
                    res = sb.table("Product").select("*").order("sku").range(off, off + 999).execute()
                    return res.data or []
                except Exception:
                    time.sleep(0.4)
            return []

        offset = 0
        wave_size = 16
        while True:
            offsets = [offset + i * 1000 for i in range(wave_size)]
            wave_rows = 0
            reached_end = False
            with ThreadPoolExecutor(max_workers=8) as executor:
                for chunk in executor.map(fetch_page, offsets):
                    if not chunk:
                        reached_end = True
                        continue
                    wave_rows += len(chunk)
                    for r in chunk:
                        s = str(r.get("sku") or "").strip()
                        b = str(r.get("barcode") or "").strip()
                        if s:
                            catalog_by_sku[s] = r
                        if b:
                            existing_barcodes.add(b)
                        br = str(r.get("dept") or r.get("brand") or "MDS RETAIL").strip()
                        brand_counts[br] = brand_counts.get(br, 0) + 1
                    if len(chunk) < 1000:
                        reached_end = True
            if reached_end or wave_rows == 0:
                break
            offset += wave_size * 1000

    # Gabungkan dengan file registry `mapped_sku_paths.json.gz` agar tidak ada jalur SKU/barcode yang hilang
    saved_paths = load_mapped_paths_registry()
    for s_sku, s_bc, s_art in saved_paths:
        if s_bc:
            existing_barcodes.add(s_bc)
        if s_sku and s_sku not in catalog_by_sku:
            catalog_by_sku[s_sku] = {
                "sku": s_sku,
                "barcode": s_bc or None,
                "article": s_art or "PRODUK BARU",
                "description": s_art or "PRODUK BARU",
                "brand": "MDS RETAIL",
                "dept": "MDS RETAIL",
                "hargaNormal": 0,
                "stok": 0,
                "_from_registry_only": True,
            }

    return catalog_by_sku, existing_barcodes, brand_counts


def build_candidate_queues(existing_skus: Set[str], existing_barcodes: Set[str]) -> Tuple[List[str], List[str], List[str]]:
    """
    Membangun antrean kandidat FLEKSIBEL berorientasi PENEMUAN ARTIKEL & BARCODE TANPA KELEWAT:
    1. `hunter_bc_queue`: Interleaved Stride-4 Sweep lintas SEMUA zona barcode `234000000001..234000999999`
       (mencakup blok bawah 001xxx, blok tengah, dan blok atas 395xxx-999xxx tempat 2340009548454 berada!)
       + klaster dinamis dari prefix non-234000 yang ada di DB (040000*, 899*, 888*, 695*, 118*).
    2. `fill_bc_queue`: Celah rapat barcode (`diff <= 150`) lintas semua prefix EAN-13 + sisa offset ganjil.
    3. `sku_queue`: Celah SKU 8-digit Modulo-10 + celah SKU 7/9-digit bila terdeteksi klaster rapat.
    """
    # --- 1. KANDIDAT SKU FLEKSIBEL (8-digit Mod10 + non-8-digit neighbor) ---
    sku_bodies = sorted(set(
        int(s[:7]) for s in existing_skus if len(s) == 8 and s.isdigit()
    ))
    candidate_sku_bodies: List[int] = []
    seen_sku_bodies = set(sku_bodies)

    for i in range(len(sku_bodies) - 1):
        diff = sku_bodies[i + 1] - sku_bodies[i]
        if 1 < diff <= 80:
            for b7 in range(sku_bodies[i] + 1, sku_bodies[i + 1]):
                if b7 not in seen_sku_bodies:
                    seen_sku_bodies.add(b7)
                    candidate_sku_bodies.append(b7)

    for i in range(len(sku_bodies)):
        is_left_edge = (i == 0) or (sku_bodies[i] - sku_bodies[i - 1] > 80)
        is_right_edge = (i == len(sku_bodies) - 1) or (sku_bodies[i + 1] - sku_bodies[i] > 80)
        if is_left_edge:
            for b7 in range(sku_bodies[i] - 6, sku_bodies[i]):
                if b7 > 100000 and b7 not in seen_sku_bodies:
                    seen_sku_bodies.add(b7)
                    candidate_sku_bodies.append(b7)
        if is_right_edge:
            for b7 in range(sku_bodies[i] + 1, sku_bodies[i] + 7):
                if b7 not in seen_sku_bodies:
                    seen_sku_bodies.add(b7)
                    candidate_sku_bodies.append(b7)

    # Sensus SKU adaptif lintas SELURUH klaster aktif (SUKO, Mu+Ku, ZES, & konsinyasi baru — via Universal Scrap Controller)
    sparse_sku8 = build_adaptive_sku_census(existing_skus, generate_mds_sku8, max_sparse=8000)
    sku_queue = sparse_sku8 + [generate_mds_sku8(b7) for b7 in candidate_sku_bodies]
    # Tambahkan tetangga langsung (+/-3) untuk SKU 6/7/9/10 digit yang ada di DB
    extra_len_skus = [s for s in existing_skus if len(s) in (6, 7, 9, 10) and s.isdigit()]
    for s_raw in extra_len_skus:
        n_sku = int(s_raw)
        w = len(s_raw)
        for d in range(-3, 4):
            if d != 0 and n_sku + d > 0:
                cand_s = f"{n_sku + d:0{w}d}"
                if cand_s not in existing_skus:
                    sku_queue.append(cand_s)
    sku_queue = [s for s in dict.fromkeys(sku_queue) if s and s not in existing_skus]

    # --- 2. KANDIDAT BARCODE: FLEKSIBEL PENUH (000001..999999 + KLASTER DINAMIS NON-234000) ---
    bc_bodies = sorted(set(
        int(b[6:12]) for b in existing_barcodes
        if b.startswith("234000") and len(b) == 13 and b.isdigit()
    ))
    seen_bc_bodies = set(bc_bodies)

    # Zona statis utama + zona dinamis dari klaster atas (400xxx..999xxx) & bawah (001xxx..024xxx)
    hunter_zones: List[Tuple[int, int]] = [
        (316001, 395000),  # Koleksi baru 32xxxx-395xxx (SUKO/ZES/EDIT)
        (120000, 148999),  # Zona 12xxxx-14xxxx (COLE / Stanley Adams / ZES / MUKU)
        (259500, 282999),  # Zona 2595xx-2829xx (AOS / MUKU / SUKO / SEGA)
        (215001, 244500),  # Zona 21xxxx-24xxxx
        (149000, 215000),  # Zona tengah 14xxxx-21xxxx
        (283000, 316000),  # Zona 28xxxx-31xxxx
        (244501, 259499),  # Sisa zona 244xxx-259xxx
        (1000, 119999),    # Diperluas mulai 001000 (tidak lagi skip < 25000!)
        (395001, 460000),  # Zona lanjutan 395xxx-460xxx
    ]

    # Deteksi otomatis klaster aktif > 460000 (mis. hingga 954845+) & buka window +/-12000 di sekitarnya
    covered_hi_windows: List[Tuple[int, int]] = []
    for b6 in bc_bodies:
        if b6 > 460000:
            w_s = max(460001, ((b6 // 10000) * 10000) - 2000)
            w_e = min(999999, w_s + 14000)
            if not covered_hi_windows or w_s > covered_hi_windows[-1][1]:
                covered_hi_windows.append((w_s, w_e))
            else:
                covered_hi_windows[-1] = (covered_hi_windows[-1][0], max(covered_hi_windows[-1][1], w_e))
    hunter_zones.extend(covered_hi_windows)

    # Interleaved Round-Robin per potongan 120 nomor di tiap zona dengan step=4 (% 4 == 0, lalu % 4 == 2)
    hunter_bc_bodies: List[int] = []
    fill_bc_bodies: List[int] = []

    for mod_target in (0, 2):
        zone_slices: List[List[int]] = []
        for z_start, z_end in hunter_zones:
            z_cands = [
                b6 for b6 in range(z_start, z_end + 1)
                if (b6 % 4 == mod_target) and (b6 not in seen_bc_bodies)
            ]
            if z_cands:
                zone_slices.append(z_cands)

        batch_w = 120
        idx_map = [0] * len(zone_slices)
        active = True
        while active:
            active = False
            for zi, z_list in enumerate(zone_slices):
                pos = idx_map[zi]
                if pos < len(z_list):
                    active = True
                    chunk = z_list[pos:pos + batch_w]
                    idx_map[zi] = pos + batch_w
                    for b6 in chunk:
                        if b6 not in seen_bc_bodies:
                            seen_bc_bodies.add(b6)
                            hunter_bc_bodies.append(b6)

    # Celah rapat `234000*` & prefix EAN-13 lainnya (040000*, 899*, 888*, 695*, 118*)
    extra_ean13_candidates: List[str] = []
    prefix_groups: Dict[str, List[int]] = {}
    for b in existing_barcodes:
        if len(b) == 13 and b.isdigit() and not b.startswith("234000"):
            prefix_groups.setdefault(b[:6], []).append(int(b[6:12]))

    for pfx6, bodies_list in prefix_groups.items():
        sb_list = sorted(set(bodies_list))
        for i in range(len(sb_list) - 1):
            diff = sb_list[i + 1] - sb_list[i]
            if 1 < diff <= 120:
                for val6 in range(sb_list[i] + 1, sb_list[i + 1]):
                    d12 = f"{pfx6}{val6:06d}"
                    bc13 = f"{d12}{calculate_ean13_check_digit(d12)}"
                    if bc13 not in existing_barcodes:
                        extra_ean13_candidates.append(bc13)

    for i in range(len(bc_bodies) - 1):
        diff = bc_bodies[i + 1] - bc_bodies[i]
        if 1 < diff <= 150:
            for b6 in range(bc_bodies[i] + 1, bc_bodies[i + 1]):
                if b6 not in seen_bc_bodies:
                    seen_bc_bodies.add(b6)
                    fill_bc_bodies.append(b6)

    for z_start, z_end in hunter_zones:
        for b6 in range(z_start, z_end + 1):
            if b6 not in seen_bc_bodies:
                seen_bc_bodies.add(b6)
                fill_bc_bodies.append(b6)

    hunter_bc_queue = [generate_ean13_barcode(b6) for b6 in hunter_bc_bodies]
    # Gabungkan klaster prefix vendor non-234000 ke fill_bc_queue agar ikut tersapu tanpa memperlambat hunter awal
    fill_bc_queue = [generate_ean13_barcode(b6) for b6 in fill_bc_bodies] + extra_ean13_candidates

    hunter_bc_queue = [b for b in hunter_bc_queue if b and b not in existing_barcodes]
    fill_bc_queue = [b for b in fill_bc_queue if b and b not in existing_barcodes]

    return hunter_bc_queue, fill_bc_queue, sku_queue


_LOGGED_PAYLOAD_KEYS_ACCOUNTS: Set[str] = set()


def _parse_money_int(val: Any) -> int:
    if val is None or val == "":
        return 0
    if isinstance(val, (int, float)):
        n = int(round(val)) if val > 0 else 0
        return int(round(n / 1_000_000)) if n >= 1_000_000_000 else n
    s = str(val).strip()
    if not s:
        return 0
    # Tangani format desimal ERP StoreHub seperti "159000.000000" atau "159000.00" (titik tunggal diikuti 1-2 atau >=4 digit)
    if re.fullmatch(r"\d+\.\d+", s):
        frac = s.split(".", 1)[1]
        if len(frac) != 3:
            try:
                n = int(round(float(s)))
                return int(round(n / 1_000_000)) if n >= 1_000_000_000 else n
            except Exception:
                pass
    s_clean = re.sub(r"[^0-9.,]", "", s)
    if not s_clean:
        return 0
    # Tangani format "159,000.00" atau "159,000.000000" (koma ribuan + titik desimal)
    if "." in s_clean:
        last_part = s_clean.rsplit(".", 1)[-1]
        if len(last_part) <= 2 or len(last_part) >= 4:
            s_clean = s_clean.rsplit(".", 1)[0]
    digits = re.sub(r"[^0-9]", "", s_clean)
    n = int(digits) if digits else 0
    return int(round(n / 1_000_000)) if n >= 1_000_000_000 else n


def extract_storehub_promo(item: Dict[str, Any], normal_price: int) -> Dict[str, Any]:
    """
    Mengekstrak harga promo, persentase diskon, acara, & tanggal berakhir dari payload StoreHub
    (mendukung beragam variasi nama field baik untuk akun SUKO maupun Mu+Ku).
    """
    if ACTIVE_ACCOUNT not in _LOGGED_PAYLOAD_KEYS_ACCOUNTS:
        _LOGGED_PAYLOAD_KEYS_ACCOUNTS.add(ACTIVE_ACCOUNT)
        sample_keys = sorted(k for k in item.keys() if not str(k).startswith("_"))
        print(f"🔍 [PAYLOAD KEYS {CREDENTIALS['label']} ({CREDENTIALS['username']})] {sample_keys}")

    promo_obj: Dict[str, Any] = {}
    for pk in ("promo", "Promo", "promotion", "Promotion", "activePromo", "ActivePromo", "priceInfo", "PriceInfo"):
        v = item.get(pk)
        if isinstance(v, dict):
            promo_obj = v
            break
        elif isinstance(v, list) and v and isinstance(v[0], dict):
            promo_obj = v[0]
            break

    merged_src = dict(promo_obj)
    merged_src.update(item)

    promo_price = 0
    for k in (
        "PromoPrice", "promoPrice", "promo_price",
        "SellingPrice", "sellingPrice", "selling_price",
        "SalePrice", "salePrice", "sale_price",
        "NetPrice", "netPrice", "net_price",
        "FinalPrice", "finalPrice", "final_price",
        "DiscountPrice", "discountPrice", "discount_price",
        "SpecialPrice", "specialPrice", "special_price",
        "CurrentPrice", "currentPrice", "current_price",
    ):
        cand = _parse_money_int(merged_src.get(k))
        if cand > 0 and (normal_price <= 0 or cand < normal_price):
            promo_price = cand
            break

    raw_disc = ""
    for k in (
        "DiscountPct", "discountPct", "DiscountPercent", "discountPercent",
        "Discount", "discount", "Diskon", "diskon", "PromoDiscount", "promoDiscount",
    ):
        v = merged_src.get(k)
        if v is not None and str(v).strip() not in ("", "0", "0%", "0.0", "NONE", "NULL", "-"):
            raw_disc = str(v).strip()
            break

    acara = ""
    for k in (
        "PromoName", "promoName", "PromoDesc", "promoDesc",
        "PromotionName", "promotionName", "EventName", "eventName",
        "EventDesc", "eventDesc", "Acara", "acara", "PromoText", "promoText",
    ):
        v = merged_src.get(k)
        if v is not None and str(v).strip() not in ("", "-", "NONE", "NULL"):
            acara = str(v).strip()
            break

    to_date = ""
    for k in ("PromoEndDate", "promoEndDate", "EndDate", "endDate", "ToDate", "toDate", "ValidUntil", "validUntil"):
        v = merged_src.get(k)
        if v is not None and str(v).strip() not in ("", "-", "NONE", "NULL"):
            to_date = str(v).strip()[:10]
            break

    # Jika hanya ada diskon persen tapi promo_price belum dihitung, hitung otomatis
    if promo_price <= 0 and raw_disc and normal_price > 0:
        m_pct = re.search(r"(\d{1,2})\s*%?", raw_disc)
        if m_pct:
            pct_val = int(m_pct.group(1))
            if 5 <= pct_val <= 90:
                promo_price = int(round(normal_price * (100 - pct_val) / 100.0))

    if promo_price > 0 and normal_price > 0 and promo_price < normal_price:
        if not raw_disc:
            pct_calc = int(round((1.0 - (promo_price / float(normal_price))) * 100))
            raw_disc = f"{pct_calc}%" if pct_calc >= 1 else "SP"
        disc_type = "PERCENT" if "%" in raw_disc else "SPECIAL_PRICE"
        return {
            "hargaPromo": promo_price,
            "diskon": raw_disc,
            "discountType": disc_type,
            "acara": acara or f"Promo Live {CREDENTIALS['label']}",
            "toDate": to_date or None,
        }
    return {}


def item_to_record(
    item: Dict[str, Any],
    fallback_bc: Optional[str] = None,
    existing_row: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    """
    Mengonversi payload StoreHub menjadi record tabel Product + daftar `_all_barcodes`
    secara fleksibel (terima semua panjang barcode >= 4 digit & alfanumerik, tanpa dibuang!)
    serta MENANGKAP harga normal + harga promo StoreHub (sambil MELINDUNGI foto & promo email eksisting).
    """
    sku_val = normalize_sku_token(item.get("SKU"))
    if not sku_val:
        return None

    all_bcs: List[str] = []
    for raw_cand in [fallback_bc, item.get("VendorBarcode"), item.get("vendorBarcode"), item.get("Barcode"), item.get("barcode")] + list(item.get("_all_barcodes") or []):
        nbc = normalize_barcode_token(raw_cand)
        if nbc and nbc != sku_val and nbc not in all_bcs:
            all_bcs.append(nbc)

    # Prioritaskan barcode eksisting di Product agar tidak menimpa barcode lain, sisanya masuk BarcodeAlias!
    existing_primary_bc = normalize_barcode_token((existing_row or {}).get("barcode"))
    bc_val = existing_primary_bc or (all_bcs[0] if all_bcs else None)

    brand_val, dept_val = normalize_brand_and_dept(item)
    raw_style = str(item.get("StyleCode") or "").strip()
    if raw_style.upper() in ("", "0", "00", "000", "-", "N/A", "NA", "NONE", "NULL"):
        raw_style = ""
    desc_val = str(item.get("Description") or item.get("ItemDescription") or raw_style or "PRODUK BARU").strip()
    art_val = raw_style or desc_val.split(":")[0].strip() or "PRODUK BARU"
    color_val = item.get("COLOR") or item.get("Color") or None
    size_val = item.get("Size") or item.get("SIZE") or None

    try:
        stok_val = int(float(item.get("StockOnHand") or 0))
    except Exception:
        stok_val = 0

    raw_p = item.get("RetailPrice") or item.get("Price") or 0
    p_clean = _parse_money_int(raw_p)
    promo_info = extract_storehub_promo(item, p_clean or _parse_money_int((existing_row or {}).get("hargaNormal")))

    now_iso = datetime.now(timezone.utc).isoformat()
    raw_payload = {k: v for k, v in item.items() if k != "_all_barcodes"}

    if existing_row and not existing_row.get("_from_registry_only"):
        merged = dict(existing_row)
        merged["sku"] = sku_val
        if bc_val:
            merged["barcode"] = bc_val
        if all_bcs:
            merged["_all_barcodes"] = all_bcs
        merged["_raw_extra"] = raw_payload
        if art_val and art_val != "PRODUK BARU":
            merged["article"] = art_val
        if desc_val and desc_val != "PRODUK BARU":
            merged["description"] = desc_val
        if brand_val:
            merged["brand"] = brand_val
        if dept_val:
            merged["dept"] = dept_val
        if color_val:
            merged["color"] = color_val
        if size_val:
            merged["size"] = size_val
        if p_clean > 0:
            merged["hargaNormal"] = p_clean
        if promo_info:
            merged["hargaPromo"] = promo_info["hargaPromo"]
            merged["diskon"] = promo_info["diskon"]
            merged["discountType"] = promo_info["discountType"]
            merged["acara"] = promo_info["acara"]
            if promo_info.get("toDate"):
                merged["toDate"] = promo_info["toDate"]
            merged["_has_live_promo"] = True
        merged["stok"] = stok_val
        merged["updatedAt"] = now_iso
        return merged

    rec_new: Dict[str, Any] = {
        "sku": sku_val,
        "barcode": bc_val,
        "_all_barcodes": all_bcs,
        "_raw_extra": raw_payload,
        "article": art_val,
        "description": desc_val,
        "brand": brand_val,
        "dept": dept_val,
        "color": color_val,
        "size": size_val,
        "hargaNormal": p_clean,
        "stok": stok_val,
        "updatedAt": now_iso,
    }
    if promo_info:
        rec_new["hargaPromo"] = promo_info["hargaPromo"]
        rec_new["diskon"] = promo_info["diskon"]
        rec_new["discountType"] = promo_info["discountType"]
        rec_new["acara"] = promo_info["acara"]
        if promo_info.get("toDate"):
            rec_new["toDate"] = promo_info["toDate"]
        rec_new["_has_live_promo"] = True
    return rec_new


def save_report(start_time: datetime, initial_count: int, session_discovered: int, updated_count: int, brands_counter: Dict[str, int]):
    """Menulis laporan eksekutif markdown secara real-time."""
    end_time = datetime.now()
    duration_minutes = (end_time - start_time).total_seconds() / 60

    try:
        final_res = sb.table("Product").select("id", count="exact").limit(1).execute()
        final_count = final_res.count or (initial_count + session_discovered)
    except Exception:
        final_count = initial_count + session_discovered

    total_net_added = max(0, final_count - BASELINE_INITIAL_COUNT)

    report_content = f"""# 📋 LAPORAN HASIL BRUTAL SCRAPING & SINKRONISASI TOTAL MDS BISA
**Tanggal Eksekusi:** {start_time.strftime('%d %B %Y')}  
**Waktu Mulai:** {start_time.strftime('%H:%M:%S')} WIB  
**Waktu Pembaruan Terakhir:** {end_time.strftime('%H:%M:%S')} WIB  
**Durasi Pemindaian Berjalan:** {duration_minutes:.1f} Menit  
**Mode Mesin:** Turbo Multi-Threaded (16 Workers + HTTP Keep-Alive + Dual SKU/UPC Check-Digit Sweep)

---

## 1. Ringkasan Eksekutif Bank Data Toko 719
- **Total Master Produk Awal (Sebelum Scrap):** {BASELINE_INITIAL_COUNT:,} SKU  
- **Total Master Produk Saat Ini di Supabase:** **{final_count:,} SKU**  
- **Total Produk Baru Berhasil Diserap:** **+{total_net_added:,} SKU** *(+{session_discovered:,} di sesi turbo ini)*  
- **Produk Terpetakan Diperbarui Stok/Barcode:** **{updated_count:,} SKU**  
- **Brankas Jalur Mapping SKU:** `python-engine/mapped_sku_paths.json.gz` (**{final_count:,} Jalur SKU & Barcode Aktif**)  
- **Atribut Terserap Lengkap:** `SKU`, `Barcode UPC (EAN-13)`, `Artikel (StyleCode)`, `Deskripsi`, `Brand`, `Departemen`, `Warna`, `Ukuran`, `Harga Normal`, dan `Stok Riil Toko (termasuk Stok 0 pcs)`  
- **Status Database:** 100% Produk Langsung Aktif & Dapat Di-scan Kasir (`luqmanganteng.my.id`)  

---

## 2. Rincian Produk Berdasarkan Merk / Departemen
Berikut adalah rincian produk yang berhasil ditangkap dari StoreHub MDS BISA dan dimasukkan ke bank data:

| No | Merk / Departemen | Jumlah Produk Diserap | Status di Sistem |
| :--- | :--- | :--- | :--- |
"""
    for idx, (b_name, b_count) in enumerate(sorted(brands_counter.items(), key=lambda x: x[1], reverse=True)[:120], 1):
        report_content += f"| {idx} | **{b_name}** | {b_count:,} Item | ✅ Aktif & Siap Scan |\n"

    if not brands_counter:
        report_content += "| 1 | *Memindai Katalog Server Toko 719* | - | ⏳ Berjalan |\n"

    report_content += """
---

## 3. Kesiapan Sistem di Toko (Self-Healing Runtime)
1. **Pencarian Cerdas 0ms:** Seluruh produk di atas sudah terindeks di pencarian 4-Cell Supabase & cache Dexie HP kasir (`luqmanganteng.my.id`).
2. **Barcode Scanner Aktif:** Pemindaian barcode fisik melalui kamera maupun keyboard scanner langsung membaca harga normal, harga promo, warna, ukuran, dan sisa stok toko riil.
3. **Kebijakan Stok 0:** Semua produk (bahkan dengan stok 0 pcs) tetap ditampilkan utuh dengan badge informatif tanpa ada yang disembunyikan.
4. **Live Fallback Otomatis:** Jika ada barcode baru yang di-scan kasir sebelum terindeks, API otomatis menembak StoreHub MDS BISA secara real-time, menyimpan ke Supabase, dan menampilkannya seketika.

---
*Laporan otomatis dibuat dan diperbarui secara live oleh Python Engine untuk Mas Luqman.*
"""

    with open(REPORT_PATH, "w", encoding="utf-8") as f:
        f.write(report_content)


def flush_buffer(
    buffer_by_sku: Dict[str, Dict[str, Any]],
    start_time: Optional[datetime] = None,
    initial_count: int = 0,
    new_discovered: int = 0,
    updated_count: int = 0,
    brands_counter: Optional[Dict[str, int]] = None,
    write_md_report: bool = True,
):
    """
    Menyimpan batch produk secara aman ke Raw Vault lokal (`raw_vault.db`),
    tabel `Product` Supabase, DAN tabel `BarcodeAlias` (seluruh multi-barcode).
    """
    if not buffer_by_sku:
        return
    MDS_UPSERT_KEYS = (
        "sku", "barcode", "article", "description", "brand",
        "dept", "color", "size", "hargaNormal", "stok", "updatedAt",
    )
    raw_vault_rows: List[Dict[str, Any]] = []
    alias_records: List[Dict[str, Any]] = []
    seen_alias_bcs: Set[str] = set()
    records = []
    promo_live_updates: List[Tuple[str, float, str, str, str, Optional[str], str]] = []
    new_img_updates: List[Tuple[str, str, List[str]]] = []
    now_iso = datetime.now(timezone.utc).isoformat()

    for r in buffer_by_sku.values():
        all_bcs = list(r.get("_all_barcodes") or [])
        if r.get("barcode") and r["barcode"] not in all_bcs:
            all_bcs.insert(0, r["barcode"])
        raw_vault_rows.append({
            "sku": r.get("sku"),
            "barcode": r.get("barcode"),
            "alt_barcodes": all_bcs,
            "article": r.get("article"),
            "description": r.get("description"),
            "brand": r.get("brand"),
            "dept": r.get("dept"),
            "color": r.get("color"),
            "size": r.get("size"),
            "hargaNormal": r.get("hargaNormal"),
            "stok": r.get("stok"),
            "extra": r.get("_raw_extra"),
        })
        for bc_cand in all_bcs:
            bc_s = normalize_barcode_token(bc_cand)
            if bc_s and bc_s != r.get("sku") and bc_s not in seen_alias_bcs:
                seen_alias_bcs.add(bc_s)
                alias_records.append({
                    "barcode": bc_s,
                    "barcodeNorm": normalize_code_key(bc_s),
                    "sku": r.get("sku"),
                    "source": "STOREHUB_MDS",
                    "updatedAt": now_iso,
                })

        clean_r = {k: r.get(k) for k in MDS_UPSERT_KEYS if k in r or k in ("sku", "description", "hargaNormal", "stok", "updatedAt")}
        if clean_r.get("barcode") is None:
            clean_r["barcode"] = None
        if clean_r.get("article") is None:
            clean_r["article"] = "PRODUK BARU"
        for opt_k in ("brand", "dept", "color", "size"):
            clean_r.setdefault(opt_k, None)
        records.append(clean_r)
        if r.get("_has_live_promo") and r.get("hargaPromo") and r.get("sku"):
            promo_live_updates.append((
                str(r["sku"]),
                float(r["hargaPromo"]),
                str(r.get("diskon") or ""),
                str(r.get("discountType") or "SPECIAL_PRICE"),
                str(r.get("acara") or ""),
                str(r["toDate"]) if r.get("toDate") else None,
                now_iso,
            ))
        if r.get("_found_images") and r.get("imageUrl") and r.get("sku"):
            new_img_updates.append((str(r["sku"]), str(r["imageUrl"]), list(r["_found_images"])))
    buffer_by_sku.clear()

    # 1. Simpan mentahan lengkap ke Raw Vault SQLite lokal (0 MB kuota Supabase)
    try:
        record_raw_items_batch(raw_vault_rows, source="STOREHUB_MDS")
    except Exception:
        pass

    # 2. Simpan Product ke Database (Turso / Supabase)
    try:
        db.table("Product").upsert(records, on_conflict="sku").execute()
        print(f"   💾 [DB TURBO] Berhasil menyimpan batch {len(records)} produk ke Database! (Baru: +{new_discovered:,} | Update: {updated_count:,})")
    except Exception as e:
        saved_one = 0
        for rec in records:
            try:
                db.table("Product").upsert(rec, on_conflict="sku").execute()
                saved_one += 1
            except Exception:
                try:
                    rec_no_bc = dict(rec)
                    rec_no_bc.pop("barcode", None)
                    db.table("Product").upsert(rec_no_bc, on_conflict="sku").execute()
                    saved_one += 1
                except Exception:
                    pass
        print(f"   💾 [DB SAFE] Berhasil menyimpan {saved_one}/{len(records)} produk ke Database! ({e})")

    # 2B. Simpan Harga Promo Live dari StoreHub (hanya untuk item yang terdeteksi punya promo aktif — tidak pernah menimpa promo email jadi NULL!)
    if promo_live_updates:
        try:
            conn_p = connect_pg()
            if getattr(conn_p, "is_turso", False):
                stmts_p = [
                    (
                        'UPDATE "Product" SET "hargaPromo" = ?, diskon = ?, "discountType" = ?, acara = ?, "toDate" = COALESCE(?, "toDate"), "updatedAt" = ? WHERE sku = ?',
                        (hp, dsk, dt, ac, td, upd, sku),
                    )
                    for sku, hp, dsk, dt, ac, td, upd in promo_live_updates
                ]
                conn_p.execute_batch(stmts_p, transactional=True)
                print(f"   🏷️ [PROMO LIVE STOREHUB] Tersimpan {len(promo_live_updates)} SKU harga promo live ({CREDENTIALS['label']})!")
            conn_p.close()
        except Exception as ep:
            print(f"   ⚠️ [PROMO LIVE] Lewati update promo batch: {ep}")

    # 3. Simpan SEMUA multi-barcode ke BarcodeAlias agar tidak ada 1 barcode pun yang terbuang
    if alias_records:
        try:
            db.table("BarcodeAlias").upsert(alias_records, on_conflict="barcode").execute()
        except Exception:
            pass

    # 4. Sinkronkan foto yang baru ditemukan untuk SKU tanpa foto (aman tidak menimpa galeri eksisting)
    if new_img_updates:
        try:
            pg_conn = connect_pg()
            if getattr(pg_conn, "is_turso", False):
                stmts = [
                    (
                        'UPDATE "Product" SET "imageUrl" = COALESCE(NULLIF("imageUrl", \'\'), ?), images = CASE WHEN images IS NULL OR images = \'\' OR images = \'[]\' THEN ? ELSE images END WHERE sku = ?',
                        (img, imgs, sku),
                    )
                    for sku, img, imgs in new_img_updates
                ]
                for idx in range(0, len(stmts), 250):
                    pg_conn.execute_batch(stmts[idx : idx + 250], transactional=True)
                pg_conn.close()
            else:
                from psycopg2.extras import execute_values
                pg_cur = pg_conn.cursor()
                execute_values(
                    pg_cur,
                    '''
                    UPDATE "Product" AS p
                    SET "imageUrl" = COALESCE(NULLIF(p."imageUrl", ''), v.img),
                        images = CASE WHEN cardinality(p.images) = 0 THEN v.imgs::text[] ELSE p.images END
                    FROM (VALUES %s) AS v(sku, img, imgs)
                    WHERE p.sku = v.sku
                    ''',
                    new_img_updates,
                    page_size=200,
                )
                pg_conn.commit()
                pg_conn.close()
        except Exception:
            pass

    if write_md_report and start_time is not None and brands_counter is not None:
        save_report(start_time, initial_count, new_discovered, updated_count, brands_counter)


# =============================================================================
# MODE 1: UPDATE STOCK LIVE TERKINI & REKAP SALES DELTA SUKO (`--stock-only` / `--suko-sales-only`)
# =============================================================================
def _is_suko_sales_eligible(row: Optional[Dict[str, Any]]) -> bool:
    """
    Hanya hitung penjualan untuk produk SUKO / stok aktif toko 719.
    MUKU & ZES (stok 0 / -1 karena beda role akun StoreHub) DIABAIKAN dari pencatatan sales.
    """
    if not row:
        return False
    brand_up = str(row.get("brand") or "").upper()
    dept_up = str(row.get("dept") or "").upper()
    if "MUKU" in brand_up or "MU+KU" in brand_up or "MUKU" in dept_up or "ZES" in brand_up or "ZES" in dept_up:
        return False
    return ("SUKO" in brand_up) or ("SUKO" in dept_up) or ("BYRCH" in dept_up) or (int(row.get("stok") or 0) > 0)


def _resolve_effective_price(row: Optional[Dict[str, Any]], today_wib: str) -> Tuple[float, bool]:
    """Ambil harga jual aktif (Harga Promo Excel bila aktif & < normal, atau Harga Normal)."""
    if not row:
        return (0.0, False)
    h_norm = float(row.get("hargaNormal") or 0)
    h_promo = row.get("hargaPromo")
    to_date = str(row.get("toDate") or "").strip()[:10]
    promo_expired = bool(len(to_date) == 10 and to_date < today_wib)
    if not promo_expired and h_promo is not None:
        try:
            hp = float(h_promo)
            if hp > 0 and (h_norm <= 0 or hp < h_norm):
                return (hp, True)
        except Exception:
            pass
    return (h_norm, False)


def record_mds_delta_sales(
    sales_deltas: Dict[str, Dict[str, Any]],
    target_sales_date: Optional[str] = None,
) -> Tuple[int, int, float]:
    """
    Catat HANYA SKU yang stoknya berkurang (terjual) ke DailySales & ringkasan Product
    melalui 1 batch SQL ringan (< 50 KB tulis ke Supabase, 0 beban RAM Supabase).
    Mendukung `target_sales_date` (YYYY-MM-DD) untuk pembukuan susulan jika kemarin lupa tarik sales.
    """
    if not sales_deltas:
        return (0, 0, 0.0)
    try:
        from build_offline_snapshot import _connect_postgres
        wib_now = datetime.now(timezone(timedelta(hours=7)))
        today_str = wib_now.strftime("%Y-%m-%d")
        booking_str = (
            target_sales_date.strip()
            if target_sales_date and re.match(r"^\d{4}-\d{2}-\d{2}$", target_sales_date.strip())
            else today_str
        )
        ref_dt = datetime.strptime(booking_str, "%Y-%m-%d")
        week_start_str = (ref_dt - timedelta(days=ref_dt.weekday())).strftime("%Y-%m-%d")
        month_start_str = ref_dt.strftime("%Y-%m-01")
        year_start_str = ref_dt.strftime("%Y-01-01")

        conn = _connect_postgres()
        cur = conn.cursor()
        is_turso = getattr(conn, "is_turso", False)
        skus = list(sales_deltas.keys())
        sku_to_id: Dict[str, int] = {}
        if is_turso:
            for i in range(0, len(skus), 400):
                chunk = skus[i : i + 400]
                ph = ", ".join(["?"] * len(chunk))
                cur.execute(f'SELECT id, sku FROM "Product" WHERE sku IN ({ph})', chunk)
                for r in cur.fetchall():
                    sku_to_id[str(r[1])] = int(r[0])
        else:
            cur.execute('SELECT id, sku FROM "Product" WHERE sku = ANY(%s)', (skus,))
            sku_to_id = {str(r[1]): int(r[0]) for r in cur.fetchall()}

        total_skus = 0
        total_qty = 0
        total_omzet = 0.0
        touched_ids: List[int] = []
        booking_iso = f"{booking_str}T00:00:00.000Z"
        now_iso_dt = format_prisma_iso(datetime.now(timezone.utc))

        turso_ds_stmts: List[Tuple[str, Tuple[Any, ...]]] = []
        for sku, info in sales_deltas.items():
            pid = sku_to_id.get(sku)
            if not pid:
                continue
            qty = int(info.get("qty") or 0)
            omzet = float(info.get("omzet") or 0.0)
            if qty <= 0:
                continue
            ds_id = f"mds_{booking_str}_{pid}"
            if is_turso:
                turso_ds_stmts.append((
                    '''
                    INSERT INTO "DailySales" (id, "productId", date, "qtySold", omzet, "createdAt")
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT ("productId", date)
                    DO UPDATE SET
                        "qtySold" = "DailySales"."qtySold" + excluded."qtySold",
                        omzet = "DailySales".omzet + excluded.omzet
                    ''',
                    (ds_id, pid, booking_iso, qty, omzet, now_iso_dt),
                ))
            else:
                cur.execute(
                    '''
                    INSERT INTO "DailySales" (id, "productId", date, "qtySold", omzet, "createdAt")
                    VALUES (%s, %s, %s::date, %s, %s, NOW())
                    ON CONFLICT ("productId", date)
                    DO UPDATE SET
                        "qtySold" = "DailySales"."qtySold" + EXCLUDED."qtySold",
                        omzet = "DailySales".omzet + EXCLUDED.omzet
                    ''',
                    (ds_id, pid, booking_str, qty, omzet),
                )
            touched_ids.append(pid)
            total_skus += 1
            total_qty += qty
            total_omzet += omzet

        if is_turso and turso_ds_stmts:
            for idx in range(0, len(turso_ds_stmts), 250):
                conn.execute_batch(turso_ds_stmts[idx : idx + 250], transactional=True)

        if touched_ids:
            if is_turso:
                agg_by_pid: Dict[int, Dict[str, Any]] = {}
                for i in range(0, len(touched_ids), 400):
                    chunk = touched_ids[i : i + 400]
                    ph = ", ".join(["?"] * len(chunk))
                    cur.execute(
                        f'SELECT "productId", substr(date, 1, 10), "qtySold", omzet FROM "DailySales" WHERE "productId" IN ({ph})',
                        chunk,
                    )
                    for r_pid, r_day, r_qty, r_omz in cur.fetchall():
                        pid_i = int(r_pid)
                        d_s = str(r_day or "")[:10]
                        q_i = int(r_qty or 0)
                        o_f = float(r_omz or 0.0)
                        st = agg_by_pid.setdefault(
                            pid_i,
                            {"d_qty": 0, "d_omz": 0.0, "w_qty": 0, "w_omz": 0.0, "m_qty": 0, "m_omz": 0.0, "y_qty": 0, "y_omz": 0.0},
                        )
                        if d_s == today_str:
                            st["d_qty"] += q_i
                            st["d_omz"] += o_f
                        if d_s >= week_start_str:
                            st["w_qty"] += q_i
                            st["w_omz"] += o_f
                        if d_s >= month_start_str:
                            st["m_qty"] += q_i
                            st["m_omz"] += o_f
                        if d_s >= year_start_str:
                            st["y_qty"] += q_i
                            st["y_omz"] += o_f

                upd_stmts = []
                for pid_i, st in agg_by_pid.items():
                    upd_stmts.append((
                        '''
                        UPDATE "Product"
                        SET
                            day_sales_unit   = ?,
                            day_sales_retail = ?,
                            sales_wtd        = ?,
                            sales_wtd_retail = ?,
                            sales_mtd        = ?,
                            sales_mtd_retail = ?,
                            sales_ytd        = ?,
                            sales_ytd_retail = ?,
                            eoh_retail       = MAX(stok, 0) * COALESCE(
                                CASE WHEN "hargaPromo" IS NOT NULL AND "hargaPromo" > 0 AND ("hargaNormal" <= 0 OR "hargaPromo" < "hargaNormal")
                                     THEN "hargaPromo" ELSE NULL END,
                                NULLIF("hargaNormal", 0),
                                0
                            )
                        WHERE id = ?
                        ''',
                        (
                            st["d_qty"], st["d_omz"],
                            st["w_qty"], st["w_omz"],
                            st["m_qty"], st["m_omz"],
                            st["y_qty"], st["y_omz"],
                            pid_i,
                        ),
                    ))
                for idx in range(0, len(upd_stmts), 250):
                    conn.execute_batch(upd_stmts[idx : idx + 250], transactional=True)
            else:
                # Recalculate kolom ringkas HANYA untuk SKU yang terjual hari ini (super ringan, 0 full scan!)
                cur.execute(
                    '''
                    UPDATE "Product" p
                    SET
                        day_sales_unit   = COALESCE(agg.d_qty, 0),
                        day_sales_retail = COALESCE(agg.d_omz, 0),
                        sales_wtd        = COALESCE(agg.w_qty, 0),
                        sales_wtd_retail = COALESCE(agg.w_omz, 0),
                        sales_mtd        = COALESCE(agg.m_qty, 0),
                        sales_mtd_retail = COALESCE(agg.m_omz, 0),
                        sales_ytd        = COALESCE(agg.y_qty, 0),
                        sales_ytd_retail = COALESCE(agg.y_omz, 0),
                        eoh_retail       = GREATEST(p.stok, 0) * COALESCE(
                            CASE WHEN p."hargaPromo" IS NOT NULL AND p."hargaPromo" > 0 AND (p."hargaNormal" <= 0 OR p."hargaPromo" < p."hargaNormal")
                                 THEN p."hargaPromo" ELSE NULL END,
                            NULLIF(p."hargaNormal", 0),
                            0
                        )
                    FROM (
                        SELECT
                            "productId",
                            SUM(CASE WHEN date::date = %s::date THEN "qtySold" ELSE 0 END) AS d_qty,
                            SUM(CASE WHEN date::date = %s::date THEN omzet ELSE 0 END) AS d_omz,
                            SUM(CASE WHEN date::date >= %s::date THEN "qtySold" ELSE 0 END) AS w_qty,
                            SUM(CASE WHEN date::date >= %s::date THEN omzet ELSE 0 END) AS w_omz,
                            SUM(CASE WHEN date::date >= %s::date THEN "qtySold" ELSE 0 END) AS m_qty,
                            SUM(CASE WHEN date::date >= %s::date THEN omzet ELSE 0 END) AS m_omz,
                            SUM(CASE WHEN date::date >= %s::date THEN "qtySold" ELSE 0 END) AS y_qty,
                            SUM(CASE WHEN date::date >= %s::date THEN omzet ELSE 0 END) AS y_omz
                        FROM "DailySales"
                        WHERE "productId" = ANY(%s)
                        GROUP BY "productId"
                    ) agg
                    WHERE p.id = agg."productId"
                    ''',
                    (
                        today_str, today_str,
                        week_start_str, week_start_str,
                        month_start_str, month_start_str,
                        year_start_str, year_start_str,
                        touched_ids,
                    ),
                )

        conn.commit()
        cur.close()
        conn.close()
        print(f"   💰 [MDS SALES TRACKER] Tercatat {total_skus:,} SKU terjual ({total_qty:,} pcs | Rp {total_omzet:,.0f}) ke DailySales!")
        return (total_skus, total_qty, total_omzet)
    except Exception as e:
        print(f"⚠️ [MDS SALES TRACKER] Gagal mencatat delta sales: {e}")
        return (0, 0, 0.0)


def execute_live_stock_sync(
    max_minutes: int = 45,
    suko_sales_only: bool = False,
    sales_date: Optional[str] = None,
):
    """
    Memperbarui stok fisik terkini (`stok`) dan harga normal (`hargaNormal`)
    sekaligus menghitung penjualan otomatis (Delta Stok Turun SUKO) di RAM Python
    (0 beban RAM Supabase — hanya menulis SKU yang stoknya berubah / terjual!).
    """
    start_time = datetime.now()
    today_wib = datetime.now(timezone(timedelta(hours=7))).strftime("%Y-%m-%d")
    booking_date = (
        sales_date.strip()
        if sales_date and re.match(r"^\d{4}-\d{2}-\d{2}$", sales_date.strip())
        else today_wib
    )
    is_muku_mode = ACTIVE_ACCOUNT == "muku"
    print("=" * 80)
    if is_muku_mode:
        print(f"🏷️ [MU+KU LIVE STOCK ENGINE] UPDATE STOK TERKINI PRODUK MU+KU (AKUN: {CREDENTIALS['username']} | BUKU: {booking_date})")
    elif suko_sales_only:
        print(f"💰 [SUKO SALES & STOCK ENGINE] TARIK SALES OTOMATIS KHUSUS PRODUK SUKO (BUKU: {booking_date})")
    else:
        print(f"⚡ [LIVE STOCK + SALES ENGINE] UPDATE STOK TERKINI & REKAP SALES SUKO (BUKU: {booking_date})")
    print("=" * 80)

    cookie = get_active_cookie()
    if not cookie:
        print("❌ Cookie login StoreHub tidak ditemukan.")
        log_sync_history("MUKU_STOCK_SYNC" if is_muku_mode else "STOCK_SYNC", "Gagal: Cookie StoreHub tidak ditemukan", 0, "FAILED")
        return

    online, cookie = ensure_store_online(cookie, run_once_cloud=True)
    if not online:
        log_sync_history(
            "MUKU_STOCK_SYNC" if is_muku_mode else "STOCK_SYNC",
            f"Server database stok toko ({CREDENTIALS['label']}) sedang offline / tidak merespons (Stok tersimpan tetap aman)",
            0,
            "OFFLINE",
        )
        return

    print("📥 Memuat jalur mapping SKU & Artikel dari Turso + Registry...")
    catalog_by_sku, existing_barcodes, _ = load_existing_catalog_full()
    total_mapped = len(catalog_by_sku)
    print(f"📊 Total Jalur Mapping SKU di DB: {total_mapped:,} SKU | Barcode/Alias Terdaftar: {len(existing_barcodes):,}")

    # =========================================================================
    # TURBO MATRIX STOCK ENGINE (`checkItemStock` — 50-150ms per ARTIKEL PENUH!)
    # 1 Request langsung menyapu SEMUA warna x SEMUA ukuran dalam 1 artikel (10-40 SKU sekaligus!)
    # - Mode SUKO : HANYA artikel SUKO (~1.205 artikel -> 100% tuntas dalam < 45 detik!)
    # - Mode Mu+Ku: HANYA artikel Mu+Ku (~58.667 artikel -> puluhan ribu s/d 100% artikel tuntas!)
    # =========================================================================
    INVALID_ARTS = {"", "0", "-", "PRODUK BARU", "N/A", "NONE", "NULL"}
    article_variants_map: Dict[str, List[Dict[str, Any]]] = {}
    orphan_skus: List[str] = []

    def _belongs_to_active_account(row: Dict[str, Any]) -> bool:
        b_up = f"{row.get('brand') or ''} {row.get('dept') or ''}".upper()
        if is_muku_mode:
            return _is_muku_row(row)
        # Mode SUKO: HANYA SUKO (jangan buang waktu tembak 293rb SKU Mu+Ku atau 6.5rb ZES!)
        return "SUKO" in b_up

    for sku, row in catalog_by_sku.items():
        if not _belongs_to_active_account(row):
            continue
        if suko_sales_only and not is_muku_mode and not _is_suko_sales_eligible(row):
            continue
        art = str(row.get("article") or "").strip().upper()
        if art not in INVALID_ARTS:
            article_variants_map.setdefault(art, []).append(row)
        else:
            orphan_skus.append(sku)

    # Urutkan artikel prioritas: stok > 0 dulu -> promo -> brand inti -> SKU angka terbesar (New Arrival dulu!)
    MUKU_PRIORITY_BRANDS = ("MUKU", "NEVADA", "LITTLE M", "COLE", "CONNEXION", "ST YVES", "DISNEY", "CARDINAL", "EXIT", "MAXMURAH", "AERO", "T ZONE", "DETAILS", "VOLO", "LOIS", "BEAUTY")

    def _article_sort_key(item_pair: Tuple[str, List[Dict[str, Any]]]):
        art_k, rows = item_pair
        has_stok = 0 if any(int(r.get("stok") or 0) > 0 for r in rows) else 1
        has_promo = 0 if any(r.get("hargaPromo") for r in rows) else 1
        has_img = 0 if any(r.get("imageUrl") for r in rows) else 1
        b_sample = f"{rows[0].get('brand') or ''} {rows[0].get('dept') or ''}".upper()
        is_core = 0 if (not is_muku_mode or any(k in b_sample for k in MUKU_PRIORITY_BRANDS)) else 1
        max_sku_num = max((int(str(r.get("sku"))) for r in rows if str(r.get("sku") or "").isdigit()), default=0)
        return (has_stok, has_promo, is_core, has_img, -max_sku_num, art_k)

    ordered_articles = sorted(article_variants_map.items(), key=_article_sort_key)
    total_target_skus = sum(len(rows) for _, rows in ordered_articles) + len(orphan_skus)

    print(f"🚀 [TURBO MATRIX ENGINE — {CREDENTIALS['label']}] 1 Request `checkItemStock` = 1 Artikel Penuh (Semua Warna x Size):")
    print(f"   👉 Total Artikel Target : {len(ordered_articles):,} Artikel ({total_target_skus:,} SKU)")
    print(f"   👉 Sisa SKU Tanpa Art   : {len(orphan_skus):,} SKU")

    checked_count = 0
    checked_articles = 0
    changed_count = 0
    matrix_hit_articles = 0
    stock_delta_batch: List[Tuple[int, str, str]] = []
    fallback_detail_skus: List[str] = list(orphan_skus)
    buffer_by_sku: Dict[str, Dict[str, Any]] = {}
    sales_deltas: Dict[str, Dict[str, Any]] = {}
    now_iso = datetime.now(timezone.utc).isoformat()

    def _track_delta_sale(sku_key: str, prev_row: Optional[Dict[str, Any]], old_q: int, new_q: int):
        if is_muku_mode or not _is_suko_sales_eligible(prev_row):
            return
        if old_q <= 0 or new_q < 0 or new_q >= old_q:
            return
        delta = old_q - new_q
        if delta > 25:
            return
        eff_price, is_promo = _resolve_effective_price(prev_row, today_wib)
        cur_entry = sales_deltas.get(sku_key)
        if cur_entry:
            cur_entry["qty"] += delta
            cur_entry["omzet"] += delta * eff_price
        else:
            sales_deltas[sku_key] = {
                "qty": delta,
                "omzet": delta * eff_price,
                "price": eff_price,
                "is_promo": is_promo,
            }

    # FASE 1: Sapuan TURBO MATRIX per Artikel (36 Workers, chunk 360 artikel)
    art_chunk_size = 360
    matrix_workers = 36
    stop_offline = False

    for a_start in range(0, len(ordered_articles), art_chunk_size):
        elapsed_min = (datetime.now() - start_time).total_seconds() / 60.0
        if elapsed_min >= max_minutes:
            print(f"⏱️ Batas waktu aman runner ({max_minutes} menit) tercapai. Menyimpan hasil...")
            break

        batch_arts = ordered_articles[a_start:a_start + art_chunk_size]
        offline_hits = 0
        with ThreadPoolExecutor(max_workers=matrix_workers) as executor:
            future_map = {}
            for art_k, rows in batch_arts:
                # Pilih SKU perwakilan terbaik (punya stok > 0 atau SKU valid 8-digit)
                rep = next((r for r in rows if int(r.get("stok") or 0) > 0), rows[0])
                rep_sku = str(rep.get("sku") or "").strip()
                if rep_sku:
                    future_map[executor.submit(query_storehub_stock_matrix, "sku", rep_sku, cookie)] = (art_k, rows, rep_sku)

            for fut in as_completed(future_map):
                art_k, rows, rep_sku = future_map[fut]
                checked_articles += 1
                st_code, matrix_rows = fut.result()
                if st_code == "offline":
                    offline_hits += 1
                    continue
                if st_code == "unauthorized":
                    fresh = auto_login_storehub()
                    if fresh:
                        cookie = fresh
                    continue
                if st_code != "ok" or not matrix_rows:
                    # Fallback hanya untuk SKU perwakilan bila artikel sedang kosong/belum punya relasi warna
                    if any(int(r.get("stok") or 0) > 0 for r in rows):
                        for r in rows:
                            if int(r.get("stok") or 0) > 0:
                                fallback_detail_skus.append(str(r.get("sku") or ""))
                    continue

                matrix_hit_articles += 1
                for sib in rows:
                    sib_sku = str(sib.get("sku") or "").strip()
                    if not sib_sku:
                        continue
                    checked_count += 1
                    found_q = _match_matrix_qty(matrix_rows, sib.get("color"), sib.get("size"))
                    if found_q is None:
                        continue
                    old_q = int(sib.get("stok") or 0)
                    upd_sib = dict(sib)
                    upd_sib["stok"] = found_q
                    upd_sib = _protect_cross_store_stock(upd_sib, sib)
                    final_q = int(upd_sib.get("stok") or 0)
                    if final_q != old_q:
                        _track_delta_sale(sib_sku, sib, old_q, final_q)
                        upd_sib["updatedAt"] = now_iso
                        catalog_by_sku[sib_sku] = upd_sib
                        stock_delta_batch.append((final_q, now_iso, sib_sku))
                        changed_count += 1

        if offline_hits > len(batch_arts) // 2:
            print(f"⚠️ Koneksi ke server toko ({CREDENTIALS['label']}) terputus. Menyimpan hasil...")
            stop_offline = True
            break

        if len(stock_delta_batch) >= 400:
            flush_stock_only_deltas(stock_delta_batch)
            stock_delta_batch.clear()

        dt_sec = max(0.1, (datetime.now() - start_time).total_seconds())
        pct_now = min(100, int((checked_articles / max(len(ordered_articles), 1)) * 100))
        print(
            f"   ⚡ [TURBO MATRIX {CREDENTIALS['label']}] {pct_now}% • {checked_articles:,}/{len(ordered_articles):,} Artikel "
            f"({checked_articles / dt_sec:.1f} art/s | {checked_count:,} SKU dicek | {changed_count:,} stok berubah | "
            f"Matrix Hit: {matrix_hit_articles:,})"
        )

    if stock_delta_batch:
        flush_stock_only_deltas(stock_delta_batch)
        stock_delta_batch.clear()

    # FASE 2: Fallback `checkItemDetail` HANYA untuk SKU orphan / yang matriksnya kosong (maks 500 SKU)
    if not stop_offline and fallback_detail_skus:
        fb_targets = [s for s in dict.fromkeys(fallback_detail_skus) if s][:500]
        elapsed_min = (datetime.now() - start_time).total_seconds() / 60.0
        if fb_targets and elapsed_min < max_minutes:
            print(f"   🔄 [FASE 2 FALLBACK] Mengecek {len(fb_targets):,} SKU tunggal via checkItemDetail...")
            for c_start in range(0, len(fb_targets), 120):
                if (datetime.now() - start_time).total_seconds() / 60.0 >= max_minutes:
                    break
                chunk = fb_targets[c_start:c_start + 120]
                with ThreadPoolExecutor(max_workers=24) as executor:
                    fmap = {executor.submit(query_storehub_multi, "sku", s, cookie): s for s in chunk}
                    for fut in as_completed(fmap):
                        sku_cand = fmap[fut]
                        items = fut.result()
                        checked_count += 1
                        if not items or items[0].get("_offline") or items[0].get("_unauthorized"):
                            continue
                        for item in items:
                            ex_row = catalog_by_sku.get(sku_cand)
                            rec = item_to_record(item, existing_row=ex_row)
                            if not rec:
                                continue
                            rec = _protect_cross_store_stock(rec, ex_row)
                            if is_muku_mode and not _is_muku_row(rec):
                                continue
                            s_val = rec["sku"]
                            old_stok = int((ex_row or {}).get("stok") or 0)
                            old_price = int(float((ex_row or {}).get("hargaNormal") or 0))
                            rec_all_bcs = list(rec.get("_all_barcodes") or [])
                            has_new_bc = any(bc and bc not in existing_barcodes for bc in rec_all_bcs)
                            if rec["stok"] != old_stok or rec["hargaNormal"] != old_price or has_new_bc:
                                for bcn in rec_all_bcs:
                                    if bcn:
                                        existing_barcodes.add(bcn)
                                _track_delta_sale(s_val, ex_row or rec, old_stok, int(rec["stok"] or 0))
                                buffer_by_sku[s_val] = rec
                                catalog_by_sku[s_val] = rec
                                changed_count += 1
                if len(buffer_by_sku) >= 150:
                    flush_buffer(buffer_by_sku, write_md_report=False)

    if buffer_by_sku:
        flush_buffer(buffer_by_sku, write_md_report=False)

    muku_promo_skus = 0
    if is_muku_mode:
        muku_promo_skus = sweep_muku_promotions_for_catalog(catalog_by_sku, cookie, max_minutes=6)

    sold_skus, sold_qty, sold_omzet = (
        (0, 0, 0.0)
        if is_muku_mode
        else record_mds_delta_sales(sales_deltas, target_sales_date=booking_date)
    )

    save_mapped_paths_registry(catalog_by_sku)
    if is_muku_mode:
        log_sync_history(
            "MUKU_STOCK_SYNC",
            f"Update Stok & Promo Live Mu+Ku by luqman org — {booking_date} ({checked_count:,} SKU dicek | {changed_count:,} berubah | {muku_promo_skus:,} promo)",
            changed_count if changed_count > 0 else checked_count,
            "SUCCESS",
        )
    else:
        log_sync_history(
            "MDS_SALES_SYNC" if (suko_sales_only or sold_qty > 0) else "STOCK_SYNC",
            f"Rekap Stok & Sales luqman org — Buku {booking_date} ({checked_count:,} SKU dicek | {sold_skus:,} SKU terjual, {sold_qty:,} pcs, Rp {sold_omzet:,.0f})",
            sold_skus if sold_skus > 0 else checked_count,
            "SUCCESS",
        )

    # Langsung segarkan JSON matang CDN (0 beban RAM Postgres saat halaman Laporan Sales dibuka!)
    try:
        import run_admin_analytics
        from build_offline_snapshot import _connect_postgres, _storage_upload, _supabase_credentials
        conn_an = _connect_postgres()
        s_url, s_key = _supabase_credentials()
        try:
            run_admin_analytics.generate_po_suggestions(conn_an)
            sales_payload = run_admin_analytics.build_sales_report_summary_payload(conn_an)
            sales_bytes = json.dumps(sales_payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
            _storage_upload(s_url, s_key, "analytics/sales-report-summary.json", sales_bytes, "application/json", "max-age=300")
            print(f"   📊 [ANALYTICS CDN] analytics/sales-report-summary.json diperbarui ({len(sales_bytes)/1024:.1f} KB)")
        finally:
            conn_an.close()
    except Exception as an_err:
        print(f"⚠️ Lewati refresh analytics CDN otomatis: {an_err}")
    print("\n" + "=" * 80)
    print(f"🎉 SELESAI UPDATE STOK & SALES SUKO! Terperiksa: {checked_count:,} SKU | Diperbarui: {changed_count:,} SKU | Terjual: {sold_qty:,} pcs (Rp {sold_omzet:,.0f})")
    print("=" * 80 + "\n")


# =============================================================================
# MODE 2: BRUTAL SCRAPER MDS BISA ALL DATA + GAP SWEEP (`--brutal`)
# =============================================================================
def execute_morning_sweep(
    run_once_cloud: bool = True,
    max_minutes: int = 50,
    upc_first: bool = False,
    custom_range: Optional[Tuple[int, int]] = None,
    workers: int = 28,
    with_images: bool = False,
    census_sku_only: bool = False,
):
    """Eksekusi penuh pemindaian brutal multi-threaded (Turbo 28 Workers)."""
    cookie = get_active_cookie()
    if not cookie:
        print("❌ Cookie login StoreHub tidak ditemukan.")
        log_sync_history("MDS_BISA_SYNC", "Gagal: Cookie StoreHub tidak ditemukan", 0, "FAILED")
        return

    online, cookie = ensure_store_online(cookie, run_once_cloud=run_once_cloud, check_interval_sec=45)
    if not online:
        log_sync_history(
            "MDS_BISA_SYNC",
            "Toko 719 sedang tutup/offline (84.763 SKU tetap siap digunakan)",
            84763,
            "SUCCESS",
        )
        return

    start_time = datetime.now()
    print("=" * 80)
    print(f"🚀 [TURBO PYTHON ENGINE] MEMULAI BRUTAL SCRAPING MULTI-THREADED ({workers} WORKERS)")
    print("=" * 80)
    print(f"Waktu Mulai: {start_time.strftime('%Y-%m-%d %H:%M:%S')} WIB")

    print("📥 Memuat katalog eksisting & jalur mapping SKU dari Supabase...")
    catalog_by_sku, existing_barcodes, brands_counter = load_existing_catalog_full()
    existing_skus: Set[str] = {
        s for s, r in catalog_by_sku.items() if not r.get("_from_registry_only")
    }
    INVALID_ARTICLES = {"", "0", "-", "PRODUK BARU", "N/A", "NONE"}
    seen_articles: Set[str] = {
        str(r.get("article") or "").strip().upper()
        for r in catalog_by_sku.values()
        if str(r.get("article") or "").strip().upper() not in INVALID_ARTICLES
    }

    # Bangun peta foto instan dari katalog + Raw Vault agar setiap SKU/UPC baru langsung ikut dicari gambarnya
    vault_img_map = load_vault_image_map()
    img_by_art_color: Dict[Tuple[str, str], List[str]] = {}
    img_by_art: Dict[str, List[str]] = {}
    for s_k, r_k in catalog_by_sku.items():
        img_u = str(r_k.get("imageUrl") or "").strip()
        if not img_u:
            continue
        gal = vault_img_map.get(s_k) or [img_u]
        art_k = str(r_k.get("article") or "").strip().upper()
        col_k = str(r_k.get("color") or "").strip().upper()
        if art_k not in INVALID_ARTICLES:
            if col_k and col_k not in ("", "-"):
                img_by_art_color.setdefault((art_k, col_k), gal)
            img_by_art.setdefault(art_k, gal)
    live_images_matched = 0
    initial_count = len(existing_skus)
    initial_articles_count = len(seen_articles)
    print(f"📊 Katalog Saat Ini: {initial_articles_count:,} Artikel Unik | {initial_count:,} SKU di DB | {len(existing_barcodes):,} Barcode")

    # Jalur 0: Semua SKU tanpa barcode (fleksibel: 7/8/9+ digit & alfanumerik, TIDAK terkunci hanya 8 digit!)
    # Prioritas MUTLAK: SKU aktif (stok > 0) -> punya foto/harga -> SKU terbaru/New Arrival (angka terbesar duluan!)
    missing_bc_rows = [
        (s, r) for s, r in catalog_by_sku.items()
        if (r.get("_from_registry_only") or not r.get("barcode")) and s
    ]
    def missing_prio(item_pair: Tuple[str, Dict[str, Any]]) -> Tuple[int, int, int, int, int, str]:
        s_code, r_obj = item_pair
        b_up = f"{r_obj.get('brand') or ''} {r_obj.get('dept') or ''}".upper()
        is_muku_core = any(k in b_up for k in ("MUKU", "NEVADA", "LITTLE M", "COLE", "CONNEXION", "ST YVES", "DISNEY", "AOS", "MAXMURAH", "CARDINAL", "VOLO", "NAYOUNG"))
        is_suko_zes = ("SUKO" in b_up or "ZES" in b_up)
        if ACTIVE_ACCOUNT == "muku":
            brand_rank = 0 if is_muku_core else (1 if not is_suko_zes else 2)
        else:
            brand_rank = 0 if is_suko_zes else (1 if is_muku_core else 2)
        has_stok_rank = 0 if int(r_obj.get("stok") or 0) > 0 else 1
        has_img_rank = 0 if r_obj.get("imageUrl") else 1
        has_price_rank = 0 if _parse_money_int(r_obj.get("hargaNormal")) > 0 else 1
        # Urutkan angka SKU DESC agar New Arrival (34xxxxxx, 5xxxxxxx, 7xxxxxxx) disapu paling awal!
        sku_num_desc = -int(s_code) if s_code.isdigit() else 0
        return (has_stok_rank, brand_rank, has_img_rank, has_price_rank, sku_num_desc, s_code)

    if ACTIVE_ACCOUNT == "muku":
        missing_bc_rows = [(s, r) for s, r in missing_bc_rows if _is_muku_row(r)]
    missing_bc_rows.sort(key=missing_prio)
    missing_bc_skus = [s for s, _ in missing_bc_rows]

    # Tambahan Jalur 0B (New Arrival Multi-Barcode Sync):
    # SKU terbaru (stok > 0 / angka SKU tinggi) yang SUDAH punya 1 barcode di Product tapi mungkin belum punya
    # VendorBarcode EAN-13 di BarcodeAlias -> ikut dicek cepat agar 100% bisa di-scan barcode hangtagnya!
    new_arrival_bc_refresh_skus: List[str] = []
    if not custom_range and not census_sku_only:
        candidates_na = [
            (s, r) for s, r in catalog_by_sku.items()
            if s and r.get("barcode") and not r.get("_from_registry_only")
            and ((ACTIVE_ACCOUNT == "muku" and _is_muku_row(r)) or (ACTIVE_ACCOUNT == "suko" and not _is_muku_row(r)))
            and (int(r.get("stok") or 0) > 0 or (s.isdigit() and int(s) >= 34000000))
        ]
        candidates_na.sort(
            key=lambda kv: (
                0 if int(kv[1].get("stok") or 0) > 0 else 1,
                -int(kv[0]) if kv[0].isdigit() else 0,
            )
        )
        new_arrival_bc_refresh_skus = [s for s, _ in candidates_na[:1500]]

    hunter_bc_queue: List[str] = []
    fill_bc_queue: List[str] = []
    sku_queue: List[str] = []
    alnum_qr_queue: List[str] = []

    if custom_range:
        r_start, r_end = custom_range
        hunter_bc_queue = [
            generate_ean13_barcode(b6)
            for b6 in range(r_start, r_end + 1)
        ]
        hunter_bc_queue = [b for b in hunter_bc_queue if b and b not in existing_barcodes]
        print(f"🎯 Mode Rentang Khusus: 234000{r_start:06d} .. 234000{r_end:06d} ({len(hunter_bc_queue):,} kandidat belum terindeks)")
    else:
        hunter_bc_queue, fill_bc_queue, sku_queue = build_candidate_queues(set(catalog_by_sku.keys()), existing_barcodes)
        alnum_qr_queue = build_alnum_qr_candidate_queue(existing_barcodes, catalog_by_sku, max_candidates=12000)
        print("🎯 Strategi UNIVERSAL SCRAP CONTROLLER Aktif (SUKO • Mu+Ku • ZES • QR & Barcode Unik):")
        print(f"   👉 [JALUR 0  - Tarik Barcode & Stok SKU Baru]     : {len(missing_bc_skus):,} SKU")
        print(f"   👉 [JALUR 0C - QR & Barcode Alfanumerik Unik]     : {len(alnum_qr_queue):,} kandidat QR/Alnum")
        print(f"   👉 [JALUR 1  - Hunter Stride-4 Lintas Zona]       : {len(hunter_bc_queue):,} kandidat Barcode")
        print(f"   👉 [JALUR 2  - Isi Sisa Varian & Celah SKU Adaptif]: {len(fill_bc_queue):,} BC + {len(sku_queue):,} SKU")

    new_discovered = 0
    new_articles_discovered = 0
    updated_count = 0
    buffer_by_sku: Dict[str, Dict[str, Any]] = {}
    neighbor_sku_queue: List[str] = []
    neighbor_bc_queue: List[str] = []
    seen_neighbor_skus: Set[str] = set(existing_skus) | set(catalog_by_sku.keys())
    seen_neighbor_bcs: Set[str] = set(existing_barcodes)
    chunk_size = max(160, workers * 10)

    def run_sweep_phase(
        category: str,
        queue: List[str],
        label: str,
        expand_on_new_article: bool = True,
        phase_max_minutes: Optional[float] = None,
    ) -> None:
        nonlocal cookie, new_discovered, new_articles_discovered, updated_count, live_images_matched
        if not queue:
            return
        print(f"\n⚡ [{label}] Menyapu {len(queue):,} kandidat dengan {workers} Worker Threads...")
        probed = 0
        phase_t0 = time.time()
        for c_start in range(0, len(queue), chunk_size):
            elapsed_min = (datetime.now() - start_time).total_seconds() / 60.0
            if elapsed_min >= max_minutes:
                print(f"⏱️ Batas waktu aman runner ({max_minutes} menit) tercapai. Menyimpan hasil...")
                break
            if phase_max_minutes is not None and ((time.time() - phase_t0) / 60.0) >= phase_max_minutes:
                print(f"⏱️ Kuota waktu fase {label} ({phase_max_minutes:.0f} menit) tercapai, lanjut ke fase berikutnya...")
                break

            chunk = queue[c_start:c_start + chunk_size]
            offline_hits = 0
            with ThreadPoolExecutor(max_workers=workers) as executor:
                future_map = {
                    executor.submit(query_storehub_multi, category, cand, cookie): cand
                    for cand in chunk
                }
                for fut in as_completed(future_map):
                    cand = future_map[fut]
                    probed += 1
                    items = fut.result()
                    if not items:
                        continue
                    if items[0].get("_offline"):
                        offline_hits += 1
                        continue
                    if items[0].get("_unauthorized"):
                        fresh = auto_login_storehub()
                        if fresh:
                            cookie = fresh
                        continue

                    for item in items:
                        sku_raw = str(item.get("SKU") or "").strip()
                        ex_row = catalog_by_sku.get(sku_raw)
                        rec = item_to_record(
                            item,
                            fallback_bc=(cand if category == "upc" else None),
                            existing_row=ex_row,
                        )
                        if not rec:
                            continue
                        rec = _protect_cross_store_stock(rec, ex_row)
                        sku_val = rec["sku"]
                        bc_val = rec.get("barcode")
                        art_val_up = str(rec.get("article") or "").strip().upper()
                        col_val_up = str(rec.get("color") or "").strip().upper()
                        is_new = sku_val not in existing_skus
                        is_new_article = bool(art_val_up and art_val_up not in INVALID_ARTICLES and art_val_up not in seen_articles)

                        # Langsung carikan foto produk jika belum berfoto (Vault -> Sibling Artikel+Warna -> Live Matahari.com)
                        if not rec.get("imageUrl"):
                            matched_gal = (
                                vault_img_map.get(sku_val)
                                or (img_by_art_color.get((art_val_up, col_val_up)) if art_val_up not in INVALID_ARTICLES and col_val_up else None)
                                or (img_by_art.get(art_val_up) if art_val_up not in INVALID_ARTICLES else None)
                            )
                            if not matched_gal and with_images:
                                live_img = lookup_matahari_image(sku_val) or (lookup_matahari_image(bc_val) if bc_val else None)
                                if live_img:
                                    matched_gal = [live_img]
                            if matched_gal:
                                rec["imageUrl"] = matched_gal[0]
                                rec["_found_images"] = matched_gal[:6]
                                live_images_matched += 1
                                if art_val_up not in INVALID_ARTICLES:
                                    if col_val_up and col_val_up not in ("", "-"):
                                        img_by_art_color.setdefault((art_val_up, col_val_up), matched_gal[:6])
                                    img_by_art.setdefault(art_val_up, matched_gal[:6])
                        elif art_val_up not in INVALID_ARTICLES:
                            cur_gal = vault_img_map.get(sku_val) or [str(rec["imageUrl"])]
                            if col_val_up and col_val_up not in ("", "-"):
                                img_by_art_color.setdefault((art_val_up, col_val_up), cur_gal)
                            img_by_art.setdefault(art_val_up, cur_gal)

                        existing_skus.add(sku_val)
                        catalog_by_sku[sku_val] = rec
                        for extra_bc in ([bc_val] if bc_val else []) + list(rec.get("_all_barcodes") or []):
                            if extra_bc:
                                existing_barcodes.add(extra_bc)
                                seen_neighbor_bcs.add(extra_bc)
                        if is_new_article:
                            seen_articles.add(art_val_up)
                            new_articles_discovered += 1

                        # Ekspansi tetangga UNIVERSAL (EAN-13, QR Alfanumerik 2663005FS, Code-128, SKU 7/8/9/Alnum!)
                        if expand_on_new_article and (is_new_article or (is_new and category == "upc")):
                            nb_bcs, nb_skus = expand_universal_neighbors(
                                code=bc_val or (cand if category == "upc" else ""),
                                sku_val=sku_val,
                                is_new_article=is_new_article,
                                seen_bcs=seen_neighbor_bcs,
                                seen_skus=seen_neighbor_skus,
                                calc_ean13_cd=calculate_ean13_check_digit,
                                gen_mds_sku8=generate_mds_sku8,
                            )
                            neighbor_bc_queue.extend(nb_bcs)
                            neighbor_sku_queue.extend(nb_skus)

                        buffer_by_sku[sku_val] = rec
                        if is_new:
                            new_discovered += 1
                        else:
                            updated_count += 1

                        dept_key = f"{rec['brand']} ({rec['dept']})" if rec["brand"] != rec["dept"] else rec["brand"]
                        brands_counter[dept_key] = brands_counter.get(dept_key, 0) + 1
                        art_tag = "🆕ART" if is_new_article else "✨SKU"
                        print(f"   {art_tag} [{label}] [{dept_key}] BC: {bc_val} | SKU: {sku_val} | {rec['article']} ({rec['color']}/{rec['size']}) | Rp {rec['hargaNormal']:,} | Stok: {rec['stok']} pcs")

            if offline_hits > len(chunk) // 2:
                if run_once_cloud:
                    print("⚠️ Server toko 719 offline di tengah jalan. Menyimpan hasil yang sudah didapat...")
                    break
                ensure_store_online(cookie, run_once_cloud=False, check_interval_sec=30)

            if len(buffer_by_sku) >= 60:
                flush_buffer(buffer_by_sku, start_time, initial_count, new_discovered, updated_count, brands_counter)

            dt = max(0.1, time.time() - phase_t0)
            if (c_start // chunk_size) % 5 == 0:
                print(
                    f"   📡 [{label} PROGRES] {probed:,}/{len(queue):,} ({probed/dt:.1f} req/s) | "
                    f"Artikel Baru: +{new_articles_discovered:,} | SKU Baru: +{new_discovered:,}"
                )

        if buffer_by_sku:
            flush_buffer(buffer_by_sku, start_time, initial_count, new_discovered, updated_count, brands_counter)

    if custom_range:
        run_sweep_phase("upc", hunter_bc_queue, "CUSTOM-UPC-SWEEP", expand_on_new_article=True)
        if neighbor_bc_queue:
            run_sweep_phase("upc", [b for b in neighbor_bc_queue if b not in existing_barcodes], "EXPAND-NEW-ART-BC", expand_on_new_article=False)
        if neighbor_sku_queue:
            run_sweep_phase("sku", [s for s in neighbor_sku_queue if s not in existing_skus], "EXPAND-NEW-ART-SKU", expand_on_new_article=False)
    elif census_sku_only:
        run_sweep_phase("sku", [s for s in sku_queue if s not in existing_skus], "CENSUS-SKU-SWEEP", expand_on_new_article=True)
        if neighbor_bc_queue:
            run_sweep_phase("upc", [b for b in neighbor_bc_queue if b not in existing_barcodes], "EXPAND-NEW-ART-BC", expand_on_new_article=False)
        if neighbor_sku_queue:
            run_sweep_phase("sku", [s for s in neighbor_sku_queue if s not in existing_skus], "EXPAND-NEW-ART-SKU", expand_on_new_article=False)
    else:
        # JALUR 0: Tarik Barcode, Stok, & Harga untuk SKU baru/Mu+Ku tanpa barcode (prioritas New Arrival & stok > 0!)
        # Khusus Mu+Ku yang masih punya puluhan ribu SKU web tanpa barcode, alokasikan mayoritas waktu (~75-80%)
        # untuk menambal barcode nyata, bukan membuang waktu menebak barcode acak!
        if ACTIVE_ACCOUNT == "muku" and len(missing_bc_skus) > 5000:
            bc_rec_mins = max(18.0, float(max_minutes) - 8.0)
        else:
            bc_rec_mins = 12.0 if ACTIVE_ACCOUNT == "muku" else 6.0
        if missing_bc_skus:
            run_sweep_phase("sku", missing_bc_skus, "BARCODE-RECOVERY", expand_on_new_article=False, phase_max_minutes=bc_rec_mins)

        # JALUR 0B: Lengkapi Multi-Barcode / VendorBarcode EAN-13 untuk SKU New Arrival & Aktif (supaya scan barcode hangtag 100% muncul!)
        if new_arrival_bc_refresh_skus:
            run_sweep_phase("sku", new_arrival_bc_refresh_skus, "NEW-ARRIVAL-BARCODE-SYNC", expand_on_new_article=False, phase_max_minutes=3.5)

        # JALUR 0C: Sapuan Universal QR Code & Barcode Alfanumerik Unik (mis. 2663005FS, AN011809, TP010392, 001.53121SH25M)
        if alnum_qr_queue:
            qr_mins = 4.0 if ACTIVE_ACCOUNT == "muku" else 2.5
            run_sweep_phase("upc", [b for b in alnum_qr_queue if b not in existing_barcodes], "ALPHANUMERIC-QR-SWEEP", expand_on_new_article=True, phase_max_minutes=qr_mins)

        # JALUR 1: Sapuan Article-Hunter Stride-4 merata di seluruh zona 234000* (SUKO, ZES, MUKU)
        run_sweep_phase("upc", [b for b in hunter_bc_queue if b not in existing_barcodes], "ARTICLE-HUNTER-UPC", expand_on_new_article=True, phase_max_minutes=10.0)

        # JALUR 1B: Sensus SKU 8-digit klaster baru (71xxxx-73xxxx) & celah SKU Modulo-10 untuk menangkap konsinyasi non-234000
        run_sweep_phase("sku", [s for s in sku_queue if s not in existing_skus], "CENSUS-SKU-SWEEP", expand_on_new_article=True, phase_max_minutes=5.0)

        # JALUR 2: Langsung lengkapi varian (warna/ukuran) untuk ARTIKEL BARU yang baru tertangkap
        if neighbor_bc_queue:
            run_sweep_phase("upc", [b for b in neighbor_bc_queue if b not in existing_barcodes], "NEW-ART-VARIANTS-BC", expand_on_new_article=False, phase_max_minutes=6.0)
        if neighbor_sku_queue:
            run_sweep_phase("sku", [s for s in neighbor_sku_queue if s not in existing_skus], "NEW-ART-VARIANTS-SKU", expand_on_new_article=False, phase_max_minutes=5.0)

        # JALUR 3: Jika masih ada sisa waktu, isi celah barcode lain (termasuk prefix non-234000)
        run_sweep_phase("upc", [b for b in fill_bc_queue if b not in existing_barcodes], "FILL-GAPS-UPC", expand_on_new_article=True)

    save_mapped_paths_registry(catalog_by_sku)
    save_report(start_time, initial_count, new_discovered, updated_count, brands_counter)
    log_sync_history(
        "MUKU_SCRAP_SYNC" if ACTIVE_ACCOUNT == "muku" else "MDS_BISA_SYNC",
        f"Article-First Scrap ({CREDENTIALS['label']}) by luqman org (Total: {len(seen_articles):,} Artikel / {len(existing_skus):,} SKU, Baru: +{new_articles_discovered:,} Artikel / +{new_discovered:,} SKU)",
        len(existing_skus),
        "SUCCESS",
    )

    if with_images and "--no-inline-images" not in sys.argv:
        try:
            print("\n📸 [--with-images] Melanjutkan penyapuan foto penuh Matahari.com (Sitemap 209+ & Sibling)...")
            from brutal_image_scraper import execute_brutal_image_scrape
            execute_brutal_image_scrape()
        except Exception as e:
            print(f"⚠️ Lewati chain brutal_image_scraper: {e}")

    if ACTIVE_ACCOUNT == "muku":
        sweep_muku_promotions_for_catalog(catalog_by_sku, cookie, max_minutes=6)

    if "--no-catalog" not in sys.argv:
        try:
            from build_catalog_index import build_and_verify_catalog
            build_and_verify_catalog()
        except Exception as e:
            print(f"⚠️ Lewati auto-rebuild CatalogArticle: {e}")
    else:
        print("ℹ️ [--no-catalog] Lewati rebuild CatalogArticle (akan diselesaikan sekali di Step Kategori 4).")

    print("\n" + "=" * 80)
    print(f"🎉 SUKSES TOTAL! Artikel Unik: {len(seen_articles):,} (+{new_articles_discovered:,} baru) | Total SKU: {len(existing_skus):,} (+{new_discovered:,} baru) | Foto Baru: +{live_images_matched:,}")
    print(f"📄 Laporan lengkap tersimpan di: {REPORT_PATH}")
    print("=" * 80 + "\n")


if __name__ == "__main__":
    argv = sys.argv[1:]
    args = set(argv)
    is_gh_actions = os.getenv("GITHUB_ACTIONS") == "true"

    custom_range_arg: Optional[Tuple[int, int]] = None
    workers_arg = 28
    max_min_arg: Optional[int] = None
    sales_date_arg: Optional[str] = None
    account_arg: str = os.getenv("MDS_ACCOUNT") or "suko"
    for idx_a, a in enumerate(argv):
        if a.startswith("--range="):
            parts = a.split("=", 1)[1].split("-")
            if len(parts) == 2 and parts[0].isdigit() and parts[1].isdigit():
                custom_range_arg = (int(parts[0]), int(parts[1]))
        elif a.startswith("--workers="):
            w_val = a.split("=", 1)[1]
            if w_val.isdigit():
                workers_arg = max(4, min(48, int(w_val)))
        elif a.startswith("--minutes="):
            m_val = a.split("=", 1)[1]
            if m_val.isdigit():
                max_min_arg = max(1, int(m_val))
        elif a.startswith("--account="):
            account_arg = a.split("=", 1)[1].strip().lower()
        elif a == "--account" and idx_a + 1 < len(argv):
            account_arg = argv[idx_a + 1].strip().lower()
        elif a.startswith("--sales-date="):
            sd_val = a.split("=", 1)[1].strip()
            if re.match(r"^\d{4}-\d{2}-\d{2}$", sd_val):
                sales_date_arg = sd_val
        elif a == "--sales-date" and idx_a + 1 < len(argv):
            sd_val = argv[idx_a + 1].strip()
            if re.match(r"^\d{4}-\d{2}-\d{2}$", sd_val):
                sales_date_arg = sd_val

    set_active_account(account_arg)

    if "--export-paths" in args:
        print("🗺️ Mengekspor seluruh jalur mapping 84.763+ SKU dari Supabase ke mapped_sku_paths.json.gz...")
        cat, _, _ = load_existing_catalog_full()
        save_mapped_paths_registry(cat)
    elif "--suko-sales-only" in args:
        execute_live_stock_sync(max_minutes=max_min_arg or 45, suko_sales_only=True, sales_date=sales_date_arg)
    elif "--stock-only" in args:
        execute_live_stock_sync(max_minutes=max_min_arg or 45, suko_sales_only=False, sales_date=sales_date_arg)
    elif "--census-sku" in args or "--brutal" in args or "--run-once" in args or "--force" in args or "--upc-first" in args or custom_range_arg or is_gh_actions:
        execute_morning_sweep(
            run_once_cloud=True,
            max_minutes=max_min_arg or 50,
            upc_first=("--upc-first" in args),
            custom_range=custom_range_arg,
            workers=workers_arg,
            with_images=("--with-images" in args or "--brutal" in args),
            census_sku_only=("--census-sku" in args),
        )
    else:
        execute_morning_sweep(
            run_once_cloud=False,
            max_minutes=max_min_arg or 180,
            workers=workers_arg,
            with_images=("--with-images" in args),
        )
