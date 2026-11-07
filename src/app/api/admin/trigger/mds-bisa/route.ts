/**
 * API Route: POST /api/admin/trigger/mds-bisa
 * Trigger 1: Sync data produk dari MDS BISA StoreHub → Supabase
 * - Auto login ke StoreHub (atau pakai cookie dari env)
 * - Loop semua SKU di DB → update barcode, article, stok, hargaNormal
 * - Log ke SyncHistory
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';

// ============================================================
// KONFIGURASI MDS BISA
// ============================================================
const STOREHUB_BASE = 'https://storehub.mdsretailing.id';
const LOGIN_URL = `${STOREHUB_BASE}/login?next=%2F`;
const ITEM_CHECKER_URL = `${STOREHUB_BASE}/item-checker`;

const ACTION_LOGIN = '6071833df0be708d73972db0a7dc0c7c83eb3d41f3';
const ACTION_DETAIL = '60fc4882ad969e8907c38a0c8aa2c93b06a8e5c526';
const ACTION_STOCK = '60583352e1dc5a5d042e7557e6a166ae2d9e7e6130';

const CREDENTIALS = {
  username: 'M223515',
  password: 'Mamen123',
  tz: 'Asia/Jakarta',
};

const REQUEST_DELAY_MS = 600;

// ============================================================
// HELPERS
// ============================================================
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

function isTokoBuka(): boolean {
  const now = new Date();
  const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const h = wib.getUTCHours();
  const m = wib.getUTCMinutes();
  const total = h * 60 + m;
  return total >= 540 && total <= 1290; // 09:00 - 21:30
}

async function autoLogin(): Promise<string | null> {
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
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
    },
    body: formData.toString(),
    redirect: 'manual',
  });

  // Extract cookie
  const setCookie = res.headers.get('set-cookie') || '';
  const parts = setCookie.split(',').map((c: string) => c.split(';')[0].trim()).filter(Boolean);
  const sessionCookie = parts.join('; ');

  if (!sessionCookie) {
    // Fallback: coba environment variable
    return process.env.MDS_SESSION_COOKIE || null;
  }
  return sessionCookie;
}

function parseServerActionResponse(text: string): any {
  if (text.includes('504 Gateway') || text.includes('Gateway Time-out') || text.includes('502 Bad Gateway')) {
    return { _storeOffline: true, error: '504 Gateway Timeout (Toko offline)' };
  }

  const lines = text.split('\n');
  for (const line of lines) {
    if (line.startsWith('1:') || line.startsWith('0:')) {
      try {
        return JSON.parse(line.substring(2));
      } catch { continue; }
    }
  }
  return null;
}

async function fetchItemDetail(sku: string, cookie: string): Promise<any> {
  const res = await fetch(ITEM_CHECKER_URL, {
    method: 'POST',
    headers: {
      'Accept': 'text/x-component',
      'Content-Type': 'text/plain;charset=UTF-8',
      'Cookie': cookie,
      'Next-Action': ACTION_DETAIL,
      'Referer': ITEM_CHECKER_URL,
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
    },
    body: JSON.stringify(['sku', sku.trim()]),
    signal: AbortSignal.timeout(10000),
  });

  if (res.status === 401) return { _sessionExpired: true };
  const text = await res.text();
  if (text.includes('/login') || text.includes('Unauthorized')) return { _sessionExpired: true };
  
  const data = parseServerActionResponse(text);
  if (!data) return { _noData: true };
  if (data?.error?.includes('no route to host') || data?.error?.includes('unable to open tcp')) {
    return { _storeOffline: true };
  }
  return data;
}

function extractFields(data: any) {
  const get = (...keys: string[]) => {
    for (const k of keys) {
      if (data[k] !== undefined && data[k] !== null && data[k] !== '') return data[k];
    }
    return null;
  };

  const parseHarga = (val: any) => {
    if (!val) return null;
    if (typeof val === 'number') return val;
    const n = parseInt(String(val).replace(/[^0-9]/g, ''));
    return isNaN(n) ? null : n;
  };

  const parseStok = (d: any) => {
    const direct = get('stockOnHand', 'stock_on_hand', 'StockOnHand', 'soh');
    if (direct !== null) return parseInt(direct) || 0;
    const related = get('relatedStock', 'related_stock');
    if (related && typeof related === 'object') {
      let total = 0;
      for (const color of Object.values(related) as any[]) {
        if (typeof color === 'object') {
          for (const qty of Object.values(color) as any[]) total += parseInt(qty as string) || 0;
        }
      }
      return total;
    }
    return 0;
  };

  return {
    barcode: get('vendorBarcode', 'vendor_barcode', 'VendorBarcode', 'barcode', 'upc'),
    article: get('styleCode', 'style_code', 'StyleCode', 'article'),
    description: get('description', 'Description', 'itemDescription'),
    color: get('color', 'Color'),
    size: get('size', 'Size'),
    hargaNormal: parseHarga(get('retailPrice', 'retail_price', 'RetailPrice', 'price')),
    stok: parseStok(data),
  };
}

// ============================================================
// POST HANDLER
// ============================================================
export async function POST(req: Request) {
  // Verifikasi user super-admin dari session
  const cookieStore = await cookies();
  const token = cookieStore.get('token')?.value;
  const legacySessionId = cookieStore.get('sessionId')?.value;

  let user = null;
  if (token) {
    const session = await verifyToken(token);
    if (session?.userId) {
      user = await prisma.user.findUnique({ where: { id: session.userId } });
    }
  } else if (legacySessionId) {
    user = await prisma.user.findFirst({ where: { sessionId: legacySessionId, status: 'ACTIVE' } });
  }

  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized - Silakan login kembali' }, { status: 401 });
  }

  if (user.role !== 'SUPERVISOR') {
    return NextResponse.json({ success: false, error: 'Forbidden - Khusus Supervisor' }, { status: 403 });
  }

  // Cek jam operasional (kecuali ada ?force=true)
  const url = new URL(req.url);
  const force = url.searchParams.get('force') === 'true';
  
  if (!force && !isTokoBuka()) {
    return NextResponse.json({
      success: false,
      error: 'Toko sedang tutup. Jalankan sync antara jam 09:00-21:30 WIB, atau tambahkan ?force=true untuk paksa.',
      tokoStatus: 'CLOSED',
    }, { status: 409 });
  }

  console.log(`[TRIGGER-MDS-BISA] Dimulai oleh: ${user.nik} - ${user.name}`);

  try {
    // --- Login ---
    let cookie = process.env.MDS_SESSION_COOKIE || '';
    if (!cookie) {
      const loginCookie = await autoLogin();
      if (!loginCookie) {
        return NextResponse.json({
          success: false,
          error: 'Gagal login ke MDS BISA. Set environment variable MDS_SESSION_COOKIE atau update kredensial.',
        }, { status: 500 });
      }
      cookie = loginCookie;
    }

    // --- Ambil semua SKU ---
    const products = await prisma.product.findMany({
      select: { sku: true },
      orderBy: { sku: 'asc' },
    });

    const stats = {
      total: products.length,
      success: 0,
      notFound: 0,
      storeOffline: 0,
      sessionExpired: false,
      errors: 0,
      duplicateBarcode: 0,
    };

    // --- Loop sync ---
    for (let i = 0; i < products.length; i++) {
      const sku = products[i].sku;
      
      const rawData = await fetchItemDetail(sku, cookie);

      if (rawData._sessionExpired) {
        // Re-login
        const newCookie = await autoLogin();
        if (!newCookie) {
          stats.sessionExpired = true;
          break;
        }
        cookie = newCookie;
        // Retry
        const retry = await fetchItemDetail(sku, cookie);
        if (retry._sessionExpired) { stats.sessionExpired = true; break; }
        Object.assign(rawData, retry);
        delete rawData._sessionExpired;
      }

      if (rawData._storeOffline) { stats.storeOffline++; stats.errors++; continue; }
      if (rawData._noData || rawData._error) { stats.errors++; continue; }

      const fields = extractFields(rawData);
      
      try {
        const updateData: any = { updatedAt: new Date() };
        if (fields.barcode) updateData.barcode = String(fields.barcode).trim();
        if (fields.article) updateData.article = fields.article;
        if (fields.stok !== null) updateData.stok = fields.stok;
        if (fields.hargaNormal) updateData.hargaNormal = fields.hargaNormal;
        if (fields.color) updateData.color = fields.color;
        if (fields.size) updateData.size = fields.size;

        await prisma.product.update({
          where: { sku },
          data: updateData,
        });
        stats.success++;
      } catch (err: any) {
        if (err.code === 'P2025') { stats.notFound++; }
        else if (err.code === 'P2002') { stats.duplicateBarcode++; }
        else { stats.errors++; }
      }

      if (i < products.length - 1) await delay(REQUEST_DELAY_MS);
    }

    // --- Log ke SyncHistory ---
    await prisma.syncHistory.create({
      data: {
        userId: user.id,
        type: 'MDS_BISA_SYNC',
        fileName: `mds-bisa-sync-${new Date().toISOString().slice(0, 10)}`,
        status: stats.errors > stats.success ? 'FAILED' : 'SUCCESS',
        records: stats.success,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Sync selesai: ${stats.success} produk diperbarui`,
      stats,
    });

  } catch (err: any) {
    console.error('[TRIGGER-MDS-BISA] Error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
