const fs = require('fs');
const readline = require('readline');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixPrices() {
  const fileStream = fs.createReadStream('D:\\Website\\SUKO\\PQ\\POWER QUERY 23 SEPTEMBER 2026.csv');
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let isHeader = true;
  let headers = [];
  const pricesMap = new Map();
  
  for await (const line of rl) {
    if (isHeader) {
      headers = line.split(',');
      isHeader = false;
      continue;
    }
    const cols = line.split(',');
    const sku = cols[2];
    
    // Find unit and retail
    const eohUnit = parseFloat(cols[headers.indexOf('EOH_UNIT')]) || 0;
    const eohRetail = parseFloat(cols[headers.indexOf('EOH_RETAIL')]) || 0;
    const ytdUnit = parseFloat(cols[headers.indexOf('YTD_SALES_UNIT')]) || 0;
    const ytdRetail = parseFloat(cols[headers.indexOf('YTD_SALES_RETAIL')]) || 0;
    const boyUnit = parseFloat(cols[headers.indexOf('BOY_UNIT')]) || 0;
    const boyRetail = parseFloat(cols[headers.indexOf('BOY_RETAIL')]) || 0;
    
    let basePrice = 0;
    if (eohUnit > 0) basePrice = eohRetail / eohUnit;
    else if (ytdUnit > 0) basePrice = ytdRetail / ytdUnit;
    else if (boyUnit > 0) basePrice = boyRetail / boyUnit;
    
    if (basePrice > 0 && sku) {
      pricesMap.set(sku, Math.round(basePrice));
    }
  }
  
  console.log(`Parsed ${pricesMap.size} prices from PQ file`);
  
  // Update all products in DB that have hargaNormal = 0 or missing
  const products = await prisma.product.findMany({
    where: { hargaNormal: 0 }
  });
  
  console.log(`Found ${products.length} products with hargaNormal = 0 in DB`);
  
  let updated = 0;
  for (const p of products) {
    const newPrice = pricesMap.get(p.sku);
    if (newPrice && newPrice > 0) {
      await prisma.product.update({
        where: { id: p.id },
        data: { hargaNormal: newPrice }
      });
      updated++;
    }
  }
  
  console.log(`Fixed ${updated} missing prices!`);
}

fixPrices()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
