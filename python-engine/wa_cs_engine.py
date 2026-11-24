"""
wa_cs_engine.py — v2 TRUE AI AGENT ORCHESTRATOR (SUKO OFFICIAL)
=============================================================================
100% Pure Python Stdlib (0% External Pip Deps) berjalan di Vercel (`sin1`).

Arsitektur 3 Tahap (AI Agent -> Python Tool Eksekutor -> AI Copywriter):
1. SMART ORCHESTRATOR + QUOTA CIRCUIT BREAKER (< 10% AUTO-FLASH!):
   - Pertanyaan Ringan (sapaan, 1 barang) -> Executor Cepat (`gemini-3-flash-preview` LOW/MEDIUM)
   - Pertanyaan Berat (multi-kategori, memori "no 3", komplain, closing) ->
     Orchestrator (`gemini-3.1-pro-preview` -> `gemini-3.6-flash` HIGH -> `gemini-3-flash-preview` HIGH)
   - Quota Guard: begitu sisa kuota Orchestrator < 10% ATAU kena 429/503, otomatis
     circuit-breaker turun ke Flash (`gemini-3-flash-preview` LOW) tanpa buang waktu!
   - Jalur Cadangan Anti-Mati: fallback deterministik Python jika semua API AI limit.

2. 7+ LOGIKA EMAS HASIL ROLEPLAY (TERKUNCI DI PYTHON — 0% HALUSINASI!):
   - 100% SUKO ONLY (`storeScope = "SUKO"`, `storeName = "SUKO Official"`).
   - Filter Gender Ketat (`LADIES` / `MEN` / `KIDS`) + Anti-Nyasar (`kemeja` != `T-SHIRT`).
   - 4 Mode Query Nyata Turso DB: Promo, Terbaru (`NEWEST`), Best Seller (`sales_mtd` POS
     tanpa bocor angka jualan!), & Relevansi Multi-Kategori (`multiQueries[]`).
   - Memori Sesi Private Chat 30 Menit (ingat gender, 6 chat terakhir, No. 1-3 terakhir,
     anti-duplikat `excludeArticles[]`, paham "koleksi lainnya nomor 3"!).
   - Verifikasi Stok LIVE Real-Time (`run_fast_stock` paralel + cache 90 dtk) +
     WAJIB Foto HD + HANYA warna & size yang READY per warna + NOL angka qty stok!
   - SOP Hand-Off Grup -> Private Chat + link klik `https://wa.me/...`.
   - Eskalasi Otomatis ke WA PIC (`picAlertPhone = 6281296393972`) saat customer
     siap beli/keep atau komplain!
=============================================================================
"""

from __future__ import annotations

import concurrent.futures
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
    run_fast_stock,
    storage_read_text,
    storage_write_bytes,
    turso_query,
    utc_iso_now,
)

CONFIG_STORAGE_PATH = "config/wa-cs-config.json"
LOGS_STORAGE_PATH = "logs/wa-cs-logs.json"
BRIDGE_STATE_PATH = "config/wa-cs-bridge-state.json"
SESSIONS_STORAGE_PATH = "config/wa-cs-sessions.json"
MAX_LOGS = 40
MAX_DETECTED_GROUPS = 30

# Rantai Model Smart Orchestrator & Executor (sesuai model aktif Google AI Studio)
ORCHESTRATOR_CHAIN: List[Tuple[str, str]] = [
    (os.environ.get("WA_CS_PRO_MODEL") or "gemini-3.1-pro-preview", "MEDIUM"),
    (os.environ.get("WA_CS_ORCHESTRATOR_MODEL") or "gemini-3.6-flash", "HIGH"),
    (os.environ.get("WA_CS_FLASH_MODEL") or "gemini-3-flash-preview", "HIGH"),
]
EXECUTOR_CHAIN: List[Tuple[str, str]] = [
    (os.environ.get("WA_CS_FLASH_MODEL") or "gemini-3-flash-preview", "LOW"),
    (os.environ.get("WA_CS_ORCHESTRATOR_MODEL") or "gemini-3.6-flash", "LOW"),
]

# Cache RAM container Vercel: hemat kuota Turso, StoreHub, & hindari model yang kena 429/503!
_LIVE_STOCK_MEM_CACHE: Dict[str, Tuple[float, Dict[str, int]]] = {}
_LIVE_STOCK_CACHE_TTL_SEC = 90.0
_MODEL_COOLDOWN_UNTIL: Dict[str, float] = {}  # model_name -> unix ts sampai kapan di-skip
_DAILY_USAGE_MEM: Dict[str, Any] = {
    "dateWib": "",
    "heavyCalls": 0,
    "flashCalls": 0,
    "heavyDailyBudget": 60,  # Jika sisa < 10% (< 6 call tersisa) -> auto downgrade ke Flash!
}

DEFAULT_SOP_TEXT = (
    "- Toko resmi: SUKO Official Store (PTC Surabaya) — KHUSUS produk SUKO saja.\n"
    "- Jam operasional layanan: 09:00 - 21:30 WIB.\n"
    "- Pembayaran: Via QRIS kasir (penting: QRIS memiliki tenggat waktu 5 menit setelah dikirim!).\n"
    "- Wajib tanya Nomor Member Matahari sebelum cetak QRIS (untuk pengumpulan poin member) & konfirmasi nama member.\n"
    "- Pilihan Pengambilan setelah lunas (barang di-keep atas nama customer):\n"
    "  1) Ambil langsung di Store SUKO (PTC), ATAU\n"
    "  2) Customer pesan GoSend sendiri (nanti berikan nomor WA PIC ke driver GoSend untuk koordinasi ambil di toko).\n"
    "- Aturan jawaban profesional: Dilarang menjawab ambigu 'Iya kak' pada pertanyaan pilihan A atau B (misal putih bersih vs putih tulang / reg fit vs slim fit) — jawab spesifik sesuai data artikel (1 artikel = 1 potongan). Jika butuh foto asli di hanger / cek fisik (kancing/resleting/lingkar dada), koordinasikan langsung ke PIC.\n"
    "- Dilarang membocorkan angka qty stok maupun angka penjualan toko."
)

DEFAULT_CONFIG: Dict[str, Any] = {
    "enabled": False,
    "autoSchedule": True,
    "openHourWib": 9,
    "openMinuteWib": 0,
    "closeHourWib": 21,
    "closeMinuteWib": 30,
    "ignorePrivateChats": True,
    "handoffToPrivateChat": True,
    "privateSessionMinutes": 30,
    "replyGreetings": True,
    "storeScope": "SUKO",  # Terkunci khusus SUKO Official!
    "csName": "Luqman",
    "adminPhone": "6285771123000",
    "picAlertPhone": "6281296393972",
    "storeName": "SUKO Official",
    "storeSop": DEFAULT_SOP_TEXT,
    "heavyDailyBudget": 60,
    "humanTakeoverMinutes": 10,
    "replyWithImage": True,
    "allowedGroups": [],
    "detectedGroups": [],
    "fonnteToken": "",
    "customGeminiApiKey": "",
    "updatedAt": "",
}

SYNONYM_GROUPS: Dict[str, List[str]] = {
    "kaos": ["KAOS", "T-SHIRT", "TSHIRT", "TEE", "CREW NECK", "POLO"],
    "tshirt": ["T-SHIRT", "TSHIRT", "TEE", "KAOS"],
    "tee": ["TEE", "T-SHIRT", "KAOS"],
    "kemeja": ["KEMEJA", "OXFORD", "FLANNEL", "WOVEN", "LS SHI", "SS SHI", "SHIRT"],
    "blouse": ["BLOUSE", "BLUS", "TOP", "WOVEN"],
    "atasan": ["TOP", "SHIRT", "T-SHIRT", "BLOUSE", "TEE", "KAOS", "KEMEJA", "KNIT"],
    "polo": ["POLO", "KAOS"],
    "jaket": ["JACKET", "JAKET", "HOODIE", "SWEATER", "CARDIGAN", "OUTER", "PARKA", "BOMBER"],
    "winter": ["WINTER", "PUFFER", "COAT", "PARKA", "JACKET", "HOODIE", "SWEATER"],
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
    "sandal": ["SANDAL", "SANDALS", "SLIPPER", "SLIPPERS", "SLIDE"],
    "tas": ["BAG", "BAGS", "BACKPACK", "TOTE", "SLING", "POUCH", "WALLET", "TAS"],
    "dompet": ["WALLET", "DOMPET", "CARD HOLDER"],
    "topi": ["CAP", "HAT", "TOPI", "BEANIE"],
    "kaoskaki": ["SOCK", "SOCKS", "KAOS KAKI"],
    "boxer": ["BOXER", "BRIEF", "UNDERWEAR", "TRUNK"],
    "piyama": ["PAJAMA", "PYJAMA", "SLEEP", "PIYAMA"],
    "baju": ["SHIRT", "T-SHIRT", "TEE", "BLOUSE", "TOP", "DRESS", "KAOS", "KEMEJA", "KNIT"],
}

COLOR_SYNONYMS: Dict[str, List[str]] = {
    "BLACK": ["HITAM", "BLACK", "BLK", "ITEM", "JET BLACK"],
    "WHITE": ["PUTIH", "WHITE", "WHT", "OFF WHITE", "BROKEN WHITE", "IVORY", "CHALK"],
    "NAVY": ["NAVY", "DONGKER", "BIRU DONGKER", "BIRU TUA", "DARK BLUE", "NVY"],
    "BLUE": ["BIRU", "BLUE", "BLU", "DENIM", "SKY BLUE", "LIGHT BLUE", "AQUA", "PASTEL BLUE"],
    "GREY": ["ABU", "ABU-ABU", "GREY", "GRAY", "GRY", "CHARCOAL", "MISTY", "SILVER", "PASTEL GREY"],
    "RED": ["MERAH", "RED", "MAROON", "MARUN", "BURGUNDY", "WINE", "CRIMSON"],
    "GREEN": ["HIJAU", "IJO", "GREEN", "GRN", "OLIVE", "ARMY", "SAGE", "EMERALD", "MINT", "TOSCA", "JADE"],
    "BEIGE": ["CREAM", "KREM", "BEIGE", "KHAKI", "TAN", "SAND", "OAT", "MOCCA", "MOKA", "TAUPE", "NUDE", "CERAMIC"],
    "BROWN": ["COKLAT", "COKELAT", "BROWN", "BRN", "CHOCO", "CARAMEL", "COFFEE", "ESPRESSO"],
    "PINK": ["PINK", "MERAH MUDA", "DUSTY PINK", "PASTEL PINK", "ROSE", "SALMON", "MAGENTA", "FUCHSIA"],
    "YELLOW": ["KUNING", "YELLOW", "MUSTARD", "GOLD", "OCHRE"],
    "ORANGE": ["ORANYE", "OREN", "ORANGE", "TERRACOTTA", "CORAL", "PEACH"],
    "PURPLE": ["UNGU", "PURPLE", "LILAC", "LAVENDER", "VIOLET", "EGGPLANT"],
}

CATEGORY_SYNONYMS: Dict[str, List[str]] = {
    "ATASAN": ["kaos", "kemeja", "tshirt", "t-shirt", "tee", "polo", "blouse", "blus", "atasan", "top", "baju", "tanktop", "crop"],
    "JAKET": ["jaket", "jacket", "winter", "puffer", "coat", "hoodie", "sweater", "cardigan", "outer", "blazer", "vest", "parka", "bomber", "knit"],
    "CELANA": ["celana", "jeans", "denim", "chino", "jogger", "short", "pant", "pants", "trouser", "legging", "kulot", "culotte"],
    "DRESS_ROK": ["dress", "rok", "skirt", "gamis", "tunik", "tunic", "kaftan", "jumpsuit"],
    "SEPATU_SANDAL": ["sepatu", "sandal", "sendal", "sneaker", "loafer", "heels", "boots", "flats", "slipper"],
    "TAS_AKSESORIS": ["tas", "bag", "dompet", "wallet", "topi", "cap", "hat", "belt", "sabuk", "kaos kaki", "sock", "backpack", "pouch"],
    "BEAUTY": ["serum", "parfum", "perfume", "cream", "krim", "lotion", "lip", "masker", "toner", "cleanser", "skincare"],
    "TIDUR_DALAM": ["boxer", "brief", "underwear", "dalam", "bra", "panty", "piyama", "pajama", "singlet", "tidur"],
}

OTHER_BRAND_WORDS = ("muku", "mu+ku", "mu ku", "zes", "nevada", "cole", "connexion", "st yves", "fladeo", "nayoung", "byrch", "uniqlo", "zara", "h&m")

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
    "thanks", "thx", "mohon", "bantu", "bantuan", "kah", "kan", "sih", "deh", "lho", "loh", "nya", "punya",
    "jual", "tersedia", "lagi", "sedang", "bisa", "boleh", "minta", "kasih", "rekomendasi", "rekomen", "bagus",
    "terbaru", "baru", "masuk", "koleksi", "lainnya", "lain", "best", "seller", "bestseller", "terlaris", "laku",
    "cewek", "wanita", "perempuan", "ladies", "women", "cowok", "pria", "laki", "men", "anak", "kids", "gitu",
    "nomor", "no", "nomer", "saya", "aku", "gue", "gw", "kalo", "kalau", "mana", "dong", "barang",
}

INQUIRY_TRIGGER_WORDS = {
    "harga", "brp", "berapa", "berapaan", "ready", "redi", "stok", "stock", "promo", "diskon", "sale",
    "size", "ukuran", "warna", "order", "pesan", "beli", "keep", "booking", "katalog", "produk", "barang",
    "spill", "spil", "foto", "gambar", "cek", "cekin", "tersedia", "sold", "habis", "ada", "suko",
    "kaos", "kemeja", "celana", "jaket", "hoodie", "sweater", "cardigan", "dress", "rok", "gamis", "tunik",
    "sepatu", "sandal", "sendal", "sneaker", "tas", "dompet", "topi", "boxer", "piyama", "baju", "atasan",
    "blouse", "polo", "jeans", "chino", "jogger", "kaos kaki", "sock", "sku", "artikel", "barcode",
    "terbaru", "best", "seller", "terlaris", "koleksi", "lainnya", "nomor", "winter", "transfer", "bayar", "ongkir",
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

FORBIDDEN_INTERNAL_TERMS = [
    (re.compile(r"\bMDS\s*BISA\b", re.IGNORECASE), "sistem stok toko"),
    (re.compile(r"\bStoreHub\b", re.IGNORECASE), "sistem stok toko"),
    (re.compile(r"\bMatahari\.com\b", re.IGNORECASE), "katalog resmi kami"),
    (re.compile(r"\bTurso\b", re.IGNORECASE), "database toko"),
    (re.compile(r"\bSupabase\b", re.IGNORECASE), "database toko"),
]

STOCK_QTY_LEAK_RE = re.compile(
    r"(?:stok(?:nya)?|sisa(?:\s+stok)?|tersisa|tinggal|qty|terjual|laku)\s*[:=]?\s*\d+\s*(?:pcs|unit|buah|biji|pasang)?",
    re.IGNORECASE,
)


# ─────────────────────────────────────────────────────────────────────────────
#  1. WAKTU WIB, AUTH, CONFIG, LOGS, BRIDGE STATE & MEMORI SESI
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


def normalize_wa_phone(raw: Any) -> str:
    s = str(raw or "").split("@")[0].split(":")[0]
    digits = re.sub(r"[^0-9]", "", s)
    if not digits:
        return ""
    if digits.startswith("0"):
        digits = "62" + digits[1:]
    elif digits.startswith("8"):
        digits = "62" + digits
    return digits


def _merge_config(raw: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    cfg = dict(DEFAULT_CONFIG)
    if isinstance(raw, dict):
        for k in DEFAULT_CONFIG:
            if k in raw and raw[k] is not None:
                cfg[k] = raw[k]
    cfg["enabled"] = bool(cfg.get("enabled", False))
    cfg["autoSchedule"] = bool(cfg.get("autoSchedule", True))
    cfg["ignorePrivateChats"] = bool(cfg.get("ignorePrivateChats", True))
    cfg["handoffToPrivateChat"] = bool(cfg.get("handoffToPrivateChat", True))
    cfg["replyGreetings"] = bool(cfg.get("replyGreetings", True))
    cfg["privateSessionMinutes"] = max(5, min(240, int(cfg.get("privateSessionMinutes", 30) or 30)))
    cfg["replyWithImage"] = bool(cfg.get("replyWithImage", True))
    cfg["openHourWib"] = max(0, min(23, int(cfg.get("openHourWib", 9) or 9)))
    cfg["openMinuteWib"] = max(0, min(59, int(cfg.get("openMinuteWib", 0) or 0)))
    cfg["closeHourWib"] = max(0, min(23, int(cfg.get("closeHourWib", 21) or 21)))
    cfg["closeMinuteWib"] = max(0, min(59, int(cfg.get("closeMinuteWib", 30) or 30)))
    cfg["humanTakeoverMinutes"] = max(0, min(120, int(cfg.get("humanTakeoverMinutes", 10) or 10)))
    cfg["heavyDailyBudget"] = max(10, min(1000, int(cfg.get("heavyDailyBudget", 60) or 60)))
    scope = str(cfg.get("storeScope") or "SUKO").strip().upper()
    cfg["storeScope"] = scope if scope in ("SUKO", "ALL", "MUKU", "ZES") else "SUKO"
    cfg["csName"] = str(cfg.get("csName") or "Luqman").strip()[:40] or "Luqman"
    cfg["adminPhone"] = normalize_wa_phone(cfg.get("adminPhone") or "6285771123000") or "6285771123000"
    cfg["picAlertPhone"] = normalize_wa_phone(cfg.get("picAlertPhone") or "6281296393972") or "6281296393972"
    cfg["storeName"] = str(cfg.get("storeName") or "SUKO Official").strip()[:60] or "SUKO Official"
    cfg["storeSop"] = str(cfg.get("storeSop") or DEFAULT_SOP_TEXT).strip()[:1800] or DEFAULT_SOP_TEXT
    if not isinstance(cfg.get("allowedGroups"), list):
        cfg["allowedGroups"] = []
    if not isinstance(cfg.get("detectedGroups"), list):
        cfg["detectedGroups"] = []
    cfg["fonnteToken"] = str(cfg.get("fonnteToken") or "").strip()
    cfg["customGeminiApiKey"] = str(cfg.get("customGeminiApiKey") or "").strip()
    return cfg


def load_config() -> Dict[str, Any]:
    try:
        txt = storage_read_text(CONFIG_STORAGE_PATH, timeout=3.5)
        if txt:
            return _merge_config(json.loads(txt))
    except Exception:
        pass
    return _merge_config(None)


def save_config(cfg: Dict[str, Any]) -> Dict[str, Any]:
    merged = _merge_config(cfg)
    merged["updatedAt"] = utc_iso_now()
    payload = json.dumps(merged, ensure_ascii=False, indent=2).encode("utf-8")
    storage_write_bytes(CONFIG_STORAGE_PATH, payload, content_type="application/json", timeout=4.5)
    return merged


def _get_quota_status(cfg: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    today = wib_now().strftime("%Y-%m-%d")
    if _DAILY_USAGE_MEM["dateWib"] != today:
        _DAILY_USAGE_MEM["dateWib"] = today
        _DAILY_USAGE_MEM["heavyCalls"] = 0
        _DAILY_USAGE_MEM["flashCalls"] = 0
    budget = int((cfg or {}).get("heavyDailyBudget") or _DAILY_USAGE_MEM.get("heavyDailyBudget") or 60)
    _DAILY_USAGE_MEM["heavyDailyBudget"] = budget
    used = int(_DAILY_USAGE_MEM["heavyCalls"])
    rem_pct = max(0, int(round(((budget - used) / max(1, budget)) * 100)))
    return {
        "dateWib": today,
        "heavyCalls": used,
        "flashCalls": int(_DAILY_USAGE_MEM["flashCalls"]),
        "heavyDailyBudget": budget,
        "heavyRemainingPct": rem_pct,
        "autoDowngradedToFlash": rem_pct < 10,
        "orchestratorPrimary": ORCHESTRATOR_CHAIN[0][0],
        "orchestratorFallback": ORCHESTRATOR_CHAIN[1][0],
        "executorFlash": EXECUTOR_CHAIN[0][0],
    }


def mask_config_for_ui(cfg: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(cfg)
    tok = str(out.get("fonnteToken") or "").strip()
    out["fonnteTokenConfigured"] = bool(tok)
    out["fonnteTokenPreview"] = f"{tok[:4]}••••{tok[-4:]}" if len(tok) > 8 else ("••••" if tok else "")
    out.pop("fonnteToken", None)
    gkey = str(out.get("customGeminiApiKey") or "").strip()
    out["customGeminiKeyConfigured"] = bool(gkey)
    out["customGeminiKeyPreview"] = f"{gkey[:6]}••••{gkey[-4:]}" if len(gkey) > 10 else ("••••" if gkey else "")
    out.pop("customGeminiApiKey", None)
    now_wib = wib_now()
    out["serverWibTime"] = now_wib.strftime("%H:%M WIB")
    out["withinStoreHours"] = is_within_store_hours(cfg, now_wib)
    out["aiQuota"] = _get_quota_status(cfg)
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
        logs.insert(0, {
            "id": f"log_{int(time.time() * 1000)}",
            "timestamp": utc_iso_now(),
            "wibTime": wib_now().strftime("%d/%m %H:%M WIB"),
            **entry,
        })
        payload = json.dumps(logs[:MAX_LOGS], ensure_ascii=False).encode("utf-8")
        storage_write_bytes(LOGS_STORAGE_PATH, payload, content_type="application/json", timeout=3.5)
    except Exception:
        pass


def clear_logs() -> None:
    try:
        storage_write_bytes(LOGS_STORAGE_PATH, b"[]", content_type="application/json", timeout=3.5)
    except Exception:
        pass


def _session_key_variants(raw_sender: str) -> List[str]:
    s = str(raw_sender or "").strip().lower()
    keys: List[str] = []
    if s:
        keys.append(s)
    digits = normalize_wa_phone(raw_sender)
    if digits and len(digits) >= 8 and digits not in keys:
        keys.append(digits)
    return keys


def load_private_sessions() -> Dict[str, Any]:
    now_ms = int(time.time() * 1000)
    try:
        txt = storage_read_text(SESSIONS_STORAGE_PATH, timeout=2.5)
        if txt:
            parsed = json.loads(txt)
            if isinstance(parsed, dict):
                return {
                    k: v for k, v in parsed.items()
                    if isinstance(v, dict) and int(v.get("expiresAtMs") or 0) > now_ms
                }
    except Exception:
        pass
    return {}


def get_customer_session(raw_sender: str) -> Optional[Dict[str, Any]]:
    sessions = load_private_sessions()
    if not sessions:
        return None
    for k in _session_key_variants(raw_sender):
        if k in sessions:
            return dict(sessions[k])
    return None


def save_customer_session(
    raw_sender: str,
    sender_name: str,
    group_name: str,
    minutes: int = 30,
    preferred_gender: str = "",
    new_products: Optional[List[Dict[str, Any]]] = None,
    user_msg: str = "",
    bot_summary: str = "",
) -> None:
    """Simpan memori percakapan ringkas per customer (30 menit, hemat Turso!)."""
    if not raw_sender:
        return
    try:
        sessions = load_private_sessions()
        existing: Dict[str, Any] = {}
        for k in _session_key_variants(raw_sender):
            if k in sessions:
                existing = dict(sessions[k])
                break

        expires_ms = int(time.time() * 1000) + max(5, int(minutes or 30)) * 60 * 1000
        history: List[Dict[str, str]] = list(existing.get("history") or [])
        if user_msg:
            history.append({"u": user_msg[:140], "b": bot_summary[:180]})
        history = history[-6:]  # Simpan 6 giliran terakhir saja (super ringan!)

        shown_articles: List[str] = list(existing.get("shownArticles") or [])
        last_products: List[Dict[str, Any]] = list(existing.get("lastProducts") or [])
        if new_products:
            last_products = [
                {
                    "num": idx + 1,
                    "sku": p.get("sku") or "",
                    "article": p.get("article") or "",
                    "name": p.get("name") or "",
                    "category": p.get("category") or "",
                    "hargaText": p.get("hargaPromoText") or p.get("hargaNormalText") or "",
                }
                for idx, p in enumerate(new_products[:3])
            ]
            for p in new_products:
                art = str(p.get("article") or p.get("sku") or "").strip().upper()
                if art and art not in shown_articles:
                    shown_articles.append(art)
            shown_articles = shown_articles[-18:]

        gender = preferred_gender or str(existing.get("preferredGender") or "")
        entry = {
            "senderName": str(sender_name or existing.get("senderName") or "Kak")[:40],
            "groupName": str(group_name or existing.get("groupName") or "")[:60],
            "preferredGender": gender,
            "lastProducts": last_products,
            "shownArticles": shown_articles,
            "history": history,
            "turnCount": int(existing.get("turnCount") or 0) + 1,
            "expiresAtMs": expires_ms,
        }
        for k in _session_key_variants(raw_sender):
            sessions[k] = entry
        payload = json.dumps(sessions, ensure_ascii=False).encode("utf-8")
        storage_write_bytes(SESSIONS_STORAGE_PATH, payload, content_type="application/json", timeout=3.0)
    except Exception:
        pass


def load_bridge_state() -> Dict[str, Any]:
    default_state: Dict[str, Any] = {
        "connected": False,
        "phone": "",
        "pairingCode": "",
        "pairingCodeAt": 0,
        "pairingRequestedAt": 0,
        "logoutRequestedAt": 0,
        "statusMessage": "Menunggu bridge WA aktif...",
        "lastHeartbeatAt": 0,
    }
    try:
        txt = storage_read_text(BRIDGE_STATE_PATH, timeout=2.5)
        if txt:
            parsed = json.loads(txt)
            if isinstance(parsed, dict):
                default_state.update(parsed)
    except Exception:
        pass
    now_ms = int(time.time() * 1000)
    hb = int(default_state.get("lastHeartbeatAt") or 0)
    code_at = int(default_state.get("pairingCodeAt") or 0)
    default_state["bridgeOnline"] = (now_ms - hb) < 135_000
    default_state["pairingCodeFresh"] = bool(default_state.get("pairingCode")) and ((now_ms - code_at) < 110_000)
    default_state["serverNowMs"] = now_ms
    return default_state


def save_bridge_state(state: Dict[str, Any]) -> Dict[str, Any]:
    clean = {
        "connected": bool(state.get("connected", False)),
        "phone": str(state.get("phone") or ""),
        "pairingCode": str(state.get("pairingCode") or ""),
        "pairingCodeAt": int(state.get("pairingCodeAt") or 0),
        "pairingRequestedAt": int(state.get("pairingRequestedAt") or 0),
        "logoutRequestedAt": int(state.get("logoutRequestedAt") or 0),
        "statusMessage": str(state.get("statusMessage") or "")[:160],
        "lastHeartbeatAt": int(state.get("lastHeartbeatAt") or 0),
    }
    payload = json.dumps(clean, ensure_ascii=False).encode("utf-8")
    storage_write_bytes(BRIDGE_STATE_PATH, payload, content_type="application/json", timeout=3.5)
    now_ms = int(time.time() * 1000)
    clean["bridgeOnline"] = (now_ms - clean["lastHeartbeatAt"]) < 135_000
    clean["pairingCodeFresh"] = bool(clean["pairingCode"]) and ((now_ms - clean["pairingCodeAt"]) < 110_000)
    clean["serverNowMs"] = now_ms
    return clean


def is_within_store_hours(cfg: Dict[str, Any], now_wib: Optional[datetime] = None) -> bool:
    now = now_wib or wib_now()
    cur_mins = now.hour * 60 + now.minute
    open_mins = int(cfg.get("openHourWib", 9)) * 60 + int(cfg.get("openMinuteWib", 0))
    close_mins = int(cfg.get("closeHourWib", 21)) * 60 + int(cfg.get("closeMinuteWib", 30))
    if open_mins <= close_mins:
        return open_mins <= cur_mins <= close_mins
    return cur_mins >= open_mins or cur_mins <= close_mins


def _record_detected_group(cfg: Dict[str, Any], group_id: str, group_name: str, message: str) -> bool:
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
        detected.insert(0, {"id": gid, "name": gname, "lastSeenAt": now_iso, "lastMessage": preview})
    detected.sort(key=lambda x: str(x.get("lastSeenAt") or ""), reverse=True)
    cfg["detectedGroups"] = detected[:MAX_DETECTED_GROUPS]
    for ag in cfg.get("allowedGroups") or []:
        if str(ag.get("id") or "").strip() == gid and gname and gname != gid:
            if not ag.get("name") or ag.get("name") == gid:
                ag["name"] = gname
    return True


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
#  2. SMART ORCHESTRATOR + EXECUTOR GEMINI CLIENT (QUOTA < 10% AUTO-FLASH!)
# ─────────────────────────────────────────────────────────────────────────────

def _call_gemini_model(
    model: str,
    prompt: str,
    thinking_level: str = "MEDIUM",
    expect_json: bool = False,
    timeout: float = 5.5,
    temperature: float = 0.25,
    max_tokens: int = 750,
    custom_api_key: str = "",
) -> Tuple[Optional[str], int]:
    """Panggil 1 model Gemini via stdlib urllib. Mengembalikan (text, http_status)."""
    api_key = (str(custom_api_key or "").strip() or os.environ.get("GEMINI_API_KEY") or "").strip()
    if not api_key:
        return None, 0

    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{urllib.parse.quote(model)}:generateContent"
    )
    gen_cfg: Dict[str, Any] = {
        "temperature": temperature,
        "maxOutputTokens": max_tokens,
    }
    if expect_json:
        gen_cfg["responseMimeType"] = "application/json"
    if thinking_level:
        gen_cfg["thinkingConfig"] = {"thinkingLevel": thinking_level}

    body = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": gen_cfg,
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "X-goog-api-key": api_key,
        },
        method="POST",
    )
    try:
        with _STD_OPENER.open(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8", errors="ignore"))
        candidates = data.get("candidates") or []
        if not candidates:
            return None, 200
        parts = ((candidates[0].get("content") or {}).get("parts")) or []
        # Filter bagian non-thought agar jawaban murni bersih
        text_parts = [str(p.get("text") or "") for p in parts if not p.get("thought")]
        raw_text = "".join(text_parts).strip()
        return (raw_text or None), 200
    except urllib.error.HTTPError as e:
        return None, int(e.code or 500)
    except Exception:
        return None, 0


def _invoke_smart_ai(
    prompt: str,
    tier: str = "LIGHT",  # "HEAVY" (Orchestrator) | "LIGHT" (Executor Flash)
    cfg: Optional[Dict[str, Any]] = None,
    expect_json: bool = False,
    timeout: float = 5.5,
    temperature: float = 0.25,
    max_tokens: int = 750,
) -> Tuple[Optional[str], str]:
    """
    Router AI Cerdas:
    - Jika `tier == 'HEAVY'` & sisa kuota Orchestrator >= 10% -> coba rantai ORCHESTRATOR_CHAIN!
    - Jika kuota < 10% ATAU `tier == 'LIGHT'` -> langsung pakai EXECUTOR_CHAIN (Flash cepat & irit)!
    - Circuit Breaker otomatis: model yang kena 429 (quota habis) di-cooldown 15 menit,
      404 (deprecated) di-cooldown 60 menit, 503 (padat) di-cooldown 3 menit!
    """
    q_stat = _get_quota_status(cfg)
    use_heavy = (tier == "HEAVY") and (not q_stat["autoDowngradedToFlash"])
    chain = (ORCHESTRATOR_CHAIN + EXECUTOR_CHAIN) if use_heavy else EXECUTOR_CHAIN

    now_ts = time.time()
    deadline = now_ts + min(float(timeout), 4.8)
    tried = set()
    attempts = 0
    for model_name, think_lvl in chain:
        if attempts >= 2 or time.time() >= deadline:
            break
        key = f"{model_name}:{think_lvl}"
        if key in tried:
            continue
        tried.add(key)

        cooldown_until = _MODEL_COOLDOWN_UNTIL.get(model_name, 0.0)
        if now_ts < cooldown_until:
            continue

        rem_sec = max(1.6, min(3.4, deadline - time.time()))
        attempts += 1
        txt, status = _call_gemini_model(
            model=model_name,
            prompt=prompt,
            thinking_level=think_lvl,
            expect_json=expect_json,
            timeout=rem_sec,
            temperature=temperature,
            max_tokens=max_tokens,
            custom_api_key=str((cfg or {}).get("customGeminiApiKey") or ""),
        )
        if txt:
            if model_name == ORCHESTRATOR_CHAIN[0][0] or (use_heavy and think_lvl == "HIGH"):
                _DAILY_USAGE_MEM["heavyCalls"] += 1
            else:
                _DAILY_USAGE_MEM["flashCalls"] += 1
            return txt, f"{model_name}({think_lvl})"

        if status == 429:
            _MODEL_COOLDOWN_UNTIL[model_name] = now_ts + 900.0
        elif status == 404:
            _MODEL_COOLDOWN_UNTIL[model_name] = now_ts + 3600.0
        elif status in (503, 0):
            _MODEL_COOLDOWN_UNTIL[model_name] = now_ts + 180.0

    return None, "deterministic"


def _parse_json_loose(raw_text: Optional[str]) -> Optional[Dict[str, Any]]:
    if not raw_text:
        return None
    s = raw_text.strip()
    s = re.sub(r"^```(?:json)?\s*", "", s)
    s = re.sub(r"\s*```$", "", s)
    try:
        parsed = json.loads(s)
        return parsed if isinstance(parsed, dict) else None
    except Exception:
        m = re.search(r"\{[\s\S]*\}", s)
        if m:
            try:
                parsed = json.loads(m.group(0))
                return parsed if isinstance(parsed, dict) else None
            except Exception:
                return None
    return None


# ─────────────────────────────────────────────────────────────────────────────
#  3. TAHAP 1: AGENT AI PLANNER / FILTER (DETEKSI RINGAN VS BERAT + MEMORI!)
# ─────────────────────────────────────────────────────────────────────────────

def _detect_gender_deterministic(low: str) -> str:
    if re.search(r"\b(cewek|cewe|wanita|perempuan|ladies|women|woman|ibu|mbak|rok|dress|blouse|gamis|tunik)\b", low):
        return "LADIES"
    if re.search(r"\b(cowok|cowo|pria|laki|men|man|bapak|boxer)\b", low):
        return "MEN"
    if re.search(r"\b(anak|kids|bocah|junior|boys|girls)\b", low):
        return "KIDS"
    return ""


def _extract_price_and_exclusions(low: str) -> Tuple[Optional[int], Optional[int], List[str]]:
    """
    Deteksi batas harga (under 100 / di bawah 100rb / 80-90an / 59rb) & kata yang dihindari ('jangan v-neck').
    """
    max_price: Optional[int] = None
    min_price: Optional[int] = None
    excludes: List[str] = []

    # Under 100 / dibawah 100rb / maks 150k / < 100000
    m_under = re.search(
        r"\b(?:under|dibawah|di\s*bawah|maks(?:imal)?|max|kurang\s+dari|<)\s*(?:rp\.?\s*)?(\d{2,6})(?:\s*(rb|ribu|k|an))?\b",
        low,
    )
    if m_under:
        num = int(m_under.group(1))
        unit = (m_under.group(2) or "").lower()
        if num < 1000:
            max_price = num * 1000
        elif unit in ("rb", "ribu", "k"):
            max_price = num * 1000
        else:
            max_price = num
    else:
        # "harganya 90an" / "80an" / "59rb" / "79k"
        m_approx = re.search(r"\b(\d{2,3})\s*(?:rb|ribu|k|an)\b", low)
        if m_approx:
            n = int(m_approx.group(1))
            if 20 <= n <= 500:
                max_price = (n + 15) * 1000

    # Filter negatif: "jangan vneck", "tanpa kantong", "ga mau polo"
    if re.search(r"\b(?:jangan|gak?\s*mau|tidak\s*mau|tanpa|no|bukan)\s+v[\-\s]?neck\b", low):
        excludes.extend(["V-NECK", "VNECK", "V NECK"])
    if re.search(r"\b(?:jangan|tanpa|no)\s+(?:kantong|saku|pocket)\b", low):
        excludes.extend(["POCKET", "SAKU", "KANTONG"])
    if re.search(r"\b(?:jangan|bukan)\s+polo\b", low):
        excludes.append("POLO")

    return min_price, max_price, excludes


def _detect_fitting_label(desc: str) -> str:
    """1 artikel = 1 konsep potongan. Ekstrak otomatis dari deskripsi artikel di DB!"""
    up = str(desc or "").upper()
    if any(k in up for k in ("OVERSIZED", "OVERSIZE")):
        return "Oversized"
    if "RELAXED" in up:
        return "Relaxed Fit"
    if "SLIM FIT" in up or "SLIM" in up:
        return "Slim Fit"
    if "LOOSE" in up:
        return "Loose Fit"
    if "CROP" in up:
        return "Crop Fit"
    if "REGULAR" in up or "REGULER" in up:
        return "Regular Fit"
    return ""


def _extract_deterministic_plan(
    message: str,
    session: Optional[Dict[str, Any]] = None,
    quoted_message: str = "",
) -> Dict[str, Any]:
    clean = re.sub(r"\s+", " ", str(message or "").strip())
    low = clean.lower()
    quoted_clean = re.sub(r"\s+", " ", str(quoted_message or "").strip())
    combined_low = f"{low} {quoted_clean.lower()}".strip()

    if not clean or len(clean) < 2 or CASUAL_SHORT_RE.match(clean):
        return {
            "intent": "CASUAL_CHAT",
            "shouldReply": False,
            "complexity": "LIGHT",
            "genderHint": "",
            "referencedNumber": 0,
            "wantsMoreLikeRef": False,
            "wantsColorPhotos": False,
            "wantsPromo": False,
            "wantsNewArrival": False,
            "wantsBestSeller": False,
            "maxPrice": None,
            "minPrice": None,
            "excludeKeywords": [],
            "multiQueries": [],
            "skuOrArticle": "",
            "directAnswer": "",
            "engine": "deterministic",
        }

    # Sapaan ramah (SOP CS: halo/hai/permisi/pagi/assalamualaikum WAJIB dibalas!)
    is_pure_greeting = bool(
        re.match(
            r"^\s*(?:halo+|hallo+|hello+|hai+|hi+|hey+|permisi|punten|assalamu['\s]?alaikum|salam|"
            r"selamat\s+(?:pagi|siang|sore|malam)|pagi+|siang+|sore+|malam+)"
            r"(?:\s+(?:kak|kakak|min|admin|mas|mbak|mba|cs|suko))?[\s!?.,]*$",
            low,
        )
    )
    if is_pure_greeting and not quoted_clean:
        return {
            "intent": "GREETING",
            "shouldReply": True,
            "complexity": "LIGHT",
            "genderHint": str((session or {}).get("preferredGender") or ""),
            "referencedNumber": 0,
            "wantsMoreLikeRef": False,
            "wantsColorPhotos": False,
            "wantsPromo": False,
            "wantsNewArrival": False,
            "wantsBestSeller": False,
            "maxPrice": None,
            "minPrice": None,
            "excludeKeywords": [],
            "multiQueries": [],
            "skuOrArticle": "",
            "directAnswer": "",
            "engine": "deterministic",
        }

    # Deteksi permintaan cek fisik / foto real di hanger toko -> auto eskalasi sopan ke PIC!
    if re.search(r"\b(foto(?:kan|in)?\s+asli|real\s*pic|pakai\s+resleting|pake\s+resleting|ada\s+kancing|nerawang|menerawang|putih\s+tulang|broken\s+white\s+atau|lingkar\s+dada|size\s*chart)\b", low):
        return {
            "intent": "PHYSICAL_CHECK",
            "shouldReply": True,
            "complexity": "HEAVY",
            "genderHint": str((session or {}).get("preferredGender") or ""),
            "referencedNumber": 0,
            "wantsMoreLikeRef": False,
            "wantsColorPhotos": False,
            "wantsPromo": False,
            "wantsNewArrival": False,
            "wantsBestSeller": False,
            "maxPrice": None,
            "minPrice": None,
            "excludeKeywords": [],
            "multiQueries": [],
            "skuOrArticle": "",
            "directAnswer": "",
            "engine": "deterministic",
        }

    # Deteksi niat Order / Keep / Bayar / QRIS / GoSend
    # PENTING: jika customer masih bilang "lihat / foto / ada / bisa / ?" -> BUKAN closing, masih tanya/minta foto!
    is_asking_or_viewing = bool(
        re.search(r"\b(lihat|liat|foto|fotoin|gambar|contoh|cek|ada|ready|bisa|warna\s+lain)\b", low)
        or "?" in low
    )
    is_direct_buy_quote = bool(
        quoted_clean
        and not is_asking_or_viewing
        and re.search(r"\b(mau|ambil|keep|pesan|order|fix|beli)\b", low)
    )
    is_explicit_checkout = bool(
        re.search(
            r"\b(mau\s+keep|fix\s+(?:beli|order|ambil|keep)|jadi\s+beli|mau\s+transfer|mau\s+bayar|"
            r"kirim\s+rekening|gimana\s+cara\s+bayar|mau\s+order|qris|tak\s+tf|tak\s+gosend|ambil\s+store)\b",
            low,
        )
    )
    if is_direct_buy_quote or is_explicit_checkout:
        ref_m = re.search(r"\b(?:no|nomor|nomer)\s*\.?\s*([123])\b", low)
        q_ref_m = re.search(r"(?:^|\n|\*)\s*([123])\.\s+[A-Z0-9]", quoted_clean)
        return {
            "intent": "ORDER_INTENT",
            "shouldReply": True,
            "complexity": "HEAVY",
            "genderHint": str((session or {}).get("preferredGender") or ""),
            "referencedNumber": int(ref_m.group(1)) if ref_m else (int(q_ref_m.group(1)) if q_ref_m else 0),
            "wantsMoreLikeRef": False,
            "wantsColorPhotos": False,
            "wantsPromo": False,
            "wantsNewArrival": False,
            "wantsBestSeller": False,
            "maxPrice": None,
            "minPrice": None,
            "excludeKeywords": [],
            "multiQueries": [],
            "skuOrArticle": "",
            "directAnswer": "",
            "engine": "deterministic",
        }

    min_price, max_price, exclude_kws = _extract_price_and_exclusions(low)

    # Deteksi permintaan "foto tiap warna / lihat warna black / warna lainnya"
    wants_color_photos = bool(
        re.search(
            r"\b(foto\s+tiap\s+warna|lihat\s+warna|liat\s+warna|warna\s+lain(?:nya)?|contoh\s+foto|"
            r"foto\s+(?:yang|yg)\s+\w+|fotoin\s+warna|foto\s+warna)\b",
            low,
        )
    )

    asked_other_brand = next((b for b in OTHER_BRAND_WORDS if re.search(rf"\b{re.escape(b)}\b", low)), "")

    sku_match = re.search(r"\b(\d{7,13})\b", f"{clean} {quoted_clean}")
    art_match = re.search(r"\b([A-Z]{1,4}\d[A-Z0-9\-]{3,12})\b", f"{clean} {quoted_clean}".upper())
    sku_or_article = ""
    if sku_match:
        sku_or_article = sku_match.group(1)
    elif art_match and not re.match(r"^(?:RP|IDR|WA|HP|COD|08)\d", art_match.group(1)):
        sku_or_article = art_match.group(1)

    gender_hint = _detect_gender_deterministic(combined_low) or str((session or {}).get("preferredGender") or "")
    wants_promo = any(w in low for w in ("promo", "diskon", "sale", "potongan", "spesial", "special price", "murah"))
    wants_new = any(w in low for w in ("terbaru", "baru masuk", "model baru", "koleksi baru", "new arrival", "barang baru"))
    wants_best = any(w in low for w in ("best seller", "bestseller", "terlaris", "paling laku", "favorit", "paling laris"))

    ref_m = re.search(r"\b(?:no|nomor|nomer)\s*\.?\s*([123])\b", low)
    q_ref_m = re.search(r"(?:^|\n|\*)\s*([123])\.\s+[A-Z0-9]", quoted_clean)
    ref_num = int(ref_m.group(1)) if ref_m else (int(q_ref_m.group(1)) if q_ref_m else 0)
    wants_more_like_ref = bool(ref_num and any(w in low for w in ("lain", "lainnya", "mirip", "koleksi", "model lain", "alternatif")) and not wants_color_photos)

    color_hint = ""
    for canon_color, syns in COLOR_SYNONYMS.items():
        if any(re.search(rf"\b{re.escape(s.lower())}\b", low) for s in syns):
            color_hint = canon_color
            break

    size_hint = ""
    sz_m = re.search(r"\b(?:size|ukuran|sz)\s*[:=]?\s*(xxs|xs|s|m|l|xl|xxl|2xl|3xl|\d{2})\b", low)
    if sz_m:
        size_hint = sz_m.group(1).upper()
    else:
        sz_m2 = re.search(r"\b(xxs|xs|xxl|2xl|3xl|xl)\b", low)
        if sz_m2:
            size_hint = sz_m2.group(1).upper()

    # Gunakan teks gabungan jika pesan customer pendek dan me-reply postingan promo
    search_source_low = combined_low if (quoted_clean and len(clean) < 45) else low
    matched_cats: List[Tuple[str, List[str]]] = []
    for cat_key, cat_words in CATEGORY_SYNONYMS.items():
        hits = [w for w in cat_words if re.search(rf"\b{re.escape(w)}\b", search_source_low)]
        if hits:
            matched_cats.append((cat_key, hits))

    raw_tokens = re.findall(r"[a-zA-Z0-9\+\-]+", search_source_low)
    keywords: List[str] = []
    if "kaos kaki" in search_source_low:
        keywords.append("kaoskaki")
    for tok in raw_tokens:
        if len(tok) < 2 or tok in STOPWORDS_ID or tok.isdigit():
            continue
        if color_hint and any(tok == s.lower() for s in COLOR_SYNONYMS.get(color_hint, [])):
            continue
        if size_hint and tok.upper() == size_hint:
            continue
        if tok not in keywords:
            keywords.append(tok)

    multi_queries: List[Dict[str, Any]] = []
    if len(matched_cats) >= 2 and not quoted_clean:
        for cat_key, hits in matched_cats[:3]:
            q_kws = list(hits[:2])
            if cat_key == "CELANA" and "pendek" in low and "pendek" not in q_kws:
                q_kws.append("pendek")
            if cat_key == "JAKET" and "winter" in low and "winter" not in q_kws:
                q_kws.append("winter")
            multi_queries.append({
                "label": " ".join(q_kws),
                "keywords": q_kws,
                "categoryHint": cat_key,
                "colorHint": color_hint,
                "sizeHint": size_hint,
            })
    elif wants_more_like_ref and session:
        last_prods = session.get("lastProducts") or []
        ref_prod = next((p for p in last_prods if int(p.get("num") or 0) == ref_num), None)
        if ref_prod:
            multi_queries.append({
                "label": ref_prod.get("name") or ref_prod.get("category") or "koleksi lain",
                "keywords": [w.lower() for w in re.findall(r"[A-Za-z]+", str(ref_prod.get("name") or "")) if len(w) > 3][:3],
                "categoryHint": str(ref_prod.get("category") or ""),
                "colorHint": color_hint,
                "sizeHint": size_hint,
            })
    elif keywords or matched_cats or wants_promo or wants_new or wants_best or sku_or_article or max_price or wants_color_photos:
        multi_queries.append({
            "label": " ".join(keywords[:3]) or (matched_cats[0][1][0] if matched_cats else "produk SUKO"),
            "keywords": keywords[:5],
            "categoryHint": matched_cats[0][0] if matched_cats else "",
            "colorHint": color_hint,
            "sizeHint": size_hint,
        })

    has_trigger = bool(
        sku_or_article or multi_queries or wants_promo or wants_new or wants_best or wants_more_like_ref
        or asked_other_brand or max_price or wants_color_photos or quoted_clean
        or any(re.search(rf"\b{re.escape(w)}\b", low) for w in INQUIRY_TRIGGER_WORDS)
    )
    is_complex = bool(
        len(matched_cats) >= 2 or wants_more_like_ref or ref_num > 0 or len(clean) > 55 or asked_other_brand
        or quoted_clean or max_price or wants_color_photos or (session and len(session.get("history") or []) > 0)
    )

    if asked_other_brand and not multi_queries:
        intent = "OTHER_BRAND"
    elif wants_color_photos:
        intent = "COLOR_PHOTOS_INQUIRY"
    elif wants_more_like_ref:
        intent = "MORE_LIKE_NUMBER"
    elif wants_new:
        intent = "NEW_ARRIVAL"
    elif wants_best:
        intent = "BEST_SELLER"
    elif wants_promo and not keywords:
        intent = "PROMO_INQUIRY"
    elif has_trigger:
        intent = "PRODUCT_INQUIRY"
    else:
        intent = "CASUAL_CHAT"

    return {
        "intent": intent,
        "shouldReply": has_trigger,
        "complexity": "HEAVY" if is_complex else "LIGHT",
        "genderHint": gender_hint,
        "referencedNumber": ref_num,
        "wantsMoreLikeRef": wants_more_like_ref,
        "wantsColorPhotos": wants_color_photos,
        "wantsPromo": wants_promo,
        "wantsNewArrival": wants_new,
        "wantsBestSeller": wants_best,
        "maxPrice": max_price,
        "minPrice": min_price,
        "excludeKeywords": exclude_kws,
        "askedOtherBrand": asked_other_brand,
        "multiQueries": multi_queries,
        "skuOrArticle": sku_or_article,
        "directAnswer": "",
        "engine": "deterministic",
    }


def run_ai_agent_planner(
    message: str,
    is_group: bool,
    session: Optional[Dict[str, Any]],
    cfg: Dict[str, Any],
    quoted_message: str = "",
) -> Dict[str, Any]:
    """
    TAHAP 1 AGENT AI:
    Menyaring & merencanakan aksi (memilih model RINGAN Flash vs BERAT Orchestrator).
    """
    det = _extract_deterministic_plan(message, session=session, quoted_message=quoted_message)
    clean = str(message or "").strip()

    # Fast-path 0ms untuk obrolan sangat pendek, sapaan murni, atau exact SKU
    if not clean or len(clean) < 2 or CASUAL_SHORT_RE.match(clean):
        return det
    if det["intent"] in ("GREETING", "PHYSICAL_CHECK") or det.get("skuOrArticle"):
        return det

    mem_ctx = {
        "preferredGender": (session or {}).get("preferredGender") or "",
        "lastProducts": (session or {}).get("lastProducts") or [],
        "recentHistory": ((session or {}).get("history") or [])[-3:],
    }
    tier = "HEAVY" if det.get("complexity") == "HEAVY" else "LIGHT"
    quoted_ctx = f"\nPesan/Postingan Promo yang Di-Reply Customer: {json.dumps(quoted_message[:400], ensure_ascii=False)}" if quoted_message else ""

    prompt = (
        f"Kamu adalah AI Orchestrator & Filter Customer Service resmi *{cfg.get('storeName', 'SUKO Official')}* (KHUSUS produk SUKO saja!).\n"
        f"Konteks: {'Pesan masuk di GRUP WA member' if is_group else 'Lanjutan obrolan di PRIVATE CHAT VIP'}.\n"
        f"SOP Toko SUKO:\n{cfg.get('storeSop', DEFAULT_SOP_TEXT)}\n\n"
        f"Memori Sesi Customer: {json.dumps(mem_ctx, ensure_ascii=False)}{quoted_ctx}\n"
        f"Pesan Customer Terbaru: {json.dumps(clean, ensure_ascii=False)}\n\n"
        "Tugasmu: analisis pesan + pesan yang di-reply + memori, lalu balas HANYA JSON murni:\n"
        "{\n"
        '  "intent": "PRODUCT_INQUIRY"|"PROMO_INQUIRY"|"NEW_ARRIVAL"|"BEST_SELLER"|"MORE_LIKE_NUMBER"|"COLOR_PHOTOS_INQUIRY"|"ORDER_INTENT"|"PHYSICAL_CHECK"|"FAQ_SOP"|"COMPLAINT"|"OTHER_BRAND"|"GREETING"|"CASUAL_CHAT",\n'
        '  "shouldReply": true/false,\n'
        '  "genderHint": "LADIES"|"MEN"|"KIDS"|"",\n'
        '  "referencedNumber": 0 atau 1/2/3,\n'
        '  "wantsMoreLikeRef": true/false,\n'
        '  "wantsColorPhotos": true/false (true jika minta foto tiap warna / warna lain / foto warna tertentu),\n'
        '  "wantsPromo": true/false,\n'
        '  "wantsNewArrival": true/false,\n'
        '  "wantsBestSeller": true/false,\n'
        '  "maxPrice": angka rupiah atau null (misal "under 100" -> 100000),\n'
        '  "excludeKeywords": ["VNECK", dll jika customer bilang jangan v-neck],\n'
        '  "multiQueries": [\n'
        '    {"label": "frasa produk", "keywords": ["kata"], "categoryHint": "ATASAN|JAKET|CELANA|DRESS_ROK|SEPATU_SANDAL|TAS_AKSESORIS|TIDUR_DALAM|", "colorHint": "", "sizeHint": ""}\n'
        '  ],\n'
        '  "skuOrArticle": "",\n'
        '  "directAnswer": "jawaban Halo BCA HANYA jika FAQ_SOP/ORDER_INTENT/PHYSICAL_CHECK/COMPLAINT/OTHER_BRAND"\n'
        "}\n\n"
        "ATURAN KETAT:\n"
        "1. Obrolan santai non-belanja ('bro nongkrong yuk', 'wkwk', 'otw') -> intent='CASUAL_CHAT', shouldReply=false.\n"
        "2. Jika customer bertanya pilihan A atau B (misal 'reg fit atau slim fit', 'putih bersih atau putih tulang'), JANGAN pernah jawab 'Iya kak'!\n"
        "3. Jika customer minta foto asli di hanger / tanya kancing-resleting / lingkar dada fisik -> intent='PHYSICAL_CHECK'.\n"
        "4. Jika customer bilang 'fix beli' / 'mau keep' / 'QRIS' / 'transfer' (TANPA kata 'lihat/foto/bisa?') -> intent='ORDER_INTENT'. Jika masih bilang 'mau yang ini tapi lihat warna black' -> intent='COLOR_PHOTOS_INQUIRY' (BUKAN ORDER_INTENT)!\n"
        "5. Jika customer tanya beberapa jenis sekaligus -> pecah ke `multiQueries` (maks 3 item!).\n"
        "6. Jika customer bilang 'under 100' / 'dibawah 100rb' -> isi `maxPrice: 100000`!\n"
    )

    raw_txt, used_model = _invoke_smart_ai(
        prompt,
        tier=tier,
        cfg=cfg,
        expect_json=True,
        timeout=4.8,
        temperature=0.1,
        max_tokens=550,
    )
    ai_res = _parse_json_loose(raw_txt)
    if not ai_res:
        return det

    intent = str(ai_res.get("intent") or det["intent"]).upper()
    should_reply = bool(ai_res.get("shouldReply", det["shouldReply"]))
    if intent == "CASUAL_CHAT":
        should_reply = False

    mq_raw = ai_res.get("multiQueries")
    multi_queries: List[Dict[str, Any]] = []
    if isinstance(mq_raw, list):
        for item in mq_raw[:3]:
            if isinstance(item, dict):
                kws = [str(k).strip().lower() for k in (item.get("keywords") or []) if str(k or "").strip()][:5]
                cat = str(item.get("categoryHint") or "").strip().upper()
                if kws or cat:
                    multi_queries.append({
                        "label": str(item.get("label") or " ".join(kws) or cat).strip(),
                        "keywords": kws,
                        "categoryHint": cat,
                        "colorHint": str(item.get("colorHint") or "").strip().upper(),
                        "sizeHint": str(item.get("sizeHint") or "").strip().upper(),
                    })

    if not multi_queries and det.get("multiQueries"):
        multi_queries = det["multiQueries"]

    gender_hint = str(ai_res.get("genderHint") or det.get("genderHint") or "").strip().upper()
    if gender_hint not in ("LADIES", "MEN", "KIDS"):
        gender_hint = str((session or {}).get("preferredGender") or "")

    max_p = ai_res.get("maxPrice")
    try:
        max_p_int = int(max_p) if max_p is not None else det.get("maxPrice")
    except Exception:
        max_p_int = det.get("maxPrice")

    excl_raw = ai_res.get("excludeKeywords")
    excl_kws = [str(x).strip().upper() for x in (excl_raw if isinstance(excl_raw, list) else []) if str(x or "").strip()]
    for ek in det.get("excludeKeywords") or []:
        if ek not in excl_kws:
            excl_kws.append(ek)

    return {
        "intent": intent,
        "shouldReply": should_reply,
        "complexity": tier,
        "genderHint": gender_hint,
        "referencedNumber": int(ai_res.get("referencedNumber") or det.get("referencedNumber") or 0),
        "wantsMoreLikeRef": bool(ai_res.get("wantsMoreLikeRef", det.get("wantsMoreLikeRef", False))),
        "wantsColorPhotos": bool(ai_res.get("wantsColorPhotos", det.get("wantsColorPhotos", False))),
        "wantsPromo": bool(ai_res.get("wantsPromo", det.get("wantsPromo", False))),
        "wantsNewArrival": bool(ai_res.get("wantsNewArrival", det.get("wantsNewArrival", False))),
        "wantsBestSeller": bool(ai_res.get("wantsBestSeller", det.get("wantsBestSeller", False))),
        "maxPrice": max_p_int,
        "minPrice": det.get("minPrice"),
        "excludeKeywords": excl_kws,
        "askedOtherBrand": det.get("askedOtherBrand") or "",
        "multiQueries": multi_queries,
        "skuOrArticle": str(ai_res.get("skuOrArticle") or det.get("skuOrArticle") or "").strip().upper(),
        "directAnswer": str(ai_res.get("directAnswer") or "").strip(),
        "engine": used_model,
    }


# ─────────────────────────────────────────────────────────────────────────────
#  4. TAHAP 2: PYTHON EKSEKUTOR DB (100% SUKO, GENDER, NEWEST, BEST SELLER, LIVE STOK!)
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
    return any(syn.upper() in vc for syn in COLOR_SYNONYMS.get(color_hint, []))


def _size_matches(variant_size: str, size_hint: str) -> bool:
    if not size_hint:
        return True
    vs = str(variant_size or "").strip().upper()
    sh = str(size_hint or "").strip().upper()
    if not vs:
        return False
    if vs == sh or (sh in ("XXL", "2XL") and vs in ("XXL", "2XL")):
        return True
    return bool(re.search(rf"(?:^|[\s/\-])({re.escape(sh)})(?:$|[\s/\-])", vs))


def _matches_gender(row: Dict[str, Any], gender_hint: str) -> Tuple[bool, int]:
    """Cek kecocokan gender berdasarkan kolom dept & description (anti baju cowok masuk saat cari cewek!)."""
    if not gender_hint:
        return True, 0
    txt = f"{row.get('dept') or ''} {row.get('description') or ''} {row.get('article') or ''}".upper()
    is_ladies = any(k in txt for k in ("LADIES", "WOMEN", "WOMAN", "FEMALE", "BLOUSE", "DRESS", "SKIRT", "ROK", "TUNIC", "TUNIK", "GAMIS", "CULOTTE", "CROP"))
    is_men = bool(re.search(r"\b(MEN|MENS|MAN|PRIA|BOYS|BOXER)\b", txt)) and not is_ladies
    is_kids = any(k in txt for k in ("KIDS", "CHILD", "JUNIOR", "BOYS", "GIRLS"))

    if gender_hint == "LADIES":
        if is_men or is_kids:
            return False, -250
        return True, (110 if is_ladies else 0)
    if gender_hint == "MEN":
        if is_ladies or is_kids:
            return False, -250
        return True, (110 if is_men else 0)
    if gender_hint == "KIDS":
        return (True, 120) if is_kids else (False, -200)
    return True, 0


def _verify_live_stock_for_article(
    primary_sku: str,
    article: str,
    brand_group: str,
    v_list: List[Dict[str, Any]],
) -> Dict[str, int]:
    cache_key = (article or primary_sku).strip().upper()
    now_mono = time.monotonic()
    cached = _LIVE_STOCK_MEM_CACHE.get(cache_key)
    if cached and (now_mono - cached[0]) < _LIVE_STOCK_CACHE_TTL_SEC:
        return cached[1]
    try:
        fam = [
            {"sku": str(v.get("sku") or ""), "color": v.get("color"), "size": v.get("size"), "stok": int(v.get("stok") or 0)}
            for v in v_list if v.get("sku")
        ]
        res = run_fast_stock(sku=primary_sku, family_variants=fam, article=article or None, brand_group=brand_group or None)
        if res.get("success") and isinstance(res.get("updatedVariants"), list):
            live_map: Dict[str, int] = {str(v.get("sku") or ""): int(v.get("stok") or 0) for v in v_list if v.get("sku")}
            for uv in res["updatedVariants"]:
                if uv.get("sku") is not None and uv.get("stok") is not None:
                    live_map[str(uv["sku"])] = int(uv["stok"])
            if res.get("stok") is not None and primary_sku:
                live_map[primary_sku] = int(res["stok"])
            _LIVE_STOCK_MEM_CACHE[cache_key] = (now_mono, live_map)
            return live_map
    except Exception:
        pass
    return {}


def _fetch_best_seller_articles(store_scope: str) -> Dict[str, int]:
    """Ambil ranking artikel terlaris dari POS `sales_mtd` (1 query ringan, tidak bocor ke customer!)."""
    scope_sql = 'AND UPPER(COALESCE(brand, \'\')) LIKE \'%SUKO%\'' if store_scope == "SUKO" else ""
    rows = turso_query(
        f'SELECT article, SUM(COALESCE(sales_mtd, 0)) AS mtd_sum, SUM(COALESCE(sales_wtd, 0)) AS wtd_sum '
        f'FROM "Product" WHERE article IS NOT NULL AND article != \'\' AND stok > 0 {scope_sql} '
        f'GROUP BY article ORDER BY mtd_sum DESC, wtd_sum DESC LIMIT 40',
        (),
        timeout=3.5,
    )
    out: Dict[str, int] = {}
    for rank_idx, r in enumerate(rows):
        ak = str(r.get("article") or "").strip().upper()
        if ak:
            # Hanya simpan skor peringkat abstrak (bukan angka pcs terjual!)
            out[ak] = max(10, 400 - rank_idx * 9)
    return out


def _query_single_subsearch(
    subq: Dict[str, Any],
    store_scope: str,
    gender_hint: str,
    wants_promo: bool,
    wants_new: bool,
    wants_best: bool,
    exclude_articles: set,
    best_seller_ranks: Dict[str, int],
    sku_or_art: str = "",
    max_candidates: int = 6,
    max_price: Optional[int] = None,
    exclude_keywords: Optional[List[str]] = None,
) -> Tuple[List[Dict[str, Any]], bool]:
    """
    Kembalikan (list kandidat artikel CatalogArticle, exact_matched_flag).
    Jika sub-pencarian spesifik (misal 'jaket winter') tidak ada persis -> coba alternatif kategori!
    """
    keywords = list(subq.get("keywords") or [])
    category_hint = str(subq.get("categoryHint") or "").strip().upper()
    color_hint = str(subq.get("colorHint") or "").strip().upper()
    size_hint = str(subq.get("sizeHint") or "").strip().upper()
    kw_lower_set = {str(k).lower().strip() for k in keywords}
    wants_kemeja = any(k in kw_lower_set for k in ("kemeja", "oxford", "flannel"))
    wants_winter = any(k in kw_lower_set for k in ("winter", "puffer", "coat"))

    # Exact SKU/Article lookup
    if sku_or_art:
        scope_sql = ' AND "brandGroup" = ?' if store_scope in ("SUKO", "MUKU", "ZES") else ""
        scope_p = [store_scope] if store_scope in ("SUKO", "MUKU", "ZES") else []
        rows = turso_query(
            'SELECT key, sku, barcode, article, description, brand, dept, "brandGroup", "subBrand", '
            '"categoryKey", color, size, "hargaNormal", "hargaPromo", diskon, "discountType", "toDate", '
            '"imageUrl", "articleTotalStok", "articleColors", "articleSizes", "articleHasPromo", "articlePromoLabel", "updatedAt" '
            'FROM "CatalogArticle" '
            'WHERE (UPPER(sku) = UPPER(?) OR UPPER(COALESCE(barcode, \'\')) = UPPER(?) OR UPPER(COALESCE(article, \'\')) LIKE UPPER(?))'
            + scope_sql + ' ORDER BY ("articleTotalStok" > 0) DESC LIMIT 8',
            tuple([sku_or_art, sku_or_art, f"%{sku_or_art}%"] + scope_p),
            timeout=4.0,
        )
        return rows[:max_candidates], bool(rows)

    expanded_terms = _expand_keyword_terms(keywords)
    where_clauses: List[str] = [
        '"articleTotalStok" > 0',
        '"imageUrl" IS NOT NULL AND "imageUrl" != \'\'',
    ]
    params: List[Any] = []

    if store_scope in ("SUKO", "MUKU", "ZES"):
        where_clauses.append('"brandGroup" = ?')
        params.append(store_scope)
    if wants_promo:
        where_clauses.append('"articleHasPromo" = 1')
    if max_price and max_price > 0:
        # Filter ketat harga efektif (hargaPromo jika ada, selain itu hargaNormal) <= max_price!
        where_clauses.append('COALESCE(NULLIF("hargaPromo", 0), "hargaNormal") <= ?')
        params.append(int(max_price))

    or_parts: List[str] = []
    or_params: List[Any] = []
    for term in expanded_terms[:8]:
        like_val = f"%{term}%"
        or_parts.append('(UPPER(description) LIKE ? OR UPPER(COALESCE(article, \'\')) LIKE ? OR UPPER(COALESCE(dept, \'\')) LIKE ?)')
        or_params.extend([like_val, like_val, like_val])
    if category_hint:
        or_parts.append('"categoryKey" = ?')
        or_params.append(category_hint)
    if or_parts:
        where_clauses.append("(" + " OR ".join(or_parts) + ")")
        params.extend(or_params)

    rows: List[Dict[str, Any]] = []
    if wants_best and best_seller_ranks and not or_parts:
        top_arts = list(best_seller_ranks.keys())[:24]
        ph = ",".join("?" for _ in top_arts)
        scope_b = ' AND "brandGroup" = ?' if store_scope in ("SUKO", "MUKU", "ZES") else ""
        p_b = top_arts + ([store_scope] if store_scope in ("SUKO", "MUKU", "ZES") else [])
        rows = turso_query(
            'SELECT key, sku, barcode, article, description, brand, dept, "brandGroup", "subBrand", '
            '"categoryKey", color, size, "hargaNormal", "hargaPromo", diskon, "discountType", "toDate", '
            '"imageUrl", "articleTotalStok", "articleColors", "articleSizes", "articleHasPromo", "articlePromoLabel", "updatedAt" '
            f'FROM "CatalogArticle" WHERE "articleTotalStok" > 0 AND "imageUrl" IS NOT NULL AND "imageUrl" != \'\' '
            f'AND UPPER(COALESCE(article, \'\')) IN ({ph}){scope_b} LIMIT 25',
            tuple(p_b),
            timeout=3.5,
        )

    if not rows:
        order_sql = '"updatedAt" DESC, "sortRank" ASC' if wants_new else ('"articleHasPromo" DESC, "sortRank" ASC')
        sql = (
            'SELECT key, sku, barcode, article, description, brand, dept, "brandGroup", "subBrand", '
            '"categoryKey", color, size, "hargaNormal", "hargaPromo", diskon, "discountType", "toDate", '
            '"imageUrl", "articleTotalStok", "articleColors", "articleSizes", "articleHasPromo", "articlePromoLabel", "updatedAt" '
            f'FROM "CatalogArticle" WHERE {" AND ".join(where_clauses)} ORDER BY {order_sql} LIMIT 35'
        )
        rows = turso_query(sql, tuple(params), timeout=4.2)

    # Jika mencari promo tapi ketat 0 hasil, coba relaksasi tanpa wajib promo
    if not rows and wants_promo and (or_parts):
        relaxed_where = [w for w in where_clauses if w != '"articleHasPromo" = 1']
        rows = turso_query(
            'SELECT key, sku, barcode, article, description, brand, dept, "brandGroup", "subBrand", '
            '"categoryKey", color, size, "hargaNormal", "hargaPromo", diskon, "discountType", "toDate", '
            '"imageUrl", "articleTotalStok", "articleColors", "articleSizes", "articleHasPromo", "articlePromoLabel", "updatedAt" '
            f'FROM "CatalogArticle" WHERE {" AND ".join(relaxed_where)} ORDER BY {order_sql} LIMIT 25',
            tuple(params),
            timeout=4.0,
        )

    # Skoring ketat (Gender + Anti-Duplikat + Anti-Nyasar + Best Seller / Newest / Promo!)
    scored: List[Tuple[int, Dict[str, Any]]] = []
    exact_term_found = False
    seen = set()

    for c in rows:
        art_key = str(c.get("article") or c.get("sku") or "").strip().upper()
        if not art_key or art_key in seen or art_key in exclude_articles:
            continue
        seen.add(art_key)
        if not is_clean_product_image(c.get("imageUrl")):
            continue

        gender_ok, gender_bonus = _matches_gender(c, gender_hint)
        if not gender_ok:
            continue

        desc_only = str(c.get("description") or "").upper()
        # Filter negatif (misal 'jangan v-neck', 'tanpa kantong')
        if exclude_keywords and any(ek in desc_only for ek in exclude_keywords):
            continue
        # Verifikasi harga efektif <= max_price setelah sanitasi harga
        if max_price and max_price > 0:
            eff_p = parse_retail_price(c.get("hargaPromo")) or parse_retail_price(c.get("hargaNormal")) or 0
            if eff_p <= 0 or eff_p > max_price:
                continue

        desc_up = f"{desc_only} {c.get('dept') or ''} {c.get('article') or ''}".upper()
        score = 100 + gender_bonus

        if wants_kemeja:
            if any(k in desc_only for k in ("KEMEJA", "OXFORD", "FLANNEL", "WOVEN")):
                score += 150
            if any(bad in desc_only for bad in ("T-SHIRT", "TSHIRT", "POCKET TEE", "KAOS", "POLO")):
                score -= 260

        if wants_winter and any(k in desc_only for k in ("WINTER", "PUFFER", "COAT")):
            exact_term_found = True
            score += 200
        elif not wants_winter:
            exact_term_found = True

        if category_hint and str(c.get("categoryKey") or "").upper() == category_hint:
            score += 75
        for term in expanded_terms:
            if term == "SHIRT" and "T-SHIRT" in desc_only and wants_kemeja:
                continue
            if term in desc_up:
                score += 45

        if wants_promo and bool(c.get("articleHasPromo")):
            score += 95
        if wants_best and art_key in best_seller_ranks:
            score += best_seller_ranks[art_key]

        colors_list = _parse_json_list(c.get("articleColors"))
        sizes_list = _parse_json_list(c.get("articleSizes"))
        if color_hint and any(_color_matches(col, color_hint) for col in colors_list):
            score += 65
        if size_hint and any(_size_matches(sz, size_hint) for sz in sizes_list):
            score += 65

        if score > 0:
            scored.append((score, c))

    scored.sort(key=lambda x: x[0], reverse=True)
    picked = [row for _, row in scored[:max_candidates]]
    return picked, (exact_term_found and bool(picked))


def execute_python_catalog_search(
    plan: Dict[str, Any],
    store_scope: str = "SUKO",
    exclude_articles: Optional[List[str]] = None,
    limit: int = 3,
    verify_live: bool = True,
) -> Tuple[List[Dict[str, Any]], List[str]]:
    """
    TAHAP 2 EKSEKUTOR PYTHON:
    Menjalankan pencarian 1 atau Multi-Kategori, cek stok LIVE paralel, filter READY-ONLY
    per warna/size, wajib Foto HD, dan mengembalikan (sanitized_products, unavailable_labels).
    """
    exclude_set = {str(a).strip().upper() for a in (exclude_articles or []) if str(a or "").strip()}
    gender_hint = str(plan.get("genderHint") or "").strip().upper()
    wants_promo = bool(plan.get("wantsPromo", False))
    wants_new = bool(plan.get("wantsNewArrival", False))
    wants_best = bool(plan.get("wantsBestSeller", False))
    max_price = plan.get("maxPrice")
    exclude_kws = list(plan.get("excludeKeywords") or [])
    sku_or_art = str(plan.get("skuOrArticle") or "").strip()
    multi_queries = list(plan.get("multiQueries") or [])
    if not multi_queries:
        multi_queries = [{"label": "produk SUKO", "keywords": [], "categoryHint": "", "colorHint": "", "sizeHint": ""}]

    best_ranks = _fetch_best_seller_articles(store_scope) if wants_best else {}
    pool_rows: List[Dict[str, Any]] = []
    unavailable_labels: List[str] = []
    used_articles = set(exclude_set)

    if len(multi_queries) >= 2 and not sku_or_art:
        # Multi-Kategori: ambil maks 1-2 kandidat terbaik per kategori (total 3 produk seimbang!)
        for mq in multi_queries[:3]:
            cands, exact_ok = _query_single_subsearch(
                mq, store_scope, gender_hint, wants_promo, wants_new, wants_best, used_articles, best_ranks,
                max_candidates=2, max_price=max_price, exclude_keywords=exclude_kws,
            )
            if not exact_ok and mq.get("label"):
                unavailable_labels.append(str(mq["label"]))
            for row in cands[:1]:
                ak = str(row.get("article") or row.get("sku") or "").strip().upper()
                if ak not in used_articles:
                    used_articles.add(ak)
                    r_copy = dict(row)
                    r_copy["_queryLabel"] = str(mq.get("label") or "")
                    r_copy["_isAlternative"] = not exact_ok
                    r_copy["_colorHint"] = str(mq.get("colorHint") or "")
                    r_copy["_sizeHint"] = str(mq.get("sizeHint") or "")
                    pool_rows.append(r_copy)
    else:
        mq0 = multi_queries[0]
        cands, exact_ok = _query_single_subsearch(
            mq0, store_scope, gender_hint, wants_promo, wants_new, wants_best, used_articles, best_ranks,
            sku_or_art=sku_or_art, max_candidates=max(limit + 2, 5), max_price=max_price, exclude_keywords=exclude_kws,
        )
        if not exact_ok and mq0.get("label") and not sku_or_art:
            unavailable_labels.append(str(mq0["label"]))
        for row in cands:
            r_copy = dict(row)
            r_copy["_queryLabel"] = str(mq0.get("label") or "")
            r_copy["_isAlternative"] = not exact_ok
            r_copy["_colorHint"] = str(mq0.get("colorHint") or "")
            r_copy["_sizeHint"] = str(mq0.get("sizeHint") or "")
            pool_rows.append(r_copy)

    if not pool_rows:
        return [], unavailable_labels

    # 1 query batch ambil semua varian Product
    pool_articles = [str(r.get("article") or "").strip() for r in pool_rows if str(r.get("article") or "").strip()]
    variants_by_article: Dict[str, List[Dict[str, Any]]] = {}
    if pool_articles:
        placeholders = ",".join("?" for _ in pool_articles)
        v_rows = turso_query(
            'SELECT sku, article, description, brand, dept, color, size, stok, '
            '"hargaNormal", "hargaPromo", diskon, "discountType", "toDate", "imageUrl", images '
            f'FROM "Product" WHERE article IN ({placeholders})',
            tuple(pool_articles),
            timeout=4.0,
        )
        for vr in v_rows:
            ak = str(vr.get("article") or "").strip().upper()
            variants_by_article.setdefault(ak, []).append(vr)

    # Cek Stok LIVE paralel (cache 90 detik di RAM -> hemat kuota!)
    live_stock_by_article: Dict[str, Dict[str, int]] = {}
    if verify_live and pool_rows:
        targets = pool_rows[: min(len(pool_rows), limit + 1)]
        with concurrent.futures.ThreadPoolExecutor(max_workers=min(4, len(targets))) as ex:
            fut_map = {}
            for r in targets:
                art = str(r.get("article") or "").strip()
                ak = art.upper()
                sku_main = str(r.get("sku") or "").strip()
                bg = str(r.get("brandGroup") or "").strip()
                if sku_main:
                    fut_map[ex.submit(_verify_live_stock_for_article, sku_main, art, bg, variants_by_article.get(ak) or [])] = ak
            done, _ = concurrent.futures.wait(fut_map.keys(), timeout=2.2)
            for fut in done:
                ak = fut_map[fut]
                try:
                    lmap = fut.result()
                    if lmap:
                        live_stock_by_article[ak] = lmap
                except Exception:
                    pass

    # Hard Privacy Sanitizer: NOL ANGKA STOK, HANYA WARNA & SIZE READY, WAJIB FOTO HD!
    sanitized: List[Dict[str, Any]] = []
    for r in pool_rows:
        if len(sanitized) >= limit:
            break
        art = str(r.get("article") or "").strip()
        ak = art.upper()
        v_list = variants_by_article.get(ak) or []
        live_map = live_stock_by_article.get(ak) or {}
        color_hint = str(r.get("_colorHint") or "")
        size_hint = str(r.get("_sizeHint") or "")

        ready_by_color: Dict[str, set] = {}
        color_image_map: Dict[str, str] = {}
        ready_colors_set = set()
        ready_sizes_set = set()
        all_clean_images: List[str] = []
        matching_color_image = ""

        harga_normal = parse_retail_price(r.get("hargaNormal")) or 0
        harga_promo = parse_retail_price(r.get("hargaPromo"))
        promo_label = str(r.get("articlePromoLabel") or r.get("discountType") or r.get("diskon") or "").strip()

        if is_clean_product_image(r.get("imageUrl")):
            all_clean_images.append(str(r.get("imageUrl")).strip())

        any_ready = False
        req_matched = False
        req_ready = False

        if v_list:
            for v in v_list:
                v_sku = str(v.get("sku") or "").strip()
                v_stok = int(live_map[v_sku]) if v_sku in live_map else int(v.get("stok") or 0)
                v_col = str(v.get("color") or "").strip()
                v_sz = str(v.get("size") or "").strip()
                col_valid = bool(v_col and v_col.upper() not in ("NO COLOR", "NONE", "-"))
                sz_valid = bool(v_sz and v_sz.upper() not in ("NONE", "-"))

                if v_stok > 0:
                    any_ready = True
                    if col_valid:
                        ready_colors_set.add(v_col)
                        ready_by_color.setdefault(v_col, set())
                        if sz_valid:
                            ready_by_color[v_col].add(v_sz)
                    if sz_valid:
                        ready_sizes_set.add(v_sz)

                col_ok = _color_matches(v_col, color_hint) if color_hint else True
                sz_ok = _size_matches(v_sz, size_hint) if size_hint else True
                if (color_hint or size_hint) and col_ok and sz_ok:
                    req_matched = True
                    if v_stok > 0:
                        req_ready = True

                cand_imgs: List[str] = []
                if is_clean_product_image(v.get("imageUrl")):
                    cand_imgs.append(str(v.get("imageUrl")).strip())
                for extra_img in _parse_json_list(v.get("images")):
                    if is_clean_product_image(extra_img) and extra_img not in cand_imgs:
                        cand_imgs.append(extra_img)
                for ci in cand_imgs:
                    if v_stok > 0 and col_valid and v_col not in color_image_map:
                        color_image_map[v_col] = ci
                    if v_stok > 0 and color_hint and col_ok and not matching_color_image:
                        matching_color_image = ci
                    if ci not in all_clean_images:
                        all_clean_images.append(ci)
        else:
            any_ready = int(r.get("articleTotalStok") or 0) > 0
            if any_ready:
                ready_colors_set.update(_parse_json_list(r.get("articleColors")))
                ready_sizes_set.update(_parse_json_list(r.get("articleSizes")))

        if not sku_or_art and not any_ready:
            continue
        final_image = matching_color_image or (all_clean_images[0] if all_clean_images else "")
        fallback_images = [u for u in all_clean_images if u != final_image][:4]
        if not sku_or_art and not final_image:
            continue

        if harga_promo and harga_normal and harga_promo >= harga_normal:
            harga_promo = None

        ready_color_sizes: List[str] = []
        for col_name in sorted(ready_by_color.keys())[:6]:
            szs = sorted(ready_by_color[col_name], key=_size_sort_key)
            ready_color_sizes.append(f"{col_name} ({', '.join(szs[:6])})" if szs else col_name)

        req_status = ""
        if color_hint or size_hint:
            if req_ready:
                req_status = "REQUESTED_VARIANT_READY"
            elif req_matched or any_ready:
                req_status = "REQUESTED_VARIANT_SOLD_OUT_OTHERS_READY" if any_ready else "SOLD_OUT"
            else:
                req_status = "REQUESTED_VARIANT_NOT_AVAILABLE"

        raw_desc = str(r.get("description") or "").strip()
        clean_name = raw_desc.split(":")[0].strip() if ":" in raw_desc else raw_desc

        badge = ""
        if r.get("_isAlternative"):
            badge = "Alternatif Pilihan"
        elif wants_best and ak in best_ranks:
            badge = "Best Seller 🔥"
        elif wants_new:
            badge = "New Arrival 🆕"

        sanitized.append({
            "sku": str(r.get("sku") or ""),
            "article": art,
            "name": clean_name or art,
            "fitting": _detect_fitting_label(raw_desc),
            "brand": str(r.get("subBrand") or r.get("brand") or "SUKO").strip(),
            "storeGroup": str(r.get("brandGroup") or "SUKO").strip(),
            "category": str(r.get("categoryKey") or "").strip(),
            "badge": badge,
            "availability": "READY" if any_ready else "SOLD_OUT",
            "liveStockVerified": bool(live_map),
            "requestedVariantStatus": req_status,
            "readyColors": sorted(ready_colors_set)[:8],
            "readySizes": sorted(ready_sizes_set, key=_size_sort_key)[:10],
            "readyColorSizes": ready_color_sizes,
            "colorImages": color_image_map,
            "hargaNormal": harga_normal,
            "hargaNormalText": format_idr(harga_normal),
            "hargaPromo": harga_promo,
            "hargaPromoText": format_idr(harga_promo) if harga_promo else None,
            "promoLabel": promo_label if (harga_promo or r.get("articleHasPromo")) else "",
            "imageUrl": final_image,
            "fallbackImages": fallback_images,
        })

    return sanitized, unavailable_labels


# ─────────────────────────────────────────────────────────────────────────────
#  5. TAHAP 3: AI COPYWRITER HALO BCA (PEMBUKA & PENUTUP ALAMI + KARTU HARGA 100% AKURAT!)
# ─────────────────────────────────────────────────────────────────────────────

def _sanitize_outgoing_reply(text: str) -> str:
    out = str(text or "").strip()
    for pat, repl in FORBIDDEN_INTERNAL_TERMS:
        out = pat.sub(repl, out)
    out = STOCK_QTY_LEAK_RE.sub("statusnya Ready", out)
    return out


def _friendly_sapaan(sender_name: str) -> str:
    first = str(sender_name or "").strip().split()[0] if str(sender_name or "").strip() else ""
    clean = re.sub(r"[^a-zA-Z0-9]", "", first)
    if len(clean) < 2 or clean.lower() in ("customer", "user", "member", "admin", "guest", "wa", "kak"):
        return "Kak"
    return f"Kak {first}"


def _format_single_product_block(idx: int, total: int, p: Dict[str, Any]) -> str:
    prefix = f"*{idx}. {p['name']}*" if total > 1 else f"*{p['name']}*"
    badge_tag = f" — _{p['badge']}_" if p.get("badge") else ""
    brand_tag = f" ({p['brand']})" if p.get("brand") else ""
    lines: List[str] = [f"{prefix}{brand_tag}{badge_tag}"]
    if p.get("fitting"):
        lines.append(f"✂️ Potongan: *{p['fitting']}*")

    if p.get("hargaPromoText"):
        promo_extra = f" — _{p['promoLabel']}_" if p.get("promoLabel") else ""
        lines.append(f"🏷️ Harga: ~{p['hargaNormalText']}~ ➡️ *{p['hargaPromoText']}*{promo_extra}")
    else:
        lines.append(f"🏷️ Harga: *{p['hargaNormalText']}*")

    if p["availability"] == "READY":
        if p.get("requestedVariantStatus") == "REQUESTED_VARIANT_SOLD_OUT_OTHERS_READY":
            lines.append("📦 Status: Warna/ukuran yang ditanya sedang *sold out*, varian lain masih *Ready*:")
        else:
            lines.append("📦 Status: *Ready* Kak! ✨")
        if p.get("readyColorSizes"):
            lines.append("🎨 Pilihan Warna & Size Ready:")
            for cs in p["readyColorSizes"][:6]:
                lines.append(f"   • {cs}")
        else:
            if p.get("readyColors"):
                lines.append(f"🎨 Warna ready: {', '.join(p['readyColors'][:6])}")
            if p.get("readySizes"):
                lines.append(f"📏 Ukuran ready: {', '.join(p['readySizes'][:8])}")
    else:
        lines.append("📦 Status: Mohon maaf Kak, produk ini saat ini sedang *sold out* 🙏")
    return "\n".join(lines)


def _generate_ai_framing(
    sender_name: str,
    message: str,
    plan: Dict[str, Any],
    products: List[Dict[str, Any]],
    unavailable_labels: List[str],
    session: Optional[Dict[str, Any]],
    from_group_name: str,
    cfg: Dict[str, Any],
) -> Tuple[str, str, str]:
    """
    TAHAP 3 AGENT AI:
    Menghasilkan (opening_text, closing_text, used_model) yang 100% alami, hangat ala Halo BCA,
    sadar konteks/memori (tidak mengulang salam kaku di tengah PC!), jujur jika ada item kosong,
    dan mengarahkan lembut ke closing!
    Sementara detail harga/promo/warna/size di tengah TETAP dicetak Python (0% halusinasi!).
    """
    sapaan = _friendly_sapaan(sender_name)
    is_followup = bool(session and int(session.get("turnCount") or 0) > 0 and not from_group_name)
    store_name = cfg.get("storeName") or "SUKO Official"

    # Fallback teks rapi bila AI tidak terpanggil
    if from_group_name:
        fb_open = f"Halo {sapaan}, melanjutkan pertanyaan Kakak di grup *{from_group_name}* ya 😊 Dengan senang hati saya bantu cekkan pilihan *SUKO* yang *ready*:"
    elif is_followup:
        fb_open = f"Ada dong {sapaan}! Ini pilihan koleksi *SUKO* yang sedang *ready* saat ini ✨"
    else:
        fb_open = f"Halo {sapaan}, terima kasih sudah menghubungi *{store_name}*! Dengan senang hati saya bantu cekkan pilihan yang *ready* ya 😊"

    if unavailable_labels:
        fb_open = (
            f"Mohon maaf {sapaan}, untuk *{', '.join(unavailable_labels)}* saat ini sedang *sold out / belum tersedia* 🙏\n"
            f"Namun kami punya alternatif pilihan *SUKO* lain yang sedang *ready* saat ini:"
        )
    fb_close = (
        "Dari pilihan di atas, ada model atau warna yang Kakak taksir? "
        "Boleh info *nomor, warna & sizenya* biar bisa langsung saya bantu cekkan atau *keep* ya Kak 🙏"
    )

    prod_brief = [
        {
            "no": idx + 1,
            "name": p["name"],
            "badge": p.get("badge") or "",
            "availability": p["availability"],
            "hasPromo": bool(p.get("hargaPromoText")),
        }
        for idx, p in enumerate(products[:3])
    ]
    tier = "HEAVY" if (unavailable_labels or plan.get("complexity") == "HEAVY") else "LIGHT"
    prompt = (
        f"Kamu adalah *{cfg.get('csName', 'Luqman')}*, Customer Service profesional hangat ala *Halo BCA* untuk *{store_name}* (khusus produk SUKO).\n"
        f"Sapaan customer: {sapaan}\n"
        f"Status percakapan: {'Lanjutan obrolan di Private Chat (JANGAN ulangi salam formal Halo terima kasih sudah menghubungi lagi!)' if is_followup else ('Hand-off dari grup ' + from_group_name if from_group_name else 'Awal percakapan')}\n"
        f"Pesan customer: {json.dumps(message, ensure_ascii=False)}\n"
        f"Intent: {plan.get('intent')} | Gender: {plan.get('genderHint')} | Produk ditemukan: {json.dumps(prod_brief, ensure_ascii=False)}\n"
        f"Item yg diminta tapi kosong/diganti alternatif: {json.dumps(unavailable_labels, ensure_ascii=False)}\n"
        f"Brand luar SUKO yg ditanya: {json.dumps(plan.get('askedOtherBrand') or '', ensure_ascii=False)}\n\n"
        "Balas HANYA JSON murni:\n"
        '{"opening": "1-2 kalimat pembuka hangat natural ala CS manusia", "closing": "1-2 kalimat penutup ramah yang mengarahkan ke pilihan/keep tanpa memaksa"}\n'
        "ATURAN KERAS: Dilarang menyebut angka qty stok atau angka penjualan! Dilarang menyebut nama merek selain SUKO sebagai jualan kita!"
    )

    raw_txt, used_model = _invoke_smart_ai(
        prompt,
        tier=tier,
        cfg=cfg,
        expect_json=True,
        timeout=4.5,
        temperature=0.45,
        max_tokens=280,
    )
    parsed = _parse_json_loose(raw_txt)
    if parsed and parsed.get("opening") and parsed.get("closing"):
        return (
            _sanitize_outgoing_reply(str(parsed["opening"])),
            _sanitize_outgoing_reply(str(parsed["closing"])),
            used_model,
        )
    return fb_open, fb_close, "deterministic"


def build_final_cards_and_text(
    sender_name: str,
    message: str,
    plan: Dict[str, Any],
    products: List[Dict[str, Any]],
    unavailable_labels: List[str],
    session: Optional[Dict[str, Any]],
    from_group_name: str,
    cfg: Dict[str, Any],
) -> Tuple[str, List[Dict[str, Any]], str]:
    sapaan = _friendly_sapaan(sender_name)
    cs_name = cfg.get("csName") or "Luqman"
    store_name = cfg.get("storeName") or "SUKO Official"
    intent = plan.get("intent") or "PRODUCT_INQUIRY"

    # Kasus tanpa produk: Greeting, FAQ SOP, Order/Keep, Komplain, Brand luar SUKO
    if intent == "GREETING" and not products:
        txt = (
            f"Halo {sapaan}, selamat datang di *{store_name}*! 😊\n"
            f"Dengan saya *{cs_name}*, ada koleksi *SUKO* (promo, terbaru, best seller, atau model/ukuran tertentu) yang bisa saya bantu cekkan hari ini Kak? Silakan info saja ya 🙏"
        )
        return txt, [{"text": txt, "imageUrl": None, "fallbackImages": []}], plan.get("engine") or "deterministic"

    if intent == "ORDER_INTENT" and not products:
        direct = plan.get("directAnswer") or (
            f"Baik {sapaan}, dengan senang hati saya bantu proses transaksinya ya! 😊\n\n"
            f"Boleh info data singkat berikut agar langsung kami siapkan:\n"
            f"• *Model / Warna & Size:*\n"
            f"• *Nomor Member Matahari:* _(jika ada, untuk poin member)_\n"
            f"• *Pengambilan:* Ambil di Store SUKO (PTC) / pesan GoSend sendiri\n\n"
            f"💳 Pembayaran via *QRIS* memiliki tenggat waktu *5 menit* ya Kak — sebentar PIC kami (*Kak {cs_name}*) segera kirimkan QRIS-nya setelah data di atas lengkap 🙏"
        )
        direct = _sanitize_outgoing_reply(direct)
        return direct, [{"text": direct, "imageUrl": None, "fallbackImages": []}], plan.get("engine") or "deterministic"

    if intent == "PHYSICAL_CHECK" and not products:
        direct = (
            f"Baik {sapaan}, untuk detail fisik / foto asli produknya langsung dari toko, "
            f"sebentar saya bantu cekkan dulu ke tim kami (*Kak {cs_name}*) ya agar 100% akurat untuk Kakak 🙏 Mohon ditunggu sebentar ya 😊"
        )
        return direct, [{"text": direct, "imageUrl": None, "fallbackImages": []}], plan.get("engine") or "deterministic"

    if intent in ("FAQ_SOP", "COMPLAINT", "OTHER_BRAND") and not products:
        if plan.get("directAnswer"):
            direct = _sanitize_outgoing_reply(plan["directAnswer"])
        elif intent == "OTHER_BRAND":
            direct = (
                f"Mohon maaf {sapaan}, layanan CS ini khusus untuk koleksi resmi *{store_name}* ya 😊\n"
                f"Namun kalau Kakak mau, saya bisa bantu carikan model serupa dari koleksi *SUKO* yang sedang *ready* — Kakak lagi cari model & ukuran apa nih? 🙏"
            )
        elif intent == "COMPLAINT":
            direct = (
                f"Mohon maaf atas ketidaknyamanannya ya {sapaan} 🙏\n"
                f"Saya langsung teruskan kendala Kakak ke PIC kami (*Kak {cs_name}*) agar segera dibantu selesaikan dengan cepat ya Kak."
            )
        else:
            direct = (
                f"Halo {sapaan}, dengan senang hati saya bantu 😊 "
                f"Sebentar saya koordinasikan dengan tim PIC toko kami (*Kak {cs_name}*) ya agar infonya 100% akurat untuk Kakak 🙏"
            )
        return direct, [{"text": direct, "imageUrl": None, "fallbackImages": []}], plan.get("engine") or "deterministic"

    if not products:
        txt = (
            f"Mohon maaf {sapaan}, untuk produk *SUKO* yang Kakak maksud saat ini belum tersedia atau sedang *sold out* 🙏\n\n"
            f"Boleh info alternatif model, warna, atau ukuran yang Kakak cari agar saya bantu cekkan koleksi *SUKO* lain yang sedang *ready* ya Kak? 😊"
        )
        return txt, [{"text": txt, "imageUrl": None, "fallbackImages": []}], plan.get("engine") or "deterministic"

    # Mode KHUSUS: Customer minta "lihat warna black / foto tiap warna / warna lainnya" -> kirim Foto HD warna spesifik / tiap warna READY!
    if plan.get("wantsColorPhotos") and products:
        p0 = products[0]
        c_imgs: Dict[str, str] = p0.get("colorImages") or {}
        req_color = str(((plan.get("multiQueries") or [{}])[0]).get("colorHint") or "").strip().upper()
        req_size = str(((plan.get("multiQueries") or [{}])[0]).get("sizeHint") or "").strip().upper()

        # Jika customer minta 1 warna spesifik (misal "lihat warna black ukuran s") -> fokus ke warna itu dulu!
        filtered_items = list(c_imgs.items())
        if req_color:
            exact_cols = [(cn, cu) for cn, cu in filtered_items if _color_matches(cn, req_color)]
            if exact_cols:
                filtered_items = exact_cols

        if filtered_items:
            opening, closing, copy_model = _generate_ai_framing(
                sender_name, message, plan, [p0], unavailable_labels, session, from_group_name, cfg
            )
            color_cards: List[Dict[str, Any]] = []
            color_items = filtered_items[:4]
            price_line = (
                f"🏷️ Harga: ~{p0['hargaNormalText']}~ ➡️ *{p0['hargaPromoText']}*"
                if p0.get("hargaPromoText")
                else f"🏷️ Harga: *{p0['hargaNormalText']}*"
            )
            for idx, (col_name, col_url) in enumerate(color_items, start=1):
                sz_match = next((cs for cs in (p0.get("readyColorSizes") or []) if cs.upper().startswith(col_name.upper())), col_name)
                parts = []
                if idx == 1:
                    if req_color and not any(_color_matches(cn, req_color) for cn, _ in color_items):
                        parts.append(f"Mohon maaf {sapaan}, warna *{req_color}* untuk model ini sedang *sold out* 🙏 Berikut warna lain yang sedang *ready*:\n")
                    else:
                        parts.append(opening + "\n")
                parts.append(f"*{p0['name']}* — Warna *{col_name}*")
                if p0.get("fitting"):
                    parts.append(f"✂️ Potongan: *{p0['fitting']}*")
                parts.append(price_line)
                if req_size and req_color and _color_matches(col_name, req_color):
                    has_req_sz = bool(re.search(rf"\b{re.escape(req_size)}\b", sz_match.upper()))
                    if has_req_sz:
                        parts.append(f"📦 Status: Warna *{col_name}* ukuran *{req_size}* *Ready* Kak! ✨")
                    else:
                        parts.append(f"📦 Status: Mohon maaf ukuran *{req_size}* untuk warna *{col_name}* sedang *sold out* 🙏")
                parts.append(f"🎨 Ready: {sz_match}")
                if idx == len(color_items):
                    parts.append("\n" + closing)
                color_cards.append({
                    "text": _sanitize_outgoing_reply("\n".join(parts).strip()),
                    "imageUrl": col_url,
                    "fallbackImages": p0.get("fallbackImages") or [],
                })
            return _sanitize_outgoing_reply("\n\n".join(c["text"] for c in color_cards)), color_cards, copy_model

    # Ada produk READY -> Bungkus dengan pembuka & penutup AI Halo BCA + 1 Foto HD per Produk!
    opening, closing, copy_model = _generate_ai_framing(
        sender_name, message, plan, products, unavailable_labels, session, from_group_name, cfg
    )
    send_img = bool(cfg.get("replyWithImage", True))
    shown = products[:3]
    cards: List[Dict[str, Any]] = []
    full_parts: List[str] = [opening, ""]

    for idx, p in enumerate(shown, start=1):
        block = _format_single_product_block(idx, len(shown), p)
        full_parts.append(block)
        full_parts.append("")
        parts: List[str] = []
        if idx == 1:
            parts.append(opening + "\n")
        parts.append(block)
        if idx == len(shown):
            parts.append("\n" + closing)
        cards.append({
            "text": _sanitize_outgoing_reply("\n".join(parts).strip()),
            "imageUrl": p["imageUrl"] if (send_img and is_clean_product_image(p.get("imageUrl"))) else None,
            "fallbackImages": p.get("fallbackImages") or [],
        })

    full_parts.append(closing)
    return _sanitize_outgoing_reply("\n".join(full_parts).strip()), cards, copy_model


# ─────────────────────────────────────────────────────────────────────────────
#  6. ORCHESTRATOR UTAMA (`handle_wa_cs_request`)
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
                "🟢 *[AUTO CS SUKO AKTIF]*\n"
                f"• Grup aktif: {grp_info}\n"
                f"• Katalog: *{cfg.get('storeScope', 'SUKO')} ONLY*\n"
                f"• SOP: Grup singkat → Private Chat VIP + Foto HD\n"
                "Ketik *!csoff* kapan saja saat toko tutup."
            ),
            "imageUrl": None,
            "configEnabled": True,
        }
    if cmd in ("!csstatus", "/csstatus", "!cs status"):
        now_wib = wib_now()
        within = is_within_store_hours(cfg, now_wib)
        q_stat = _get_quota_status(cfg)
        active_grps = [g.get("name") or g.get("id") for g in (cfg.get("allowedGroups") or []) if g.get("enabled", True)]
        status_label = "🟢 AKTIF" if cfg.get("enabled") else "🔴 NON-AKTIF"
        return {
            "success": True,
            "shouldReply": True,
            "reason": "SELF_CMD_STATUS",
            "replyText": (
                f"🤖 *[STATUS AUTO CS SUKO]*\n"
                f"• Saklar Master: *{status_label}*\n"
                f"• Jam WIB: {now_wib.strftime('%H:%M WIB')} ({'Dalam Jam Toko ✅' if within else 'Di Luar Jam Toko 🌙'})\n"
                f"• Mode AI: {'⚡ Hemat Flash (<10%)' if q_stat['autoDowngradedToFlash'] else '🧠 Smart Orchestrator'} (Sisa {q_stat['heavyRemainingPct']}%)\n"
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
    quoted_message = str(payload.get("quotedMessage") or "").strip()
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

    # 1. Perintah darurat PIC (hanya fromMe atau nomor adminPhone terdaftar)
    admin_digits = normalize_wa_phone(cfg.get("adminPhone") or "6285771123000")
    sender_digits = normalize_wa_phone(sender)
    is_admin_sender = bool(from_me or (admin_digits and sender_digits and sender_digits == admin_digits))
    if is_admin_sender and not is_simulation:
        cmd_res = _handle_self_command(message, cfg)
        if cmd_res is not None:
            cmd_res["elapsedMs"] = int((time.monotonic() - t0) * 1000)
            append_log({
                "source": source, "groupId": group_id or sender, "groupName": group_name or "Perintah PIC",
                "senderName": "PIC", "message": message, "decision": "COMMAND", "reason": cmd_res["reason"],
                "replyPreview": cmd_res["replyText"][:140], "imageUrl": None, "matchedSku": None, "elapsedMs": cmd_res["elapsedMs"],
            })
            return cmd_res
        return {"success": True, "shouldReply": False, "reason": "SELF_MESSAGE_IGNORED", "elapsedMs": int((time.monotonic() - t0) * 1000)}

    # 2. Auto-detect grup baru
    config_dirty = False
    if is_group and group_id and not is_simulation:
        config_dirty = _record_detected_group(cfg, group_id, group_name, message)

    # 3. Proteksi Chat Pribadi Teman (kecuali customer yang sedang punya sesi VIP dari grup!)
    session_key = sender or ("SIM_SESSION" if is_simulation else "")
    customer_session = get_customer_session(session_key) if session_key else None
    if not is_simulation and not is_group:
        if cfg.get("ignorePrivateChats", True) and not customer_session:
            if config_dirty:
                save_config(cfg)
            return {"success": True, "shouldReply": False, "reason": "PRIVATE_CHAT_BLOCKED", "elapsedMs": int((time.monotonic() - t0) * 1000)}

    # 4. Proteksi Whitelist Grup Ketat
    if not is_simulation and is_group:
        is_allowed = any(str(g.get("id") or "").strip() == group_id and bool(g.get("enabled", True)) for g in (cfg.get("allowedGroups") or []))
        if not is_allowed:
            if config_dirty:
                save_config(cfg)
            elapsed = int((time.monotonic() - t0) * 1000)
            append_log({
                "source": source, "groupId": group_id, "groupName": group_name, "senderName": sender_name,
                "message": message[:140], "decision": "IGNORED", "reason": "GROUP_NOT_WHITELISTED",
                "replyPreview": "Grup baru terdeteksi — aktifkan di panel Whitelist Grup.",
                "imageUrl": None, "matchedSku": None, "elapsedMs": elapsed,
            })
            return {"success": True, "shouldReply": False, "reason": "GROUP_NOT_WHITELISTED", "groupDetected": True, "elapsedMs": elapsed}

    if config_dirty:
        save_config(cfg)

    # 5. Master Switch & Jam Toko WIB
    if not ignore_switch:
        if not cfg.get("enabled", False):
            return {"success": True, "shouldReply": False, "reason": "MASTER_SWITCH_OFF", "elapsedMs": int((time.monotonic() - t0) * 1000)}
        if cfg.get("autoSchedule", True) and not is_within_store_hours(cfg):
            return {"success": True, "shouldReply": False, "reason": "OUTSIDE_STORE_HOURS", "elapsedMs": int((time.monotonic() - t0) * 1000)}

    # 6. TAHAP 1: AGENT AI PLANNER (Smart Orchestrator vs Executor Flash + Memori + Quoted Promo!)
    plan = run_ai_agent_planner(message, is_group=is_group, session=customer_session, cfg=cfg, quoted_message=quoted_message)
    if not plan.get("shouldReply", False):
        elapsed = int((time.monotonic() - t0) * 1000)
        append_log({
            "source": source, "groupId": group_id or sender or "SIM", "groupName": group_name,
            "senderName": sender_name, "message": message[:140], "decision": "IGNORED",
            "reason": "CASUAL_CHAT_IGNORED", "replyPreview": "Obrolan santai diabaikan Agent AI.",
            "imageUrl": None, "matchedSku": None, "elapsedMs": elapsed,
        })
        return {"success": True, "shouldReply": False, "reason": "CASUAL_CHAT_IGNORED", "intent": plan.get("intent"), "intentDetail": plan, "elapsedMs": elapsed}

    # 7. TAHAP 2: EKSEKUTOR PROGRAM PYTHON (100% SUKO, Gender, Multi-Query, maxPrice, Live Stock, Foto HD!)
    products: List[Dict[str, Any]] = []
    unavailable_labels: List[str] = []
    skip_search_intents = {"GREETING", "ORDER_INTENT", "PHYSICAL_CHECK", "FAQ_SOP", "COMPLAINT"}
    if plan.get("intent") not in skip_search_intents:
        # Jika minta foto warna lain dari artikel yang barusan dibahas -> cari artikel terakhir di sesi!
        if plan.get("wantsColorPhotos") and not plan.get("skuOrArticle") and customer_session:
            lp = customer_session.get("lastProducts") or []
            if lp:
                ref_idx = max(0, min(len(lp) - 1, int(plan.get("referencedNumber") or 1) - 1))
                plan["skuOrArticle"] = str(lp[ref_idx].get("article") or lp[ref_idx].get("sku") or "")
        exclude_arts = list((customer_session or {}).get("shownArticles") or []) if (plan.get("wantsMoreLikeRef") or plan.get("wantsNewArrival") or plan.get("wantsBestSeller")) else []
        products, unavailable_labels = execute_python_catalog_search(
            plan=plan,
            store_scope=cfg.get("storeScope", "SUKO"),
            exclude_articles=exclude_arts,
            limit=3,
            verify_live=True,
        )

    # 8. TAHAP 3: AI COPYWRITER HALO BCA + SOP HAND-OFF GRUP -> PRIVATE CHAT + ESCALATION PIC!
    handoff_enabled = bool(cfg.get("handoffToPrivateChat", True))
    reply_text, reply_messages, copy_model = build_final_cards_and_text(
        sender_name=sender_name,
        message=message,
        plan=plan,
        products=products,
        unavailable_labels=unavailable_labels,
        session=customer_session,
        from_group_name=group_name if (is_group and handoff_enabled) else "",
        cfg=cfg,
    )
    best_image_url = next((rm.get("imageUrl") for rm in reply_messages if rm.get("imageUrl")), None)

    sapaan = _friendly_sapaan(sender_name)
    session_mins = int(cfg.get("privateSessionMinutes", 30) or 30)
    cs_phone_digits = normalize_wa_phone(cfg.get("adminPhone") or "6285771123000") or "6285771123000"
    cs_jump_link = f"https://wa.me/{cs_phone_digits}"

    delivery_mode = "GROUP_DIRECT"
    group_reply_text: Optional[str] = None
    private_messages: List[Dict[str, Any]] = []

    if is_group and handoff_enabled:
        delivery_mode = "GROUP_HANDOFF_TO_PRIVATE"
        if products:
            group_reply_text = (
                f"Halo {sapaan}, dengan senang hati akan saya bantu 😊\n"
                f"Mohon izin saya teruskan detail produk *SUKO* & fotonya melalui *private chat (japri)* ya Kak "
                f"agar tidak mengganggu member lain di grup ini 🙏\n\n"
                f"👉 *Klik di sini untuk langsung ke Private Chat CS:*\n{cs_jump_link}"
            )
        else:
            group_reply_text = (
                f"Halo {sapaan}, terima kasih sudah menghubungi *{cfg.get('storeName', 'SUKO Official')}* 😊\n"
                f"Dengan senang hati akan saya bantu — mohon izin saya lanjutkan melalui *private chat (japri)* ya Kak "
                f"agar tidak mengganggu member lain di grup ini 🙏\n\n"
                f"👉 *Klik di sini untuk langsung ke Private Chat CS:*\n{cs_jump_link}"
            )
        private_messages = reply_messages
    elif not is_group:
        delivery_mode = "PRIVATE_SESSION_REPLY"
        private_messages = reply_messages

    # Simpan memori sesi 30 menit (untuk Private Chat VIP follow-up & konteks!)
    if session_key and not is_simulation:
        save_customer_session(
            raw_sender=session_key,
            sender_name=sender_name,
            group_name=group_name if is_group else ((customer_session or {}).get("groupName") or "Private Chat VIP"),
            minutes=session_mins,
            preferred_gender=plan.get("genderHint") or "",
            new_products=products if products else None,
            user_msg=message,
            bot_summary=reply_text[:160],
        )

    # Notifikasi otomatis ke WA PIC (081296393972) saat customer siap ORDER/KEEP, CEK FISIK, atau KOMPLAIN!
    notify_pic_phone = None
    notify_pic_message = None
    pause_after_reply = False
    if plan.get("intent") in ("ORDER_INTENT", "PHYSICAL_CHECK", "COMPLAINT"):
        notify_pic_phone = cfg.get("picAlertPhone") or "6281296393972"
        last_prods_str = ", ".join(
            f"No.{p.get('num')} {p.get('name')}" for p in ((customer_session or {}).get("lastProducts") or [])
        ) or (quoted_message[:100] if quoted_message else "-")
        tag = (
            "🛒 *[CLOSING / SIAP QRIS SUKO]*" if plan["intent"] == "ORDER_INTENT"
            else "📸 *[BUTUH CEK FISIK / FOTO ASLI]*" if plan["intent"] == "PHYSICAL_CHECK"
            else "⚠️ *[ESKALASI KOMPLAIN CUSTOMER]*"
        )
        notify_pic_message = (
            f"{tag}\n"
            f"• Customer: *{sender_name}* ({sender_digits or sender})\n"
            f"• Pesan: \"{message}\"\n"
            f"• Konteks produk: {last_prods_str}\n"
            f"• Bot otomatis minggir sementara agar Kakak bisa langsung handle!"
        )
        pause_after_reply = True

    reason = (
        "ORDER_ESCALATED_TO_PIC" if plan.get("intent") == "ORDER_INTENT"
        else "PHYSICAL_CHECK_ESCALATED_TO_PIC" if plan.get("intent") == "PHYSICAL_CHECK"
        else "COMPLAINT_ESCALATED_TO_PIC" if plan.get("intent") == "COMPLAINT"
        else "COLOR_PHOTOS_SENT" if (plan.get("wantsColorPhotos") and products)
        else "PRODUCT_FOUND_READY" if any(p.get("availability") == "READY" for p in products)
        else "PRODUCT_FOUND_SOLD_OUT" if products
        else "GREETING_REPLIED" if plan.get("intent") == "GREETING"
        else "FAQ_OR_SOP_REPLIED" if plan.get("intent") in ("FAQ_SOP", "OTHER_BRAND")
        else "PRODUCT_NOT_FOUND"
    )

    elapsed = int((time.monotonic() - t0) * 1000)
    append_log({
        "source": source,
        "groupId": group_id or sender or "SIM",
        "groupName": group_name,
        "senderName": sender_name,
        "message": message[:140],
        "decision": (
            "ESCALATED_TO_PIC" if pause_after_reply
            else "HANDOFF_PRIVATE_PHOTO" if (delivery_mode == "GROUP_HANDOFF_TO_PRIVATE" and best_image_url)
            else "HANDOFF_PRIVATE_TEXT" if delivery_mode == "GROUP_HANDOFF_TO_PRIVATE"
            else "REPLIED_WITH_IMAGE" if best_image_url
            else "REPLIED_TEXT"
        ),
        "reason": f"{reason} [{plan.get('engine')}]",
        "replyPreview": (group_reply_text or reply_text)[:180],
        "imageUrl": best_image_url,
        "matchedSku": products[0]["sku"] if products else None,
        "elapsedMs": elapsed,
    })

    return {
        "success": True,
        "shouldReply": True,
        "deliveryMode": delivery_mode,
        "reason": reason,
        "intent": plan.get("intent"),
        "intentDetail": plan,
        "aiModelUsed": {"planner": plan.get("engine"), "copywriter": copy_model},
        "aiQuota": _get_quota_status(cfg),
        "groupReplyText": group_reply_text,
        "privateMessages": private_messages,
        "privateSessionMinutes": session_mins,
        "replyText": reply_text,
        "imageUrl": best_image_url,
        "replyMessages": reply_messages,
        "matchedProducts": products,
        "notifyPicPhone": notify_pic_phone,
        "notifyPicMessage": notify_pic_message,
        "pauseAfterReply": pause_after_reply,
        "humanTakeoverMinutes": cfg.get("humanTakeoverMinutes", 10),
        "elapsedMs": elapsed,
    }


def handle_wa_cs_request(payload: Dict[str, Any], header_secret: str = "") -> Dict[str, Any]:
    action = str(payload.get("action") or "health").strip().lower()

    if action == "health":
        cfg = load_config()
        return {
            "success": True,
            "engine": "python-wa-cs-orchestrator-v2",
            "geminiConfigured": bool((os.environ.get("GEMINI_API_KEY") or "").strip()),
            "tursoConfigured": bool((os.environ.get("TURSO_DATABASE_URL") or "").strip()),
            "storeScope": cfg.get("storeScope", "SUKO"),
            "enabled": bool(cfg.get("enabled", False)),
            "withinStoreHours": is_within_store_hours(cfg),
            "serverWibTime": wib_now().strftime("%H:%M WIB"),
            "aiQuota": _get_quota_status(cfg),
            "whitelistedGroupsCount": len([g for g in (cfg.get("allowedGroups") or []) if g.get("enabled", True)]),
        }

    provided_secret = header_secret or str(payload.get("secret") or "")
    if not verify_secret(provided_secret):
        return {"success": False, "error": "Unauthorized WA CS secret", "status": 401}

    if action == "get-config":
        cfg = load_config()
        out: Dict[str, Any] = {
            "success": True,
            "config": mask_config_for_ui(cfg),
            "bridge": load_bridge_state(),
        }
        if payload.get("includeFonnteToken"):
            out["fonnteToken"] = cfg.get("fonnteToken") or ""
        if payload.get("includeLogs", True):
            out["logs"] = load_logs()
        return out

    if action == "request-pairing":
        cfg = load_config()
        raw_phone = str(payload.get("phone") or cfg.get("adminPhone") or "6285771123000").strip()
        norm_phone = normalize_wa_phone(raw_phone) or "6285771123000"
        if norm_phone != cfg.get("adminPhone"):
            cfg["adminPhone"] = norm_phone
            save_config(cfg)
        st = load_bridge_state()
        now_ms = int(time.time() * 1000)
        st["pairingRequestedAt"] = now_ms
        st["pairingCode"] = ""
        st["pairingCodeAt"] = 0
        st["phone"] = norm_phone
        st["statusMessage"] = f"Meminta kode pairing 8 digit ke WhatsApp untuk +{norm_phone}..."
        return {"success": True, "config": mask_config_for_ui(cfg), "bridge": save_bridge_state(st)}

    if action == "request-logout":
        st = load_bridge_state()
        st["logoutRequestedAt"] = int(time.time() * 1000)
        st["connected"] = False
        st["pairingCode"] = ""
        st["pairingCodeAt"] = 0
        st["statusMessage"] = "Memutuskan tautan WhatsApp..."
        return {"success": True, "bridge": save_bridge_state(st)}

    if action == "bridge-sync":
        cfg = load_config()
        st = load_bridge_state()
        now_ms = int(time.time() * 1000)
        prev_hb = int(st.get("lastHeartbeatAt") or 0)
        changed = False
        if "connected" in payload and bool(payload["connected"]) != bool(st.get("connected", False)):
            st["connected"] = bool(payload["connected"])
            changed = True
        if payload.get("phone"):
            np = normalize_wa_phone(payload["phone"]) or st.get("phone", "")
            if np != st.get("phone", ""):
                st["phone"] = np
                changed = True
        if payload.get("statusMessage") and str(payload["statusMessage"])[:160] != st.get("statusMessage", ""):
            st["statusMessage"] = str(payload["statusMessage"])[:160]
            changed = True
        if payload.get("pairingCode"):
            st["pairingCode"] = str(payload["pairingCode"]).strip()
            st["pairingCodeAt"] = now_ms
            changed = True
        elif payload.get("clearPairingCode") and st.get("pairingCode"):
            st["pairingCode"] = ""
            st["pairingCodeAt"] = 0
            changed = True

        if changed or (now_ms - prev_hb) >= 55_000:
            st["lastHeartbeatAt"] = now_ms
            saved_st = save_bridge_state(st)
        else:
            saved_st = st

        return {
            "success": True,
            "bridge": saved_st,
            "adminPhone": cfg.get("adminPhone") or "6285771123000",
            "humanTakeoverMinutes": cfg.get("humanTakeoverMinutes", 10),
        }

    if action == "save-config":
        current = load_config()
        patch = payload.get("config") if isinstance(payload.get("config"), dict) else payload
        for field in (
            "enabled", "autoSchedule", "openHourWib", "openMinuteWib", "closeHourWib", "closeMinuteWib",
            "ignorePrivateChats", "handoffToPrivateChat", "privateSessionMinutes", "replyGreetings",
            "storeScope", "csName", "adminPhone", "picAlertPhone", "storeName", "storeSop",
            "heavyDailyBudget", "humanTakeoverMinutes", "replyWithImage", "allowedGroups",
        ):
            if field in patch and patch[field] is not None:
                current[field] = patch[field]
        if patch.get("clearFonnteToken"):
            current["fonnteToken"] = ""
        elif isinstance(patch.get("fonnteToken"), str) and patch["fonnteToken"].strip():
            current["fonnteToken"] = patch["fonnteToken"].strip()
        if patch.get("clearCustomGeminiApiKey"):
            current["customGeminiApiKey"] = ""
            _MODEL_COOLDOWN_UNTIL.clear()
        elif isinstance(patch.get("customGeminiApiKey"), str) and patch["customGeminiApiKey"].strip():
            current["customGeminiApiKey"] = patch["customGeminiApiKey"].strip()
            _MODEL_COOLDOWN_UNTIL.clear()
        return {"success": True, "config": mask_config_for_ui(save_config(current))}

    if action == "toggle":
        current = load_config()
        current["enabled"] = bool(payload["enabled"]) if "enabled" in payload else (not bool(current.get("enabled", False)))
        return {"success": True, "config": mask_config_for_ui(save_config(current))}

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
            allowed.insert(0, {"id": gid, "name": gname or gid, "enabled": genabled, "addedAt": utc_iso_now()})
        current["allowedGroups"] = allowed
        return {"success": True, "config": mask_config_for_ui(save_config(current))}

    if action == "remove-group":
        current = load_config()
        gid = str(payload.get("groupId") or "").strip()
        current["allowedGroups"] = [g for g in (current.get("allowedGroups") or []) if str(g.get("id") or "").strip() != gid]
        return {"success": True, "config": mask_config_for_ui(save_config(current))}

    if action == "clear-logs":
        clear_logs()
        return {"success": True, "logs": []}

    if action == "simulate":
        return _process_incoming_or_simulate(payload, is_simulation=True)

    if action == "incoming":
        return _process_incoming_or_simulate(payload, is_simulation=False)

    return {"success": False, "error": f"Unknown action: {action}"}
