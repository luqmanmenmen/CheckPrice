const fs = require('fs');
const readline = require('readline');

async function testPrices() {
  const fileStream = fs.createReadStream('D:\\Website\\SUKO\\PQ\\POWER QUERY 23 SEPTEMBER 2026.csv');
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let isHeader = true;
  let headers = [];
  
  for await (const line of rl) {
    if (isHeader) {
      headers = line.split(',');
      isHeader = false;
      continue;
    }
    const cols = line.split(',');
    
    // Find unit and retail
    const eohUnit = parseFloat(cols[headers.indexOf('EOH_UNIT')]) || 0;
    const eohRetail = parseFloat(cols[headers.indexOf('EOH_RETAIL')]) || 0;
    const ytdUnit = parseFloat(cols[headers.indexOf('YTD_SALES_UNIT')]) || 0;
    const ytdRetail = parseFloat(cols[headers.indexOf('YTD_SALES_RETAIL')]) || 0;
    
    let basePrice = 0;
    if (eohUnit > 0) basePrice = eohRetail / eohUnit;
    else if (ytdUnit > 0) basePrice = ytdRetail / ytdUnit;
    
    if (basePrice > 0) {
      const p11 = Math.round(basePrice * 1.11);
      // Math.ceil to nearest hundred
      const rounded = Math.ceil(p11 / 100) * 100;
      console.log(`SKU: ${cols[2]}, EOH: ${eohUnit}, BasePrice: ${basePrice.toFixed(2)}, w/ 11%: ${p11}, Rounded: ${rounded}`);
    }
  }
}

testPrices().then(() => process.exit(0));
