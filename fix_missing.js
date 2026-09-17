const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function normalizeKeys(row) {
  const out = {};
  for (const key of Object.keys(row)) out[key.trim()] = row[key];
  return out;
}

function safeFloat(val) {
  if (val === null || val === undefined || val === '') return 0;
  const n = parseFloat(String(val).replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? 0 : n;
}

async function main() {
  const dir = 'D:\\Website\\SUKO';
  const files = fs.readdirSync(dir).filter(f =>
    f.endsWith('.xlsx') && !f.startsWith('~') && !f.startsWith('Summary')
  );

  const REQUIRED = ['SKU', 'DESCRIPTION', 'HARGA NORMAL'];

  // Build global map with dedup logic (promo wins over normal)
  const globalMap = new Map();

  for (const f of files) {
    const buf = fs.readFileSync(path.join(dir, f));
    const wb = xlsx.read(buf, { type: 'buffer', cellDates: false });

    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      const rawRows = xlsx.utils.sheet_to_json(ws, { defval: '' });
      if (!rawRows.length) continue;

      const rows = rawRows.map(normalizeKeys);
      const first = rows[0];
      if (!REQUIRED.every(c => c in first)) continue;

      for (const row of rows) {
        const sku = String(row['SKU'] ?? '').trim();
        if (!sku) continue;

        const rawPromo = row['HARGA PROMO'];
        const hargaPromoRaw = (typeof rawPromo === 'string' && rawPromo.toUpperCase().includes('NORMAL'))
          ? null : safeFloat(rawPromo);
        const hargaPromo = hargaPromoRaw && hargaPromoRaw > 0 ? hargaPromoRaw : null;

        const item = {
          sku,
          article: String(row['ARTICLE'] ?? '').trim() || null,
          description: String(row['DESCRIPTION'] ?? '').trim(),
          acara: String(row['ACARA'] ?? '').trim() || null,
          fromDate: null,
          toDate: null,
          hargaNormal: safeFloat(row['HARGA NORMAL']),
          hargaPromo,
          diskon: String(row['DISKON'] ?? '').trim() || null,
          discountType: String(row['DISCOUNT TYPE'] ?? '').trim() || null,
          brand: String(row['BRAND'] ?? '').trim() || null,
          dept: String(row['DEPT'] ?? '').trim() || null,
          _source: `${f}::${sheetName}`,
        };

        const existing = globalMap.get(sku);
        if (!existing) {
          globalMap.set(sku, item);
        } else {
          const existIsPromo = existing.hargaPromo !== null && existing.hargaPromo > 0;
          const newIsPromo = item.hargaPromo !== null && item.hargaPromo > 0;
          if (!existIsPromo && newIsPromo) globalMap.set(sku, item);
        }
      }
    }
  }

  console.log(`Total SKU unik dari Excel: ${globalMap.size}`);

  // Check which SKUs are NOT in DB
  const allDbSkus = new Set(
    (await prisma.product.findMany({ select: { sku: true } })).map(p => p.sku)
  );
  console.log(`Total SKU di DB: ${allDbSkus.size}`);

  const missing = [...globalMap.keys()].filter(sku => !allDbSkus.has(sku));
  console.log(`SKU yang TIDAK ada di DB: ${missing.length}`);

  if (missing.length > 0) {
    console.log('\n--- Penyebab missing (10 pertama) ---');
    for (const sku of missing.slice(0, 10)) {
      const item = globalMap.get(sku);
      console.log(`SKU: ${sku}`);
      console.log(`  Source: ${item._source}`);
      console.log(`  Desc: ${item.description.substring(0, 60)}`);
      console.log(`  hargaNormal: ${item.hargaNormal}`);

      // Try to figure out why upsert might fail
      if (!item.sku) console.log('  ISSUE: SKU kosong!');
      if (!item.description) console.log('  ISSUE: Description kosong!');
    }

    // Try inserting missing ones now and report errors
    console.log('\n--- Mencoba insert missing SKUs ---');
    let ok = 0, fail = 0;
    for (const sku of missing) {
      const item = globalMap.get(sku);
      const { _source, ...data } = item;
      try {
        await prisma.product.upsert({
          where: { sku: data.sku },
          update: data,
          create: data,
        });
        ok++;
      } catch (e) {
        console.log(`FAIL SKU ${sku}: ${e.message}`);
        fail++;
      }
    }
    console.log(`\nHasil: ${ok} berhasil, ${fail} gagal`);
  }

  const finalCount = await prisma.product.count();
  console.log(`\nTotal akhir di DB: ${finalCount}`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
