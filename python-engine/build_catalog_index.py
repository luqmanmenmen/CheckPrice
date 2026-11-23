"""
build_catalog_index.py
=============================================================================
PYTHON CATALOG BRAIN ENGINE ("Python yang mikir, Vercel hanya display")
- Membaca seluruh 97.546+ SKU dari tabel PostgreSQL `Product`.
- Membuang SKU mati/dummy ("ITEM TIDAK DIGUNAKAN", "SKU DUMMY", "DUMMYZES").
- Menggabungkan SKU dengan `article` kosong / "0" / "-" per nama dasar produk
  (`DESC::brand::dept::baseDesc`) sehingga sepatu/baju yang sama (14 ukuran/warna)
  tidak pecah menjadi 14 kartu ganda di halaman 1, 2, 3!
- Memecah seluruh 24 label divisi ERP (`CHILDREN BOYS`, `MEN CONTEMP CASUAL`,
  `LADIES CONTEMP`, dll.) menjadi merk produk aslinya dari kolom `dept`.
- Mengklasifikasikan kategori dengan Word-Boundary RegExp (termasuk `BEAUTY`).
- Mengisi tabel pre-computed `CatalogArticle` secara atomik & memverifikasi
  bahwa paginasi per Brand (Mu+Ku) maupun per Kategori (SUKO/ZES) 0% dobel.

Jalankan mandiri:
  uv run --isolated --with psycopg2-binary --with python-dotenv python python-engine/build_catalog_index.py
=============================================================================
"""

import os
import re
import sys
import time
import urllib.parse
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(line_buffering=True)

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from image_quality_controller import is_junk_image_url  # noqa: E402

INVALID_ARTICLES = {"", "0", "-", "PRODUK BARU", "N/A", "NONE"}

ERP_DIVISION_AS_BRAND = {
    "CHILDREN BOYS",
    "CHILDREN GIRLS",
    "CHILDREN SHOES",
    "LADIES SHOES",
    "MEN SHOES",
    "ACTIVE SHOES",
    "MEN CONTEMP CASUAL",
    "MEN YOUNG CASUAL",
    "YOUNG FASHION",
    "LADIES CONTEMP",
    "T-SHIRT GRAPHIC",
    "INTIMATE",
    "INFANTS & ESSENTIALS",
    "MEN FORMAL",
    "MEN ESSENTIALS",
    "HANDBAGS",
    "ACCESSORIES",
    "TRAVEL",
    "HOME",
    "TOYS",
    "FRAGRANCE",
    "LOCAL BRAND",
    "STORE OPERATION",
    "CUSTOMER SERVICE",
}

LOW_PRIORITY_SUBBRANDS = {
    "LAINNYA",
    "DEFAULT",
    "MDS RETAIL",
    "INACTIVE BRAND",
    "STORE OPERATION",
    "CUSTOMER SERVICE",
    "PROMO MERCHANDISE",
    "PROMO MERCHANDISE DP",
    "GENERAL TOYS",
    "PLUSH TOYS",
    "TODDLER TOYS",
    "TOYS",
    "BOYS TOYS",
    "HOME LIVING",
    "HOME LIFESTYLE",
    "TEXTILE",
}

SIZE_RANK = {
    "XXS": 0, "XS": 1, "S": 2, "M": 3, "L": 4,
    "XL": 5, "XXL": 6, "XXXL": 7, "3XL": 8, "4XL": 9,
    "5XL": 10, "ALL SIZE": 11, "ALLSIZE": 12,
}

CATEGORY_KEYWORDS: Dict[str, List[str]] = {
    "JAKET": [
        "JAKET", "JACKET", "HOODIE", "HOODY", "SWEATER", "SWEATSHIRT",
        "CARDIGAN", "BLAZER", "OUTER", "OUTERWEAR", "BOMBER", "PARKA",
        "WINDBREAKER", "ROMPI", "VEST", "OVERSHIRT", "PULLOVER",
        "JUMPER", "COAT", "COACH",
    ],
    "CELANA": [
        "CELANA", "PANTS", "JEANS", "JOGGER", "CHINO", "KARGO", "CARGO",
        "TROUSER", "TROUSERS", "CULOTTE", "KULOT", "LEGGING",
        "SHORT PANT", "SHORT PANTS", "SHORTS", "DENIM LONG", "WIDE LEG",
    ],
    "SPORT": [
        "SPORT", "SPORTS", "ACTIVE", "ACTIVEWEAR", "GYM", "RUNNING",
        "YOGA", "FITNESS", "TRAINING", "TRACKPANT", "TRACKPANTS",
        "TRACKSUIT", "WORKOUT", "QUICK DRY", "QUICKDRY", "CLIMA TECH",
        "CLIMATECH", "JERSEY", "ATHLETIC", "JOGGING",
    ],
    "DRESS_ROK": [
        "DRESS", "SACKDRESS", "GAUN", "SKIRT", "ROK", "SKORT",
        "GAMIS", "KAFTAN", "ABAYA", "TUNIK", "TUNIC", "JUMPSUIT", "OVERALL",
    ],
    "ATASAN": [
        "T-SHIRT", "TSHIRT", "KAOS", "TEE", "KEMEJA", "SHIRT",
        "BLOUSE", "BLUS", "POLO", "TANK TOP", "ATASAN",
        "TURTLE NECK", "KNIT TOP", "WOVEN TOP", "TOP",
    ],
    "SEPATU_SANDAL": [
        "SHOES", "SEPATU", "SANDAL", "SANDALS", "SLIPPER",
        "FLIP FLOP", "FLIP FLOPS", "SLIDE", "BALLERINA", "MOCCASIN",
        "SNEAKER", "SNEAKERS", "BOOTS", "LOAFER", "LOAFERS",
        "WEDGE", "WEDGES", "HEELS", "MULES", "SLINGBACK",
        "SOCK", "SOCKS", "KAOS KAKI",
    ],
    "TAS_AKSESORIS": [
        "BAG", "SLINGBAG", "HANDBAG", "BACKPACK", "TOTE", "TOTEBAG",
        "RANSEL", "WALLET", "DOMPET", "TOPI", "CAP", "HAT",
        "BELT", "SABUK", "HAIR CLIP", "HAIRPIN", "HIJAB", "CIPUT",
        "MUG", "TUMBLER", "CUSHION", "DOLL", "PLUSH",
        "PAPERBAG", "CANVAS BAG", "STICKER", "STICKERS", "TOWEL", "HANDUK",
    ],
    "BEAUTY": [
        "BLUSH ON", "BLUSH VEIL", "FIT ME BLUSH", "PRESSED BLUSH",
        "TINT BLUSH", "CHEEK BLUSH", "COLORFIT BLUSH", "BLOOM BLUSH",
        "LIPSTICK", "LIPTINT", "LIP TINT", "LIP GLOSS", "LIPGLOSS",
        "GLOSS LIP", "LIQUID LIP", "LIP BALM", "LIPBALM", "LIP CREAM",
        "LIPCREAM", "LIP MATTE", "LIPMATTE", "LIP VELVET", "LIP SERUM",
        "LIP OIL", "LIP LINER", "EYEBROW", "BROW PENCIL", "BROW MASCARA",
        "BROWCARA", "BROW GEL", "MASCARA", "EYELINER", "EYESHADOW",
        "FOUNDATION", "SERUM", "TONER", "CONCEALER", "MOISTURIZER",
        "SUNSCREEN", "POWDER PUFF", "POWDER FOUNDATION", "COMPACT POWDER",
        "LOOSE POWDER", "BEDAK", "EYE CARE", "ACNE", "PEEL OFF MASK",
        "FACIAL", "SKINCARE", "PERFUME", "PERFUMERY", "EAU DE",
        "RETINOL", "MAKE-UP", "MAKEUP",
    ],
    "TIDUR_DALAM": [
        "SLEEPWEAR", "PAJAMA", "PAJAMAS", "PYJAMA", "PYJAMAS", "PIYAMA",
        "UNDERWEAR", "BOXER", "BRA", "BRALETTE", "PANTY", "BRIEF",
        "SINGLET", "CAMISOLE", "DASTER", "NIGHTGOWN", "BABYDOL",
    ],
}

CATEGORY_REGEX = {
    k: re.compile(
        r"(?<![A-Z0-9])(?:" + "|".join(re.escape(w) for w in words) + r")(?![A-Z0-9])",
        re.IGNORECASE,
    )
    for k, words in CATEGORY_KEYWORDS.items()
}


def is_ignored_product(desc: Optional[str], article: Optional[str]) -> bool:
    d = (desc or "").strip().upper()
    a = (article or "").strip().upper()
    return (
        "SKU DUMMY" in d
        or "ITEM TIDAK DIGUNAKAN" in d
        or "ITEM TIDAK DAPAT" in d
        or "TIDAK DI GUNAKAN" in d
        or "DUMMYZES" in d
        or "DUMMY" in a
    )


def get_article_group_key(
    article: Optional[str],
    desc: Optional[str],
    brand: Optional[str],
    dept: Optional[str],
    sku: str,
) -> str:
    raw_art = (article or "").strip().upper()
    if raw_art not in INVALID_ARTICLES:
        # Pisahkan kode artikel yang bertabrakan antar Toko (ZES/SUKO/MUKU) & Kategori (mis. THEA/JULIAN Sandal vs Cardigan)
        b_group = classify_brand_group(brand, dept)
        c_key = classify_product_category(brand, dept, desc)
        return f"ART::{b_group}::{c_key}::{raw_art}"
    base_desc = (desc or "").split(":")[0].strip().upper()
    if len(base_desc) >= 3:
        b_u = (brand or "").strip().upper()
        d_u = (dept or "").strip().upper()
        return f"DESC::{b_u}::{d_u}::{base_desc}"
    return f"SKU::{sku}"


def classify_brand_group(brand: Optional[str], dept: Optional[str]) -> str:
    b = (brand or "").upper()
    d = (dept or "").upper()
    if "SUKO" in b or "SUKO" in d:
        return "SUKO"
    if "ZES" in b or "ZES" in d:
        return "ZES"
    return "MUKU"


def get_normalized_sub_brand(
    brand: Optional[str],
    dept: Optional[str],
    article: Optional[str],
    desc: Optional[str],
) -> str:
    b = (brand or "").strip().upper()
    d = (dept or "").strip().upper()
    a = (article or "").strip().upper()
    title = (desc or "").strip().upper()

    if "MAXMURAH" in b or "MAXMURAH" in d:
        return "MAXMURAH"
    if "NAYOUNG" in d or "NA-YOUNG" in title or b == "ELFORMULA":
        return "NAYOUNG"
    if "BYRCH" in b or "BYRCH" in d:
        return "BYRCH & CO"
    if "ST YVES" in b or "SAINT YVES" in b or "ST YVES" in d or "SAINT YVES" in d:
        return "ST YVES"
    if "LITTLE M" in b or "LITTLE M" in d:
        return "LITTLE M"
    if (
        "MUKU" in b
        or "MUKU" in d
        or a.startswith("MK-")
        or "-MK" in a
        or "MUKU" in title
        or "MU+KU" in title
    ):
        return "MUKU"

    raw = b
    if not raw or raw in ERP_DIVISION_AS_BRAND:
        raw = d if (d and d not in {"MDS RETAIL", "DEFAULT", "INACTIVE BRAND"} and d not in ERP_DIVISION_AS_BRAND) else ""
    if not raw:
        if b == "TOYS" or d == "TOYS":
            return "GENERAL TOYS"
        if b == "INTIMATE" or d == "INTIMATE":
            return "LAINNYA"
        return "LAINNYA"

    if "NEVADA" in raw:
        return "NEVADA"
    if "CONNEXION" in raw:
        return "CONNEXION"
    if raw == "COLE" or raw.startswith("COLE "):
        return "COLE"
    if "DISNEY" in raw or raw == "THATS DONALD":
        return "DISNEY"
    if "SHE SENSE" in raw:
        return "SHE SENSE"
    if raw.startswith("CARDINAL"):
        return "CARDINAL"
    if raw.startswith("CROCODILE"):
        return "CROCODILE"
    if raw in {"KHA", "KHA BAG"}:
        return "KHA"
    if raw in {"EXIT", "EXITKIDS"}:
        return "EXIT"
    if raw.startswith("OSELLA"):
        return "OSELLA"
    if raw.startswith("ARROW"):
        return "ARROW"
    if raw.startswith("PIERRE CARDIN"):
        return "PIERRE CARDIN"
    if raw.startswith("LEVIS"):
        return "LEVIS"
    if raw in {"AOS MENS", "AOS LADIES"}:
        return "AOS"
    if raw in {"LICENSE ESS", "LICENSE BABY", "LICENSE"}:
        return "CHARACTER"
    if raw == "VOLO":
        return "VOLO"
    return raw


def classify_product_category(brand: Optional[str], dept: Optional[str], desc: Optional[str]) -> str:
    title = (desc or "").split(":")[0].upper()
    d = (dept or "").upper()
    b = (brand or "").upper()
    combined = f"{title} {d}"

    is_explicit_beauty = (
        "NAYOUNG" in d
        or "COSMETIC" in d
        or "MAKE-UP" in d
        or "MAKEUP" in d
        or "PERAWATAN KULIT" in d
        or "KECANTIKAN" in d
        or "PERFUM" in d
        or "LA TULIPE" in d
        or "LT PRO" in d
        or "SOMETHINC" in d
        or "AMATERASUN" in d
        or "DERMA ANGEL" in d
        or "MAYBELLINE" in d
        or "WARDAH" in d
        or "EMINA" in d
        or "MAKE OVER" in d
        or "LUXCRIME" in d
        or "L'OREAL" in d
        or "LANCOME" in d
        or "AVOSKIN" in d
        or "INSTAPERFECT" in d
        or "SILKYGIRL" in d
        or "HOLIKA HOLIKA" in d
        or "ROSSA BEAUTY" in d
        or "KAHF" in d
        or "SCENTALGIA" in d
        or "EVERSINCE" in d
        or "ROSE ALL DAY" in d
        or b == "ELFORMULA"
        or b == "FRAGRANCE"
    )
    is_non_beauty_dept = (
        "SUKO" in b
        or "SUKO" in d
        or "ZES" in b
        or "ZES" in d
        or "SLEEPWEAR" in d
        or "PAKAIAN DALAM" in d
        or "BAJU TIDUR" in d
        or "UNDERWEAR" in d
        or "INTIMATE" in d
        or "SHOES" in d
        or " FW" in d
        or d.endswith("FW")
        or "BAWAHAN" in d
        or "OUTERWEAR" in d
        or "KINTAKUN" in d
        or "KINTAKUN" in b
    )
    if is_explicit_beauty or (not is_non_beauty_dept and CATEGORY_REGEX["BEAUTY"].search(combined)):
        return "BEAUTY"

    if (
        "SLEEPWEAR" in d
        or "UNDERWEAR" in d
        or "INTIMATE" in d
        or b == "INTIMATE"
        or CATEGORY_REGEX["TIDUR_DALAM"].search(combined)
    ):
        return "TIDUR_DALAM"

    if (
        "SHOES" in d
        or "FW" in d
        or "SHOES" in b
        or CATEGORY_REGEX["SEPATU_SANDAL"].search(title)
    ):
        return "SEPATU_SANDAL"

    if (
        "BAG" in d
        or "ACCS" in d
        or "ACCESSOR" in d
        or "TOYS" in d
        or "HOME" in d
        or b in {"HANDBAGS", "TRAVEL", "ACCESSORIES"}
        or CATEGORY_REGEX["TAS_AKSESORIS"].search(title)
    ):
        return "TAS_AKSESORIS"

    if (
        "SPORT" in d
        or "ACTIVE" in d
        or "SPORT" in b
        or CATEGORY_REGEX["SPORT"].search(title)
    ):
        return "SPORT"

    for cat in ("DRESS_ROK", "JAKET", "CELANA", "ATASAN"):
        if CATEGORY_REGEX[cat].search(title):
            return cat

    return "OTHER"


WIB_TZ = timezone(timedelta(hours=7))


def is_promo_active(harga_normal: float, harga_promo: Optional[float], discount_type: Optional[str], to_date: Optional[str], now_ts: float) -> bool:
    if to_date:
        try:
            date_part = str(to_date).strip()[:10]
            dt = datetime.strptime(date_part, "%Y-%m-%d").replace(hour=23, minute=59, second=59, tzinfo=WIB_TZ)
            if now_ts > dt.timestamp():
                return False
        except Exception:
            pass
    return bool((harga_promo and harga_promo > 0 and harga_promo < (harga_normal or 0)) or discount_type)


def sort_size_key(sz: str) -> Tuple[int, float, str]:
    u = sz.upper()
    if u in SIZE_RANK:
        return (0, float(SIZE_RANK[u]), u)
    try:
        return (1, float(sz), u)
    except ValueError:
        return (2, 0.0, u)


def resolve_db_url() -> str:
    from dotenv import load_dotenv

    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    load_dotenv(os.path.join(base_dir, ".env"))
    load_dotenv(os.path.join(base_dir, ".env.local"))
    load_dotenv(os.path.join(base_dir, ".env.production"))
    raw = os.getenv("DATABASE_URL") or os.getenv("DIRECT_URL")
    if not raw:
        raise RuntimeError("DATABASE_URL / DIRECT_URL tidak ditemukan di environment.")
    parsed = urllib.parse.urlparse(raw)
    qs = urllib.parse.parse_qs(parsed.query)
    for k in ("pgbouncer", "connection_limit", "pool_timeout"):
        qs.pop(k, None)
    return urllib.parse.urlunparse(parsed._replace(query=urllib.parse.urlencode(qs, doseq=True)))


def build_and_verify_catalog(stock_only: bool = False, upload_snapshot: bool = True) -> Dict[str, Any]:
    from turso_db import connect_turso, is_turso_configured

    t0 = time.time()
    use_turso = is_turso_configured()
    if use_turso:
        conn = connect_turso(timeout=90)
        cur = conn.cursor()
        raw_rows = []
        last_id = 0
        while True:
            cur.execute(
                '''
                SELECT id, sku, barcode, article, description, brand, dept, color, size,
                       stok, "hargaNormal", "hargaPromo", diskon, "discountType",
                       acara, "toDate", "imageUrl"
                FROM "Product"
                WHERE id > ?
                ORDER BY id ASC
                LIMIT 20000
                ''',
                (last_id,),
            )
            batch = cur.fetchall()
            if not batch:
                break
            raw_rows.extend([r[1:] for r in batch])
            last_id = int(batch[-1][0])
        print(f"[PYTHON-CATALOG] Memuat {len(raw_rows):,} SKU mentah dari Turso Cloud dalam {time.time() - t0:.2f}s")
    else:
        import psycopg2
        db_url = resolve_db_url()
        conn = psycopg2.connect(db_url)
        cur = conn.cursor()
        cur.execute(
            '''
            SELECT sku, barcode, article, description, brand, dept, color, size,
                   stok, "hargaNormal", "hargaPromo", diskon, "discountType",
                   acara, "toDate", "imageUrl"
            FROM "Product"
            '''
        )
        raw_rows = cur.fetchall()
        print(f"[PYTHON-CATALOG] Memuat {len(raw_rows):,} SKU mentah dari PostgreSQL dalam {time.time() - t0:.2f}s")

    now_ts = time.time()
    groups: Dict[str, List[Tuple[Any, ...]]] = {}
    ignored_count = 0

    for row in raw_rows:
        sku, _bc, article, desc, brand, dept = row[0], row[1], row[2], row[3], row[4], row[5]
        if is_ignored_product(desc, article):
            ignored_count += 1
            continue
        key = get_article_group_key(article, desc, brand, dept, sku)
        groups.setdefault(key, []).append(row)

    compiled: List[Dict[str, Any]] = []
    for key, variants in groups.items():
        # Pilih perwakilan terbaik: berfoto > promo aktif > stok terbanyak
        best_score = None
        rep = variants[0]
        best_photo = None
        promo_rep = None
        colors = set()
        sizes = set()
        total_stok = 0

        for v in variants:
            # v = (sku, barcode, article, desc, brand, dept, color, size, stok, hNorm, hPromo, diskon, dType, acara, toDate, imageUrl)
            stok = max(0, int(v[8] or 0))
            total_stok += stok
            col = str(v[6] or "").strip()
            if col and col.upper() not in {"-", "SOLID"}:
                colors.add(col)
            sz = str(v[7] or "").strip()
            if sz and sz.upper() not in {"-", "SOLID"}:
                sizes.add(sz)

            raw_img = v[15]
            img = raw_img if (raw_img and not is_junk_image_url(raw_img)) else None
            if img and not best_photo:
                best_photo = img

            promo_ok = is_promo_active(float(v[9] or 0), float(v[10]) if v[10] is not None else None, v[12], v[14], now_ts)
            if promo_ok and not promo_rep:
                promo_rep = v

            score = (1 if img else 0, 1 if promo_ok else 0, int(v[8] or 0))
            if best_score is None or score > best_score:
                best_score = score
                rep = v

        sku, barcode, article, desc, brand, dept, color, size, stok, h_norm, h_promo, diskon, d_type, acara, to_date, img_url = rep
        if best_photo:
            img_url = best_photo

        has_promo = promo_rep is not None
        promo_label = None
        if promo_rep:
            h_promo = promo_rep[10] if promo_rep[10] is not None else h_promo
            d_type = promo_rep[12] or d_type
            diskon = promo_rep[11] or diskon
            acara = promo_rep[13] or acara
            to_date = promo_rep[14] or to_date
            dt_str = str(d_type or "").strip()
            dsk_str = str(diskon or "").strip()
            if dt_str:
                promo_label = dt_str
            elif dsk_str:
                promo_label = dsk_str
            elif h_promo and h_norm and float(h_norm) > float(h_promo):
                pct = round(((float(h_norm) - float(h_promo)) / float(h_norm)) * 100)
                promo_label = f"DISKON {pct}%" if pct >= 5 else "PROMO"
            else:
                promo_label = "PROMO"
        else:
            h_promo = None
            diskon = None
            d_type = None
            acara = None
            to_date = None

        b_group = classify_brand_group(brand, dept)
        sub_brand = get_normalized_sub_brand(brand, dept, article, desc)
        cat_key = classify_product_category(brand, dept, desc)

        compiled.append({
            "key": key,
            "sku": sku,
            "barcode": barcode,
            "article": article,
            "description": desc or "",
            "brand": brand,
            "dept": dept,
            "brandGroup": b_group,
            "subBrand": sub_brand,
            "categoryKey": cat_key,
            "color": color,
            "size": size,
            "stok": int(stok or 0),
            "hargaNormal": float(h_norm or 0),
            "hargaPromo": float(h_promo) if h_promo is not None else None,
            "diskon": diskon,
            "discountType": d_type,
            "acara": acara,
            "toDate": to_date,
            "imageUrl": img_url,
            "articleGroupCount": len(variants),
            "articleTotalStok": total_stok,
            "articleColors": sorted(colors),
            "articleSizes": sorted(sizes, key=sort_size_key),
            "articleHasPromo": has_promo,
            "articlePromoLabel": promo_label,
        })

    # Urutan resmi Facing Out: ADA STOK (>0) paling atas di Page 1 > berfoto > jumlah stok > promo > abjad
    compiled.sort(
        key=lambda x: (
            0 if x["articleTotalStok"] > 0 else 1,
            0 if x["imageUrl"] else 1,
            -x["articleTotalStok"],
            0 if x["articleHasPromo"] else 1,
            x["description"].upper(),
            x["key"],
        )
    )

    now_dt = datetime.now(timezone.utc)
    records = [
        (
            item["key"],
            item["sku"],
            item["barcode"],
            item["article"],
            item["description"],
            item["brand"],
            item["dept"],
            item["brandGroup"],
            item["subBrand"],
            item["categoryKey"],
            item["color"],
            item["size"],
            item["stok"],
            item["hargaNormal"],
            item["hargaPromo"],
            item["diskon"],
            item["discountType"],
            item["acara"],
            item["toDate"],
            item["imageUrl"],
            item["articleGroupCount"],
            item["articleTotalStok"],
            item["articleColors"],
            item["articleSizes"],
            item["articleHasPromo"],
            item["articlePromoLabel"],
            idx + 1,
            now_dt,
        )
        for idx, item in enumerate(compiled)
    ]

    # Verifikasi ketat di Python sebelum tulis ke DB
    fake_div_hits = [x["subBrand"] for x in compiled if x["subBrand"] in ERP_DIVISION_AS_BRAND]
    assert len(fake_div_hits) == 0, f"Ditemukan divisi nyasar sebagai brand: {set(fake_div_hits)}"
    assert len({x["key"] for x in compiled}) == len(compiled), "Terdapat key artikel duplikat!"

    if getattr(conn, "is_turso", False):
        # DELTA-ONLY SYNC UNTUK TURSO (Hemat ~98% kuota Rows Written vs DELETE ALL + INSERT 57k baris!)
        # Bandingkan isi CatalogArticle eksisting dan HANYA upsert baris yang benar-benar baru / berubah!
        existing_sig: Dict[str, Tuple[Any, ...]] = {}
        try:
            last_k = ""
            while True:
                cur.execute(
                    '''
                    SELECT key, sku, barcode, article, description, "brandGroup", "subBrand", "categoryKey",
                           stok, "hargaNormal", "hargaPromo", diskon, acara, "toDate", "imageUrl",
                           "articleGroupCount", "articleTotalStok", "articleHasPromo", "articlePromoLabel"
                    FROM "CatalogArticle"
                    WHERE key > ?
                    ORDER BY key ASC
                    LIMIT 20000
                    ''',
                    (last_k,),
                )
                ebatch = cur.fetchall()
                if not ebatch:
                    break
                for er in ebatch:
                    ek = str(er[0])
                    existing_sig[ek] = (
                        er[1], er[2], er[3], er[4], er[5], er[6], er[7],
                        int(er[8] or 0), float(er[9] or 0),
                        (float(er[10]) if er[10] is not None else None),
                        er[11], er[12], er[13], er[14],
                        int(er[15] or 1), int(er[16] or 0),
                        bool(er[17]), er[18],
                    )
                last_k = str(ebatch[-1][0])
        except Exception as diff_err:
            print(f"⚠️ Gagal membaca diff CatalogArticle eksisting ({diff_err}), fallback full upsert.")
            existing_sig = {}

        new_keys = set()
        changed_records = []
        for rec in records:
            rk = str(rec[0])
            new_keys.add(rk)
            sig = (
                rec[1], rec[2], rec[3], rec[4], rec[7], rec[8], rec[9],
                int(rec[12] or 0), float(rec[13] or 0),
                (float(rec[14]) if rec[14] is not None else None),
                rec[15], rec[17], rec[18], rec[19],
                int(rec[20] or 1), int(rec[21] or 0),
                bool(rec[24]), rec[25],
            )
            if existing_sig.get(rk) != sig:
                changed_records.append(rec)

        obsolete_keys = [k for k in existing_sig.keys() if k not in new_keys]
        cat_cols = [
            "key", "sku", "barcode", "article", "description", "brand", "dept",
            "brandGroup", "subBrand", "categoryKey", "color", "size", "stok",
            "hargaNormal", "hargaPromo", "diskon", "discountType", "acara", "toDate",
            "imageUrl", "articleGroupCount", "articleTotalStok",
            "articleColors", "articleSizes", "articleHasPromo", "articlePromoLabel",
            "sortRank", "updatedAt",
        ]
        if obsolete_keys:
            for i in range(0, len(obsolete_keys), 250):
                chunk_del = obsolete_keys[i : i + 250]
                ph = ", ".join(["?"] * len(chunk_del))
                cur.execute(f'DELETE FROM "CatalogArticle" WHERE key IN ({ph})', chunk_del)
        if changed_records:
            conn.bulk_insert_rows("CatalogArticle", cat_cols, changed_records, on_conflict="key", rows_per_stmt=180, stmts_per_http=4)
        print(
            f"💾 [TURSO DELTA CATALOG] Total={len(records):,} | Diperbarui={len(changed_records):,} | "
            f"Dihapus={len(obsolete_keys):,} | Hemat Write={len(records) - len(changed_records):,} baris!"
        )
    else:
        from psycopg2.extras import execute_values
        cur.execute('TRUNCATE TABLE "CatalogArticle"')
        execute_values(
            cur,
            '''
            INSERT INTO "CatalogArticle" (
                key, sku, barcode, article, description, brand, dept,
                "brandGroup", "subBrand", "categoryKey", color, size, stok,
                "hargaNormal", "hargaPromo", diskon, "discountType", acara, "toDate",
                "imageUrl", "articleGroupCount", "articleTotalStok",
                "articleColors", "articleSizes", "articleHasPromo", "articlePromoLabel",
                "sortRank", "updatedAt"
            ) VALUES %s
            ''',
            records,
            page_size=2000,
        )
    conn.commit()
    cur.close()
    conn.close()

    by_store = {"SUKO": 0, "MUKU": 0, "ZES": 0}
    muku_brands: Dict[str, Dict[str, int]] = {}
    for x in compiled:
        bg = x["brandGroup"]
        by_store[bg] = by_store.get(bg, 0) + 1
        if bg == "MUKU":
            sb = x["subBrand"]
            st = muku_brands.setdefault(sb, {"count": 0, "photo": 0})
            st["count"] += 1
            if x["imageUrl"]:
                st["photo"] += 1

    sorted_muku = sorted(
        muku_brands.items(),
        key=lambda kv: (
            1 if kv[0] in LOW_PRIORITY_SUBBRANDS else 0,
            0 if kv[1]["photo"] > 0 else 1,
            -kv[1]["count"],
            kv[0],
        ),
    )

    elapsed = time.time() - t0
    print(f"[PYTHON-CATALOG] Selesai membangun {len(compiled):,} CatalogArticle unik dalam {elapsed:.2f}s (dilewati/dummy: {ignored_count:,})")
    print(f"[PYTHON-CATALOG] Per Toko -> SUKO: {by_store['SUKO']:,} | Mu+Ku: {by_store['MUKU']:,} ({len(sorted_muku)} brand) | ZES: {by_store['ZES']:,}")
    print("[PYTHON-CATALOG] Page 1 Mu+Ku (Brand 1-8):", [(k, v["count"]) for k, v in sorted_muku[:8]])
    print("[PYTHON-CATALOG] Page 2 Mu+Ku (Brand 9-16):", [(k, v["count"]) for k, v in sorted_muku[8:16]])
    print("[PYTHON-CATALOG] Page 3 Mu+Ku (Brand 17-24):", [(k, v["count"]) for k, v in sorted_muku[16:24]])
    assert len(set(k for k, _ in sorted_muku[:24])) == min(24, len(sorted_muku)), "Brand Mu+Ku dobel!"

    snapshot_info: Optional[Dict[str, Any]] = None
    if upload_snapshot:
        try:
            from build_offline_snapshot import build_and_upload_offline_snapshot
            snapshot_info = build_and_upload_offline_snapshot(stock_only=stock_only)
        except Exception as snap_err:
            print(f"[PYTHON-CATALOG] Peringatan gagal unggah offline snapshot: {snap_err}")

    return {
        "total_articles": len(compiled),
        "ignored_rows": ignored_count,
        "by_store": by_store,
        "elapsed_sec": round(elapsed, 2),
        "snapshot": snapshot_info,
    }


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Build CatalogArticle index & compressed offline snapshot")
    parser.add_argument("--stock-only", action="store_true", help="Jangan naikkan catalogVersion")
    parser.add_argument("--no-snapshot", action="store_true", help="Lewati pembuatan snapshot .json.gz")
    args = parser.parse_args()
    build_and_verify_catalog(stock_only=args.stock_only, upload_snapshot=not args.no_snapshot)
