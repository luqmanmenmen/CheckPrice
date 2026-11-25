# -*- coding: utf-8 -*-
"""
suko_auto_share.py
================================================================================
Kurator & Copywriter Auto-Share Katalog Produk SUKO untuk Grup WhatsApp.
100% Python yang Mikir (Turso Cloud + SUKO Knowledge Bible + Gemini Copywriter).

Fitur Inti:
1. Rotasi 10 Kategori SUKO lengkap mencakup:
   - SUKO Ladies (Atasan & Blouse)
   - SUKO Men (Kemeja, Kaos & Polo)
   - SUKO GO / Sports Men
   - SUKO GO / Sports Ladies
   - SUKO Ladies (Dress & Rok)
   - SUKO Boys (Anak Laki-laki)
   - SUKO Girls (Anak Perempuan)
   - SUKO Celana & Jaket/Outer
   - SUKO Workwear & Sleepwear
   - SUKO Essential, Home Living, Tas & Footwear
2. Rotasi 3 Tipe Showcase: PROMO (Limited Offers) -> NEW_ARRIVAL -> NORMAL (SUKO Pick).
3. Algoritma "Paling Menjual": stok sehat, foto HD valid, warna & ukuran lengkap,
   teknologi bahan unggulan SUKO, diskon terbaik, & 100% anti-dobel (120 artikel terakhir).
4. Gaya Copywriting Butik SUKO Exclusive Member (clean, hangat, aesthetic, zero bocor qty).
================================================================================
"""

from __future__ import annotations

import json
import random
import re
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Dict, List, Optional, Tuple

from suko_product_knowledge import detect_fabric_tech_badge

AUTO_SHARE_STATE_PATH = "config/wa-auto-share-state.json"

# 10 Kategori Rotasi Penuh (Men, Ladies, Boys, Girls, SUKO GO, Dress/Rok, Celana/Outer, Workwear/Sleepwear, Essential/Home)
AUTO_SHARE_CATEGORIES: List[Dict[str, Any]] = [
    {"id": "LADIES_ATASAN", "label": "SUKO Ladies • Atasan & Blouse", "short": "Ladies Atasan"},
    {"id": "MEN_ATASAN", "label": "SUKO Men • Kemeja, Kaos & Polo", "short": "Men Atasan"},
    {"id": "SUKO_GO_MEN", "label": "SUKO GO • Sports Men", "short": "SUKO GO Men"},
    {"id": "SUKO_GO_LADIES", "label": "SUKO GO • Sports Ladies", "short": "SUKO GO Ladies"},
    {"id": "LADIES_DRESS_ROK", "label": "SUKO Ladies • Dress & Rok", "short": "Ladies Dress & Rok"},
    {"id": "BOYS", "label": "SUKO Boys • Koleksi Anak Laki-laki", "short": "SUKO Boys"},
    {"id": "GIRLS", "label": "SUKO Girls • Koleksi Anak Perempuan", "short": "SUKO Girls"},
    {"id": "CELANA_OUTER", "label": "SUKO Casual • Celana & Jaket/Outer", "short": "Celana & Outer"},
    {"id": "WORKWEAR_SLEEPWEAR", "label": "SUKO Workwear & Sleepwear", "short": "Workwear & Sleepwear"},
    {"id": "ESSENTIAL_LIFESTYLE", "label": "SUKO Essential, Home Living, Tas & Alas Kaki", "short": "Essential & Lifestyle"},
]

SHARE_MODES = ["PROMO", "NEW_ARRIVAL", "NORMAL"]

LADIES_HINTS_RE = re.compile(
    r"\b(LADIES|FEMALE|WOMAN|WOMEN|WANITA|BLOUSE|BLUS|PEPLUM|TANK\s*TOP|CROP|KAMISOL|DRESS|GAUN|ROK|SKIRT|TUNIK|CARDIGAN|KARDIGAN|KNIT\s+TOP|MIDI|FLARE|SATIN|ASYMMETRICAL|SQUARE\s+NECK|RUFFLE)\b",
    re.I,
)
MEN_HINTS_RE = re.compile(
    r"\b(MEN|MALE|PRIA|COWOK|OXFORD|KOKO|MANDARIN|KERAH\s+TEGAK|HENLEY|WORK\s+SHIRT|CAMP\s+COLLAR|RESORT|POCKET\s+TEE|PIQUE|POLO|CHINO|CARGO)\b",
    re.I,
)

COLOR_EMOJI_MAP: List[Tuple[str, str]] = [
    ("BLACK", "🖤"), ("HITAM", "🖤"), ("CHARCOAL", "🖤"),
    ("WHITE", "🤍"), ("PUTIH", "🤍"), ("OFF WHITE", "🤍"), ("CREAM", "🤍"), ("VANILLA", "🤍"), ("IVORY", "🤍"),
    ("NAVY", "💙"), ("BLUE", "💙"), ("BIRU", "💙"), ("DENIM", "💙"), ("SKY", "🩵"), ("LIGHT BLUE", "🩵"),
    ("PINK", "🩷"), ("ROSE", "🩷"), ("DUSTY PINK", "🩷"), ("CORAL", "🩷"), ("LILAC", "💜"), ("LAVENDER", "💜"), ("PURPLE", "💜"),
    ("GREEN", "💚"), ("HIJAU", "💚"), ("OLIVE", "🫒"), ("SAGE", "🌿"), ("MINT", "💚"),
    ("BROWN", "🤎"), ("COKLAT", "🤎"), ("KHAKI", "🤎"), ("BEIGE", "🤎"), ("SAND", "🤎"), ("TAUPE", "🤎"), ("MOCCA", "🤎"),
    ("RED", "❤️"), ("MERAH", "❤️"), ("MAROON", "❤️"), ("BURGUNDY", "🍷"),
    ("YELLOW", "💛"), ("KUNING", "💛"), ("MUSTARD", "💛"), ("ORANGE", "🧡"),
    ("GREY", "🩶"), ("GRAY", "🩶"), ("ABU", "🩶"),
]

COLOR_ID_LABEL: Dict[str, str] = {
    "BLACK": "Hitam",
    "WHITE": "Putih",
    "OFF WHITE": "Off White",
    "NAVY": "Navy",
    "DARK NAVY": "Dark Navy",
    "BLUE": "Biru",
    "LIGHT BLUE": "Biru Muda",
    "DARK BLUE": "Biru Tua",
    "GREY": "Abu-abu",
    "LIGHT GREY": "Abu Muda",
    "DARK GREY": "Abu Tua",
    "CHARCOAL": "Charcoal",
    "BEIGE": "Beige",
    "KHAKI": "Khaki",
    "CREAM": "Cream",
    "BROWN": "Coklat",
    "DARK BROWN": "Coklat Tua",
    "LIGHT BROWN": "Coklat Muda",
    "GREEN": "Hijau",
    "DARK GREEN": "Hijau Tua",
    "LIGHT GREEN": "Hijau Muda",
    "OLIVE": "Olive",
    "PINK": "Pink",
    "DUSTY PINK": "Dusty Pink",
    "RED": "Merah",
    "MAROON": "Maroon",
    "YELLOW": "Kuning",
    "MUSTARD": "Mustard",
    "ORANGE": "Oranye",
    "PURPLE": "Ungu",
    "LILAC": "Lilac",
}


def _wib_now() -> datetime:
    return datetime.now(timezone(timedelta(hours=7)))


def _format_rp_compact(amount: Any) -> str:
    try:
        n = int(round(float(amount or 0)))
    except Exception:
        n = 0
    if n <= 0:
        return "-"
    return "Rp" + f"{n:,}".replace(",", ".")


def _parse_json_list(raw: Any) -> List[str]:
    if isinstance(raw, list):
        return [str(x).strip() for x in raw if str(x).strip()]
    if isinstance(raw, str) and raw.strip():
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                return [str(x).strip() for x in parsed if str(x).strip()]
        except Exception:
            pass
        return [x.strip() for x in raw.split(",") if x.strip()]
    return []


def _prettify_product_title(description: str, article: str) -> str:
    base = str(description or "").split(":")[0].strip()
    if article:
        base = re.sub(rf"\b{re.escape(article)}\b", "", base, flags=re.I).strip(" -_:/")
    base = re.sub(r"\s+", " ", base).strip()
    if not base:
        return article or "Koleksi SUKO"
    # Title case rapi sambil menjaga akronim SUKO / T-Shirt / SS / LS
    words = []
    for w in base.split(" "):
        up = w.upper()
        if up in ("SUKO", "T-SHIRT", "UV", "GSM", "B2G1", "SS", "LS", "GO"):
            words.append("T-Shirt" if up == "T-SHIRT" else up)
        else:
            words.append(w.capitalize())
    return " ".join(words)[:64]


def _format_colors_with_emojis(colors: List[str]) -> str:
    cleaned: List[str] = []
    emojis: List[str] = []
    seen = set()
    for c in colors:
        up = str(c or "").strip().upper()
        if not up or up in ("NO COLOR", "ASSORTED", "MULTI", "-") or up in seen:
            continue
        seen.add(up)
        label = COLOR_ID_LABEL.get(up) or " ".join(w.capitalize() for w in up.split())
        cleaned.append(label)
        for kw, em in COLOR_EMOJI_MAP:
            if kw in up and em not in emojis:
                emojis.append(em)
                break
        if len(cleaned) >= 4:
            break
    if not cleaned:
        return ""
    if len(cleaned) == 1:
        text = cleaned[0]
    elif len(cleaned) == 2:
        text = f"{cleaned[0]} & {cleaned[1]}"
    else:
        text = ", ".join(cleaned[:-1]) + f" & {cleaned[-1]}"
    em_suffix = f" {''.join(emojis[:3])}" if emojis else ""
    return f"{text}{em_suffix}"


def _format_sizes_clean(sizes: List[str]) -> str:
    order = {
        "XXS": 1, "XS": 2, "S": 3, "M": 4, "L": 5, "XL": 6, "XXL": 7, "2XL": 7, "3XL": 8,
        "ALL SIZE": 20, "FREE SIZE": 21, "F": 22, "OS": 23,
    }
    uniq = sorted(
        {str(s).strip().upper() for s in sizes if str(s).strip() and str(s).strip() != "-"},
        key=lambda x: (order.get(x, 15), x),
    )
    return ", ".join(uniq[:6])


def _default_state() -> Dict[str, Any]:
    return {
        "nextCategoryIdx": 0,
        "nextModeIdx": 0,
        "lastSharedAtMs": 0,
        "manualTriggerAt": 0,
        "todayDateWib": _wib_now().strftime("%Y-%m-%d"),
        "todayCount": 0,
        "recentArticles": [],
        "history": [],
    }


def load_auto_share_state(storage_read_text: Callable[..., Optional[str]]) -> Dict[str, Any]:
    st = _default_state()
    try:
        txt = storage_read_text(AUTO_SHARE_STATE_PATH, timeout=3.5)
        if txt:
            parsed = json.loads(txt)
            if isinstance(parsed, dict):
                st.update(parsed)
    except Exception:
        pass
    today = _wib_now().strftime("%Y-%m-%d")
    if st.get("todayDateWib") != today:
        st["todayDateWib"] = today
        st["todayCount"] = 0
    if not isinstance(st.get("recentArticles"), list):
        st["recentArticles"] = []
    if not isinstance(st.get("history"), list):
        st["history"] = []
    st["nextCategoryIdx"] = int(st.get("nextCategoryIdx") or 0) % len(AUTO_SHARE_CATEGORIES)
    st["nextModeIdx"] = int(st.get("nextModeIdx") or 0) % len(SHARE_MODES)
    return st


def save_auto_share_state(
    st: Dict[str, Any],
    storage_write_bytes: Callable[..., Any],
) -> Dict[str, Any]:
    st["recentArticles"] = list(st.get("recentArticles") or [])[:140]
    st["history"] = list(st.get("history") or [])[:15]
    raw = json.dumps(st, ensure_ascii=False, indent=2).encode("utf-8")
    storage_write_bytes(AUTO_SHARE_STATE_PATH, raw, content_type="application/json", timeout=4.5)
    return st


def _match_category(row: Dict[str, Any], cat_id: str) -> bool:
    dept = str(row.get("dept") or "").upper()
    ck = str(row.get("categoryKey") or "").upper()
    desc = str(row.get("description") or "").upper()

    if cat_id == "LADIES_ATASAN":
        if dept == "SUKO CASUAL" and ck == "ATASAN":
            if LADIES_HINTS_RE.search(desc):
                return True
            return not bool(MEN_HINTS_RE.search(desc))
        return False
    if cat_id == "MEN_ATASAN":
        if dept == "SUKO CASUAL" and ck == "ATASAN":
            if MEN_HINTS_RE.search(desc) and not LADIES_HINTS_RE.search(desc):
                return True
            return not bool(LADIES_HINTS_RE.search(desc))
        return False
    if cat_id == "SUKO_GO_MEN":
        return "SPORTS MEN" in dept or (dept == "SUKO CASUAL" and ck == "SPORT" and not LADIES_HINTS_RE.search(desc))
    if cat_id == "SUKO_GO_LADIES":
        return "SPORTS LADIES" in dept or (dept == "SUKO CASUAL" and ck == "SPORT" and bool(LADIES_HINTS_RE.search(desc)))
    if cat_id == "LADIES_DRESS_ROK":
        return dept == "SUKO CASUAL" and ck == "DRESS_ROK"
    if cat_id == "BOYS":
        return "BOYS" in dept
    if cat_id == "GIRLS":
        return "GIRLS" in dept
    if cat_id == "CELANA_OUTER":
        return dept == "SUKO CASUAL" and ck in ("CELANA", "JAKET")
    if cat_id == "WORKWEAR_SLEEPWEAR":
        return "WORKWEAR" in dept or "SLEEPWEAR" in dept
    if cat_id == "ESSENTIAL_LIFESTYLE":
        return (
            "HOME LIVING" in dept
            or "ESSENTIAL" in dept
            or "TOYS" in dept
            or "UNDERWEAR" in dept
            or ck in ("SEPATU_SANDAL", "TAS_AKSESORIS")
        )
    return False


def _score_candidate(
    row: Dict[str, Any],
    target_mode: str,
    new_arrival_articles: set,
) -> float:
    stok = int(row.get("articleTotalStok") or row.get("stok") or 0)
    colors = _parse_json_list(row.get("articleColors"))
    sizes = _parse_json_list(row.get("articleSizes"))
    has_promo = bool(int(row.get("articleHasPromo") or 0))
    normal = float(row.get("hargaNormal") or 0)
    promo = float(row.get("hargaPromo") or 0)
    art = str(row.get("article") or "").strip().upper()
    desc = str(row.get("description") or "")
    dept = str(row.get("dept") or "")

    score = 0.0
    # 1. Kesehatan stok (prioritaskan barang yang ready melimpah agar member tidak kecewa)
    if stok >= 20:
        score += 24.0
    elif stok >= 10:
        score += 18.0
    elif stok >= 5:
        score += 11.0
    elif stok >= 2:
        score += 5.0

    # 2. Kelengkapan varian warna & ukuran (lebih menjual!)
    if len(colors) >= 3:
        score += 22.0
    elif len(colors) == 2:
        score += 14.0
    if len(sizes) >= 4:
        score += 16.0
    elif len(sizes) >= 2:
        score += 9.0

    # 3. Teknologi bahan asli SUKO (nilai jual premium!)
    if detect_fabric_tech_badge(desc, dept):
        score += 18.0

    # 4. Skor spesifik per tipe showcase (PROMO / NEW_ARRIVAL / NORMAL)
    if target_mode == "PROMO":
        if has_promo:
            score += 45.0
            if normal > 0 and promo > 0 and promo < normal:
                disc_pct = ((normal - promo) / normal) * 100.0
                score += min(35.0, disc_pct * 0.8)
            elif row.get("articlePromoLabel") or row.get("discountType"):
                score += 22.0
        else:
            score -= 60.0
    elif target_mode == "NEW_ARRIVAL":
        if art in new_arrival_articles:
            score += 55.0
        if not has_promo:
            score += 15.0
        if normal >= 99000:
            score += 8.0
    else:  # NORMAL
        if not has_promo:
            score += 38.0
        else:
            score -= 25.0
        if 79000 <= normal <= 399000:
            score += 12.0

    # Jitter ringan agar variasi antar hari tetap fresh di antara kandidat terlaris
    score += random.uniform(0.0, 9.0)
    return score


def _build_deterministic_boutique_caption(
    row: Dict[str, Any],
    share_mode: str,
    cat_meta: Dict[str, Any],
) -> str:
    art = str(row.get("article") or "").strip()
    desc = str(row.get("description") or "").strip()
    dept = str(row.get("dept") or "").strip()
    title = _prettify_product_title(desc, art)
    colors = _parse_json_list(row.get("articleColors"))
    sizes = _parse_json_list(row.get("articleSizes"))
    color_line = _format_colors_with_emojis(colors)
    size_line = _format_sizes_clean(sizes)

    normal = float(row.get("hargaNormal") or 0)
    promo = float(row.get("hargaPromo") or 0)
    has_promo = bool(int(row.get("articleHasPromo") or 0))
    promo_label = str(row.get("articlePromoLabel") or row.get("discountType") or row.get("diskon") or "").strip()

    tech_badge = detect_fabric_tech_badge(desc, dept)
    tech_clean = re.sub(r"\*", "", tech_badge).strip() if tech_badge else ""

    if share_mode == "PROMO" or (has_promo and share_mode != "NEW_ARRIVAL"):
        header = f"*Limited Offers — {title} ✨*"
    elif share_mode == "NEW_ARRIVAL":
        header = f"*New Arrival — {title} ✨*"
    else:
        header = f"*SUKO Pick — {title} ✨*"

    if tech_clean:
        body = (
            f"Koleksi {cat_meta['short']} dengan karakter {tech_clean}. "
            f"Potongannya clean, modern, dan gampang dipadupadankan buat daily look kamu seharian."
        )
    elif "SPORTS" in dept.upper() or "GO" in cat_meta["id"]:
        body = (
            f"Activewear clean dari lini SUKO GO yang ringan, breathable, dan nyaman mengikuti gerak aktif kamu. "
            f"Pas banget buat olahraga, jalan santai, sampai gaya sporty harian."
        )
    elif "BOYS" in dept.upper() or "GIRLS" in dept.upper():
        body = (
            f"Koleksi SUKO Kids dengan potongan nyaman dan bahan ramah kulit buat aktivitas si kecil seharian. "
            f"Tampilannya rapi, ceria, dan gampang di-mix & match."
        )
    elif "SLEEPWEAR" in dept.upper():
        body = (
            f"Koleksi nyaman untuk jam santai hingga istirahat di rumah dengan sentuhan lembut dan adem. "
            f"Bikin waktu santaimu tetap rapi dan ekstra rileks."
        )
    elif "WORKWEAR" in dept.upper():
        body = (
            f"Tampilan smart-casual yang rapi namun tetap adem dan breathable untuk dipakai kerja seharian. "
            f"Mudah dipadukan untuk suasana kantor hingga hangout sepulang kerja."
        )
    else:
        body = (
            f"Potongan clean dan modern khas SUKO buat tampilan effortless sehari-hari. "
            f"Nyaman dipakai beraktivitas dan gampang dipadupadankan dengan outfit favoritmu."
        )

    lines = [header, "", body]
    meta_lines = []
    if color_line:
        meta_lines.append(f"Pilihan warna: {color_line}")
    if size_line:
        meta_lines.append(f"Ukuran tersedia: {size_line}")
    if meta_lines:
        lines.append("")
        lines.extend(meta_lines)

    lines.append("")
    if has_promo and promo > 0 and (normal <= 0 or promo < normal):
        if normal > promo:
            lines.append(f"~{_format_rp_compact(normal)}~")
        lines.append(f"*Harga spesial: {_format_rp_compact(promo)}* 🌸")
    elif has_promo and promo_label:
        lines.append(f"*Promo spesial: {promo_label}* 🌸")
        if normal > 0:
            lines.append(f"*Harga: {_format_rp_compact(normal)}*")
    else:
        lines.append(f"*Harga: {_format_rp_compact(normal)}* ✨")

    return "\n".join(lines).strip()


def _polish_boutique_copy_with_ai(
    row: Dict[str, Any],
    share_mode: str,
    cat_meta: Dict[str, Any],
    fallback_caption: str,
    gemini_caller: Optional[Callable[..., Tuple[Optional[str], str]]],
    cfg: Dict[str, Any],
) -> Tuple[str, str]:
    if not gemini_caller:
        return fallback_caption, "deterministic"

    art = str(row.get("article") or "").strip()
    desc = str(row.get("description") or "").strip()
    dept = str(row.get("dept") or "").strip()
    title = _prettify_product_title(desc, art)
    colors = _parse_json_list(row.get("articleColors"))
    sizes = _parse_json_list(row.get("articleSizes"))
    color_line = _format_colors_with_emojis(colors)
    size_line = _format_sizes_clean(sizes)
    tech_badge = detect_fabric_tech_badge(desc, dept)

    normal = float(row.get("hargaNormal") or 0)
    promo = float(row.get("hargaPromo") or 0)
    has_promo = bool(int(row.get("articleHasPromo") or 0))
    promo_label = str(row.get("articlePromoLabel") or row.get("discountType") or row.get("diskon") or "").strip()

    if share_mode == "PROMO" or (has_promo and share_mode != "NEW_ARRIVAL"):
        prefix = "Limited Offers"
    elif share_mode == "NEW_ARRIVAL":
        prefix = "New Arrival"
    else:
        prefix = "SUKO Pick"

    if has_promo and promo > 0 and (normal <= 0 or promo < normal):
        price_block = (f"~{_format_rp_compact(normal)}~\n" if normal > promo else "") + f"*Harga spesial: {_format_rp_compact(promo)}* 🌸"
    elif has_promo and promo_label:
        price_block = f"*Promo spesial: {promo_label}* 🌸" + (f"\n*Harga: {_format_rp_compact(normal)}*" if normal > 0 else "")
    else:
        price_block = f"*Harga: {_format_rp_compact(normal)}* ✨"

    system_prompt = (
        "Kamu adalah Copywriter resmi grup WhatsApp 'SUKO EXCLUSIVE MEMBER' (brand fashion minimalis modern SUKO di Matahari PTC Surabaya). "
        "Tugasmu menulis 2 kalimat deskripsi produk yang hangat, aesthetic, clean, natural, dan menjual — PERSIS gaya admin butik SUKO.\n"
        "ATURAN WAJIB:\n"
        "1. HANYA tulis 2 kalimat pendek deskripsi (maksimal 220 karakter total). JANGAN tulis judul, harga, warna, atau sapaan.\n"
        "2. DILARANG KERAS mengarang persentase kain (mis. 100% katun/poliester) jika tidak tertulis di data produk.\n"
        "3. DILARANG menyebut angka stok, SKU, kode artikel, atau nama database.\n"
        "4. Bahasa Indonesia santai-elegan (boleh pakai istilah wajar seperti 'daily look', 'effortless', 'clean', 'mix & match')."
    )
    user_prompt = (
        f"Kategori: {cat_meta['label']}\n"
        f"Nama Produk: {title}\n"
        f"Deskripsi Asli: {desc}\n"
        f"Keunggulan Bahan Terverifikasi: {tech_badge or 'Desain minimalis clean khas SUKO'}\n"
        f"Tipe Post: {prefix}\n"
        "Tulis tepat 2 kalimat pendek deskripsi produk:"
    )

    try:
        raw_desc, model_used = gemini_caller(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            cfg=cfg,
            max_tokens=140,
            temperature=0.65,
        )
        cleaned = str(raw_desc or "").strip().strip('"').strip("'")
        cleaned = re.sub(r"\n+", " ", cleaned).strip()
        if 35 <= len(cleaned) <= 280 and not re.search(r"\b(stok|sku|tersisa|pcs|rupiah|rp\s*\d)\b", cleaned, re.I):
            parts = [f"*{prefix} — {title} ✨*", "", cleaned]
            meta_lines = []
            if color_line:
                meta_lines.append(f"Pilihan warna: {color_line}")
            if size_line:
                meta_lines.append(f"Ukuran tersedia: {size_line}")
            if meta_lines:
                parts.append("")
                parts.extend(meta_lines)
            parts.append("")
            parts.append(price_block)
            return "\n".join(parts).strip(), model_used or "gemini"
    except Exception:
        pass
    return fallback_caption, "deterministic"


def pick_and_build_auto_share(
    cfg: Dict[str, Any],
    turso_query: Callable[..., List[Dict[str, Any]]],
    storage_read_text: Callable[..., Optional[str]],
    storage_write_bytes: Callable[..., Any],
    gemini_caller: Optional[Callable[..., Tuple[Optional[str], str]]] = None,
    force_now: bool = False,
    dry_run: bool = False,
) -> Dict[str, Any]:
    """
    Memilih 1 produk SUKO paling menjual dari kategori giliran saat ini (rotasi 10 kategori +
    rotasi Promo / New Arrival / Normal, anti-dobel), lalu menyusun caption butik + foto HD.
    """
    now_wib = _wib_now()
    now_ms = int(time.time() * 1000)
    st = load_auto_share_state(storage_read_text)

    enabled = bool(cfg.get("autoShareEnabled", True))
    target_gid = str(cfg.get("autoShareTargetGroupId") or "").strip()
    target_gname = str(cfg.get("autoShareTargetGroupName") or target_gid or "Grup Test").strip()
    interval_mins = max(3, min(180, int(cfg.get("autoShareIntervalMinutes") or 10)))
    start_h = max(0, min(23, int(cfg.get("autoShareStartHourWib", 10))))
    end_h = max(0, min(23, int(cfg.get("autoShareEndHourWib", 20))))

    if not target_gid:
        # Fallback aman ke grup whitelist pertama yang aktif (Grup wa test cs suko)
        for g in (cfg.get("allowedGroups") or []):
            if g.get("enabled", True) and g.get("id"):
                target_gid = str(g["id"]).strip()
                target_gname = str(g.get("name") or target_gid).strip()
                break

    manual_pending = int(st.get("manualTriggerAt") or 0) > int(st.get("lastSharedAtMs") or 0)
    is_manual = bool(force_now or manual_pending)

    if not target_gid:
        return {"success": True, "shouldSend": False, "reason": "NO_TARGET_GROUP", "state": st}

    if not is_manual:
        if not enabled:
            return {"success": True, "shouldSend": False, "reason": "AUTO_SHARE_DISABLED", "state": st}
        cur_min = now_wib.hour * 60 + now_wib.minute
        if not (start_h * 60 <= cur_min <= (end_h * 60 + 30)):
            return {
                "success": True,
                "shouldSend": False,
                "reason": f"OUTSIDE_SHARE_HOURS ({now_wib.strftime('%H:%M')} WIB; aktif {start_h:02d}:00-{end_h:02d}:30 WIB)",
                "state": st,
            }
        elapsed_ms = now_ms - int(st.get("lastSharedAtMs") or 0)
        if elapsed_ms < (interval_mins * 60 * 1000 - 15_000):
            rem_sec = int(((interval_mins * 60 * 1000) - elapsed_ms) / 1000)
            return {
                "success": True,
                "shouldSend": False,
                "reason": f"COOLDOWN ({rem_sec}s lagi)",
                "state": st,
            }

    # 1. Tarik seluruh artikel SUKO ready + punya foto HD dari CatalogArticle (1 query kilat ~100ms!)
    rows = turso_query(
        'SELECT sku, article, description, brand, dept, "categoryKey", "hargaNormal", "hargaPromo", '
        'diskon, "discountType", acara, "imageUrl", "articleTotalStok", "articleColors", '
        '"articleSizes", "articleHasPromo", "articlePromoLabel" '
        'FROM "CatalogArticle" '
        'WHERE "brandGroup" = \'SUKO\' AND "articleTotalStok" > 0 '
        'AND "imageUrl" IS NOT NULL AND "imageUrl" != \'\' '
        'ORDER BY "articleTotalStok" DESC LIMIT 850',
        (),
        timeout=4.5,
    )
    if not rows:
        return {"success": False, "shouldSend": False, "reason": "NO_SUKO_CATALOG_ROWS", "state": st}

    # 2. Ambil daftar artikel New Arrival sejati (0.2ms Primary Key B-Tree scan!)
    new_arrival_articles: set = set()
    try:
        na_rows = turso_query(
            'SELECT DISTINCT article FROM "Product" '
            'WHERE (UPPER(COALESCE(brand, \'\')) LIKE \'%SUKO%\' OR UPPER(COALESCE(dept, \'\')) LIKE \'%SUKO%\') '
            'AND stok > 0 AND article IS NOT NULL AND article != \'\' '
            'ORDER BY id DESC LIMIT 240',
            (),
            timeout=2.5,
        )
        for r in na_rows:
            a = str(r.get("article") or "").strip().upper()
            if a:
                new_arrival_articles.add(a)
    except Exception:
        pass

    recent_set = {str(x).strip().upper() for x in (st.get("recentArticles") or [])}
    start_cat_idx = int(st.get("nextCategoryIdx") or 0) % len(AUTO_SHARE_CATEGORIES)
    mode_idx = int(st.get("nextModeIdx") or 0) % len(SHARE_MODES)
    desired_mode = SHARE_MODES[mode_idx]

    chosen_row: Optional[Dict[str, Any]] = None
    chosen_cat_idx = start_cat_idx
    chosen_mode = desired_mode

    # Cari kategori giliran yang punya kandidat unik belum pernah di-share
    for offset in range(len(AUTO_SHARE_CATEGORIES)):
        c_idx = (start_cat_idx + offset) % len(AUTO_SHARE_CATEGORIES)
        cat_meta = AUTO_SHARE_CATEGORIES[c_idx]
        pool = [
            r for r in rows
            if _match_category(r, cat_meta["id"])
            and str(r.get("article") or "").strip().upper() not in recent_set
        ]
        if not pool:
            continue

        # Coba mode target dulu, bila kosong fallback ke kandidat terbaik kategori ini
        mode_pool = pool
        actual_mode = desired_mode
        if desired_mode == "PROMO":
            p_only = [r for r in pool if int(r.get("articleHasPromo") or 0) == 1]
            if p_only:
                mode_pool = p_only
            else:
                actual_mode = "NORMAL"
        elif desired_mode == "NEW_ARRIVAL":
            na_only = [r for r in pool if str(r.get("article") or "").strip().upper() in new_arrival_articles]
            if na_only:
                mode_pool = na_only
        elif desired_mode == "NORMAL":
            norm_only = [r for r in pool if int(r.get("articleHasPromo") or 0) == 0]
            if norm_only:
                mode_pool = norm_only
            else:
                actual_mode = "PROMO"

        scored = sorted(
            mode_pool,
            key=lambda r: _score_candidate(r, actual_mode, new_arrival_articles),
            reverse=True,
        )
        if scored:
            chosen_row = scored[0]
            chosen_cat_idx = c_idx
            chosen_mode = actual_mode
            break

    # Jika seluruh katalog sudah habis berputar -> reset recentArticles & pilih ulang!
    if not chosen_row and rows:
        recent_set.clear()
        st["recentArticles"] = []
        cat_meta = AUTO_SHARE_CATEGORIES[start_cat_idx]
        pool = [r for r in rows if _match_category(r, cat_meta["id"])] or rows
        chosen_row = max(pool, key=lambda r: _score_candidate(r, desired_mode, new_arrival_articles))
        chosen_cat_idx = start_cat_idx
        chosen_mode = "PROMO" if int(chosen_row.get("articleHasPromo") or 0) == 1 else desired_mode

    if not chosen_row:
        return {"success": False, "shouldSend": False, "reason": "NO_CANDIDATE_FOUND", "state": st}

    cat_meta = AUTO_SHARE_CATEGORIES[chosen_cat_idx]
    fallback_cap = _build_deterministic_boutique_caption(chosen_row, chosen_mode, cat_meta)
    caption, copy_engine = _polish_boutique_copy_with_ai(
        chosen_row, chosen_mode, cat_meta, fallback_cap, gemini_caller, cfg
    )

    art_code = str(chosen_row.get("article") or "").strip().upper()
    title = _prettify_product_title(str(chosen_row.get("description") or ""), art_code)
    img_url = str(chosen_row.get("imageUrl") or "").strip()

    # Ambil fallback foto dari varian artikel di tabel Product bila imageUrl utama error saat download
    fallback_images: List[str] = []
    try:
        img_rows = turso_query(
            'SELECT "imageUrl" FROM "Product" WHERE article = ? AND "imageUrl" IS NOT NULL AND "imageUrl" != \'\' LIMIT 4',
            (chosen_row.get("article"),),
            timeout=2.0,
        )
        for ir in img_rows:
            u = str(ir.get("imageUrl") or "").strip()
            if u and u != img_url and u not in fallback_images:
                fallback_images.append(u)
    except Exception:
        pass

    normal = float(chosen_row.get("hargaNormal") or 0)
    promo = float(chosen_row.get("hargaPromo") or 0)
    has_promo = bool(int(chosen_row.get("articleHasPromo") or 0))
    price_text = (
        _format_rp_compact(promo)
        if (has_promo and promo > 0 and (normal <= 0 or promo < normal))
        else (str(chosen_row.get("articlePromoLabel") or "") if has_promo and chosen_row.get("articlePromoLabel") else _format_rp_compact(normal))
    )

    hist_entry = {
        "id": f"sh_{now_ms}",
        "wibTime": now_wib.strftime("%d/%m %H:%M WIB"),
        "article": art_code,
        "sku": str(chosen_row.get("sku") or ""),
        "title": title,
        "categoryId": cat_meta["id"],
        "categoryLabel": cat_meta["label"],
        "shareType": chosen_mode,
        "priceText": price_text,
        "imageUrl": img_url,
        "targetGroupName": target_gname,
        "copyEngine": copy_engine,
        "isManual": is_manual,
    }

    if not dry_run:
        st["recentArticles"] = [art_code] + [a for a in (st.get("recentArticles") or []) if str(a).upper() != art_code]
        st["nextCategoryIdx"] = (chosen_cat_idx + 1) % len(AUTO_SHARE_CATEGORIES)
        st["nextModeIdx"] = (mode_idx + 1) % len(SHARE_MODES)
        st["lastSharedAtMs"] = now_ms
        st["todayDateWib"] = now_wib.strftime("%Y-%m-%d")
        st["todayCount"] = int(st.get("todayCount") or 0) + 1
        st["history"] = [hist_entry] + list(st.get("history") or [])
        save_auto_share_state(st, storage_write_bytes)

    return {
        "success": True,
        "shouldSend": True,
        "targetGroupId": target_gid,
        "targetGroupName": target_gname,
        "caption": caption,
        "imageUrl": img_url,
        "fallbackImages": fallback_images,
        "meta": hist_entry,
        "state": st,
    }


def get_auto_share_ui_summary(
    cfg: Dict[str, Any],
    storage_read_text: Callable[..., Optional[str]],
) -> Dict[str, Any]:
    st = load_auto_share_state(storage_read_text)
    next_cat = AUTO_SHARE_CATEGORIES[int(st.get("nextCategoryIdx") or 0) % len(AUTO_SHARE_CATEGORIES)]
    next_mode = SHARE_MODES[int(st.get("nextModeIdx") or 0) % len(SHARE_MODES)]
    return {
        "enabled": bool(cfg.get("autoShareEnabled", True)),
        "targetGroupId": str(cfg.get("autoShareTargetGroupId") or ""),
        "targetGroupName": str(cfg.get("autoShareTargetGroupName") or ""),
        "intervalMinutes": int(cfg.get("autoShareIntervalMinutes") or 10),
        "startHourWib": int(cfg.get("autoShareStartHourWib", 10)),
        "endHourWib": int(cfg.get("autoShareEndHourWib", 20)),
        "todayCount": int(st.get("todayCount") or 0),
        "lastSharedAtMs": int(st.get("lastSharedAtMs") or 0),
        "recentCount": len(st.get("recentArticles") or []),
        "nextCategory": next_cat,
        "nextMode": next_mode,
        "categories": AUTO_SHARE_CATEGORIES,
        "history": (st.get("history") or [])[:10],
    }
