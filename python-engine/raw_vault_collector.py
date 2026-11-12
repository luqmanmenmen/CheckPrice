"""
raw_vault_collector.py
=============================================================================
MESIN COLLECT-ALL -> AUDIT -> MASAK -> SYNC (PYTHON ENGINE)
Arsitektur: PYTHON (BACKEND) YANG MIKIR, VERCEL HANYA DISPLAY.

Prinsip Kerja ("Collect sebanyak-banyaknya dulu, baru diaudit & dimasak"):
1. COLLECT RAW (Lokal SQLite `python-engine/raw_vault.db` — 0 MB Kuota Supabase):
   - Menampung SEMUA produk mentah, SKU (7/8/9 digit maupun alfanumerik),
     SEMUA barcode (6-20 digit, EAN-8/12/13/14, maupun kode vendor alfanumerik
     seperti PCL..., FC..., AN..., ROL...), foto, harga, dan stok TANPA filter kaku.
   - Menghisap dari:
     a) PostgreSQL `Product` & `BarcodeAlias` eksisting
     b) Brankas lokal `mapped_sku_paths.json.gz`
     c) File Power Query lokal (`temp_*.csv` jika ada)
     d) Katalog Matahari.com (`/products.json` + hingga 450+ koleksi brand/kategori)
     e) Setiap respons mentah StoreHub MDS BISA dari `morning_full_sweep.py`
2. AUDIT & MASAK (`--audit`):
   - Memulihkan barcode yang terlewat / beda penulisan ke `Product.barcode` & `BarcodeAlias`
   - Mengidentifikasi artikel yang variannya (warna/size) masih pincang di DB
   - Menyaring & memasukkan batch terbersih (prioritas brand inti toko & pelengkap artikel)
     ke PostgreSQL Supabase dengan batas aman `< 440 MB` (di bawah kuota 500 MB)
   - Menyusun laporan audit (`python-engine/LAPORAN_AUDIT_KOLEKSI.md`)
   - Otomatis me-rebuild tabel `CatalogArticle`.
=============================================================================
"""

import gzip
import json
import os
import re
import sqlite3
import sys
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_catalog_index import (
    build_and_verify_catalog,
    is_ignored_product,
    resolve_db_url,
)

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(line_buffering=True)

ENGINE_DIR = os.path.dirname(os.path.abspath(__file__))
VAULT_DB_PATH = os.path.join(ENGINE_DIR, "raw_vault.db")
MAPPED_PATHS_PATH = os.path.join(ENGINE_DIR, "mapped_sku_paths.json.gz")
AUDIT_REPORT_PATH = os.path.join(ENGINE_DIR, "LAPORAN_AUDIT_KOLEKSI.md")

PLACEHOLDER_TOKENS = {"", "NAN", "NONE", "NULL", "-", "N/A", "NA", "0", "UNDEFINED"}


def normalize_sku_token(raw: Any) -> Optional[str]:
    """Bersihkan token SKU secara fleksibel (7/8/9+ digit atau alfanumerik 3-32 char)."""
    if raw is None:
        return None
    s = str(raw).strip()
    if s.endswith(".0") and s[:-2].isdigit():
        s = s[:-2]
    s = re.sub(r"\s+", "", s)
    if not s or len(s) < 3 or len(s) > 32:
        return None
    if s.upper() in PLACEHOLDER_TOKENS:
        return None
    return s


def normalize_barcode_token(raw: Any) -> Optional[str]:
    """
    Terima SEMUA jenis barcode valid tanpa terpaku panjang 12-13 digit:
    - EAN-8 (7-8 digit), UPC-12, EAN-13, ITF-14 (14-20 digit)
    - Vendor alphanumeric barcode (e.g. PCL00001713B_36, FC537003BU00L, AN011809)
    """
    if raw is None:
        return None
    s = str(raw).strip()
    if s.endswith(".0") and s[:-2].isdigit():
        s = s[:-2]
    s = re.sub(r"\s+", "", s)
    if not s or len(s) < 4 or len(s) > 32:
        return None
    if s.upper() in PLACEHOLDER_TOKENS:
        return None
    return s


def normalize_code_key(raw: str) -> str:
    """Kunci pencocokan fleksibel: huruf besar tanpa spasi, strip, underscore, titik, atau garis miring."""
    return re.sub(r"[\s\-_./]+", "", raw.strip()).upper()


def init_vault_db(db_path: str = VAULT_DB_PATH) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path, timeout=30)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS raw_items (
            source TEXT NOT NULL,
            source_key TEXT NOT NULL,
            sku TEXT NOT NULL,
            primary_barcode TEXT,
            all_barcodes_json TEXT,
            article TEXT,
            description TEXT,
            brand TEXT,
            dept TEXT,
            color TEXT,
            size TEXT,
            harga_normal REAL DEFAULT 0,
            harga_promo REAL,
            stok INTEGER DEFAULT 0,
            images_json TEXT,
            extra_json TEXT,
            collected_at TEXT NOT NULL,
            PRIMARY KEY (source, source_key)
        );
        CREATE INDEX IF NOT EXISTS idx_raw_items_sku ON raw_items(sku);
        CREATE INDEX IF NOT EXISTS idx_raw_items_article ON raw_items(article);
        CREATE INDEX IF NOT EXISTS idx_raw_items_brand ON raw_items(brand);

        CREATE TABLE IF NOT EXISTS raw_barcode_links (
            barcode TEXT NOT NULL,
            barcode_norm TEXT NOT NULL,
            sku TEXT NOT NULL,
            source TEXT NOT NULL,
            observed_at TEXT NOT NULL,
            PRIMARY KEY (barcode, sku)
        );
        CREATE INDEX IF NOT EXISTS idx_rbl_sku ON raw_barcode_links(sku);
        CREATE INDEX IF NOT EXISTS idx_rbl_norm ON raw_barcode_links(barcode_norm);

        CREATE TABLE IF NOT EXISTS raw_collections_state (
            handle TEXT PRIMARY KEY,
            products_count INTEGER DEFAULT 0,
            fetched_count INTEGER DEFAULT 0,
            last_fetched_at TEXT NOT NULL
        );
        """
    )
    conn.commit()
    return conn


def record_raw_items_batch(rows: List[Dict[str, Any]], source: str, db_path: str = VAULT_DB_PATH) -> int:
    """Menyimpan mentahan SKU & seluruh alias barcode secara aman ke Raw Vault lokal."""
    if not rows:
        return 0
    now_iso = datetime.now(timezone.utc).isoformat()
    conn = init_vault_db(db_path)
    cur = conn.cursor()

    item_tuples = []
    bc_tuples = []
    for r in rows:
        sku = normalize_sku_token(r.get("sku"))
        if not sku:
            continue
        raw_bcs: List[str] = []
        for cand in [r.get("barcode")] + list(r.get("alt_barcodes") or []):
            nbc = normalize_barcode_token(cand)
            if nbc and nbc != sku and nbc not in raw_bcs:
                raw_bcs.append(nbc)

        primary_bc = raw_bcs[0] if raw_bcs else None
        source_key = str(r.get("source_key") or sku)
        item_tuples.append((
            source,
            source_key,
            sku,
            primary_bc,
            json.dumps(raw_bcs),
            (str(r.get("article") or "").strip().upper() or None),
            str(r.get("description") or "").strip(),
            (str(r.get("brand") or "").strip().upper() or None),
            (str(r.get("dept") or "").strip().upper() or None),
            (str(r.get("color") or "").strip().upper() or None),
            (str(r.get("size") or "").strip().upper() or None),
            float(r.get("hargaNormal") or 0),
            float(r["hargaPromo"]) if r.get("hargaPromo") is not None else None,
            int(r.get("stok") or 0),
            json.dumps(r.get("images") or ([] if not r.get("imageUrl") else [r["imageUrl"]])),
            json.dumps(r.get("extra") or {}),
            now_iso,
        ))
        for bc in raw_bcs:
            bc_tuples.append((bc, normalize_code_key(bc), sku, source, now_iso))

    if item_tuples:
        cur.executemany(
            """
            INSERT OR REPLACE INTO raw_items (
                source, source_key, sku, primary_barcode, all_barcodes_json,
                article, description, brand, dept, color, size,
                harga_normal, harga_promo, stok, images_json, extra_json, collected_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            item_tuples,
        )
    if bc_tuples:
        cur.executemany(
            """
            INSERT OR REPLACE INTO raw_barcode_links (barcode, barcode_norm, sku, source, observed_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            bc_tuples,
        )
    conn.commit()
    conn.close()
    return len(item_tuples)


def connect_pg():
    """Koneksi PostgreSQL tangguh: prioritaskan Direct Session (5432) dengan statement_timeout 300s, fallback 6543."""
    import psycopg2
    from dotenv import load_dotenv

    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    load_dotenv(os.path.join(base_dir, ".env"))
    load_dotenv(os.path.join(base_dir, ".env.local"))
    candidates = []
    for key in ("DIRECT_URL", "DATABASE_URL"):
        raw = (os.getenv(key) or "").strip()
        if not raw:
            continue
        clean = raw.replace("&pgbouncer=true", "").replace("?pgbouncer=true&", "?").replace("?pgbouncer=true", "")
        if "sslmode=" not in clean:
            sep = "&" if "?" in clean else "?"
            clean = f"{clean}{sep}sslmode=require"
        if clean not in candidates:
            candidates.append(clean)
    if not candidates:
        candidates.append(resolve_db_url())

    last_err: Optional[Exception] = None
    for attempt in range(3):
        for dsn in candidates:
            try:
                conn = psycopg2.connect(dsn, connect_timeout=15)
                try:
                    c = conn.cursor()
                    c.execute("SET statement_timeout = 300000")
                    c.close()
                    conn.commit()
                except Exception:
                    conn.rollback()
                return conn
            except Exception as exc:
                last_err = exc
        time.sleep(1.5 * (attempt + 1))
    raise last_err or RuntimeError("Gagal terhubung ke PostgreSQL Supabase")


def collect_local_sources(
    conn_vault: sqlite3.Connection, include_csv: bool = False, full_pg: bool = False
) -> Dict[str, int]:
    """Kumpulkan seluruh data lokal + Postgres eksisting ke Raw Vault tanpa ada yang tercecer (delta kilat bila vault sudah terisi)."""
    stats = {"pg_products": 0, "pg_aliases": 0, "mapped_paths": 0, "pq_csv_rows": 0}
    now_iso = datetime.now(timezone.utc).isoformat()
    cur_v = conn_vault.cursor()

    # 1. PostgreSQL Product (Delta Index Scan via updatedAt jika vault sudah terisi, atau Keyset Chunking saat awal / --full-pg) & BarcodeAlias
    pg_conn = connect_pg()
    pg_cur = pg_conn.cursor()
    batch_items = []
    batch_links = []

    cur_v.execute("SELECT COUNT(*), MAX(collected_at) FROM raw_items WHERE source = 'POSTGRES_PRODUCT'")
    existing_pg_count, max_collected_iso = cur_v.fetchone()
    cur_v.execute("SELECT last_fetched_at FROM raw_collections_state WHERE handle = '__PG_PRODUCT_SYNC__'")
    sync_state_row = cur_v.fetchone()

    def _append_pg_row(row_tuple) -> str:
        sku, bc, art, desc, brand, dept, color, size, hn, hp, stok, img, src = row_tuple
        sku_c = normalize_sku_token(sku)
        if not sku_c:
            return sku
        bc_c = normalize_barcode_token(bc)
        img_list = [img] if img else []
        batch_items.append((
            "POSTGRES_PRODUCT",
            sku_c,
            sku_c,
            bc_c,
            json.dumps([bc_c] if bc_c else []),
            (str(art or "").strip().upper() or None),
            str(desc or "").strip(),
            (str(brand or "").strip().upper() or None),
            (str(dept or "").strip().upper() or None),
            (str(color or "").strip().upper() or None),
            (str(size or "").strip().upper() or None),
            float(hn or 0),
            float(hp) if hp is not None else None,
            int(stok or 0),
            json.dumps(img_list),
            json.dumps({"hargaNormalSource": src}),
            now_iso,
        ))
        if bc_c and bc_c != sku_c:
            batch_links.append((bc_c, normalize_code_key(bc_c), sku_c, "POSTGRES_PRODUCT", now_iso))
        return sku

    pg_cur.execute('SELECT MAX("updatedAt") FROM "Product"')
    pg_max_updated_dt = pg_cur.fetchone()[0]

    if not full_pg and (existing_pg_count or 0) >= 200000:
        since_str = (sync_state_row[0] if sync_state_row else None) or max_collected_iso
        try:
            since_dt = datetime.fromisoformat(str(since_str).replace("Z", "+00:00"))
        except Exception:
            since_dt = datetime.now(timezone.utc)
        from datetime import timedelta
        since_window = since_dt - timedelta(minutes=5)
        print(f"   ⚡ Delta Postgres sync sejak {since_window.isoformat()}...", flush=True)
        pg_cur.execute(
            '''
            SELECT sku, barcode, article, description, brand, dept, color, size,
                   "hargaNormal", "hargaPromo", stok, "imageUrl", "hargaNormalSource"
            FROM "Product"
            WHERE "updatedAt" >= %s
            ''',
            (since_window,),
        )
        for row in pg_cur.fetchall():
            _append_pg_row(row)
    else:
        last_sku: Optional[str] = None
        chunk_limit = 15000
        while True:
            if last_sku is None:
                pg_cur.execute(
                    '''
                    SELECT sku, barcode, article, description, brand, dept, color, size,
                           "hargaNormal", "hargaPromo", stok, "imageUrl", "hargaNormalSource"
                    FROM "Product"
                    ORDER BY sku ASC
                    LIMIT %s
                    ''',
                    (chunk_limit,),
                )
            else:
                pg_cur.execute(
                    '''
                    SELECT sku, barcode, article, description, brand, dept, color, size,
                           "hargaNormal", "hargaPromo", stok, "imageUrl", "hargaNormalSource"
                    FROM "Product"
                    WHERE sku > %s
                    ORDER BY sku ASC
                    LIMIT %s
                    ''',
                    (last_sku, chunk_limit),
                )
            rows_chunk = pg_cur.fetchall()
            if not rows_chunk:
                break
            for row in rows_chunk:
                last_sku = _append_pg_row(row)
            if len(rows_chunk) < chunk_limit:
                break

    try:
        pg_cur.execute('SELECT barcode, sku, source FROM "BarcodeAlias"')
        for bc, sku, src in pg_cur.fetchall():
            bc_c = normalize_barcode_token(bc)
            sku_c = normalize_sku_token(sku)
            if bc_c and sku_c:
                batch_links.append((bc_c, normalize_code_key(bc_c), sku_c, f"ALIAS:{src or 'DB'}", now_iso))
                stats["pg_aliases"] += 1
    except Exception:
        pg_conn.rollback()

    pg_cur.close()
    pg_conn.close()

    if batch_items:
        cur_v.executemany(
            """
            INSERT OR REPLACE INTO raw_items (
                source, source_key, sku, primary_barcode, all_barcodes_json,
                article, description, brand, dept, color, size,
                harga_normal, harga_promo, stok, images_json, extra_json, collected_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            batch_items,
        )
        stats["pg_products"] = len(batch_items)

    sync_ts = pg_max_updated_dt.isoformat() if pg_max_updated_dt else now_iso
    cur_v.execute(
        """
        INSERT OR REPLACE INTO raw_collections_state (handle, products_count, fetched_count, last_fetched_at)
        VALUES ('__PG_PRODUCT_SYNC__', ?, ?, ?)
        """,
        (max(int(existing_pg_count or 0), len(batch_items)), len(batch_items), sync_ts),
    )

    # 2. Local mapped_sku_paths.json.gz (pernah terbukti menyimpan barcode yang terlewat di DB)
    if os.path.exists(MAPPED_PATHS_PATH):
        try:
            with gzip.open(MAPPED_PATHS_PATH, "rt", encoding="utf-8") as gz:
                paths = json.load(gz)
            for x in paths:
                if not x:
                    continue
                s_c = normalize_sku_token(x[0])
                b_c = normalize_barcode_token(x[1]) if len(x) > 1 else None
                if s_c and b_c and b_c != s_c:
                    batch_links.append((b_c, normalize_code_key(b_c), s_c, "MAPPED_PATHS_GZ", now_iso))
                    stats["mapped_paths"] += 1
        except Exception as e:
            print(f"⚠️ Gagal membaca {MAPPED_PATHS_PATH}: {e}")

    # 3. Local Power Query CSVs (`temp_*.csv`) jika diminta (--include-csv)
    if include_csv:
        for fname in os.listdir(ENGINE_DIR):
            if fname.startswith("temp_") and fname.lower().endswith(".csv"):
                fpath = os.path.join(ENGINE_DIR, fname)
                try:
                    from parser import parse_pq_file
                    parsed_rows = parse_pq_file(fpath) or []
                    for pr in parsed_rows:
                        s_c = normalize_sku_token(pr.get("sku"))
                        b_c = normalize_barcode_token(pr.get("barcode"))
                        if s_c and b_c and b_c != s_c:
                            batch_links.append((b_c, normalize_code_key(b_c), s_c, f"PQ_CSV:{fname}", now_iso))
                            stats["pq_csv_rows"] += 1
                except Exception:
                    pass

    if batch_links:
        cur_v.executemany(
            """
            INSERT OR IGNORE INTO raw_barcode_links (barcode, barcode_norm, sku, source, observed_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            batch_links,
        )

    conn_vault.commit()
    return stats


def collect_matahari_deep(max_collections: int = 360) -> int:
    """
    Kumpulkan katalog Matahari.com seluas-luasnya langsung ke Raw Vault SQLite
    (tidak memakan kuota Supabase!) agar tidak ada artikel/varian yang terlewat.
    """
    from matahari_catalog_expander import (
        CORE_BRAND_KEYWORDS,
        TARGET_COLLECTION_KEYWORDS,
        extract_product_variants,
        shopify_get_json,
    )
    from concurrent.futures import ThreadPoolExecutor, as_completed

    print(f"🌐 [VAULT COLLECT] Mengumpulkan katalog global + hingga {max_collections} koleksi Matahari.com ke Raw Vault...")
    t0 = time.time()
    products_by_id: Dict[int, Dict[str, Any]] = {}

    def fetch_global_page(page: int) -> List[Dict[str, Any]]:
        data = shopify_get_json(f"https://matahari.com/products.json?limit=250&page={page}")
        return (data.get("products") or []) if data else []

    with ThreadPoolExecutor(max_workers=10) as ex:
        for items in ex.map(fetch_global_page, range(1, 101)):
            for p in items:
                pid = p.get("id")
                if pid:
                    products_by_id[pid] = p

    discovered: List[Tuple[str, int]] = []
    for page in range(1, 35):
        data = shopify_get_json(f"https://matahari.com/collections.json?limit=250&page={page}", timeout=15)
        cols = (data.get("collections") or []) if data else []
        if not cols:
            break
        for c in cols:
            h = str(c.get("handle") or "")
            if h:
                discovered.append((h, int(c.get("products_count") or 0)))
        time.sleep(0.08)

    selected: List[Tuple[str, int]] = []
    seen_h: Set[str] = set()
    discovered.sort(key=lambda x: x[1], reverse=True)
    for kw_group in (CORE_BRAND_KEYWORDS, TARGET_COLLECTION_KEYWORDS):
        for h, cnt in discovered:
            if h in seen_h or cnt <= 0:
                continue
            if any(kw in h.lower() for kw in kw_group):
                seen_h.add(h)
                selected.append((h, cnt))
            if len(selected) >= max_collections:
                break
        if len(selected) >= max_collections:
            break

    if len(selected) < max_collections:
        for h, cnt in discovered:
            if h not in seen_h and cnt > 0:
                seen_h.add(h)
                selected.append((h, cnt))
            if len(selected) >= max_collections:
                break

    def fetch_col(col: str) -> Tuple[str, List[Dict[str, Any]]]:
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
        return col, out

    conn_vault = init_vault_db()
    cur_v = conn_vault.cursor()
    now_iso = datetime.now(timezone.utc).isoformat()

    with ThreadPoolExecutor(max_workers=8) as ex:
        futures = [ex.submit(fetch_col, h) for h, _ in selected]
        for idx, fut in enumerate(as_completed(futures), 1):
            col_h, prods = fut.result()
            cur_v.execute(
                "INSERT OR REPLACE INTO raw_collections_state (handle, products_count, fetched_count, last_fetched_at) VALUES (?, ?, ?, ?)",
                (col_h, len(prods), len(prods), now_iso),
            )
            for p in prods:
                pid = p.get("id")
                if pid and pid not in products_by_id:
                    products_by_id[pid] = p
            if idx % 40 == 0 or idx == len(selected):
                print(f"   📦 Koleksi terkumpul: {idx}/{len(selected)} -> {len(products_by_id):,} artikel unik Shopify")
    conn_vault.commit()
    conn_vault.close()

    extracted_rows: List[Dict[str, Any]] = []
    seen_bcs: Set[str] = set()
    for p in products_by_id.values():
        extracted_rows.extend(extract_product_variants(p, seen_bcs, strict=False))

    stored = record_raw_items_batch(extracted_rows, source="MATAHARI_SHOPIFY")
    print(f"   ✅ [VAULT COLLECT] {stored:,} varian SKU mentah dari {len(products_by_id):,} artikel Shopify tersimpan di raw_vault.db ({time.time() - t0:.1f}s)")
    return stored


def audit_and_cook(
    push_to_supabase: bool = True,
    max_supabase_mb: float = 440.0,
    include_csv: bool = False,
    full_pg: bool = False,
) -> Dict[str, Any]:
    """
    Tahap AUDIT & MASAK:
    1. Gabungkan seluruh mentahan (Postgres + Mapped Paths + CSV lokal + Shopify + StoreHub).
    2. Sinkronkan barcode yang masih NULL di `Product` & masukkan multi-barcode/alias ekstra ke `BarcodeAlias`.
    3. Masukkan artikel/varian pelengkap yang paling dibutuhkan ke Supabase dalam batas kuota aman.
    4. Tulis laporan audit lengkap ke `LAPORAN_AUDIT_KOLEKSI.md`.
    """
    import psycopg2
    from psycopg2.extras import execute_values

    t0 = time.time()
    print("=" * 80)
    print("🧠 [AUDIT & COOK ENGINE] MENGGABUNGKAN & MEMASAK DATA DARI RAW VAULT")
    print("=" * 80)

    conn_vault = init_vault_db()
    local_stats = collect_local_sources(conn_vault, include_csv=include_csv, full_pg=full_pg)
    print(f"📥 Ingest ke Raw Vault -> {local_stats}")

    cur_v = conn_vault.cursor()
    cur_v.execute("SELECT COUNT(*), COUNT(DISTINCT sku) FROM raw_items")
    vault_rows, vault_skus = cur_v.fetchone()
    cur_v.execute("SELECT COUNT(*), COUNT(DISTINCT barcode), COUNT(DISTINCT sku) FROM raw_barcode_links")
    link_rows, link_distinct_bcs, link_distinct_skus = cur_v.fetchone()

    pg_conn = connect_pg()
    pg_cur = pg_conn.cursor()

    pg_cur.execute("SELECT pg_database_size(current_database())")
    db_mb = int(pg_cur.fetchone()[0] or 0) / (1024 * 1024)

    pg_sku_info: Dict[str, Tuple[Optional[str], str, Optional[str]]] = {}
    pg_used_barcodes: Set[str] = set()
    pg_articles: Set[str] = set()
    cur_v.execute("SELECT sku, primary_barcode, UPPER(COALESCE(article, '')), images_json FROM raw_items WHERE source = 'POSTGRES_PRODUCT'")
    for sku, bc, art, imgs_j in cur_v.fetchall():
        imgs = json.loads(imgs_j or "[]")
        img = imgs[0] if imgs else None
        pg_sku_info[sku] = (bc, art, img)
        if bc:
            pg_used_barcodes.add(bc)
        if art:
            pg_articles.add(art)

    pg_cur.execute('SELECT barcode FROM "BarcodeAlias"')
    pg_alias_bcs: Set[str] = {r[0] for r in pg_cur.fetchall()}

    # 1. Audit & recover missing Product.barcode + ALL BarcodeAlias entries
    cur_v.execute("SELECT barcode, barcode_norm, sku, source FROM raw_barcode_links")
    product_bc_patches: List[Tuple[str, str]] = []
    alias_upserts: List[Tuple[str, str, str, str]] = []
    multi_bc_skus: Dict[str, List[str]] = {}

    for bc, bc_norm, sku, src in cur_v.fetchall():
        multi_bc_skus.setdefault(sku, []).append(bc)
        is_primary_in_pg = False
        if sku in pg_sku_info:
            cur_bc, _, _ = pg_sku_info[sku]
            if not cur_bc and bc not in pg_used_barcodes:
                product_bc_patches.append((sku, bc))
                pg_used_barcodes.add(bc)
                pg_sku_info[sku] = (bc, pg_sku_info[sku][1], pg_sku_info[sku][2])
                is_primary_in_pg = True
            elif cur_bc == bc:
                is_primary_in_pg = True
        # Hanya simpan ke BarcodeAlias jika barcode sekunder/ekstra atau berbeda dari Product.barcode
        if bc not in pg_alias_bcs and not is_primary_in_pg:
            alias_upserts.append((bc, bc_norm, sku, src))
            pg_alias_bcs.add(bc)

    # 2. Cari varian hilang pada ARTIKEL EKSISTING terlebih dahulu, lalu artikel baru prioritas toko
    cur_v.execute(
        """
        SELECT sku, primary_barcode, article, description, brand, dept, color, size,
               harga_normal, images_json, stok, source
        FROM raw_items
        WHERE source != 'POSTGRES_PRODUCT'
        """
    )
    missing_for_existing_art: Dict[str, Tuple[Any, ...]] = {}
    missing_new_art: Dict[str, Tuple[Any, ...]] = {}
    priority_brands = {
        "SUKO", "ZES", "MUKU", "COLE", "NEVADA", "LITTLE M", "CONNEXION",
        "ST YVES", "DISNEY", "VOLO", "AOS", "BYRCH & CO", "MAXMURAH",
        "T-ZONE", "AMERICAN JEANS", "CARDINAL", "LOGO JEANS", "NAYOUNG",
    }

    for row in cur_v.fetchall():
        sku, bc, art, desc, brand, dept, color, size, hn, imgs_j, stok, src = row
        if sku in pg_sku_info or is_ignored_product(desc or "", art):
            continue
        imgs = json.loads(imgs_j or "[]")
        img_url = imgs[0] if imgs else None
        art_up = (art or "").upper()
        bc_clean = bc if (bc and bc not in pg_used_barcodes) else None
        if bc_clean:
            pg_used_barcodes.add(bc_clean)

        rec_tuple = (
            sku, bc_clean, art, desc or (art or sku), float(hn or 0),
            "RAW_VAULT_COOKED", brand or "MDS RETAIL", dept or "MDS RETAIL",
            color, size, img_url, imgs, int(stok or 0),
        )
        if art_up and art_up in pg_articles:
            missing_for_existing_art[sku] = rec_tuple
        else:
            missing_new_art[sku] = rec_tuple

    # Urutkan kandidat baru: lengkapi artikel pincang dulu, lalu brand inti toko
    prioritized_new = sorted(
        missing_new_art.values(),
        key=lambda x: (0 if (x[6] in priority_brands) else 1, 0 if x[10] else 1, x[6]),
    )
    to_insert = list(missing_for_existing_art.values()) + prioritized_new
    headroom_skus = max(0, int((max_supabase_mb - db_mb) * 900))
    if len(to_insert) > headroom_skus:
        to_insert = to_insert[:headroom_skus]

    pushed_skus = 0
    patched_bcs = 0
    pushed_aliases = 0
    now_dt = datetime.now(timezone.utc)

    if push_to_supabase:
        if product_bc_patches:
            for i in range(0, len(product_bc_patches), 2000):
                batch = product_bc_patches[i:i + 2000]
                execute_values(
                    pg_cur,
                    'UPDATE "Product" AS p SET barcode = v.bc, "updatedAt" = NOW() FROM (VALUES %s) AS v(sku, bc) WHERE p.sku = v.sku AND p.barcode IS NULL',
                    batch,
                    page_size=1000,
                )
                pg_conn.commit()
            patched_bcs = len(product_bc_patches)

        if alias_upserts:
            for i in range(0, len(alias_upserts), 2000):
                batch = [(b, bn, s, src, now_dt) for b, bn, s, src in alias_upserts[i:i + 2000]]
                execute_values(
                    pg_cur,
                    '''
                    INSERT INTO "BarcodeAlias" (barcode, "barcodeNorm", sku, source, "updatedAt")
                    VALUES %s
                    ON CONFLICT (barcode) DO UPDATE
                    SET "barcodeNorm" = EXCLUDED."barcodeNorm", sku = EXCLUDED.sku,
                        source = EXCLUDED.source, "updatedAt" = EXCLUDED."updatedAt"
                    ''',
                    batch,
                    page_size=1000,
                )
                pg_conn.commit()
            pushed_aliases = len(alias_upserts)

        if to_insert:
            for i in range(0, len(to_insert), 2000):
                batch = [r + (now_dt, now_dt) for r in to_insert[i:i + 2000]]
                execute_values(
                    pg_cur,
                    '''
                    INSERT INTO "Product" (
                        sku, barcode, article, description, "hargaNormal", "hargaNormalSource",
                        brand, dept, color, size, "imageUrl", images, stok, "updatedAt", "createdAt"
                    ) VALUES %s
                    ON CONFLICT (sku) DO NOTHING
                    ''',
                    batch,
                    page_size=1000,
                )
                pg_conn.commit()
                pushed_skus += len(batch)

    # Hitung statistik akhir dari snapshot vault/memori (bebas seq-scan 275k baris Postgres) & rebuild CatalogArticle bila perlu
    pg_total_skus = len(pg_sku_info) + pushed_skus
    pg_total_bcs = len(pg_used_barcodes)
    pg_total_imgs = sum(1 for v in pg_sku_info.values() if v[2]) + sum(1 for r in to_insert[:pushed_skus] if r[10])
    pg_total_aliases = len(pg_alias_bcs)
    pg_cur.execute("SELECT pg_size_pretty(pg_database_size(current_database()))")
    db_size_pretty = pg_cur.fetchone()[0]

    pg_cur.close()
    pg_conn.close()
    conn_vault.close()

    if push_to_supabase and (pushed_skus > 0 or patched_bcs > 0):
        print("🧠 [TAHAP AKHIR] Rebuild CatalogArticle setelah masak data...")
        build_and_verify_catalog()

    multi_bc_count = sum(1 for v in multi_bc_skus.values() if len(v) > 1)
    summary = {
        "vault_raw_rows": vault_rows,
        "vault_unique_skus": vault_skus,
        "vault_barcode_links": link_rows,
        "multi_barcode_skus": multi_bc_count,
        "patched_product_barcodes": patched_bcs,
        "pushed_aliases": pushed_aliases,
        "pushed_missing_variant_skus": pushed_skus,
        "pg_total_skus": pg_total_skus,
        "pg_total_barcodes": pg_total_bcs,
        "pg_total_aliases": pg_total_aliases,
        "pg_total_images": pg_total_imgs,
        "db_size": db_size_pretty,
        "elapsed_sec": round(time.time() - t0, 1),
    }

    report = f"""# Laporan Audit & Pengolahan Raw Vault (Collect-Audit-Cook)

- **Waktu Audit:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
- **Isi Raw Vault Lokal (`raw_vault.db`):** {vault_rows:,} baris mentah | {vault_skus:,} SKU unik | {link_distinct_bcs:,} barcode unik tertaut ke {link_distinct_skus:,} SKU
- **SKU dengan Multi-Barcode (>1 barcode per SKU):** {multi_bc_count:,} SKU
- **Pemulihan & Sinkronisasi ke Supabase:**
  - Barcode `Product` dipulihkan dari vault/mapping: **+{patched_bcs:,}**
  - Alias multi-barcode tersimpan di `BarcodeAlias`: **+{pushed_aliases:,}** *(Total aktif: {pg_total_aliases:,})*
  - Varian/Artikel hilang dimasak ke `Product`: **+{pushed_skus:,} SKU** *(sisa antrean non-inti tertahan aman bila mendekati kuota DB)*
- **Kondisi Akhir Database Supabase:** {pg_total_skus:,} SKU | {pg_total_bcs:,} Barcode Utama | {pg_total_aliases:,} BarcodeAlias | {pg_total_imgs:,} Foto | Ukuran DB **{db_size_pretty}**
"""
    with open(AUDIT_REPORT_PATH, "w", encoding="utf-8") as f:
        f.write(report)

    print(f"🎉 [AUDIT & COOK SELESAI dalam {summary['elapsed_sec']}s] -> {summary}")
    return summary


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Raw Vault Collector & Audit/Cook Engine")
    parser.add_argument("--collect-web", action="store_true", help="Sedot katalog luas Matahari.com ke raw_vault.db")
    parser.add_argument("--max-collections", type=int, default=360, help="Jumlah koleksi Matahari.com yang disedot ke vault")
    parser.add_argument("--audit", action="store_true", help="Audit & masak seluruh raw_vault.db lalu sinkron ke Supabase")
    parser.add_argument("--dry-run", action="store_true", help="Audit tanpa menulis ke Supabase")
    parser.add_argument("--include-csv", action="store_true", help="Ikut mem-parse temp_*.csv Power Query lokal")
    parser.add_argument("--full-pg", action="store_true", help="Paksa tarik ulang penuh 275k+ baris Product dari Supabase")
    args = parser.parse_args()

    if args.collect_web:
        collect_matahari_deep(max_collections=args.max_collections)

    if args.audit or not args.collect_web:
        audit_and_cook(push_to_supabase=(not args.dry_run), include_csv=args.include_csv, full_pg=args.full_pg)
    else:
        conn_v = init_vault_db()
        collect_local_sources(conn_v, include_csv=args.include_csv, full_pg=args.full_pg)
        conn_v.close()
