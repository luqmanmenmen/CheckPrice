const fs = require('fs');
const readline = require('readline');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixSalesMtd() {
  const fileStream = fs.createReadStream('D:\\Website\\SUKO\\PQ\\POWER QUERY 23 SEPTEMBER 2026.csv');
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let isHeader = true;
  let headers = [];
  const salesMap = new Map();
  
  for await (const line of rl) {
    if (isHeader) {
      headers = line.split(',');
      isHeader = false;
      continue;
    }
    const cols = line.split(',');
    const sku = cols[2];
    
    // Find unit sales
    const mtdUnit = parseFloat(cols[headers.indexOf('MTD_SALES_UNIT')]) || 0;
    
    if (mtdUnit > 0 && sku) {
      salesMap.set(sku, mtdUnit);
    }
  }
  
  console.log(`Parsed ${salesMap.size} items with sales > 0 from PQ file`);
  
  let updated = 0;
  
  // Use a chunked approach or individual updates
  for (const [sku, sales_mtd] of salesMap.entries()) {
    const res = await prisma.product.updateMany({
      where: { sku: sku },
      data: { sales_mtd: sales_mtd }
    });
    if (res.count > 0) updated += res.count;
  }
  
  console.log(`Updated sales_mtd for ${updated} products in DB!`);
}

fixSalesMtd()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
