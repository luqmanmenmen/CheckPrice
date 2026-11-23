"""
image_quality_controller.py
=============================================================================
PYTHON IMAGE QUALITY CONTROLLER ("Python yang mikir, Vercel hanya display")
Pengontrol tunggal kualitas gambar untuk seluruh pipeline Python Engine:
1. Memblokir 100% URL gambar sampah/non-produk & logo Matahari abu-abu:
   - Pola UUID placeholder: `/files/product_<uuid>.jpg` (2.238 bytes, 281×363 px)
   - Pola menyamar nama produk asli (3.163 bytes, 281×363 px)
   - Kata kunci non-produk: banner, logo, icon, badge, size-chart, panduan,
     placeholder, no-image, default, voucher, .svg, .gif
2. Mode `--purge-turso`:
   - Memindai tabel `Product` & `CatalogArticle` di Turso Cloud:
     a) Langsung hapus semua URL yang cocok pola sampah (`product_<uuid>`, dll.)
     b) Probe HTTP `HEAD` paralel (64 workers) atas URL non-SKU / kandidat
        untuk mendeteksi logo Matahari abu-abu `2.238` / `3.163` bytes (`<= 3.600` bytes)
        maupun URL mati 404.
     c) Jika `images[]` masih memiliki foto produk asli lain, promosikan otomatis
        ke `imageUrl`; jika tidak, set `imageUrl = NULL` & `images = '[]'` agar
        otomatis masuk antrean scrap foto studio 7-jalur!
     d) Menyinkronkan `CatalogArticle.imageUrl` (promosikan foto valid dari varian
        se-artikel bila ada, atau NULL bila semua sampah).
     e) Menyimpan laporan ringkas ke Turso Storage `analytics/image-controller-report.json`.

Penggunaan:
  python python-engine/image_quality_controller.py --purge-turso
  python python-engine/image_quality_controller.py --purge-turso --scan-non-digit
=============================================================================
"""

import argparse
import json
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(line_buffering=True)

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

# Sidik jari resmi logo Matahari abu-abu (281×363 px):
# - Versi 1 (`product_<uuid>.jpg`) : 2.238 bytes (sha256=91ea9c3f7db1e536)
# - Versi 2 (nama produk menyamar) : 3.163 bytes (sha256=4de81cfa90108aaf)
KNOWN_GREY_LOGO_SIZES = frozenset({2238, 3163})
MAX_JUNK_IMAGE_BYTES = 3600

SHOPIFY_GREY_LOGO_UUID_RE = re.compile(
    r"/files/product_[0-9a-f]{6,}[0-9a-f-]*\.(?:jpe?g|png|webp)(?:$|\?)",
    re.IGNORECASE,
)

JUNK_FILENAME_TOKENS = (
    "banner",
    "logo",
    "icon",
    "badge",
    "size-chart",
    "size_chart",
    "sizechart",
    "panduan",
    "ukur",
    "placeholder",
    "no-image",
    "no_image",
    "noimage",
    "coming-soon",
    "coming_soon",
    "default",
    "voucher",
    "header",
    "footer",
    "button",
    "bank",
    "payment",
    ".svg",
    ".gif",
)


def normalize_image_url(raw_url: Any) -> str:
    if not raw_url:
        return ""
    s = str(raw_url).strip()
    if not s:
        return ""
    if s.startswith("//"):
        s = "https:" + s
    if not s.lower().startswith(("http://", "https://")):
        return ""
    return s


def is_junk_image_url(raw_url: Any) -> bool:
    """Cek cepat berbasis pola URL (0 network) untuk memblokir gambar sampah & logo Matahari abu-abu UUID."""
    u = normalize_image_url(raw_url)
    if not u:
        return True
    if SHOPIFY_GREY_LOGO_UUID_RE.search(u):
        return True
    fn = u.split("?")[0].rsplit("/", 1)[-1].lower()
    if not fn:
        return True
    for tok in JUNK_FILENAME_TOKENS:
        if tok in fn:
            return True
    return False


def is_junk_content_length(content_length: Optional[int]) -> bool:
    """True bila ukuran byte gambar cocok dengan logo Matahari abu-abu (2.238 / 3.163 bytes) atau <= 3.600 bytes."""
    if content_length is None or content_length <= 0:
        return False
    return content_length in KNOWN_GREY_LOGO_SIZES or content_length <= MAX_JUNK_IMAGE_BYTES


def clean_valid_image_url(raw_url: Any, require_shopify: bool = True) -> str:
    """Mengembalikan URL bersih yang lolos filter Image Quality Controller, atau '' bila ditolak."""
    u = normalize_image_url(raw_url)
    if not u:
        return ""
    if require_shopify and "cdn.shopify.com/s/files/1/0666/9212/0727/" not in u:
        return ""
    if is_junk_image_url(u):
        return ""
    return u


def _make_http_session(pool_size: int = 64) -> requests.Session:
    sess = requests.Session()
    adapter = HTTPAdapter(
        pool_connections=pool_size,
        pool_maxsize=pool_size,
        max_retries=Retry(total=1, backoff_factor=0.2, status_forcelist=[429, 502, 503, 504]),
    )
    sess.mount("https://", adapter)
    sess.mount("http://", adapter)
    sess.headers.update({"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"})
    return sess


def probe_url_quality(sess: requests.Session, url: str, timeout: float = 6.0) -> Tuple[str, str, int]:
    """
    Kembalikan `(url, verdict, content_length)`:
      - `ok`        : HTTP 200 & ukuran > 3.600 bytes (foto produk asli!)
      - `grey_logo` : HTTP 200 & ukuran 2.238 / 3.163 / <= 3.600 bytes (logo Matahari abu-abu!)
      - `dead_404`  : HTTP 404 / 410 (foto sudah dihapus CDN)
      - `skip`      : timeout / transient error (jangan hapus!)
    """
    if is_junk_image_url(url):
        return url, "pattern_junk", 0
    try:
        r = sess.head(url, timeout=timeout, allow_redirects=True)
        if r.status_code in (404, 410):
            return url, "dead_404", 0
        if r.status_code == 200:
            cl_raw = r.headers.get("content-length")
            cl = int(cl_raw) if cl_raw and cl_raw.isdigit() else 0
            if is_junk_content_length(cl):
                return url, "grey_logo", cl
            return url, "ok", cl
        return url, "skip", 0
    except Exception:
        return url, "skip", 0


def _parse_images_json(raw_imgs: Any) -> List[str]:
    if isinstance(raw_imgs, list):
        return [str(x).strip() for x in raw_imgs if isinstance(x, str) and x.strip()]
    if isinstance(raw_imgs, str) and raw_imgs.strip():
        try:
            parsed = json.loads(raw_imgs)
            if isinstance(parsed, list):
                return [str(x).strip() for x in parsed if isinstance(x, str) and x.strip()]
        except Exception:
            pass
    return []


def purge_junk_images_in_turso(scan_non_digit: bool = True, workers: int = 48, max_probe_urls: int = 8000) -> Dict[str, Any]:
    from turso_db import connect_turso, is_turso_configured, storage_upload

    t0 = time.time()
    if not is_turso_configured():
        print("❌ [IMAGE-CONTROLLER] TURSO_DATABASE_URL belum dikonfigurasi.")
        return {"success": False}

    conn = connect_turso(timeout=90)
    cur = conn.cursor()

    print("=" * 78)
    print("🛡️  [IMAGE QUALITY CONTROLLER] Memindai & Menghapus Logo Matahari Abu-Abu / Sampah")
    print("=" * 78)

    # 1. Kumpulkan semua URL unik dari CatalogArticle yang non-digit (di situlah logo abu-abu 2.238 & 3.163 berada!)
    #    PLUS semua pola pattern_junk (`product_<uuid>`, placeholder, logo, dll.) di Product & CatalogArticle
    junk_base_urls: Set[str] = set()
    junk_reasons: Dict[str, str] = {}
    probe_candidates: Set[str] = set()

    cur.execute('SELECT DISTINCT "imageUrl" FROM "CatalogArticle" WHERE "imageUrl" IS NOT NULL AND "imageUrl" != \'\'')
    cat_urls = [str(r[0]).strip() for r in cur.fetchall() if r[0]]
    print(f"🔎 [IMAGE-CONTROLLER] Memeriksa {len(cat_urls):,} URL unik di CatalogArticle...")

    for u in cat_urls:
        if is_junk_image_url(u):
            junk_base_urls.add(u.split("?")[0])
            junk_reasons[u.split("?")[0]] = "pattern_junk"
        elif scan_non_digit:
            fn = u.split("?")[0].rsplit("/", 1)[-1]
            # Nama file yang tidak diawali 6-9 digit SKU (mis. nevada-..., kaos-..., sandal_..., bawahan_...)
            if not re.match(r"^\d{6,9}[-_.]", fn):
                probe_candidates.add(u)

    # Tangkap juga URL berpola sampah langsung di tabel Product (barangkali tidak muncul di CatalogArticle)
    cur.execute(
        '''
        SELECT DISTINCT "imageUrl" FROM "Product"
        WHERE "imageUrl" LIKE '%/files/product_%'
           OR LOWER("imageUrl") LIKE '%placeholder%'
           OR LOWER("imageUrl") LIKE '%no-image%'
           OR LOWER("imageUrl") LIKE '%no_image%'
           OR LOWER("imageUrl") LIKE '%logo%'
           OR LOWER("imageUrl") LIKE '%banner%'
           OR LOWER("imageUrl") LIKE '%.svg%'
           OR LOWER("imageUrl") LIKE '%.gif%'
        '''
    )
    for (u,) in cur.fetchall():
        if u and is_junk_image_url(u):
            b = str(u).strip().split("?")[0]
            junk_base_urls.add(b)
            junk_reasons[b] = "pattern_junk"

    probe_list = sorted(probe_candidates)[:max_probe_urls]
    probed_grey_logo = 0
    probed_dead_404 = 0
    probed_ok = 0

    if probe_list:
        print(f"🌐 [IMAGE-CONTROLLER] HTTP HEAD probe pada {len(probe_list):,} URL non-SKU ({workers} workers)...")
        sess = _make_http_session(pool_size=max(32, workers))
        done = 0
        with ThreadPoolExecutor(max_workers=workers) as ex:
            futs = [ex.submit(probe_url_quality, sess, u) for u in probe_list]
            for fut in as_completed(futs):
                url, verdict, cl = fut.result()
                done += 1
                if verdict == "grey_logo":
                    probed_grey_logo += 1
                    b = url.split("?")[0]
                    junk_base_urls.add(b)
                    junk_reasons[b] = f"grey_logo_{cl}b"
                elif verdict == "dead_404":
                    probed_dead_404 += 1
                    b = url.split("?")[0]
                    junk_base_urls.add(b)
                    junk_reasons[b] = "dead_404"
                elif verdict == "ok":
                    probed_ok += 1
                if done % 1000 == 0 or done == len(probe_list):
                    print(
                        f"   ↳ Probed {done:,}/{len(probe_list):,} | "
                        f"Logo Abu-Abu={probed_grey_logo:,} | 404={probed_dead_404:,} | Valid={probed_ok:,}"
                    )

    print(f"🧹 [IMAGE-CONTROLLER] Total URL sampah terkonfirmasi untuk dihapus: {len(junk_base_urls):,}")

    products_cleaned = 0
    articles_cleaned = 0
    articles_promoted = 0
    now_iso = datetime.now(timezone.utc).isoformat()

    if junk_base_urls:
        # 2. Scan Product secara chunk PK id (hanya baris ber-imageUrl tidak kosong)
        #    dan bersihkan imageUrl + images[] yang mengandung URL sampah!
        prod_updates: List[Tuple[str, Tuple[Any, ...]]] = []
        last_id = 0
        while True:
            cur.execute(
                'SELECT id, "imageUrl", images FROM "Product" WHERE id > ? AND "imageUrl" IS NOT NULL AND "imageUrl" != \'\' ORDER BY id ASC LIMIT 25000',
                (last_id,),
            )
            rows = cur.fetchall()
            if not rows:
                break
            for pid, img_url, imgs_raw in rows:
                u = str(img_url or "").strip()
                base_u = u.split("?")[0]
                is_primary_junk = (base_u in junk_base_urls) or is_junk_image_url(u)
                imgs_list = _parse_images_json(imgs_raw)
                kept_imgs = [
                    x for x in imgs_list
                    if (x.split("?")[0] not in junk_base_urls) and (not is_junk_image_url(x))
                ]
                if is_primary_junk or len(kept_imgs) != len(imgs_list):
                    next_primary = kept_imgs[0] if kept_imgs else None
                    prod_updates.append(
                        (
                            'UPDATE "Product" SET "imageUrl" = ?, images = ?, "updatedAt" = ? WHERE id = ?',
                            (next_primary, json.dumps(kept_imgs, ensure_ascii=False), now_iso, int(pid)),
                        )
                    )
            last_id = int(rows[-1][0])

        for i in range(0, len(prod_updates), 400):
            conn.execute_batch(prod_updates[i:i + 400], transactional=True)
        products_cleaned = len(prod_updates)

        # 3. Bersihkan CatalogArticle yang imageUrl-nya termasuk URL sampah
        cur.execute('SELECT key, article, "imageUrl" FROM "CatalogArticle" WHERE "imageUrl" IS NOT NULL AND "imageUrl" != \'\'')
        cat_rows = cur.fetchall()
        cat_updates: List[Tuple[str, Tuple[Any, ...]]] = []
        for ckey, cart, cimg in cat_rows:
            u = str(cimg or "").strip()
            if (u.split("?")[0] in junk_base_urls) or is_junk_image_url(u):
                # Cek apakah ada varian lain dalam artikel yang punya foto valid
                replacement_img = None
                if cart:
                    cur.execute(
                        'SELECT "imageUrl" FROM "Product" WHERE article = ? AND "imageUrl" IS NOT NULL AND "imageUrl" != \'\' LIMIT 1',
                        (cart,),
                    )
                    r_rep = cur.fetchone()
                    if r_rep and r_rep[0] and not is_junk_image_url(r_rep[0]) and str(r_rep[0]).split("?")[0] not in junk_base_urls:
                        replacement_img = str(r_rep[0]).strip()
                        articles_promoted += 1
                cat_updates.append(
                    (
                        'UPDATE "CatalogArticle" SET "imageUrl" = ?, "updatedAt" = ? WHERE key = ?',
                        (replacement_img, now_iso, ckey),
                    )
                )

        for i in range(0, len(cat_updates), 400):
            conn.execute_batch(cat_updates[i:i + 400], transactional=True)
        articles_cleaned = len(cat_updates)

    report = {
        "generatedAt": now_iso,
        "elapsedSec": round(time.time() - t0, 2),
        "totalCatalogUniqueUrls": len(cat_urls),
        "nonSkuUrlsProbed": len(probe_list),
        "junkUrlsConfirmed": len(junk_base_urls),
        "probedGreyLogos": probed_grey_logo,
        "probedDead404": probed_dead_404,
        "productsCleaned": products_cleaned,
        "articlesCleaned": articles_cleaned,
        "articlesPromotedReplacement": articles_promoted,
    }
    try:
        storage_upload(
            "analytics/image-controller-report.json",
            json.dumps(report, ensure_ascii=False, indent=2).encode("utf-8"),
            content_type="application/json",
        )
    except Exception as exc:
        print(f"⚠️ [IMAGE-CONTROLLER] Gagal simpan report ke Turso Storage: {exc}")

    cur.close()
    conn.close()

    print(
        f"✅ [IMAGE-CONTROLLER] SELESAI dalam {report['elapsedSec']}s | "
        f"URL Sampah={len(junk_base_urls):,} (Logo Abu-Abu={probed_grey_logo:,}, 404={probed_dead_404:,}) | "
        f"Product Dibersihkan={products_cleaned:,} | CatalogArticle Dibersihkan={articles_cleaned:,} "
        f"(Pengganti Valid={articles_promoted:,})"
    )
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Python Image Quality Controller (Anti Logo Matahari Abu-Abu & 404)")
    parser.add_argument("--purge-turso", action="store_true", help="Pindai & hapus seluruh gambar sampah di Turso Cloud")
    parser.add_argument("--no-probe", action="store_true", help="Hanya hapus pola URL sampah tanpa HTTP HEAD probe")
    parser.add_argument("--workers", type=int, default=48, help="Jumlah worker paralel HTTP HEAD")
    parser.add_argument("--max-probe", type=int, default=8000, help="Batas maksimal URL non-SKU yang di-probe")
    args = parser.parse_args()

    if args.purge_turso:
        purge_junk_images_in_turso(
            scan_non_digit=not args.no_probe,
            workers=args.workers,
            max_probe_urls=args.max_probe,
        )
    else:
        print("Gunakan --purge-turso untuk menjalankan pembersihan gambar sampah di Turso Cloud.")
