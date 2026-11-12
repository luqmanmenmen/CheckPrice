"""
matahari_catalog_expander.py
=============================================================================
MESIN EKSPANSI ARTIKEL & VARIAN LENGKAP DARI KATALOG MATAHARI.COM (24 JAM LIVE)
Arsitektur: PYTHON (BACKEND) YANG MIKIR, VERCEL HANYA DISPLAY.

Tujuan Utama:
1. Memperbanyak ARTIKEL PRODUK (bukan sekadar menambah SKU size acak) beserta
   seluruh varian Warna & Ukuran, Kode Artikel, Harga Normal, dan Foto Studio HD
   dari katalog live Matahari.com (`/products.json` + ratusan koleksi brand & kategori).
2. Melengkapi warna/size yang hilang pada artikel yang sudah ada di DB
   (contoh: artikel COLE `PSNYC01` baru punya 5 warna di DB, padahal punya 9 warna
   termasuk `NAVY BLUE` SKU `19543756`!).
3. 100% AMAN (Anti-Overwrite):
   - Jika SKU SUDAH ada di `Product`: TIDAK menimpa `stok`, `barcode`, `article`,
     `hargaNormal`, maupun `hargaPromo` toko; hanya melengkapi `imageUrl` & `images[]`
     bila masih kosong.
   - Jika SKU BELUM ada di `Product`: memasukkan produk baru lengkap, dengan `barcode`
     valid (atau `NULL` agar otomatis diprioritaskan tarik barcode EAN-13 dari
     StoreHub MDS BISA saat jam buka toko).
4. Setelah selesai, langsung memanggil `build_and_verify_catalog()` untuk memperbarui
   tabel `CatalogArticle` secara atomik.
=============================================================================
"""

import os
import re
import sys
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_catalog_index import (
    build_and_verify_catalog,
    is_ignored_product,
    resolve_db_url,
)
from raw_vault_collector import (
    normalize_barcode_token,
    normalize_sku_token,
    record_raw_items_batch,
)

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(line_buffering=True)

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}

http_session = requests.Session()
adapter = HTTPAdapter(
    pool_connections=48,
    pool_maxsize=48,
    max_retries=Retry(total=2, backoff_factor=0.3, status_forcelist=[429, 502, 503, 504]),
)
http_session.mount("https://", adapter)
http_session.mount("http://", adapter)

NON_PRODUCT_KEYWORDS = (
    "banner", "logo", "icon", "badge", "size", "chart", "panduan",
    "ukur", "placeholder", "default", "no-image", "no_image", "voucher",
    "header", "footer", "button", "bank", "payment", ".svg", ".gif",
)

VENDOR_NORMALIZATION = {
    "MXM": "MAXMURAH",
    "ST. YVES": "ST YVES",
    "ST.YVES": "ST YVES",
    "SAINT YVES": "ST YVES",
    "BYRCH": "BYRCH & CO",
    "MU+KU": "MUKU",
    "MU KU": "MUKU",
}

TARGET_COLLECTION_KEYWORDS = (
    "suko", "zes", "muku", "mu-ku", "cole", "nevada", "little-m",
    "connexion", "st-yves", "volo", "disney", "character", "marvel",
    "star-wars", "aos", "byrch", "cardinal", "crocodile", "details",
    "exit", "expand", "mxm", "maxmurah", "american-jeans", "nayoung",
    "minimal", "lois", "arjunaweda", "arjuna-weda", "eprise", "edition",
    "dust", "ninety", "logo-jeans", "t-zone", "fladeo", "yongki", "trisse",
    "pipa", "super-t", "stanley", "wanita", "pria", "anak", "sepatu",
    "tas-aksesoris", "pakaian", "new-arrivals", "bestseller", "promo",
)


def clean_img_url(src: str) -> str:
    if not src:
        return ""
    s = src.strip()
    if s.startswith("//"):
        s = f"https:{s}"
    if "cdn.shopify.com/s/files/1/0666/9212/0727/" not in s:
        return ""
    fn_lower = s.split("?")[0].split("/")[-1].lower()
    for bad in NON_PRODUCT_KEYWORDS:
        if bad in fn_lower:
            return ""
    return s


def parse_rupiah_int(raw_val: Any) -> int:
    if raw_val is None:
        return 0
    s = str(raw_val).strip()
    if not s:
        return 0
    # Shopify biasanya mengirim string desimal seperti "149900.00"
    main_part = s.split(".")[0]
    digits = re.sub(r"[^0-9]", "", main_part)
    try:
        return int(digits) if digits else 0
    except ValueError:
        return 0


def normalize_vendor(raw_vendor: str) -> str:
    v = re.sub(r"\s+", " ", (raw_vendor or "").strip().upper())
    return VENDOR_NORMALIZATION.get(v, v or "MDS RETAIL")


def extract_product_variants(
    prod: Dict[str, Any],
    existing_barcodes: Set[str],
    strict: bool = True,
) -> List[Dict[str, Any]]:
    """Mengekstrak 1 produk Shopify menjadi daftar record SKU siap masuk tabel Product / Raw Vault."""
    title_raw = re.sub(r"\s+", " ", str(prod.get("title") or "").strip())
    if not title_raw:
        return []
    title_upper = title_raw.upper()
    vendor_norm = normalize_vendor(str(prod.get("vendor") or ""))
    ptype_upper = re.sub(r"\s+", " ", str(prod.get("product_type") or "").strip().upper())
    dept_val = f"{vendor_norm} {ptype_upper}".strip() if (ptype_upper and ptype_upper not in vendor_norm) else vendor_norm
    if vendor_norm in ("SUKO", "ZES", "MUKU"):
        dept_val = vendor_norm if not ptype_upper else f"{vendor_norm} {ptype_upper}"

    body_html = str(prod.get("body_html") or "")
    art_match = re.search(r"Kode\s*Artikel\s*:\s*([^<\n\r]+)", body_html, re.IGNORECASE)
    article_val: Optional[str] = art_match.group(1).strip().upper() if art_match else None
    if article_val in ("", "0", "-", "N/A", "NONE"):
        article_val = None

    if strict and is_ignored_product(title_upper, article_val):
        return []

    images = prod.get("images") or []
    all_imgs: List[str] = []
    variant_id_to_imgs: Dict[int, List[str]] = {}
    filename_sku_to_imgs: Dict[str, List[str]] = {}

    for img in images:
        alt_text = str(img.get("alt") or "").lower()
        if any(bad in alt_text for bad in ("size", "chart", "panduan", "ukur", "banner", "logo")):
            continue
        cu = clean_img_url(str(img.get("src") or ""))
        if not cu:
            continue
        if cu not in all_imgs and len(all_imgs) < 6:
            all_imgs.append(cu)
        for vid in (img.get("variant_ids") or []):
            variant_id_to_imgs.setdefault(vid, []).append(cu)
        fn = cu.split("?")[0].split("/")[-1]
        for m in re.findall(r"(?<!\d)(\d{7,10})(?!\d)", fn):
            filename_sku_to_imgs.setdefault(m, []).append(cu)

    tags_raw = prod.get("tags")
    tags_list = [str(t).strip() for t in (tags_raw if isinstance(tags_raw, list) else str(tags_raw or "").split(",")) if str(t).strip()]

    results: List[Dict[str, Any]] = []
    for v in (prod.get("variants") or []):
        sku_raw = normalize_sku_token(v.get("sku"))
        raw_bc = normalize_barcode_token(v.get("barcode"))
        if not sku_raw:
            if strict:
                continue
            sku_raw = raw_bc or (f"SHP-{v.get('id')}" if v.get("id") else None)
            if not sku_raw:
                continue

        opt1 = str(v.get("option1") or "").strip()
        opt2 = str(v.get("option2") or "").strip()
        v_title = str(v.get("title") or "").strip()
        if not opt1 and "/" in v_title:
            parts = [p.strip() for p in v_title.split("/", 1)]
            opt1 = parts[0]
            if not opt2 and len(parts) > 1:
                opt2 = parts[1]

        color_val = opt1.upper() if opt1 and opt1.upper() not in ("DEFAULT TITLE", "-") else None
        size_val = opt2.upper() if opt2 and opt2.upper() not in ("DEFAULT TITLE", "-") else None

        price_val = parse_rupiah_int(v.get("price"))
        compare_val = parse_rupiah_int(v.get("compare_at_price"))
        harga_normal = compare_val if compare_val > price_val else (price_val or compare_val)

        # Terima SEMUA format barcode valid (4-32 char, angka maupun alfanumerik) tanpa dibuang
        bc_val: Optional[str] = None
        if raw_bc and raw_bc != sku_raw:
            if not strict or raw_bc not in existing_barcodes:
                bc_val = raw_bc
                existing_barcodes.add(raw_bc)

        # Pilih galeri gambar terbaik untuk varian/warna ini
        v_imgs: List[str] = []
        feat = v.get("featured_image")
        if isinstance(feat, dict) and feat.get("src"):
            fc = clean_img_url(str(feat["src"]))
            if fc:
                v_imgs.append(fc)
        for u in variant_id_to_imgs.get(v.get("id"), []):
            if u not in v_imgs:
                v_imgs.append(u)
        for u in filename_sku_to_imgs.get(sku_raw, []):
            if u not in v_imgs:
                v_imgs.append(u)
        for u in all_imgs:
            if u not in v_imgs and len(v_imgs) < 6:
                v_imgs.append(u)
        v_imgs = v_imgs[:6]

        desc_parts = [title_upper]
        if color_val:
            desc_parts.append(color_val)
        if size_val:
            desc_parts.append(size_val)
        desc_full = ":".join(desc_parts)

        results.append({
            "sku": sku_raw,
            "barcode": bc_val,
            "article": article_val,
            "description": desc_full,
            "brand": vendor_norm,
            "dept": dept_val[:80],
            "color": color_val,
            "size": size_val,
            "hargaNormal": float(harga_normal),
            "hargaPromo": float(price_val) if (compare_val > price_val > 0) else None,
            "imageUrl": v_imgs[0] if v_imgs else None,
            "images": v_imgs,
            "extra": {
                "handle": prod.get("handle"),
                "product_type": prod.get("product_type"),
                "tags": tags_list[:20],
                "variant_id": v.get("id"),
                "product_id": prod.get("id"),
                "option3": v.get("option3"),
                "grams": v.get("grams"),
            },
        })

    return results


CORE_BRAND_KEYWORDS = (
    "suko", "zes", "muku", "mu-ku", "cole", "nevada", "little-m",
    "connexion", "st-yves", "volo", "disney", "aos", "byrch",
    "cardinal", "crocodile", "details", "exit", "expand", "mxm",
    "maxmurah", "american-jeans", "nayoung", "minimal", "lois",
    "t-zone", "logo-jeans", "stanley", "trisse", "pipa", "super-t",
)


def shopify_get_json(url: str, timeout: int = 20, max_attempts: int = 5) -> Optional[Dict[str, Any]]:
    """Ambil JSON Shopify dengan retry & backoff otomatis saat HTTP 429/5xx."""
    for attempt in range(max_attempts):
        try:
            r = http_session.get(url, headers=HEADERS, timeout=timeout)
            if r.status_code == 200:
                return r.json()
            if r.status_code in (429, 500, 502, 503, 504):
                retry_after = r.headers.get("Retry-After")
                wait_s = float(retry_after) if retry_after and retry_after.replace(".", "", 1).isdigit() else (1.0 * (attempt + 1))
                time.sleep(min(wait_s, 6.0))
                continue
            return None
        except Exception:
            time.sleep(0.6 * (attempt + 1))
    return None


def fetch_global_products_25k() -> Dict[int, Dict[str, Any]]:
    print("🌐 [TAHAP 1] Menyedot 100 halaman Global `/products.json` Matahari.com (25.000 Artikel)...")
    t0 = time.time()
    products_by_id: Dict[int, Dict[str, Any]] = {}

    def fetch_page(page: int) -> List[Dict[str, Any]]:
        data = shopify_get_json(f"https://matahari.com/products.json?limit=250&page={page}")
        return (data.get("products") or []) if data else []

    with ThreadPoolExecutor(max_workers=10) as executor:
        for items in executor.map(fetch_page, range(1, 101)):
            for p in items:
                pid = p.get("id")
                if pid:
                    products_by_id[pid] = p

    print(f"   ✅ [TAHAP 1] Terkumpul {len(products_by_id):,} artikel unik dalam {time.time() - t0:.1f}s")
    return products_by_id


def fetch_target_collections(products_by_id: Dict[int, Dict[str, Any]], max_collections: int = 160) -> None:
    print("\n🏷️ [TAHAP 2] Memindai indeks koleksi brand & kategori Matahari.com (SUKO, COLE, NEVADA, ZES, dll.)...")
    t0 = time.time()

    # Ambil daftar koleksi secara berurutan agar bebas HTTP 429
    discovered: List[Tuple[str, int]] = []
    for page in range(1, 31):
        data = shopify_get_json(f"https://matahari.com/collections.json?limit=250&page={page}", timeout=15)
        cols = (data.get("collections") or []) if data else []
        if not cols:
            break
        for c in cols:
            h = str(c.get("handle") or "")
            if h:
                discovered.append((h, int(c.get("products_count") or 0)))
        time.sleep(0.1)

    selected: List[Tuple[str, int]] = []
    seen_h: Set[str] = set()
    must_handles = [
        "suko", "hp-brand-suko", "suko-men", "suko-wanita", "suko-kids",
        "zes", "cole", "cole-pria", "hp-brand-cole", "promo-hemat-maksimal-cole-pria",
        "nevada", "nevada-kids", "little-m", "lp-little-m-kids",
        "connexion", "st-yves", "volo", "disney", "aos", "byrch-co",
        "cardinal", "crocodile", "exit", "expand", "minimal", "details",
        "wanita", "pria", "anak", "new-arrivals",
    ]
    for h in must_handles:
        if h not in seen_h:
            seen_h.add(h)
            selected.append((h, 1000))

    discovered.sort(key=lambda x: x[1], reverse=True)
    # Tahap 2A: Pastikan semua koleksi brand inti (SUKO, COLE, NEVADA, dll.) masuk dulu
    for h, cnt in discovered:
        if h in seen_h or cnt <= 0:
            continue
        hl = h.lower()
        if any(kw in hl for kw in CORE_BRAND_KEYWORDS):
            seen_h.add(h)
            selected.append((h, cnt))
        if len(selected) >= max_collections:
            break

    # Tahap 2B: Lengkapi sisa kuota dengan koleksi kategori umum / besar
    if len(selected) < max_collections:
        for h, cnt in discovered:
            if h in seen_h or cnt <= 0:
                continue
            hl = h.lower()
            if any(kw in hl for kw in TARGET_COLLECTION_KEYWORDS) or cnt >= 800:
                seen_h.add(h)
                selected.append((h, cnt))
            if len(selected) >= max_collections:
                break

    print(f"   📌 Memindai {len(selected)} koleksi prioritas (dari {len(discovered):,} koleksi) dengan 8 Workers + Anti-429...")

    def fetch_col_products(col: str) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        for page in range(1, 45):
            data = shopify_get_json(f"https://matahari.com/collections/{col}/products.json?limit=250&page={page}")
            if not data:
                break
            items = data.get("products") or []
            if not items:
                break
            out.extend(items)
            if len(items) < 250:
                break
        return out

    before = len(products_by_id)
    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = {executor.submit(fetch_col_products, h): h for h, _ in selected}
        for idx, fut in enumerate(as_completed(futures), 1):
            for p in fut.result():
                pid = p.get("id")
                if pid and pid not in products_by_id:
                    products_by_id[pid] = p
            if idx % 20 == 0 or idx == len(selected):
                print(
                    f"   📦 Koleksi dipindai: {idx}/{len(selected)} | "
                    f"Total Artikel Unik Matahari.com: {len(products_by_id):,} (+{len(products_by_id)-before:,} ekstra)"
                )

    print(f"   ✅ [TAHAP 2] Selesai dalam {time.time() - t0:.1f}s -> Total {len(products_by_id):,} artikel terkumpul!")


def execute_catalog_expansion(collections_only: bool = False, max_collections: int = 160):
    import psycopg2
    from psycopg2.extras import execute_values

    t_start = time.time()
    print("=" * 80)
    print("🚀 [CATALOG ARTICLE EXPANDER] PERBANYAK ARTIKEL & VARIAN LENGKAP DARI MATAHARI.COM")
    print("=" * 80)

    db_url = resolve_db_url()
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()

    cur.execute("SELECT pg_database_size(current_database())")
    db_bytes = int(cur.fetchone()[0] or 0)
    db_mb = db_bytes / (1024 * 1024)

    cur.execute('SELECT sku, barcode, "imageUrl" FROM "Product"')
    existing_skus: Set[str] = set()
    existing_skus_with_img: Set[str] = set()
    existing_barcodes: Set[str] = set()
    for sku, bc, img in cur.fetchall():
        if sku:
            existing_skus.add(sku)
            if img:
                existing_skus_with_img.add(sku)
        if bc:
            existing_barcodes.add(bc)

    cur.execute('SELECT DISTINCT UPPER(article) FROM "Product" WHERE article IS NOT NULL')
    existing_articles: Set[str] = {r[0] for r in cur.fetchall() if r[0]}

    print(
        f"📊 State Awal DB: {len(existing_skus):,} SKU | "
        f"{len(existing_articles):,} Kode Artikel unik | {len(existing_barcodes):,} Barcode | "
        f"Ukuran DB: {db_mb:.1f} MB"
    )

    if db_mb >= 440.0:
        print(f"⚠️ Ukuran DB ({db_mb:.1f} MB) mendekati batas 500 MB Supabase -> Skip insert masal untuk jaga kesehatan DB.")
        cur.close()
        conn.close()
        return

    products_by_id: Dict[int, Dict[str, Any]] = {} if collections_only else fetch_global_products_25k()
    fetch_target_collections(products_by_id, max_collections=max_collections)

    print("\n⚙️ [TAHAP 3] Mengekstrak artikel baru & varian warna/size yang hilang (Collect All ke Raw Vault)...")
    to_insert: Dict[str, Dict[str, Any]] = {}
    to_patch_img: Dict[str, Dict[str, Any]] = {}
    raw_vault_batch: Dict[str, Dict[str, Any]] = {}
    new_articles_found: Set[str] = set()
    brand_new_skus: Dict[str, int] = {}

    for prod in products_by_id.values():
        variants = extract_product_variants(prod, existing_barcodes, strict=True)
        for rec in variants:
            sku = rec["sku"]
            if sku not in raw_vault_batch:
                raw_vault_batch[sku] = rec
            if sku not in existing_skus:
                if sku not in to_insert:
                    to_insert[sku] = rec
                    art = (rec.get("article") or "").upper()
                    if art and art not in existing_articles:
                        new_articles_found.add(art)
                    b = rec["brand"]
                    brand_new_skus[b] = brand_new_skus.get(b, 0) + 1
            elif sku not in existing_skus_with_img and rec.get("imageUrl"):
                if sku not in to_patch_img:
                    to_patch_img[sku] = rec

    if raw_vault_batch:
        saved_raw = record_raw_items_batch(list(raw_vault_batch.values()), source="MATAHARI_SHOPIFY")
        print(f"   🗄️ [RAW VAULT] {saved_raw:,} varian mentah tersimpan utuh di python-engine/raw_vault.db")

    print(
        f"🎯 Hasil Ekstraksi Siap Simpan:\n"
        f"   👉 SKU Baru (Artikel Baru + Warna/Size Hilang) : +{len(to_insert):,} SKU\n"
        f"   👉 Kode Artikel Resmi Baru Terdeteksi          : +{len(new_articles_found):,} Artikel\n"
        f"   👉 Tambahan Foto Produk Lama Tanpa Gambar      : +{len(to_patch_img):,} SKU"
    )
    if brand_new_skus:
        top_b = sorted(brand_new_skus.items(), key=lambda x: x[1], reverse=True)[:15]
        print("   👉 Top Brand Tambahan SKU Baru:", top_b)

    now_dt = datetime.now(timezone.utc)

    # 1. Batch Insert SKU Baru dengan prioritas: lengkapi varian artikel eksisting -> brand inti toko
    insert_list = list(to_insert.values())
    priority_brands = {
        "SUKO", "ZES", "MUKU", "COLE", "NEVADA", "LITTLE M", "CONNEXION",
        "ST YVES", "DISNEY", "VOLO", "AOS", "BYRCH & CO", "MAXMURAH",
        "T-ZONE", "AMERICAN JEANS", "CARDINAL", "LOGO JEANS", "NAYOUNG",
    }
    insert_list.sort(
        key=lambda r: (
            0 if ((r.get("article") or "").upper() in existing_articles) else 1,
            0 if r["brand"] in priority_brands else 1,
            r["brand"],
        )
    )
    max_safe_insert = max(0, int((440.0 - db_mb) * 900))
    if len(insert_list) > max_safe_insert:
        print(
            f"   ⚖️ Memprioritaskan {max_safe_insert:,} SKU teratas (dari {len(insert_list):,}) "
            f"agar ukuran DB tetap aman di bawah kuota 500 MB Supabase."
        )
        insert_list = insert_list[:max_safe_insert]

    if insert_list:
        print(f"\n💾 [TAHAP 4A] Menyimpan {len(insert_list):,} SKU baru ke PostgreSQL (Batch Fast Insert)...")
        batch_size = 2000
        inserted_total = 0
        for i in range(0, len(insert_list), batch_size):
            batch = insert_list[i:i + batch_size]
            values = [
                (
                    r["sku"],
                    r["barcode"],
                    r["article"],
                    r["description"],
                    r["hargaNormal"],
                    "MATAHARI_WEB",
                    r["brand"],
                    r["dept"],
                    r["color"],
                    r["size"],
                    r["imageUrl"],
                    r["images"],
                    0,
                    now_dt,
                    now_dt,
                )
                for r in batch
            ]
            try:
                execute_values(
                    cur,
                    '''
                    INSERT INTO "Product" (
                        sku, barcode, article, description, "hargaNormal", "hargaNormalSource",
                        brand, dept, color, size, "imageUrl", images, stok, "updatedAt", "createdAt"
                    ) VALUES %s
                    ON CONFLICT (sku) DO NOTHING
                    ''',
                    values,
                    page_size=1000,
                )
                conn.commit()
                inserted_total += len(batch)
                print(f"   💾 Progress Insert: {inserted_total:,} / {len(insert_list):,} SKU...")
            except Exception as e:
                conn.rollback()
                # Fallback jika ada bentrok unique barcode
                safe_values = [
                    (
                        v[0], None, v[2], v[3], v[4], v[5], v[6], v[7],
                        v[8], v[9], v[10], v[11], v[12], v[13], v[14],
                    )
                    for v in values
                ]
                execute_values(
                    cur,
                    '''
                    INSERT INTO "Product" (
                        sku, barcode, article, description, "hargaNormal", "hargaNormalSource",
                        brand, dept, color, size, "imageUrl", images, stok, "updatedAt", "createdAt"
                    ) VALUES %s
                    ON CONFLICT (sku) DO NOTHING
                    ''',
                    safe_values,
                    page_size=1000,
                )
                conn.commit()
                inserted_total += len(batch)
                print(f"   💾 Progress Insert (Safe Barcode): {inserted_total:,} / {len(insert_list):,} SKU ({e})")

    # 2. Lengkapi foto produk lama yang masih kosong tanpa menimpa data stok/barcode/promo
    patch_list = list(to_patch_img.values())
    if patch_list:
        print(f"\n📸 [TAHAP 4B] Melengkapi foto studio untuk {len(patch_list):,} SKU lama tanpa gambar...")
        batch_size = 2000
        for i in range(0, len(patch_list), batch_size):
            batch = patch_list[i:i + batch_size]
            values = [(r["sku"], r["imageUrl"], r["images"], now_dt) for r in batch]
            execute_values(
                cur,
                '''
                UPDATE "Product" AS p
                SET "imageUrl" = COALESCE(p."imageUrl", v.img),
                    images = CASE WHEN array_length(p.images, 1) IS NULL OR array_length(p.images, 1) = 0 THEN v.imgs ELSE p.images END,
                    "updatedAt" = v.upd
                FROM (VALUES %s) AS v(sku, img, imgs, upd)
                WHERE p.sku = v.sku
                ''',
                values,
                page_size=1000,
            )
            conn.commit()

    # Catat ke SyncHistory
    try:
        cur.execute('SELECT id FROM "User" WHERE nik = \'22054178\' LIMIT 1')
        row_u = cur.fetchone()
        if not row_u:
            cur.execute('SELECT id FROM "User" LIMIT 1')
            row_u = cur.fetchone()
        if row_u:
            cur.execute(
                '''
                INSERT INTO "SyncHistory" (id, "userId", type, "fileName", status, records, "createdAt")
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ''',
                (
                    f"sync_{uuid.uuid4().hex[:20]}",
                    row_u[0],
                    "PHOTO_SYNC",
                    f"Ekspansi Artikel Matahari.com (+{len(insert_list):,} SKU, +{len(new_articles_found):,} Artikel)",
                    "SUCCESS",
                    len(insert_list) + len(patch_list),
                    now_dt,
                ),
            )
            conn.commit()
    except Exception as e:
        conn.rollback()
        print(f"⚠️ Gagal catat SyncHistory: {e}")

    cur.close()
    conn.close()

    # Rebuild CatalogArticle agar UI & /api/catalog-models langsung mutakhir
    print("\n🧠 [TAHAP 5] Menyusun ulang tabel CatalogArticle (Python Catalog Brain)...")
    stats = build_and_verify_catalog()

    print("\n" + "=" * 80)
    print(f"🎉 SELESAI EKSPANSI KATALOG dalam {time.time() - t_start:.1f} detik!")
    print(f"   • Total SKU Baru Ditambahkan : +{len(insert_list):,} SKU")
    print(f"   • Total Artikel Katalog Kini : {stats.get('total_articles', 0):,} Artikel")
    print(f"   • Rincian Toko               : {stats.get('brand_groups', {})}")
    print("=" * 80)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Matahari.com Catalog Article & Variant Expander")
    parser.add_argument("--collections-only", action="store_true", help="Lewati Tahap 1 (/products.json 25k) dan langsung pindai koleksi")
    parser.add_argument("--max-collections", type=int, default=160, help="Jumlah maksimal koleksi prioritas yang dipindai")
    args = parser.parse_args()
    execute_catalog_expansion(collections_only=args.collections_only, max_collections=args.max_collections)
