/**
 * BATCH PQ IMPORT v2 — FAST VERSION
 * - Bulk update via raw SQL (tidak satu per satu)
 * - Proses chronological untuk delta MTD yang akurat
 * - Insert DailySales per tanggal dengan omzet dari delta MTD_SALES_RETAIL
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

const prisma = new PrismaClient();
const PQ_FOLDER = 'D:\\Website\\SUKO\\PQ';

const BULAN = {
  januari: 1, februari: 2, maret: 3, april: 4, mei: 5, juni: 6,
  juli: 7, agustus: 8, september: 9, oktober: 10, november: 11, desember: 12,
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

function parseDateFromFilename(filename) {
  const lower = filename.toLowerCase();
  const match = lower.match(/(\d{1,2})\s+([a-z]+)\s+(\d{4})/);
  if (!match) return null;
  const day = parseInt(match[1]);
  const month = BULAN[match[2]];
  const year = parseInt(match[3]);
  if (!month) return null;
  return new Date(Date.UTC(year, month - 1, day, 10, 0, 0)); // 17WIB = 10UTC
}

function safeFloat(val) {
  if (val === null || val === undefined || val === '') return 0;
  const n = parseFloat(String(val).replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? 0 : n;
}

function safeInt(val) {
  if (val === null || val === undefined || val === '') return 0;
  const n = parseInt(String(val));
  return isNaN(n) ? 0 : n;
}

async function main() {
  const allFiles = fs.readdirSync(PQ_FOLDER)
    .filter(f => (f.endsWith('.csv') || f.endsWith('.xlsx')) && !f.startsWith('~'))
    .map(f => ({ name: f, date: parseDateFromFilename(f) }))
    .filter(f => f.date !== null)
    .sort((a, b) => a.date - b.date);

  console.log(`\n📂 ${allFiles.length} file PQ ditemukan (diurutkan dari yang lama):\n`);
  allFiles.forEach(f => console.log(`  • ${f.name} → ${f.date.toISOString().split('T')[0]}`));
  console.log('');

  // Ambil semua produk dari DB (id + sku + prevMtdRetail)
  console.log('🔄 Load produk dari DB...');
  const allProducts = await prisma.product.findMany({
    select: { id: true, sku: true, sales_mtd_retail: true }
  });
  const productMap = new Map(allProducts.map(p => [p.sku, {
    id: p.id,
    prevMtdRetail: p.sales_mtd_retail || 0
  }]));
  console.log(`  ✅ ${productMap.size} produk di DB\n`);

  let grandTotalDS = 0;

  for (let fi = 0; fi < allFiles.length; fi++) {
    const { name: fileName, date: uploadDate } = allFiles[fi];
    const dateStr = uploadDate.toISOString().split('T')[0];
    const filePath = path.join(PQ_FOLDER, fileName);

    console.log(`\n📄 [${fi + 1}/${allFiles.length}] ${fileName} → ${dateStr}`);
    const t0 = Date.now();

    const rawContent = fs.readFileSync(filePath, 'utf8');
    const rows = parse(rawContent, { columns: true, skip_empty_lines: true, trim: true });
    console.log(`  → ${rows.length} baris`);

    // Build 2 arrays: update values dan daily sales
    const updateRows = [];   // untuk bulk SQL update
    const dailySales = [];   // untuk DailySales insert
    const newSkus = [];      // produk baru yg belum ada di DB

    for (const row of rows) {
      const sku = String(row['SKU'] || '').trim();
      if (!sku) continue;

      const stok       = safeInt(row['EOH_UNIT']);
      const eoh_retail = safeFloat(row['EOH_RETAIL']);
      const mtd_u      = safeInt(row['MTD_SALES_UNIT']);
      const mtd_r      = safeFloat(row['MTD_SALES_RETAIL']);
      const wtd_u      = safeInt(row['WTD_SAL_UNIT'] || row['WTD_SALES_UNIT']);
      const wtd_r      = safeFloat(row['WTD_SAL_RETAIL'] || row['WTD_SALES_RETAIL']);
      const ytd_u      = safeInt(row['YTD_SALES_UNIT']);
      const ytd_r      = safeFloat(row['YTD_SALES_RETAIL']);
      const boy_u      = safeInt(row['BOY_UNIT']);
      const boy_r      = safeFloat(row['BOY_RETAIL']);
      const desc       = (row['ITEM_DESCRIPTION'] || row['DESCRIPTION'] || '').trim();
      const article    = (row['PARENT_NAME'] || row['ARTICLE'] || '').trim() || null;
      const brand      = (row['GROUP'] || row['BRAND'] || '').trim() || null;
      const dept       = (row['DEPARTMENT'] || row['DEPT'] || '').trim() || null;

      // Hitung harga dari EOH
      let hargaNormal = 0;
      if (stok > 0 && eoh_retail > 0) hargaNormal = Math.round(eoh_retail / stok);
      else if (ytd_u > 0 && ytd_r > 0) hargaNormal = Math.round(ytd_r / ytd_u);

      const existing = productMap.get(sku);

      if (!existing) {
        // Produk baru
        newSkus.push({
          sku, description: desc || '-', article, brand, dept,
          hargaNormal, stok, eoh_retail,
          sales_mtd: mtd_u, sales_mtd_retail: mtd_r,
          sales_wtd: wtd_u, sales_wtd_retail: wtd_r,
          sales_ytd: ytd_u, sales_ytd_retail: ytd_r,
          boy_unit: boy_u, boy_retail: boy_r,
        });
        // Tambah ke map sebagai baseline untuk file berikutnya
        productMap.set(sku, { id: -1, prevMtdRetail: mtd_r });
        continue;
      }

      // Delta omzet harian
      const prevMtd = existing.prevMtdRetail || 0;
      const omzetDelta = mtd_r > prevMtd ? mtd_r - prevMtd : 0;

      // DailySales (hanya kalau ada penjualan)
      if (mtd_u > 0) {
        dailySales.push({
          productId: existing.id,
          date: uploadDate,
          qtySold: mtd_u,
          omzet: omzetDelta,
        });
      }

      // Update row untuk bulk SQL
      updateRows.push([
        sku, hargaNormal || null, desc || null, article, brand, dept,
        stok, eoh_retail, mtd_u, mtd_r, wtd_u, wtd_r, ytd_u, ytd_r, boy_u, boy_r
      ]);

      // Update baseline untuk file berikutnya
      productMap.set(sku, { id: existing.id, prevMtdRetail: mtd_r });
    }

    console.log(`  → ${updateRows.length} update, ${newSkus.length} SKU baru, ${dailySales.length} DailySales`);

    // 1. Insert produk baru (bulk)
    if (newSkus.length > 0) {
      const CHUNK = 500;
      for (let k = 0; k < newSkus.length; k += CHUNK) {
        await prisma.product.createMany({
          data: newSkus.slice(k, k + CHUNK),
          skipDuplicates: true,
        });
      }
      console.log(`  ✅ ${newSkus.length} produk baru di-insert`);
    }

    // 2. Bulk update produk existing (raw SQL, per 500)
    if (updateRows.length > 0) {
      const CHUNK = 500;
      for (let k = 0; k < updateRows.length; k += CHUNK) {
        const chunk = updateRows.slice(k, k + CHUNK);
        const placeholders = [];
        const vals = [];
        let pIdx = 1;
        for (const r of chunk) {
          placeholders.push(
            `($${pIdx++}::text,$${pIdx++}::double precision,$${pIdx++}::text,$${pIdx++}::text,$${pIdx++}::text,$${pIdx++}::text,$${pIdx++}::int,$${pIdx++}::double precision,$${pIdx++}::int,$${pIdx++}::double precision,$${pIdx++}::int,$${pIdx++}::double precision,$${pIdx++}::int,$${pIdx++}::double precision,$${pIdx++}::int,$${pIdx++}::double precision)`
          );
          vals.push(...r);
        }
        await prisma.$executeRawUnsafe(`
          UPDATE "Product" AS p SET
            "hargaNormal"      = COALESCE(v."hN", p."hargaNormal"),
            "description"      = COALESCE(v."dsc", p."description"),
            "article"          = COALESCE(v."art", p."article"),
            "brand"            = COALESCE(v."br", p."brand"),
            "dept"             = COALESCE(v."dp", p."dept"),
            "stok"             = v."stok",
            "eoh_retail"       = v."eoh_r",
            "sales_mtd"        = v."smtd",
            "sales_mtd_retail" = v."smtdr",
            "sales_wtd"        = v."swtd",
            "sales_wtd_retail" = v."swtdr",
            "sales_ytd"        = v."sytd",
            "sales_ytd_retail" = v."sytdr",
            "boy_unit"         = v."boy_u",
            "boy_retail"       = v."boy_r",
            "updatedAt"        = CURRENT_TIMESTAMP
          FROM (VALUES ${placeholders.join(',')})
          AS v("sku","hN","dsc","art","br","dp","stok","eoh_r","smtd","smtdr","swtd","swtdr","sytd","sytdr","boy_u","boy_r")
          WHERE p."sku" = v."sku"
        `, ...vals);
      }
      console.log(`  ✅ ${updateRows.length} produk diupdate`);
    }

    // 3. DailySales — hapus yg lama, insert baru
    if (dailySales.length > 0) {
      const startOfDay = new Date(uploadDate); startOfDay.setUTCHours(0, 0, 0, 0);
      const endOfDay   = new Date(uploadDate); endOfDay.setUTCHours(23, 59, 59, 999);
      await prisma.dailySales.deleteMany({ where: { date: { gte: startOfDay, lte: endOfDay } } });

      const CHUNK = 500;
      for (let k = 0; k < dailySales.length; k += CHUNK) {
        await prisma.dailySales.createMany({ data: dailySales.slice(k, k + CHUNK), skipDuplicates: true });
      }
      grandTotalDS += dailySales.length;
      console.log(`  ✅ ${dailySales.length} DailySales → ${dateStr}`);
    }

    console.log(`  ⏱  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }

  console.log('\n' + '═'.repeat(60));
  console.log('✅ SELESAI!');
  console.log(`  File diproses     : ${allFiles.length}`);
  console.log(`  Total DailySales  : ${grandTotalDS}`);
  console.log('═'.repeat(60) + '\n');

  await prisma.$disconnect();
}

main().catch(e => { console.error('❌', e); process.exit(1); });
