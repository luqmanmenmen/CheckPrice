import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import { parse } from 'csv-parse';

const prisma = new PrismaClient();
const filePath = 'D:\\Website\\SUKO\\PQ\\POWER QUERY 28 SEPTEMBER 2026.csv';

function parseNum(val) {
  if (!val) return 0;
  let clean = val.replace(/["\s,]/g, '').replace(/-/g, '0');
  let num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

async function main() {
  console.log("Cleaning database...");
  await prisma.dailySales.deleteMany({});
  await prisma.poSuggestion.deleteMany({});
  
  // Wipe products safely
  await prisma.product.deleteMany({});
  console.log("Database cleaned.");

  const batch = [];
  let count = 0;

  const processBatch = async (items) => {
    await prisma.product.createMany({
      data: items,
      skipDuplicates: true
    });
  };

  const parser = fs.createReadStream(filePath).pipe(parse({
    from_line: 4,
    columns: true,
    relax_quotes: true,
    escape: '\\',
    ltrim: true,
    rtrim: true,
  }));

  for await (const row of parser) {
    let sku = row['SKU'];
    if (!sku) continue;

    let stok = parseNum(row['EOH UNIT']);
    let eohRetail = parseNum(row['Sum of EOH_RETAIL']);
    let mtdSales = parseNum(row['MTD SALES UNIT']);
    let mtdRetail = parseNum(row['MTD SALES RETAIL']);
    
    let hargaNormal = 0;
    if (stok > 0 && eohRetail > 0) hargaNormal = Math.round(eohRetail / stok);
    else if (mtdSales > 0 && mtdRetail > 0) hargaNormal = Math.round(mtdRetail / mtdSales);

    batch.push({
      sku: sku,
      description: row['ITEM_DESCRIPTION'] || '',
      brand: row['PARENT_NAME'] || '',
      dept: row['DEPARTMENT'] || '',
      acara: row['GROUP'] || '',
      hargaNormal: hargaNormal,
      stok: stok,
      eoh_retail: eohRetail,
      sales_mtd: mtdSales,
      sales_mtd_retail: mtdRetail,
      sales_wtd: parseNum(row['WTD SALES UNIT']),
      sales_wtd_retail: parseNum(row['WTD SALES RETAIL']),
      sales_ytd: parseNum(row['Sum of YTD_SALES_UNIT']),
      sales_ytd_retail: parseNum(row['Sum of YTD_SALES_RETAIL']),
      boy_unit: parseNum(row['Sum of BOY_UNIT']),
      boy_retail: parseNum(row['Sum of BOY_RETAIL']),
    });

    if (batch.length >= 3000) {
      await processBatch(batch);
      count += batch.length;
      console.log(`Inserted ${count} records...`);
      batch.length = 0;
    }
  }

  if (batch.length > 0) {
    await processBatch(batch);
    count += batch.length;
    console.log(`Inserted ${count} records...`);
  }

  console.log("Seeding complete! Database is now using the 28 September data.");
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
