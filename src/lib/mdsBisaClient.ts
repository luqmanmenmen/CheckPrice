/**
 * MDS BISA (StoreHub) Client for Realtime Single-Item & 1-Article Family Discovery
 * Digunakan untuk tombol "⚡ Live Stok" dan "⚡ Cari & Scrap Barang Ini di Server (StoreHub + Foto + 1 Keluarga Artikel)"
 */

import { prisma } from './prisma';
import { checkAndCleanPromo, getProductSiblings } from './productQueryHelpers';

const STOREHUB_BASE = 'https://storehub.mdsretailing.id';
const LOGIN_URL = `${STOREHUB_BASE}/login?next=%2F`;
const ITEM_CHECKER_URL = `${STOREHUB_BASE}/item-checker`;

const ACTION_LOGIN_DEFAULT = '603f9b4dfafaa0e65eec411a818c1ebcaa476b889f';
let ACTION_LOGIN = ACTION_LOGIN_DEFAULT;
let ACTION_DETAIL = '608e569ea77f8871817d11afae932ecea7d0fcbd09';

const CREDENTIALS = {
  username: 'M223515',
  password: 'Mamen123',
  tz: 'Asia/Jakarta',
};

const INVALID_ARTICLE_CODES = new Set(['', '0', '-', 'N/A', 'NONE', 'NULL', 'PRODUK BARU']);
const BAD_IMAGE_TOKENS = ['banner', 'logo', 'icon', 'badge', 'chart', 'size', 'panduan', '.svg', '.gif'];

// In-memory cookie cache (session StoreHub bertahan ~20 menit)
let cachedCookie: string | null = null;
let cookieCachedAt: number = 0;
const COOKIE_TTL_MS = 10 * 60 * 1000; // 10 menit (pendek agar selalu sinkron dengan Storage)

export type LiveStockVariantSummary = {
  sku: string;
  color?: string | null;
  size?: string | null;
  stok: number;
};

export type CheckSingleItemOptions = {
  discoverFamily?: boolean;
  withImages?: boolean;
  syncAllSizes?: boolean;
};

export type CheckSingleItemResult = {
  success: boolean;
  sku: string;
  stok?: number;
  barcode?: string | null;
  article?: string | null;
  hargaNormal?: number | null;
  totalVariantsUpdated?: number;
  liveCheckedCount?: number;
  changedCount?: number;
  newVariantsDiscovered?: number;
  imagesMatched?: number;
  variants?: LiveStockVariantSummary[];
  data?: any;
  siblings?: any[];
  storeOffline?: boolean;
  message?: string;
};

type MatahariFamilyImages = {
  variantSkus: string[];
  imagesBySku: Map<string, string[]>;
  imagesByColor: Map<string, string[]>;
  defaultImages: string[];
};

export function isStoreOpen(): boolean {
  const now = new Date();
  const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const hour = wib.getUTCHours();
  const minute = wib.getUTCMinutes();
  const totalMinutes = hour * 60 + minute;
  // Buka 09:00 (540) sampai 21:30 (1290)
  return totalMinutes >= 540 && totalMinutes <= 1290;
}

/** Hitung GS1 EAN-13 check digit yang valid (bobot 1, 3) */
export function calculateEan13CheckDigit(digits12: string): string {
  if (!/^\d{12}$/.test(digits12)) return '';
  let total = 0;
  for (let i = 0; i < 12; i++) {
    total += parseInt(digits12[i], 10) * (i % 2 === 0 ? 1 : 3);
  }
  return String((10 - (total % 10)) % 10);
}

/** Buat SKU Matahari 8-digit valid Modulo-10 dari 7-digit body (bobot 1,2,1,2,1,2,1) */
export function generateMdsSku8(body7: number): string {
  const s7 = String(Math.floor(body7)).padStart(7, '0');
  if (!/^\d{7}$/.test(s7)) return '';
  const weights = [1, 2, 1, 2, 1, 2, 1];
  let total = 0;
  for (let i = 0; i < 7; i++) {
    total += parseInt(s7[i], 10) * weights[i];
  }
  const cd = (10 - (total % 10)) % 10;
  return `${s7}${cd}`;
}

function sanitizeArticleCode(raw: any): string | null {
  const clean = String(raw ?? '').trim();
  if (!clean || INVALID_ARTICLE_CODES.has(clean.toUpperCase())) return null;
  return clean;
}

function normalizeCodeKey(val: string): string {
  return val.replace(/[\s\-_./]/g, '').toUpperCase();
}

function normalizeRetailColorKey(raw: any): string {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\bMED\b|\bMDM\b/g, 'MEDIUM')
    .replace(/\bDRK\b/g, 'DARK')
    .replace(/\bLGT\b/g, 'LIGHT')
    .replace(/\bBLK\b/g, 'BLACK')
    .replace(/\bWHT\b/g, 'WHITE')
    .replace(/\bNVY\b/g, 'NAVY')
    .replace(/\bGRY\b/g, 'GREY')
    .replace(/[\s\-_./]+/g, '');
}

function extractSkuFromShopifyUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  const filename = String(rawUrl).split('?')[0].split('/').pop() || '';
  const m = filename.match(/^(\d{7,9})(?:[-_.]|$)/);
  return m?.[1] || null;
}

function buildMatahariKeywordQueries(
  brand: string | null | undefined,
  description: string | null | undefined,
  article: string | null | undefined
): string[] {
  const out: string[] = [];
  const rawDesc = String(description || '').split(':')[0].trim();
  const cleanBrand = String(brand || '').trim().toUpperCase();
  const cleanArt = sanitizeArticleCode(article)?.toUpperCase() || '';

  const words = rawDesc
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2 && w !== cleanArt);

  if (words.length === 0) return out;
  const filteredWords = words.filter((w) => w !== cleanBrand && !['WO', 'WA', 'LP', 'LIP', 'PR', 'ALL'].includes(w));
  const prefix = cleanBrand && !['MDS RETAIL', 'SUKO CASUAL', 'RETAIL'].includes(cleanBrand) ? `${cleanBrand} ` : '';

  if (filteredWords.length > 0) {
    const q1 = `${prefix}${filteredWords.slice(0, 5).join(' ')}`.trim();
    if (q1.length >= 5) out.push(q1);
    if (filteredWords.length >= 3) {
      const q2 = `${prefix}${filteredWords.slice(0, 3).join(' ')}`.trim();
      if (q2.length >= 5 && !out.includes(q2)) out.push(q2);
    }
  }
  return out;
}

function normalizeMatahariImageUrl(rawUrl: any): string | null {
  let url = String(rawUrl || '').trim();
  if (!url) return null;
  if (url.startsWith('//')) url = `https:${url}`;
  if (!url.includes('cdn.shopify.com/s/files/1/0666/9212/0727/')) return null;
  const filename = url.split('?')[0].split('/').pop()?.toLowerCase() || '';
  if (!filename || BAD_IMAGE_TOKENS.some((bad) => filename.includes(bad))) return null;
  return url;
}

function pushUniqueUrl(list: string[], url: string | null | undefined, maxCount: number = 8) {
  if (!url || list.length >= maxCount) return;
  if (!list.includes(url)) list.push(url);
}

/**
 * Cari foto studio resmi & daftar SKU keluarga artikel di Matahari.com + direct Shopify CDN
 * dengan verifikasi kepemilikan ketat agar foto antar-warna tidak tertukar.
 */
async function fetchMatahariFamilyAndImages(
  seedSku: string,
  article: string | null,
  seedBarcode: string | null,
  extraOpts?: {
    familySkus?: string[];
    familyBarcodes?: string[];
    familyColorBySku?: Map<string, string>;
    brand?: string | null;
    description?: string | null;
    targetColor?: string | null;
    probeDirectCdn?: boolean;
  }
): Promise<MatahariFamilyImages> {
  const emptyResult: MatahariFamilyImages = {
    variantSkus: [],
    imagesBySku: new Map(),
    imagesByColor: new Map(),
    defaultImages: [],
  };

  const allFamilySkuSet = new Set<string>();
  const allFamilyBarcodeSet = new Set<string>();
  if (seedSku) allFamilySkuSet.add(seedSku.trim());
  if (seedBarcode) allFamilyBarcodeSet.add(seedBarcode.trim());
  for (const fs of extraOpts?.familySkus || []) {
    const s = String(fs || '').trim();
    if (s) allFamilySkuSet.add(s);
  }
  for (const fb of extraOpts?.familyBarcodes || []) {
    const b = String(fb || '').trim();
    if (b) allFamilyBarcodeSet.add(b);
  }

  const queries: string[] = [];
  const addQ = (q: string | null | undefined) => {
    const clean = String(q || '').trim();
    if (clean && !queries.includes(clean) && queries.length < 8) queries.push(clean);
  };
  addQ(seedSku);
  if (article && article.length >= 4) addQ(article);
  if (seedBarcode && seedBarcode !== seedSku) addQ(seedBarcode);

  // Tambahkan 1 SKU representatif dari setiap warna berbeda (maks 4 SKU) agar varian multi-batch terdeteksi di Matahari
  if (extraOpts?.familyColorBySku && extraOpts.familyColorBySku.size > 0) {
    const seenRepColors = new Set<string>();
    const targetNorm = normalizeRetailColorKey(extraOpts.targetColor);
    if (targetNorm) {
      for (const [fSku, fNormColor] of extraOpts.familyColorBySku.entries()) {
        if (fNormColor === targetNorm && !seenRepColors.has(fNormColor)) {
          seenRepColors.add(fNormColor);
          addQ(fSku);
          break;
        }
      }
    }
    for (const [fSku, fNormColor] of extraOpts.familyColorBySku.entries()) {
      if (fNormColor && !seenRepColors.has(fNormColor)) {
        seenRepColors.add(fNormColor);
        addQ(fSku);
        if (seenRepColors.size >= 4) break;
      }
    }
  }

  for (const kw of buildMatahariKeywordQueries(extraOpts?.brand, extraOpts?.description, article)) {
    addQ(kw);
  }

  const variantSkusSet = new Set<string>();
  const imagesBySku = new Map<string, string[]>();
  const imagesByColor = new Map<string, string[]>();
  const defaultImages: string[] = [];

  // Jalur 1: Multi-Query Matahari Predictive Search
  if (queries.length > 0) {
    const handles: string[] = [];
    try {
      const suggestResponses = await Promise.all(
        queries.map(async (q) => {
          try {
            const res = await fetch(
              `https://www.matahari.com/search/suggest.json?q=${encodeURIComponent(q)}&resources[type]=product&resources[limit]=8`,
              {
                headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
                signal: AbortSignal.timeout(3500),
              }
            );
            if (!res.ok) return [];
            const json: any = await res.json().catch(() => null);
            return (json?.resources?.results?.products || []) as any[];
          } catch {
            return [];
          }
        })
      );

      for (const prodList of suggestResponses) {
        for (const p of prodList) {
          const h = String(p?.handle || '').trim();
          if (h && !handles.includes(h)) {
            handles.push(h);
            if (handles.length >= 10) break;
          }
        }
        if (handles.length >= 10) break;
      }
    } catch {}

    if (handles.length > 0) {
      const articleClean = sanitizeArticleCode(article);
      const isAlphaNumArticle = Boolean(articleClean && /^(?=.*[A-Za-z])(?=.*\d).{5,}$/.test(articleClean));
      const articleLower = articleClean ? articleClean.toLowerCase() : '';
      const familyLowerSet = new Set(Array.from(allFamilySkuSet).map((s) => s.toLowerCase()));

      const productJsons = await Promise.all(
        handles.map(async (handle) => {
          try {
            const res = await fetch(`https://www.matahari.com/products/${encodeURIComponent(handle)}.js`, {
              headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
              signal: AbortSignal.timeout(3500),
            });
            if (!res.ok) return null;
            return await res.json().catch(() => null);
          } catch {
            return null;
          }
        })
      );

      for (const pj of productJsons) {
        if (!pj || typeof pj !== 'object') continue;
        const variants: any[] = Array.isArray(pj.variants) ? pj.variants : [];
        const rawImages: any[] = Array.isArray(pj.images) ? pj.images : [];
        const validImgs: string[] = [];
        for (const imgRaw of rawImages) {
          pushUniqueUrl(validImgs, normalizeMatahariImageUrl(imgRaw), 50);
        }

        // Cek kepemilikan ketat (cocokkan ke SALAH SATU SKU/barcode keluarga atau artikel alfanumerik)
        const variantMatch = variants.some((v) => {
          const vSku = String(v?.sku || '').trim();
          const vBc = String(v?.barcode || '').trim();
          return (vSku && allFamilySkuSet.has(vSku)) || (vBc && allFamilyBarcodeSet.has(vBc));
        });
        const imageFilenameMatch = validImgs.some((u) => {
          const fn = u.split('?')[0].split('/').pop()?.toLowerCase() || '';
          const skuPrefix = extractSkuFromShopifyUrl(u)?.toLowerCase();
          if (skuPrefix && familyLowerSet.has(skuPrefix)) return true;
          for (const sl of familyLowerSet) {
            if (fn.includes(`${sl}-`) || fn.includes(`${sl}_`) || fn.includes(`${sl}.`)) return true;
          }
          return false;
        });
        const haystack = [
          pj.title,
          pj.handle,
          Array.isArray(pj.tags) ? pj.tags.join(' ') : pj.tags,
          pj.body_html,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        const articleMatch = Boolean(isAlphaNumArticle && articleLower && haystack.includes(articleLower));

        if (!variantMatch && !imageFilenameMatch && !articleMatch) {
          continue;
        }

        for (const u of validImgs) {
          pushUniqueUrl(defaultImages, u, 8);
        }

        let colorOptionKey: 'option1' | 'option2' | 'option3' = 'option1';
        if (Array.isArray(pj.options)) {
          const idx = pj.options.findIndex((o: any) => /color|warna/i.test(String(o?.name || o || '')));
          if (idx === 1) colorOptionKey = 'option2';
          else if (idx === 2) colorOptionKey = 'option3';
        }

        for (const v of variants) {
          const vSku = String(v?.sku || '').trim();
          if (!vSku) continue;
          variantSkusSet.add(vSku);

          const vSkuLower = vSku.toLowerCase();
          const rawColorUp = String(v?.[colorOptionKey] || v?.option1 || '')
            .trim()
            .toUpperCase();
          const normColor = normalizeRetailColorKey(rawColorUp);

          const skuImgs = imagesBySku.get(vSku) || [];
          const featUrl = normalizeMatahariImageUrl(v?.featured_image?.src || v?.featured_image);
          pushUniqueUrl(skuImgs, featUrl, 8);

          const repSkuPrefix = extractSkuFromShopifyUrl(featUrl)?.toLowerCase();
          for (const u of validImgs) {
            const fn = u.split('?')[0].split('/').pop()?.toLowerCase() || '';
            const matchSelf = fn.includes(`${vSkuLower}-`) || fn.includes(`${vSkuLower}_`) || fn.includes(`${vSkuLower}.`);
            const matchFeat = Boolean(
              repSkuPrefix && (fn.includes(`${repSkuPrefix}-`) || fn.includes(`${repSkuPrefix}_`) || fn.includes(`${repSkuPrefix}.`))
            );
            if (matchSelf || matchFeat) {
              pushUniqueUrl(skuImgs, u, 8);
            }
          }

          if (skuImgs.length > 0) {
            imagesBySku.set(vSku, skuImgs);
            if (normColor && !INVALID_ARTICLE_CODES.has(rawColorUp)) {
              const colorImgs = imagesByColor.get(normColor) || [];
              for (const u of skuImgs) pushUniqueUrl(colorImgs, u, 8);
              imagesByColor.set(normColor, colorImgs);
              if (rawColorUp && rawColorUp !== normColor) {
                imagesByColor.set(rawColorUp, colorImgs);
              }
            }
          }
        }
      }
    }
  }

  // Jalur 2: Direct Shopify CDN HEAD Probe per-warna yang belum memiliki foto dari Jalur 1
  if (extraOpts?.probeDirectCdn && extraOpts.familyColorBySku && extraOpts.familyColorBySku.size > 0) {
    const targetNorm = normalizeRetailColorKey(extraOpts.targetColor);
    const probeTargets: Array<{ sku: string; normColor: string }> = [];
    for (const [fSku, fNormColor] of extraOpts.familyColorBySku.entries()) {
      if (!/^\d{7,9}$/.test(fSku)) continue;
      if (imagesBySku.has(fSku)) continue;
      if (fNormColor && (imagesByColor.get(fNormColor)?.length || 0) > 0) continue;
      probeTargets.push({ sku: fSku, normColor: fNormColor });
    }

    // Prioritaskan warna yang sedang dibuka/dipilih terlebih dahulu
    probeTargets.sort((a, b) => {
      const aPrio = targetNorm && a.normColor === targetNorm ? 0 : 1;
      const bPrio = targetNorm && b.normColor === targetNorm ? 0 : 1;
      return aPrio - bPrio;
    });

    const cappedTargets = probeTargets.slice(0, 24);
    if (cappedTargets.length > 0) {
      const headHits = await Promise.all(
        cappedTargets.map(async (t) => {
          const url1 = `https://cdn.shopify.com/s/files/1/0666/9212/0727/files/${t.sku}-1.jpg`;
          try {
            const res = await fetch(url1, { method: 'HEAD', signal: AbortSignal.timeout(2500) });
            return res.ok ? { ...t, url1 } : null;
          } catch {
            return null;
          }
        })
      );

      const matchedHeads = headHits.filter(Boolean) as Array<{ sku: string; normColor: string; url1: string }>;
      for (const hit of matchedHeads) {
        const extraUrls = await Promise.all(
          [2, 3, 4, 5].map(async (idx) => {
            const u = `https://cdn.shopify.com/s/files/1/0666/9212/0727/files/${hit.sku}-${idx}.jpg`;
            try {
              const r = await fetch(u, { method: 'HEAD', signal: AbortSignal.timeout(2200) });
              return r.ok ? u : null;
            } catch {
              return null;
            }
          })
        );
        const gallery = [hit.url1, ...(extraUrls.filter(Boolean) as string[])];
        imagesBySku.set(hit.sku, gallery);
        if (hit.normColor) {
          const colorImgs = imagesByColor.get(hit.normColor) || [];
          for (const u of gallery) pushUniqueUrl(colorImgs, u, 8);
          imagesByColor.set(hit.normColor, colorImgs);
        }
        for (const u of gallery) pushUniqueUrl(defaultImages, u, 8);
      }
    }
  }

  return {
    variantSkus: Array.from(variantSkusSet),
    imagesBySku,
    imagesByColor,
    defaultImages,
  };
}

/** Normalisasi Brand & Departemen agar konsisten dengan master python-engine (bukan hardcode SUKO) */
function normalizeBrandAndDept(itemData: Record<string, any>): { brand: string; dept: string } {
  const rawGroup = String(itemData.GroupName || itemData.Brand || '').trim();
  const rawDept = String(itemData.DeptName || itemData.Department || rawGroup || 'MDS RETAIL').trim();
  const rawSub = String(itemData.SubclassName || itemData.ClassName || '').trim();
  const rawStyle = String(itemData.StyleCode || itemData.styleCode || '').trim().toUpperCase();
  const rawDesc = String(itemData.Description || itemData.ItemDescription || '').trim().toUpperCase();
  const combined = `${rawGroup} ${rawDept} ${rawSub} ${rawDesc}`.toUpperCase();

  let brand = rawGroup || rawDept || 'MDS RETAIL';
  if (combined.includes('MUKU') || rawStyle.startsWith('MK-') || rawStyle.includes('-MK')) brand = 'MUKU';
  else if (combined.includes('ZES')) brand = 'ZES';
  else if (combined.includes('SUKO')) brand = 'SUKO';
  else if (combined.includes('BYRCH')) brand = 'BYRCH & CO';
  else if (combined.includes('NEVADA')) brand = 'NEVADA';
  else if (combined.includes('STANLEY ADAMS')) brand = 'STANLEY ADAMS';
  else if (combined.includes('COLE')) brand = 'COLE';
  else if (combined.includes('CONNEXION')) brand = 'CONNEXION';
  else if (combined.includes('ST YVES') || combined.includes('ST. YVES')) brand = 'ST YVES';
  else if (combined.includes('VOLO')) brand = 'VOLO';
  else if (combined.includes('LITTLE M')) brand = 'LITTLE M';
  else if (combined.includes('PIPA')) brand = 'PIPA';
  else if (combined.includes('SUPER T')) brand = 'SUPER T';
  else if (combined.includes('DETAILS')) brand = 'DETAILS';
  else if (combined.includes('PHENOMENAL')) brand = 'PHENOMENAL';
  else if (combined.includes('AMERICAN JEANS')) brand = 'AMERICAN JEANS';
  else if (combined.includes('TRISSE')) brand = 'TRISSE';
  else if (combined.includes('FLADEO')) brand = 'FLADEO';
  else if (combined.includes('YONGKI')) brand = 'YONGKI KOMALADI';
  else if (rawSub && rawDept.startsWith('AOS')) brand = rawSub;
  else if (rawDept && rawDept !== 'MDS RETAIL') brand = rawDept;

  return { brand, dept: rawDept };
}

/** Gabungkan pembaruan Set-Cookie dari response StoreHub jika ada rotasi mso_session */
async function persistRefreshedSessionIfAny(res: Response, currentCookie: string): Promise<string> {
  try {
    const getSetCookie = (res.headers as any).getSetCookie;
    const rawCookies: string[] = typeof getSetCookie === 'function'
      ? getSetCookie.call(res.headers)
      : (res.headers.get('set-cookie') ? [res.headers.get('set-cookie')!] : []);

    let updated = currentCookie;
    let changed = false;
    for (const sc of rawCookies) {
      if (sc && sc.includes('mso_session=')) {
        const msoPair = sc.split(';')[0].trim();
        const others = updated
          .split(';')
          .map(p => p.trim())
          .filter(p => p && !p.startsWith('mso_session='));
        others.push(msoPair);
        updated = others.join('; ');
        changed = true;
      }
    }

    if (changed && updated.includes('mso_session=')) {
      cachedCookie = updated;
      cookieCachedAt = Date.now();
      const { supabase } = await import('@/lib/supabaseClient');
      await supabase.storage.from('excel-uploads').upload(
        'secrets/mds_cookie.txt',
        Buffer.from(updated, 'utf-8'),
        { contentType: 'text/plain', upsert: true }
      );
    }
    return updated;
  } catch {
    return currentCookie;
  }
}

export async function getStoreHubCookie(
  forceRefresh: boolean = false,
  previousCookie?: string | null
): Promise<string> {
  const now = Date.now();
  if (forceRefresh) {
    cachedCookie = null;
    cookieCachedAt = 0;
  } else if (cachedCookie && cachedCookie.includes('mso_session') && (now - cookieCachedAt) < COOKIE_TTL_MS) {
    return cachedCookie;
  }

  // 1. Jika ada env MDS_SESSION_COOKIE yang memiliki mso_session, gunakan itu
  if (!forceRefresh && process.env.MDS_SESSION_COOKIE && process.env.MDS_SESSION_COOKIE.includes('mso_session')) {
    cachedCookie = process.env.MDS_SESSION_COOKIE.trim();
    cookieCachedAt = now;
    return cachedCookie;
  }

  // 2. Ambil dari Supabase Storage (secrets/mds_cookie.txt) — WAJIB berisi mso_session!
  // Saat forceRefresh, hanya pakai ulang jika sudah diperbarui instance lain (berbeda dari previousCookie).
  try {
    const { supabase } = await import('@/lib/supabaseClient');
    const { data, error } = await supabase.storage.from('excel-uploads').download('secrets/mds_cookie.txt');
    if (data && !error) {
      const cookie = (await data.text()).trim();
      const prevClean = String(previousCookie || '').trim();
      if (cookie && cookie.includes('mso_session') && (!forceRefresh || (prevClean && cookie !== prevClean))) {
        cachedCookie = cookie;
        cookieCachedAt = now;
        return cachedCookie;
      }
    }
  } catch (e) {
    console.warn('[MDS-CLIENT] Gagal membaca cookie dari Storage:', e);
  }

  // 3. Fallback Auto-login ke StoreHub (resolving ACTION_LOGIN hash dinamis + multipart Next 15/16)
  try {
    let loginActionHash = ACTION_LOGIN;
    try {
      const loginHtmlRes = await fetch(LOGIN_URL, { method: 'GET', signal: AbortSignal.timeout(5000) });
      const loginHtml = await loginHtmlRes.text();
      const scriptMatches = [...loginHtml.matchAll(/src="(\/_next\/static\/chunks\/[^"]+\.js)"/g)];
      for (const m of scriptMatches.slice(0, 12)) {
        const jsText = await fetch(`${STOREHUB_BASE}${m[1]}`, { signal: AbortSignal.timeout(4000) }).then(r => r.text()).catch(() => '');
        const actMatch = jsText.match(/createServerReference\)?\("([a-f0-9]{40,44})"[^)]{0,160}"login"/);
        if (actMatch?.[1]) {
          loginActionHash = actMatch[1];
          ACTION_LOGIN = actMatch[1];
          break;
        }
      }
    } catch {}

    // KRUSIAL (React 19 decodeReplyFromBusboy): field `_1_*` WAJIB ditempatkan SEBELUM `'0'` (`[{},"$K1"]`).
    const fd = new FormData();
    fd.append('_1_next', '/');
    fd.append('_1_username', CREDENTIALS.username);
    fd.append('_1_password', CREDENTIALS.password);
    fd.append('_1_tz', CREDENTIALS.tz);
    fd.append('0', '[{},"$K1"]');

    const res = await fetch(LOGIN_URL, {
      method: 'POST',
      headers: {
        'Accept': 'text/x-component',
        'Next-Action': loginActionHash,
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15',
        'Referer': LOGIN_URL,
        'Origin': STOREHUB_BASE,
      },
      body: fd,
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
    });

    const getSetCookie = (res.headers as any).getSetCookie;
    const rawList: string[] = typeof getSetCookie === 'function'
      ? getSetCookie.call(res.headers)
      : (res.headers.get('set-cookie') || '').split(/,(?=\s*[A-Za-z0-9_-]+=)/);
    const sessionCookie = rawList.map(c => c.split(';')[0].trim()).filter(Boolean).join('; ');

    // HANYA terima cookie yang benar-benar memiliki mso_session (JANGAN pernah simpan db76d-only!)
    if (sessionCookie && sessionCookie.includes('mso_session=')) {
      cachedCookie = sessionCookie;
      cookieCachedAt = Date.now();
      try {
        const { supabase } = await import('@/lib/supabaseClient');
        await supabase.storage.from('excel-uploads').upload(
          'secrets/mds_cookie.txt',
          Buffer.from(sessionCookie, 'utf-8'),
          { contentType: 'text/plain', upsert: true }
        );
      } catch (uploadErr) {
        console.warn('[MDS-CLIENT] Gagal menyimpan cookie baru ke Storage:', uploadErr);
      }
      return sessionCookie;
    }
  } catch (e) {
    console.warn('[MDS-CLIENT] Auto-login error:', e);
  }

  throw new Error('Gagal mendapatkan session login by luqman org (mso_session tidak ditemukan)');
}

function harvestBarcodes(rows: any[], primaryItem?: any): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const addBc = (raw: any) => {
    if (raw === undefined || raw === null) return;
    const s = String(raw).trim();
    if (!s || s.length < 4 || s.length > 32) return;
    const up = s.toUpperCase();
    if (['NAN', 'NONE', 'NULL', '-', 'N/A'].includes(up)) return;
    if (!seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  };
  const fields = ['VendorBarcode', 'vendorBarcode', 'Barcode', 'barcode', 'UPC', 'upc', 'EAN', 'ean', 'ItemLookupCode', 'AlternateCode'];
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    for (const f of fields) addBc(r[f]);
  }
  if (primaryItem && typeof primaryItem === 'object') {
    for (const f of fields) addBc(primaryItem[f]);
  }
  return out;
}

function parseRetailPrice(rawPrice: any): number | null {
  if (!rawPrice) return null;
  let str = String(rawPrice).trim();
  if (/\.\d{4,}$/.test(str) || /\.00$/.test(str)) {
    str = str.split('.')[0];
  }
  const cleaned = str.replace(/[^0-9]/g, '');
  return cleaned ? parseInt(cleaned, 10) : null;
}

function resolveProductGallery(
  product: any,
  mataImages: MatahariFamilyImages,
  siblingImgByColor: Map<string, string>,
  fallbackArticleImg: string | null
): string[] {
  const gallery: string[] = [];
  const sku = String(product?.sku || '').trim();
  const colorUp = String(product?.color || '').trim().toUpperCase();
  const normColor = normalizeRetailColorKey(colorUp);

  pushUniqueUrl(gallery, product?.imageUrl, 8);
  for (const u of mataImages.imagesBySku.get(sku) || []) pushUniqueUrl(gallery, u, 8);
  if (normColor) {
    for (const u of mataImages.imagesByColor.get(normColor) || []) pushUniqueUrl(gallery, u, 8);
  }
  if (colorUp) {
    for (const u of mataImages.imagesByColor.get(colorUp) || []) pushUniqueUrl(gallery, u, 8);
    pushUniqueUrl(gallery, siblingImgByColor.get(colorUp), 8);
  }
  if (normColor && normColor !== colorUp) {
    pushUniqueUrl(gallery, siblingImgByColor.get(normColor), 8);
  }
  for (const u of mataImages.defaultImages) pushUniqueUrl(gallery, u, 8);
  pushUniqueUrl(gallery, fallbackArticleImg, 8);

  if (gallery.length === 0 && product?.imageUrl) {
    gallery.push(String(product.imageUrl));
  }
  return gallery;
}

/** Bentuk daftar kandidat awal StoreHub (exact, reverse kind, check-digit fix, prefix 234000 / 2*) */
function buildInitialProbeCandidates(cleanCode: string): Array<{ kind: 'upc' | 'sku'; code: string }> {
  const out: Array<{ kind: 'upc' | 'sku'; code: string }> = [];
  const seen = new Set<string>();
  const add = (kind: 'upc' | 'sku', code: string) => {
    const trimmed = String(code || '').trim();
    if (!trimmed) return;
    const key = `${kind}:${trimmed}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ kind, code: trimmed });
    }
  };

  const isLikelySku = /^\d{7,9}$/.test(cleanCode);
  const primaryKind: 'upc' | 'sku' = !isLikelySku && (cleanCode.length >= 10 || /[^0-9]/.test(cleanCode) || cleanCode.length <= 6) ? 'upc' : 'sku';
  const altKind: 'upc' | 'sku' = primaryKind === 'upc' ? 'sku' : 'upc';

  add(primaryKind, cleanCode);
  add(altKind, cleanCode);

  if (/^\d{13}$/.test(cleanCode)) {
    const cd = calculateEan13CheckDigit(cleanCode.slice(0, 12));
    if (cd) add('upc', `${cleanCode.slice(0, 12)}${cd}`);
  } else if (/^\d{12}$/.test(cleanCode)) {
    add('upc', `2${cleanCode}`);
    if (cleanCode.startsWith('34000')) {
      const base12 = `2${cleanCode.slice(0, 11)}`;
      const cd = calculateEan13CheckDigit(base12);
      if (cd) add('upc', `${base12}${cd}`);
    }
    const cd13 = calculateEan13CheckDigit(cleanCode);
    if (cd13) add('upc', `${cleanCode}${cd13}`);
    add('upc', `0${cleanCode}`);
  } else if (/^\d{6}$/.test(cleanCode)) {
    const base12 = `234000${cleanCode}`;
    const cd = calculateEan13CheckDigit(base12);
    if (cd) add('upc', `${base12}${cd}`);
  } else if (/^\d{7}$/.test(cleanCode)) {
    const sku8 = generateMdsSku8(parseInt(cleanCode, 10));
    if (sku8) add('sku', sku8);
    const base12 = `234000${cleanCode.slice(0, 6)}`;
    const cd = calculateEan13CheckDigit(base12);
    if (cd) add('upc', `${base12}${cd}`);
  }

  return out;
}

/** Simpan 1 item temuan StoreHub ke Prisma Product & BarcodeAlias secara aman */
async function upsertStoreHubItemToDb(
  itemData: any,
  opts: {
    queriedCode: string;
    queriedKind: 'upc' | 'sku';
    mataImages: MatahariFamilyImages;
    siblingImgByColor: Map<string, string>;
    fallbackArticle?: string | null;
    fallbackArticleImg?: string | null;
  }
): Promise<{
  sku: string;
  article: string | null;
  color: string | null;
  size: string | null;
  stok: number;
  barcode: string | null;
  hargaNormal: number | null;
  wasNewSku: boolean;
  imageUpdated: boolean;
} | null> {
  const itemSku = String(itemData?.SKU ?? itemData?.sku ?? '').trim();
  if (!itemSku) return null;

  const directStok = itemData.StockOnHand ?? itemData.stockOnHand ?? itemData.stock_on_hand ?? itemData.soh;
  const currentSkuStok = directStok !== undefined && directStok !== null ? (parseInt(String(directStok), 10) || 0) : 0;
  const rawBarcode = itemData.VendorBarcode ?? itemData.vendorBarcode ?? itemData.barcode ?? null;
  const rawArticle = sanitizeArticleCode(itemData.StyleCode ?? itemData.styleCode ?? itemData.article);
  const itemColor = itemData.COLOR ?? itemData.Color ?? itemData.color ?? null;
  const itemSize = itemData.Size ?? itemData.SIZE ?? itemData.size ?? null;
  const cleanColor = itemColor ? String(itemColor).trim() : null;
  const cleanSize = itemSize ? String(itemSize).trim() : null;
  const colorUp = cleanColor ? cleanColor.toUpperCase() : '';
  const { brand: normalizedBrand, dept: normalizedDept } = normalizeBrandAndDept(itemData);
  const hargaNormal = parseRetailPrice(itemData.RetailPrice ?? itemData.retailPrice ?? itemData.price);

  const existingProduct = await prisma.product.findUnique({
    where: { sku: itemSku },
    select: { article: true, barcode: true, imageUrl: true },
  });
  const articleToUse = rawArticle || sanitizeArticleCode(existingProduct?.article) || opts.fallbackArticle || null;

  const allDiscoveredBarcodes: string[] = Array.isArray(itemData._harvestedBarcodes)
    ? [...itemData._harvestedBarcodes]
    : [];
  const primaryCandidate = rawBarcode
    ? String(rawBarcode).trim()
    : (opts.queriedKind === 'upc' ? opts.queriedCode : null);
  if (primaryCandidate && !allDiscoveredBarcodes.includes(primaryCandidate)) {
    allDiscoveredBarcodes.unshift(primaryCandidate);
  }
  if (opts.queriedKind === 'upc' && opts.queriedCode && !allDiscoveredBarcodes.includes(opts.queriedCode)) {
    allDiscoveredBarcodes.push(opts.queriedCode);
  }

  const candidateBarcode = primaryCandidate || existingProduct?.barcode || null;
  let safeBarcodeForProduct = existingProduct?.barcode || null;
  if (!safeBarcodeForProduct && candidateBarcode) {
    const owner = await prisma.product.findUnique({
      where: { barcode: candidateBarcode },
      select: { sku: true },
    });
    if (!owner || owner.sku === itemSku) {
      safeBarcodeForProduct = candidateBarcode;
    }
  }

  const resolvedImg =
    opts.mataImages.imagesBySku.get(itemSku)?.[0] ||
    (colorUp ? opts.mataImages.imagesByColor.get(colorUp)?.[0] : undefined) ||
    (colorUp ? opts.siblingImgByColor.get(colorUp) : undefined) ||
    opts.mataImages.defaultImages[0] ||
    opts.fallbackArticleImg ||
    null;

  const imageUpdated = Boolean(!existingProduct?.imageUrl && resolvedImg);

  try {
    const updateData: any = {
      stok: currentSkuStok,
      updatedAt: new Date(),
    };
    if (safeBarcodeForProduct && !existingProduct?.barcode) updateData.barcode = safeBarcodeForProduct;
    if (articleToUse) updateData.article = articleToUse;
    if (cleanColor) updateData.color = cleanColor;
    if (cleanSize) updateData.size = cleanSize;
    if (normalizedBrand) updateData.brand = normalizedBrand;
    if (normalizedDept) updateData.dept = normalizedDept;
    if (hargaNormal && hargaNormal > 0) updateData.hargaNormal = hargaNormal;
    if (!existingProduct?.imageUrl && resolvedImg) updateData.imageUrl = resolvedImg;

    await prisma.product.upsert({
      where: { sku: itemSku },
      update: updateData,
      create: {
        sku: itemSku,
        barcode: safeBarcodeForProduct,
        article: articleToUse || 'PRODUK BARU',
        description: String(itemData.Description || itemData.ItemDescription || articleToUse || 'PRODUK BARU').trim(),
        brand: normalizedBrand,
        dept: normalizedDept,
        color: cleanColor,
        size: cleanSize,
        hargaNormal: hargaNormal || 0,
        stok: currentSkuStok,
        imageUrl: resolvedImg,
        updatedAt: new Date(),
      },
    });

    await Promise.allSettled(
      allDiscoveredBarcodes
        .map((b) => String(b).trim())
        .filter((b) => b && b !== itemSku)
        .map((cleanBc) =>
          prisma.barcodeAlias.upsert({
            where: { barcode: cleanBc },
            update: { barcodeNorm: normalizeCodeKey(cleanBc), sku: itemSku, source: 'MDS_LIVE', updatedAt: new Date() },
            create: { barcode: cleanBc, barcodeNorm: normalizeCodeKey(cleanBc), sku: itemSku, source: 'MDS_LIVE' },
          })
        )
    );
  } catch (e) {
    console.warn(`[MDS-CLIENT] Gagal upsert SKU ${itemSku}:`, e);
  }

  return {
    sku: itemSku,
    article: articleToUse,
    color: cleanColor,
    size: cleanSize,
    stok: currentSkuStok,
    barcode: safeBarcodeForProduct || candidateBarcode,
    hargaNormal,
    wasNewSku: !existingProduct,
    imageUpdated,
  };
}

/** Rakit respon final lengkap (`data` + `siblings` 1 keluarga + `images` galeri studio) & backfill foto yang hilang */
async function finalizeProductFamilyResponse(params: {
  mainSku: string;
  fallbackBarcode?: string | null;
  mataImages: MatahariFamilyImages;
  withImages: boolean;
  updatedVariants: LiveStockVariantSummary[];
  freshStockBySku?: Map<string, number>;
  liveCheckedCount?: number;
  changedCount?: number;
  newVariantsDiscovered: number;
  imagesMatched: number;
  storeOffline: boolean;
  message?: string;
}): Promise<CheckSingleItemResult> {
  let dbMain = await prisma.product.findUnique({ where: { sku: params.mainSku } });
  if (!dbMain && params.fallbackBarcode) {
    dbMain = await prisma.product.findFirst({ where: { barcode: params.fallbackBarcode } });
  }
  if (!dbMain) {
    return {
      success: false,
      sku: params.mainSku,
      storeOffline: params.storeOffline,
      message: params.message || 'Produk tidak ditemukan di database maupun server toko.',
    };
  }

  const cleanedMain = checkAndCleanPromo(dbMain);
  if (params.freshStockBySku?.has(cleanedMain.sku)) {
    cleanedMain.stok = params.freshStockBySku.get(cleanedMain.sku)!;
  }
  let siblings = await getProductSiblings(cleanedMain);
  if (!siblings || siblings.length === 0) {
    siblings = [cleanedMain];
  }
  if (params.freshStockBySku && params.freshStockBySku.size > 0) {
    siblings = siblings.map((sib) =>
      params.freshStockBySku!.has(sib.sku)
        ? { ...sib, stok: params.freshStockBySku!.get(sib.sku)! }
        : sib
    );
  }

  let mataImages = params.mataImages;
  const anyMissingImg = !cleanedMain.imageUrl || siblings.some((s) => !s.imageUrl);
  const cleanArticle = sanitizeArticleCode(cleanedMain.article);
  const hasUncoveredColor = siblings.some((s) => {
    if (s.imageUrl) return false;
    const normC = normalizeRetailColorKey(s.color);
    return !mataImages.imagesBySku.has(s.sku) && (!normC || !mataImages.imagesByColor.has(normC));
  });
  if (
    params.withImages &&
    anyMissingImg &&
    (hasUncoveredColor || (mataImages.defaultImages.length === 0 && mataImages.imagesBySku.size === 0))
  ) {
    const familyColorBySku = new Map<string, string>();
    const familySkus: string[] = [];
    const familyBarcodes: string[] = [];
    for (const sib of siblings) {
      if (sib.sku) {
        familySkus.push(sib.sku);
        const normC = normalizeRetailColorKey(sib.color);
        if (normC) familyColorBySku.set(sib.sku, normC);
      }
      if (sib.barcode) familyBarcodes.push(sib.barcode);
    }
    const fetchedMata = await fetchMatahariFamilyAndImages(cleanedMain.sku, cleanArticle, cleanedMain.barcode, {
      familySkus,
      familyBarcodes,
      familyColorBySku,
      brand: cleanedMain.brand,
      description: cleanedMain.description,
      targetColor: cleanedMain.color,
      probeDirectCdn: true,
    }).catch(() => null);
    if (fetchedMata) {
      for (const [k, v] of fetchedMata.imagesBySku) {
        if (!mataImages.imagesBySku.has(k) && v.length > 0) mataImages.imagesBySku.set(k, v);
      }
      for (const [k, v] of fetchedMata.imagesByColor) {
        if (!mataImages.imagesByColor.has(k) && v.length > 0) mataImages.imagesByColor.set(k, v);
      }
      if (mataImages.defaultImages.length === 0 && fetchedMata.defaultImages.length > 0) {
        mataImages = { ...mataImages, defaultImages: fetchedMata.defaultImages };
      }
    }
  }

  // Petakan foto yang sudah ada di database antar-sibling dalam artikel yang sama
  const siblingImgByColor = new Map<string, string>();
  let fallbackArticleImg: string | null = cleanedMain.imageUrl || mataImages.defaultImages[0] || null;
  for (const sib of siblings) {
    if (sib.imageUrl) {
      if (!fallbackArticleImg) fallbackArticleImg = sib.imageUrl;
      const cUp = String(sib.color || '').trim().toUpperCase();
      if (cUp && !siblingImgByColor.has(cUp)) siblingImgByColor.set(cUp, sib.imageUrl);
    }
  }

  let extraImagesMatched = params.imagesMatched;
  if (params.withImages) {
    const dbBackfillUpdates: Promise<any>[] = [];
    for (const sib of siblings) {
      if (!sib.imageUrl) {
        const sibGal = resolveProductGallery(sib, mataImages, siblingImgByColor, fallbackArticleImg);
        if (sibGal.length > 0) {
          sib.imageUrl = sibGal[0];
          sib.images = sibGal;
          extraImagesMatched++;
          dbBackfillUpdates.push(
            prisma.product
              .update({
                where: { sku: sib.sku },
                data: { imageUrl: sibGal[0], images: sibGal, updatedAt: new Date() },
              })
              .catch(() => {})
          );
        }
      }
    }
    if (dbBackfillUpdates.length > 0) {
      await Promise.allSettled(dbBackfillUpdates);
    }
  }

  const enrichedSiblings = siblings.map((sib) => {
    const images = resolveProductGallery(sib, mataImages, siblingImgByColor, fallbackArticleImg);
    const resolvedUrl = sib.imageUrl || images[0] || null;
    return {
      ...sib,
      imageUrl: resolvedUrl,
      images,
    };
  });

  const matchedFromSibs = enrichedSiblings.find((s) => s.sku === cleanedMain.sku);
  const mainImages = matchedFromSibs?.images || resolveProductGallery(cleanedMain, mataImages, siblingImgByColor, fallbackArticleImg);
  const enrichedMain = {
    ...cleanedMain,
    imageUrl: matchedFromSibs?.imageUrl || cleanedMain.imageUrl || mainImages[0] || null,
    images: mainImages,
  };

  // Perbarui CatalogArticle.articleTotalStok agar katalog utama sinkron dengan stok Live terbaru
  if (cleanArticle && params.freshStockBySku && params.freshStockBySku.size > 0 && !params.storeOffline) {
    const updatedTotalStok = enrichedSiblings.reduce((sum, s) => sum + Math.max(0, Number(s.stok ?? 0)), 0);
    await prisma.catalogArticle
      .updateMany({
        where: { article: cleanArticle },
        data: {
          articleTotalStok: updatedTotalStok,
          updatedAt: new Date(),
        },
      })
      .catch(() => {});
  }

  return {
    success: true,
    sku: enrichedMain.sku,
    article: enrichedMain.article,
    stok: enrichedMain.stok ?? 0,
    barcode: enrichedMain.barcode,
    hargaNormal: enrichedMain.hargaNormal,
    totalVariantsUpdated: params.updatedVariants.length > 0 ? params.updatedVariants.length : enrichedSiblings.length,
    liveCheckedCount: params.liveCheckedCount,
    changedCount: params.changedCount,
    newVariantsDiscovered: params.newVariantsDiscovered,
    imagesMatched: extraImagesMatched,
    variants:
      params.updatedVariants.length > 0
        ? params.updatedVariants
        : enrichedSiblings.map((s) => ({ sku: s.sku, color: s.color, size: s.size, stok: s.stok ?? 0 })),
    data: enrichedMain,
    siblings: enrichedSiblings,
    storeOffline: params.storeOffline,
    ...(params.message ? { message: params.message } : {}),
  };
}

async function resolveDetailActionHash(activeCookie: string): Promise<boolean> {
  try {
    const html = await fetch(ITEM_CHECKER_URL, {
      headers: { Cookie: activeCookie },
      signal: AbortSignal.timeout(4000),
    }).then((r) => r.text());
    const matches = [...html.matchAll(/src="(\/_next\/static\/chunks\/[^"]+\.js)"/g)];
    for (const m of matches.slice(0, 12)) {
      const jsText = await fetch(`${STOREHUB_BASE}${m[1]}`, {
        signal: AbortSignal.timeout(3500),
      })
        .then((r) => r.text())
        .catch(() => '');
      const actMatch = jsText.match(/createServerReference\)?\("([a-f0-9]{40,44})"[^)]{0,160}"checkItemDetail"/);
      if (actMatch?.[1]) {
        ACTION_DETAIL = actMatch[1];
        return true;
      }
    }
  } catch {}
  return false;
}

export async function checkSingleItemStock(
  sku: string,
  options: CheckSingleItemOptions = {}
): Promise<CheckSingleItemResult> {
  const cleanSku = String(sku).trim();
  const discoverFamily = options.discoverFamily !== false;
  const withImages = options.withImages !== false;
  const syncAllSizes = options.syncAllSizes !== false;
  const emptyMata: MatahariFamilyImages = {
    variantSkus: [],
    imagesBySku: new Map(),
    imagesByColor: new Map(),
    defaultImages: [],
  };

  // Helper fallback anggun ke database Supabase (Product + BarcodeAlias) + backfill foto Matahari bila kurang
  const fallbackToDb = async (msg: string): Promise<CheckSingleItemResult> => {
    try {
      const cleanNorm = normalizeCodeKey(cleanSku);
      const candidates = buildInitialProbeCandidates(cleanSku).map((c) => c.code);
      let dbProduct = await prisma.product.findFirst({
        where: {
          OR: [
            { sku: { in: candidates } },
            { barcode: { in: candidates } },
          ],
        },
        select: { sku: true, barcode: true },
      });

      if (!dbProduct) {
        const alias = await prisma.barcodeAlias.findFirst({
          where: {
            OR: [
              { barcode: { in: candidates } },
              { barcodeNorm: cleanNorm },
            ],
          },
          select: { sku: true },
        });
        if (alias) {
          dbProduct = await prisma.product.findUnique({
            where: { sku: alias.sku },
            select: { sku: true, barcode: true },
          });
        }
      }

      if (!dbProduct) {
        return {
          success: false,
          sku: cleanSku,
          storeOffline: true,
          message: msg,
        };
      }

      return await finalizeProductFamilyResponse({
        mainSku: dbProduct.sku,
        fallbackBarcode: dbProduct.barcode,
        mataImages: emptyMata,
        withImages,
        updatedVariants: [],
        newVariantsDiscovered: 0,
        imagesMatched: 0,
        storeOffline: true,
        message: msg,
      });
    } catch {
      return {
        success: false,
        sku: cleanSku,
        message: msg,
      };
    }
  };

  /** Helper tunggal pemanggilan checkItemDetail StoreHub + parser Next.js RSC (mengembalikan allItems sekaligus) */
  const queryStoreHubDetail = async (
    kind: 'upc' | 'sku',
    code: string,
    activeCookie: string,
    timeoutMs: number = 5000
  ): Promise<{ itemData: any; allItems: any[]; authFailed: boolean; offline: boolean; actionExpired: boolean; cookie: string }> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(ITEM_CHECKER_URL, {
        method: 'POST',
        headers: {
          'Accept': 'text/x-component',
          'Content-Type': 'text/plain;charset=UTF-8',
          'Cookie': activeCookie,
          'Next-Action': ACTION_DETAIL,
          'Referer': ITEM_CHECKER_URL,
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15',
          'Next-Router-State-Tree': '%5B%22%22%2C%7B%22children%22%3A%5B%22(app)%22%2C%7B%22children%22%3A%5B%22item-checker%22%2C%7B%22children%22%3A%5B%22__PAGE__%22%2C%7B%7D%2Cnull%2Cnull%2C0%5D%7D%2Cnull%2Cnull%2C0%5D%7D%2Cnull%2Cnull%2C4%5D%7D%2Cnull%2C%22refetch%22%2C24%5D',
        },
        body: JSON.stringify([kind, code]),
        redirect: 'manual',
        signal: controller.signal,
      });
    } catch {
      clearTimeout(timeoutId);
      return { itemData: null, allItems: [], authFailed: false, offline: true, actionExpired: false, cookie: activeCookie };
    } finally {
      clearTimeout(timeoutId);
    }

    const updatedCookie = await persistRefreshedSessionIfAny(res, activeCookie);

    if (res.status === 404) {
      return { itemData: null, allItems: [], authFailed: false, offline: false, actionExpired: true, cookie: updatedCookie };
    }

    const redirectTarget = res.headers.get('location') || res.headers.get('x-action-redirect') || '';
    if (res.status === 401 || (res.status >= 300 && res.status < 400 && redirectTarget.includes('/login')) || redirectTarget.includes('/login')) {
      return { itemData: null, allItems: [], authFailed: true, offline: false, actionExpired: false, cookie: updatedCookie };
    }

    const text = await res.text();
    if (
      text.includes('504 Gateway') ||
      text.includes('Gateway Time-out') ||
      text.includes('no route to host') ||
      text.includes('unable to open tcp connection') ||
      res.status === 504
    ) {
      return { itemData: null, allItems: [], authFailed: false, offline: true, actionExpired: false, cookie: updatedCookie };
    }
    if (text.includes('NEXT_REDIRECT') && text.includes('/login')) {
      return { itemData: null, allItems: [], authFailed: true, offline: false, actionExpired: false, cookie: updatedCookie };
    }

    const allItems: any[] = [];
    let parsedItem: any = null;
    for (const line of text.split('\n')) {
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0 && colonIdx <= 3) {
        try {
          const parsed = JSON.parse(line.substring(colonIdx + 1));
          if (parsed?.error) {
            const errStr = String(parsed.error);
            if (errStr.includes('no route to host') || errStr.includes('tcp connection')) {
              return { itemData: null, allItems: [], authFailed: false, offline: true, actionExpired: false, cookie: updatedCookie };
            }
            if (/unauth|login|session|expired/i.test(errStr)) {
              return { itemData: null, allItems: [], authFailed: true, offline: false, actionExpired: false, cookie: updatedCookie };
            }
          }
          if (parsed?.result?.data && typeof parsed.result.data === 'object') {
            const entries = Object.entries(parsed.result.data);
            for (const [skuKey, val] of entries) {
              const rowList = Array.isArray(val) ? val : (val && typeof val === 'object' ? [val] : []);
              if (rowList.length === 0) continue;
              const matchedRow =
                kind === 'upc'
                  ? rowList.find((x: any) => String(x?.VendorBarcode || '').trim() === code)
                  : rowList.find((x: any) => String(x?.SKU || '').trim() === code);
              const chosen = matchedRow || rowList[rowList.length - 1] || rowList[0];
              if (chosen && typeof chosen === 'object') {
                const copy = { ...chosen };
                if (!copy.SKU && !copy.sku) copy.SKU = String(skuKey);
                copy._harvestedBarcodes = harvestBarcodes(rowList, copy);
                allItems.push(copy);
              }
            }
            if (allItems.length > 0) {
              parsedItem =
                allItems.find((it) =>
                  kind === 'upc'
                    ? String(it?.VendorBarcode || '').trim() === code
                    : String(it?.SKU || it?.sku || '').trim() === code
                ) || allItems[0];
              break;
            }
          }
        } catch {
          continue;
        }
      }
    }

    // Jika cookie expired/ditolak tanpa HTTP 307, Next.js RSC sering merender shell halaman (/login / ToastProvider / $Sreact.fragment)
    if (
      !parsedItem &&
      allItems.length === 0 &&
      !text.includes('"result"') &&
      (text.includes('$Sreact.fragment') ||
        text.includes('ToastProvider') ||
        text.includes('LoginForm') ||
        text.includes('/_next/static/chunks/') ||
        text.includes('/login'))
    ) {
      return { itemData: null, allItems: [], authFailed: true, offline: false, actionExpired: false, cookie: updatedCookie };
    }

    return { itemData: parsedItem, allItems, authFailed: false, offline: false, actionExpired: false, cookie: updatedCookie };
  };

  try {
    let cookie = await getStoreHubCookie().catch(() => null);
    if (!cookie) {
      return await fallbackToDb('Server by luqman org belum ada session aktif. Menampilkan stok tersimpan.');
    }

    const initialCandidates = buildInitialProbeCandidates(cleanSku);
    const firstProbe = initialCandidates[0] || { kind: 'sku' as const, code: cleanSku };

    let activeKind: 'upc' | 'sku' = firstProbe.kind;
    let queriedCode = firstProbe.code;
    let queryRes = await queryStoreHubDetail(activeKind, queriedCode, cookie);

    // Jika Next-Action hash berubah di StoreHub, resolve dinamis lalu retry 1x
    if (queryRes.actionExpired) {
      if (await resolveDetailActionHash(cookie)) {
        queryRes = await queryStoreHubDetail(activeKind, queriedCode, cookie);
      }
    }

    // Jika cookie expired (401 / redirect / HTTP 200 RSC shell), paksa auto-login lalu retry 1x
    if (queryRes.authFailed) {
      const freshCookie: string | null = await getStoreHubCookie(true, cookie).catch(() => null);
      if (freshCookie) {
        cookie = freshCookie;
        queryRes = await queryStoreHubDetail(activeKind, queriedCode, cookie);
      }
      if (queryRes.authFailed || queryRes.actionExpired) {
        if (await resolveDetailActionHash(cookie)) {
          queryRes = await queryStoreHubDetail(activeKind, queriedCode, cookie);
        }
      }
      if (queryRes.authFailed) {
        return await fallbackToDb('Sesi login StoreHub MDS BISA gagal diperbarui. Menampilkan stok tersimpan.');
      }
    }

    if (queryRes.offline) {
      return await fallbackToDb('Server toko fisik sedang istirahat (malam hari). Menampilkan stok tersimpan.');
    }

    // Jika jalur utama tidak menemukannya, coba kandidat alternatif (reverse kind, check-digit fix, prefix 234000 / 2*)
    if (!queryRes.itemData) {
      for (const cand of initialCandidates.slice(1)) {
        const altRes = await queryStoreHubDetail(cand.kind, cand.code, queryRes.cookie || cookie, 4000);
        if (altRes.cookie) cookie = altRes.cookie;
        if (altRes.offline) {
          return await fallbackToDb('Server toko fisik sedang istirahat (malam hari). Menampilkan stok tersimpan.');
        }
        if (altRes.itemData) {
          queryRes = altRes;
          activeKind = cand.kind;
          queriedCode = cand.code;
          break;
        }
      }
    }

    const itemData = queryRes.itemData;
    if (!itemData || itemData.error) {
      return await fallbackToDb('Produk tidak ditemukan di server toko maupun database lokal.');
    }

    const seedSku = String(itemData.SKU ?? itemData.sku ?? cleanSku).trim();
    const seedBarcode = itemData.VendorBarcode ? String(itemData.VendorBarcode).trim() : (activeKind === 'upc' ? queriedCode : null);
    let articleToSearch = sanitizeArticleCode(itemData.StyleCode ?? itemData.styleCode ?? itemData.article);

    const existingMain = await prisma.product.findUnique({
      where: { sku: seedSku },
      select: { article: true, barcode: true, imageUrl: true, stok: true },
    });
    if (!articleToSearch) {
      articleToSearch = sanitizeArticleCode(existingMain?.article);
    }

    // Tarik foto studio & daftar SKU varian dari Matahari.com + direct Shopify CDN bila diminta
    const seedBrand = String(itemData.Brand ?? itemData.brand ?? '').trim() || null;
    const seedDesc = String(itemData.Description ?? itemData.description ?? itemData.ItemName ?? itemData.itemName ?? '').trim() || null;
    const seedColor = String(itemData.Color ?? itemData.color ?? '').trim() || null;
    const mataImages = (discoverFamily || withImages)
      ? await fetchMatahariFamilyAndImages(seedSku, articleToSearch, seedBarcode || existingMain?.barcode || null, {
          brand: seedBrand,
          description: seedDesc,
          targetColor: seedColor,
          probeDirectCdn: true,
        }).catch(() => emptyMata)
      : emptyMata;

    // Peta foto sibling eksisting & stok DB Supabase saat ini (untuk deteksi perubahan 1x scan)
    const siblingImgByColor = new Map<string, string>();
    const existingFamilySkus = new Set<string>();
    const existingFamilyMap = new Map<string, { id: number; sku: string; color: string | null; size: string | null; stok: number }>();
    const existingFamilyBarcodes = new Set<string>();
    let fallbackArticleImg: string | null = existingMain?.imageUrl || mataImages.defaultImages[0] || null;
    if (articleToSearch) {
      const dbSibs = await prisma.product.findMany({
        where: { article: articleToSearch },
        select: { id: true, sku: true, barcode: true, color: true, size: true, stok: true, imageUrl: true },
      });
      for (const s of dbSibs) {
        existingFamilySkus.add(s.sku);
        existingFamilyMap.set(s.sku, { id: s.id, sku: s.sku, color: s.color, size: s.size, stok: s.stok });
        if (s.barcode) existingFamilyBarcodes.add(s.barcode);
        if (s.imageUrl) {
          if (!fallbackArticleImg) fallbackArticleImg = s.imageUrl;
          const cUp = String(s.color || '').trim().toUpperCase();
          if (cUp && !siblingImgByColor.has(cUp)) siblingImgByColor.set(cUp, s.imageUrl);
        }
      }
    }

    // 1. Upsert item utama + seluruh allItems yang ikut terbawa di payload awal
    const itemsToUpsert = queryRes.allItems.length > 0 ? queryRes.allItems : [itemData];
    const updatedVariants: LiveStockVariantSummary[] = [];
    const freshStockBySku = new Map<string, number>();
    const seenUpdatedSkus = new Set<string>();
    const liveCheckedSkus = new Set<string>();
    const probedKeys = new Set<string>([`sku:${seedSku}`, ...(seedBarcode ? [`upc:${seedBarcode}`] : [])]);
    let newVariantsDiscovered = 0;
    let imagesMatched = 0;
    let changedCount = 0;

    for (const rawIt of itemsToUpsert) {
      const rawSku = String(rawIt?.SKU ?? rawIt?.sku ?? '').trim();
      const rawDirectStok = rawIt?.StockOnHand ?? rawIt?.stockOnHand ?? rawIt?.stock_on_hand ?? rawIt?.soh;
      if (rawSku && rawDirectStok !== undefined && rawDirectStok !== null) {
        freshStockBySku.set(rawSku, parseInt(String(rawDirectStok), 10) || 0);
      }
      const saved = await upsertStoreHubItemToDb(rawIt, {
        queriedCode,
        queriedKind: activeKind,
        mataImages,
        siblingImgByColor,
        fallbackArticle: articleToSearch,
        fallbackArticleImg,
      });
      if (!saved) continue;
      freshStockBySku.set(saved.sku, saved.stok);
      liveCheckedSkus.add(saved.sku);
      const prevStok = existingFamilyMap.get(saved.sku)?.stok ?? (saved.sku === seedSku ? existingMain?.stok : undefined);
      if (saved.wasNewSku || (prevStok !== undefined && prevStok !== saved.stok)) {
        changedCount++;
      }
      probedKeys.add(`sku:${saved.sku}`);
      if (saved.barcode) probedKeys.add(`upc:${saved.barcode}`);
      if (saved.wasNewSku) newVariantsDiscovered++;
      if (saved.imageUpdated) imagesMatched++;
      if (!seenUpdatedSkus.has(saved.sku)) {
        seenUpdatedSkus.add(saved.sku);
        updatedVariants.push({ sku: saved.sku, color: saved.color, size: saved.size, stok: saved.stok });
      }
    }

    const resolvedSeedBarcode = seedBarcode || existingMain?.barcode || null;

    // 2. Sapu saudara se-keluarga artikel (Matahari variantSkus + tetangga SKU Modulo-10 + tetangga EAN-13)
    if (discoverFamily) {
      const neighborCandidates: Array<{ kind: 'sku' | 'upc'; code: string }> = [];
      const enqueueNeighbor = (kind: 'sku' | 'upc', code: string) => {
        const trimmed = String(code || '').trim();
        if (!trimmed) return;
        const k = `${kind}:${trimmed}`;
        if (!probedKeys.has(k)) {
          probedKeys.add(k);
          neighborCandidates.push({ kind, code: trimmed });
        }
      };

      for (const mSku of mataImages.variantSkus) {
        enqueueNeighbor('sku', mSku);
      }

      if (/^\d{8}$/.test(seedSku)) {
        const base7 = parseInt(seedSku.slice(0, 7), 10);
        for (let d = -8; d <= 8; d++) {
          if (d === 0 || base7 + d < 100000) continue;
          const nbSku = generateMdsSku8(base7 + d);
          if (nbSku) enqueueNeighbor('sku', nbSku);
        }
      }

      if (resolvedSeedBarcode && /^\d{13}$/.test(resolvedSeedBarcode)) {
        const pfx6 = resolvedSeedBarcode.slice(0, 6);
        const base6 = parseInt(resolvedSeedBarcode.slice(6, 12), 10);
        const minB = pfx6 === '234000' ? 1000 : 0;
        for (let d = -6; d <= 10; d++) {
          if (d === 0) continue;
          const nb6 = base6 + d;
          if (nb6 < minB || nb6 > 999999) continue;
          const d12 = `${pfx6}${String(nb6).padStart(6, '0')}`;
          const nbBc = `${d12}${calculateEan13CheckDigit(d12)}`;
          if (nbBc.length === 13) enqueueNeighbor('upc', nbBc);
        }
      }

      // Filter kandidat yang sudah ada di artikel target agar hemat waktu
      const probeQueue = neighborCandidates.filter((c) => {
        if (c.kind === 'sku') {
          return mataImages.variantSkus.includes(c.code) || !existingFamilySkus.has(c.code);
        }
        return !existingFamilyBarcodes.has(c.code);
      });

      const probeBudgetStart = Date.now();
      const BATCH_SIZE = 10;
      let hitOffline = false;
      for (let i = 0; i < probeQueue.length && !hitOffline; i += BATCH_SIZE) {
        if (Date.now() - probeBudgetStart >= 3500) break;
        const batch = probeQueue.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
          batch.map(async (c) => ({
            cand: c,
            res: await queryStoreHubDetail(c.kind, c.code, cookie!, 2500),
          }))
        );

        for (const { cand, res } of batchResults) {
          if (res.offline) {
            hitOffline = true;
            continue;
          }
          const foundList = res.allItems.length > 0 ? res.allItems : (res.itemData ? [res.itemData] : []);
          for (const foundRaw of foundList) {
            const foundArt = sanitizeArticleCode(foundRaw?.StyleCode ?? foundRaw?.styleCode ?? foundRaw?.article);
            const foundSku = String(foundRaw?.SKU ?? foundRaw?.sku ?? '').trim();
            const isMataFamilySku = mataImages.variantSkus.includes(foundSku);
            const sameArticle = Boolean(articleToSearch && foundArt && foundArt.toUpperCase() === articleToSearch.toUpperCase());

            // Upsert seluruh temuan baru valid, dan catat varian bila masih 1 keluarga artikel
            if (!sameArticle && !isMataFamilySku && articleToSearch && foundArt) {
              continue;
            }

            const saved = await upsertStoreHubItemToDb(foundRaw, {
              queriedCode: cand.code,
              queriedKind: cand.kind,
              mataImages,
              siblingImgByColor,
              fallbackArticle: sameArticle || isMataFamilySku ? articleToSearch : foundArt,
              fallbackArticleImg,
            });
            if (!saved) continue;
            freshStockBySku.set(saved.sku, saved.stok);
            liveCheckedSkus.add(saved.sku);
            const prevStok = existingFamilyMap.get(saved.sku)?.stok;
            if (saved.wasNewSku) {
              newVariantsDiscovered++;
              changedCount++;
            } else if (prevStok !== undefined && prevStok !== saved.stok) {
              changedCount++;
            }
            if (saved.imageUpdated) imagesMatched++;
            if (!seenUpdatedSkus.has(saved.sku)) {
              seenUpdatedSkus.add(saved.sku);
              updatedVariants.push({ sku: saved.sku, color: saved.color, size: saved.size, stok: saved.stok });
            }
          }
        }
      }
    }

    // 3. Sinkronkan relatedStock dari StoreHub ke seluruh varian warna/ukuran DB secara batch per qty
    if (articleToSearch && itemData.relatedStock && typeof itemData.relatedStock === 'object') {
      try {
        const siblings = await prisma.product.findMany({
          where: { article: articleToSearch },
          select: { id: true, sku: true, color: true, size: true, stok: true },
        });
        const normColor = (s: any) =>
          String(s || '')
            .trim()
            .toUpperCase()
            .replace(/\bMED\b|\bMDM\b/g, 'MEDIUM')
            .replace(/\bDRK\b/g, 'DARK')
            .replace(/\bLGT\b/g, 'LIGHT')
            .replace(/\bBLK\b/g, 'BLACK')
            .replace(/\bWHT\b/g, 'WHITE')
            .replace(/\bNVY\b/g, 'NAVY')
            .replace(/\bGRY\b/g, 'GREY')
            .replace(/[\s\-_./]+/g, '');
        const normSize = (s: any) => String(s || '').trim().toUpperCase().replace(/[\s\-_.]+/g, '');
        const idsByStock = new Map<number, number[]>();

        for (const sib of siblings) {
          if (seenUpdatedSkus.has(sib.sku)) continue;
          const sibColor = normColor(sib.color);
          const sibSize = normSize(sib.size);
          let foundQty: number | null = null;

          for (const [relColorKey, sizesObj] of Object.entries(itemData.relatedStock)) {
            const relColor = normColor(relColorKey);
            const colorMatched =
              relColor === sibColor ||
              (relColor.length >= 3 && sibColor.length >= 3 && (relColor.includes(sibColor) || sibColor.includes(relColor)));
            if (colorMatched) {
              if (sizesObj && typeof sizesObj === 'object') {
                for (const [relSizeKey, qtyVal] of Object.entries(sizesObj as Record<string, any>)) {
                  const relSize = normSize(relSizeKey);
                  if (relSize === sibSize) {
                    foundQty = parseInt(String(qtyVal), 10) || 0;
                    break;
                  }
                }
              }
            }
            if (foundQty !== null) break;
          }

          if (foundQty !== null) {
            freshStockBySku.set(sib.sku, foundQty);
            liveCheckedSkus.add(sib.sku);
            if (sib.stok !== foundQty) {
              changedCount++;
              const list = idsByStock.get(foundQty) || [];
              list.push(sib.id);
              idsByStock.set(foundQty, list);
            }
            seenUpdatedSkus.add(sib.sku);
            updatedVariants.push({ sku: sib.sku, color: sib.color, size: sib.size, stok: foundQty });
          }
        }
        if (idsByStock.size > 0) {
          const nowTs = new Date();
          await Promise.allSettled(
            Array.from(idsByStock.entries()).map(([qtyVal, idList]) =>
              prisma.product.updateMany({
                where: { id: { in: idList } },
                data: { stok: qtyVal, updatedAt: nowTs },
              })
            )
          );
        }
      } catch (sibErr) {
        console.warn('[MDS-CLIENT] Gagal update sibling variants:', sibErr);
      }
    }

    // 4. Pastikan SELURUH warna & size eksisting dalam artikel ini terupdate cepat di 1 klik!
    // Probe StoreHub secara paralel (batch 20) lalu batch-update ke PostgreSQL hanya yang stoknya berubah (bebas bottleneck upsert berulang).
    if (syncAllSizes && cookie) {
      const activeColorUp = String(itemData.COLOR ?? itemData.Color ?? itemData.color ?? '').trim().toUpperCase();
      const remainingFamilySkus = Array.from(existingFamilySkus)
        .filter((s) => s && !seenUpdatedSkus.has(s))
        .sort((a, b) => {
          const aSame = activeColorUp && String(existingFamilyMap.get(a)?.color || '').trim().toUpperCase() === activeColorUp ? 0 : 1;
          const bSame = activeColorUp && String(existingFamilyMap.get(b)?.color || '').trim().toUpperCase() === activeColorUp ? 0 : 1;
          return aSame - bSame;
        });

      if (remainingFamilySkus.length > 0) {
        const directProbeStart = Date.now();
        const DIRECT_BATCH = 20;
        const changedIdsByStock = new Map<number, number[]>();
        const newItemsToUpsert: Array<{ raw: any; code: string }> = [];
        let refreshedMidLoop = false;

        for (let i = 0; i < remainingFamilySkus.length; i += DIRECT_BATCH) {
          if (Date.now() - directProbeStart >= 15000) break;
          const batch = remainingFamilySkus.slice(i, i + DIRECT_BATCH);
          let batchRes = await Promise.all(
            batch.map(async (targetSibSku) => ({
              targetSibSku,
              res: await queryStoreHubDetail('sku', targetSibSku, cookie!, 3500),
            }))
          );

          const authFailedIndices: number[] = [];
          batchRes.forEach((entry, idx) => {
            if (entry.res.authFailed) authFailedIndices.push(idx);
          });
          if (authFailedIndices.length > 0 && !refreshedMidLoop) {
            refreshedMidLoop = true;
            const freshCookie: string | null = await getStoreHubCookie(true, cookie).catch(() => null);
            if (freshCookie) {
              cookie = freshCookie;
              const retried = await Promise.all(
                authFailedIndices.map(async (idx) => ({
                  idx,
                  res: await queryStoreHubDetail('sku', batch[idx], cookie!, 3500),
                }))
              );
              for (const { idx, res } of retried) {
                batchRes[idx] = { targetSibSku: batch[idx], res };
              }
            }
          }

          let abortedOffline = false;
          for (const { targetSibSku, res } of batchRes) {
            if (res.cookie && !res.authFailed) cookie = res.cookie;
            if (res.offline) {
              abortedOffline = true;
              continue;
            }
            const foundList = res.allItems.length > 0 ? res.allItems : (res.itemData ? [res.itemData] : []);
            for (const foundRaw of foundList) {
              const rawSku = String(foundRaw?.SKU ?? foundRaw?.sku ?? '').trim();
              const rawDirectStok = foundRaw?.StockOnHand ?? foundRaw?.stockOnHand ?? foundRaw?.stock_on_hand ?? foundRaw?.soh;
              if (!rawSku || rawDirectStok === undefined || rawDirectStok === null) continue;
              const liveStok = parseInt(String(rawDirectStok), 10);
              if (Number.isNaN(liveStok)) continue;

              freshStockBySku.set(rawSku, liveStok);
              liveCheckedSkus.add(rawSku);

              const existingSib = existingFamilyMap.get(rawSku);
              if (existingSib) {
                if (existingSib.stok !== liveStok) {
                  changedCount++;
                  const list = changedIdsByStock.get(liveStok) || [];
                  list.push(existingSib.id);
                  changedIdsByStock.set(liveStok, list);
                }
                if (!seenUpdatedSkus.has(rawSku)) {
                  seenUpdatedSkus.add(rawSku);
                  updatedVariants.push({
                    sku: rawSku,
                    color: existingSib.color,
                    size: existingSib.size,
                    stok: liveStok,
                  });
                }
              } else {
                newItemsToUpsert.push({ raw: foundRaw, code: rawSku || targetSibSku });
              }
            }
          }
          if (abortedOffline) break;
        }

        if (changedIdsByStock.size > 0) {
          const nowTs = new Date();
          await Promise.allSettled(
            Array.from(changedIdsByStock.entries()).map(([qtyVal, idList]) =>
              prisma.product.updateMany({
                where: { id: { in: idList } },
                data: { stok: qtyVal, updatedAt: nowTs },
              })
            )
          );
        }

        if (newItemsToUpsert.length > 0) {
          for (let i = 0; i < newItemsToUpsert.length; i += 5) {
            const upBatch = newItemsToUpsert.slice(i, i + 5);
            const savedList = await Promise.all(
              upBatch.map((it) =>
                upsertStoreHubItemToDb(it.raw, {
                  queriedCode: it.code,
                  queriedKind: 'sku',
                  mataImages,
                  siblingImgByColor,
                  fallbackArticle: articleToSearch,
                  fallbackArticleImg,
                })
              )
            );
            for (const saved of savedList) {
              if (!saved) continue;
              freshStockBySku.set(saved.sku, saved.stok);
              liveCheckedSkus.add(saved.sku);
              if (saved.wasNewSku) {
                newVariantsDiscovered++;
                changedCount++;
              }
              if (!seenUpdatedSkus.has(saved.sku)) {
                seenUpdatedSkus.add(saved.sku);
                updatedVariants.push({ sku: saved.sku, color: saved.color, size: saved.size, stok: saved.stok });
              }
            }
          }
        }
      }
    }

    return await finalizeProductFamilyResponse({
      mainSku: seedSku,
      fallbackBarcode: resolvedSeedBarcode,
      mataImages,
      withImages,
      updatedVariants,
      freshStockBySku,
      liveCheckedCount: liveCheckedSkus.size,
      changedCount,
      newVariantsDiscovered,
      imagesMatched,
      storeOffline: false,
    });
  } catch (err: any) {
    return {
      success: false,
      sku: cleanSku,
      message: err.message || 'Gagal menghubungi server by luqman org.',
    };
  }
}

/**
 * Pulihkan URL foto produk & seluruh varian artikel yang sudah 404/rotasi UUID di Shopify CDN
 * dengan mengambil ulang URL studio terbaru dari Matahari.com, lalu memperbarui DB PostgreSQL.
 */
export async function healProductImagesInDb(params: {
  sku?: string | null;
  article?: string | null;
  barcode?: string | null;
  targetColor?: string | null;
  force?: boolean;
}): Promise<{
  success: boolean;
  healed: boolean;
  updatedCount: number;
  matchedColors: string[];
  unmatchedColors: string[];
  activeColorMatched: boolean;
  message: string;
  data?: any;
  siblings?: any[];
}> {
  const cleanSku = String(params.sku || '').trim();
  const cleanArticle = sanitizeArticleCode(params.article);
  const cleanBarcode = String(params.barcode || '').trim() || null;

  let dbMain = cleanSku ? await prisma.product.findUnique({ where: { sku: cleanSku } }) : null;
  if (!dbMain && cleanArticle) {
    dbMain = await prisma.product.findFirst({ where: { article: cleanArticle } });
  }
  if (!dbMain && cleanBarcode) {
    dbMain = await prisma.product.findFirst({ where: { barcode: cleanBarcode } });
  }
  if (!dbMain) {
    return {
      success: false,
      healed: false,
      updatedCount: 0,
      matchedColors: [],
      unmatchedColors: [],
      activeColorMatched: false,
      message: 'Produk tidak ditemukan di database.',
    };
  }

  let siblings = await getProductSiblings(checkAndCleanPromo(dbMain));
  if (!siblings || siblings.length === 0) {
    siblings = [checkAndCleanPromo(dbMain)];
  }

  const skuToNormColor = new Map<string, string>();
  const normColorToDisplay = new Map<string, string>();
  const familySkus: string[] = [];
  const familyBarcodes: string[] = [];
  for (const sib of siblings) {
    const s = String(sib.sku || '').trim();
    if (!s) continue;
    familySkus.push(s);
    if (sib.barcode) familyBarcodes.push(String(sib.barcode).trim());
    const disp = String(sib.color || '').trim().toUpperCase();
    const norm = normalizeRetailColorKey(disp);
    if (norm) {
      skuToNormColor.set(s, norm);
      if (!normColorToDisplay.has(norm) && disp) normColorToDisplay.set(norm, disp);
    }
  }

  // Kumpulkan galeri eksisting per warna dengan proteksi kepemilikan SKU (anti foto beda warna)
  const existingTrueColorGalleries = new Map<string, string[]>();
  for (const sib of siblings) {
    const normColor = normalizeRetailColorKey(sib.color);
    if (!normColor) continue;
    const candidates: string[] = [
      ...(Array.isArray(sib.images) ? sib.images : []),
      ...(sib.imageUrl ? [sib.imageUrl] : []),
    ];
    const validOwned: string[] = [];
    for (const rawU of candidates) {
      const normU = normalizeMatahariImageUrl(rawU);
      if (!normU) continue;
      const ownerSku = extractSkuFromShopifyUrl(normU);
      if (ownerSku && skuToNormColor.has(ownerSku) && skuToNormColor.get(ownerSku) !== normColor) {
        continue; // Tolak foto yang namanya milik SKU warna lain!
      }
      pushUniqueUrl(validOwned, normU, 8);
    }
    if (validOwned.length > 0) {
      const existingList = existingTrueColorGalleries.get(normColor) || [];
      if (validOwned.length > existingList.length) {
        existingTrueColorGalleries.set(normColor, validOwned);
      } else {
        for (const u of validOwned) pushUniqueUrl(existingList, u, 8);
        existingTrueColorGalleries.set(normColor, existingList);
      }
    }
  }

  const artToUse = sanitizeArticleCode(dbMain.article) || cleanArticle;
  const activeColorLabel = String(params.targetColor || dbMain.color || '').trim().toUpperCase();
  const mataImages = await fetchMatahariFamilyAndImages(
    dbMain.sku,
    artToUse,
    dbMain.barcode || cleanBarcode,
    {
      familySkus,
      familyBarcodes,
      familyColorBySku: skuToNormColor,
      brand: dbMain.brand,
      description: dbMain.description,
      targetColor: activeColorLabel,
      probeDirectCdn: true,
    }
  );

  const matchedNormColors = new Set<string>();
  const unmatchedNormColors = new Set<string>();
  const dbUpdates: Promise<any>[] = [];
  let healedCount = 0;

  const updatedSiblings = siblings.map((sib) => {
    const skuKey = String(sib.sku || '').trim();
    const colorUp = String(sib.color || '').trim().toUpperCase();
    const normColor = normalizeRetailColorKey(colorUp);
    const trueGallery: string[] = [];

    for (const u of mataImages.imagesBySku.get(skuKey) || []) pushUniqueUrl(trueGallery, u, 8);
    if (normColor) {
      for (const u of mataImages.imagesByColor.get(normColor) || []) pushUniqueUrl(trueGallery, u, 8);
    }
    if (colorUp && colorUp !== normColor) {
      for (const u of mataImages.imagesByColor.get(colorUp) || []) pushUniqueUrl(trueGallery, u, 8);
    }
    if (trueGallery.length === 0 && normColor) {
      for (const u of existingTrueColorGalleries.get(normColor) || []) pushUniqueUrl(trueGallery, u, 8);
    }

    if (trueGallery.length > 0) {
      if (normColor) matchedNormColors.add(normColor);
    } else if (normColor) {
      unmatchedNormColors.add(normColor);
    }

    // Pertahankan fallback hanya bila belum ada foto true-color sama sekali agar tampilan tidak blank
    const finalList: string[] =
      trueGallery.length > 0
        ? trueGallery
        : [
            ...(Array.isArray(sib.images) && sib.images.length > 0 ? sib.images : sib.imageUrl ? [sib.imageUrl] : []),
            ...mataImages.defaultImages,
          ].filter((v, idx, arr) => Boolean(v) && arr.indexOf(v) === idx).slice(0, 8);

    if (trueGallery.length === 0 && finalList.length === 0) return sib;

    const targetPrimary = finalList[0];
    const samePrimary = sib.imageUrl === targetPrimary;
    const sameGallery =
      Array.isArray(sib.images) &&
      sib.images.length === finalList.length &&
      sib.images.every((u: string, i: number) => u === finalList[i]);

    // Hanya update DB jika ada foto true-color baru/perbaikan, ATAU SKU sebelumnya belum punya foto sama sekali
    const shouldWriteDb = (trueGallery.length > 0 || !sib.imageUrl) && (!samePrimary || !sameGallery);
    if (shouldWriteDb && targetPrimary) {
      healedCount++;
      dbUpdates.push(
        prisma.product
          .update({
            where: { sku: skuKey },
            data: {
              imageUrl: targetPrimary,
              images: finalList,
            },
          })
          .catch(() => {})
      );
    }

    return {
      ...sib,
      imageUrl: targetPrimary || sib.imageUrl,
      images: finalList.length > 0 ? finalList : sib.images,
    };
  });

  if (artToUse) {
    const mainMatch = updatedSiblings.find((s) => s.sku === dbMain!.sku);
    const catalogImg = mainMatch?.imageUrl || mataImages.defaultImages[0];
    if (catalogImg) {
      dbUpdates.push(
        prisma.catalogArticle
          .updateMany({
            where: { article: artToUse },
            data: { imageUrl: catalogImg },
          })
          .catch(() => {})
      );
    }
  }

  if (dbUpdates.length > 0) {
    await Promise.allSettled(dbUpdates);
  }

  const enrichedMain =
    updatedSiblings.find((s) => s.sku === dbMain!.sku) || updatedSiblings[0];

  const matchedColors = Array.from(matchedNormColors).map((n) => normColorToDisplay.get(n) || n);
  const unmatchedColors = Array.from(unmatchedNormColors)
    .filter((n) => !matchedNormColors.has(n))
    .map((n) => normColorToDisplay.get(n) || n);

  const activeNormColor = normalizeRetailColorKey(activeColorLabel);
  const activeColorMatched = activeNormColor ? matchedNormColors.has(activeNormColor) : matchedColors.length > 0;

  let message = '';
  if (healedCount > 0) {
    const extraMissing =
      unmatchedColors.length > 0 ? ` (${unmatchedColors.join(', ')} belum diunggah Matahari.com)` : '';
    message = `📸 ${healedCount} varian diperbarui foto resminya (${matchedColors.join(', ') || 'tersinkron'}).${extraMissing}`;
  } else if (activeColorMatched) {
    message = `Foto warna ${activeColorLabel || 'aktif'} sudah paling baru & sinkron.`;
  } else {
    message = `Foto warna ${activeColorLabel || 'terpilih'} belum tersedia di katalog online Matahari.com (${matchedColors.length > 0 ? `warna tersedia: ${matchedColors.join(', ')}` : 'tidak ditemukan'}).`;
  }

  return {
    success: true,
    healed: healedCount > 0 || matchedColors.length > 0,
    updatedCount: healedCount,
    matchedColors,
    unmatchedColors,
    activeColorMatched,
    message,
    data: enrichedMain,
    siblings: updatedSiblings,
  };
}
