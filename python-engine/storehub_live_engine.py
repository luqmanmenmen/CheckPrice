"""
storehub_live_engine.py
=============================================================================
PURE PYTHON REAL-TIME LIVE SCAN & STOCK ENGINE (0% External Pip Dependencies!)
Berjalan kilat (< 2,5 detik) di Vercel Python Function (`api/py_live.py` — sin1)
sekaligus dapat di-import langsung oleh GitHub Actions (`python-engine/`).

Fitur Inti:
1. 100% Stdlib Python (`urllib`, `concurrent.futures`, `json`, `re`, `base64`)
   -> Cold start < 300ms, bundle < 1 MB, tanpa `pandas` / dependency berat!
2. Routing Toko 100% Deterministik Berbasis Brand/Dept (ANTI RANCU SAAT STOK 0):
   - Brand/Dept mengandung SUKO -> akun role SUKO (`M223515`)
   - Brand/Dept mengandung ZES  -> slot akun role ZES
   - Selain itu (Multibrand)    -> akun role Mu+Ku (`M223708`)
3. Hard Deadline Cap (Max 6,5 detik) agar barcode tidak dikenal tidak pernah hang!
4. Turbo Matrix `checkItemStock` (1 tembakan = semua warna × ukuran dalam ~80ms)
   + Live Promo `checkItemPromotion` + Foto Studio Matahari (Filter Logo Abu-Abu).
5. Simpan langsung ke Turso Cloud (`Product` + `BarcodeAlias` + `CatalogArticle`)
   via HTTP Pipeline v2 + catat `analytics/hot-scan-seeds.json` untuk GitHub Burst.
=============================================================================
"""

from __future__ import annotations

import base64
import concurrent.futures
import json
import os
import re
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

STOREHUB_BASE = "https://storehub.mdsretailing.id"
LOGIN_URL = f"{STOREHUB_BASE}/login?next=%2F"
ITEM_CHECKER_URL = f"{STOREHUB_BASE}/item-checker"

ACTION_HASHES: Dict[str, str] = {
    "login": "603f9b4dfafaa0e65eec411a818c1ebcaa476b889f",
    "detail": "608e569ea77f8871817d11afae932ecea7d0fcbd09",
    "stock": "609a33bf9f07b2014de2e2303717cb33ca4a588314",
    "promo": "60a67fb6833e81c90695ed315a2dc4394535951a87",
}

NEXT_ROUTER_STATE_TREE = (
    "%5B%22%22%2C%7B%22children%22%3A%5B%22(app)%22%2C%7B%22children%22%3A%5B%22item-checker%22%2C"
    "%7B%22children%22%3A%5B%22__PAGE__%22%2C%7B%7D%2Cnull%2Cnull%2C0%5D%7D%2Cnull%2Cnull%2C0%5D%7D"
    "%2Cnull%2Cnull%2C4%5D%7D%2Cnull%2C%22refetch%22%2C24%5D"
)

MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15"

ACCOUNT_PROFILES: Dict[str, Dict[str, str]] = {
    "suko": {
        "label": "SUKO",
        "username": os.environ.get("MDS_USERNAME") or "M223515",
        "password": os.environ.get("MDS_PASSWORD") or "Luqmen123!",
        "tz": "Asia/Jakarta",
        "storage_path": "secrets/mds_cookie.txt",
        "env_cookie": "MDS_SESSION_COOKIE",
    },
    "muku": {
        "label": "Mu+Ku",
        "username": os.environ.get("MDS_MUKU_USERNAME") or "M223708",
        "password": os.environ.get("MDS_MUKU_PASSWORD") or "Aurel_28",
        "tz": "Asia/Jakarta",
        "storage_path": "secrets/mds_cookie_muku.txt",
        "env_cookie": "MDS_MUKU_SESSION_COOKIE",
    },
}

# Cache sesi ringan di memori warm Vercel container
_COOKIE_CACHE: Dict[str, Tuple[str, float]] = {}
_COOKIE_TTL_SEC = 10 * 60
_SSL_CTX = ssl.create_default_context()

# Sidik jari logo Matahari abu-abu (281x363 px)
_JUNK_CONTENT_LENGTHS = {2238, 3163}
_UUID_PLACEHOLDER_RE = re.compile(
    r"/files/product_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpe?g|png|webp)(?:\?|$)",
    re.IGNORECASE,
)


class _NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


_NO_REDIRECT_OPENER = urllib.request.build_opener(
    urllib.request.HTTPSHandler(context=_SSL_CTX),
    _NoRedirectHandler(),
)
_STD_OPENER = urllib.request.build_opener(
    urllib.request.HTTPSHandler(context=_SSL_CTX),
)


# ─────────────────────────────────────────────────────────────────────────────
#  1. UTILITAS NORMALISASI & HARGA (ANTI INFLASI 6-DESIMAL ERP!)
# ─────────────────────────────────────────────────────────────────────────────

def utc_iso_now() -> str:
    dt = datetime.now(timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}Z"


def calculate_ean13_check_digit(digits12: str) -> str:
    if len(digits12) != 12 or not digits12.isdigit():
        return ""
    total = sum(int(d) * (1 if i % 2 == 0 else 3) for i, d in enumerate(digits12))
    return str((10 - (total % 10)) % 10)


def normalize_code_key(raw: Any) -> str:
    return re.sub(r"[^A-Z0-9]", "", str(raw or "").strip().upper())


def parse_retail_price(raw: Any) -> Optional[int]:
    if raw is None or isinstance(raw, bool):
        return None
    if isinstance(raw, (int, float)):
        val = int(round(float(raw)))
    else:
        s = str(raw).strip()
        if not s:
            return None
        if re.match(r"^-?\d+\.\d+$", s):
            try:
                val = int(round(float(s)))
            except Exception:
                return None
        elif re.match(r"^-?\d{1,3}(?:\.\d{3})+(?:,\d+)?$", s):
            cleaned = s.split(",")[0].replace(".", "")
            val = int(cleaned) if cleaned.lstrip("-").isdigit() else 0
        elif re.match(r"^-?\d{1,3}(?:,\d{3})+(?:\.\d+)?$", s):
            cleaned = s.split(".")[0].replace(",", "")
            val = int(cleaned) if cleaned.lstrip("-").isdigit() else 0
        else:
            s_cut = re.sub(r"[.,]\d+$", "", s)
            digits = re.sub(r"[^0-9]", "", s_cut)
            if not digits:
                return None
            val = int(digits)

    if val <= 0:
        return None
    # Guard anti-inflasi 6-desimal (.000000 -> x1.000.000)
    if val >= 1_000_000_000 and val % 1_000_000 == 0:
        val = val // 1_000_000
    return val if 500 <= val < 500_000_000 else None


def parse_stock_int(raw: Any) -> Optional[int]:
    if raw is None or isinstance(raw, bool):
        return None
    s = str(raw).strip()
    if not s:
        return None
    try:
        return int(round(float(s)))
    except Exception:
        return None


def sanitize_article_code(raw: Any) -> str:
    s = str(raw or "").strip()
    if not s or s.lower() in ("none", "null", "n/a", "-"):
        return ""
    return s


def normalize_brand_and_dept(item: Dict[str, Any]) -> Tuple[str, str]:
    raw_group = str(item.get("Brand") or item.get("GroupName") or item.get("brand") or "").strip()
    raw_dept = str(
        item.get("DeptName") or item.get("Department") or item.get("dept") or raw_group or "MDS RETAIL"
    ).strip()
    raw_sub = str(item.get("SubclassName") or item.get("ClassName") or "").strip()
    raw_style = str(item.get("StyleCode") or item.get("styleCode") or "").strip().upper()
    raw_desc = str(item.get("Description") or item.get("ItemDescription") or "").strip().upper()
    combined = f"{raw_group} {raw_dept} {raw_sub} {raw_desc}".upper()

    if "MUKU" in combined or "MU+KU" in combined or raw_style.startswith("MK-") or "-MK" in raw_style:
        brand = "MUKU"
    elif "ZES" in combined:
        brand = "ZES"
    elif "SUKO" in combined:
        brand = "SUKO"
    elif "BYRCH" in combined:
        brand = "BYRCH & CO"
    elif "NEVADA" in combined:
        brand = "NEVADA"
    elif "STANLEY ADAMS" in combined:
        brand = "STANLEY ADAMS"
    elif "COLE" in combined:
        brand = "COLE"
    elif "CONNEXION" in combined:
        brand = "CONNEXION"
    elif "ST YVES" in combined or "ST. YVES" in combined:
        brand = "ST YVES"
    elif "VOLO" in combined:
        brand = "VOLO"
    elif "LITTLE M" in combined:
        brand = "LITTLE M"
    elif "PIPA" in combined:
        brand = "PIPA"
    elif "SUPER T" in combined:
        brand = "SUPER T"
    elif "DETAILS" in combined:
        brand = "DETAILS"
    elif "PHENOMENAL" in combined:
        brand = "PHENOMENAL"
    elif "AMERICAN JEANS" in combined:
        brand = "AMERICAN JEANS"
    elif "TRISSE" in combined:
        brand = "TRISSE"
    elif "FLADEO" in combined:
        brand = "FLADEO"
    elif "YONGKI" in combined:
        brand = "YONGKI KOMALADI"
    elif raw_sub and raw_dept.upper().startswith("AOS"):
        brand = raw_sub
    else:
        brand = raw_dept if (raw_dept and raw_dept != "MDS RETAIL") else (raw_group or "MUKU")

    return brand, raw_dept


def resolve_store_group(brand: str = "", dept: str = "", description: str = "") -> str:
    """Klasifikasi 100% deterministik: SUKO | ZES | MUKU."""
    b_up = f"{brand} {dept}".upper()
    if "SUKO" in b_up:
        return "SUKO"
    if "ZES" in b_up:
        return "ZES"
    if "SUKO" in (description or "").upper():
        return "SUKO"
    return "MUKU"


def resolve_owner_account(brand: str = "", dept: str = "", description: str = "") -> str:
    grp = resolve_store_group(brand, dept, description)
    return "suko" if grp == "SUKO" else "muku"


def classify_category_key(description: str = "", dept: str = "") -> str:
    txt = f"{description} {dept}".upper()
    if any(k in txt for k in ("JACKET", "JAKET", "HOODIE", "SWEATER", "CARDIGAN", "COAT", "BLAZER", "OUTER", "VEST", "KNIT")):
        return "JAKET"
    if any(k in txt for k in ("DRESS", "SKIRT", "ROK", "JUMPSUIT", "GAMIS", "KAFTAN", "TUNIK", "TUNIC")):
        return "DRESS_ROK"
    if any(k in txt for k in ("PANT", "JEANS", "DENIM", "CHINO", "TROUSER", "SHORT", "CELANA", "JOGGER", "LEGGING", "CULOTTE")):
        return "CELANA"
    if any(k in txt for k in ("SHOE", "SANDAL", "SEPATU", "SLIPPER", "SNEAKER", "LOAFER", "HEELS", "BOOTS", "FLATS")):
        return "SEPATU_SANDAL"
    if any(k in txt for k in ("BAG", "TAS", "WALLET", "DOMPET", "BELT", "CAP", "HAT", "TOPI", "POUCH", "BACKPACK", "SOCK", "KAOS KAKI")):
        return "TAS_AKSESORIS"
    if any(k in txt for k in ("SERUM", "CREAM", "LOTION", "LIP", "PERFUME", "PARFUM", "BEAUTY", "COSMETIC", "MASK", "TONER", "CLEANSER")):
        return "BEAUTY"
    if any(k in txt for k in ("BOXER", "BRIEF", "BRA", "PANTY", "UNDERWEAR", "SLEEP", "PAJAMA", "PIYAMA", "SINGLET")):
        return "TIDUR_DALAM"
    if any(k in txt for k in ("SPORT", "ACTIVE", "GYM", "RUNNING", "WORKOUT")):
        return "SPORT"
    if any(k in txt for k in ("SHIRT", "TEE", "T-SHIRT", "TOP", "BLOUSE", "POLO", "KAOS", "KEMEJA", "TANK", "CROP", "CAMI")):
        return "ATASAN"
    return "OTHER"


# ─────────────────────────────────────────────────────────────────────────────
#  2. TURSO CLOUD HTTP PIPELINE v2 CLIENT (0% External Deps, ~25ms dari sin1!)
# ─────────────────────────────────────────────────────────────────────────────

def _get_turso_creds() -> Tuple[str, str]:
    url = (os.environ.get("TURSO_DATABASE_URL") or "").strip()
    token = (os.environ.get("TURSO_AUTH_TOKEN") or "").strip()
    if url.startswith("libsql://"):
        url = "https://" + url[len("libsql://"):]
    return url.rstrip("/"), token


def _to_hrana_arg(val: Any) -> Dict[str, Any]:
    if val is None:
        return {"type": "null"}
    if isinstance(val, bool):
        return {"type": "integer", "value": "1" if val else "0"}
    if isinstance(val, int):
        return {"type": "integer", "value": str(val)}
    if isinstance(val, float):
        return {"type": "float", "value": val}
    if isinstance(val, (list, dict)):
        return {"type": "text", "value": json.dumps(val, ensure_ascii=False)}
    return {"type": "text", "value": str(val)}


def _from_hrana_cell(cell: Dict[str, Any]) -> Any:
    t = cell.get("type")
    if t == "null" or "value" not in cell:
        return None
    v = cell["value"]
    if t == "integer":
        try:
            return int(v)
        except Exception:
            return v
    if t == "float":
        try:
            return float(v)
        except Exception:
            return v
    return v


def turso_pipeline(statements: List[Tuple[str, Tuple[Any, ...]]], timeout: float = 8.0) -> List[List[Dict[str, Any]]]:
    url, token = _get_turso_creds()
    if not url or not token or not statements:
        return [[] for _ in statements]
    requests_list: List[Dict[str, Any]] = []
    for sql, params in statements:
        stmt_obj: Dict[str, Any] = {"sql": sql}
        if params:
            stmt_obj["args"] = [_to_hrana_arg(p) for p in params]
        requests_list.append({"type": "execute", "stmt": stmt_obj})
    requests_list.append({"type": "close"})

    body = json.dumps({"requests": requests_list}).encode("utf-8")
    req = urllib.request.Request(
        f"{url}/v2/pipeline",
        data=body,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with _STD_OPENER.open(req, timeout=timeout) as resp:
        data = json.loads(resp.read().decode("utf-8"))

    out: List[List[Dict[str, Any]]] = []
    for res_item in (data.get("results") or [])[: len(statements)]:
        if res_item.get("type") != "ok":
            out.append([])
            continue
        result = ((res_item.get("response") or {}).get("result")) or {}
        cols = [c.get("name") for c in (result.get("cols") or [])]
        rows_raw = result.get("rows") or []
        parsed_rows: List[Dict[str, Any]] = []
        for r in rows_raw:
            parsed_rows.append({cols[i]: _from_hrana_cell(r[i]) for i in range(min(len(cols), len(r)))})
        out.append(parsed_rows)
    return out


def turso_query(sql: str, params: Tuple[Any, ...] = (), timeout: float = 6.0) -> List[Dict[str, Any]]:
    res = turso_pipeline([(sql, params)], timeout=timeout)
    return res[0] if res else []


def storage_read_text(path: str, timeout: float = 3.0) -> Optional[str]:
    clean = path.strip().lstrip("/")
    rows = turso_query(
        'SELECT "dataBase64" FROM "StorageChunk" WHERE path = ? ORDER BY "chunkIndex" ASC',
        (clean,),
        timeout=timeout,
    )
    if not rows:
        return None
    parts = [base64.b64decode(str(r.get("dataBase64") or "")) for r in rows]
    return b"".join(parts).decode("utf-8", errors="ignore")


def storage_write_bytes(path: str, payload: bytes, content_type: str = "application/json", timeout: float = 5.0) -> None:
    clean = path.strip().lstrip("/")
    chunk_size = 1_500_000
    chunks = [payload[i : i + chunk_size] for i in range(0, len(payload), chunk_size)] or [b""]
    now = utc_iso_now()
    stmts: List[Tuple[str, Tuple[Any, ...]]] = [
        ('DELETE FROM "StorageChunk" WHERE path = ?', (clean,)),
    ]
    for idx, ch in enumerate(chunks):
        stmts.append(
            (
                'INSERT INTO "StorageChunk" (path, "chunkIndex", "dataBase64") VALUES (?, ?, ?)',
                (clean, idx, base64.b64encode(ch).decode("ascii")),
            )
        )
    stmts.append(
        (
            'INSERT INTO "StorageObject" (path, "contentType", "sizeBytes", "chunkCount", "updatedAt") '
            'VALUES (?, ?, ?, ?, ?) '
            'ON CONFLICT(path) DO UPDATE SET '
            '"contentType"=excluded."contentType", "sizeBytes"=excluded."sizeBytes", '
            '"chunkCount"=excluded."chunkCount", "updatedAt"=excluded."updatedAt"',
            (clean, content_type, len(payload), len(chunks), now),
        )
    )
    turso_pipeline(stmts, timeout=timeout)


def _deserialize_product_row(row: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(row)
    imgs_raw = out.get("images")
    if isinstance(imgs_raw, str):
        try:
            parsed = json.loads(imgs_raw)
            out["images"] = parsed if isinstance(parsed, list) else []
        except Exception:
            out["images"] = []
    elif not isinstance(imgs_raw, list):
        out["images"] = []
    # Sanitasi harga anti-inflasi
    for pf in ("hargaNormal", "hargaPromo"):
        if out.get(pf) is not None:
            fixed = parse_retail_price(out.get(pf))
            if fixed is not None:
                out[pf] = fixed
    return out


# ─────────────────────────────────────────────────────────────────────────────
#  3. STOREHUB HTTP CLIENT (AUTO-LOGIN, DYNAMIC HASH, DETAIL, MATRIX, PROMO)
# ─────────────────────────────────────────────────────────────────────────────

def _http_post_raw(
    url: str,
    headers: Dict[str, str],
    body: bytes,
    timeout: float = 4.5,
) -> Tuple[int, Dict[str, str], List[str], str]:
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with _NO_REDIRECT_OPENER.open(req, timeout=timeout) as resp:
            status = resp.status
            hdrs = {k.lower(): v for k, v in resp.headers.items()}
            set_cookies = resp.headers.get_all("Set-Cookie") or []
            text = resp.read().decode("utf-8", errors="ignore")
            return status, hdrs, set_cookies, text
    except urllib.error.HTTPError as e:
        hdrs = {k.lower(): v for k, v in (e.headers.items() if e.headers else [])}
        set_cookies = e.headers.get_all("Set-Cookie") if e.headers else []
        try:
            text = e.read().decode("utf-8", errors="ignore")
        except Exception:
            text = ""
        return e.code, hdrs, set_cookies or [], text
    except Exception:
        return 0, {}, [], ""


def _http_get_text(url: str, headers: Optional[Dict[str, str]] = None, timeout: float = 3.0) -> Tuple[int, str]:
    req = urllib.request.Request(url, headers=headers or {"User-Agent": MOBILE_UA}, method="GET")
    try:
        with _STD_OPENER.open(req, timeout=timeout) as resp:
            return resp.status, resp.read().decode("utf-8", errors="ignore")
    except urllib.error.HTTPError as e:
        return e.code, ""
    except Exception:
        return 0, ""


def _merge_set_cookies(current_cookie: str, set_cookies: List[str]) -> Tuple[str, bool]:
    if not set_cookies:
        return current_cookie, False
    kv: Dict[str, str] = {}
    for part in (current_cookie or "").split(";"):
        if "=" in part:
            k, v = part.strip().split("=", 1)
            if k:
                kv[k.strip()] = v.strip()
    rotated_mso = False
    for sc in set_cookies:
        first = sc.split(";")[0].strip()
        if "=" in first:
            k, v = first.split("=", 1)
            k = k.strip()
            v = v.strip()
            if k:
                if k == "mso_session" and v and kv.get(k) != v:
                    rotated_mso = True
                kv[k] = v
    merged = "; ".join(f"{k}={v}" for k, v in kv.items())
    return merged, rotated_mso


def resolve_action_hashes(cookie: str = "", include_login: bool = False) -> bool:
    target_url = LOGIN_URL if include_login else ITEM_CHECKER_URL
    hdrs = {"User-Agent": MOBILE_UA}
    if cookie:
        hdrs["Cookie"] = cookie
    status, html = _http_get_text(target_url, headers=hdrs, timeout=3.0)
    if status != 200 or not html:
        return False
    scripts = list(dict.fromkeys(re.findall(r'src="(/_next/static/chunks/[^"]+\.js)"', html)))[:10]
    if not scripts:
        return False

    resolved = False

    def _fetch_js(path: str) -> str:
        _, txt = _http_get_text(f"{STOREHUB_BASE}{path}", timeout=2.5)
        return txt

    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        for js_text in pool.map(_fetch_js, scripts):
            if not js_text:
                continue
            for key, fn_name in (
                ("login", "login"),
                ("detail", "checkItemDetail"),
                ("stock", "checkItemStock"),
                ("promo", "checkItemPromotion"),
            ):
                m = re.search(rf'createServerReference\)?\("([a-f0-9]{{40,44}})"[^)]{{0,160}}"{fn_name}"', js_text)
                if m:
                    ACTION_HASHES[key] = m.group(1)
                    resolved = True
    return resolved


def _encode_multipart_login(username: str, password: str, tz: str) -> Tuple[bytes, str]:
    boundary = f"----WebKitFormBoundary{int(time.time() * 1000)}"
    # KRUSIAL (React 19 decodeReplyFromBusboy): field `_1_*` WAJIB sebelum `'0'`!
    fields = [
        ("_1_next", "/"),
        ("_1_username", username),
        ("_1_password", password),
        ("_1_tz", tz),
        ("0", '[{},"$K1"]'),
    ]
    lines: List[bytes] = []
    for name, val in fields:
        lines.append(f"--{boundary}\r\n".encode("utf-8"))
        lines.append(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode("utf-8"))
        lines.append(f"{val}\r\n".encode("utf-8"))
    lines.append(f"--{boundary}--\r\n".encode("utf-8"))
    return b"".join(lines), f"multipart/form-data; boundary={boundary}"


def login_storehub_direct(account: str = "suko") -> str:
    prof = ACCOUNT_PROFILES.get(account, ACCOUNT_PROFILES["suko"])
    body, ct = _encode_multipart_login(prof["username"], prof["password"], prof["tz"])

    def _attempt(action_hash: str) -> Tuple[int, str]:
        hdrs = {
            "Accept": "text/x-component",
            "Content-Type": ct,
            "Next-Action": action_hash,
            "User-Agent": MOBILE_UA,
            "Referer": LOGIN_URL,
            "Origin": STOREHUB_BASE,
        }
        status, _, set_cookies, _ = _http_post_raw(LOGIN_URL, hdrs, body, timeout=5.0)
        cookie_str, _ = _merge_set_cookies("", set_cookies)
        return status, cookie_str

    status, cookie_str = _attempt(ACTION_HASHES["login"])
    if "mso_session=" not in cookie_str and status in (404, 400, 500):
        if resolve_action_hashes(include_login=True):
            _, cookie_str = _attempt(ACTION_HASHES["login"])

    if "mso_session=" in cookie_str:
        _COOKIE_CACHE[account] = (cookie_str, time.time())
        try:
            storage_write_bytes(prof["storage_path"], cookie_str.encode("utf-8"), "text/plain", timeout=3.0)
        except Exception:
            pass
        return cookie_str
    return ""


def get_storehub_cookie(account: str = "suko", force_refresh: bool = False) -> str:
    prof = ACCOUNT_PROFILES.get(account, ACCOUNT_PROFILES["suko"])
    now = time.time()
    if not force_refresh:
        cached = _COOKIE_CACHE.get(account)
        if cached and "mso_session=" in cached[0] and (now - cached[1]) < _COOKIE_TTL_SEC:
            return cached[0]
        # Cek Turso Storage dulu (~30ms dari sin1!) agar tidak sering login ulang
        try:
            txt = storage_read_text(prof["storage_path"], timeout=2.0)
            if txt and "mso_session=" in txt:
                c = txt.strip()
                _COOKIE_CACHE[account] = (c, now)
                return c
        except Exception:
            pass
        env_c = (os.environ.get(prof["env_cookie"]) or "").strip()
        if "mso_session=" in env_c:
            _COOKIE_CACHE[account] = (env_c, now)
            return env_c

    return login_storehub_direct(account)


def _save_rotated_cookie(account: str, cookie_str: str) -> None:
    if not cookie_str or "mso_session=" not in cookie_str:
        return
    _COOKIE_CACHE[account] = (cookie_str, time.time())
    prof = ACCOUNT_PROFILES.get(account)
    if prof:
        try:
            storage_write_bytes(prof["storage_path"], cookie_str.encode("utf-8"), "text/plain", timeout=2.0)
        except Exception:
            pass


def _storehub_action_post(action_key: str, payload_list: List[Any], cookie: str, account: str, timeout: float = 3.8):
    hdrs = {
        "Accept": "text/x-component",
        "Content-Type": "text/plain;charset=UTF-8",
        "Cookie": cookie,
        "Next-Action": ACTION_HASHES[action_key],
        "Referer": ITEM_CHECKER_URL,
        "User-Agent": MOBILE_UA,
        "Next-Router-State-Tree": NEXT_ROUTER_STATE_TREE,
    }
    body = json.dumps(payload_list).encode("utf-8")
    status, resp_hdrs, set_cookies, text = _http_post_raw(ITEM_CHECKER_URL, hdrs, body, timeout=timeout)
    merged_cookie, rotated = _merge_set_cookies(cookie, set_cookies)
    if rotated:
        _save_rotated_cookie(account, merged_cookie)

    if status == 0:
        return {"offline": True, "cookie": merged_cookie}
    if status == 404:
        return {"action_expired": True, "cookie": merged_cookie}
    redir = (resp_hdrs.get("location") or resp_hdrs.get("x-action-redirect") or "").lower()
    if status == 401 or (300 <= status < 400 and "login" in redir) or "login" in redir:
        return {"auth_failed": True, "cookie": merged_cookie}
    if status == 504 or "504 Gateway" in text or "no route to host" in text or "unable to open tcp connection" in text:
        return {"offline": True, "cookie": merged_cookie}
    if "NEXT_REDIRECT" in text and "/login" in text:
        return {"auth_failed": True, "cookie": merged_cookie}
    return {"ok": True, "text": text, "cookie": merged_cookie}


def query_detail(kind: str, code: str, cookie: str, account: str, timeout: float = 3.8) -> Dict[str, Any]:
    res = _storehub_action_post("detail", [kind, code], cookie, account, timeout=timeout)
    if not res.get("ok"):
        return res

    text = res["text"]
    all_items: List[Dict[str, Any]] = []
    bc_fields = ("VendorBarcode", "vendorBarcode", "Barcode", "barcode", "UPC", "upc", "EAN", "ean", "ItemLookupCode", "AlternateCode")

    for line in text.split("\n"):
        ci = line.find(":")
        if 0 < ci <= 3:
            try:
                parsed = json.loads(line[ci + 1 :])
            except Exception:
                continue
            if not isinstance(parsed, dict):
                continue
            if parsed.get("error"):
                err_s = str(parsed["error"]).lower()
                if "no route to host" in err_s or "tcp connection" in err_s:
                    return {"offline": True, "cookie": res["cookie"]}
                return {"items": [], "cookie": res["cookie"]}
            data = (parsed.get("result") or {}).get("data")
            if isinstance(data, dict) and data:
                for sku_key, rows in data.items():
                    row_list = rows if isinstance(rows, list) else ([rows] if isinstance(rows, dict) else [])
                    if not row_list:
                        continue
                    harvested: List[str] = []
                    chosen = row_list[-1]
                    for r in row_list:
                        if not isinstance(r, dict):
                            continue
                        for bf in bc_fields:
                            val = str(r.get(bf) or "").strip()
                            if val and val.lower() not in ("none", "null", "-") and val not in harvested:
                                harvested.append(val)
                        if kind == "upc" and str(r.get("VendorBarcode") or "").strip().upper() == code.upper():
                            chosen = r
                    if isinstance(chosen, dict) and (chosen.get("SKU") or sku_key):
                        copy_item = dict(chosen)
                        if not copy_item.get("SKU"):
                            copy_item["SKU"] = str(sku_key)
                        copy_item["_all_barcodes"] = harvested
                        all_items.append(copy_item)
                if all_items:
                    break
    return {"items": all_items, "cookie": res["cookie"]}


def query_stock_matrix(sku: str, cookie: str, account: str, timeout: float = 3.5) -> Dict[str, Any]:
    res = _storehub_action_post("stock", ["sku", sku], cookie, account, timeout=timeout)
    if not res.get("ok"):
        return res
    rows: List[Dict[str, Any]] = []
    for line in res["text"].split("\n"):
        ci = line.find(":")
        if 0 < ci <= 3:
            try:
                parsed = json.loads(line[ci + 1 :])
            except Exception:
                continue
            if not isinstance(parsed, dict):
                continue
            data = (parsed.get("result") or {}).get("data")
            if isinstance(data, list) and data:
                rows = [r for r in data if isinstance(r, dict)]
                break
    return {"rows": rows, "cookie": res["cookie"]}


def _norm_color_key(val: Any) -> str:
    return re.sub(r"[^A-Z0-9]+", "", str(val or "").strip().upper())


def match_matrix_qty(matrix_rows: List[Dict[str, Any]], color: Any, size: Any) -> Optional[int]:
    if not matrix_rows:
        return None
    col_raw = str(color or "").strip().upper()
    col_norm = normalize_code_key(col_raw)
    sz_raw = str(size or "").strip().upper()
    sz_norm = normalize_code_key(sz_raw)

    matched_row: Optional[Dict[str, Any]] = None
    if len(matrix_rows) == 1:
        matched_row = matrix_rows[0]
    else:
        for r in matrix_rows:
            r_col = str(r.get("COLOR & SIZE") or r.get("COLOR") or r.get("Color") or "").strip().upper()
            r_norm = normalize_code_key(r_col)
            if (col_raw and r_col == col_raw) or (col_norm and r_norm == col_norm):
                matched_row = r
                break
        if matched_row is None and col_norm:
            for r in matrix_rows:
                r_col = str(r.get("COLOR & SIZE") or r.get("COLOR") or r.get("Color") or "").strip().upper()
                r_norm = normalize_code_key(r_col)
                if r_norm and len(r_norm) >= 3 and (r_norm in col_norm or col_norm in r_norm):
                    matched_row = r
                    break
    if matched_row is None:
        return None

    size_entries = [
        (str(k).strip().upper(), normalize_code_key(k), v)
        for k, v in matched_row.items()
        if str(k).strip().upper() not in ("COLOR & SIZE", "COLOR", "TOTAL", "GRAND TOTAL")
    ]
    if not size_entries:
        return None
    for k_raw, k_norm, v in size_entries:
        if (sz_raw and k_raw == sz_raw) or (sz_norm and k_norm == sz_norm):
            return parse_stock_int(v)
    if len(size_entries) == 1:
        return parse_stock_int(size_entries[0][2])
    return None


def query_promotion_checked(kind: str, code: str, cookie: str, account: str, normal_price: int, timeout: float = 3.0) -> Dict[str, Any]:
    """
    Menarik Detail Promo Live dari StoreHub MDS Retailing (`checkItemPromotion`).
    Mengembalikan `{"checked": bool, "promo": dict | None, "rawCount": int}` agar pemanggil tahu
    bedanya antara 'API gagal/offline' (`checked=False`) vs 'MDS mengonfirmasi TIDAK ADA PROMO / Harga Normal' (`checked=True, promo=None`).
    Mendukung penuh:
    - Line Discount (%) -> mis. MUKU SBY 30%
    - Special Price (ActionId='Others' / 'Line Discount', DiscountType='Disc. Amount', BR-NAME 'BR - ... - SP - 1 - 129000.00')
    - Potongan Nominal (Disc. Amount non-SP)
    - Promo Bundling / Bersyarat (Buy 2, B1G1, B2G1, Min. Belanja)
    """
    res = _storehub_action_post("promo", [kind, code], cookie, account, timeout=timeout)
    if not res.get("ok"):
        return {"checked": False, "promo": None, "rawCount": 0, "offline": bool(res.get("offline")), "auth_failed": bool(res.get("auth_failed")), "action_expired": bool(res.get("action_expired"))}

    promos: List[Dict[str, Any]] = []
    parsed_any = False
    for line in res["text"].split("\n"):
        ci = line.find(":")
        if 0 < ci <= 3:
            try:
                parsed = json.loads(line[ci + 1 :])
            except Exception:
                continue
            if isinstance(parsed, dict) and "result" in parsed:
                parsed_any = True
            data = ((parsed.get("result") or {}).get("data")) if isinstance(parsed, dict) else None
            if isinstance(data, dict):
                parsed_any = True
                for rows in data.values():
                    if isinstance(rows, list):
                        promos.extend([r for r in rows if isinstance(r, dict)])
            elif isinstance(data, list):
                parsed_any = True
                promos.extend([r for r in data if isinstance(r, dict)])

    if not promos:
        return {"checked": parsed_any, "promo": None, "rawCount": 0}

    best: Optional[Dict[str, Any]] = None
    for pr in promos:
        brid = str(pr.get("BusinessRuleId") or pr.get("BRID") or "").strip()
        dtype = str(pr.get("DiscountType") or "").strip()
        msg = str(pr.get("Message") or "").strip()
        br_name = str(pr.get("BusinessRuleName") or "").strip()
        ev_desc = str(pr.get("EventDesc") or "").strip()
        action_id = str(pr.get("ActionId") or pr.get("ActionID") or "").strip()

        clean_ev = "" if ev_desc.lower() in ("scan item", "scan", "item") else ev_desc
        if br_name and msg and br_name.lower() not in msg.lower():
            acara = f"{br_name} — {msg}"[:120]
        else:
            acara = (br_name or msg or clean_ev or "Promo Live Store")[:120]

        try:
            pct = float(pr.get("DiscountPercentage") or 0)
        except Exception:
            pct = 0.0
        try:
            amt = float(pr.get("DiscountAmount") or 0)
        except Exception:
            amt = 0.0

        # Deteksi promo bersyarat / bundling (Buy 2, B1G1, B2G1, Min. Belanja) vs promo satuan langsung (Line Discount & SP Others)
        rule_text = f"{br_name} {msg} {action_id} {dtype}".lower()
        is_conditional_bundle = bool(
            re.search(
                r"\b(buy\s*[2-9]|beli\s*[2-9]|buy\s*1\s*get\s*1|b1g1|b2g1|get\s*\d|gratis\s*\d|"
                r"min(?:imal)?\.?\s*(?:belanja|pembelian|trx|transaksi|\d+\s*pcs)|bundle|bundling|paket)\b",
                rule_text,
            )
            or ("transaction" in action_id.lower())
        )
        # Di MDS StoreHub, Special Price (SP) memakai ActionId="Others" + DiscountType="Disc. Amount" + BR-NAME "... - SP - 1 - 129000.00"!
        is_direct_item_discount = (not is_conditional_bundle) and (
            (not action_id)
            or any(k in action_id.lower() for k in ("line", "other", "item", "price", "sp"))
        )

        is_pct = ("percent" in dtype.lower() and pct > 0) or (pct > 0 and amt <= 0)
        is_amt = (any(k in dtype.lower() for k in ("amount", "price", "rupiah", "special", "nett")) and amt > 0) or (amt > 0 and not is_pct)

        promo_meta = {
            "brid": brid,
            "brName": br_name,
            "message": msg,
            "discType": dtype,
            "discAmount": amt,
            "discPercentage": pct,
            "actionId": action_id,
            "eventDesc": ev_desc,
        }

        cand: Optional[Dict[str, Any]] = None
        if is_conditional_bundle:
            cand = {
                "hargaPromo": None,
                "diskon": (br_name or msg)[:40],
                "discountType": "BUNDLING",
                "acara": acara,
                "promoDetail": promo_meta,
            }
        elif is_pct and is_direct_item_discount and normal_price > 0 and 1 <= pct <= 95:
            hp = int(round((normal_price * (100 - pct)) / 100))
            if 0 < hp < normal_price:
                pct_str = f"{int(pct)}%" if pct == int(pct) else f"{pct:g}%"
                cand = {
                    "hargaPromo": hp,
                    "diskon": pct_str,
                    "discountType": "PERCENT",
                    "acara": acara,
                    "promoDetail": promo_meta,
                }
        elif is_amt and is_direct_item_discount and amt > 0:
            # Deteksi apakah amt adalah HARGA JADI (Special Price / SP) atau POTONGAN NOMINAL!
            # Di MDS Retailing: BR-NAME "BR - 483233872 - SP - 1 - 129000.00" atau ActionId="Others" dengan amt Rp 129.000 adalah HARGA SPESIAL!
            has_sp_marker = any(k in dtype.lower() for k in ("special", "fixed", "nett", "price")) or bool(
                re.search(r"(?:\b|-)(?:sp|special\s*price|harga\s*spesial)(?:\b|-|\d)", f"{msg} {br_name}", re.IGNORECASE)
            )
            is_others_sp = ("other" in action_id.lower()) and (normal_price <= 0 or (amt >= normal_price * 0.2 and amt < normal_price))
            is_sp = has_sp_marker or is_others_sp
            hp = int(round(amt)) if (is_sp or normal_price <= 0) else int(round(normal_price - amt))
            if hp > 0 and (normal_price <= 0 or hp < normal_price):
                cand = {
                    "hargaPromo": hp,
                    "diskon": f"SP {hp}" if is_sp else f"POT Rp {int(round(amt)):,}".replace(",", "."),
                    "discountType": f"HARGA SPESIAL {hp}" if is_sp else "SPECIAL_PRICE",
                    "acara": acara,
                    "promoDetail": promo_meta,
                }
        elif (msg or br_name) and re.search(r"(buy|beli|get|gratis|disc|diskon|promo|off|%)", f"{msg} {br_name}", re.IGNORECASE):
            cand = {
                "hargaPromo": None,
                "diskon": (br_name or msg)[:40],
                "discountType": "BUNDLING",
                "acara": acara,
                "promoDetail": promo_meta,
            }

        if cand:
            if not best:
                best = cand
            elif cand["hargaPromo"] is not None and (best["hargaPromo"] is None or cand["hargaPromo"] < best["hargaPromo"]):
                best = cand
    return {"checked": True, "promo": best, "rawCount": len(promos)}


def query_promotion(kind: str, code: str, cookie: str, account: str, normal_price: int, timeout: float = 3.0) -> Optional[Dict[str, Any]]:
    return query_promotion_checked(kind, code, cookie, account, normal_price, timeout=timeout).get("promo")


# ─────────────────────────────────────────────────────────────────────────────
#  4. FOTO STUDIO MATAHARI + IMAGE QUALITY CONTROLLER (TOLAK LOGO ABU-ABU!)
# ─────────────────────────────────────────────────────────────────────────────

def _is_junk_image_url(url: str) -> bool:
    u = str(url or "").strip()
    if not u or not u.startswith("http"):
        return True
    if _UUID_PLACEHOLDER_RE.search(u):
        return True
    fn = u.split("?")[0].split("/")[-1].lower()
    if any(b in fn for b in ("banner", "logo", "icon", "badge", "chart", "size", "panduan", "placeholder", ".svg", ".gif")):
        return True
    return False


def _verify_image_not_grey_logo(url: str, timeout: float = 1.6) -> bool:
    if _is_junk_image_url(url):
        return False
    req = urllib.request.Request(url, headers={"User-Agent": MOBILE_UA}, method="HEAD")
    try:
        with _STD_OPENER.open(req, timeout=timeout) as resp:
            if resp.status != 200:
                return False
            cl = resp.headers.get("Content-Length")
            if cl and cl.isdigit() and int(cl) in _JUNK_CONTENT_LENGTHS:
                return False
            return True
    except Exception:
        return False


def _extract_skus_from_image_url(url: str) -> List[str]:
    """Ekstrak semua nomor SKU 7-9 digit yang tertanam pada nama file URL CDN (mis. 72410932-1.jpg, 9172-45411929-IMG1.jpg)."""
    fn = str(url or "").split("?")[0].split("/")[-1]
    if not fn:
        return []
    return re.findall(r"(?<!\d)(\d{7,9})(?!\d)", fn)


def _filter_strict_color_images(
    urls: List[str],
    same_color_skus: Optional[set] = None,
    other_color_skus: Optional[set] = None,
) -> List[str]:
    """
    Filter super ketat anti foto campur warna:
    1. Tolak semua URL yang mengandung SKU milik warna lain (`other_color_skus`).
    2. Jika `same_color_skus` tersedia & ada URL yang secara eksplisit memuat SKU warna aktif,
       buang URL lain yang membawa SKU 7-9 digit berbeda (foto warna lain yang belum terdaftar di DB!).
    """
    same_set = {str(s).strip() for s in (same_color_skus or set()) if str(s).strip()}
    other_set = {str(s).strip() for s in (other_color_skus or set()) if str(s).strip()} - same_set

    cleaned: List[str] = []
    seen: set = set()
    for u in urls:
        us = str(u or "").strip()
        if not us or us in seen or _is_junk_image_url(us):
            continue
        skus_in_url = _extract_skus_from_image_url(us)
        # Tolak mutlak bila URL membawa SKU milik warna lain!
        if other_set and any(s in other_set for s in skus_in_url):
            continue
        seen.add(us)
        cleaned.append(us)

    if not cleaned:
        return []

    # Jika ada URL yang eksplisit bertag SKU warna aktif, kunci galeri HANYA pada warna aktif
    # (buang URL yang bertag SKU berbeda yang bukan anggota warna aktif!)
    if same_set:
        explicit_same = [
            u for u in cleaned
            if any(s in same_set for s in _extract_skus_from_image_url(u))
        ]
        if explicit_same:
            return explicit_same
        # Jika ada other_set (produk multi-warna), tapi semua URL membawa SKU asing lain yang bukan same_set, jangan pakai!
        if other_set:
            non_foreign = [
                u for u in cleaned
                if not _extract_skus_from_image_url(u)
            ]
            return non_foreign

    # Fallback proteksi tambahan: bila URL #1 bertag 1 SKU spesifik (misal 72410932),
    # buang slide berikutnya yang bertag SKU 7-9 digit BERBEDA (mencegah slide 1 hijau, slide 2 biru!)
    first_skus = set(_extract_skus_from_image_url(cleaned[0]))
    if first_skus:
        allowed_skus = first_skus | same_set
        strict_single = [
            u for u in cleaned
            if (not _extract_skus_from_image_url(u))
            or any(s in allowed_skus for s in _extract_skus_from_image_url(u))
        ]
        if strict_single:
            return strict_single
    return cleaned


def lookup_matahari_images(
    sku: str = "",
    article: str = "",
    barcode: str = "",
    same_color_skus: Optional[set] = None,
    other_color_skus: Optional[set] = None,
    target_color: str = "",
) -> List[str]:
    clean_sku = str(sku or "").strip()
    clean_art = str(article or "").strip()
    clean_bc = str(barcode or "").strip()
    same_set = {str(s).strip() for s in (same_color_skus or set()) if str(s).strip()}
    if clean_sku:
        same_set.add(clean_sku)
    other_set = {str(s).strip() for s in (other_color_skus or set()) if str(s).strip()} - same_set
    target_color_norm = _norm_color_key(target_color)

    # Prioritaskan pencarian berdasarkan SKU (dan barcode) agar langsung mengenai halaman warna tepat;
    # jangan mengandalkan article saja jika bisa mencampur warna lain!
    queries = [q for q in dict.fromkeys([clean_sku, clean_bc, clean_art]) if q and len(q) >= 4][:2]
    if not queries:
        return []

    found_handles: List[str] = []

    def _fetch_suggest(q: str) -> Tuple[List[str], List[str]]:
        qs = urllib.parse.urlencode({"q": q, "resources[type]": "product"})
        status, txt = _http_get_text(f"https://matahari.com/search/suggest.json?{qs}", timeout=1.6)
        if status != 200 or not txt:
            return [], []
        try:
            data = json.loads(txt)
            prods = (((data.get("resources") or {}).get("results") or {}).get("products")) or []
        except Exception:
            return [], []
        q_low = q.lower()
        found: List[str] = []
        handles: List[str] = []
        for p in prods:
            img = str(p.get("image") or "").strip()
            if img.startswith("//"):
                img = f"https:{img}"
            handle = str(p.get("handle") or "").strip()
            url_p = str(p.get("url") or "").lower()
            title = str(p.get("title") or "").lower()
            matched_q = (
                q_low in img.lower()
                or q_low in handle.lower()
                or q_low in url_p
                or (clean_art and clean_art.lower() in title)
            )
            if not matched_q:
                continue
            if handle and handle not in handles:
                handles.append(handle)
            if "cdn.shopify.com/s/files/1/0666/9212/0727/" in img and not _is_junk_image_url(img):
                if img not in found:
                    found.append(img)
        return found, handles

    candidates: List[str] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(queries)) as pool:
        for res_imgs, res_handles in pool.map(_fetch_suggest, queries):
            for u in res_imgs:
                if u not in candidates:
                    candidates.append(u)
            for h in res_handles:
                if h not in found_handles:
                    found_handles.append(h)

    # Ambil sudut foto dari Ajax Shopify `/products/<handle>.js` SECARA KETAT PER WARNA!
    # JANGAN pernah mengambil mentah semua `pjs["images"]` bila produk punya >1 warna karena akan mencampur warna lain!
    if found_handles:
        st_js, txt_js = _http_get_text(f"https://matahari.com/products/{found_handles[0]}.js", timeout=1.6)
        if st_js == 200 and txt_js:
            try:
                pjs = json.loads(txt_js)
                variants = pjs.get("variants") or []
                raw_imgs = pjs.get("images") or []

                # 1. Identifikasi SKU & featured_image milik warna target vs warna lain di halaman Shopify ini
                shopify_same_skus = set(same_set)
                shopify_other_skus = set(other_set)
                matched_featured: List[str] = []
                distinct_colors = set()

                for v in variants:
                    if not isinstance(v, dict):
                        continue
                    v_sku = str(v.get("sku") or "").strip()
                    v_opt_text = " ".join(
                        str(v.get(k) or "") for k in ("option1", "option2", "option3", "title")
                    )
                    v_col_norm = _norm_color_key(v.get("option1") or "")
                    if v_col_norm:
                        distinct_colors.add(v_col_norm)
                    is_same_v = (
                        (v_sku and v_sku in same_set)
                        or (target_color_norm and (target_color_norm == v_col_norm or target_color_norm in _norm_color_key(v_opt_text)))
                    )
                    if is_same_v:
                        if v_sku:
                            shopify_same_skus.add(v_sku)
                        f_img = v.get("featured_image")
                        f_src = f_img.get("src") if isinstance(f_img, dict) else (f_img if isinstance(f_img, str) else "")
                        f_src = str(f_src or "").strip()
                        if f_src.startswith("//"):
                            f_src = f"https:{f_src}"
                        if "cdn.shopify.com/s/files/1/0666/9212/0727/" in f_src and not _is_junk_image_url(f_src):
                            if f_src not in matched_featured:
                                matched_featured.append(f_src)
                    elif v_sku and (same_set or target_color_norm):
                        shopify_other_skus.add(v_sku)

                same_set |= shopify_same_skus
                other_set |= (shopify_other_skus - same_set)

                # Masukkan featured_image warna cocok di posisi paling depan
                for fu in matched_featured:
                    if fu not in candidates:
                        candidates.insert(0, fu)

                # Kumpulkan sudut foto tambahan HANYA jika cocok SKU warna aktif (atau produk memang cuma 1 warna tunggal!)
                is_multi_color_page = len(distinct_colors) > 1 or bool(other_set)
                for raw_u in raw_imgs[:24]:
                    u = str(raw_u or "").strip()
                    if u.startswith("//"):
                        u = f"https:{u}"
                    if "cdn.shopify.com/s/files/1/0666/9212/0727/" not in u or _is_junk_image_url(u):
                        continue
                    u_skus = _extract_skus_from_image_url(u)
                    if other_set and any(s in other_set for s in u_skus):
                        continue
                    if is_multi_color_page:
                        # Pada produk multi-warna, HANYA terima sudut foto tambahan yang bertag SKU warna aktif!
                        if not (u_skus and any(s in same_set for s in u_skus)):
                            continue
                    if u not in candidates:
                        candidates.append(u)
            except Exception:
                pass

    # Terapkan saringan anti-campur-warna final!
    strict_cands = _filter_strict_color_images(candidates, same_color_skus=same_set, other_color_skus=other_set)
    if not strict_cands:
        return []

    # Verifikasi paralel anti logo abu-abu (2.238B / 3.163B) dalam 1 round-trip (~200-400ms!)
    top_cands = strict_cands[:6]
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(top_cands)) as pool:
        ok_flags = list(pool.map(lambda u: _verify_image_not_grey_logo(u, timeout=1.2), top_cands))
    return [u for u, ok in zip(top_cands, ok_flags) if ok]


# ─────────────────────────────────────────────────────────────────────────────
#  5. HOT-SCAN SEED LOGGER (TITIP KE GITHUB ACTIONS PYTHON EXPLORER)
# ─────────────────────────────────────────────────────────────────────────────

def record_hot_scan_seed(sku: str, barcode: Optional[str], article: Optional[str], brand: Optional[str], owner_account: str) -> None:
    if not sku:
        return
    try:
        raw = storage_read_text("analytics/hot-scan-seeds.json", timeout=2.0)
        parsed = json.loads(raw) if raw else {}
        seeds = parsed.get("seeds") if isinstance(parsed, dict) and isinstance(parsed.get("seeds"), list) else []
        now = utc_iso_now()
        seeds = [s for s in seeds if isinstance(s, dict) and str(s.get("sku") or "") != sku]
        seeds.insert(
            0,
            {
                "sku": sku,
                "barcode": barcode or None,
                "article": article or None,
                "brand": brand or None,
                "ownerAccount": owner_account,
                "scannedAt": now,
            },
        )
        payload = json.dumps({"updatedAt": now, "seeds": seeds[:250]}, ensure_ascii=False).encode("utf-8")
        storage_write_bytes("analytics/hot-scan-seeds.json", payload, "application/json", timeout=2.5)
    except Exception:
        pass


# ─────────────────────────────────────────────────────────────────────────────
#  6. BUILD PROBE CANDIDATES & UPSERT TURSO (Product + BarcodeAlias + Catalog)
# ─────────────────────────────────────────────────────────────────────────────

def build_probe_candidates(clean_code: str) -> List[Tuple[str, str]]:
    out: List[Tuple[str, str]] = []
    seen = set()

    def add(kind: str, code: str) -> None:
        c = code.strip()
        if not c:
            return
        k = (kind, c.upper())
        if k not in seen:
            seen.add(k)
            out.append((kind, c))

    is_digits = clean_code.isdigit()
    if is_digits:
        if len(clean_code) >= 11:
            add("upc", clean_code)
            if len(clean_code) == 13:
                cd = calculate_ean13_check_digit(clean_code[:12])
                if cd and cd != clean_code[12]:
                    add("upc", clean_code[:12] + cd)
            elif len(clean_code) == 12:
                add("upc", "0" + clean_code)
            add("sku", clean_code)
        elif len(clean_code) == 8:
            add("sku", clean_code)
            add("upc", clean_code)
        else:
            add("sku", clean_code)
            add("upc", clean_code)
    else:
        # QR / Alfanumerik unik (contoh: 2663005FS, AN011809)
        add("upc", clean_code)
        add("sku", clean_code)
        norm = normalize_code_key(clean_code)
        if norm and norm != clean_code.upper():
            add("upc", norm)
            add("sku", norm)
    return out


def _probe_account_with_deadline(
    account: str,
    candidates: List[Tuple[str, str]],
    deadline: float,
    only_one: Optional[Tuple[str, str]] = None,
) -> Dict[str, Any]:
    cookie = get_storehub_cookie(account, force_refresh=False)
    if not cookie:
        return {"account": account, "items": [], "auth_failed": True}

    probe_list = [only_one] if only_one else candidates[:2]
    remaining = deadline - time.time()
    if remaining < 0.6:
        return {"account": account, "items": [], "timeout": True, "cookie": cookie}

    t_out = min(2.4, max(0.9, remaining))

    # TURBO PARALLEL PROBE: Tembak kandidat utama (`upc` + `sku`) BERSAMAAN dalam 1 round-trip (~300-600ms)!
    def _run_one(pair: Tuple[str, str], active_cookie: str, to_sec: float) -> Tuple[str, str, Dict[str, Any]]:
        k, c = pair
        return k, c, query_detail(k, c, active_cookie, account, timeout=to_sec)

    results: List[Tuple[str, str, Dict[str, Any]]] = []
    if len(probe_list) == 1:
        results = [_run_one(probe_list[0], cookie, t_out)]
    else:
        with concurrent.futures.ThreadPoolExecutor(max_workers=len(probe_list)) as pool:
            futs = [pool.submit(_run_one, p, cookie, t_out) for p in probe_list]
            for f in futs:
                try:
                    results.append(f.result(timeout=t_out + 0.3))
                except Exception:
                    pass

    # Cek hasil langsung (menang tercepat!)
    for k, c, res in results:
        if res.get("cookie"):
            cookie = res["cookie"]
        if res.get("items"):
            return {"account": account, "items": res["items"], "kind": k, "code": c, "cookie": cookie}

    if any(r.get("offline") for _, _, r in results):
        return {"account": account, "items": [], "offline": True, "cookie": cookie}

    # Auto-heal hash expired atau cookie expired tepat 1x bila sisa waktu cukup
    need_hash = any(r.get("action_expired") for _, _, r in results)
    need_auth = any(r.get("auth_failed") for _, _, r in results)
    if (need_hash or need_auth) and (deadline - time.time()) > 1.2:
        if need_hash:
            resolve_action_hashes(cookie=cookie)
        if need_auth:
            fresh = get_storehub_cookie(account, force_refresh=True)
            if fresh:
                cookie = fresh
        k0, c0 = probe_list[0]
        retry_res = query_detail(k0, c0, cookie, account, timeout=min(2.2, max(0.8, deadline - time.time())))
        cookie = retry_res.get("cookie") or cookie
        if retry_res.get("items"):
            return {"account": account, "items": retry_res["items"], "kind": k0, "code": c0, "cookie": cookie}
        if retry_res.get("offline"):
            return {"account": account, "items": [], "offline": True, "cookie": cookie}

    return {"account": account, "items": [], "cookie": cookie}


def _upsert_item_and_aliases(
    item: Dict[str, Any],
    scanned_code: str,
    owner_account: str,
    promo: Optional[Dict[str, Any]],
    images: List[str],
    now_iso: str,
    promo_checked: bool = False,
) -> Dict[str, Any]:
    sku = str(item.get("SKU") or item.get("sku") or scanned_code).strip()
    raw_bc = str(item.get("VendorBarcode") or item.get("vendorBarcode") or "").strip()
    all_bcs: List[str] = list(item.get("_all_barcodes") or [])
    if raw_bc and raw_bc not in all_bcs:
        all_bcs.insert(0, raw_bc)
    if scanned_code and scanned_code != sku and scanned_code not in all_bcs:
        all_bcs.append(scanned_code)

    primary_bc = raw_bc or (scanned_code if scanned_code != sku else None)
    article = sanitize_article_code(item.get("StyleCode") or item.get("styleCode") or item.get("article")) or sku
    desc = str(item.get("Description") or item.get("ItemDescription") or article or sku).strip()
    brand, dept = normalize_brand_and_dept(item)
    color = str(item.get("Color") or item.get("ColorDesc") or item.get("color") or "").strip() or None
    size = str(item.get("Size") or item.get("SizeDesc") or item.get("size") or "").strip() or None
    stok = parse_stock_int(item.get("StockOnHand") if "StockOnHand" in item else item.get("stockOnHand"))
    if stok is None:
        stok = 0
    harga_normal = parse_retail_price(
        item.get("Price") or item.get("RetailPrice") or item.get("UnitPrice") or item.get("NormalPrice")
    ) or 0

    hp = promo["hargaPromo"] if promo else None
    diskon = promo["diskon"] if promo else None
    dtype = promo["discountType"] if promo else None
    acara = promo["acara"] if promo else None

    img_url = images[0] if images else None
    imgs_json = json.dumps(images[:6], ensure_ascii=False)

    # Cek apakah barcode utama sudah dipakai SKU lain (hindari UNIQUE constraint error)
    if primary_bc:
        conflict = turso_query('SELECT sku FROM "Product" WHERE barcode = ? LIMIT 1', (primary_bc,), timeout=2.5)
        if conflict and str(conflict[0].get("sku") or "") != sku:
            primary_bc = None

    # Jika promo_checked=True (sudah dicek live ke MDS Retailing), TIMPA langsung kolom promo
    # agar promo baru masuk persis MDS DAN promo lama yang sudah berakhir otomatis dibersihkan ke Harga Normal!
    promo_update_sql = (
        '"hargaPromo" = excluded."hargaPromo", '
        'diskon = excluded.diskon, '
        '"discountType" = excluded."discountType", '
        'acara = excluded.acara, '
        '"fromDate" = NULL, '
        '"toDate" = NULL, '
        if promo_checked
        else (
            '"hargaPromo" = COALESCE(excluded."hargaPromo", "Product"."hargaPromo"), '
            'diskon = COALESCE(excluded.diskon, "Product".diskon), '
            '"discountType" = COALESCE(excluded."discountType", "Product"."discountType"), '
            'acara = COALESCE(excluded.acara, "Product".acara), '
        )
    )

    stmts: List[Tuple[str, Tuple[Any, ...]]] = [
        (
            'INSERT INTO "Product" ('
            'sku, barcode, article, description, brand, dept, color, size, '
            '"hargaNormal", "hargaPromo", diskon, "discountType", acara, '
            '"imageUrl", images, stok, "updatedAt", "createdAt"'
            ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) '
            'ON CONFLICT(sku) DO UPDATE SET '
            'barcode = COALESCE(excluded.barcode, "Product".barcode), '
            'article = CASE WHEN excluded.article != \'\' THEN excluded.article ELSE "Product".article END, '
            'description = CASE WHEN excluded.description != \'\' THEN excluded.description ELSE "Product".description END, '
            'brand = COALESCE(excluded.brand, "Product".brand), '
            'dept = COALESCE(excluded.dept, "Product".dept), '
            'color = COALESCE(excluded.color, "Product".color), '
            'size = COALESCE(excluded.size, "Product".size), '
            '"hargaNormal" = CASE WHEN excluded."hargaNormal" > 0 THEN excluded."hargaNormal" ELSE "Product"."hargaNormal" END, '
            + promo_update_sql +
            '"imageUrl" = COALESCE("Product"."imageUrl", excluded."imageUrl"), '
            'images = CASE WHEN "Product".images IS NULL OR "Product".images = \'[]\' THEN excluded.images ELSE "Product".images END, '
            'stok = excluded.stok, '
            '"updatedAt" = excluded."updatedAt"',
            (
                sku,
                primary_bc,
                article,
                desc,
                brand,
                dept,
                color,
                size,
                harga_normal,
                hp,
                diskon,
                dtype,
                acara,
                img_url,
                imgs_json,
                stok,
                now_iso,
                now_iso,
            ),
        )
    ]

    source_tag = "LIVE_SUKO" if owner_account == "suko" else "LIVE_MUKU"
    for bc in all_bcs[:8]:
        bc_clean = str(bc).strip()
        bc_norm = normalize_code_key(bc_clean)
        if not bc_clean or not bc_norm:
            continue
        stmts.append(
            (
                'INSERT INTO "BarcodeAlias" (barcode, "barcodeNorm", sku, source, "updatedAt") '
                'VALUES (?, ?, ?, ?, ?) '
                'ON CONFLICT(barcode) DO UPDATE SET '
                '"barcodeNorm"=excluded."barcodeNorm", sku=excluded.sku, source=excluded.source, "updatedAt"=excluded."updatedAt"',
                (bc_clean, bc_norm, sku, source_tag, now_iso),
            )
        )

    turso_pipeline(stmts, timeout=4.5)
    return {
        "sku": sku,
        "barcode": primary_bc,
        "article": article,
        "brand": brand,
        "dept": dept,
        "stok": stok,
        "hargaNormal": harga_normal,
    }


def _sync_catalog_article_for_family(article: str, siblings: List[Dict[str, Any]], now_iso: str) -> None:
    if not siblings:
        return
    primary = siblings[0]
    art_key = (article or primary.get("sku") or "").strip().upper()
    if not art_key:
        return
    total_stok = sum(max(0, int(s.get("stok") or 0)) for s in siblings)
    colors = sorted({str(s.get("color") or "").strip() for s in siblings if s.get("color")})
    sizes = sorted({str(s.get("size") or "").strip() for s in siblings if s.get("size")})
    img_url = next((s.get("imageUrl") for s in siblings if s.get("imageUrl")), None)
    has_promo = any(bool(s.get("hargaPromo") or s.get("diskon")) for s in siblings)
    promo_row = next((s for s in siblings if s.get("hargaPromo") or s.get("diskon")), primary)
    brand_group = resolve_store_group(
        str(primary.get("brand") or ""),
        str(primary.get("dept") or ""),
        str(primary.get("description") or ""),
    )
    sub_brand = str(primary.get("brand") or primary.get("dept") or brand_group).strip().upper()[:60]
    cat_key = classify_category_key(str(primary.get("description") or ""), str(primary.get("dept") or ""))
    # Sort rank selaras Page-1 Stock-First: stok > 0 di atas!
    sort_rank = (0 if total_stok > 0 else 1_000_000) + (0 if img_url else 100_000) + max(0, 50_000 - min(total_stok, 50_000))

    try:
        turso_pipeline(
            [
                (
                    'INSERT INTO "CatalogArticle" ('
                    'key, sku, barcode, article, description, brand, dept, "brandGroup", "subBrand", "categoryKey", '
                    'color, size, stok, "hargaNormal", "hargaPromo", diskon, "discountType", acara, "toDate", '
                    '"imageUrl", "articleGroupCount", "articleTotalStok", "articleColors", "articleSizes", '
                    '"articleHasPromo", "articlePromoLabel", "sortRank", "updatedAt"'
                    ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) '
                    'ON CONFLICT(key) DO UPDATE SET '
                    'stok=excluded.stok, "hargaNormal"=excluded."hargaNormal", "hargaPromo"=excluded."hargaPromo", '
                    'diskon=excluded.diskon, "discountType"=excluded."discountType", acara=excluded.acara, '
                    '"imageUrl"=COALESCE(excluded."imageUrl", "CatalogArticle"."imageUrl"), '
                    '"articleGroupCount"=excluded."articleGroupCount", "articleTotalStok"=excluded."articleTotalStok", '
                    '"articleColors"=excluded."articleColors", "articleSizes"=excluded."articleSizes", '
                    '"articleHasPromo"=excluded."articleHasPromo", "articlePromoLabel"=excluded."articlePromoLabel", '
                    '"sortRank"=excluded."sortRank", "updatedAt"=excluded."updatedAt"',
                    (
                        art_key,
                        primary.get("sku"),
                        primary.get("barcode"),
                        article or primary.get("article"),
                        primary.get("description") or article,
                        primary.get("brand"),
                        primary.get("dept"),
                        brand_group,
                        sub_brand,
                        cat_key,
                        primary.get("color"),
                        primary.get("size"),
                        int(primary.get("stok") or 0),
                        float(primary.get("hargaNormal") or 0),
                        promo_row.get("hargaPromo"),
                        promo_row.get("diskon"),
                        promo_row.get("discountType"),
                        promo_row.get("acara"),
                        promo_row.get("toDate"),
                        img_url,
                        len(siblings),
                        total_stok,
                        json.dumps(colors, ensure_ascii=False),
                        json.dumps(sizes, ensure_ascii=False),
                        1 if has_promo else 0,
                        promo_row.get("diskon") or promo_row.get("acara"),
                        sort_rank,
                        now_iso,
                    ),
                )
            ],
            timeout=3.5,
        )
    except Exception:
        pass


# ─────────────────────────────────────────────────────────────────────────────
#  7. PUBLIC ACTIONS: SCAN | FAST-STOCK | HEAL-IMAGE | REFRESH-COOKIE
# ─────────────────────────────────────────────────────────────────────────────

def _build_blurry_hangtag_fallbacks(code: str) -> List[Tuple[str, str]]:
    """
    Problem-Solver Anti-Hangtag Buram (hanya jalan jika kode persis tidak ketemu!):
    Menangani salah baca huruf/angka yang paling sering terjadi di hangtag cetak buram:
    - Di bagian angka awal: O->0, I/L->1, S->5, B->8
    - Di akhiran size (FS/XS/S/M/L/XL): 5->S, 0->O, 1->L (contoh: 2663005F5 -> 2663005FS, 266300SFS -> 2663005FS!)
    """
    up = str(code or "").strip().upper()
    if len(up) < 6 or len(up) > 18 or up.isdigit():
        return []
    alts: List[str] = []
    # 1. Akhiran F5 -> FS, X5 -> XS, 5 -> S (size suffix)
    if up.endswith("F5"):
        alts.append(up[:-2] + "FS")
    elif up.endswith("X5"):
        alts.append(up[:-2] + "XS")
    elif re.search(r"[A-Z]5$", up):
        alts.append(up[:-1] + "S")
    # 2. Karakter buram di prefix angka sebelum 2-3 huruf akhiran (misal 266300SFS -> 2663005FS, 2663O05FS -> 2663005FS)
    m_split = re.match(r"^([A-Z0-9]{5,12})([A-Z]{2,3})$", up)
    if m_split:
        prefix, suffix = m_split.group(1), m_split.group(2)
        fixed_prefix = prefix.replace("O", "0").replace("I", "1").replace("S", "5").replace("B", "8")
        if fixed_prefix != prefix:
            alts.append(fixed_prefix + suffix)
    # 3. Koreksi O->0 global jika mayoritas angka
    if sum(ch.isdigit() for ch in up) >= 4 and "O" in up:
        alts.append(up.replace("O", "0"))

    out: List[Tuple[str, str]] = []
    seen = {up}
    for a in alts:
        if a and a not in seen:
            seen.add(a)
            out.append(("upc", a))
            out.append(("sku", a))
    return out[:4]


def run_live_scan(
    code: str,
    preferred_account: Optional[str] = None,
    with_images: bool = True,
    max_seconds: float = 4.2,
) -> Dict[str, Any]:
    t0 = time.time()
    clean_code = str(code or "").strip()
    if not clean_code:
        return {"success": False, "error": "Kode barcode/SKU kosong"}

    deadline = t0 + max(2.8, min(float(max_seconds), 4.5))
    candidates = build_probe_candidates(clean_code)

    # Tentukan akun pembuka cerdas: QR/Alfanumerik -> Mu+Ku duluan; EAN 234000* -> SUKO/Mu+Ku
    if preferred_account in ("suko", "muku"):
        first_acc = preferred_account
    elif not clean_code.isdigit():
        first_acc = "muku"
    elif clean_code.startswith("234000"):
        first_acc = "suko"
    else:
        first_acc = "muku"
    second_acc = "suko" if first_acc == "muku" else "muku"

    # Langkah 1: Cari master produk (1 akun dulu -> fallback akun 2 jika belum ketemu)
    outcome = _probe_account_with_deadline(first_acc, candidates, deadline)
    if not outcome.get("items") and not outcome.get("offline") and (deadline - time.time()) > 1.2:
        alt = _probe_account_with_deadline(second_acc, candidates, deadline)
        if alt.get("items") or alt.get("offline"):
            outcome = alt

    # Langkah 1B: Self-Heal Hangtag Buram (jika kode persis 0 hasil, otomatis coba koreksi O/0, S/5, F5->FS!)
    was_healed = False
    if not outcome.get("items") and not outcome.get("offline") and (deadline - time.time()) > 0.7:
        blurry_cands = _build_blurry_hangtag_fallbacks(clean_code)
        if blurry_cands:
            healed = _probe_account_with_deadline(first_acc, blurry_cands, deadline)
            if not healed.get("items") and not healed.get("offline") and (deadline - time.time()) > 0.7:
                healed2 = _probe_account_with_deadline(second_acc, blurry_cands, deadline)
                if healed2.get("items") or healed2.get("offline"):
                    healed = healed2
            if healed.get("items"):
                outcome = healed
                was_healed = True

    if outcome.get("offline"):
        return {
            "success": False,
            "sku": clean_code,
            "storeOffline": True,
            "message": "Server toko fisik sedang istirahat (malam hari). Menampilkan stok tersimpan.",
            "elapsedMs": int((time.time() - t0) * 1000),
        }

    items = outcome.get("items") or []
    if not items:
        return {
            "success": False,
            "sku": clean_code,
            "message": f"Produk tidak ditemukan di server toko maupun database lokal ({clean_code}).",
            "elapsedMs": int((time.time() - t0) * 1000),
        }

    # Langkah 2: Kunci pemilik toko 100% DETERMINISTIK dari Brand & Department!
    primary_raw = items[0]
    det_brand, det_dept = normalize_brand_and_dept(primary_raw)
    owner_acc = resolve_owner_account(det_brand, det_dept, str(primary_raw.get("Description") or ""))
    active_cookie = outcome.get("cookie") or ""
    active_kind = outcome.get("kind") or "upc"
    active_code = outcome.get("code") or clean_code

    # Langkah 3: Jika akun awal != pemilik toko sebenarnya -> pindah tepat 1× ke akun pemilik!
    if owner_acc != outcome.get("account") and (deadline - time.time()) > 1.0:
        owner_probe = _probe_account_with_deadline(
            owner_acc,
            candidates,
            deadline,
            only_one=(active_kind, active_code),
        )
        if owner_probe.get("items"):
            items = owner_probe["items"]
            primary_raw = items[0]
            active_cookie = owner_probe.get("cookie") or active_cookie

    seed_sku = str(primary_raw.get("SKU") or primary_raw.get("sku") or clean_code).strip()
    seed_article = sanitize_article_code(primary_raw.get("StyleCode") or primary_raw.get("styleCode"))
    seed_normal = parse_retail_price(
        primary_raw.get("Price") or primary_raw.get("RetailPrice") or primary_raw.get("UnitPrice")
    ) or 0

    # Langkah 4: Jalankan PARALEL (Matrix Stock + Live Promo + Foto Studio) dalam 1 siklus kilat (< 2,2 dtk)!
    matrix_rows: List[Dict[str, Any]] = []
    live_promo: Optional[Dict[str, Any]] = None
    promo_checked = False
    found_images: List[str] = []

    enrich_budget = max(1.4, min(2.4, deadline - time.time()))
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        fut_matrix = pool.submit(query_stock_matrix, seed_sku, active_cookie, owner_acc, enrich_budget)
        fut_promo = pool.submit(query_promotion_checked, active_kind, active_code, active_cookie, owner_acc, seed_normal, enrich_budget)
        fut_img = (
            pool.submit(
                lookup_matahari_images,
                seed_sku,
                seed_article,
                clean_code,
                {seed_sku},
                None,
                str(primary_raw.get("Color") or primary_raw.get("ColorDesc") or ""),
            )
            if with_images
            else None
        )
        try:
            m_res = fut_matrix.result(timeout=enrich_budget + 0.3)
            matrix_rows = m_res.get("rows") or []
        except Exception:
            matrix_rows = []
        try:
            p_res = fut_promo.result(timeout=enrich_budget + 0.3)
            promo_checked = bool(p_res.get("checked"))
            live_promo = p_res.get("promo")
        except Exception:
            live_promo = None
            promo_checked = False
        if fut_img is not None:
            try:
                found_images = fut_img.result(timeout=enrich_budget + 0.3)
            except Exception:
                found_images = []

    # Fallback Promo Probe: bila tadi scan pakai UPC/QR & hasil 0 promo, coba 1x cepat pakai SKU!
    if not live_promo and active_kind != "sku" and seed_sku and (deadline - time.time()) > 0.6:
        try:
            p_fb = query_promotion_checked("sku", seed_sku, active_cookie, owner_acc, seed_normal, min(1.8, deadline - time.time()))
            if p_fb.get("checked"):
                promo_checked = True
                if p_fb.get("promo"):
                    live_promo = p_fb["promo"]
        except Exception:
            pass

    # Langkah 5: Simpan ke Turso (`Product` + `BarcodeAlias`)
    # Gunakan active_code (kode terverifikasi StoreHub) agar kode typo hangtag buram tidak mencemari BarcodeAlias!
    canonical_code = active_code if was_healed else clean_code
    now_iso = utc_iso_now()
    saved_meta = _upsert_item_and_aliases(
        primary_raw, canonical_code, owner_acc, live_promo, found_images, now_iso, promo_checked=promo_checked
    )
    # Upsert item tambahan bila StoreHub mengembalikan > 1 SKU dalam 1 response
    for extra in items[1:12]:
        try:
            _upsert_item_and_aliases(
                extra, canonical_code, owner_acc, live_promo, found_images, now_iso, promo_checked=promo_checked
            )
        except Exception:
            pass

    # Ambil seluruh siblings artikel dari Turso & terapkan Matrix Stock + sinkron harga/promo warna sama!
    siblings_rows = (
        turso_query('SELECT * FROM "Product" WHERE article = ? ORDER BY sku ASC LIMIT 120', (saved_meta["article"],), timeout=3.0)
        if saved_meta["article"]
        else turso_query('SELECT * FROM "Product" WHERE sku = ? LIMIT 1', (saved_meta["sku"],), timeout=3.0)
    )
    siblings = [_deserialize_product_row(r) for r in siblings_rows]

    primary_color_norm = _norm_color_key(
        primary_raw.get("Color") or primary_raw.get("ColorDesc") or (siblings[0].get("color") if siblings else "")
    )
    updated_variants: List[Dict[str, Any]] = []
    if siblings:
        sync_stmts: List[Tuple[str, Tuple[Any, ...]]] = []
        for sib in siblings:
            sib_sku = sib.get("sku")
            if not sib_sku:
                continue
            new_stok = sib.get("stok") or 0
            stok_changed = False
            if matrix_rows:
                mq = match_matrix_qty(matrix_rows, sib.get("color"), sib.get("size"))
                if mq is not None and mq != int(sib.get("stok") or 0):
                    new_stok = mq
                    sib["stok"] = mq
                    stok_changed = True
                    updated_variants.append({"sku": sib_sku, "stok": mq})

            same_color = bool(primary_color_norm and _norm_color_key(sib.get("color")) == primary_color_norm)
            if same_color and sib_sku != saved_meta["sku"] and (seed_normal > 0 or promo_checked):
                new_normal = seed_normal if seed_normal > 0 else (sib.get("hargaNormal") or 0)
                sib["hargaNormal"] = new_normal
                if promo_checked:
                    sib["hargaPromo"] = live_promo["hargaPromo"] if live_promo else None
                    sib["diskon"] = live_promo["diskon"] if live_promo else None
                    sib["discountType"] = live_promo["discountType"] if live_promo else None
                    sib["acara"] = live_promo["acara"] if live_promo else None
                    sib["fromDate"] = None
                    sib["toDate"] = None
                sib["updatedAt"] = now_iso
                if promo_checked:
                    sync_stmts.append((
                        'UPDATE "Product" SET stok = ?, "hargaNormal" = ?, "hargaPromo" = ?, diskon = ?, "discountType" = ?, acara = ?, "fromDate" = NULL, "toDate" = NULL, "updatedAt" = ? WHERE sku = ?',
                        (new_stok, new_normal, sib["hargaPromo"], sib["diskon"], sib["discountType"], sib["acara"], now_iso, sib_sku),
                    ))
                else:
                    sync_stmts.append((
                        'UPDATE "Product" SET stok = ?, "hargaNormal" = ?, "updatedAt" = ? WHERE sku = ?',
                        (new_stok, new_normal, now_iso, sib_sku),
                    ))
            elif stok_changed:
                sib["updatedAt"] = now_iso
                sync_stmts.append(('UPDATE "Product" SET stok = ?, "updatedAt" = ? WHERE sku = ?', (new_stok, now_iso, sib_sku)))

        if sync_stmts:
            try:
                turso_pipeline(sync_stmts, timeout=3.5)
            except Exception:
                pass

    main_product = next((s for s in siblings if s.get("sku") == saved_meta["sku"]), siblings[0] if siblings else None)
    all_skus = [s["sku"] for s in siblings if s.get("sku")]
    aliases: List[Dict[str, Any]] = []
    if all_skus:
        ph = ",".join("?" for _ in all_skus[:60])
        aliases = turso_query(
            f'SELECT barcode, "barcodeNorm", sku FROM "BarcodeAlias" WHERE sku IN ({ph})',
            tuple(all_skus[:60]),
            timeout=2.5,
        )

    # Sinkronkan CatalogArticle + Hot-Scan Seed (paralel & cepat)
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        pool.submit(_sync_catalog_article_for_family, saved_meta["article"], siblings, now_iso)
        pool.submit(
            record_hot_scan_seed,
            saved_meta["sku"],
            saved_meta["barcode"] or (canonical_code if canonical_code != saved_meta["sku"] else None),
            saved_meta["article"],
            saved_meta["brand"],
            owner_acc,
        )

    return {
        "success": True,
        "sku": saved_meta["sku"],
        "barcode": saved_meta["barcode"],
        "article": saved_meta["article"],
        "ownerAccount": owner_acc,
        "stok": int((main_product or {}).get("stok") or saved_meta["stok"] or 0),
        "data": main_product,
        "siblings": siblings,
        "aliases": aliases,
        "updatedVariants": updated_variants,
        "imagesMatched": len(found_images),
        "healedFrom": clean_code if was_healed else None,
        "resolvedCode": active_code,
        "source": "PYTHON_LIVE_ENGINE",
        "elapsedMs": int((time.time() - t0) * 1000),
    }


def run_fast_stock(
    sku: str,
    family_variants: List[Dict[str, Any]],
    article: Optional[str] = None,
    brand_group: Optional[str] = None,
) -> Dict[str, Any]:
    """
    LIVE SINKRON PENUH (100% Persis MDS Retailing dalam 1 Siklus Paralel!):
    Menyinkronkan SEMUA data produk secara live dari StoreHub MDS Retailing:
    1. Detail Barang (`checkItemDetail`): Harga Normal, Barcode UPC, StyleCode/Artikel, Deskripsi, Brand, Dept, Color, Size, SOH.
    2. Detail Promo (`checkItemPromotion`): Harga Promo SP / Diskon % / Bundling / BR-NAME + otomatis bersihkan promo basi bila sudah Harga Normal!
    3. Relasi Stok (`checkItemStock`): Stok seluruh varian warna & ukuran dalam 1 artikel.
    4. Simpan penuh ke Turso (`Product` + `BarcodeAlias` + `CatalogArticle`) & kembalikan `data` + `siblings` terbaru ke UI & cache HP!
    """
    t0 = time.time()
    clean_sku = str(sku or "").strip()
    if not clean_sku:
        return {"success": False, "error": "SKU wajib diisi"}

    # Baca baris eksisting 1x (untuk KUNCI ROLE AKUN MDS, barcode, normal price hint, imageUrl, & artikel)
    existing_rows = turso_query(
        'SELECT sku, barcode, article, brand, dept, description, color, size, "hargaNormal", stok, "imageUrl" FROM "Product" WHERE sku = ? LIMIT 1',
        (clean_sku,),
        timeout=2.2,
    )
    ex0 = existing_rows[0] if existing_rows else {}
    bg_db = (
        resolve_store_group(str(ex0.get("brand") or ""), str(ex0.get("dept") or ""), str(ex0.get("description") or ""))
        if ex0 and (ex0.get("brand") or ex0.get("dept"))
        else ""
    )
    bg_req = str(brand_group or "").strip().upper()
    bg = bg_db if bg_db in ("SUKO", "MUKU", "ZES") else (bg_req if bg_req in ("SUKO", "MUKU", "ZES") else "")
    role_locked = bg in ("SUKO", "MUKU", "ZES")
    # KUNCI DETERMINISTIK ROLE AKUN MDS:
    # - SUKO -> akun `suko` (M223515 — Luqman Arif)
    # - Mu+Ku / ZES -> akun `muku` (M223708 — Aurel Sabrina Rahmadita)
    owner_acc = "suko" if bg == "SUKO" else "muku"
    alt_acc = "muku" if owner_acc == "suko" else "suko"
    normal_hint = int(round(float(ex0.get("hargaNormal") or 0))) if ex0 else 0
    existing_bc = str(ex0.get("barcode") or "").strip()
    resolved_article = str(article or ex0.get("article") or "").strip()
    needs_img_heal = not bool(str(ex0.get("imageUrl") or "").strip())

    cookie = get_storehub_cookie(owner_acc, force_refresh=False)
    if not cookie:
        return {"success": False, "sku": clean_sku, "storeOffline": True, "message": "Sesi toko belum tersedia."}

    def _run_parallel_trio(active_cookie: str, active_acc: str, budget: float = 4.2, fetch_img: bool = False):
        workers = 4 if fetch_img else 3
        with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
            f_det = pool.submit(query_detail, "sku", clean_sku, active_cookie, active_acc, budget)
            f_mat = pool.submit(query_stock_matrix, clean_sku, active_cookie, active_acc, budget)
            f_pro = pool.submit(query_promotion_checked, "sku", clean_sku, active_cookie, active_acc, normal_hint, budget)
            f_img = (
                pool.submit(
                    lookup_matahari_images,
                    clean_sku,
                    resolved_article,
                    existing_bc,
                    {clean_sku},
                    None,
                    str(ex0.get("color") or ""),
                )
                if fetch_img
                else None
            )
            d_r = f_det.result(timeout=budget + 0.5)
            m_r = f_mat.result(timeout=budget + 0.5)
            p_r = f_pro.result(timeout=budget + 0.5)
            imgs_r: List[str] = []
            if f_img is not None:
                try:
                    imgs_r = f_img.result(timeout=min(2.6, budget))
                except Exception:
                    imgs_r = []
        return d_r, m_r, p_r, imgs_r

    try:
        d_res, m_res, p_res, healed_imgs = _run_parallel_trio(cookie, owner_acc, 4.2, fetch_img=needs_img_heal)
    except Exception:
        d_res, m_res, p_res, healed_imgs = {"items": []}, {"rows": []}, {"checked": False, "promo": None}, []

    cookie = d_res.get("cookie") or m_res.get("cookie") or cookie
    if (d_res.get("action_expired") or m_res.get("action_expired") or p_res.get("action_expired")) and resolve_action_hashes(cookie=cookie):
        d_res, m_res, p_res, healed_imgs = _run_parallel_trio(cookie, owner_acc, 4.0, fetch_img=False)
    elif d_res.get("auth_failed") or m_res.get("auth_failed") or p_res.get("auth_failed"):
        fresh = get_storehub_cookie(owner_acc, force_refresh=True)
        if fresh:
            cookie = fresh
            d_res, m_res, p_res, healed_imgs = _run_parallel_trio(cookie, owner_acc, 4.0, fetch_img=False)

    # STRICT ROLE LOCK:
    # HANYA boleh mencoba akun alternatif jika role produk belum diketahui (`not role_locked`).
    # Jika produk sudah jelas SUKO atau Mu+Ku, DILARANG mencampur ke akun toko lain!
    if (not role_locked) and not (d_res.get("items") or m_res.get("rows")) and not (d_res.get("offline") or m_res.get("offline")):
        alt_cookie = get_storehub_cookie(alt_acc, force_refresh=False)
        if alt_cookie:
            d2, m2, p2, _ = _run_parallel_trio(alt_cookie, alt_acc, 3.8, fetch_img=False)
            if d2.get("items") or m2.get("rows"):
                owner_acc = alt_acc
                cookie = alt_cookie
                d_res, m_res, p_res = d2, m2, p2

    # Verifikasi silang owner sejati dari hasil checkItemDetail: bila tidak cocok role, wajib pindah tepat 1x ke pemilik sah!
    if d_res.get("items"):
        det_brand, det_dept = normalize_brand_and_dept(d_res["items"][0])
        true_owner = resolve_owner_account(det_brand, det_dept, str(d_res["items"][0].get("Description") or ""))
        if true_owner != owner_acc:
            true_cookie = get_storehub_cookie(true_owner, force_refresh=False)
            if true_cookie:
                dt_r, mt_r, pt_r, _ = _run_parallel_trio(true_cookie, true_owner, 3.8, fetch_img=False)
                if dt_r.get("items") or mt_r.get("rows"):
                    owner_acc = true_owner
                    cookie = true_cookie
                    d_res, m_res, p_res = dt_r, mt_r, pt_r

    if (d_res.get("offline") or m_res.get("offline")) and not (d_res.get("items") or m_res.get("rows")):
        return {
            "success": False,
            "sku": clean_sku,
            "storeOffline": True,
            "message": "Toko sedang tutup (malam hari). Menampilkan data tersimpan.",
            "elapsedMs": int((time.time() - t0) * 1000),
        }

    d_items = d_res.get("items") or []
    matrix_rows = m_res.get("rows") or []
    promo_checked = bool(p_res.get("checked"))
    live_promo = p_res.get("promo")

    # Tentukan harga normal live paling akurat dari checkItemDetail
    primary_raw = d_items[0] if d_items else None
    live_normal = (
        parse_retail_price(
            primary_raw.get("Price") or primary_raw.get("RetailPrice") or primary_raw.get("UnitPrice")
        )
        if primary_raw
        else None
    ) or normal_hint

    # Jika harga normal live berbeda dari hint awal (atau hint awal 0), re-query promo bila persen / UPC fallback
    live_bc = str((primary_raw or {}).get("VendorBarcode") or existing_bc or "").strip()
    if (not live_promo and live_bc) or (live_normal > 0 and live_normal != normal_hint):
        try:
            probe_kind = "upc" if (not live_promo and live_bc) else "sku"
            probe_code = live_bc if probe_kind == "upc" else clean_sku
            p_retry = query_promotion_checked(probe_kind, probe_code, cookie, owner_acc, live_normal, timeout=2.5)
            if p_retry.get("checked"):
                promo_checked = True
                if p_retry.get("promo") or probe_kind == "sku":
                    live_promo = p_retry.get("promo")
        except Exception:
            pass

    now_iso = utc_iso_now()
    if primary_raw:
        saved_meta = _upsert_item_and_aliases(
            primary_raw,
            clean_sku,
            owner_acc,
            live_promo,
            healed_imgs,
            now_iso,
            promo_checked=promo_checked,
        )
        resolved_article = saved_meta.get("article") or resolved_article
    elif promo_checked:
        # Tetap simpan update harga/promo walau detail kosong
        hp = live_promo["hargaPromo"] if live_promo else None
        dk = live_promo["diskon"] if live_promo else None
        dt = live_promo["discountType"] if live_promo else None
        ac = live_promo["acara"] if live_promo else None
        try:
            turso_pipeline(
                [(
                    'UPDATE "Product" SET "hargaPromo" = ?, diskon = ?, "discountType" = ?, acara = ?, "fromDate" = NULL, "toDate" = NULL, "updatedAt" = ? WHERE sku = ?',
                    (hp, dk, dt, ac, now_iso, clean_sku),
                )],
                timeout=3.0,
            )
        except Exception:
            pass

    # Ambil seluruh keluarga varian terbaru dari Turso
    siblings_rows = (
        turso_query('SELECT * FROM "Product" WHERE article = ? ORDER BY sku ASC LIMIT 120', (resolved_article,), timeout=3.0)
        if resolved_article
        else turso_query('SELECT * FROM "Product" WHERE sku = ? LIMIT 1', (clean_sku,), timeout=3.0)
    )
    siblings = [_deserialize_product_row(r) for r in siblings_rows]

    active_color_norm = _norm_color_key(
        (primary_raw or {}).get("Color")
        or (primary_raw or {}).get("ColorDesc")
        or ex0.get("color")
        or ""
    )
    old_map = {str(v.get("sku") or ""): v.get("stok") for v in family_variants if v.get("sku")}
    updates_map: Dict[str, int] = {}
    sync_stmts: List[Tuple[str, Tuple[Any, ...]]] = []

    for sib in siblings:
        s_sku = str(sib.get("sku") or "").strip()
        if not s_sku:
            continue
        cur_stok = int(sib.get("stok") or 0)
        new_stok = cur_stok
        if matrix_rows:
            q = match_matrix_qty(matrix_rows, sib.get("color"), sib.get("size"))
            if q is not None:
                new_stok = q
                updates_map[s_sku] = q
        if s_sku == clean_sku and primary_raw is not None:
            q_det = parse_stock_int(primary_raw.get("StockOnHand"))
            if q_det is not None:
                new_stok = q_det
                updates_map[s_sku] = q_det

        stok_changed = new_stok != cur_stok
        if stok_changed:
            sib["stok"] = new_stok

        # Semua ukuran pada WARNA YANG SAMA wajib memiliki Harga Normal & Promo yang sama persis dengan MDS Retailing!
        same_color = bool(active_color_norm and _norm_color_key(sib.get("color")) == active_color_norm)
        if same_color and (live_normal > 0 or promo_checked):
            if live_normal > 0:
                sib["hargaNormal"] = live_normal
            if promo_checked:
                sib["hargaPromo"] = live_promo["hargaPromo"] if live_promo else None
                sib["diskon"] = live_promo["diskon"] if live_promo else None
                sib["discountType"] = live_promo["discountType"] if live_promo else None
                sib["acara"] = live_promo["acara"] if live_promo else None
                sib["fromDate"] = None
                sib["toDate"] = None
            sib["updatedAt"] = now_iso
            if s_sku != clean_sku or stok_changed:
                if promo_checked:
                    sync_stmts.append((
                        'UPDATE "Product" SET stok = ?, "hargaNormal" = ?, "hargaPromo" = ?, diskon = ?, "discountType" = ?, acara = ?, "fromDate" = NULL, "toDate" = NULL, "updatedAt" = ? WHERE sku = ?',
                        (
                            new_stok,
                            sib.get("hargaNormal") or 0,
                            sib.get("hargaPromo"),
                            sib.get("diskon"),
                            sib.get("discountType"),
                            sib.get("acara"),
                            now_iso,
                            s_sku,
                        ),
                    ))
                else:
                    sync_stmts.append((
                        'UPDATE "Product" SET stok = ?, "hargaNormal" = ?, "updatedAt" = ? WHERE sku = ?',
                        (new_stok, sib.get("hargaNormal") or 0, now_iso, s_sku),
                    ))
        elif stok_changed:
            sib["updatedAt"] = now_iso
            sync_stmts.append(('UPDATE "Product" SET stok = ?, "updatedAt" = ? WHERE sku = ?', (new_stok, now_iso, s_sku)))

    if sync_stmts:
        try:
            turso_pipeline(sync_stmts, timeout=3.5)
        except Exception:
            pass

    if resolved_article and siblings:
        _sync_catalog_article_for_family(resolved_article, siblings, now_iso)

    main_product = next((s for s in siblings if s.get("sku") == clean_sku), siblings[0] if siblings else None)
    if not main_product and not updates_map:
        return {
            "success": False,
            "sku": clean_sku,
            "ownerAccount": owner_acc,
            "message": "Data live tidak tersedia dari server MDS saat ini.",
            "elapsedMs": int((time.time() - t0) * 1000),
        }

    updated_variants = [{"sku": k, "stok": v} for k, v in updates_map.items()]
    changed_count = sum(1 for k, v in updates_map.items() if k in old_map and old_map[k] != v)
    final_stok = int((main_product or {}).get("stok") if main_product else updates_map.get(clean_sku, 0))

    acc_prof = ACCOUNT_PROFILES.get(owner_acc) or {}
    owner_acc_label = f"{acc_prof.get('label', owner_acc.upper())} ({acc_prof.get('username', '')})"

    return {
        "success": True,
        "sku": clean_sku,
        "article": resolved_article or (main_product or {}).get("article"),
        "stok": final_stok,
        "ownerAccount": owner_acc,
        "ownerAccountLabel": owner_acc_label,
        "data": main_product,
        "siblings": siblings,
        "variants": updated_variants,
        "updatedVariants": updated_variants,
        "updatedCount": len(updated_variants) or len(siblings),
        "liveCheckedCount": len(updated_variants) or len(siblings),
        "changedCount": changed_count,
        "promoChecked": promo_checked,
        "livePromo": live_promo,
        "imagesMatched": len(healed_imgs),
        "hargaNormal": (main_product or {}).get("hargaNormal") or live_normal,
        "hargaPromo": (main_product or {}).get("hargaPromo"),
        "fastMode": False,
        "source": "PYTHON_LIVE_SYNC_FULL",
        "elapsedMs": int((time.time() - t0) * 1000),
    }


def run_heal_image(sku: str = "", article: str = "", barcode: str = "") -> Dict[str, Any]:
    t0 = time.time()
    clean_sku = str(sku or "").strip()
    clean_art = str(article or "").strip()
    clean_bc = str(barcode or "").strip()

    # Baca keluarga artikel dari Turso untuk memisahkan SKU warna aktif vs SKU warna lain (ANTI FOTO CAMPUR WARNA!)
    if not clean_art and clean_sku:
        r0 = turso_query('SELECT article FROM "Product" WHERE sku = ? LIMIT 1', (clean_sku,), timeout=2.0)
        if r0 and r0[0].get("article"):
            clean_art = str(r0[0]["article"]).strip()

    pre_sib_rows = (
        turso_query('SELECT sku, color FROM "Product" WHERE article = ? ORDER BY sku ASC LIMIT 120', (clean_art,), timeout=2.5)
        if clean_art
        else turso_query('SELECT sku, color FROM "Product" WHERE sku = ? LIMIT 1', (clean_sku,), timeout=2.0)
    )
    active_row = next((r for r in pre_sib_rows if str(r.get("sku") or "").strip() == clean_sku), pre_sib_rows[0] if pre_sib_rows else {})
    active_color_raw = str(active_row.get("color") or "").strip()
    active_color_norm = _norm_color_key(active_color_raw)

    same_color_skus: set = set()
    other_color_skus: set = set()
    for r in pre_sib_rows:
        r_sku = str(r.get("sku") or "").strip()
        if not r_sku:
            continue
        r_col_norm = _norm_color_key(r.get("color"))
        if active_color_norm and r_col_norm:
            if r_col_norm == active_color_norm:
                same_color_skus.add(r_sku)
            else:
                other_color_skus.add(r_sku)
        elif r_sku == clean_sku:
            same_color_skus.add(r_sku)
    if clean_sku:
        same_color_skus.add(clean_sku)

    imgs = lookup_matahari_images(
        sku=clean_sku,
        article=clean_art,
        barcode=clean_bc,
        same_color_skus=same_color_skus,
        other_color_skus=other_color_skus,
        target_color=active_color_raw,
    )
    now_iso = utc_iso_now()
    updated_count = 0

    if imgs:
        primary_img = imgs[0]
        imgs_json = json.dumps(imgs[:6], ensure_ascii=False)
        stmts: List[Tuple[str, Tuple[Any, ...]]] = []
        # HANYA update SKU pada WARNA YANG SAMA — DILARANG KERAS menimpa seluruh `WHERE article = ?` (mencegah warna lain tertimpa!)
        target_skus = sorted(same_color_skus) if same_color_skus else ([clean_sku] if clean_sku else [])
        for t_sku in target_skus:
            stmts.append(
                ('UPDATE "Product" SET "imageUrl" = ?, images = ?, "updatedAt" = ? WHERE sku = ?', (primary_img, imgs_json, now_iso, t_sku))
            )
        if clean_art and not other_color_skus:
            stmts.append(
                ('UPDATE "CatalogArticle" SET "imageUrl" = ?, "updatedAt" = ? WHERE key = ? OR article = ?', (primary_img, now_iso, clean_art.upper(), clean_art))
            )
        elif clean_sku:
            stmts.append(
                ('UPDATE "CatalogArticle" SET "imageUrl" = COALESCE("imageUrl", ?), "updatedAt" = ? WHERE sku = ?', (primary_img, now_iso, clean_sku))
            )
        if stmts:
            try:
                turso_pipeline(stmts, timeout=3.5)
                updated_count = len(target_skus)
            except Exception:
                pass

    sib_rows = (
        turso_query('SELECT * FROM "Product" WHERE article = ? ORDER BY sku ASC LIMIT 120', (clean_art,), timeout=3.0)
        if clean_art
        else turso_query('SELECT * FROM "Product" WHERE sku = ? LIMIT 1', (clean_sku,), timeout=3.0)
    )
    siblings = [_deserialize_product_row(r) for r in sib_rows]
    main_prod = next((s for s in siblings if s.get("sku") == clean_sku), siblings[0] if siblings else None)

    existing_clean = _filter_strict_color_images(
        ((main_prod.get("images") or ([main_prod["imageUrl"]] if main_prod and main_prod.get("imageUrl") else [])) if main_prod else []),
        same_color_skus=same_color_skus,
        other_color_skus=other_color_skus,
    )
    final_imgs = imgs[:6] if imgs else existing_clean
    final_primary = final_imgs[0] if final_imgs else None
    healed_ok = bool(final_imgs)

    return {
        "success": True,
        "healed": healed_ok,
        "activeColorMatched": healed_ok,
        "updatedCount": updated_count,
        "imageUrl": final_primary,
        "images": final_imgs,
        "data": main_prod,
        "siblings": siblings,
        "message": (
            f"Berhasil menyinkronkan {len(final_imgs)} foto khusus warna {active_color_raw or clean_sku} (0% campur warna lain)."
            if healed_ok
            else f"Foto khusus warna {active_color_raw or 'ini'} belum tersedia di katalog online — menampilkan placeholder ikon abu-abu."
        ),
        "source": "PYTHON_IMAGE_HEALER_STRICT_COLOR",
        "elapsedMs": int((time.time() - t0) * 1000),
    }


def run_refresh_cookie(account: str = "suko") -> Dict[str, Any]:
    acc = "muku" if str(account or "").lower() in ("muku", "mu+ku", "m223708") else "suko"
    cookie = get_storehub_cookie(acc, force_refresh=True)
    ok = bool(cookie and "mso_session=" in cookie)
    return {
        "success": ok,
        "account": acc,
        "cookie": cookie if ok else "",
        "source": "PYTHON_AUTH_ENGINE",
    }


def handle_live_request(payload: Dict[str, Any]) -> Dict[str, Any]:
    action = str(payload.get("action") or "scan").strip().lower()
    if action == "health":
        url, token = _get_turso_creds()
        return {
            "success": True,
            "engine": "PYTHON_LIVE_ENGINE",
            "runtime": "python-stdlib",
            "tursoConfigured": bool(url and token),
            "accounts": list(ACCOUNT_PROFILES.keys()),
            "timestamp": utc_iso_now(),
        }
    if action == "scan":
        return run_live_scan(
            code=str(payload.get("sku") or payload.get("code") or ""),
            preferred_account=payload.get("preferredAccount"),
            with_images=payload.get("withImages", True) is not False,
            max_seconds=float(payload.get("maxSeconds") or 6.5),
        )
    if action == "fast-stock":
        return run_fast_stock(
            sku=str(payload.get("sku") or ""),
            family_variants=payload.get("familyVariants") or [],
            article=payload.get("article"),
            brand_group=payload.get("brandGroup"),
        )
    if action == "heal-image":
        return run_heal_image(
            sku=str(payload.get("sku") or ""),
            article=str(payload.get("article") or ""),
            barcode=str(payload.get("barcode") or ""),
        )
    if action == "refresh-cookie":
        return run_refresh_cookie(account=str(payload.get("account") or "suko"))
    return {"success": False, "error": f"Unknown action: {action}"}
