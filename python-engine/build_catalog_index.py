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
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(line_buffering=True)

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
        "PAPERBAG", "CANVAS BAG", "STICKER", "STICKERS",
    ],
    "BEAUTY": [
        "BLUSH", "LIP", "LIPSTICK", "LIPTINT", "SERUM", "TONER",
        "CONCEALER", "MOISTURIZER", "SUNSCREEN", "POWDER", "BROW",
        "EYE CARE", "ACNE", "PEEL OFF MASK", "FACIAL", "SKINCARE",
        "PERFUME", "RETINOL",
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
        return f"ART::{raw_art}"
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

    if (
        "NAYOUNG" in d
        or "COSMETIC" in d
        or "LA TULIPE" in d
        or "LT PRO" in d
        or "SOMETHINC" in d
        or "AMATERASUN" in d
        or b == "ELFORMULA"
        or b == "FRAGRANCE"
        or CATEGORY_REGEX["BEAUTY"].search(combined)
    ):
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

    for cat in ("DRESS_ROK", "JAKET", "CELANA", "ATASAN"):
        if CATEGORY_REGEX[cat].search(title):
            return cat

    return "OTHER"


def is_promo_active(harga_normal: float, harga_promo: Optional[float], discount_type: Optional[str], to_date: Optional[str], now_ts: float) -> bool:
    if to_date:
        try:
            date_part = str(to_date).strip()[:10]
            dt = datetime.strptime(date_part, "%Y-%m-%d").replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)
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
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    load_dotenv(os.path.join(base_dir, ".env"))
    load_dotenv(os.path.join(base_dir, ".env.local"))
    load_dotenv(os.path.join(base_dir, ".env.production"))
    url = os.getenv("DIRECT_URL") or os.getenv("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL / DIRECT_URL tidak ditemukan di environment.")
    # Hapus parameter khusus PgBouncer jika pakai DIRECT/Session
    return url.split("?")[0] + "?sslmode=require" if "sslmode=" not in url else url.replace("&pgbouncer=true", "").replace("?pgbouncer=true&", "?").replace("?pgbouncer=true", "")


def build_and_verify_catalog() -> Dict[str, Any]:
    t0 = time.time()
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

            img = v[15]
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

    # Urutan resmi Facing Out: berfoto > berstok > jumlah stok > promo > abjad
    compiled.sort(
        key=lambda x: (
            0 if x["imageUrl"] else 1,
            0 if x["articleTotalStok"] > 0 else 1,
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

    return {
        "total_articles": len(compiled),
        "ignored_rows": ignored_count,
        "by_store": by_store,
        "elapsed_sec": round(elapsed, 2),
    }


if __name__ == "__main__":
    build_and_verify_catalog()
