"""
scrap_controller.py
=============================================================================
UNIVERSAL SCRAP CONTROLLER — MESIN PENJARING SKU & BARCODE ANTI-KAKU
("Python yang mikir, Vercel hanya display")

Menangani SELURUH format kode ritel nyata di SUKO, Mu+Ku, dan ZES:
1. SKU 8-digit Modulo-10 normal + SKU non-8-digit (7/9/10 digit) + SKU alfanumerik
2. Barcode internal EAN-13 (`234000...`) & Barcode Vendor EAN-13 (`899...`, `888...`, dll.)
3. QR Code & Barcode Alfanumerik unik konsinyasi/lokal (mis. `2663005FS`,
   `AN011809`, `TP010392`, `001.53121SH25M`, `1012410107656-28`, `041.111555.0109`)
4. Ekspansi tetangga universal (`expand_universal_neighbors`) — setiap 1 temuan baru
   di format APA PUN otomatis menghasilkan tetangga seri & variasi ukuran (`FS/S/M/L/XL/XXL/XS/OS`)!
=============================================================================
"""

import re
from collections import Counter, defaultdict
from typing import Any, Callable, Dict, Iterable, List, Optional, Set, Tuple

# Variasi suffix ukuran yang sering menempel di belakang kode QR/Barcode konsinyasi (contoh: 2663005FS -> S/M/L/XL)
COMMON_SIZE_SUFFIXES = ("FS", "OS", "ALL", "XS", "S", "M", "L", "XL", "XXL", "2XL", "3XL")
SIZE_SUFFIX_SET = set(COMMON_SIZE_SUFFIXES)

# Pola pemecah kode alfanumerik/QR menjadi (prefix, angka_inti, suffix)
# Contoh:
#   "2663005FS"        -> ("", "2663005", "FS")
#   "AN011809"         -> ("AN", "011809", "")
#   "001.53121SH25M"   -> ("001.53121SH", "25", "M") / juga pola angka terpanjang ("001.", "53121", "SH25M")
#   "1012410107656-28" -> ("1012410107656-", "28", "")
_ALNUM_CORE_RE = re.compile(r"^(.*?)(\d{3,10})([A-Za-z._\-/]*)$")
_NUMERIC_SIZE_RE = re.compile(r"^([A-Za-z0-9._\-/]+?)(\d{4,9})(FS|OS|ALL|XXS|XS|S|M|L|XL|XXL|2XL|3XL)$", re.IGNORECASE)


def normalize_flexible_code(raw: Any) -> Optional[str]:
    """
    Normalisasi kode SKU / Barcode / QR secara fleksibel (TIDAK kaku hanya angka!).
    Menerima panjang 3..40 karakter: angka, huruf, titik, strip, garis miring, underscore.
    """
    if raw is None:
        return None
    s = str(raw).strip()
    if not s or len(s) < 3 or len(s) > 40:
        return None
    up = s.upper()
    if up in ("NAN", "NONE", "NULL", "-", "--", "N/A", "NA", "0", "00", "000", "PRODUK BARU"):
        return None
    # Tolak teks kalimat panjang berspasi banyak (bukan kode barcode/QR)
    if s.count(" ") >= 2:
        return None
    return s


def classify_code_format(code: str) -> str:
    """Klasifikasi cepat format kode untuk strategi penyapuan adaptif."""
    c = code.strip()
    if len(c) == 13 and c.isdigit():
        return "mds_ean13" if c.startswith("234000") else "vendor_ean13"
    if len(c) == 8 and c.isdigit():
        return "sku8"
    if c.isdigit():
        return f"num_{len(c)}"
    if any(ch.isalpha() for ch in c) and any(ch.isdigit() for ch in c):
        return "alnum_qr"
    if any(ch in ".-_/" for ch in c) and any(ch.isdigit() for ch in c):
        return "delimited_code"
    return "other"


def extract_alnum_template(code: str) -> Optional[Tuple[str, int, int, str]]:
    """
    Memecah kode unik (seperti `2663005FS`, `AN011809`, `TP010392`, `001.53121SH25M`)
    menjadi `(prefix, numeric_value, zero_pad_width, suffix)`.
    """
    c = code.strip()
    if not c or len(c) < 4 or len(c) > 32:
        return None
    # Jangan perlakukan EAN-13 murni di sini (sudah ditangani generator EAN-13 ber-checkdigit)
    if len(c) == 13 and c.isdigit():
        return None

    m = _ALNUM_CORE_RE.match(c)
    if not m:
        return None
    prefix, digits, suffix = m.group(1), m.group(2), m.group(3)
    if not digits:
        return None
    try:
        val = int(digits)
    except ValueError:
        return None
    return (prefix, val, len(digits), suffix)


def expand_universal_neighbors(
    code: str,
    sku_val: Optional[str],
    is_new_article: bool,
    seen_bcs: Set[str],
    seen_skus: Set[str],
    calc_ean13_cd: Callable[[str], str],
    gen_mds_sku8: Callable[[int], Optional[str]],
) -> Tuple[List[str], List[str]]:
    """
    Generator tetangga UNIVERSAL saat scraper menemukan produk baru:
    - EAN-13 (`234000*` maupun vendor `899*`, `888*`, dll.) -> ekspansi ±check-digit
    - QR / Barcode Alfanumerik (`2663005FS`, `AN011809`, `001.53121SH25M`) -> ekspansi
      angka inti (±3..±10) + variasi suffix ukuran (`FS/S/M/L/XL/XXL/XS/OS`)!
    - Barcode angka non-13-digit (`1003759`, `01104121615`, `020908`) -> ekspansi angka ±4..±10!
    - SKU 8-digit Mod10 + SKU 7/9/10-digit + SKU alfanumerik -> ekspansi tetangga langsung!
    """
    out_bcs: List[str] = []
    out_skus: List[str] = []

    def add_bc(cand: Optional[str]) -> None:
        if cand and cand not in seen_bcs:
            seen_bcs.add(cand)
            out_bcs.append(cand)

    def add_sku(cand: Optional[str]) -> None:
        if cand and cand not in seen_skus:
            seen_skus.add(cand)
            out_skus.append(cand)

    if code:
        c = code.strip()
        if len(c) == 13 and c.isdigit():
            pfx6 = c[:6]
            base6 = int(c[6:12])
            span_lo, span_hi = (-3, 12) if is_new_article else (-1, 5)
            min_b = 1000 if pfx6 == "234000" else 0
            for nb6 in range(max(min_b, base6 + span_lo), min(999999, base6 + span_hi)):
                d12 = f"{pfx6}{nb6:06d}"
                add_bc(f"{d12}{calc_ean13_cd(d12)}")
        else:
            tpl = extract_alnum_template(c)
            if tpl:
                pfx, val, width, sfx = tpl
                span_lo, span_hi = (-3, 10) if is_new_article else (-2, 5)
                max_val = (10 ** width) - 1
                for nv in range(max(0, val + span_lo), min(max_val, val + span_hi) + 1):
                    if nv == val:
                        continue
                    add_bc(f"{pfx}{nv:0{width}d}{sfx}")
                # Jika suffix adalah kode ukuran (contoh: `2663005FS` atau `...M`), uji ukuran lain di kode yang sama!
                if sfx and sfx.upper() in SIZE_SUFFIX_SET:
                    for alt_sz in COMMON_SIZE_SUFFIXES:
                        if alt_sz != sfx.upper():
                            add_bc(f"{pfx}{val:0{width}d}{alt_sz}")
            elif _NUMERIC_SIZE_RE.match(c):
                m2 = _NUMERIC_SIZE_RE.match(c)
                if m2:
                    p1, d1, sz1 = m2.group(1), m2.group(2), m2.group(3)
                    for alt_sz in COMMON_SIZE_SUFFIXES:
                        if alt_sz != sz1.upper():
                            add_bc(f"{p1}{d1}{alt_sz}")

    if sku_val:
        s = sku_val.strip()
        if len(s) == 8 and s.isdigit():
            base7 = int(s[:7])
            span_sku = 12 if is_new_article else 6
            for nb7 in range(max(100000, base7 - span_sku), base7 + span_sku + 1):
                nb_sku = gen_mds_sku8(nb7)
                add_sku(nb_sku)
        elif len(s) in (6, 7, 9, 10) and s.isdigit():
            base_n = int(s)
            width = len(s)
            for d in range(-4, 5):
                if d != 0 and base_n + d > 0:
                    add_sku(f"{base_n + d:0{width}d}")
        else:
            tpl_s = extract_alnum_template(s)
            if tpl_s:
                pfx, val, width, sfx = tpl_s
                for d in range(-3, 5):
                    if d != 0 and val + d >= 0:
                        add_sku(f"{pfx}{val + d:0{width}d}{sfx}")

    return out_bcs, out_skus


def build_alnum_qr_candidate_queue(
    existing_barcodes: Set[str],
    catalog_by_sku: Dict[str, Dict[str, Any]],
    max_candidates: int = 12000,
) -> List[str]:
    """
    Membangun antrean kandidat khusus Barcode/QR Unik & Alfanumerik (`2663005FS`, `AN011809`,
    `TP010392`, kode 6-12 digit non-EAN13, kode bertitik/strip, & article-as-barcode)
    secara adaptif dari seluruh klaster nyata yang sudah ada di Turso Cloud.
    """
    candidates: List[str] = []
    seen: Set[str] = set(existing_barcodes)

    def push(cand: str) -> None:
        if cand and cand not in seen and len(candidates) < max_candidates:
            seen.add(cand)
            candidates.append(cand)

    # 1. Kelompokkan semua barcode non-EAN13 (alfanumerik, QR, angka 5-12 digit, kode bertitik/strip) per template
    #    Key = (prefix, width, suffix) -> sorted list of integer cores
    template_groups: Dict[Tuple[str, int, str], List[int]] = defaultdict(list)
    size_family_seeds: List[Tuple[str, int, int, str]] = []

    for bc in existing_barcodes:
        if not bc or (len(bc) == 13 and bc.isdigit()):
            continue
        tpl = extract_alnum_template(bc)
        if not tpl:
            continue
        pfx, val, width, sfx = tpl
        template_groups[(pfx, width, sfx)].append(val)
        if sfx and sfx.upper() in SIZE_SUFFIX_SET:
            size_family_seeds.append((pfx, val, width, sfx.upper()))

    # Prioritas 1A: Variasi ukuran untuk kode QR/barcode bersuffix ukuran (contoh: 2663005FS -> S/M/L/XL)
    for pfx, val, width, sfx_up in size_family_seeds:
        for alt_sz in COMMON_SIZE_SUFFIXES:
            if alt_sz != sfx_up:
                push(f"{pfx}{val:0{width}d}{alt_sz}")
        if len(candidates) >= max_candidates // 3:
            break

    # Prioritas 1B: Isi celah rapat & ujung klaster pada grup template yang aktif (>= 2 item sepola!)
    ranked_groups = sorted(template_groups.items(), key=lambda kv: -len(kv[1]))
    for (pfx, width, sfx), vals in ranked_groups:
        svals = sorted(set(vals))
        max_val = (10 ** width) - 1
        # Isi celah di antara 2 kode berdekatan (diff <= 40)
        for i in range(len(svals) - 1):
            diff = svals[i + 1] - svals[i]
            if 1 < diff <= 40:
                for nv in range(svals[i] + 1, svals[i + 1]):
                    push(f"{pfx}{nv:0{width}d}{sfx}")
        # Buka ujung kanan (+1..+8) dan kiri (-1..-4) untuk menangkap seri New Arrival konsinyasi!
        if len(svals) >= 2:
            tail = svals[-1]
            for d in range(1, 9):
                if tail + d <= max_val:
                    push(f"{pfx}{tail + d:0{width}d}{sfx}")
            head = svals[0]
            for d in range(1, 5):
                if head - d >= 0:
                    push(f"{pfx}{head - d:0{width}d}{sfx}")
        if len(candidates) >= (max_candidates * 4) // 5:
            break

    # Prioritas 1C: Article-as-QR/Barcode untuk SKU tanpa barcode yang punya kode artikel unik alfanumerik (mis. 2663005FS / AN011809)
    for sku, row in catalog_by_sku.items():
        if row.get("barcode"):
            continue
        art = str(row.get("article") or "").strip()
        if art and 5 <= len(art) <= 24 and " " not in art and any(ch.isdigit() for ch in art):
            push(art)
            # Coba juga gabungkan article + size pendek (FS / S / M / L / XL) bila size tersedia
            sz = str(row.get("size") or "").strip().upper()
            if sz in ("FREE SIZE", "FREESIZE", "ALL SIZE", "ALL"):
                push(f"{art}FS")
            elif sz in SIZE_SUFFIX_SET:
                push(f"{art}{sz}")
        if len(candidates) >= max_candidates:
            break

    return candidates


def build_adaptive_sku_census(
    existing_skus: Set[str],
    gen_mds_sku8: Callable[[int], Optional[str]],
    max_sparse: int = 8000,
) -> List[str]:
    """
    Membangun sensus SKU 8-digit Modulo-10 secara ADAPTIF lintas SELURUH blok aktif
    (SUKO, Mu+Ku, ZES, & konsinyasi baru — tidak lagi kaku hanya di 71xxxx-73xxxx!).
    """
    # Hitung kepadatan per blok 100.000 (mis. 13xxxxx, 26xxxxx, 34xxxxx, 53xxxxx, 66xxxxx, 71xxxxx-74xxxxx, 81xxxxx)
    block_counts: Counter = Counter()
    for s in existing_skus:
        if len(s) == 8 and s.isdigit():
            block_counts[int(s[:2])] += 1

    # Selalu ikutkan zona New Arrival & ZES/SUKO/Mu+Ku terbaru (71..74, 34..37, 26..29, 13..16, 81..89)
    priority_blocks = [72, 73, 71, 35, 34, 36, 26, 27, 13, 14, 15, 74]
    for blk, cnt in block_counts.most_common(25):
        if cnt >= 200 and blk not in priority_blocks:
            priority_blocks.append(blk)

    sparse_out: List[str] = []
    seen = set(existing_skus)
    per_block_budget = max(120, max_sparse // max(1, len(priority_blocks)))
    for blk in priority_blocks:
        start_b7 = blk * 100_000
        end_b7 = start_b7 + 99_999
        stride = max(80, 100_000 // per_block_budget)
        added = 0
        for b7 in range(start_b7, end_b7, stride):
            cand = gen_mds_sku8(b7)
            if cand and cand not in seen:
                seen.add(cand)
                sparse_out.append(cand)
                added += 1
                if added >= per_block_budget:
                    break
        if len(sparse_out) >= max_sparse:
            break
    return sparse_out
