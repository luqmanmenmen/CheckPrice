const { PrismaClient } = require('@prisma/client');
const https = require('https');

const prisma = new PrismaClient();

function safeNum(val) {
  if (!val && val !== 0) return 0;
  const s = String(val).replace(/[^0-9.-]/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

// Parse CSV where actual header starts at line 4 (skip first 3 metadata lines)
function parseCSV(text) {
  const lines = text.split(/\r?\n/);
  // Find the header row (contains 'SKU')
  let headerIdx = -1;
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    if (lines[i].toUpperCase().includes('SKU')) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) { console.error('Header SKU tidak ditemukan!'); return []; }
  console.log(`Header found at line ${headerIdx + 1}: ${lines[headerIdx].substring(0, 150)}`);

  // Simple CSV split
  function splitLine(line) {
    const vals = [];
    let inQ = false, cur = '';
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { vals.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    vals.push(cur.trim());
    return vals;
  }

  const headers = splitLine(lines[headerIdx]).map(h => h.trim().toUpperCase());
  console.log('Headers:', headers.slice(0, 15).join(' | '));

  const rows = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const vals = splitLine(line);
    const row = {};
    headers.forEach((h, idx) => { row[h] = vals[idx] ?? ''; });
    if (row['SKU']) rows.push(row);
  }
  return rows;
}

function buildMap(rows) {
  const map = new Map();
  for (const row of rows) {
    const sku = String(row['SKU'] ?? '').trim();
    if (!sku) continue;
    map.set(sku, {
      sku,
      brand:            String(row['GROUP'] || '').trim() || null,
      dept:             String(row['DEPARTMENT'] || '').trim() || null,
      article:          String(row['PARENT_NAME'] || '').trim() || null,
      description:      String(row['ITEM_DESCRIPTION'] || '').trim() || null,
      boy_unit:         safeNum(row['SUM OF BOY_UNIT'] || 0),
      boy_retail:       safeNum(row['SUM OF BOY_RETAIL'] || 0),
      bom_unit:         safeNum(row['BOM UNIT'] || 0),
      day_sales_unit:   safeNum(row['DAY SALES UNIT'] || 0),
      day_sales_retail: safeNum(row['DAY SALES RETAIL'] || 0),
      sales_wtd:        safeNum(row['WTD SALES UNIT'] || 0),
      sales_wtd_retail: safeNum(row['WTD SALES RETAIL'] || 0),
      sales_mtd:        safeNum(row['MTD SALES UNIT'] || 0),
      sales_mtd_retail: safeNum(row['MTD SALES RETAIL'] || 0),
      sales_ytd:        safeNum(row['SUM OF YTD_SALES_UNIT'] || 0),
      sales_ytd_retail: safeNum(row['SUM OF YTD_SALES_RETAIL'] || 0),
      stok:             safeNum(row['EOH UNIT'] || 0),
      eoh_retail:       safeNum(row['SUM OF EOH_RETAIL'] || row['JUMLAH DARI BOM_RETAIL'] || 0),
    });
  }
  return map;
}


async function main() {
  const history = await prisma.syncHistory.findMany({
    where: { type: 'PQ_HARIAN', fileUrl: { not: null } },
    orderBy: { createdAt: 'asc' },
    take: 10,
    select: { fileName: true, fileUrl: true, createdAt: true }
  });

  history.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const oldFile = history[history.length - 2];
  const newFile = history[history.length - 1];
  console.log('OLD:', oldFile.fileName);
  console.log('NEW:', newFile.fileName);

  console.log('\nDownloading...');
  const [oldText, newText] = await Promise.all([fetchUrl(oldFile.fileUrl), fetchUrl(newFile.fileUrl)]);

  console.log('\nParsing OLD...');
  const oldRows = parseCSV(oldText);
  console.log('OLD rows:', oldRows.length);

  console.log('\nParsing NEW...');
  const newRows = parseCSV(newText);
  console.log('NEW rows:', newRows.length);

  // Sample check
  if (newRows.length > 0) {
    const sample = newRows[0];
    console.log('\nSample row keys:', Object.keys(sample).join(' | '));
    console.log('Sample SKU:', sample.sku, '| MTD:', sample.sales_mtd, '| DAY:', sample.day_sales_unit, '| DAY_RETAIL:', sample.day_sales_retail);
  }

  const oldMap = buildMap(oldRows);
  const newMap = buildMap(newRows);
  console.log(`\nOLD map size: ${oldMap.size}, NEW map size: ${newMap.size}`);

  // Check totals
  let totalDaySalesUnit = 0, totalDaySalesRetail = 0, totalDeltaQty = 0, totalDeltaOmzet = 0;
  for (const [sku, item] of newMap) {
    const old = oldMap.get(sku);
    totalDaySalesUnit   += item.day_sales_unit || 0;
    totalDaySalesRetail += item.day_sales_retail || 0;
    if (old) {
      const dq = (item.sales_mtd || 0) - (old.sales_mtd || 0);
      const do_ = (item.sales_mtd_retail || 0) - (old.sales_mtd_retail || 0);
      if (dq > 0) totalDeltaQty   += dq;
      if (do_ > 0) totalDeltaOmzet += do_;
    }
  }
  console.log('\n=== SUMMARY ===');
  console.log('Total DAY_SALES_UNIT (from column):', totalDaySalesUnit);
  console.log('Total DAY_SALES_RETAIL (from column):', totalDaySalesRetail);
  console.log('Total delta QTY (MTD diff):', totalDeltaQty);
  console.log('Total delta Omzet (MTD diff):', totalDeltaOmzet);

  if (newMap.size === 0) {
    console.error('\nERROR: Map kosong! Stop sebelum update DB.');
    return;
  }

  console.log('\nStarting DB update...');
  const allSkus = Array.from(newMap.keys());
  const existingProducts = await prisma.product.findMany({
    where: { sku: { in: allSkus } },
    select: { id: true, sku: true, sales_mtd_retail: true, sales_mtd: true,
              hargaPromo: true, diskon: true, discountType: true, acara: true, fromDate: true, toDate: true }
  });
  const existingMap = new Map(existingProducts.map(p => [p.sku, p]));
  console.log('Produk di DB:', existingMap.size);

  // Clear DailySales for upload date
  const uploadDate = new Date(newFile.createdAt);
  const dateStart = new Date(uploadDate); dateStart.setHours(0,0,0,0);
  const dateEnd   = new Date(uploadDate); dateEnd.setHours(23,59,59,999);
  const deleted = await prisma.dailySales.deleteMany({ where: { date: { gte: dateStart, lte: dateEnd } } });
  console.log('DailySales lama dihapus:', deleted.count);

  const dailySalesData = [];
  const CHUNK = 500;
  let totalUpdated = 0;
  const items = Array.from(newMap.values());

  for (let i = 0; i < items.length; i += CHUNK) {
    const chunk = items.slice(i, i + CHUNK);
    const values = [];
    const placeholders = [];
    let pi = 1;

    for (const item of chunk) {
      const existing = existingMap.get(item.sku);
      if (!existing) continue;
      const oldItem = oldMap.get(item.sku);

      let qtyDelta   = item.day_sales_unit   > 0 ? item.day_sales_unit   : 0;
      let omzetDelta = item.day_sales_retail > 0 ? item.day_sales_retail : 0;

      if (qtyDelta === 0 && oldItem) {
        const diff = (item.sales_mtd || 0) - (oldItem.sales_mtd || 0);
        if (diff > 0) qtyDelta = diff;
      }
      if (omzetDelta === 0 && oldItem) {
        const diff = (item.sales_mtd_retail || 0) - (oldItem.sales_mtd_retail || 0);
        if (diff > 0) omzetDelta = diff;
      }

      placeholders.push(`($${pi++}::text,$${pi++}::text,$${pi++}::text,$${pi++}::text,$${pi++}::text,$${pi++}::int,$${pi++}::double precision,$${pi++}::int,$${pi++}::double precision,$${pi++}::int,$${pi++}::double precision,$${pi++}::int,$${pi++}::double precision,$${pi++}::int,$${pi++}::double precision,$${pi++}::int,$${pi++}::int,$${pi++}::double precision,$${pi++}::int,$${pi++}::double precision)`);
      values.push(
        item.sku,
        item.description || null,
        item.brand || null,
        item.dept || null,
        item.article || null,
        item.stok ?? null,
        item.eoh_retail ?? null,
        item.sales_mtd ?? null,
        item.sales_mtd_retail ?? null,
        item.sales_ytd ?? null,
        item.sales_ytd_retail ?? null,
        item.sales_wtd ?? null,
        item.sales_wtd_retail ?? null,
        item.boy_unit ?? null,
        item.boy_retail ?? null,
        qtyDelta > 0 ? qtyDelta : null,
        item.bom_unit ?? null,
        omzetDelta > 0 ? omzetDelta : null,
        item.day_sales_unit > 0 ? item.day_sales_unit : (qtyDelta > 0 ? qtyDelta : null),
        item.day_sales_retail > 0 ? item.day_sales_retail : (omzetDelta > 0 ? omzetDelta : null),
      );

      if (qtyDelta > 0 || omzetDelta > 0) {
        dailySalesData.push({ productId: existing.id, date: uploadDate, qtySold: qtyDelta || 1, omzet: omzetDelta || 0 });
      }
    }

    if (placeholders.length > 0) {
      const query = `
        UPDATE "Product" as p SET
          "description"      = COALESCE(v."description",      p."description"),
          "brand"            = COALESCE(v."brand",            p."brand"),
          "dept"             = COALESCE(v."dept",             p."dept"),
          "article"          = COALESCE(v."article",          p."article"),
          "stok"             = COALESCE(v."stok",             p."stok"),
          "eoh_retail"       = COALESCE(v."eoh_retail",       p."eoh_retail"),
          "sales_mtd"        = COALESCE(v."sales_mtd",        p."sales_mtd"),
          "sales_mtd_retail" = COALESCE(v."sales_mtd_retail", p."sales_mtd_retail"),
          "sales_ytd"        = COALESCE(v."sales_ytd",        p."sales_ytd"),
          "sales_ytd_retail" = COALESCE(v."sales_ytd_retail", p."sales_ytd_retail"),
          "sales_wtd"        = COALESCE(v."sales_wtd",        p."sales_wtd"),
          "sales_wtd_retail" = COALESCE(v."sales_wtd_retail", p."sales_wtd_retail"),
          "boy_unit"         = COALESCE(v."boy_unit",         p."boy_unit"),
          "boy_retail"       = COALESCE(v."boy_retail",       p."boy_retail"),
          "day_sales_unit"   = COALESCE(v."day_sales_unit",   p."day_sales_unit"),
          "bom_unit"         = COALESCE(v."bom_unit",         p."bom_unit"),
          "day_sales_retail" = COALESCE(v."day_sales_retail", p."day_sales_retail"),
          "updatedAt"        = CURRENT_TIMESTAMP
        FROM (VALUES ${placeholders.join(',')}) AS v("sku","description","brand","dept","article","stok","eoh_retail","sales_mtd","sales_mtd_retail","sales_ytd","sales_ytd_retail","sales_wtd","sales_wtd_retail","boy_unit","boy_retail","day_sales_unit","bom_unit","day_sales_retail","day_sales_unit_f","day_sales_retail_f")
        WHERE p."sku" = v."sku"
      `;
      await prisma.$executeRawUnsafe(query, ...values);
      totalUpdated += placeholders.length;
      process.stdout.write(`\rUpdated: ${totalUpdated}/${items.length}`);
    }
  }

  console.log('\nInserting DailySales:', dailySalesData.length);
  if (dailySalesData.length > 0) {
    await prisma.dailySales.createMany({ data: dailySalesData, skipDuplicates: true });
  }

  // Final check
  const agg = await prisma.product.aggregate({ _sum: { day_sales_retail: true, day_sales_unit: true, sales_mtd_retail: true } });
  const dsCount = await prisma.dailySales.count();
  console.log('\n=== HASIL AKHIR ===');
  console.log('Produk diupdate:', totalUpdated);
  console.log('DailySales dibuat:', dailySalesData.length, '| Total di DB:', dsCount);
  console.log('Omzet Hari Ini (day_sales_retail):', agg._sum.day_sales_retail?.toLocaleString('id-ID'));
  console.log('Qty Hari Ini (day_sales_unit):', agg._sum.day_sales_unit);
  console.log('Omzet MTD:', agg._sum.sales_mtd_retail?.toLocaleString('id-ID'));
}

main().catch(console.error).finally(() => prisma.$disconnect());
