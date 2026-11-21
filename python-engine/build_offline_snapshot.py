"""
build_offline_snapshot.py
=============================================================================
PYTHON OFFLINE SNAPSHOT COMPILER ("Python yang mikir, Vercel hanya display")
- Mengompilasi seluruh Product (307k+ SKU), CatalogArticle (56k+ model), dan
  BarcodeAlias langsung dari PostgreSQL menjadi SATU berkas `.json.gz` ultra-ringan
  dengan encoding tuple + string dictionary (hemat ukuran ~85-90%).
- Mengunggah snapshot + manifest.json ke Supabase Storage CDN sehingga HP kasir
  cukup mengunduh 1 file (~7-11 MB) dalam hitungan detik alih-alih 50+ loop Prisma.
- Mode `--stock-only`: memperbarui stok di snapshot & `stockUpdatedAt` TANPA
  menaikkan `catalogVersion` atau menulis `CATALOG_BUNDLE` ke SyncHistory,
  sehingga HP kasir tidak menyalakan notif merah "UPDATE SEKARANG" saat update stok.

Penggunaan:
  python python-engine/build_offline_snapshot.py
  python python-engine/build_offline_snapshot.py --stock-only
=============================================================================
"""

import argparse
import gzip
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(line_buffering=True)


def _load_env_files() -> None:
    try:
        from dotenv import load_dotenv
        script_dir = Path(__file__).resolve().parent
        root_dir = script_dir.parent
        for env_path in (root_dir / ".env", root_dir / ".env.local", script_dir / ".env"):
            if env_path.exists():
                load_dotenv(env_path, override=False)
    except Exception:
        pass


def _clean_postgres_dsn(raw_url: str) -> str:
    parsed = urllib.parse.urlparse(raw_url)
    qs = urllib.parse.parse_qs(parsed.query)
    for key in ("pgbouncer", "connection_limit", "pool_timeout"):
        qs.pop(key, None)
    return urllib.parse.urlunparse(
        parsed._replace(query=urllib.parse.urlencode(qs, doseq=True))
    )


def _connect_postgres():
    _load_env_files()
    try:
        from turso_db import connect_turso, is_turso_configured
        if is_turso_configured():
            return connect_turso(timeout=90)
    except Exception:
        pass
    import psycopg2
    raw = os.environ.get("DATABASE_URL") or os.environ.get("DIRECT_URL") or ""
    if not raw:
        raise RuntimeError("TURSO_DATABASE_URL / DATABASE_URL belum tersedia di environment.")
    return psycopg2.connect(_clean_postgres_dsn(raw), connect_timeout=15)


def _supabase_credentials() -> Tuple[str, str]:
    """Kompatibilitas signature: penyimpanan kini 100% di Turso Cloud (0% Supabase)."""
    return "turso", "turso"


def _is_promo_expired(to_date: Optional[str], now_local_date: str) -> bool:
    if not to_date:
        return False
    s = str(to_date).strip()
    if not s:
        return False
    # Format umum ISO YYYY-MM-DD / YYYY-MM-DDTHH...
    date_part = s[:10]
    if len(date_part) == 10 and date_part[4] == "-" and date_part[7] == "-":
        return now_local_date > date_part
    return False


def _storage_upload(
    _unused_url: str,
    _unused_key: str,
    object_path: str,
    data: bytes,
    content_type: str,
    cache_control: str = "3600",
) -> str:
    from turso_db import storage_upload
    public_url, _chunks = storage_upload(object_path, data, content_type=content_type)
    return public_url


def _fetch_existing_manifest(_unused_url: str) -> Dict[str, Any]:
    from turso_db import storage_download_json
    return storage_download_json("offline-db/manifest.json")


def _cleanup_old_snapshots(_unused_url: str, _unused_key: str, keep_filenames: List[str]) -> None:
    from turso_db import storage_delete, storage_list
    try:
        items = storage_list("offline-db")
        keep_set = set(keep_filenames) | {"manifest.json"}
        to_remove = []
        for item in items:
            name = str(item.get("name") or "").strip()
            if name and name not in keep_set and (name.startswith("snapshot-") or name.startswith("_probe")):
                to_remove.append(f"offline-db/{name}")
        if to_remove:
            storage_delete(to_remove)
            print(f"[SNAPSHOT] Bersihkan {len(to_remove)} snapshot lama dari Turso Storage.")
    except Exception as ex:
        print(f"[SNAPSHOT] Skip cleanup snapshot lama: {ex}")


class DictInterner:
    """Mengganti string berulang (brand, dept, promo, tanggal, URL prefix) ke integer ID."""

    def __init__(self) -> None:
        self.items: List[str] = []
        self._map: Dict[str, int] = {}

    def intern(self, val: Optional[str]) -> int:
        if not val:
            return -1
        s = str(val).strip()
        if not s:
            return -1
        idx = self._map.get(s)
        if idx is None:
            idx = len(self.items)
            self._map[s] = idx
            self.items.append(s)
        return idx


IMG_SHOPIFY_PREFIX = "https://cdn.shopify.com/s/files/1/0666/9212/0727/"


def compute_catalog_hashes(
    catalog_entries: List[Tuple[str, str, Any, Optional[str], Optional[str], Optional[str], Optional[str]]],
) -> Tuple[str, str, int]:
    """
    Hitung sidik jari deterministik (SHA-256) HANYA untuk:
    1. `skuHash`: himpunan (sku, article) -> berubah ONLY jika ada produk baru / berubah SKU/artikel.
    2. `promoHash`: himpunan promo aktif (sku, hargaPromo, diskon, discountType, acara, toDate)
       -> berubah ONLY jika promo baru/berubah/kadaluarsa.
    Stok, imageUrl, sales, dan updatedAt SENGAJA diabaikan agar pergerakan stok 1 pcs
    atau update foto tidak menyalakan notif "UPDATE SEKARANG".
    """
    sku_set = sorted({
        (str(sku or "").strip(), str(article or "").strip())
        for (sku, article, *_rest) in catalog_entries
        if str(sku or "").strip()
    })
    promo_set = sorted({
        (
            str(sku or "").strip(),
            float(h_promo_val) if h_promo_val is not None else None,
            str(diskon or "").strip(),
            str(d_type or "").strip(),
            str(acara or "").strip(),
            str(to_date or "").strip(),
        )
        for (sku, _article, h_promo_val, diskon, d_type, acara, to_date) in catalog_entries
        if str(sku or "").strip()
        and (
            (h_promo_val is not None and float(h_promo_val) > 0)
            or bool(str(diskon or "").strip())
            or bool(str(d_type or "").strip())
        )
    })

    sku_hash = hashlib.sha256(
        json.dumps(sku_set, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    ).hexdigest()
    promo_hash = hashlib.sha256(
        json.dumps(promo_set, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    ).hexdigest()
    return sku_hash, promo_hash, len(promo_set)


def decide_catalog_version_bump(
    now_ms: int,
    existing_manifest: Dict[str, Any],
    sku_hash: str,
    promo_hash: str,
    stock_only: bool,
) -> Tuple[int, bool, str]:
    """Tentukan apakah catalogVersion wajib naik ("UPDATE SEKARANG") atau tetap."""
    raw_prev_ver = existing_manifest.get("catalogVersion")
    prev_ver = int(raw_prev_ver) if raw_prev_ver else 0
    prev_sku_hash = existing_manifest.get("skuHash")
    prev_promo_hash = existing_manifest.get("promoHash")

    if stock_only:
        return (prev_ver if prev_ver > 0 else now_ms, False, "STOCK_ONLY")

    if prev_ver <= 0:
        return (now_ms, True, "INITIAL")

    # Migrasi pertama dari manifest lama yang belum memiliki skuHash/promoHash:
    # simpan hash tanpa menaikkan catalogVersion agar tidak muncul notif palsu.
    if not prev_sku_hash or not prev_promo_hash:
        return (prev_ver, False, "SEED_HASHES")

    sku_changed = sku_hash != prev_sku_hash
    promo_changed = promo_hash != prev_promo_hash

    if sku_changed and promo_changed:
        return (now_ms, True, "NEW_PRODUCT_AND_PROMO")
    if sku_changed:
        return (now_ms, True, "NEW_PRODUCT")
    if promo_changed:
        return (now_ms, True, "PROMO_CHANGED")
    return (prev_ver, False, "NONE")


def build_and_upload_offline_snapshot(stock_only: bool = False) -> Dict[str, Any]:
    _load_env_files()
    t0 = time.time()
    supa_url, supa_key = _supabase_credentials()
    existing_manifest = _fetch_existing_manifest(supa_url)

    conn = _connect_postgres()
    cur = conn.cursor()

    now_utc = datetime.now(timezone.utc)
    now_wib_date = datetime.fromtimestamp(time.time() + 7 * 3600, tz=timezone.utc).strftime("%Y-%m-%d")
    now_ms = int(now_utc.timestamp() * 1000)
    bundle_revision = now_ms

    brands_dict = DictInterner()
    depts_dict = DictInterner()
    discounts_dict = DictInterner()
    discount_types_dict = DictInterner()
    acaras_dict = DictInterner()
    to_dates_dict = DictInterner()
    bg_dict = DictInterner()
    sb_dict = DictInterner()
    cat_dict = DictInterner()

    def encode_img(url: Optional[str]) -> Optional[str]:
        if not url:
            return None
        s = str(url).strip()
        if not s:
            return None
        if s.startswith(IMG_SHOPIFY_PREFIX):
            return "~" + s[len(IMG_SHOPIFY_PREFIX):]
        return s

    print("[SNAPSHOT] Membaca tabel Product dari Database (chunk PK id)...")
    prod_rows = []
    last_id = 0
    chunk_limit = 20000 if getattr(conn, "is_turso", False) else 50000
    while True:
        cur.execute(
            f'''
            SELECT
                id, sku, barcode, article, description, brand, dept, color, size,
                "hargaNormal", "hargaPromo", diskon, "discountType", acara,
                stok, "toDate", "imageUrl"
            FROM "Product"
            WHERE id > %s
            ORDER BY id ASC
            LIMIT {chunk_limit}
            ''',
            (last_id,),
        )
        batch = cur.fetchall()
        if not batch:
            break
        prod_rows.extend(batch)
        last_id = batch[-1][0]
        print(f"[SNAPSHOT] Loaded {len(prod_rows):,} SKU...", flush=True)

    products_packed: List[Any] = []
    catalog_entries: List[Tuple[str, str, Any, Optional[str], Optional[str], Optional[str], Optional[str]]] = []
    for r in prod_rows:
        (
            _pid, sku, barcode, article, desc, brand, dept, color, size,
            h_norm, h_promo, diskon, d_type, acara, stok, to_date, img_url
        ) = r
        if _is_promo_expired(to_date, now_wib_date):
            h_promo = None
            diskon = None
            d_type = None
            acara = None
            to_date = None
        h_norm_val = int(round(float(h_norm or 0))) if h_norm and float(h_norm).is_integer() else float(h_norm or 0)
        h_promo_val = None
        if h_promo is not None and float(h_promo) > 0:
            h_promo_val = int(round(float(h_promo))) if float(h_promo).is_integer() else float(h_promo)

        catalog_entries.append((
            str(sku or ""),
            str(article or ""),
            h_promo_val,
            diskon,
            d_type,
            acara,
            to_date,
        ))
        products_packed.append([
            sku,
            barcode or "",
            article or "",
            desc or "",
            brands_dict.intern(brand),
            depts_dict.intern(dept),
            color or "",
            size or "",
            h_norm_val,
            h_promo_val,
            discounts_dict.intern(diskon),
            discount_types_dict.intern(d_type),
            acaras_dict.intern(acara),
            int(stok or 0),
            to_dates_dict.intern(to_date),
            encode_img(img_url),
        ])

    sku_hash, promo_hash, active_promo_count = compute_catalog_hashes(catalog_entries)
    catalog_version, should_bump, change_reason = decide_catalog_version_bump(
        now_ms=now_ms,
        existing_manifest=existing_manifest,
        sku_hash=sku_hash,
        promo_hash=promo_hash,
        stock_only=stock_only,
    )
    print(
        f"[SNAPSHOT] Deteksi perubahan katalog: reason={change_reason}, bump={should_bump}, "
        f"promoAktif={active_promo_count:,}, catalogVersion={catalog_version}"
    )

    print(f"[SNAPSHOT] Terbaca {len(products_packed):,} SKU. Membaca CatalogArticle & BarcodeAlias...")
    from turso_db import parse_json_array
    model_rows = []
    if getattr(conn, "is_turso", False):
        last_rank = -1
        while True:
            cur.execute(
                '''
                SELECT
                    key, sku, barcode, article, description, brand, dept,
                    "brandGroup", "subBrand", "categoryKey", color, size, stok,
                    "hargaNormal", "hargaPromo", diskon, "discountType", acara, "toDate",
                    "imageUrl", "articleGroupCount", "articleTotalStok",
                    "articleColors", "articleSizes", "articleHasPromo", "articlePromoLabel",
                    "sortRank"
                FROM "CatalogArticle"
                WHERE "sortRank" > %s
                ORDER BY "sortRank" ASC
                LIMIT 15000
                ''',
                (last_rank,),
            )
            mbatch = cur.fetchall()
            if not mbatch:
                break
            model_rows.extend([row[:-1] for row in mbatch])
            last_rank = int(mbatch[-1][-1])
    else:
        cur.execute(
            '''
            SELECT
                key, sku, barcode, article, description, brand, dept,
                "brandGroup", "subBrand", "categoryKey", color, size, stok,
                "hargaNormal", "hargaPromo", diskon, "discountType", acara, "toDate",
                "imageUrl", "articleGroupCount", "articleTotalStok",
                "articleColors", "articleSizes", "articleHasPromo", "articlePromoLabel"
            FROM "CatalogArticle"
            ORDER BY "sortRank" ASC
            '''
        )
        model_rows = cur.fetchall()
    models_packed: List[Any] = []
    for r in model_rows:
        (
            key, sku, barcode, article, desc, brand, dept,
            bg, sb, cat_k, color, size, stok,
            h_norm, h_promo, diskon, d_type, acara, to_date,
            img_url, grp_cnt, tot_stok, colors, sizes, has_promo, promo_lbl
        ) = r
        if _is_promo_expired(to_date, now_wib_date):
            h_promo = None
            diskon = None
            d_type = None
            acara = None
            to_date = None
            has_promo = False
            promo_lbl = None
        h_norm_val = int(round(float(h_norm or 0))) if h_norm and float(h_norm).is_integer() else float(h_norm or 0)
        h_promo_val = None
        if h_promo is not None and float(h_promo) > 0:
            h_promo_val = int(round(float(h_promo))) if float(h_promo).is_integer() else float(h_promo)

        models_packed.append([
            key,
            sku,
            barcode or "",
            article or "",
            desc or "",
            brands_dict.intern(brand),
            depts_dict.intern(dept),
            bg_dict.intern(bg),
            sb_dict.intern(sb),
            cat_dict.intern(cat_k),
            color or "",
            size or "",
            int(stok or 0),
            h_norm_val,
            h_promo_val,
            discounts_dict.intern(diskon),
            discount_types_dict.intern(d_type),
            acaras_dict.intern(acara),
            to_dates_dict.intern(to_date),
            encode_img(img_url),
            int(grp_cnt or 1),
            int(tot_stok or 0),
            parse_json_array(colors),
            parse_json_array(sizes),
            1 if has_promo else 0,
            promo_lbl or "",
        ])

    cur.execute('SELECT barcode, "barcodeNorm", sku FROM "BarcodeAlias"')
    alias_rows = cur.fetchall()
    aliases_packed = [[r[0], r[1], r[2]] for r in alias_rows]

    if should_bump:
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
                        f"snap_{uuid.uuid4().hex[:18]}",
                        row_u[0],
                        "CATALOG_BUNDLE",
                        f"Python Offline Snapshot [{change_reason}] v{catalog_version}",
                        "SUCCESS",
                        len(products_packed),
                        now_utc,
                    ),
                )
                conn.commit()
                print(f"[SNAPSHOT] Catat CATALOG_BUNDLE ke SyncHistory (reason={change_reason}).")
        except Exception as exc:
            conn.rollback()
            print(f"[SNAPSHOT] Peringatan catat SyncHistory: {exc}")
    else:
        print(f"[SNAPSHOT] Skip SyncHistory CATALOG_BUNDLE (reason={change_reason}) — notif UPDATE SEKARANG tetap mati.")

    cur.close()
    conn.close()

    bundle_obj = {
        "v": 2,
        "catalogVersion": catalog_version,
        "bundleRevision": bundle_revision,
        "generatedAt": now_utc.isoformat(),
        "imgPrefix": IMG_SHOPIFY_PREFIX,
        "totalSkus": len(products_packed),
        "totalModels": len(models_packed),
        "totalAliases": len(aliases_packed),
        "dicts": {
            "brands": brands_dict.items,
            "depts": depts_dict.items,
            "discounts": discounts_dict.items,
            "discountTypes": discount_types_dict.items,
            "acaras": acaras_dict.items,
            "toDates": to_dates_dict.items,
            "brandGroups": bg_dict.items,
            "subBrands": sb_dict.items,
            "catKeys": cat_dict.items,
        },
        "products": products_packed,
        "models": models_packed,
        "aliases": aliases_packed,
    }

    raw_json = json.dumps(bundle_obj, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    gz_bytes = gzip.compress(raw_json, compresslevel=6)
    snap_filename = f"snapshot-{bundle_revision}.json.gz"
    snap_path = f"offline-db/{snap_filename}"

    print(
        f"[SNAPSHOT] Kompilasi selesai: raw={len(raw_json)/1024/1024:.2f} MB -> "
        f"gzip={len(gz_bytes)/1024/1024:.2f} MB ({len(products_packed):,} SKU, "
        f"{len(models_packed):,} Model, {len(aliases_packed):,} Alias). Mengunggah ke CDN..."
    )

    from turso_db import storage_upload as _turso_put
    snapshot_url, snapshot_chunks = _turso_put(
        snap_path,
        gz_bytes,
        content_type="application/octet-stream",
    )

    manifest = {
        "v": 2,
        "catalogVersion": catalog_version,
        "bundleRevision": bundle_revision,
        "stockUpdatedAt": now_utc.isoformat(),
        "stockOnly": stock_only,
        "changeReason": change_reason,
        "skuHash": sku_hash,
        "promoHash": promo_hash,
        "activePromoCount": active_promo_count,
        "totalSkus": len(products_packed),
        "totalModels": len(models_packed),
        "totalAliases": len(aliases_packed),
        "rawBytes": len(raw_json),
        "gzipBytes": len(gz_bytes),
        "snapshotPath": snap_path,
        "snapshotUrl": snapshot_url,
        "snapshotChunkCount": snapshot_chunks,
    }
    manifest_url = _storage_upload(
        supa_url,
        supa_key,
        "offline-db/manifest.json",
        json.dumps(manifest, separators=(",", ":")).encode("utf-8"),
        content_type="application/json",
        cache_control="0",
    )

    _cleanup_old_snapshots(supa_url, supa_key, [snap_filename])

    elapsed = time.time() - t0
    print(f"[SNAPSHOT] SUKSES dalam {elapsed:.2f}s! URL: {snapshot_url} | Manifest: {manifest_url}")
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Compile & upload Python Offline DB Snapshot (.json.gz)")
    parser.add_argument("--stock-only", action="store_true", help="Jangan naikkan catalogVersion / SyncHistory")
    args = parser.parse_args()
    build_and_upload_offline_snapshot(stock_only=args.stock_only)
