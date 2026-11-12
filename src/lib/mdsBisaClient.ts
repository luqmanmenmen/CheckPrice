/**
 * MDS BISA (StoreHub) Client for Realtime Single-Item Queries
 * Digunakan untuk tombol "⚡ Cek Live Stok 1 SKU" langsung dari kasir/SPG
 */

import { prisma } from './prisma';

const STOREHUB_BASE = 'https://storehub.mdsretailing.id';
const LOGIN_URL = `${STOREHUB_BASE}/login?next=%2F`;
const ITEM_CHECKER_URL = `${STOREHUB_BASE}/item-checker`;

const ACTION_LOGIN = '6071833df0be708d73972db0a7dc0c7c83eb3d41f3';
let ACTION_DETAIL = '608e569ea77f8871817d11afae932ecea7d0fcbd09';

const CREDENTIALS = {
  username: 'M223515',
  password: 'Mamen123',
  tz: 'Asia/Jakarta',
};

// In-memory cookie cache (session StoreHub bertahan ~20 menit)
let cachedCookie: string | null = null;
let cookieCachedAt: number = 0;
const COOKIE_TTL_MS = 10 * 60 * 1000; // 10 menit (pendek agar selalu sinkron dengan Storage)

export function isStoreOpen(): boolean {
  const now = new Date();
  const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const hour = wib.getUTCHours();
  const minute = wib.getUTCMinutes();
  const totalMinutes = hour * 60 + minute;
  // Buka 09:00 (540) sampai 21:30 (1290)
  return totalMinutes >= 540 && totalMinutes <= 1290;
}

/** Hitung GS1 EAN-13 check digit yang valid (digunakan saat koreksi salah ketik 1 digit terakhir barcode 234000*) */
export function calculateEan13CheckDigit(digits12: string): string {
  if (!/^\d{12}$/.test(digits12)) return '';
  let total = 0;
  for (let i = 0; i < 12; i++) {
    total += parseInt(digits12[i], 10) * (i % 2 === 0 ? 1 : 3);
  }
  return String((10 - (total % 10)) % 10);
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

export async function getStoreHubCookie(forceRefresh: boolean = false): Promise<string> {
  const now = Date.now();
  if (!forceRefresh && cachedCookie && cachedCookie.includes('mso_session') && (now - cookieCachedAt) < COOKIE_TTL_MS) {
    return cachedCookie;
  }

  // 1. Jika ada env MDS_SESSION_COOKIE yang memiliki mso_session, gunakan itu
  if (!forceRefresh && process.env.MDS_SESSION_COOKIE && process.env.MDS_SESSION_COOKIE.includes('mso_session')) {
    cachedCookie = process.env.MDS_SESSION_COOKIE.trim();
    cookieCachedAt = now;
    return cachedCookie;
  }

  // 2. Ambil dari Supabase Storage (secrets/mds_cookie.txt) — WAJIB berisi mso_session!
  try {
    const { supabase } = await import('@/lib/supabaseClient');
    const { data, error } = await supabase.storage.from('excel-uploads').download('secrets/mds_cookie.txt');
    if (data && !error) {
      const cookie = (await data.text()).trim();
      if (cookie && cookie.includes('mso_session')) {
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
      const loginHtmlRes = await fetch(LOGIN_URL, { method: 'GET' });
      const loginHtml = await loginHtmlRes.text();
      const scriptMatches = [...loginHtml.matchAll(/src="(\/_next\/static\/chunks\/[^"]+\.js)"/g)];
      for (const m of scriptMatches.slice(0, 12)) {
        const jsText = await fetch(`${STOREHUB_BASE}${m[1]}`).then(r => r.text()).catch(() => '');
        const actMatch = jsText.match(/createServerReference\)?\("([a-f0-9]{40,44})"[^)]*"login"/);
        if (actMatch?.[1]) {
          loginActionHash = actMatch[1];
          break;
        }
      }
    } catch {}

    const fd = new FormData();
    fd.append('0', '[{},"$K1"]');
    fd.append('_1_next', '/');
    fd.append('_1_username', CREDENTIALS.username);
    fd.append('_1_password', CREDENTIALS.password);
    fd.append('_1_tz', CREDENTIALS.tz);

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
    });

    const getSetCookie = (res.headers as any).getSetCookie;
    const rawList: string[] = typeof getSetCookie === 'function'
      ? getSetCookie.call(res.headers)
      : (res.headers.get('set-cookie') || '').split(/,(?=\s*[A-Za-z0-9_-]+=)/);
    const sessionCookie = rawList.map(c => c.split(';')[0].trim()).filter(Boolean).join('; ');

    // HANYA terima cookie yang benar-benar memiliki mso_session (JANGAN pernah simpan db76d-only!)
    if (sessionCookie && sessionCookie.includes('mso_session=')) {
      cachedCookie = sessionCookie;
      cookieCachedAt = now;
      return sessionCookie;
    }
  } catch (e) {
    console.warn('[MDS-CLIENT] Auto-login error:', e);
  }

  throw new Error('Gagal mendapatkan session login by luqman org (mso_session tidak ditemukan)');
}

export async function checkSingleItemStock(sku: string): Promise<{
  success: boolean;
  sku: string;
  stok?: number;
  barcode?: string | null;
  article?: string | null;
  hargaNormal?: number | null;
  totalVariantsUpdated?: number;
  variants?: Array<{ sku: string; color?: string | null; size?: string | null; stok: number }>;
  storeOffline?: boolean;
  message?: string;
}> {
  const cleanSku = String(sku).trim();

  const normalizeCodeKey = (val: string) => val.replace(/[\s\-_]/g, '').toUpperCase();

  const harvestBarcodes = (rows: any[], primaryItem?: any): string[] => {
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
  };

  // Helper untuk fallback anggun ke database Supabase (Product + BarcodeAlias)
  const fallbackToDb = async (msg: string) => {
    try {
      const cleanNorm = normalizeCodeKey(cleanSku);
      let dbProduct = await prisma.product.findFirst({
        where: { OR: [{ sku: cleanSku }, { barcode: cleanSku }] },
        select: { sku: true, stok: true, barcode: true, article: true, hargaNormal: true }
      });
      if (!dbProduct) {
        const alias = await prisma.barcodeAlias.findFirst({
          where: { OR: [{ barcode: cleanSku }, { barcodeNorm: cleanNorm }] },
          select: { sku: true }
        });
        if (alias) {
          dbProduct = await prisma.product.findUnique({
            where: { sku: alias.sku },
            select: { sku: true, stok: true, barcode: true, article: true, hargaNormal: true }
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
      let variants: Array<{ sku: string; color?: string | null; size?: string | null; stok: number }> = [];
      if (dbProduct.article) {
        const siblings = await prisma.product.findMany({
          where: { article: dbProduct.article },
          select: { sku: true, color: true, size: true, stok: true }
        });
        variants = siblings.map(s => ({ sku: s.sku, color: s.color, size: s.size, stok: s.stok }));
      }
      return {
        success: true,
        sku: dbProduct.sku,
        stok: dbProduct.stok ?? 0,
        barcode: dbProduct.barcode,
        article: dbProduct.article,
        hargaNormal: dbProduct.hargaNormal,
        variants,
        storeOffline: true,
        message: msg,
      };
    } catch {
      return {
        success: false,
        sku: cleanSku,
        message: msg,
      };
    }
  };

  /** Helper tunggal pemanggilan checkItemDetail StoreHub + parser Next.js RSC */
  const queryStoreHubDetail = async (
    kind: 'upc' | 'sku',
    code: string,
    activeCookie: string
  ): Promise<{ itemData: any; authFailed: boolean; offline: boolean; actionExpired: boolean; cookie: string }> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
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
      return { itemData: null, authFailed: false, offline: true, actionExpired: false, cookie: activeCookie };
    } finally {
      clearTimeout(timeoutId);
    }

    const updatedCookie = await persistRefreshedSessionIfAny(res, activeCookie);

    if (res.status === 404) {
      return { itemData: null, authFailed: false, offline: false, actionExpired: true, cookie: updatedCookie };
    }

    const redirectTarget = res.headers.get('location') || res.headers.get('x-action-redirect') || '';
    if (res.status === 401 || (res.status >= 300 && res.status < 400 && redirectTarget.includes('/login')) || redirectTarget.includes('/login')) {
      return { itemData: null, authFailed: true, offline: false, actionExpired: false, cookie: updatedCookie };
    }

    const text = await res.text();
    if (text.includes('504 Gateway') || text.includes('Gateway Time-out') || text.includes('no route to host') || res.status === 504) {
      return { itemData: null, authFailed: false, offline: true, actionExpired: false, cookie: updatedCookie };
    }
    if (text.includes('NEXT_REDIRECT') && text.includes('/login')) {
      return { itemData: null, authFailed: true, offline: false, actionExpired: false, cookie: updatedCookie };
    }

    let parsedItem: any = null;
    for (const line of text.split('\n')) {
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0 && colonIdx <= 3) {
        try {
          const parsed = JSON.parse(line.substring(colonIdx + 1));
          if (parsed?.result?.data?.[code] && Array.isArray(parsed.result.data[code])) {
            const rows = parsed.result.data[code];
            const matchUpc = kind === 'upc' ? rows.find((x: any) => String(x?.VendorBarcode || '').trim() === code) : null;
            parsedItem = matchUpc || rows[rows.length - 1] || rows[0];
            if (parsedItem && typeof parsedItem === 'object') {
              parsedItem._harvestedBarcodes = harvestBarcodes(rows, parsedItem);
            }
            break;
          }
          if (parsed?.result?.data) {
            const allRows: any[] = [];
            for (const val of Object.values(parsed.result.data)) {
              if (Array.isArray(val)) allRows.push(...val);
              else if (val && typeof val === 'object') allRows.push(val);
            }
            const first = Object.values(parsed.result.data)[0];
            if (Array.isArray(first)) {
              const matchUpc = kind === 'upc' ? first.find((x: any) => String(x?.VendorBarcode || '').trim() === code) : null;
              parsedItem = matchUpc || first[first.length - 1] || first[0];
            } else {
              parsedItem = first;
            }
            if (parsedItem && typeof parsedItem === 'object') {
              parsedItem._harvestedBarcodes = harvestBarcodes(allRows, parsedItem);
            }
            break;
          }
        } catch {
          continue;
        }
      }
    }
    return { itemData: parsedItem, authFailed: false, offline: false, actionExpired: false, cookie: updatedCookie };
  };

  try {
    let cookie = await getStoreHubCookie().catch(() => null);
    if (!cookie) {
      return await fallbackToDb('Server by luqman org belum ada session aktif. Menampilkan stok tersimpan.');
    }

    const isLikelySku = /^\d{7,9}$/.test(cleanSku);
    const isUpc = !isLikelySku && (cleanSku.length >= 10 || /[^0-9]/.test(cleanSku) || cleanSku.length <= 6);
    let activeKind: 'upc' | 'sku' = isUpc ? 'upc' : 'sku';

    let queryRes = await queryStoreHubDetail(activeKind, cleanSku, cookie);

    // Jika Next-Action hash berubah di StoreHub, resolve dinamis lalu retry 1x
    if (queryRes.actionExpired) {
      try {
        const html = await fetch(ITEM_CHECKER_URL, { headers: { Cookie: cookie } }).then(r => r.text());
        const matches = [...html.matchAll(/src="(\/_next\/static\/chunks\/[^"]+\.js)"/g)];
        for (const m of matches.slice(0, 12)) {
          const jsText = await fetch(`${STOREHUB_BASE}${m[1]}`).then(r => r.text()).catch(() => '');
          const actMatch = jsText.match(/createServerReference\)?\("([a-f0-9]{40,44})"[^)]*"checkItemDetail"/);
          if (actMatch?.[1]) {
            ACTION_DETAIL = actMatch[1];
            queryRes = await queryStoreHubDetail(activeKind, cleanSku, cookie);
            break;
          }
        }
      } catch {}
    }

    // Jika cookie expired (401 / redirect / empty), paksa muat ulang dari Supabase Storage / auto-login dan retry 1x
    if (queryRes.authFailed) {
      const freshCookie = await getStoreHubCookie(true).catch(() => null);
      if (freshCookie && freshCookie !== cookie) {
        cookie = freshCookie;
        queryRes = await queryStoreHubDetail(activeKind, cleanSku, cookie);
      }
    }

    if (queryRes.offline) {
      return await fallbackToDb('Server toko fisik sedang istirahat (malam hari). Menampilkan stok tersimpan.');
    }

    let queriedCode = cleanSku;
    // Fleksibel: jika pencarian jalur pertama kosong, coba jalur kebalikan (upc <-> sku)
    if (!queryRes.itemData && !queryRes.offline) {
      const altKind: 'upc' | 'sku' = activeKind === 'upc' ? 'sku' : 'upc';
      const altRes = await queryStoreHubDetail(altKind, cleanSku, queryRes.cookie || cookie);
      if (altRes.itemData) {
        queryRes = altRes;
        activeKind = altKind;
      }
    }

    // Smart Fallback: Jika user mengetik manual barcode 13 digit (234000* atau EAN-13) dengan 1 salah check digit
    if (!queryRes.itemData && /^\d{13}$/.test(cleanSku)) {
      const validCd = calculateEan13CheckDigit(cleanSku.slice(0, 12));
      const correctedBarcode = cleanSku.slice(0, 12) + validCd;
      if (correctedBarcode !== cleanSku) {
        const correctedRes = await queryStoreHubDetail('upc', correctedBarcode, queryRes.cookie || cookie);
        if (correctedRes.itemData) {
          queryRes = correctedRes;
          queriedCode = correctedBarcode;
          activeKind = 'upc';
        }
      }
    }

    const itemData = queryRes.itemData;
    if (!itemData || itemData.error) {
      return await fallbackToDb('Produk tidak ditemukan di server by luqman org maupun sistem.');
    }

    // 1. Ekstraksi nilai stok, barcode, artikel, warna, ukuran, brand, dan dept yang akurat
    let currentSkuStok = 0;
    const directStok = itemData.StockOnHand ?? itemData.stockOnHand ?? itemData.stock_on_hand ?? itemData.soh;
    if (directStok !== undefined && directStok !== null) {
      currentSkuStok = parseInt(String(directStok), 10) || 0;
    }

    const barcode = itemData.VendorBarcode ?? itemData.vendorBarcode ?? itemData.barcode ?? null;
    const article = itemData.StyleCode ?? itemData.styleCode ?? itemData.article ?? null;
    const itemColor = itemData.COLOR ?? itemData.Color ?? itemData.color ?? null;
    const itemSize = itemData.Size ?? itemData.SIZE ?? itemData.size ?? null;
    const { brand: normalizedBrand, dept: normalizedDept } = normalizeBrandAndDept(itemData);

    // Parse harga normal ritel
    const rawPrice = itemData.RetailPrice ?? itemData.retailPrice ?? itemData.price;
    let hargaNormal: number | null = null;
    if (rawPrice) {
      let str = String(rawPrice).trim();
      if (/\.\d{4,}$/.test(str) || /\.00$/.test(str)) {
        str = str.split('.')[0];
      }
      const cleaned = str.replace(/[^0-9]/g, '');
      hargaNormal = cleaned ? parseInt(cleaned, 10) : null;
    }

    const itemSku = String(itemData.SKU ?? itemData.sku ?? cleanSku).trim();

    // 2. Cari seluruh varian produk dari ARTIKEL ini di database Supabase
    let articleToSearch = article ? String(article).trim() : null;
    const existingProduct = await prisma.product.findUnique({
      where: { sku: itemSku },
      select: { article: true, barcode: true },
    });
    if (!articleToSearch) {
      articleToSearch = existingProduct?.article || null;
    }

    const allDiscoveredBarcodes: string[] = Array.isArray(itemData._harvestedBarcodes)
      ? [...itemData._harvestedBarcodes]
      : [];
    const primaryCandidate = barcode ? String(barcode).trim() : (activeKind === 'upc' ? queriedCode : null);
    if (primaryCandidate && !allDiscoveredBarcodes.includes(primaryCandidate)) {
      allDiscoveredBarcodes.unshift(primaryCandidate);
    }
    if (activeKind === 'upc' && queriedCode && !allDiscoveredBarcodes.includes(queriedCode)) {
      allDiscoveredBarcodes.push(queriedCode);
    }

    const updatedVariants: Array<{ sku: string; color?: string | null; size?: string | null; stok: number }> = [];
    const resolvedBarcode = primaryCandidate || existingProduct?.barcode || null;

    // Update atau insert produk baru secara instan ke Supabase (hindari menimpa barcode unik SKU lain)
    try {
      const updateData: any = {
        stok: currentSkuStok,
        updatedAt: new Date(),
      };
      if (resolvedBarcode && !existingProduct?.barcode) updateData.barcode = resolvedBarcode;
      if (articleToSearch) updateData.article = articleToSearch;
      if (itemColor) updateData.color = String(itemColor).trim();
      if (itemSize) updateData.size = String(itemSize).trim();
      if (normalizedBrand) updateData.brand = normalizedBrand;
      if (normalizedDept) updateData.dept = normalizedDept;
      if (hargaNormal && hargaNormal > 0) updateData.hargaNormal = hargaNormal;

      await prisma.product.upsert({
        where: { sku: itemSku },
        update: updateData,
        create: {
          sku: itemSku,
          barcode: resolvedBarcode,
          article: articleToSearch || 'PRODUK BARU',
          description: String(itemData.Description || itemData.ItemDescription || articleToSearch || 'PRODUK BARU').trim(),
          brand: normalizedBrand,
          dept: normalizedDept,
          color: itemColor ? String(itemColor).trim() : null,
          size: itemSize ? String(itemSize).trim() : null,
          hargaNormal: hargaNormal || 0,
          stok: currentSkuStok,
          updatedAt: new Date(),
        }
      });

      // Simpan SEMUA barcode (utama + vendor + alias) agar 1 SKU punya banyak barcode valid tetap tembus scan!
      for (const bCode of allDiscoveredBarcodes) {
        const cleanBc = String(bCode).trim();
        if (!cleanBc || cleanBc === itemSku) continue;
        await prisma.barcodeAlias.upsert({
          where: { barcode: cleanBc },
          update: { barcodeNorm: normalizeCodeKey(cleanBc), sku: itemSku, source: 'MDS_LIVE', updatedAt: new Date() },
          create: { barcode: cleanBc, barcodeNorm: normalizeCodeKey(cleanBc), sku: itemSku, source: 'MDS_LIVE' },
        }).catch(() => {});
      }

      updatedVariants.push({ sku: itemSku, color: itemColor, size: itemSize, stok: currentSkuStok });
    } catch (e) {
      console.warn('Gagal upsert main SKU:', e);
    }

    // 3. Jika ada artikel dan relatedStock dari StoreHub: perbarui SELURUH varian (warna & ukuran)
    if (articleToSearch && itemData.relatedStock && typeof itemData.relatedStock === 'object') {
      try {
        const siblings = await prisma.product.findMany({
          where: { article: articleToSearch },
          select: { id: true, sku: true, color: true, size: true, stok: true },
        });

        const normalize = (s: any) => String(s || '').trim().toUpperCase();

        for (const sib of siblings) {
          if (sib.sku === itemSku) continue;

          const sibColor = normalize(sib.color);
          const sibSize = normalize(sib.size);

          let foundQty: number | null = null;

          for (const [relColorKey, sizesObj] of Object.entries(itemData.relatedStock)) {
            const relColor = normalize(relColorKey);
            if (relColor === sibColor || relColor.includes(sibColor) || sibColor.includes(relColor)) {
              if (sizesObj && typeof sizesObj === 'object') {
                for (const [relSizeKey, qtyVal] of Object.entries(sizesObj as Record<string, any>)) {
                  const relSize = normalize(relSizeKey);
                  if (relSize === sibSize || relSize.includes(sibSize) || sibSize.includes(relSize)) {
                    foundQty = parseInt(String(qtyVal), 10) || 0;
                    break;
                  }
                }
              }
            }
            if (foundQty !== null) break;
          }

          if (foundQty !== null) {
            await prisma.product.update({
              where: { id: sib.id },
              data: { stok: foundQty, updatedAt: new Date() },
            });
            updatedVariants.push({ sku: sib.sku, color: sib.color, size: sib.size, stok: foundQty });
          }
        }
      } catch (sibErr) {
        console.warn('Gagal update sibling variants:', sibErr);
      }
    }

    // Penting: Kembalikan itemSku (SKU 8-digit asli di DB), bukan cleanSku (yang bisa berupa barcode 13-digit)
    return {
      success: true,
      sku: itemSku,
      article: articleToSearch,
      stok: currentSkuStok,
      barcode: resolvedBarcode,
      hargaNormal,
      totalVariantsUpdated: updatedVariants.length,
      variants: updatedVariants,
      storeOffline: false,
    };
  } catch (err: any) {
    return {
      success: false,
      sku: cleanSku,
      message: err.message || 'Gagal menghubungi server by luqman org.',
    };
  }
}

