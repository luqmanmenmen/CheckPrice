/**
 * MDS BISA (StoreHub) Client for Realtime Single-Item Queries
 * Digunakan untuk tombol "⚡ Cek Live Stok 1 SKU" langsung dari kasir/SPG
 */

import { prisma } from './prisma';

const STOREHUB_BASE = 'https://storehub.mdsretailing.id';
const LOGIN_URL = `${STOREHUB_BASE}/login?next=%2F`;
const ITEM_CHECKER_URL = `${STOREHUB_BASE}/item-checker`;

const ACTION_LOGIN = '6071833df0be708d73972db0a7dc0c7c83eb3d41f3';
const ACTION_DETAIL = '60fc4882ad969e8907c38a0c8aa2c93b06a8e5c526';

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

  // Jika ada env MDS_SESSION_COOKIE, gunakan itu
  if (process.env.MDS_SESSION_COOKIE) {
    cachedCookie = process.env.MDS_SESSION_COOKIE;
    cookieCachedAt = now;
    return cachedCookie;
  }

  // Auto-login ke StoreHub
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

  if (!sessionCookie || (!sessionCookie.includes('mso_session') && !sessionCookie.includes('db76d'))) {
    throw new Error('Gagal mendapatkan session login StoreHub');
  }

  cachedCookie = sessionCookie;
  cookieCachedAt = now;
  return sessionCookie;
}

export async function checkSingleItemStock(sku: string): Promise<{
  success: boolean;
  sku: string;
  stok?: number;
  barcode?: string | null;
  article?: string | null;
  hargaNormal?: number | null;
  storeOffline?: boolean;
  message?: string;
}> {
  const cleanSku = String(sku).trim();

  // 1. Cek jam buka toko fisik
  if (!isStoreOpen()) {
    return {
      success: false,
      sku: cleanSku,
      storeOffline: true,
      message: 'Server komputer toko 719 offline di luar jam operasional (09:00 - 21:30 WIB).',
    };
  }

  try {
    let cookie = await getStoreHubCookie();
    const args = ['sku', cleanSku];

    let res = await fetch(ITEM_CHECKER_URL, {
      method: 'POST',
      headers: {
        'Accept': 'text/x-component',
        'Content-Type': 'text/plain;charset=UTF-8',
        'Cookie': cookie,
        'Next-Action': ACTION_DETAIL,
        'Referer': ITEM_CHECKER_URL,
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15',
      },
      body: JSON.stringify(args),
    });

    // Jika 401 Unauthorized, re-login sekali
    if (res.status === 401) {
      cachedCookie = null;
      cookie = await getStoreHubCookie();
      res = await fetch(ITEM_CHECKER_URL, {
        method: 'POST',
        headers: {
          'Accept': 'text/x-component',
          'Content-Type': 'text/plain;charset=UTF-8',
          'Cookie': cookie,
          'Next-Action': ACTION_DETAIL,
          'Referer': ITEM_CHECKER_URL,
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15',
        },
        body: JSON.stringify(args),
      });
    }

    const text = await res.text();

    if (text.includes('504 Gateway') || text.includes('Gateway Time-out') || text.includes('no route to host')) {
      return {
        success: false,
        sku: cleanSku,
        storeOffline: true,
        message: 'Server kasir lokal toko 719 sedang tidak terjangkau (VPN offline).',
      };
    }

    // Parse Server Action Response
    let itemData: any = null;
    const lines = text.split('\n');
    for (const line of lines) {
      if (line.startsWith('1:') || line.startsWith('0:')) {
        try {
          const parsed = JSON.parse(line.substring(2));
          if (parsed && typeof parsed === 'object') {
            itemData = parsed;
            break;
          }
        } catch {
          continue;
        }
      }
    }

    if (!itemData || itemData.error) {
      return {
        success: false,
        sku: cleanSku,
        message: itemData?.error || 'Data produk tidak ditemukan di portal StoreHub.',
      };
    }

    // Ekstraksi nilai stok
    let stok = 0;
    const directStok = itemData.stockOnHand ?? itemData.stock_on_hand ?? itemData.StockOnHand ?? itemData.soh;
    if (directStok !== undefined && directStok !== null) {
      stok = parseInt(String(directStok), 10) || 0;
    } else if (itemData.relatedStock && typeof itemData.relatedStock === 'object') {
      for (const color of Object.values(itemData.relatedStock)) {
        if (typeof color === 'object' && color !== null) {
          for (const qty of Object.values(color as Record<string, any>)) {
            stok += parseInt(String(qty), 10) || 0;
          }
        }
      }
    }

    const barcode = itemData.vendorBarcode || itemData.barcode || itemData.upc || null;
    const article = itemData.styleCode || itemData.article || itemData.style || null;
    const hargaNormal = parseFloat(itemData.retailPrice || itemData.price) || null;

    // Simpan pemutakhiran langsung ke Supabase
    try {
      const updateData: any = {
        stok,
        updatedAt: new Date(),
      };
      if (barcode) updateData.barcode = String(barcode).trim();
      if (article) updateData.article = String(article).trim();
      if (hargaNormal && hargaNormal > 0) updateData.hargaNormal = hargaNormal;

      await prisma.product.update({
        where: { sku: cleanSku },
        data: updateData,
      });
    } catch (dbErr) {
      console.warn('Gagal update database produk:', dbErr);
    }

    return {
      success: true,
      sku: cleanSku,
      stok,
      barcode,
      article,
      hargaNormal,
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
