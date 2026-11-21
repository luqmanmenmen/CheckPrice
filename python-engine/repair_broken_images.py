"""
repair_broken_images.py
=============================================================================
PYTHON IMAGE HEALER ("Python yang mikir, Vercel hanya display")
- Mendeteksi URL foto `cdn.shopify.com` pada tabel Product / CatalogArticle yang
  mengembalikan HTTP 404 (akibat rotasi UUID / re-upload di Matahari.com).
- Mengambil ulang URL studio terbaru dari `matahari.com/search/suggest.json`
  dan `/products/<handle>.js` dengan verifikasi kepemilikan ketat, lalu
  memperbarui `imageUrl` & `images` di PostgreSQL (`Product` & `CatalogArticle`).

Penggunaan:
  python python-engine/repair_broken_images.py --articles D2M4346J4
  python python-engine/repair_broken_images.py --scan-limit 300 --workers 32
  python python-engine/repair_broken_images.py --all --workers 48
=============================================================================
"""

import argparse
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(line_buffering=True)

BAD_IMAGE_TOKENS = ("banner", "logo", "icon", "badge", "chart", "size", "panduan", ".svg", ".gif")
INVALID_ARTICLE_CODES = {"", "0", "-", "N/A", "NONE", "NULL", "PRODUK BARU"}


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


def _connect_postgres():
    _load_env_files()
    try:
        from turso_db import connect_turso, is_turso_configured
        if is_turso_configured():
            return connect_turso(timeout=60)
    except Exception:
        pass
    import psycopg2
    raw = os.environ.get("DATABASE_URL") or os.environ.get("DIRECT_URL") or ""
    parsed = urllib.parse.urlparse(raw)
    qs = urllib.parse.parse_qs(parsed.query)
    for k in ("pgbouncer", "connection_limit", "pool_timeout"):
        qs.pop(k, None)
    clean_dsn = urllib.parse.urlunparse(parsed._replace(query=urllib.parse.urlencode(qs, doseq=True)))
    return psycopg2.connect(clean_dsn, connect_timeout=15)


def _check_url_alive(url: str, timeout: float = 6.0) -> Tuple[str, bool]:
    if not url or not url.startswith("http"):
        return url, False
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0"},
        method="HEAD",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return url, resp.status == 200
    except urllib.error.HTTPError as e:
        if e.code == 405:
            try:
                req_get = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Range": "bytes=0-0"})
                with urllib.request.urlopen(req_get, timeout=timeout) as resp2:
                    return url, resp2.status in (200, 206)
            except Exception:
                return url, False
        return url, False
    except Exception:
        return url, False


def _normalize_shopify_url(raw_url: Any) -> Optional[str]:
    u = str(raw_url or "").strip()
    if not u:
        return None
    if u.startswith("//"):
        u = "https:" + u
    if "cdn.shopify.com/s/files/1/0666/9212/0727/" not in u:
        return None
    fn = u.split("?")[0].split("/")[-1].lower()
    if not fn or any(tok in fn for tok in BAD_IMAGE_TOKENS):
        return None
    return u


def _fetch_matahari_fresh(seed_sku: str, article: Optional[str], seed_barcode: Optional[str]) -> Dict[str, Any]:
    queries = []
    for q in (seed_sku, article, seed_barcode):
        c = str(q or "").strip()
        if c and c not in INVALID_ARTICLE_CODES and c not in queries:
            queries.append(c)

    handles: List[str] = []
    for q in queries:
        try:
            url = f"https://www.matahari.com/search/suggest.json?q={urllib.parse.quote(q)}&resources[type]=product"
            req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=8) as r:
                data = json.loads(r.read().decode("utf-8"))
            for p in data.get("resources", {}).get("results", {}).get("products", []):
                h = str(p.get("handle") or "").strip()
                if h and h not in handles:
                    handles.append(h)
                    if len(handles) >= 3:
                        break
        except Exception:
            pass
        if len(handles) >= 3:
            break

    images_by_sku: Dict[str, List[str]] = {}
    images_by_color: Dict[str, List[str]] = {}
    default_images: List[str] = []

    art_clean = str(article or "").strip()
    art_lower = art_clean.lower() if art_clean not in INVALID_ARTICLE_CODES else ""
    seed_lower = str(seed_sku or "").strip().lower()

    for handle in handles:
        try:
            req = urllib.request.Request(
                f"https://www.matahari.com/products/{urllib.parse.quote(handle)}.js",
                headers={"Accept": "application/json", "User-Agent": "Mozilla/5.0"},
            )
            with urllib.request.urlopen(req, timeout=8) as r:
                pj = json.loads(r.read().decode("utf-8"))
        except Exception:
            continue

        variants = pj.get("variants") or []
        valid_imgs: List[str] = []
        for raw_im in pj.get("images") or []:
            u = _normalize_shopify_url(raw_im)
            if u and u not in valid_imgs:
                valid_imgs.append(u)

        variant_match = any(
            (seed_sku and str(v.get("sku") or "").strip() == seed_sku)
            or (seed_barcode and str(v.get("barcode") or "").strip() == seed_barcode)
            for v in variants
        )
        fn_match = bool(seed_lower) and any(
            (f"{seed_lower}-" in u.split("?")[0].split("/")[-1].lower())
            or (f"{seed_lower}_" in u.split("?")[0].split("/")[-1].lower())
            for u in valid_imgs
        )
        haystack = " ".join(
            str(x) for x in (pj.get("title"), pj.get("handle"), pj.get("tags"), pj.get("body_html")) if x
        ).lower()
        art_match = bool(art_lower and len(art_lower) >= 5 and art_lower in haystack)

        if not (variant_match or fn_match or art_match):
            continue

        for u in valid_imgs[:8]:
            if u not in default_images:
                default_images.append(u)

        color_key = "option1"
        for idx, opt in enumerate(pj.get("options") or []):
            opt_name = str(opt.get("name") if isinstance(opt, dict) else opt).lower()
            if "color" in opt_name or "warna" in opt_name:
                color_key = f"option{idx + 1}"
                break

        for v in variants:
            v_sku = str(v.get("sku") or "").strip()
            if not v_sku:
                continue
            v_low = v_sku.lower()
            color_up = str(v.get(color_key) or v.get("option1") or "").strip().upper()
            sku_imgs: List[str] = []
            feat = v.get("featured_image")
            feat_u = _normalize_shopify_url(feat.get("src") if isinstance(feat, dict) else feat)
            if feat_u:
                sku_imgs.append(feat_u)
            for u in valid_imgs:
                fn = u.split("?")[0].split("/")[-1].lower()
                if f"{v_low}-" in fn or f"{v_low}_" in fn or f"{v_low}." in fn:
                    if u not in sku_imgs:
                        sku_imgs.append(u)
                if len(sku_imgs) >= 6:
                    break
            if sku_imgs:
                images_by_sku[v_sku] = sku_imgs
                if color_up and color_up not in INVALID_ARTICLE_CODES:
                    col_list = images_by_color.setdefault(color_up, [])
                    for u in sku_imgs:
                        if u not in col_list and len(col_list) < 6:
                            col_list.append(u)

    return {
        "by_sku": images_by_sku,
        "by_color": images_by_color,
        "default": default_images,
    }


def heal_broken_articles(articles: Optional[List[str]] = None, scan_limit: int = 0, workers: int = 32) -> None:
    _load_env_files()
    t0 = time.time()
    conn = _connect_postgres()
    cur = conn.cursor()

    broken_articles: Dict[str, Tuple[str, Optional[str]]] = {}

    if articles:
        for art in articles:
            cur.execute(
                'SELECT sku, barcode, article FROM "Product" WHERE article = %s OR sku = %s LIMIT 1',
                (art, art),
            )
            row = cur.fetchone()
            if row:
                art_val = row[2] or row[0]
                broken_articles[art_val] = (row[0], row[1])
    else:
        if getattr(conn, "is_turso", False):
            sql = 'SELECT article, MIN(sku), MIN(barcode), "imageUrl" FROM "Product" WHERE "imageUrl" IS NOT NULL AND article IS NOT NULL GROUP BY article, "imageUrl" ORDER BY article, "imageUrl"'
        else:
            sql = 'SELECT DISTINCT ON (article, "imageUrl") article, sku, barcode, "imageUrl" FROM "Product" WHERE "imageUrl" IS NOT NULL AND article IS NOT NULL ORDER BY article, "imageUrl"'
        if scan_limit > 0:
            sql += f" LIMIT {int(scan_limit)}"
        cur.execute(sql)
        rows = cur.fetchall()
        unique_urls = sorted({r[3] for r in rows if r[3]})
        print(f"[IMG-HEAL] Mengecek {len(unique_urls):,} URL unik ({workers} threads)...")
        dead_urls = set()
        with ThreadPoolExecutor(max_workers=workers) as ex:
            futs = [ex.submit(_check_url_alive, u) for u in unique_urls]
            done_cnt = 0
            for fut in as_completed(futs):
                done_cnt += 1
                u, alive = fut.result()
                if not alive:
                    dead_urls.add(u)
                if done_cnt % 500 == 0:
                    print(f"[IMG-HEAL] Checked {done_cnt:,}/{len(unique_urls):,} | 404 ditemukan: {len(dead_urls):,}")

        for art, sku, bc, img in rows:
            if img in dead_urls and art not in broken_articles:
                broken_articles[art] = (sku, bc)

    print(f"[IMG-HEAL] Total artikel untuk dipulihkan: {len(broken_articles):,}")
    healed_rows = 0
    healed_articles = 0

    for art, (seed_sku, seed_bc) in broken_articles.items():
        fresh = _fetch_matahari_fresh(seed_sku, art, seed_bc)
        if not (fresh["default"] or fresh["by_sku"] or fresh["by_color"]):
            continue

        cur.execute('SELECT sku, color FROM "Product" WHERE article = %s', (art,))
        sibs = cur.fetchall()
        art_rep_img: Optional[str] = None
        art_updated = False

        for s_sku, s_col in sibs:
            c_up = str(s_col or "").strip().upper()
            gallery: List[str] = []
            for u in fresh["by_sku"].get(s_sku, []):
                if u not in gallery:
                    gallery.append(u)
            if c_up:
                for u in fresh["by_color"].get(c_up, []):
                    if u not in gallery:
                        gallery.append(u)
            for u in fresh["default"]:
                if u not in gallery and len(gallery) < 6:
                    gallery.append(u)

            if gallery:
                if not art_rep_img:
                    art_rep_img = gallery[0]
                cur.execute(
                    'UPDATE "Product" SET "imageUrl" = %s, images = %s WHERE sku = %s',
                    (gallery[0], gallery[:8], s_sku),
                )
                healed_rows += 1
                art_updated = True

        if art_updated and art_rep_img:
            cur.execute('UPDATE "CatalogArticle" SET "imageUrl" = %s WHERE article = %s', (art_rep_img, art))
            conn.commit()
            healed_articles += 1
            print(f"  ✅ Sembuh artikel {art}: {len(sibs)} SKU -> {art_rep_img[:75]}")
        else:
            conn.rollback()

    cur.close()
    conn.close()
    print(f"[IMG-HEAL] Selesai dalam {time.time() - t0:.2f}s | {healed_articles} artikel ({healed_rows} SKU) diperbarui!")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Deteksi & pulihkan URL foto 404 di DB dari Matahari.com")
    parser.add_argument("--articles", nargs="*", help="Daftar artikel/SKU spesifik yang ingin dipulihkan")
    parser.add_argument("--scan-limit", type=int, default=500, help="Jumlah pasangan artikel+foto yang dicek (0 = semua)")
    parser.add_argument("--all", action="store_true", help="Cek seluruh URL unik di database")
    parser.add_argument("--workers", type=int, default=32)
    args = parser.parse_args()

    limit = 0 if args.all else args.scan_limit
    heal_broken_articles(articles=args.articles, scan_limit=limit, workers=args.workers)
