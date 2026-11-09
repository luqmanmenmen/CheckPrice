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
const COOKIE_TTL_MS = 15 * 60 * 1000; // 15 menit

export function isStoreOpen(): boolean {
  const now = new Date();
  const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const hour = wib.getUTCHours();
  const minute = wib.getUTCMinutes();
  const totalMinutes = hour * 60 + minute;
  // Buka 09:00 (540) sampai 21:30 (1290)
  return totalMinutes >= 540 && totalMinutes <= 1290;
}

export async function getStoreHubCookie(): Promise<string> {
  const now = Date.now();
  if (cachedCookie && (now - cookieCachedAt) < COOKIE_TTL_MS) {
    return cachedCookie;
  }

  // 1. Jika ada env MDS_SESSION_COOKIE, gunakan itu
  if (process.env.MDS_SESSION_COOKIE) {
    cachedCookie = process.env.MDS_SESSION_COOKIE;
    cookieCachedAt = now;
    return cachedCookie;
  }

  // 2. Ambil dari Supabase Storage (secrets/mds_cookie.txt)
  try {
    const { supabase } = await import('@/lib/supabaseClient');
    const { data, error } = await supabase.storage.from('excel-uploads').download('secrets/mds_cookie.txt');
    if (data && !error) {
      const cookie = (await data.text()).trim();
      if (cookie && cookie.length > 10) {
        cachedCookie = cookie;
        cookieCachedAt = now;
        return cachedCookie;
      }
    }
  } catch (e) {
    console.warn('[MDS-CLIENT] Gagal membaca cookie dari Storage:', e);
  }

  // 3. Fallback Auto-login ke StoreHub
  try {
    const formData = new URLSearchParams();
    formData.append('next', '/');
    formData.append('username', CREDENTIALS.username);
    formData.append('password', CREDENTIALS.password);
    formData.append('tz', CREDENTIALS.tz);

    const res = await fetch(LOGIN_URL, {
      method: 'POST',
      headers: {
        'Accept': 'text/x-component',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Next-Action': ACTION_LOGIN,
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15',
        'Referer': LOGIN_URL,
      },
      body: formData.toString(),
      redirect: 'manual',
    });

    const setCookieHeader = res.headers.get('set-cookie') || '';
    const cookiesList = setCookieHeader.split(',').map(c => c.split(';')[0].trim());
    const sessionCookie = cookiesList.join('; ');

    if (sessionCookie && (sessionCookie.includes('mso_session') || sessionCookie.includes('db76d'))) {
      cachedCookie = sessionCookie;
      cookieCachedAt = now;
      return sessionCookie;
    }
  } catch (e) {
    console.warn('[MDS-CLIENT] Auto-login error:', e);
  }

  throw new Error('Gagal mendapatkan session login StoreHub');
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

  // Helper untuk fallback anggun ke database Supabase
  const fallbackToDb = async (msg: string) => {
    try {
      const dbProduct = await prisma.product.findUnique({
        where: { sku: cleanSku },
        select: { sku: true, stok: true, barcode: true, article: true, hargaNormal: true }
      });
      let variants: Array<{ sku: string; color?: string | null; size?: string | null; stok: number }> = [];
      if (dbProduct?.article) {
        const siblings = await prisma.product.findMany({
          where: { article: dbProduct.article },
          select: { sku: true, color: true, size: true, stok: true }
        });
        variants = siblings.map(s => ({ sku: s.sku, color: s.color, size: s.size, stok: s.stok }));
      }
      return {
        success: true,
        sku: cleanSku,
        stok: dbProduct?.stok ?? 0,
        barcode: dbProduct?.barcode,
        article: dbProduct?.article,
        hargaNormal: dbProduct?.hargaNormal,
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

  try {
    let cookie = await getStoreHubCookie().catch(() => null);
    if (!cookie) {
      return await fallbackToDb('Server MDS BISA belum ada session aktif. Menampilkan stok tersimpan.');
    }

    const isUpc = /^\d{12,14}$/.test(cleanSku);
    const args = [isUpc ? 'upc' : 'sku', cleanSku];

    // Beri batas timeout 6 detik agar tidak membuat kasir menunggu lama saat toko tutup
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    let res: Response;
    try {
      res = await fetch(ITEM_CHECKER_URL, {
        method: 'POST',
        headers: {
          'Accept': 'text/x-component',
          'Content-Type': 'text/plain;charset=UTF-8',
          'Cookie': cookie,
          'Next-Action': ACTION_DETAIL,
          'Referer': ITEM_CHECKER_URL,
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15',
          'Next-Router-State-Tree': '%5B%22%22%2C%7B%22children%22%3A%5B%22(app)%22%2C%7B%22children%22%3A%5B%22item-checker%22%2C%7B%22children%22%3A%5B%22__PAGE__%22%2C%7B%7D%2Cnull%2Cnull%2C0%5D%7D%2Cnull%2Cnull%2C0%5D%7D%2Cnull%2Cnull%2C4%5D%7D%2Cnull%2C%22refetch%22%2C24%5D',
        },
        body: JSON.stringify(args),
        signal: controller.signal,
      });
    } catch {
      clearTimeout(timeoutId);
      return await fallbackToDb('Server MDS BISA sedang istirahat (malam hari). Menampilkan stok tersimpan.');
    } finally {
      clearTimeout(timeoutId);
    }

    // Jika 401 Unauthorized, re-login sekali
    if (res.status === 401) {
      cachedCookie = null;
      cookie = await getStoreHubCookie().catch(() => null);
      if (!cookie) return await fallbackToDb('Sesi login kedaluwarsa. Menampilkan stok tersimpan.');
      
      try {
        res = await fetch(ITEM_CHECKER_URL, {
          method: 'POST',
          headers: {
            'Accept': 'text/x-component',
            'Content-Type': 'text/plain;charset=UTF-8',
            'Cookie': cookie,
            'Next-Action': ACTION_DETAIL,
            'Referer': ITEM_CHECKER_URL,
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15',
            'Next-Router-State-Tree': '%5B%22%22%2C%7B%22children%22%3A%5B%22(app)%22%2C%7B%22children%22%3A%5B%22item-checker%22%2C%7B%22children%22%3A%5B%22__PAGE__%22%2C%7B%7D%2Cnull%2Cnull%2C0%5D%7D%2Cnull%2Cnull%2C0%5D%7D%2Cnull%2Cnull%2C4%5D%7D%2Cnull%2C%22refetch%22%2C24%5D',
          },
          body: JSON.stringify(args),
        });
      } catch {
        return await fallbackToDb('Server MDS BISA sedang istirahat (malam hari). Menampilkan stok tersimpan.');
      }
    }

    const text = await res.text();

    if (text.includes('504 Gateway') || text.includes('Gateway Time-out') || text.includes('no route to host') || res.status === 504) {
      return await fallbackToDb('Server toko fisik sedang istirahat (malam hari). Menampilkan stok tersimpan.');
    }

    // Parse Server Action Response (Unpack Next.js 15 chunk)
    let itemData: any = null;
    const lines = text.split('\n');
    for (const line of lines) {
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0 && colonIdx <= 3) {
        try {
          const parsed = JSON.parse(line.substring(colonIdx + 1));
          if (parsed?.result?.data?.[cleanSku]) {
            itemData = parsed.result.data[cleanSku][0];
            break;
          }
          if (parsed?.result?.data) {
            const first = Object.values(parsed.result.data)[0];
            if (Array.isArray(first)) {
              // Jika query adalah UPC / barcode, prioritaskan item yang memiliki VendorBarcode cocok
              const matchUpc = isUpc ? first.find((x: any) => String(x.VendorBarcode).trim() === cleanSku) : null;
              itemData = matchUpc || first[0];
            } else {
              itemData = first;
            }
            break;
          }
        } catch {
          continue;
        }
      }
    }

    if (!itemData || itemData.error) {
      return await fallbackToDb('Menampilkan stok tersimpan di sistem.');
    }

    // 1. Ekstraksi nilai stok untuk SKU saat ini
    let currentSkuStok = 0;
    const directStok = itemData.StockOnHand ?? itemData.stockOnHand ?? itemData.stock_on_hand ?? itemData.soh;
    if (directStok !== undefined && directStok !== null) {
      currentSkuStok = parseInt(String(directStok), 10) || 0;
    }

    const barcode = itemData.VendorBarcode ?? itemData.vendorBarcode ?? itemData.barcode ?? null;
    const article = itemData.StyleCode ?? itemData.styleCode ?? itemData.article ?? null;
    
    // Parse harga normal ritel
    let rawPrice = itemData.RetailPrice ?? itemData.retailPrice ?? itemData.price;
    let hargaNormal: number | null = null;
    if (rawPrice) {
      let str = String(rawPrice).trim();
      if (/\.\d{4,}$/.test(str) || /\.00$/.test(str)) {
        str = str.split('.')[0];
      }
      const cleaned = str.replace(/[^0-9]/g, '');
      hargaNormal = cleaned ? parseInt(cleaned) : null;
    }

    // 2. Cari seluruh varian produk dari ARTIKEL ini di database Supabase
    let articleToSearch = article;
    if (!articleToSearch) {
      const existing = await prisma.product.findUnique({ where: { sku: cleanSku }, select: { article: true } });
      articleToSearch = existing?.article || null;
    }

    const updatedVariants: Array<{ sku: string; color?: string | null; size?: string | null; stok: number }> = [];

    const itemSku = String(itemData.SKU ?? itemData.sku ?? cleanSku).trim();

    // Update atau insert produk baru jika belum terdaftar di database Supabase
    try {
      const resolvedBarcode = isUpc ? cleanSku : (barcode ? String(barcode).trim() : null);
      const updateData: any = {
        stok: currentSkuStok,
        updatedAt: new Date(),
      };
      if (resolvedBarcode) updateData.barcode = resolvedBarcode;
      if (article) updateData.article = String(article).trim();
      if (hargaNormal && hargaNormal > 0) updateData.hargaNormal = hargaNormal;

      await prisma.product.upsert({
        where: { sku: itemSku },
        update: updateData,
        create: {
          sku: itemSku,
          barcode: resolvedBarcode,
          article: article || 'PRODUK BARU',
          description: String(itemData.Description || itemData.ItemDescription || article || 'PRODUK BARU').trim(),
          brand: String(itemData.Brand || 'SUKO').trim(),
          dept: String(itemData.Department || itemData.DeptName || 'SUKO').trim(),
          color: itemData.Color || null,
          size: itemData.Size || null,
          hargaNormal: hargaNormal || 0,
          stok: currentSkuStok,
          updatedAt: new Date(),
        }
      });
      updatedVariants.push({ sku: itemSku, stok: currentSkuStok });
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
          if (sib.sku === cleanSku) continue; // sudah diupdate di atas

          const sibColor = normalize(sib.color);
          const sibSize = normalize(sib.size);

          // Cari di relatedStock
          let foundQty: number | null = null;

          for (const [relColorKey, sizesObj] of Object.entries(itemData.relatedStock)) {
            const relColor = normalize(relColorKey);
            // Cocokkan warna (exact atau mengandung)
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

    return {
      success: true,
      sku: cleanSku,
      article: articleToSearch,
      stok: currentSkuStok,
      barcode,
      hargaNormal,
      totalVariantsUpdated: updatedVariants.length,
      variants: updatedVariants,
      storeOffline: false,
    };
  } catch (err: any) {
    return {
      success: false,
      sku: cleanSku,
      message: err.message || 'Gagal menghubungi server StoreHub.',
    };
  }
}

