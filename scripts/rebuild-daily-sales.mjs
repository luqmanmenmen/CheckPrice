import { PrismaClient } from "@prisma/client";
import xlsx from "xlsx";
import fs from "fs";
import path from "path";

process.loadEnvFile("c:/Max Display/price-checker/.env");

const prisma = new PrismaClient();
const BLOB_DIR = "C:/Users/LUCKMEN/.gemini/antigravity-ide/brain/1453a1a0-5638-4a14-8bcf-608ce30bc7fb/scratch/blobs";

// Helpers
function safeFloat(val) {
  if (val === null || val === undefined || val === "") return 0;
  const n = parseFloat(String(val).replace(/[^0-9.-]/g, ""));
  return isNaN(n) ? 0 : n;
}

const REQUIRED_COLS = ["SKU"];

const COL_ALIASES = {
  "SKU":          ["SKU", "KODE", "KODE PRODUK", "PRODUCT CODE", "CODE", "ID"],
  "DAY_SALES_UNIT": ["DAY SALES UNIT", "DAY_SALES_UNIT"],
  "DAY_SALES_RETAIL": ["DAY SALES RETAIL", "DAY_SALES_RETAIL"]
};

function normalizeKeys(row) {
  const out = {};
  for (const key of Object.keys(row)) {
    out[key.trim().toUpperCase()] = row[key];
  }
  return out;
}

function remapKeys(row) {
  const out = { ...row };
  for (const [standard, aliases] of Object.entries(COL_ALIASES)) {
    if (standard in out) continue;
    for (const alias of aliases) {
      if (alias in out) {
        out[standard] = out[alias];
        break;
      }
    }
  }
  return out;
}

function sheetHasRequiredCols(remappedRow) {
  return REQUIRED_COLS.every((col) => col in remappedRow && remappedRow[col] !== undefined && remappedRow[col] !== "");
}

function processWorkbook(buffer) {
  const productMap = new Map();
  const workbook = xlsx.read(buffer, { type: "buffer", cellDates: false });

  const findHeaderRowIndex = (ws) => {
    const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: "" });
    for (let i = 0; i < Math.min(20, rows.length); i++) {
      const row = rows[i];
      if (!row) continue;
      const hasSKU = row.some(cell => {
        if (typeof cell !== 'string') return false;
        const c = cell.toUpperCase().trim();
        return c === "SKU" || c === "KODE PRODUK" || c === "KODE" || c === "ARTICLE" || c === "BARCODE";
      });
      if (hasSKU) return i;
    }
    return 0;
  };

  for (const sheetName of workbook.SheetNames) {
    const ws = workbook.Sheets[sheetName];
    const headerRowIndex = findHeaderRowIndex(ws);
    const rawRows = xlsx.utils.sheet_to_json(ws, { range: headerRowIndex, defval: "" });

    if (rawRows.length === 0) continue;

    const rows = rawRows.map(r => remapKeys(normalizeKeys(r)));
    const firstRow = rows[0];
    if (!sheetHasRequiredCols(firstRow)) continue;

    for (const row of rows) {
      const sku = String(row["SKU"] ?? "").trim();
      if (!sku) continue;

      const day_sales_unit = row["DAY_SALES_UNIT"] !== undefined && row["DAY_SALES_UNIT"] !== "" ? parseInt(row["DAY_SALES_UNIT"]) || 0 : 0;
      const day_sales_retail = row["DAY_SALES_RETAIL"] !== undefined ? safeFloat(row["DAY_SALES_RETAIL"]) : 0;

      if (day_sales_unit > 0 || day_sales_retail > 0) {
        productMap.set(sku, { day_sales_unit, day_sales_retail });
      }
    }
  }

  return productMap;
}

async function rebuildDailySales() {
  console.log("Wiping DailySales table...");
  await prisma.dailySales.deleteMany({});
  console.log("Wiped DailySales.");

  const MONTHS = {
    JANUARI:'01', JANUARY:'01', FEBRUARI:'02', FEBRUARY:'02', MARET:'03', MARCH:'03', APRIL:'04',
    MEI:'05', MAY:'05', JUNI:'06', JUNE:'06', JULI:'07', JULY:'07', AGUSTUS:'08', AUGUST:'08',
    SEPTEMBER:'09', OKTOBER:'10', OCTOBER:'10', NOVEMBER:'11', DESEMBER:'12', DECEMBER:'12'
  };

  const pqDir = path.join(BLOB_DIR, "PQ");
  if (!fs.existsSync(pqDir)) return;
  
  const files = fs.readdirSync(pqDir);
  
  // Sort files by date to process chronologically if needed
  
  for (const f of files) {
    console.log(`Processing PQ file for DailySales: ${f}`);
    const match = f.match(/(\d{1,2})\s+([A-Z]+)\s+(\d{4})/i);
    if (!match) continue;
    
    const m = MONTHS[match[2].toUpperCase()] || '01';
    const dateStr = `${match[3]}-${m}-${match[1].padStart(2, '0')}T00:00:00.000Z`;
    const targetDate = new Date(dateStr);

    const buf = fs.readFileSync(path.join(pqDir, f));
    const map = processWorkbook(buf);

    console.log(`Found ${map.size} products with sales on ${dateStr}`);

    // Batch fetch product IDs
    const skus = Array.from(map.keys());
    const products = await prisma.product.findMany({
      where: { sku: { in: skus } },
      select: { id: true, sku: true }
    });
    
    const skuToId = new Map(products.map(p => [p.sku, p.id]));
    
    const insertData = [];
    for (const [sku, sales] of map.entries()) {
      const pid = skuToId.get(sku);
      if (pid) {
        insertData.push({
          productId: pid,
          date: targetDate,
          qtySold: sales.day_sales_unit,
          omzet: sales.day_sales_retail
        });
      }
    }

    if (insertData.length > 0) {
      await prisma.dailySales.createMany({
        data: insertData,
        skipDuplicates: true
      });
      console.log(`Inserted ${insertData.length} records into DailySales for ${f}`);
    }
  }

  console.log("DailySales rebuild complete!");
}

rebuildDailySales().catch(console.error).finally(() => prisma.$disconnect());
