/**
 * src/lib/imageController.ts
 * ============================================================================
 * IMAGE QUALITY CONTROLLER (Frontend Single Source of Truth)
 * Bertugas:
 * 1. Memblokir 100% URL gambar sampah/placeholder sebelum dirender:
 *    - Logo Matahari abu-abu versi UUID (`files/product_<uuid>.jpg`, 2.238 bytes, 281×363)
 *    - Banner, logo, icon, badge, size-chart, panduan, voucher, .svg, .gif
 * 2. Mendeteksi logo Matahari abu-abu versi nama-produk asli di runtime `onLoad`
 *    (dimensi unik tepat `281×363 px` / ukuran mikro `<= 120px`, 3.163 bytes).
 * 3. Menormalkan URL CDN retail & menghasilkan URL retry anti-gagal (cache-buster).
 * 4. Melaporkan URL sampah yang tertangkap di runtime ke server (fire-and-forget)
 *    agar otomatis dihapus permanen dari Turso Cloud.
 * ============================================================================
 */

const JUNK_FILENAME_TOKENS = [
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
];

// Pola resmi logo Matahari abu-abu Shopify (`.../files/product_<uuid>.jpg` = 2.238 bytes, 281x363)
const SHOPIFY_GREY_LOGO_UUID_RE = /\/files\/product_[0-9a-f]{6,}[0-9a-f-]*\.(?:jpe?g|png|webp)(?:$|\?)/i;

// Runtime blocklist di memori browser: begitu 1 kartu mendeteksi logo abu-abu 281x363, semua kartu langsung memblokirnya
const runtimeJunkUrls = new Set<string>();
const reportedJunkUrls = new Set<string>();

export function normalizeRawImageUrl(rawUrl?: string | null): string {
  if (!rawUrl || typeof rawUrl !== "string") return "";
  let trimmed = rawUrl.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("//")) trimmed = `https:${trimmed}`;
  if (!/^https?:\/\//i.test(trimmed)) return "";
  return trimmed;
}

/**
 * Menormalkan URL gambar retail (https://) tanpa menambah query `?width=...`
 * karena sebagian URL Shopify CDN mengembalikan HTTP 404 jika diberi parameter width.
 */
export function optimizeRetailImageUrl(rawUrl?: string | null, _width: number = 400): string {
  const trimmed = normalizeRawImageUrl(rawUrl);
  if (!trimmed) return "";

  if (trimmed.includes("cdn.shopify.com") || trimmed.includes("matahari.com/cdn/shop")) {
    try {
      const u = new URL(trimmed);
      u.searchParams.delete("width");
      return u.toString();
    } catch {
      return trimmed.replace(/([?&])width=\d+&?/g, "$1").replace(/[?&]$/, "");
    }
  }
  return trimmed;
}

/** Cek apakah URL termasuk gambar sampah / logo Matahari abu-abu / non-produk */
export function isJunkRetailImageUrl(rawUrl?: string | null): boolean {
  const trimmed = normalizeRawImageUrl(rawUrl);
  if (!trimmed) return true;

  const cleanNoQuery = trimmed.split("?")[0];
  if (runtimeJunkUrls.has(trimmed) || runtimeJunkUrls.has(cleanNoQuery)) {
    return true;
  }

  if (SHOPIFY_GREY_LOGO_UUID_RE.test(trimmed)) {
    return true;
  }

  const filename = (cleanNoQuery.split("/").pop() || "").toLowerCase();
  if (!filename) return true;

  for (const tok of JUNK_FILENAME_TOKENS) {
    if (filename.includes(tok)) {
      return true;
    }
  }
  return false;
}

/**
 * Sidik jari dimensi gambar sampah saat `onLoad`:
 * - Logo Matahari abu-abu (baik versi 2.238 bytes maupun 3.163 bytes) SELALU berukuran tepat 281×363 px!
 * - Foto studio produk asli Matahari selalu >= 500px (800×1000, 1000×1250, 1200×1500, dst.).
 */
export function isJunkRetailImageDimensions(naturalWidth: number, naturalHeight: number): boolean {
  if (!naturalWidth || !naturalHeight) return true;
  // Sidik jari eksak logo Matahari abu-abu (281×363 px)
  if (naturalWidth === 281 && naturalHeight === 363) return true;
  // Toleransi tipis jika ada varian resize kecil logo abu-abu (<= 120px)
  if (naturalWidth <= 120 || naturalHeight <= 120) return true;
  return false;
}

/** Kembalikan URL gambar bersih jika valid, atau null bila sampah/kosong */
export function sanitizeRetailImageUrl(rawUrl?: string | null): string | null {
  const opt = optimizeRetailImageUrl(rawUrl);
  if (!opt || isJunkRetailImageUrl(opt)) return null;
  return opt;
}

/** Saring array galeri `images[]` agar 100% bebas logo abu-abu & duplikat */
export function sanitizeRetailImageList(urls?: (string | null | undefined)[] | null): string[] {
  if (!Array.isArray(urls) || urls.length === 0) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of urls) {
    const clean = sanitizeRetailImageUrl(raw);
    if (!clean) continue;
    const baseKey = clean.split("?")[0];
    if (seen.has(baseKey)) continue;
    seen.add(baseKey);
    out.push(clean);
  }
  return out;
}

/** Buat URL retry dengan cache-buster agar koneksi transient CDN yang sempat gagal bisa langsung pulih */
export function buildRetryImageUrl(cleanUrl: string, attempt: number): string {
  if (!cleanUrl || attempt <= 0) return cleanUrl;
  try {
    const u = new URL(cleanUrl);
    u.searchParams.set("_r", String(attempt));
    return u.toString();
  } catch {
    const sep = cleanUrl.includes("?") ? "&" : "?";
    return `${cleanUrl}${sep}_r=${attempt}`;
  }
}

export function markRuntimeJunkImageUrl(rawUrl: string): void {
  const opt = optimizeRetailImageUrl(rawUrl);
  if (!opt) return;
  runtimeJunkUrls.add(opt);
  runtimeJunkUrls.add(opt.split("?")[0]);
}

/**
 * Laporkan secara senyap (throttled 1x per URL per sesi) ke backend agar logo Matahari abu-abu
 * yang terdeteksi di runtime (281×363 px) langsung diverifikasi & dihapus permanen dari Turso Cloud.
 */
export function reportJunkImageToServer(params: {
  imageUrl: string;
  sku?: string | null;
  article?: string | null;
  width?: number;
  height?: number;
}): void {
  if (typeof window === "undefined") return;
  const opt = optimizeRetailImageUrl(params.imageUrl);
  if (!opt) return;
  const key = opt.split("?")[0];
  markRuntimeJunkImageUrl(opt);
  if (reportedJunkUrls.has(key)) return;
  reportedJunkUrls.add(key);

  fetch("/api/product/purge-junk-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      imageUrl: opt,
      sku: params.sku || null,
      article: params.article || null,
      width: params.width || 0,
      height: params.height || 0,
    }),
    keepalive: true,
  }).catch(() => {});
}
