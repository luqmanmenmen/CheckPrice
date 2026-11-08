/**
 * sync_mds_bisa_full.mjs
 * ============================================================
 * Script utama untuk sinkronisasi data dari MDS BISA StoreHub
 * ke database Supabase (Prisma).
 *
 * Yang di-sync:
 *   - barcode (Vendor Barcode / UPC EAN-13)
 *   - article (Style Code)
 *   - hargaNormal (Retail Price dari StoreHub)
 *   - stok (Stock on Hand)
 *   - color, size
 *   - description (jika kosong di DB)
 *
 * Cara pakai:
 *   node scripts/sync_mds_bisa_full.mjs
 *   node scripts/sync_mds_bisa_full.mjs --dry-run   (tidak tulis ke DB)
 *   node scripts/sync_mds_bisa_full.mjs --sku=34985474  (1 SKU saja)
 * ============================================================
 */

import { PrismaClient } from '@prisma/client';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

// Load .env manual (karena ini ESM bukan Next.js)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.substring(0, eqIdx).trim();
    const val = trimmed.substring(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

// ============================================================
// KONFIGURASI MDS BISA
// ============================================================
const STOREHUB_BASE = 'https://storehub.mdsretailing.id';
const LOGIN_URL = `${STOREHUB_BASE}/login?next=%2F`;
const ITEM_CHECKER_URL = `${STOREHUB_BASE}/item-checker`;

const ACTION_LOGIN = '6071833df0be708d73972db0a7dc0c7c83eb3d41f3';
const ACTION_DETAIL = '60fc4882ad969e8907c38a0c8aa2c93b06a8e5c526';
const ACTION_STOCK = '60583352e1dc5a5d042e7557e6a166ae2d9e7e6130';
const ACTION_PROMO = '604c571155331d51896a342c4afbc1c6e2091d8cb3';

const CREDENTIALS = {
  username: 'M223515',
  password: 'Mamen123',
  tz: 'Asia/Jakarta',
};

// Delay antar request (ms) - hemat waktu & aman dari rate limit
const REQUEST_DELAY_MS = 350;
// Max retry per SKU jika gagal
const MAX_RETRIES = 3;

// Parse args
const isDryRun = process.argv.includes('--dry-run');
const isForce = process.argv.includes('--force');
const isStockOnly = process.argv.includes('--stock-only');
const targetSku = process.argv.find(a => a.startsWith('--sku='))?.split('=')[1];

// ============================================================
// PRISMA CLIENT
// ============================================================
const prisma = new PrismaClient();

// ============================================================
// HELPER: DELAY
// ============================================================
const delay = (ms) => new Promise(r => setTimeout(r, ms));

// ============================================================
// HELPER: CEK JAM OPERASIONAL TOKO (09:00 - 21:30 WIB)
// ============================================================
function isTokoBuka() {
  const now = new Date();
  // Convert ke WIB (UTC+7)
  const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const hour = wib.getUTCHours();
  const minute = wib.getUTCMinutes();
  const totalMinutes = hour * 60 + minute;
  // Buka 09:00 (540) sampai 21:30 (1290)
  return totalMinutes >= 540 && totalMinutes <= 1290;
}

// ============================================================
// STEP 1: AUTO LOGIN
// ============================================================
async function autoLogin() {
  console.log('🔑 [LOGIN] Mencoba auto-login ke MDS BISA StoreHub...');

  // MDS BISA menggunakan Next.js Server Action untuk login
  // Format: FormData dengan field next, username, password, tz
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
      'Referer': LOGIN_URL,
    },
    body: formData.toString(),
    redirect: 'manual', // jangan follow redirect, kita butuh cookie dari response
  });

  // Ambil cookie dari Set-Cookie header
  const setCookieHeader = res.headers.get('set-cookie') || res.headers.getSetCookie?.()?.join('; ') || '';
  
  // Extract mso_session cookie
  let sessionCookie = '';
  const allCookies = [];
  
  // Node fetch returns single set-cookie string atau bisa multiple
  const rawSetCookie = res.headers.raw?.()?.['set-cookie'] || [];
  
  if (rawSetCookie.length > 0) {
    for (const c of rawSetCookie) {
      const cookiePart = c.split(';')[0];
      allCookies.push(cookiePart);
    }
    sessionCookie = allCookies.join('; ');
  } else if (setCookieHeader) {
    // Fallback: parse dari string
    sessionCookie = setCookieHeader.split(',').map(c => c.split(';')[0].trim()).join('; ');
  }

  if (!sessionCookie || (!sessionCookie.includes('mso_session') && !sessionCookie.includes('db76d'))) {
    // Coba cara lain: lihat response body untuk clue
    const body = await res.text().catch(() => '');
    console.error('❌ Login gagal. Status:', res.status);
    console.error('   Response headers:', Object.fromEntries(res.headers.entries()));
    console.error('   Body (truncated):', body.substring(0, 500));
    
    // Fallback: minta user paste cookie manual
    throw new Error('Auto-login gagal. Silakan jalankan dengan cookie manual via --cookie="..." atau update script.');
  }

  console.log('✅ [LOGIN] Berhasil! Cookie diperoleh.');
  return sessionCookie;
}

// ============================================================
// STEP 1B: ALTERNATIVE LOGIN - Pakai Cookie Manual (Fallback)
// ============================================================
function getManualCookie() {
  // Cek environment variable dulu
  if (process.env.MDS_SESSION_COOKIE) {
    console.log('🍪 [COOKIE] Menggunakan cookie dari environment variable MDS_SESSION_COOKIE');
    return process.env.MDS_SESSION_COOKIE;
  }
  
  // Cek file .mds_cookie jika ada
  const cookieFile = path.join(__dirname, '..', '.mds_cookie');
  if (fs.existsSync(cookieFile)) {
    const cookie = fs.readFileSync(cookieFile, 'utf-8').trim();
    if (cookie) {
      console.log('🍪 [COOKIE] Menggunakan cookie dari file .mds_cookie');
      return cookie;
    }
  }
  
  return null;
}

// ============================================================
// STEP 2: FETCH ITEM DETAIL (per SKU)
// ============================================================
async function fetchItemDetail(sku, cookie, retries = 0) {
  const args = ['sku', String(sku).trim()];
  
  try {
    const res = await fetch(ITEM_CHECKER_URL, {
      method: 'POST',
      headers: {
        'Accept': 'text/x-component',
        'Content-Type': 'text/plain;charset=UTF-8',
        'Cookie': cookie,
        'Next-Action': ACTION_DETAIL,
        'Referer': ITEM_CHECKER_URL,
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
        'Next-Router-State-Tree': '%5B%22%22%2C%7B%22children%22%3A%5B%22(app)%22%2C%7B%22children%22%3A%5B%22item-checker%22%2C%7B%22children%22%3A%5B%22__PAGE__%22%2C%7B%7D%2Cnull%2Cnull%2C0%5D%7D%2Cnull%2Cnull%2C0%5D%7D%2Cnull%2Cnull%2C4%5D%7D%2Cnull%2C%22refetch%22%2C24%5D',
      },
      body: JSON.stringify(args),
    });

    const text = await res.text();
    
    // Cek session expired (401 atau redirect ke login)
    if (res.status === 401 || text.includes('Unauthorized') || text.includes('/login')) {
      return { _sessionExpired: true };
    }

    // Parse Next.js Server Action response format
    // Format: "1:<data>\n2:<meta>\n..."
    return parseServerActionResponse(text, sku);
    
  } catch (err) {
    if (retries < MAX_RETRIES) {
      console.warn(`  ⚠️  SKU ${sku} error (attempt ${retries + 1}/${MAX_RETRIES}): ${err.message}`);
      await delay(REQUEST_DELAY_MS * (retries + 2)); // exponential backoff
      return fetchItemDetail(sku, cookie, retries + 1);
    }
    return { _error: err.message };
  }
}

// ============================================================
// STEP 2B: FETCH ITEM STOCK (optional, untuk SOH detail)
// ============================================================
async function fetchItemStock(sku, cookie) {
  const args = ['sku', String(sku).trim()];
  
  try {
    const res = await fetch(ITEM_CHECKER_URL, {
      method: 'POST',
      headers: {
        'Accept': 'text/x-component',
        'Content-Type': 'text/plain;charset=UTF-8',
        'Cookie': cookie,
        'Next-Action': ACTION_STOCK,
        'Referer': ITEM_CHECKER_URL,
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
      },
      body: JSON.stringify(args),
    });

    if (res.status === 401) return { _sessionExpired: true };
    
    const text = await res.text();
    return parseServerActionResponse(text, sku, 'stock');
  } catch (err) {
    return { _error: err.message };
  }
}

// ============================================================
// PARSER: Next.js Server Action Response
// ============================================================
function parseServerActionResponse(text, sku, type = 'detail') {
  if (text.includes('504 Gateway') || text.includes('Gateway Time-out') || text.includes('502 Bad Gateway')) {
    return { _storeOffline: true, error: '504 Gateway Time-out (Server toko 719 offline di luar jam operasional)' };
  }

  const lines = text.split('\n');
  
  for (const line of lines) {
    // Line format: "1:{...}" atau "0:{...}" tergantung response type
    if (line.startsWith('1:') || line.startsWith('0:')) {
      try {
        const jsonStr = line.substring(2);
        const data = JSON.parse(jsonStr);
        
        // Error dari server (store offline, SQL Server unreachable)
        if (data?.error) {
          if (data.error.includes('no route to host') || data.error.includes('unable to open tcp')) {
            return { _storeOffline: true, error: data.error };
          }
          return { _error: data.error };
        }
        
        return data;
      } catch (e) {
        // Bukan JSON valid, coba line berikutnya
        continue;
      }
    }
  }
  
  // Kalau tidak ada data bermakna
  if (text.trim() === '{}' || text.trim() === '') {
    const nowUtc = new Date();
    const wibHour = (nowUtc.getUTCHours() + 7) % 24;
    const isOutsideHours = wibHour < 9 || wibHour >= 22;
    if (isOutsideHours) {
      return { _storeOffline: true, error: 'Toko 719 sedang offline (di luar jam operasional 09:00 - 21:30 WIB)' };
    }
    return { _notFound: true, error: 'Item tidak ditemukan di StoreHub toko 719' };
  }

  return { _rawText: text.substring(0, 200), _error: 'Format response tidak dikenal' };
}

// ============================================================
// PARSER: Ekstrak field dari response checkItemDetail
// ============================================================
function extractProductFields(data) {
  if (!data || data._error || data._storeOffline || data._sessionExpired || data._rawText) return null;
  
  // Handle berbagai kemungkinan field name (camelCase, snake_case, Title Case)
  const get = (...keys) => {
    for (const k of keys) {
      if (data[k] !== undefined && data[k] !== null && data[k] !== '') return data[k];
    }
    return null;
  };

  const barcode = get('vendorBarcode', 'vendor_barcode', 'VendorBarcode', 'barcode', 'upc', 'UPC');
  const article = get('styleCode', 'style_code', 'StyleCode', 'article', 'style');
  const description = get('description', 'Description', 'itemDescription', 'item_description');
  const retailPrice = get('retailPrice', 'retail_price', 'RetailPrice', 'price', 'harga');

  // Jika semua field esensial kosong, berarti data tidak valid
  if (!barcode && !article && !description && retailPrice === null) {
    return null;
  }

  // Parse harga - bisa format "Rp 349.900" atau angka
  const parseHarga = (val) => {
    if (!val) return null;
    if (typeof val === 'number') return val;
    const cleaned = String(val).replace(/[^0-9]/g, '');
    return cleaned ? parseInt(cleaned) : null;
  };

  // Parse stok - jumlahkan semua ukuran jika ada relatedStock
  const parseStok = (data) => {
    const direct = get('stockOnHand', 'stock_on_hand', 'StockOnHand', 'soh', 'SOH');
    if (direct !== null) return parseInt(direct) || 0;
    
    // Kalau ada relatedStock, jumlahkan semua
    const related = get('relatedStock', 'related_stock', 'RelatedStock');
    if (related && typeof related === 'object') {
      let total = 0;
      for (const color of Object.values(related)) {
        if (typeof color === 'object') {
          for (const qty of Object.values(color)) {
            total += parseInt(qty) || 0;
          }
        }
      }
      return total;
    }
    return 0;
  };

  return {
    barcode: get('vendorBarcode', 'vendor_barcode', 'VendorBarcode', 'barcode', 'upc', 'UPC'),
    article: get('styleCode', 'style_code', 'StyleCode', 'article', 'style'),
    description: get('description', 'Description', 'itemDescription', 'item_description'),
    color: get('color', 'Color', 'colorCode', 'color_code'),
    size: get('size', 'Size'),
    hargaNormal: parseHarga(get('retailPrice', 'retail_price', 'RetailPrice', 'price', 'harga')),
    stok: parseStok(data),
    dept: get('subclassName', 'subclass_name', 'SubclassName', 'dept', 'department'),
    rawData: data, // simpan raw untuk debugging
  };
}

// ============================================================
// HEALTH-CHECK: PROBE SERVER TOKO 719 & TUNGGU JIKA IT TELAT
// ============================================================
async function waitForStoreOnline(initialCookie, maxWaitMinutes = 35) {
  console.log('🔍 [HEALTH-CHECK] Memeriksa apakah server SQL toko 719 sudah online...');
  const startTime = Date.now();
  const maxWaitMs = maxWaitMinutes * 60 * 1000;
  const TEST_SKU = '53805640'; // SKU uji cepat
  let currentCookie = initialCookie;
  let attempt = 1;

  while (Date.now() - startTime < maxWaitMs) {
    let detail = await fetchItemDetail(TEST_SKU, currentCookie);

    if (detail._sessionExpired) {
      try {
        currentCookie = await autoLogin();
        detail = await fetchItemDetail(TEST_SKU, currentCookie);
      } catch (e) {
        console.warn('⚠️ Gagal refresh session saat menunggu server:', e.message);
      }
    }

    // Jika server toko sudah online (bukan _storeOffline)
    if (!detail._storeOffline) {
      const waitSecs = Math.round((Date.now() - startTime) / 1000);
      if (waitSecs > 5) {
        console.log(`\n🟢 [SERVER ONLINE] Server toko 719 SUDAH MENYALA! (Setelah menunggu ${waitSecs} detik)`);
      } else {
        console.log(`🟢 [SERVER ONLINE] Server toko 719 aktif & online.`);
      }
      return { online: true, cookie: currentCookie };
    }

    const elapsedMins = Math.round((Date.now() - startTime) / 60000);
    console.log(`⏳ [Percobaan ${attempt}] Server toko 719 masih offline (belum dinyalakan IT). Menunggu 2 menit lagi... (${elapsedMins}/${maxWaitMinutes} mnt)`);
    attempt++;
    await delay(120000); // Tunggu 2 menit sebelum cek ulang
  }

  console.warn(`\n⚠️ [TIMEOUT] Server toko 719 belum dinyalakan oleh IT setelah ${maxWaitMinutes} menit.`);
  console.warn('   Menghentikan proses agar kuota GitHub Actions tidak terbuang sia-sia.');
  return { online: false, cookie: currentCookie };
}

// ============================================================
// STEP 3: UPSERT KE SUPABASE
// ============================================================
async function upsertProduct(sku, fields) {
  if (isDryRun) {
    console.log(`  [DRY-RUN] SKU ${sku}:`, JSON.stringify({
      barcode: fields.barcode,
      article: fields.article,
      stok: fields.stok,
      hargaNormal: fields.hargaNormal,
    }));
    return { dryRun: true };
  }

  // Jika mode khusus update stok: hanya perbarui stok & updatedAt
  if (isStockOnly) {
    try {
      const result = await prisma.product.update({
        where: { sku: String(sku) },
        data: {
          stok: fields.stok !== null && fields.stok !== undefined ? fields.stok : 0,
          updatedAt: new Date(),
        },
      });
      return { success: true, id: result.id, stockOnly: true };
    } catch (err) {
      if (err.code === 'P2025') return { notFound: true };
      return { error: err.message };
    }
  }

  const updateData = {};
  if (fields.barcode) updateData.barcode = String(fields.barcode).trim();
  if (fields.article) updateData.article = fields.article;
  if (fields.stok !== null && fields.stok !== undefined) updateData.stok = fields.stok;
  if (fields.hargaNormal) updateData.hargaNormal = fields.hargaNormal;
  if (fields.color) updateData.color = fields.color;
  if (fields.size) updateData.size = fields.size;
  if (fields.description) updateData.description = fields.description;
  if (fields.dept) updateData.dept = fields.dept;
  updateData.updatedAt = new Date();

  const createData = {
    sku: String(sku).trim(),
    barcode: fields.barcode ? String(fields.barcode).trim() : null,
    article: fields.article || null,
    description: fields.description || `SUKO ITEM ${sku}`,
    brand: 'SUKO',
    dept: fields.dept || 'SUKO ESSENTIALS',
    color: fields.color || null,
    size: fields.size || null,
    hargaNormal: fields.hargaNormal || 0,
    stok: fields.stok !== null && fields.stok !== undefined ? fields.stok : 0,
    updatedAt: new Date(),
  };

  try {
    const result = await prisma.product.upsert({
      where: { sku: String(sku) },
      update: updateData,
      create: createData,
    });
    return { success: true, id: result.id };
  } catch (err) {
    if (err.code === 'P2002') {
      // Duplicate barcode - retry tanpa barcode agar data produk & stok tetap masuk
      console.warn(`  ⚠️  SKU ${sku}: Duplicate barcode ${fields.barcode}, skip barcode pada upsert`);
      delete updateData.barcode;
      createData.barcode = null;
      try {
        const retryResult = await prisma.product.upsert({
          where: { sku: String(sku) },
          update: updateData,
          create: createData,
        });
        return { success: true, id: retryResult.id, duplicateBarcodeSkipped: true };
      } catch (retryErr) {
        return { error: retryErr.message };
      }
    }
    return { error: err.message };
  }
}

// ============================================================
// MAIN: ORCHESTRATOR
// ============================================================
async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║   SYNC MDS BISA → SUPABASE                              ║');
  console.log('║   Barcode, StyleCode, Stok, Harga Normal                ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');
  
  if (isDryRun) console.log('🏃 MODE: DRY RUN (tidak ada yang ditulis ke DB)\n');
  if (isForce) console.log('⚡ MODE: FORCE (melewati batasan jam operasional toko)\n');

  // --- Cek jam operasional ---
  if (!isDryRun && !targetSku && !isForce && !isTokoBuka()) {
    console.warn('⚠️  PERINGATAN: Sekarang di luar jam operasional toko (09:00-21:30 WIB).');
    console.warn('   Server SQL toko 719 kemungkinan OFFLINE. Sync akan banyak error.');
    console.warn('   Lanjut tetap? Tekan Ctrl+C untuk batal, atau tunggu 5 detik...\n');
    await delay(5000);
  }

  // --- STEP 1: Dapatkan Session ---
  let cookie = getManualCookie();
  
  if (!cookie) {
    try {
      cookie = await autoLogin();
    } catch (loginErr) {
      console.error('❌ Tidak bisa login. Error:', loginErr.message);
      console.error('\n💡 SOLUSI MANUAL:');
      console.error('   1. Login ke https://storehub.mdsretailing.id/item-checker di Chrome');
      console.error('   2. Buka DevTools (F12) → Application → Cookies');
      console.error('   3. Copy nilai cookie "mso_session" dan "db76d..."');
      console.error('   4. Simpan ke file: c:\\Max Display\\price-checker\\.mds_cookie');
      console.error('      (satu baris: "nama=nilai; nama2=nilai2")');
      console.error('   5. Jalankan ulang script ini\n');
      process.exit(1);
    }
  }

  // Pure Direct Scraping: Langsung proses tanpa penundaan atau tunggu IT
  console.log('🚀 Siap melakukan scraping collage data dan audit stok dari MDS BISA...\n');

  // --- STEP 2: Ambil list SKU dari Supabase ---
  let skusToProcess = [];
  
  if (targetSku) {
    skusToProcess = [targetSku];
    console.log(`🎯 Target SKU tunggal: ${targetSku}\n`);
  } else if (isStockOnly) {
    console.log('⚡ Mode Stock-Only: Mengambil list SKU aktif di toko 719...');
    const products = await prisma.product.findMany({
      where: {
        OR: [
          { stok: { gt: 0 } },
          { updatedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }
        ]
      },
      select: { sku: true },
      orderBy: { updatedAt: 'asc' },
    });
    skusToProcess = products.map(p => p.sku);
    console.log(`   Ditemukan ${skusToProcess.length} produk aktif untuk update stok cepat\n`);
  } else {
    console.log('📋 Mengambil list SKU dari Supabase...');
    const products = await prisma.product.findMany({
      select: { sku: true },
      orderBy: { sku: 'asc' },
    });
    skusToProcess = products.map(p => p.sku);
    console.log(`   Ditemukan ${skusToProcess.length} produk di database\n`);
  }

  // --- STEP 3: Loop dan sync ---
  const stats = {
    total: skusToProcess.length,
    success: 0,
    notFound: 0,
    storeOffline: 0,
    sessionExpired: false,
    errors: 0,
    duplicateBarcode: 0,
    skipped: 0,
  };

  console.log(`🔄 Memulai sync ${skusToProcess.length} SKU...\n`);

  const CONCURRENCY = targetSku ? 1 : 3;
  let cursor = 0;
  let storeOfflineTriggered = false;
  let sessionExpiredTriggered = false;
  let isRelogging = false;

  async function worker(workerId) {
    while (cursor < skusToProcess.length && !storeOfflineTriggered && !sessionExpiredTriggered) {
      const idx = cursor++;
      if (idx >= skusToProcess.length) break;

      const sku = skusToProcess[idx];
      const progress = `[${idx + 1}/${skusToProcess.length}]`;

      // Ambil detail dari MDS BISA
      let rawDetail = await fetchItemDetail(sku, cookie);

      // Cek session expired → harus re-login
      if (rawDetail._sessionExpired) {
        if (!isRelogging) {
          isRelogging = true;
          console.log('\n🔄 Session expired! Mencoba re-login...');
          try {
            cookie = await autoLogin();
            isRelogging = false;
          } catch {
            sessionExpiredTriggered = true;
            stats.sessionExpired = true;
            console.error('❌ Tidak bisa re-login. Hentikan sync.');
            break;
          }
        } else {
          await delay(1500);
        }
        rawDetail = await fetchItemDetail(sku, cookie);
        if (rawDetail._sessionExpired) {
          sessionExpiredTriggered = true;
          break;
        }
      }

      // Cek toko offline
      if (rawDetail._storeOffline) {
        stats.storeOffline++;
        if (stats.storeOffline === 1) {
          console.warn(`\n🏪 [INFO] TOKO 719 OFFLINE: SQL Server lokal tidak terjangkau (di luar jam 09:00-21:30 WIB).`);
          console.warn(`   Melewati sync MDS BISA. Stok & barcode di Supabase tetap aman terjaga.\n`);
        }
        if (stats.storeOffline >= 3) {
          storeOfflineTriggered = true;
          console.log(`🛑 Menghentikan sync MDS BISA karena komputer toko sedang offline/tutup. Menunggu jam operasional buka (09:00 WIB).`);
          break;
        }
        continue;
      }

      if (rawDetail._error) {
        stats.errors++;
        if (idx < 5 || idx % 50 === 0) {
          console.error(`${progress} ❌ SKU ${sku}: ${rawDetail._error}`);
        }
        continue;
      }

      // Extract fields
      const fields = extractProductFields(rawDetail);
      if (!fields) {
        stats.skipped++;
        continue;
      }

      // Log progress
      const barcodeStr = fields.barcode ? `barcode:${fields.barcode}` : 'no-barcode';
      const articleStr = fields.article ? `article:${fields.article}` : 'no-article';
      
      // Upsert ke DB
      const result = await upsertProduct(sku, fields);
      
      if (result.success || result.dryRun) {
        stats.success++;
        if (idx < 5 || idx % 25 === 0) {
          console.log(`${progress} (W${workerId}) ✅ SKU ${sku} | ${barcodeStr} | ${articleStr} | stok:${fields.stok}`);
        }
      } else if (result.notFound) {
        stats.notFound++;
        if (idx < 5) console.log(`${progress} 🆕 SKU ${sku} tidak ada di DB (produk baru)`);
      } else if (result.duplicateBarcode) {
        stats.duplicateBarcode++;
      } else if (result.error) {
        stats.errors++;
        console.error(`${progress} ❌ DB Error SKU ${sku}: ${result.error}`);
      }

      // Delay antar request per worker (rate limiting protection)
      await delay(REQUEST_DELAY_MS);
    }
  }

  console.log(`🚀 Menjalankan ${CONCURRENCY} worker paralel (percepatan sync 3x lipat)...\n`);
  const workers = Array.from({ length: CONCURRENCY }, (_, i) => worker(i + 1));
  await Promise.all(workers);

  // --- STEP 4: Ringkasan ---
  console.log('\n');
  console.log('══════════════════════════════════════════');
  console.log('  RINGKASAN SYNC MDS BISA');
  console.log('══════════════════════════════════════════');
  console.log(`  Total SKU      : ${stats.total}`);
  console.log(`  ✅ Berhasil    : ${stats.success}`);
  console.log(`  🆕 Produk baru : ${stats.notFound} (belum di DB)`);
  console.log(`  ⚠️  Dup barcode : ${stats.duplicateBarcode}`);
  console.log(`  ❌ Error       : ${stats.errors}`);
  console.log(`  🏪 Toko offline: ${stats.storeOffline}`);
  console.log('══════════════════════════════════════════');
  console.log('');

  // Log ke SyncHistory (Riwayat Sukses Update Terakhir)
  if (!isDryRun) {
    try {
      const user = await prisma.user.findFirst({
        where: {
          OR: [
            { nik: '22054178' },
            { nik: '223515' },
            { role: 'SUPERVISOR' },
          ]
        },
      }) || await prisma.user.findFirst();

      if (user) {
        const syncType = isStockOnly ? 'STOCK_SYNC' : 'MDS_BISA_SYNC';
        const syncFileName = isStockOnly 
          ? 'Fast Stock Update (Toko 719)' 
          : 'MDS BISA Full Catalog & Stok';
        const syncStatus = (stats.errors > stats.success && stats.success === 0) ? 'FAILED' : 'SUCCESS';

        await prisma.syncHistory.create({
          data: {
            userId: user.id,
            type: syncType,
            fileName: syncFileName,
            status: syncStatus,
            records: stats.success,
          },
        });
        console.log(`📝 Log sync berhasil dicatat ke SyncHistory (${syncType} ➔ ${stats.success} item, status: ${syncStatus}).`);
      }
    } catch (logErr) {
      console.warn('⚠️  Tidak bisa log ke SyncHistory:', logErr.message);
    }
  }

  await prisma.$disconnect();
  console.log('✅ Sync selesai!\n');
}

// ============================================================
// EXPORTS & RUN
// ============================================================
export { autoLogin, fetchItemDetail, fetchItemStock, parseServerActionResponse, extractProductFields };

if (process.argv[1]?.endsWith('sync_mds_bisa_full.mjs')) {
  main().catch(async (err) => {
    console.error('💥 Fatal error:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
}

