"""
wa_cs_engine.py
=============================================================================
PURE PYTHON AI CUSTOMER SERVICE ENGINE UNTUK WHATSAPP (0% External Pip Deps!)
Berjalan cepat di Vercel Python Serverless Function (`api/py_wa_cs.py` — sin1).

Prinsip Utama:
1. 100% Pure Python Stdlib (`urllib`, `json`, `re`, `datetime`) -> Cold start < 300ms.
2. 3-Layer Anti-Salah-Balas:
   - Master Switch ON/OFF (`enabled`, default `False` agar aman!)
   - Auto-Schedule Jam Operasional Toko WIB (`09:00 - 21:30 WIB`)
   - Blokir 100% Chat Pribadi / Teman (`ignorePrivateChats: True` default)
   - Whitelist Grup Ketat + Auto-Detect Grup Baru (1-klik aktifkan di UI!)
   - Perintah Darurat dari WA PIC Sendiri (`!csoff`, `!cson`, `!csstatus`)
3. ATURAN KERAS PRIVASI STOK (HARD-CODED DI PYTHON, BUKAN CUMA PROMPT!):
   - DILARANG KERAS membocorkan angka qty stok (`1 pcs`, `2 pcs`, `-1`).
   - Semua angka stok dihapus total sebelum dikirim ke AI / template balasan.
   - Hanya mengembalikan status boolean (`READY` vs `SOLD_OUT`) + warna & ukuran ready.
4. Balasan Hangat Profesional ala Halo BCA + Foto HD Resmi Produk dari Turso DB.
5. Filter Obrolan Santai (Gemini 2.5 Flash + Fallback Regex Cerdas):
   - Mengabaikan candaan / obrolan non-produk di grup agar tidak spam.
=============================================================================
"""

from __future__ import annotations

import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from storehub_live_engine import (
    _STD_OPENER,
    _UUID_PLACEHOLDER_RE,
    parse_retail_price,
    storage_read_text,
    storage_write_bytes,
    turso_query,
    utc_iso_now,
)

CONFIG_STORAGE_PATH = "config/wa-cs-config.json"
LOGS_STORAGE_PATH = "logs/wa-cs-logs.json"
MAX_LOGS = 40
MAX_DETECTED_GROUPS = 30

GEMINI_MODEL = os.environ.get("WA_CS_GEMINI_MODEL") or "gemini-2.5-flash"

DEFAULT_CONFIG: Dict[str, Any] = {
    "enabled": False,
    "autoSchedule": True,
    "openHourWib": 9,
    "openMinuteWib": 0,
    "closeHourWib": 21,
    "closeMinuteWib": 30,
    "ignorePrivateChats": True,
    "storeScope": "ALL",  # ALL | SUKO | MUKU | ZES
    "csName": "Luqman",
    "storeName": "SUKO & Mu+Ku Official",
    "humanTakeoverMinutes": 10,
    "replyWithImage": True,
    "allowedGroups": [],
    "detectedGroups": [],
    "fonnteToken": "",
    "updatedAt": "",
}

# Kamus sinonim Indonesia -> Bahasa Inggris / istilah katalog ritel DB
SYNONYM_GROUPS: Dict[str, List[str]] = {
    "kaos": ["KAOS", "T-SHIRT", "TSHIRT", "TEE", "CREW NECK", "POLO"],
    "tshirt": ["T-SHIRT", "TSHIRT", "TEE", "KAOS"],
    "tee": ["TEE", "T-SHIRT", "KAOS"],
    "kemeja": ["KEMEJA", "SHIRT", "OXFORD", "FLANNEL"],
    "blouse": ["BLOUSE", "BLUS", "TOP", "ATASAN"],
    "atasan": ["TOP", "SHIRT", "T-SHIRT", "BLOUSE", "TEE", "KAOS", "KEMEJA"],
    "polo": ["POLO", "KAOS"],
    "jaket": ["JACKET", "JAKET", "HOODIE", "SWEATER", "CARDIGAN", "OUTER", "PARKA", "BOMBER", "DENIM JACKET"],
    "hoodie": ["HOODIE", "SWEATSHIRT", "JACKET", "JAKET"],
    "sweater": ["SWEATER", "KNIT", "CARDIGAN", "SWEATSHIRT"],
    "cardigan": ["CARDIGAN", "KNIT", "OUTER"],
    "celana": ["PANT", "PANTS", "JEANS", "CHINO", "SHORT", "TROUSER", "JOGGER", "CULOTTE", "CELANA"],
    "pendek": ["SHORT", "SHORTS", "PENDEK"],
    "panjang": ["LONG", "PANT", "PANTS", "TROUSER", "JEANS", "CHINO"],
    "jeans": ["JEANS", "DENIM"],
    "chino": ["CHINO", "CHINOS"],
    "jogger": ["JOGGER", "SWEATPANT"],
    "rok": ["SKIRT", "ROK", "CULOTTE"],
    "dress": ["DRESS", "GAMIS", "TUNIK", "TUNIC", "JUMPSUIT"],
    "gamis": ["GAMIS", "DRESS", "KAFTAN", "TUNIK"],
    "tunik": ["TUNIC", "TUNIK", "DRESS"],
    "sepatu": ["SHOE", "SHOES", "SNEAKER", "SNEAKERS", "LOAFER", "HEELS", "BOOTS", "FLATS", "SEPATU"],
    "sneaker": ["SNEAKER", "SNEAKERS", "SHOE"],
    "sandal": ["SANDAL", "SANDALS", "SLIPPER", "SLIPPERS", "SLIDE"],
    "sendal": ["SANDAL", "SANDALS", "SLIPPER", "SLIDE"],
    "tas": ["BAG", "BAGS", "BACKPACK", "TOTE", "SLING", "POUCH", "WALLET", "TAS"],
    "dompet": ["WALLET", "DOMPET", "CARD HOLDER"],
    "topi": ["CAP", "HAT", "TOPI", "BEANIE"],
    "kaoskaki": ["SOCK", "SOCKS", "KAOS KAKI"],
    "boxer": ["BOXER", "BRIEF", "UNDERWEAR", "TRUNK"],
    "kolor": ["BOXER", "SHORT", "BRIEF"],
    "piyama": ["PAJAMA", "PYJAMA", "SLEEP", "PIYAMA"],
    "parfum": ["PERFUME", "PARFUM", "EDT", "EDP", "FRAGRANCE", "MIST"],
    "serum": ["SERUM", "ESSENCE"],
    "baju": ["SHIRT", "T-SHIRT", "TEE", "BLOUSE", "TOP", "DRESS", "KAOS", "KEMEJA"],
}

COLOR_SYNONYMS: Dict[str, List[str]] = {
    "BLACK": ["HITAM", "BLACK", "BLK", "ITEM", "JET BLACK"],
    "WHITE": ["PUTIH", "WHITE", "WHT", "OFF WHITE", "BROKEN WHITE", "IVORY"],
    "NAVY": ["NAVY", "DONGKER", "BIRU DONGKER", "BIRU TUA", "DARK BLUE", "NVY"],
    "BLUE": ["BIRU", "BLUE", "BLU", "DENIM", "SKY BLUE", "LIGHT BLUE", "AQUA"],
    "GREY": ["ABU", "ABU-ABU", "GREY", "GRAY", "GRY", "CHARCOAL", "MISTY", "SILVER"],
    "RED": ["MERAH", "RED", "MAROON", "MARUN", "BURGUNDY", "WINE", "CRIMSON"],
    "GREEN": ["HIJAU", "IJO", "GREEN", "GRN", "OLIVE", "ARMY", "SAGE", "EMERALD", "MINT", "TOSCA"],
    "BEIGE": ["CREAM", "KREM", "BEIGE", "KHAKI", "TAN", "SAND", "OAT", "MOCCA", "MOKA", "TAUPE", "NUDE"],
    "BROWN": ["COKLAT", "COKELAT", "BROWN", "BRN", "CHOCO", "CARAMEL", "COFFEE", "ESPRESSO"],
    "PINK": ["PINK", "MERAH MUDA", "DUSTY PINK", "ROSE", "SALMON", "MAGENTA", "FUCHSIA"],
    "YELLOW": ["KUNING", "YELLOW", "MUSTARD", "GOLD", "OCHRE"],
    "ORANGE": ["ORANYE", "OREN", "ORANGE", "TERRACOTTA", "CORAL", "PEACH"],
    "PURPLE": ["UNGU", "PURPLE", "LILAC", "LAVENDER", "VIOLET"],
}

CATEGORY_SYNONYMS: Dict[str, List[str]] = {
    "ATASAN": ["kaos", "kemeja", "tshirt", "t-shirt", "tee", "polo", "blouse", "blus", "atasan", "top", "baju", "tanktop", "crop"],
    "JAKET": ["jaket", "jacket", "hoodie", "sweater", "cardigan", "outer", "blazer", "vest", "parka", "bomber", "knit"],
    "CELANA": ["celana", "jeans", "denim", "chino", "jogger", "short", "pant", "pants", "trouser", "legging", "kulot", "culotte"],
    "DRESS_ROK": ["dress", "rok", "skirt", "gamis", "tunik", "tunic", "kaftan", "jumpsuit"],
    "SEPATU_SANDAL": ["sepatu", "sandal", "sendal", "sneaker", "loafer", "heels", "boots", "flats", "slipper"],
    "TAS_AKSESORIS": ["tas", "bag", "dompet", "wallet", "topi", "cap", "hat", "belt", "sabuk", "kaos kaki", "sock", "backpack", "pouch"],
    "BEAUTY": ["serum", "parfum", "perfume", "cream", "krim", "lotion", "lip", "masker", "toner", "cleanser", "skincare", "makeup", "nayoung"],
    "TIDUR_DALAM": ["boxer", "brief", "underwear", "dalam", "bra", "panty", "piyama", "pajama", "singlet", "tidur"],
}

STOPWORDS_ID = {
    "mas", "mbak", "mba", "kak", "kakak", "min", "admin", "bang", "bro", "sis", "gan", "om", "tante", "bu", "pak",
    "ada", "ga", "gak", "ngga", "nggak", "tidak", "enggak", "engga", "ready", "redi", "stok", "stock", "sisa",
    "harga", "brp", "berapa", "harganya", "berapaan", "diskon", "promo", "sale", "murah", "spesial",
    "mau", "cari", "nyari", "tanya", "nanya", "cek", "cekin", "tolong", "dong", "donk", "yah", "ya", "yuk", "nih",
    "ini", "itu", "yang", "yg", "di", "ke", "dari", "untuk", "buat", "sama", "dan", "atau", "apa", "apakah",
    "ukuran", "size", "sz", "warna", "color", "colour", "model", "tipe", "jenis", "foto", "gambar", "pic", "pict",
    "liat", "lihat", "spill", "spil", "info", "infonya", "detail", "masih", "habis", "sold", "out", "kosong",
    "beli", "order", "pesan", "keep", "booking", "ambil", "kirim", "cod", "toko", "buka", "tutup", "halo", "hai",
    "hi", "hello", "permisi", "punten", "selamat", "pagi", "siang", "sore", "malam", "terima", "kasih", "makasih",
    "thanks", "thx", "mohon", "bantu", "bantuan", "dong", "kah", "kan", "sih", "deh", "lho", "loh", "nya", "punya",
    "jual", "tersedia", "lagi", "sedang", "bisa", "boleh", "minta", "kasih", "rekomendasi", "rekomen", "bagus",
}

INQUIRY_TRIGGER_WORDS = {
    "harga", "brp", "berapa", "berapaan", "ready", "redi", "stok", "stock", "promo", "diskon", "sale",
    "size", "ukuran", "warna", "order", "pesan", "beli", "keep", "booking", "katalog", "produk", "barang",
    "spill", "spil", "foto", "gambar", "cek", "cekin", "tersedia", "sold", "habis", "ada",
    "suko", "muku", "mu+ku", "zes", "nevada", "cole", "connexion", "styves", "fladeo", "nayoung", "byrch",
    "kaos", "kemeja", "celana", "jaket", "hoodie", "sweater", "cardigan", "dress", "rok", "gamis", "tunik",
    "sepatu", "sandal", "sendal", "sneaker", "tas", "dompet", "topi", "boxer", "piyama", "parfum", "serum",
    "baju", "atasan", "blouse", "polo", "jeans", "chino", "jogger", "kaos kaki", "sock", "sku", "artikel", "barcode",
}

CASUAL_SHORT_RE = re.compile(
    r"^(?:ok|oke|okay|siap|sip|mantap|mantul|gas|gaskeun|otw|wkwk+|haha+|hehe+|hihi+|kwkw+|lol|"
    r"amin|aamiin|makasih|terima\s*kasih|thanks|thx|tq|sama\s*sama|siapp+|yoi|yoii|betul|bener|iya|iyaa|"
    r"ya|yap|yep|nope|engga|ngga|ga|gak|p+|test|tes|\.+|!+|\?+)$",
    re.IGNORECASE,
)

SIZE_ORDER = {
    "XXS": 1, "XS": 2, "S": 3, "M": 4, "L": 5, "XL": 6, "XXL": 7, "2XL": 7, "3XL": 8, "XXXL": 8, "4XL": 9,
    "ALL SIZE": 20, "FREE SIZE": 21, "OS": 22, "ONE SIZE": 22,
}

# Daftar istilah internal yang DILARANG muncul di balasan customer
FORBIDDEN_INTERNAL_TERMS = [
    (re.compile(r"\bMDS\s*BISA\b", re.IGNORECASE), "sistem stok toko"),
    (re.compile(r"\bStoreHub\b", re.IGNORECASE), "sistem stok toko"),
    (re.compile(r"\bMatahari\.com\b", re.IGNORECASE), "katalog resmi kami"),
    (re.compile(r"\bTurso\b", re.IGNORECASE), "database toko"),
    (re.compile(r"\bSupabase\b", re.IGNORECASE), "database toko"),
]

# Guard anti-bocor angka stok di teks final
STOCK_QTY_LEAK_RE = re.compile(
    r"(?:stok(?:nya)?|sisa(?:\s+stok)?|tersisa|tinggal|qty)\s*[:=]?\s*\d+\s*(?:pcs|unit|buah|biji|pasang)?",
    re.IGNORECASE,
)


# ─────────────────────────────────────────────────────────────────────────────
#  1. HELPER WAKTU WIB, AUTH, CONFIG & LOGS (TURSO STORAGE)
# ─────────────────────────────────────────────────────────────────────────────

def wib_now() -> datetime:
    return datetime.now(timezone(timedelta(hours=7)))


def format_idr(amount: Any) -> str:
    try:
        n = int(round(float(amount or 0)))
    except Exception:
        n = 0
    if n <= 0:
        return "-"
    return "Rp " + f"{n:,}".replace(",", ".")


def get_expected_secret() -> str:
    return (
        os.environ.get("WA_CS_SECRET")
        or os.environ.get("WEBHOOK_SECRET")
        or "B4mb4ng123!Aman"
    ).strip()


def verify_secret(provided: str) -> bool:
    expected = get_expected_secret()
    if not expected:
        return True
    return str(provided or "").strip() == expected


def _merge_config(raw: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    cfg = dict(DEFAULT_CONFIG)
    if isinstance(raw, dict):
        for k in DEFAULT_CONFIG:
            if k in raw and raw[k] is not None:
                cfg[k] = raw[k]
    # Sanitasi tipe data
    cfg["enabled"] = bool(cfg.get("enabled", False))
    cfg["autoSchedule"] = bool(cfg.get("autoSchedule", True))
    cfg["ignorePrivateChats"] = bool(cfg.get("ignorePrivateChats", True))
    cfg["replyWithImage"] = bool(cfg.get("replyWithImage", True))
    cfg["openHourWib"] = max(0, min(23, int(cfg.get("openHourWib", 9) or 9)))
    cfg["openMinuteWib"] = max(0, min(59, int(cfg.get("openMinuteWib", 0) or 0)))
    cfg["closeHourWib"] = max(0, min(23, int(cfg.get("closeHourWib", 21) or 21)))
    cfg["closeMinuteWib"] = max(0, min(59, int(cfg.get("closeMinuteWib", 30) or 30)))
    cfg["humanTakeoverMinutes"] = max(0, min(120, int(cfg.get("humanTakeoverMinutes", 10) or 10)))
    scope = str(cfg.get("storeScope") or "ALL").strip().upper()
    cfg["storeScope"] = scope if scope in ("ALL", "SUKO", "MUKU", "ZES") else "ALL"
    cfg["csName"] = str(cfg.get("csName") or "Luqman").strip()[:40] or "Luqman"
    cfg["storeName"] = str(cfg.get("storeName") or "SUKO & Mu+Ku Official").strip()[:60] or "SUKO & Mu+Ku Official"
    if not isinstance(cfg.get("allowedGroups"), list):
        cfg["allowedGroups"] = []
    if not isinstance(cfg.get("detectedGroups"), list):
        cfg["detectedGroups"] = []
    cfg["fonnteToken"] = str(cfg.get("fonnteToken") or "").strip()
    return cfg


def load_config() -> Dict[str, Any]:
    try:
        txt = storage_read_text(CONFIG_STORAGE_PATH, timeout=3.5)
        if txt:
            parsed = json.loads(txt)
            return _merge_config(parsed)
    except Exception:
        pass
    return _merge_config(None)


def save_config(cfg: Dict[str, Any]) -> Dict[str, Any]:
    merged = _merge_config(cfg)
    merged["updatedAt"] = utc_iso_now()
    payload = json.dumps(merged, ensure_ascii=False, indent=2).encode("utf-8")
    storage_write_bytes(CONFIG_STORAGE_PATH, payload, content_type="application/json", timeout=4.5)
    return merged


def mask_config_for_ui(cfg: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(cfg)
    tok = str(out.get("fonnteToken") or "").strip()
    out["fonnteTokenConfigured"] = bool(tok)
    if len(tok) > 8:
        out["fonnteTokenPreview"] = f"{tok[:4]}••••{tok[-4:]}"
    elif tok:
        out["fonnteTokenPreview"] = "••••"
    else:
        out["fonnteTokenPreview"] = ""
    out.pop("fonnteToken", None)
    now_wib = wib_now()
    out["serverWibTime"] = now_wib.strftime("%H:%M WIB")
    out["withinStoreHours"] = is_within_store_hours(cfg, now_wib)
    return out


def load_logs() -> List[Dict[str, Any]]:
    try:
        txt = storage_read_text(LOGS_STORAGE_PATH, timeout=3.0)
        if txt:
            parsed = json.loads(txt)
            if isinstance(parsed, list):
                return parsed[:MAX_LOGS]
    except Exception:
        pass
    return []


def append_log(entry: Dict[str, Any]) -> None:
    try:
        logs = load_logs()
        entry_with_id = {
            "id": f"log_{int(time.time() * 1000)}",
            "timestamp": utc_iso_now(),
            "wibTime": wib_now().strftime("%d/%m %H:%M WIB"),
            **entry,
        }
        logs.insert(0, entry_with_id)
        trimmed = logs[:MAX_LOGS]
        payload = json.dumps(trimmed, ensure_ascii=False).encode("utf-8")
        storage_write_bytes(LOGS_STORAGE_PATH, payload, content_type="application/json", timeout=3.5)
    except Exception:
        pass


def clear_logs() -> None:
    try:
        storage_write_bytes(LOGS_STORAGE_PATH, b"[]", content_type="application/json", timeout=3.5)
    except Exception:
        pass


def is_within_store_hours(cfg: Dict[str, Any], now_wib: Optional[datetime] = None) -> bool:
    now = now_wib or wib_now()
    cur_mins = now.hour * 60 + now.minute
    open_mins = int(cfg.get("openHourWib", 9)) * 60 + int(cfg.get("openMinuteWib", 0))
    close_mins = int(cfg.get("closeHourWib", 21)) * 60 + int(cfg.get("closeMinuteWib", 30))
    if open_mins <= close_mins:
        return open_mins <= cur_mins <= close_mins
    # Jadwal lintas tengah malam
    return cur_mins >= open_mins or cur_mins <= close_mins


def _record_detected_group(cfg: Dict[str, Any], group_id: str, group_name: str, message: str) -> bool:
    """Catat grup masuk ke detectedGroups agar user tinggal 1 klik Aktifkan di UI."""
    gid = str(group_id or "").strip()
    if not gid:
        return False
    gname = str(group_name or "").strip() or gid
    detected: List[Dict[str, Any]] = list(cfg.get("detectedGroups") or [])
    now_iso = utc_iso_now()
    preview = str(message or "").strip()[:80]
    found = False
    for g in detected:
        if str(g.get("id") or "").strip() == gid:
            if gname and gname != gid:
                g["name"] = gname
            g["lastSeenAt"] = now_iso
            g["lastMessage"] = preview
            found = True
            break
    if not found:
        detected.insert(0, {
            "id": gid,
            "name": gname,
            "lastSeenAt": now_iso,
            "lastMessage": preview,
        })
    detected.sort(key=lambda x: str(x.get("lastSeenAt") or ""), reverse=True)
    cfg["detectedGroups"] = detected[:MAX_DETECTED_GROUPS]
    # Sinkronkan nama grup jika sudah ada di allowedGroups
    for ag in cfg.get("allowedGroups") or []:
        if str(ag.get("id") or "").strip() == gid and gname and gname != gid:
            if not ag.get("name") or ag.get("name") == gid:
                ag["name"] = gname
    return True


# ─────────────────────────────────────────────────────────────────────────────
#  2. PEMBERSIHAN URL GAMBAR & SORTING UKURAN
# ─────────────────────────────────────────────────────────────────────────────

def is_clean_product_image(url: Any) -> bool:
    s = str(url or "").strip()
    if not s or not (s.startswith("http://") or s.startswith("https://")):
        return False
    low = s.lower()
    if _UUID_PLACEHOLDER_RE.search(s):
        return False
    if any(bad in low for bad in ("no-image", "placeholder", "default-product", "matahari-logo", "logo-matahari")):
        return False
    return True


def _size_sort_key(sz: str) -> Tuple[int, float, str]:
    up = str(sz or "").strip().upper()
    if up in SIZE_ORDER:
        return (0, float(SIZE_ORDER[up]), up)
    m = re.match(r"^(\d+(?:\.\d+)?)", up)
    if m:
        return (1, float(m.group(1)), up)
    return (2, 0.0, up)


def _parse_json_list(raw: Any) -> List[str]:
    if isinstance(raw, list):
        return [str(x).strip() for x in raw if str(x or "").strip()]
    if isinstance(raw, str) and raw.strip():
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                return [str(x).strip() for x in parsed if str(x or "").strip()]
        except Exception:
            pass
    return []


# ─────────────────────────────────────────────────────────────────────────────
#  3. GEMINI 2.5 FLASH HTTP CLIENT (PURE STDLIB, ZERO PIP DEPS!)
# ─────────────────────────────────────────────────────────────────────────────

def _call_gemini_json(
    prompt: str,
    timeout: float = 4.2,
    temperature: float = 0.2,
    max_tokens: int = 450,
) -> Optional[Dict[str, Any]]:
    api_key = (os.environ.get("GEMINI_API_KEY") or "").strip()
    if not api_key:
        return None
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{urllib.parse.quote(GEMINI_MODEL)}:generateContent?key={urllib.parse.quote(api_key)}"
    )
    body = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": max_tokens,
            "responseMimeType": "application/json",
        },
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with _STD_OPENER.open(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8", errors="ignore"))
        candidates = data.get("candidates") or []
        if not candidates:
            return None
        parts = ((candidates[0].get("content") or {}).get("parts")) or []
        raw_text = "".join(str(p.get("text") or "") for p in parts).strip()
        if not raw_text:
            return None
        # Bersihkan kemungkinan markdown fence
        raw_text = re.sub(r"^```(?:json)?\s*", "", raw_text)
        raw_text = re.sub(r"\s*```$", "", raw_text)
        parsed = json.loads(raw_text)
        return parsed if isinstance(parsed, dict) else None
    except Exception:
        return None


def _call_gemini_text(
    prompt: str,
    timeout: float = 4.5,
    temperature: float = 0.45,
    max_tokens: int = 420,
) -> Optional[str]:
    api_key = (os.environ.get("GEMINI_API_KEY") or "").strip()
    if not api_key:
        return None
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{urllib.parse.quote(GEMINI_MODEL)}:generateContent?key={urllib.parse.quote(api_key)}"
    )
    body = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": max_tokens,
        },
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with _STD_OPENER.open(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8", errors="ignore"))
        candidates = data.get("candidates") or []
        if not candidates:
            return None
        parts = ((candidates[0].get("content") or {}).get("parts")) or []
        text = "".join(str(p.get("text") or "") for p in parts).strip()
        return text or None
    except Exception:
        return None


# ─────────────────────────────────────────────────────────────────────────────
#  4. ANALISIS INTENT & EKSTRAKSI QUERY (GEMINI + FALLBACK DETERMINISTIK)
# ─────────────────────────────────────────────────────────────────────────────

def _extract_deterministic_intent(message: str) -> Dict[str, Any]:
    clean = re.sub(r"\s+", " ", str(message or "").strip())
    low = clean.lower()

    if not clean or len(clean) < 2 or CASUAL_SHORT_RE.match(clean):
        return {
            "intent": "CASUAL_CHAT",
            "shouldReply": False,
            "searchKeywords": [],
            "brandHint": "",
            "categoryHint": "",
            "colorHint": "",
            "sizeHint": "",
            "skuOrArticle": "",
            "wantsPromo": False,
            "engine": "deterministic",
        }

    # Deteksi kode SKU (7-13 digit) atau kode artikel (contoh: TD21638, S2S084D1, T1KT1351, MK-123)
    sku_match = re.search(r"\b(\d{7,13})\b", clean)
    art_match = re.search(r"\b([A-Z]{1,4}\d[A-Z0-9\-]{3,12})\b", clean.upper())
    sku_or_article = ""
    if sku_match:
        sku_or_article = sku_match.group(1)
    elif art_match and not re.match(r"^(?:RP|IDR|WA|HP|COD)\d", art_match.group(1)):
        sku_or_article = art_match.group(1)

    # Deteksi Brand
    brand_hint = ""
    if "suko" in low:
        brand_hint = "SUKO"
    elif "muku" in low or "mu+ku" in low or "mu ku" in low:
        brand_hint = "MUKU"
    elif re.search(r"\bzes\b", low):
        brand_hint = "ZES"
    else:
        for b in ("nevada", "cole", "connexion", "st yves", "fladeo", "nayoung", "byrch", "pipa", "volo", "little m", "trisse"):
            if b in low:
                brand_hint = b.upper()
                break

    # Deteksi Warna
    color_hint = ""
    for canon_color, syns in COLOR_SYNONYMS.items():
        for syn in syns:
            if re.search(rf"\b{re.escape(syn.lower())}\b", low):
                color_hint = canon_color
                break
        if color_hint:
            break

    # Deteksi Ukuran
    size_hint = ""
    sz_m = re.search(r"\b(?:size|ukuran|sz)\s*[:=]?\s*(xxs|xs|s|m|l|xl|xxl|2xl|3xl|\d{2})\b", low)
    if sz_m:
        size_hint = sz_m.group(1).upper()
    else:
        sz_m2 = re.search(r"\b(xxs|xs|xxl|2xl|3xl|xl)\b", low)
        if sz_m2:
            size_hint = sz_m2.group(1).upper()
        elif re.search(r"\b(ukuran|size|sz)\b", low):
            sz_m3 = re.search(r"\b(s|m|l|\d{2})\b", low)
            if sz_m3:
                size_hint = sz_m3.group(1).upper()

    # Deteksi Kategori
    category_hint = ""
    for cat_key, cat_words in CATEGORY_SYNONYMS.items():
        if any(re.search(rf"\b{re.escape(w)}\b", low) for w in cat_words):
            category_hint = cat_key
            break

    wants_promo = any(w in low for w in ("promo", "diskon", "sale", "potongan", "spesial", "special price", "murah"))

    # Token kata kunci produk
    raw_tokens = re.findall(r"[a-zA-Z0-9\+\-]+", low)
    keywords: List[str] = []
    if "kaos kaki" in low:
        keywords.append("kaoskaki")
    for tok in raw_tokens:
        if len(tok) < 2:
            continue
        if tok in STOPWORDS_ID:
            continue
        if color_hint and any(tok == s.lower() for s in COLOR_SYNONYMS.get(color_hint, [])):
            continue
        if size_hint and tok.upper() == size_hint:
            continue
        if tok not in keywords:
            keywords.append(tok)

    has_trigger = bool(sku_or_article or brand_hint or category_hint or wants_promo)
    if not has_trigger:
        has_trigger = any(re.search(rf"\b{re.escape(w)}\b", low) for w in INQUIRY_TRIGGER_WORDS)

    # Sapaan khusus ke admin/CS
    is_direct_greeting = bool(
        re.search(r"\b(halo|hai|hi|permisi|selamat\s+(?:pagi|siang|sore|malam))\b", low)
        and re.search(r"\b(min|admin|kak|mas|mbak|cs|toko|suko|muku)\b", low)
    )

    if sku_or_article or keywords or category_hint or brand_hint:
        intent = "PROMO_INQUIRY" if (wants_promo and not keywords and not sku_or_article) else "PRODUCT_INQUIRY"
        should_reply = has_trigger
    elif wants_promo:
        intent = "PROMO_INQUIRY"
        should_reply = True
    elif is_direct_greeting:
        intent = "GREETING"
        should_reply = True
    else:
        intent = "CASUAL_CHAT"
        should_reply = False

    return {
        "intent": intent,
        "shouldReply": should_reply,
        "searchKeywords": keywords[:6],
        "brandHint": brand_hint,
        "categoryHint": category_hint,
        "colorHint": color_hint,
        "sizeHint": size_hint,
        "skuOrArticle": sku_or_article,
        "wantsPromo": wants_promo,
        "engine": "deterministic",
    }


def analyze_message_intent(message: str, is_group: bool) -> Dict[str, Any]:
    """Gabungkan pre-filter kilat + Gemini 2.5 Flash intent classifier."""
    det = _extract_deterministic_intent(message)
    clean = str(message or "").strip()

    # Jika pesan sangat pendek / jelas bukan tanya produk (wkwk, ok, siap), skip Gemini -> 0ms!
    if not clean or len(clean) < 2 or CASUAL_SHORT_RE.match(clean):
        return det

    # Jika ada kode SKU / artikel yang jelas, langsung proses tanpa tunggu Gemini classifier!
    if det.get("skuOrArticle"):
        return det

    prompt = (
        "Kamu adalah classifier pesan untuk Customer Service toko fashion ritel (SUKO, Mu+Ku, ZES, Nevada, Cole, dll) di grup WhatsApp member eksklusif.\n"
        f"Konteks: {'Pesan masuk di GRUP WhatsApp member' if is_group else 'Pesan masuk via simulasi/chat langsung'}.\n"
        f"Pesan customer: {json.dumps(clean, ensure_ascii=False)}\n\n"
        "Tugasmu HANYA membalas JSON murni dengan format:\n"
        "{\n"
        '  "intent": "PRODUCT_INQUIRY" | "PROMO_INQUIRY" | "ORDER_INFO" | "GREETING" | "CASUAL_CHAT",\n'
        '  "shouldReply": true atau false,\n'
        '  "searchKeywords": ["kata kunci produk inti, maks 4 kata, misal kaos, jaket, celana, sepatu"],\n'
        '  "brandHint": "SUKO" | "MUKU" | "ZES" | nama brand lain | "",\n'
        '  "categoryHint": "ATASAN" | "JAKET" | "CELANA" | "DRESS_ROK" | "SEPATU_SANDAL" | "TAS_AKSESORIS" | "BEAUTY" | "TIDUR_DALAM" | "",\n'
        '  "colorHint": "BLACK" | "WHITE" | "NAVY" | "BLUE" | "GREY" | "RED" | "GREEN" | "BEIGE" | "BROWN" | "PINK" | "YELLOW" | "ORANGE" | "PURPLE" | "",\n'
        '  "sizeHint": "XS"|"S"|"M"|"L"|"XL"|"XXL"|angka ukuran|"",\n'
        '  "skuOrArticle": "kode SKU/artikel jika ada atau kosong",\n'
        '  "wantsPromo": true atau false\n'
        "}\n\n"
        "ATURAN KETAT:\n"
        "- Jika pesan HANYA obrolan santai antar member/teman (contoh: 'bro nongkrong yuk', 'lagi dimana', 'wkwkwk', 'mantap', 'info kopi', 'kapan gajian', 'otw'), WAJIB set intent='CASUAL_CHAT' dan shouldReply=false!\n"
        "- Jika pesan menanyakan ketersediaan barang, harga, ukuran, warna, foto, promo/diskon, atau cara order -> shouldReply=true.\n"
        "- Jika pesan hanya menyapa admin/toko dengan sopan ('halo min', 'permisi kak mau tanya') -> intent='GREETING', shouldReply=true.\n"
    )

    ai_res = _call_gemini_json(prompt, timeout=3.8, temperature=0.1, max_tokens=260)
    if not ai_res:
        return det

    intent = str(ai_res.get("intent") or det["intent"]).upper()
    should_reply = bool(ai_res.get("shouldReply", det["shouldReply"]))
    if intent == "CASUAL_CHAT":
        should_reply = False

    kws = ai_res.get("searchKeywords")
    if isinstance(kws, list):
        clean_kws = [str(k).strip().lower() for k in kws if str(k or "").strip()][:6]
    else:
        clean_kws = det["searchKeywords"]

    return {
        "intent": intent,
        "shouldReply": should_reply,
        "searchKeywords": clean_kws or det["searchKeywords"],
        "brandHint": str(ai_res.get("brandHint") or det["brandHint"] or "").strip().upper(),
        "categoryHint": str(ai_res.get("categoryHint") or det["categoryHint"] or "").strip().upper(),
        "colorHint": str(ai_res.get("colorHint") or det["colorHint"] or "").strip().upper(),
        "sizeHint": str(ai_res.get("sizeHint") or det["sizeHint"] or "").strip().upper(),
        "skuOrArticle": str(ai_res.get("skuOrArticle") or det["skuOrArticle"] or "").strip().upper(),
        "wantsPromo": bool(ai_res.get("wantsPromo", det["wantsPromo"])),
        "engine": "gemini-2.5-flash",
    }


# ─────────────────────────────────────────────────────────────────────────────
#  5. PENCARIAN KATALOG TURSO DB + HARD PRIVACY SANITIZER (NO STOCK QTY!)
# ─────────────────────────────────────────────────────────────────────────────

def _expand_keyword_terms(keywords: List[str]) -> List[str]:
    terms: List[str] = []
    for kw in keywords:
        low = kw.lower().strip()
        if not low:
            continue
        if low.upper() not in terms:
            terms.append(low.upper())
        for syn in SYNONYM_GROUPS.get(low, []):
            if syn.upper() not in terms:
                terms.append(syn.upper())
    return terms[:14]


def _color_matches(variant_color: str, color_hint: str) -> bool:
    if not color_hint:
        return True
    vc = str(variant_color or "").upper()
    if not vc:
        return False
    if color_hint in vc:
        return True
    for syn in COLOR_SYNONYMS.get(color_hint, []):
        if syn.upper() in vc:
            return True
    return False


def _size_matches(variant_size: str, size_hint: str) -> bool:
    if not size_hint:
        return True
    vs = str(variant_size or "").strip().upper()
    sh = str(size_hint or "").strip().upper()
    if not vs:
        return False
    if vs == sh:
        return True
    if sh == "XXL" and vs in ("2XL", "XXL"):
        return True
    if sh == "2XL" and vs in ("2XL", "XXL"):
        return True
    return bool(re.search(rf"(?:^|[\s/\-])({re.escape(sh)})(?:$|[\s/\-])", vs))


def search_sanitized_catalog(intent_info: Dict[str, Any], store_scope: str = "ALL", limit: int = 3) -> List[Dict[str, Any]]:
    """
    Cari produk di Turso DB (`CatalogArticle` + `Product`) dan kembalikan
    ringkasan produk 100% TER-SANITASI TANPA ANGKA QTY STOK!
    """
    sku_or_art = str(intent_info.get("skuOrArticle") or "").strip()
    keywords = list(intent_info.get("searchKeywords") or [])
    brand_hint = str(intent_info.get("brandHint") or "").strip().upper()
    category_hint = str(intent_info.get("categoryHint") or "").strip().upper()
    color_hint = str(intent_info.get("colorHint") or "").strip().upper()
    size_hint = str(intent_info.get("sizeHint") or "").strip().upper()
    wants_promo = bool(intent_info.get("wantsPromo", False))

    scope_sql = ""
    scope_params: List[Any] = []
    if store_scope in ("SUKO", "MUKU", "ZES"):
        scope_sql = ' AND "brandGroup" = ?'
        scope_params.append(store_scope)

    candidates: List[Dict[str, Any]] = []

    # 1. Exact SKU / Barcode / Article match di tabel Product & CatalogArticle
    if sku_or_art:
        rows = turso_query(
            'SELECT key, sku, barcode, article, description, brand, dept, "brandGroup", "subBrand", '
            '"categoryKey", color, size, "hargaNormal", "hargaPromo", diskon, "discountType", "toDate", '
            '"imageUrl", "articleTotalStok", "articleColors", "articleSizes", "articleHasPromo", "articlePromoLabel" '
            'FROM "CatalogArticle" '
            'WHERE (UPPER(sku) = UPPER(?) OR UPPER(COALESCE(barcode, \'\')) = UPPER(?) OR UPPER(COALESCE(article, \'\')) LIKE UPPER(?))'
            + scope_sql +
            ' ORDER BY ("articleTotalStok" > 0) DESC, ("imageUrl" IS NOT NULL AND "imageUrl" != \'\') DESC, "sortRank" ASC LIMIT 12',
            tuple([sku_or_art, sku_or_art, f"%{sku_or_art}%"] + scope_params),
            timeout=4.5,
        )
        candidates.extend(rows)

        if not candidates:
            # Fallback langsung ke tabel Product (jika artikel baru belum masuk CatalogArticle)
            p_rows = turso_query(
                'SELECT sku, barcode, article, description, brand, dept, color, size, stok, '
                '"hargaNormal", "hargaPromo", diskon, "discountType", "toDate", "imageUrl", images '
                'FROM "Product" '
                'WHERE UPPER(sku) = UPPER(?) OR UPPER(COALESCE(barcode, \'\')) = UPPER(?) OR UPPER(COALESCE(article, \'\')) LIKE UPPER(?) '
                'ORDER BY (stok > 0) DESC LIMIT 12',
                (sku_or_art, sku_or_art, f"%{sku_or_art}%"),
                timeout=4.5,
            )
            for pr in p_rows:
                candidates.append({
                    "key": pr.get("article") or pr.get("sku"),
                    "sku": pr.get("sku"),
                    "barcode": pr.get("barcode"),
                    "article": pr.get("article") or pr.get("sku"),
                    "description": pr.get("description"),
                    "brand": pr.get("brand"),
                    "dept": pr.get("dept"),
                    "brandGroup": "SUKO" if "SUKO" in str(pr.get("brand") or "").upper() else "MUKU",
                    "subBrand": pr.get("brand") or "",
                    "categoryKey": "",
                    "hargaNormal": pr.get("hargaNormal"),
                    "hargaPromo": pr.get("hargaPromo"),
                    "diskon": pr.get("diskon"),
                    "discountType": pr.get("discountType"),
                    "toDate": pr.get("toDate"),
                    "imageUrl": pr.get("imageUrl"),
                    "articleTotalStok": pr.get("stok") or 0,
                    "articleColors": json.dumps([pr.get("color")] if pr.get("color") else []),
                    "articleSizes": json.dumps([pr.get("size")] if pr.get("size") else []),
                    "articleHasPromo": bool(pr.get("hargaPromo") or pr.get("diskon")),
                    "articlePromoLabel": pr.get("discountType") or pr.get("diskon") or "",
                })

    # 2. Pencarian berbasis kata kunci / kategori / brand / promo di CatalogArticle
    if not candidates:
        expanded_terms = _expand_keyword_terms(keywords)
        where_clauses: List[str] = ["1=1"]
        params: List[Any] = []

        if store_scope in ("SUKO", "MUKU", "ZES"):
            where_clauses.append('"brandGroup" = ?')
            params.append(store_scope)

        if brand_hint:
            if brand_hint in ("SUKO", "MUKU", "ZES"):
                where_clauses.append('("brandGroup" = ? OR UPPER(COALESCE("subBrand", \'\')) LIKE ? OR UPPER(COALESCE(brand, \'\')) LIKE ?)')
                params.extend([brand_hint, f"%{brand_hint}%", f"%{brand_hint}%"])
            else:
                where_clauses.append('(UPPER(COALESCE("subBrand", \'\')) LIKE ? OR UPPER(COALESCE(brand, \'\')) LIKE ? OR UPPER(COALESCE(dept, \'\')) LIKE ?)')
                params.extend([f"%{brand_hint}%", f"%{brand_hint}%", f"%{brand_hint}%"])

        if wants_promo and not expanded_terms and not category_hint:
            where_clauses.append('"articleHasPromo" = 1')

        # Bangun filter OR yang mencakup sinonim + categoryKey
        or_parts: List[str] = []
        or_params: List[Any] = []
        for term in expanded_terms[:8]:
            like_val = f"%{term}%"
            or_parts.append(
                '(UPPER(description) LIKE ? OR UPPER(COALESCE(article, \'\')) LIKE ? '
                'OR UPPER(COALESCE("subBrand", \'\')) LIKE ? OR UPPER(COALESCE(dept, \'\')) LIKE ?)'
            )
            or_params.extend([like_val, like_val, like_val, like_val])
        if category_hint:
            or_parts.append('"categoryKey" = ?')
            or_params.append(category_hint)

        if or_parts:
            where_clauses.append("(" + " OR ".join(or_parts) + ")")
            params.extend(or_params)

        sql = (
            'SELECT key, sku, barcode, article, description, brand, dept, "brandGroup", "subBrand", '
            '"categoryKey", color, size, "hargaNormal", "hargaPromo", diskon, "discountType", "toDate", '
            '"imageUrl", "articleTotalStok", "articleColors", "articleSizes", "articleHasPromo", "articlePromoLabel" '
            'FROM "CatalogArticle" '
            f'WHERE {" AND ".join(where_clauses)} '
            'ORDER BY ("articleTotalStok" > 0) DESC, ("imageUrl" IS NOT NULL AND "imageUrl" != \'\') DESC, '
            '"articleHasPromo" DESC, "sortRank" ASC LIMIT 45'
        )
        candidates = turso_query(sql, tuple(params), timeout=4.5)

        # Fallback jika terlalu ketat dengan brand_hint: cari ulang tanpa brand_hint
        if not candidates and brand_hint and (expanded_terms or category_hint):
            fb_clauses = ["1=1"]
            fb_params: List[Any] = []
            if store_scope in ("SUKO", "MUKU", "ZES"):
                fb_clauses.append('"brandGroup" = ?')
                fb_params.append(store_scope)
            if or_parts:
                fb_clauses.append("(" + " OR ".join(or_parts) + ")")
                fb_params.extend(or_params)
            sql_fb = (
                'SELECT key, sku, barcode, article, description, brand, dept, "brandGroup", "subBrand", '
                '"categoryKey", color, size, "hargaNormal", "hargaPromo", diskon, "discountType", "toDate", '
                '"imageUrl", "articleTotalStok", "articleColors", "articleSizes", "articleHasPromo", "articlePromoLabel" '
                'FROM "CatalogArticle" '
                f'WHERE {" AND ".join(fb_clauses)} '
                'ORDER BY ("articleTotalStok" > 0) DESC, ("imageUrl" IS NOT NULL AND "imageUrl" != \'\') DESC, "sortRank" ASC LIMIT 30'
            )
            candidates = turso_query(sql_fb, tuple(fb_params), timeout=4.5)

    if not candidates:
        return []

    # 3. Skoring Relevansi (Ready + Foto Bersih + Keyword + Warna + Ukuran + Promo)
    expanded_set = set(_expand_keyword_terms(keywords))
    scored: List[Tuple[int, Dict[str, Any]]] = []
    seen_articles = set()

    for c in candidates:
        art_key = str(c.get("article") or c.get("sku") or "").strip().upper()
        if not art_key or art_key in seen_articles:
            continue
        seen_articles.add(art_key)

        score = 0
        desc_up = f"{c.get('description') or ''} {c.get('article') or ''} {c.get('subBrand') or ''} {c.get('dept') or ''}".upper()
        total_stok = int(c.get("articleTotalStok") or 0)

        if total_stok > 0:
            score += 120
        if is_clean_product_image(c.get("imageUrl")):
            score += 75
        if sku_or_art and (
            sku_or_art.upper() == str(c.get("sku") or "").upper()
            or sku_or_art.upper() in str(c.get("article") or "").upper()
        ):
            score += 300
        if brand_hint and (
            brand_hint == str(c.get("brandGroup") or "").upper()
            or brand_hint in str(c.get("subBrand") or "").upper()
            or brand_hint in str(c.get("brand") or "").upper()
        ):
            score += 80
        if category_hint and str(c.get("categoryKey") or "").upper() == category_hint:
            score += 65
        for term in expanded_set:
            if term in desc_up:
                score += 45
        if wants_promo and bool(c.get("articleHasPromo")):
            score += 60

        colors_list = _parse_json_list(c.get("articleColors"))
        sizes_list = _parse_json_list(c.get("articleSizes"))
        if color_hint and any(_color_matches(col, color_hint) for col in colors_list):
            score += 55
        if size_hint and any(_size_matches(sz, size_hint) for sz in sizes_list):
            score += 55

        scored.append((score, c))

    scored.sort(key=lambda x: x[0], reverse=True)
    top_rows = [row for _, row in scored[:limit]]

    # 4. Tarik detail varian asli dari tabel Product agar status warna & ukuran READY 100% akurat
    top_articles = [str(r.get("article") or "").strip() for r in top_rows if str(r.get("article") or "").strip()]
    variants_by_article: Dict[str, List[Dict[str, Any]]] = {}
    if top_articles:
        placeholders = ",".join("?" for _ in top_articles)
        v_rows = turso_query(
            'SELECT sku, article, description, brand, dept, color, size, stok, '
            '"hargaNormal", "hargaPromo", diskon, "discountType", "toDate", "imageUrl", images '
            f'FROM "Product" WHERE article IN ({placeholders})',
            tuple(top_articles),
            timeout=4.0,
        )
        for vr in v_rows:
            ak = str(vr.get("article") or "").strip().upper()
            variants_by_article.setdefault(ak, []).append(vr)

    # 5. HARD PRIVACY SANITIZER: HAPUS TOTAL ANGKA STOK! HANYA READY / SOLD_OUT!
    sanitized_products: List[Dict[str, Any]] = []
    for r in top_rows:
        art = str(r.get("article") or "").strip()
        ak = art.upper()
        v_list = variants_by_article.get(ak) or []

        ready_colors_set = set()
        ready_sizes_set = set()
        all_colors_set = set()
        all_sizes_set = set()
        best_image = ""
        matching_color_image = ""

        # Pilih harga promo terbaik / harga normal ter-sanitasi
        harga_normal = parse_retail_price(r.get("hargaNormal")) or 0
        harga_promo = parse_retail_price(r.get("hargaPromo"))
        promo_label = str(r.get("articlePromoLabel") or r.get("discountType") or r.get("diskon") or "").strip()
        promo_until = str(r.get("toDate") or "").strip()

        if is_clean_product_image(r.get("imageUrl")):
            best_image = str(r.get("imageUrl")).strip()

        any_ready = False
        requested_variant_matched = False
        requested_variant_ready = False

        if v_list:
            for v in v_list:
                v_stok = int(v.get("stok") or 0)
                v_col = str(v.get("color") or "").strip()
                v_sz = str(v.get("size") or "").strip()
                if v_col and v_col.upper() not in ("NO COLOR", "NONE", "-"):
                    all_colors_set.add(v_col)
                if v_sz and v_sz.upper() not in ("NONE", "-"):
                    all_sizes_set.add(v_sz)

                if v_stok > 0:
                    any_ready = True
                    if v_col and v_col.upper() not in ("NO COLOR", "NONE", "-"):
                        ready_colors_set.add(v_col)
                    if v_sz and v_sz.upper() not in ("NONE", "-"):
                        ready_sizes_set.add(v_sz)

                # Cek varian spesifik yg diminta customer (warna &/atau ukuran)
                col_ok = _color_matches(v_col, color_hint) if color_hint else True
                sz_ok = _size_matches(v_sz, size_hint) if size_hint else True
                if (color_hint or size_hint) and col_ok and sz_ok:
                    requested_variant_matched = True
                    if v_stok > 0:
                        requested_variant_ready = True

                # Pilih gambar paling cocok dengan warna yang ditanya!
                v_img = str(v.get("imageUrl") or "").strip()
                if not is_clean_product_image(v_img):
                    for extra_img in _parse_json_list(v.get("images")):
                        if is_clean_product_image(extra_img):
                            v_img = extra_img
                            break
                if is_clean_product_image(v_img):
                    if color_hint and col_ok and not matching_color_image:
                        matching_color_image = v_img
                    if not best_image:
                        best_image = v_img
        else:
            any_ready = int(r.get("articleTotalStok") or 0) > 0
            all_colors_set.update(_parse_json_list(r.get("articleColors")))
            all_sizes_set.update(_parse_json_list(r.get("articleSizes")))
            if any_ready:
                ready_colors_set.update(all_colors_set)
                ready_sizes_set.update(all_sizes_set)

        final_image = matching_color_image or best_image
        if harga_promo and harga_normal and harga_promo >= harga_normal:
            harga_promo = None

        # Tentukan status ketersediaan (100% BOOLEAN TEXT — NOL ANGKA!)
        availability = "READY" if any_ready else "SOLD_OUT"
        requested_status = ""
        if color_hint or size_hint:
            if requested_variant_ready:
                requested_status = "REQUESTED_VARIANT_READY"
            elif requested_variant_matched or any_ready:
                requested_status = "REQUESTED_VARIANT_SOLD_OUT_OTHERS_READY" if any_ready else "SOLD_OUT"
            else:
                requested_status = "REQUESTED_VARIANT_NOT_AVAILABLE"

        # Bersihkan nama produk agar mudah dibaca customer
        raw_desc = str(r.get("description") or "").strip()
        clean_name = raw_desc.split(":")[0].strip() if ":" in raw_desc else raw_desc

        sanitized_products.append({
            "sku": str(r.get("sku") or ""),
            "article": art,
            "name": clean_name or art,
            "brand": str(r.get("subBrand") or r.get("brand") or r.get("brandGroup") or "").strip(),
            "storeGroup": str(r.get("brandGroup") or "").strip(),
            "category": str(r.get("categoryKey") or "").strip(),
            "availability": availability,  # HANYA "READY" | "SOLD_OUT"
            "requestedVariantStatus": requested_status,
            "readyColors": sorted(ready_colors_set)[:10],
            "readySizes": sorted(ready_sizes_set, key=_size_sort_key)[:12],
            "hargaNormal": harga_normal,
            "hargaNormalText": format_idr(harga_normal),
            "hargaPromo": harga_promo,
            "hargaPromoText": format_idr(harga_promo) if harga_promo else None,
            "promoLabel": promo_label if (harga_promo or r.get("articleHasPromo")) else "",
            "promoUntil": promo_until if (harga_promo or r.get("articleHasPromo")) else "",
            "imageUrl": final_image,
        })

    return sanitized_products


# ─────────────────────────────────────────────────────────────────────────────
#  6. GENERATOR BALASAN HALO BCA (GEMINI + TEMPLATE FALLBACK + PRIVACY GUARD)
# ─────────────────────────────────────────────────────────────────────────────

def _sanitize_outgoing_reply(text: str) -> str:
    """Lapisan pengaman terakhir agar tidak ada istilah internal atau angka stok yang bocor."""
    out = str(text or "").strip()
    for pat, repl in FORBIDDEN_INTERNAL_TERMS:
        out = pat.sub(repl, out)
    out = STOCK_QTY_LEAK_RE.sub("statusnya Ready", out)
    return out


def _build_template_reply(
    sender_name: str,
    intent_info: Dict[str, Any],
    products: List[Dict[str, Any]],
    cfg: Dict[str, Any],
) -> str:
    sapaan = f"Kak {sender_name.split()[0]}" if sender_name and sender_name.lower() not in ("customer", "user", "member") else "Kak"
    cs_name = cfg.get("csName") or "Luqman"
    store_name = cfg.get("storeName") or "SUKO & Mu+Ku Official"
    intent = intent_info.get("intent") or "PRODUCT_INQUIRY"

    if intent == "GREETING":
        return (
            f"Halo {sapaan}, selamat datang di *{store_name}*! 😊\n"
            f"Dengan saya *{cs_name}*, ada produk, ukuran, warna, atau info promo yang bisa saya bantu cekkan hari ini Kak? Silakan info saja ya, dengan senang hati saya bantu 🙏"
        )

    if not products:
        return (
            f"Halo {sapaan}, terima kasih sudah menghubungi kami 😊\n"
            f"Mohon maaf Kak, untuk produk yang Kakak maksud saat ini belum kami temukan atau sedang *sold out* di katalog kami.\n\n"
            f"Boleh info nama model / kode artikel / warna yang Kakak cari agar saya bantu cekkan alternatif terbaik yang sedang *ready* ya Kak? 🙏"
        )

    lines: List[str] = [f"Halo {sapaan}, terima kasih sudah bertanya! Dengan senang hati saya bantu cekkan ya 😊\n"]
    for idx, p in enumerate(products[:3], start=1):
        prefix = f"*{idx}. {p['name']}*" if len(products) > 1 else f"*{p['name']}*"
        brand_tag = f" ({p['brand']})" if p.get("brand") else ""
        lines.append(f"{prefix}{brand_tag}")

        if p.get("hargaPromoText"):
            promo_extra = f" — _{p['promoLabel']}_" if p.get("promoLabel") else ""
            lines.append(f"🏷️ Harga: ~{p['hargaNormalText']}~ ➡️ *{p['hargaPromoText']}*{promo_extra}")
        else:
            lines.append(f"🏷️ Harga: *{p['hargaNormalText']}*")

        if p["availability"] == "READY":
            if p.get("requestedVariantStatus") == "REQUESTED_VARIANT_SOLD_OUT_OTHERS_READY":
                lines.append("📦 Status: Mohon maaf Kak, warna/ukuran yang Kakak tanyakan sedang *sold out*, namun varian lain masih *Ready*:")
            else:
                lines.append("📦 Status: *Ready* Kak! ✨")
            if p.get("readyColors"):
                lines.append(f"🎨 Warna ready: {', '.join(p['readyColors'][:6])}")
            if p.get("readySizes"):
                lines.append(f"📏 Ukuran ready: {', '.join(p['readySizes'][:8])}")
        else:
            lines.append("📦 Status: Mohon maaf Kak, produk ini saat ini sedang *sold out* 🙏")
        lines.append("")

    lines.append(
        "Jika Kakak berminat, boleh info *warna & ukuran* yang diinginkan agar segera saya bantu siapkan/keep ya Kak 🙏"
    )
    return "\n".join(lines).strip()


def generate_halo_bca_reply(
    sender_name: str,
    message: str,
    intent_info: Dict[str, Any],
    products: List[Dict[str, Any]],
    cfg: Dict[str, Any],
) -> str:
    cs_name = cfg.get("csName") or "Luqman"
    store_name = cfg.get("storeName") or "SUKO & Mu+Ku Official"
    sapaan = sender_name.split()[0] if sender_name and sender_name.lower() not in ("customer", "user", "member") else "Kak"

    if intent_info.get("intent") == "GREETING" and not products:
        return _build_template_reply(sender_name, intent_info, [], cfg)

    prompt = (
        f"Kamu adalah *{cs_name}*, Customer Service profesional, hangat, sopan, dan responsif ala *Halo BCA* "
        f"untuk grup WhatsApp member eksklusif *{store_name}*.\n\n"
        f"Nama Customer: {sapaan}\n"
        f"Pesan Customer: {json.dumps(message, ensure_ascii=False)}\n"
        f"Detail Permintaan Terdeteksi: {json.dumps({'intent': intent_info.get('intent'), 'colorHint': intent_info.get('colorHint'), 'sizeHint': intent_info.get('sizeHint'), 'wantsPromo': intent_info.get('wantsPromo')}, ensure_ascii=False)}\n"
        f"Data Produk Resmi (SUDAH TER-SANITASI): {json.dumps(products, ensure_ascii=False)}\n\n"
        "ATURAN WAJIB BALASAN (IKUTI 100%):\n"
        "1. Gunakan bahasa Indonesia yang sangat ramah, hangat, solutif, sopan ala Halo BCA (sapa 'Halo Kak ...', akhiri dengan penawaran bantuan / keep barang).\n"
        "2. DILARANG KERAS menyebut angka jumlah stok / qty (jangan pernah tulis 'sisa 1', 'stok 2 pcs', dll)! HANYA sebut '*Ready*' atau '*sedang sold out*'.\n"
        "3. Jika `requestedVariantStatus == 'REQUESTED_VARIANT_SOLD_OUT_OTHERS_READY'`, sampaikan dengan lembut bahwa warna/ukuran spesifik yang ditanya sedang *sold out*, lalu tawarkan warna/ukuran lain yang *ready*.\n"
        "4. Tampilkan nama produk, harga normal, dan harga promo (jika `hargaPromoText` ada, pakai format coret ~Rp Normal~ ➡️ *Rp Promo*), serta warna & ukuran yang ready.\n"
        "5. Jika `imageUrl` produk pertama tersedia, boleh sebut singkat 'Berikut foto produknya ya Kak' karena foto otomatis dilampirkan bersama pesan ini.\n"
        "6. Jika daftar produk kosong, minta maaf dengan ramah dan tanyakan detail model/warna/ukuran agar bisa dicarikan alternatif.\n"
        "7. Format rapi untuk WhatsApp (*tebal*, emoji secukupnya 2-4 saja), singkat jelas (maks 110 kata), JANGAN sebut nama sistem internal (MDS, StoreHub, Matahari.com, Turso).\n"
        "Balas HANYA teks pesan WhatsApp siap kirim tanpa pembuka atau penjelasan tambahan."
    )

    ai_reply = _call_gemini_text(prompt, timeout=4.2, temperature=0.45, max_tokens=380)
    if ai_reply and len(ai_reply) >= 20:
        return _sanitize_outgoing_reply(ai_reply)

    return _sanitize_outgoing_reply(_build_template_reply(sender_name, intent_info, products, cfg))


# ─────────────────────────────────────────────────────────────────────────────
#  7. ORCHESTRATOR UTAMA (`handle_wa_cs_request`)
# ─────────────────────────────────────────────────────────────────────────────

def _handle_self_command(text: str, cfg: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    cmd = str(text or "").strip().lower()
    if cmd in ("!csoff", "/csoff", "!cs off", "!matikan cs"):
        cfg["enabled"] = False
        save_config(cfg)
        return {
            "success": True,
            "shouldReply": True,
            "reason": "SELF_CMD_OFF",
            "replyText": (
                "🔴 *[AUTO CS NON-AKTIF]*\n"
                "Saklar Master Auto CS berhasil dimatikan. Akun WA Kakak aman dan tidak akan membalas otomatis.\n"
                "Ketik *!cson* kapan saja untuk menyalakan kembali."
            ),
            "imageUrl": None,
            "configEnabled": False,
        }
    if cmd in ("!cson", "/cson", "!cs on", "!aktifkan cs"):
        cfg["enabled"] = True
        save_config(cfg)
        active_grps = [g.get("name") or g.get("id") for g in (cfg.get("allowedGroups") or []) if g.get("enabled", True)]
        grp_info = ", ".join(active_grps[:5]) if active_grps else "(Belum ada grup di-whitelist)"
        return {
            "success": True,
            "shouldReply": True,
            "reason": "SELF_CMD_ON",
            "replyText": (
                "🟢 *[AUTO CS AKTIF]*\n"
                f"Auto CS resmi menyala!\n"
                f"• Grup aktif: {grp_info}\n"
                f"• Chat pribadi teman: {'100% DIBLOKIR 🔒' if cfg.get('ignorePrivateChats', True) else 'Diizinkan'}\n"
                "Ketik *!csoff* kapan saja saat toko tutup."
            ),
            "imageUrl": None,
            "configEnabled": True,
        }
    if cmd in ("!csstatus", "/csstatus", "!cs status"):
        now_wib = wib_now()
        within = is_within_store_hours(cfg, now_wib)
        active_grps = [g.get("name") or g.get("id") for g in (cfg.get("allowedGroups") or []) if g.get("enabled", True)]
        status_label = "🟢 AKTIF" if cfg.get("enabled") else "🔴 NON-AKTIF"
        return {
            "success": True,
            "shouldReply": True,
            "reason": "SELF_CMD_STATUS",
            "replyText": (
                f"🤖 *[STATUS AUTO CS]*\n"
                f"• Saklar Master: *{status_label}*\n"
                f"• Jam WIB: {now_wib.strftime('%H:%M WIB')} ({'Dalam Jam Toko ✅' if within else 'Di Luar Jam Toko 🌙'})\n"
                f"• Chat Pribadi: {'Diblokir Aman 🔒' if cfg.get('ignorePrivateChats', True) else 'Aktif'}\n"
                f"• Grup Whitelist ({len(active_grps)}): {', '.join(active_grps[:5]) or '-'}"
            ),
            "imageUrl": None,
            "configEnabled": bool(cfg.get("enabled")),
        }
    return None


def _process_incoming_or_simulate(payload: Dict[str, Any], is_simulation: bool = False) -> Dict[str, Any]:
    t0 = time.monotonic()
    cfg = load_config()

    message = str(payload.get("message") or "").strip()
    sender = str(payload.get("sender") or "").strip()
    sender_name = str(payload.get("senderName") or "Kak").strip()
    group_id = str(payload.get("groupId") or "").strip()
    group_name = str(payload.get("groupName") or group_id or "Simulasi Web").strip()
    is_group = bool(payload.get("isGroup", bool(group_id)))
    from_me = bool(payload.get("fromMe", False))
    source = "SIMULATOR" if is_simulation else str(payload.get("source") or "WA_BRIDGE").upper()
    ignore_switch = bool(payload.get("ignoreSwitch", False)) and is_simulation

    if not message:
        return {"success": True, "shouldReply": False, "reason": "EMPTY_MESSAGE", "elapsedMs": 0}

    # 1. Perintah darurat PIC dari WA sendiri (!csoff / !cson / !csstatus)
    if from_me and not is_simulation:
        cmd_res = _handle_self_command(message, cfg)
        if cmd_res is not None:
            cmd_res["elapsedMs"] = int((time.monotonic() - t0) * 1000)
            append_log({
                "source": source,
                "groupId": group_id or sender,
                "groupName": group_name or "Perintah PIC",
                "senderName": sender_name or "PIC",
                "message": message,
                "decision": "COMMAND",
                "reason": cmd_res["reason"],
                "replyPreview": cmd_res["replyText"][:140],
                "imageUrl": None,
                "matchedSku": None,
                "elapsedMs": cmd_res["elapsedMs"],
            })
            return cmd_res
        return {
            "success": True,
            "shouldReply": False,
            "reason": "SELF_MESSAGE_IGNORED",
            "elapsedMs": int((time.monotonic() - t0) * 1000),
        }

    # 2. Auto-detect grup baru (bahkan saat bot OFF atau belum di-whitelist!)
    config_dirty = False
    if is_group and group_id and not is_simulation:
        config_dirty = _record_detected_group(cfg, group_id, group_name, message)

    # 3. Proteksi Chat Pribadi Teman / Keluarga
    if not is_simulation and not is_group and cfg.get("ignorePrivateChats", True):
        if config_dirty:
            save_config(cfg)
        elapsed = int((time.monotonic() - t0) * 1000)
        return {
            "success": True,
            "shouldReply": False,
            "reason": "PRIVATE_CHAT_BLOCKED",
            "elapsedMs": elapsed,
        }

    # 4. Proteksi Whitelist Grup Ketat
    if not is_simulation and is_group:
        allowed = cfg.get("allowedGroups") or []
        is_allowed = any(
            str(g.get("id") or "").strip() == group_id and bool(g.get("enabled", True))
            for g in allowed
        )
        if not is_allowed:
            if config_dirty:
                save_config(cfg)
            elapsed = int((time.monotonic() - t0) * 1000)
            append_log({
                "source": source,
                "groupId": group_id,
                "groupName": group_name,
                "senderName": sender_name,
                "message": message[:140],
                "decision": "IGNORED",
                "reason": "GROUP_NOT_WHITELISTED",
                "replyPreview": "Grup baru terdeteksi — aktifkan di panel Whitelist Grup untuk mulai membalas.",
                "imageUrl": None,
                "matchedSku": None,
                "elapsedMs": elapsed,
            })
            return {
                "success": True,
                "shouldReply": False,
                "reason": "GROUP_NOT_WHITELISTED",
                "groupDetected": True,
                "elapsedMs": elapsed,
            }

    if config_dirty:
        save_config(cfg)

    # 5. Cek Master Switch ON/OFF & Jadwal Operasional Toko WIB
    if not ignore_switch:
        if not cfg.get("enabled", False):
            elapsed = int((time.monotonic() - t0) * 1000)
            if not is_simulation:
                append_log({
                    "source": source,
                    "groupId": group_id or sender,
                    "groupName": group_name,
                    "senderName": sender_name,
                    "message": message[:140],
                    "decision": "IGNORED",
                    "reason": "MASTER_SWITCH_OFF",
                    "replyPreview": "Saklar Auto CS sedang NON-AKTIF.",
                    "imageUrl": None,
                    "matchedSku": None,
                    "elapsedMs": elapsed,
                })
            return {
                "success": True,
                "shouldReply": False,
                "reason": "MASTER_SWITCH_OFF",
                "elapsedMs": elapsed,
            }

        if cfg.get("autoSchedule", True) and not is_within_store_hours(cfg):
            elapsed = int((time.monotonic() - t0) * 1000)
            if not is_simulation:
                append_log({
                    "source": source,
                    "groupId": group_id or sender,
                    "groupName": group_name,
                    "senderName": sender_name,
                    "message": message[:140],
                    "decision": "IGNORED",
                    "reason": "OUTSIDE_STORE_HOURS",
                    "replyPreview": "Di luar jam operasional toko (auto-off).",
                    "imageUrl": None,
                    "matchedSku": None,
                    "elapsedMs": elapsed,
                })
            return {
                "success": True,
                "shouldReply": False,
                "reason": "OUTSIDE_STORE_HOURS",
                "elapsedMs": elapsed,
            }

    # 6. Analisis Intent & Filter Obrolan Santai
    intent_info = analyze_message_intent(message, is_group=is_group)
    if not intent_info.get("shouldReply", False):
        elapsed = int((time.monotonic() - t0) * 1000)
        append_log({
            "source": source,
            "groupId": group_id or sender or "SIM",
            "groupName": group_name,
            "senderName": sender_name,
            "message": message[:140],
            "decision": "IGNORED",
            "reason": "CASUAL_CHAT_IGNORED",
            "replyPreview": "Obrolan santai non-produk diabaikan oleh AI.",
            "imageUrl": None,
            "matchedSku": None,
            "elapsedMs": elapsed,
        })
        return {
            "success": True,
            "shouldReply": False,
            "reason": "CASUAL_CHAT_IGNORED",
            "intent": intent_info.get("intent", "CASUAL_CHAT"),
            "intentDetail": intent_info,
            "elapsedMs": elapsed,
        }

    # 7. Query Produk Real-Time dari Turso DB (100% Tanpa Angka Qty Stok!)
    products: List[Dict[str, Any]] = []
    if intent_info.get("intent") != "GREETING":
        products = search_sanitized_catalog(intent_info, store_scope=cfg.get("storeScope", "ALL"), limit=3)

    # 8. Susun Balasan Profesional ala Halo BCA + Pilih Foto HD Terbaik
    reply_text = generate_halo_bca_reply(sender_name, message, intent_info, products, cfg)
    best_image_url: Optional[str] = None
    if cfg.get("replyWithImage", True) and products:
        for p in products:
            if is_clean_product_image(p.get("imageUrl")):
                best_image_url = p["imageUrl"]
                break

    if products:
        any_ready = any(p.get("availability") == "READY" for p in products)
        reason = "PRODUCT_FOUND_READY" if any_ready else "PRODUCT_FOUND_SOLD_OUT"
    elif intent_info.get("intent") == "GREETING":
        reason = "GREETING_REPLIED"
    else:
        reason = "PRODUCT_NOT_FOUND"

    elapsed = int((time.monotonic() - t0) * 1000)
    append_log({
        "source": source,
        "groupId": group_id or sender or "SIM",
        "groupName": group_name,
        "senderName": sender_name,
        "message": message[:140],
        "decision": "REPLIED_WITH_IMAGE" if best_image_url else "REPLIED_TEXT",
        "reason": reason,
        "replyPreview": reply_text[:180],
        "imageUrl": best_image_url,
        "matchedSku": products[0]["sku"] if products else None,
        "elapsedMs": elapsed,
    })

    return {
        "success": True,
        "shouldReply": True,
        "reason": reason,
        "intent": intent_info.get("intent"),
        "intentDetail": intent_info,
        "replyText": reply_text,
        "imageUrl": best_image_url,
        "matchedProducts": products,
        "humanTakeoverMinutes": cfg.get("humanTakeoverMinutes", 10),
        "elapsedMs": elapsed,
    }


def handle_wa_cs_request(payload: Dict[str, Any], header_secret: str = "") -> Dict[str, Any]:
    action = str(payload.get("action") or "health").strip().lower()

    if action == "health":
        cfg = load_config()
        return {
            "success": True,
            "engine": "python-wa-cs-stdlib",
            "geminiConfigured": bool((os.environ.get("GEMINI_API_KEY") or "").strip()),
            "tursoConfigured": bool((os.environ.get("TURSO_DATABASE_URL") or "").strip()),
            "enabled": bool(cfg.get("enabled", False)),
            "withinStoreHours": is_within_store_hours(cfg),
            "serverWibTime": wib_now().strftime("%H:%M WIB"),
            "whitelistedGroupsCount": len([g for g in (cfg.get("allowedGroups") or []) if g.get("enabled", True)]),
        }

    # Semua action lain wajib membawa secret valid
    provided_secret = header_secret or str(payload.get("secret") or "")
    if not verify_secret(provided_secret):
        return {"success": False, "error": "Unauthorized WA CS secret", "status": 401}

    if action == "get-config":
        cfg = load_config()
        out: Dict[str, Any] = {
            "success": True,
            "config": mask_config_for_ui(cfg),
        }
        if payload.get("includeFonnteToken"):
            out["fonnteToken"] = cfg.get("fonnteToken") or ""
        if payload.get("includeLogs", True):
            out["logs"] = load_logs()
        return out

    if action == "save-config":
        current = load_config()
        patch = payload.get("config") if isinstance(payload.get("config"), dict) else payload
        for field in (
            "enabled",
            "autoSchedule",
            "openHourWib",
            "openMinuteWib",
            "closeHourWib",
            "closeMinuteWib",
            "ignorePrivateChats",
            "storeScope",
            "csName",
            "storeName",
            "humanTakeoverMinutes",
            "replyWithImage",
            "allowedGroups",
        ):
            if field in patch and patch[field] is not None:
                current[field] = patch[field]
        # Update fonnteToken hanya jika dikirim non-kosong atau eksplisit clearFonnteToken
        if patch.get("clearFonnteToken"):
            current["fonnteToken"] = ""
        elif isinstance(patch.get("fonnteToken"), str) and patch["fonnteToken"].strip():
            current["fonnteToken"] = patch["fonnteToken"].strip()

        saved = save_config(current)
        return {"success": True, "config": mask_config_for_ui(saved)}

    if action == "toggle":
        current = load_config()
        if "enabled" in payload:
            current["enabled"] = bool(payload["enabled"])
        else:
            current["enabled"] = not bool(current.get("enabled", False))
        saved = save_config(current)
        return {"success": True, "config": mask_config_for_ui(saved)}

    if action == "upsert-group":
        current = load_config()
        gid = str(payload.get("groupId") or "").strip()
        gname = str(payload.get("groupName") or gid).strip()
        genabled = bool(payload.get("enabled", True))
        if not gid:
            return {"success": False, "error": "groupId wajib diisi"}
        allowed = list(current.get("allowedGroups") or [])
        updated = False
        for g in allowed:
            if str(g.get("id") or "").strip() == gid:
                g["name"] = gname or g.get("name") or gid
                g["enabled"] = genabled
                updated = True
                break
        if not updated:
            allowed.insert(0, {
                "id": gid,
                "name": gname or gid,
                "enabled": genabled,
                "addedAt": utc_iso_now(),
            })
        current["allowedGroups"] = allowed
        saved = save_config(current)
        return {"success": True, "config": mask_config_for_ui(saved)}

    if action == "remove-group":
        current = load_config()
        gid = str(payload.get("groupId") or "").strip()
        current["allowedGroups"] = [
            g for g in (current.get("allowedGroups") or [])
            if str(g.get("id") or "").strip() != gid
        ]
        saved = save_config(current)
        return {"success": True, "config": mask_config_for_ui(saved)}

    if action == "clear-logs":
        clear_logs()
        return {"success": True, "logs": []}

    if action == "simulate":
        return _process_incoming_or_simulate(payload, is_simulation=True)

    if action == "incoming":
        return _process_incoming_or_simulate(payload, is_simulation=False)

    return {"success": False, "error": f"Unknown action: {action}"}
