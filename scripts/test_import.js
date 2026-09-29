const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const xlsx = require('xlsx');

async function main() {
  const filePath = "D:\\Website\\SUKO\\PQ\\POWER QUERY 28 SEPTEMBER 2026.csv";
  const ws = xlsx.readFile(filePath).Sheets[xlsx.readFile(filePath).SheetNames[0]];
  const rawData = xlsx.utils.sheet_to_json(ws, { header: 1, defval: "" });
  
  let headerRowIndex = 0;
  for (let i = 0; i < 20; i++) {
    if (rawData[i].some(c => String(c).includes("SKU"))) {
      headerRowIndex = i; break;
    }
  }
  
  const headers = rawData[headerRowIndex].map(h => String(h).trim());
  const rowObj = {};
  for (let j = 0; j < headers.length; j++) {
    rowObj[headers[j]] = rawData[headerRowIndex + 1][j];
  }
  
  console.log("Raw Row:", rowObj);
  
  // Try to create exactly one product to see Prisma error
  try {
    await prisma.product.create({
      data: {
        sku: "TEST_" + Date.now(),
        description: "Test",
        hargaNormal: 0,
        // Insert other fields to see what fails
      }
    });
    console.log("Created test!");
  } catch(e) {
    console.log("Error:", e.message);
  }
}
main().finally(() => process.exit(0));
