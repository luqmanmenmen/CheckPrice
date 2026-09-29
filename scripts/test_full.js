const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const xlsx = require('xlsx');

// Copy pasting the exact logic from route.ts to see where it crashes
const REQUIRED_COLS = ["SKU"];
const COL_ALIASES = {
  "SKU":          ["SKU", "KODE", "KODE PRODUK", "PRODUCT CODE", "CODE", "ID"],
  "DESCRIPTION":  ["DESCRIPTION", "ITEM_DESCRIPTION", "ITEM DESCRIPTION", "NAMA", "NAMA PRODUK", "PRODUCT NAME", "DESC", "KETERANGAN", "DESKRIPSI", "ITEM_DESCRIP"],
  "HARGA NORMAL": ["HARGA NORMAL", "HARGA", "NORMAL PRICE", "PRICE", "HARGA JUAL", "REGULAR PRICE", "HARGA POKOK"],
  "HARGA PROMO":  ["HARGA PROMO", "PROMO PRICE", "PROMO", "HARGA DISKON", "DISC PRICE"],
  "ARTICLE":      ["ARTICLE", "ARTIKEL", "BARCODE", "NO ARTIKEL", "PARENT_NAME", "PARENT NAME"],
  "FROM DATE":    ["FROM DATE", "DARI TANGGAL", "START DATE", "TGL MULAI", "FROM"],
  "TO DATE":      ["TO DATE", "SAMPAI TANGGAL", "END DATE", "TGL AKHIR", "TO", "BERLAKU SAMPAI"],
  "DISKON":       ["DISKON", "DISCOUNT", "DISC", "POTONGAN"],
  "DISCOUNT TYPE":["DISCOUNT TYPE", "TIPE DISKON", "JENIS DISKON"],
  "BRAND":        ["BRAND", "MEREK", "MERK", "GROUP"],
  "DEPT":         ["DEPT", "DEPARTMENT", "DIVISI", "KATEGORI", "CATEGORY"],
  "ACARA":        ["ACARA", "EVENT", "PROMO NAME", "NAMA PROMO"],
  "STOK":         ["STOK", "EOH_UNIT", "EOH UNIT", "EOH", "SISA STOK", "QTY", "STOK SISA"],
  "SALES_MTD":    ["SALES_MTD", "MTD_SALES_UNIT", "MTD SALES UNIT", "SALES MTD", "MTD", "TERJUAL", "SALES"],
  "MTD_SALES_RETAIL": ["MTD_SALES_RETAIL", "MTD SALES RETAIL"],
  "YTD_SALES_UNIT": ["YTD_SALES_UNIT", "YTD SALES UNIT", "SUM OF YTD_SALES_UNIT"],
  "YTD_SALES_RETAIL": ["YTD_SALES_RETAIL", "YTD SALES RETAIL", "SUM OF YTD_SALES_RETAIL"],
  "EOH_RETAIL": ["EOH_RETAIL", "EOH RETAIL", "SUM OF EOH_RETAIL"],
  "BOY_UNIT": ["BOY_UNIT", "BOY UNIT", "SUM OF BOY_UNIT"],
  "BOY_RETAIL": ["BOY_RETAIL", "BOY RETAIL", "SUM OF BOY_RETAIL"],
  "COLOR": ["COLOR", "WARNA"],
  "SIZE": ["SIZE", "UKURAN"],
  "LAST_PURCHASE_DATE": ["LAST_PURCHASE_DATE", "LAST PURCHASE DATE", "TGL BELI"],
  "BOM_UNIT": ["BOM UNIT", "BOM_UNIT", "SUM OF BOY_UNIT", "SUM OF BOY_RE_BOM UNIT"],
  "DAY_SALES_UNIT": ["DAY SALES UNIT", "DAY_SALES_UNIT"],
  "DAY_SALES_RETAIL": ["DAY SALES RETAIL", "DAY_SALES_RETAIL"]
};

function normalizeKeys(row) {
  const out = {};
  for (const key of Object.keys(row)) out[key.trim().toUpperCase()] = row[key];
  return out;
}
function remapKeys(row) {
  const out = { ...row };
  for (const [standard, aliases] of Object.entries(COL_ALIASES)) {
    if (standard in out) continue;
    for (const alias of aliases) {
      if (alias in out) { out[standard] = out[alias]; break; }
    }
  }
  return out;
}
function parseExcelDate(value) { return String(value); }
function safeFloat(val) {
  if (val === null || val === undefined || val === "") return 0;
  const n = parseFloat(String(val).replace(/[^0-9.-]/g, ""));
  return isNaN(n) ? 0 : n;
}

function parseRow(row) {
  const sku = String(row["SKU"] ?? "").trim();
  const article = row["ARTICLE"] !== undefined ? (String(row["ARTICLE"]).trim() || null) : undefined;
  const description = row["DESCRIPTION"] !== undefined ? String(row["DESCRIPTION"]).trim() : undefined;
  const acara = row["ACARA"] !== undefined ? (String(row["ACARA"]).trim() || null) : undefined;
  const fromDate = row["FROM DATE"] !== undefined ? parseExcelDate(row["FROM DATE"]) : undefined;
  const toDate = row["TO DATE"] !== undefined ? parseExcelDate(row["TO DATE"]) : undefined;
  let hargaNormal = row["HARGA NORMAL"] !== undefined ? safeFloat(row["HARGA NORMAL"]) : undefined;
  
  if (hargaNormal === undefined || hargaNormal === 0) {
    const eohUnit = safeFloat(row["EOH_UNIT"]);
    const eohRetail = safeFloat(row["EOH_RETAIL"]);
    const ytdUnit = safeFloat(row["YTD_SALES_UNIT"]);
    const ytdRetail = safeFloat(row["YTD_SALES_RETAIL"]);
    const boyUnit = safeFloat(row["BOY_UNIT"]);
    const boyRetail = safeFloat(row["BOY_RETAIL"]);
    let basePrice = 0;
    if (eohUnit > 0) basePrice = eohRetail / eohUnit;
    else if (ytdUnit > 0) basePrice = ytdRetail / ytdUnit;
    else if (boyUnit > 0) basePrice = boyRetail / boyUnit;
    if (basePrice > 0) hargaNormal = Math.round(basePrice);
  }
  
  const rawPromo = row["HARGA PROMO"];
  let hargaPromo = undefined;
  if (rawPromo !== undefined) {
    const rawPromoStr = typeof rawPromo === "string" ? rawPromo.toUpperCase() : "";
    const isTextPromo = rawPromoStr.includes("NORMAL") || rawPromoStr.match(/B\dG\d/) || rawPromoStr.includes("BXGY") || rawPromoStr === "";
    const hargaPromoRaw = isTextPromo ? null : safeFloat(rawPromo);
    hargaPromo = hargaPromoRaw && hargaPromoRaw > 0 ? hargaPromoRaw : null;
  }
  const diskon = row["DISKON"] !== undefined ? (String(row["DISKON"]).trim() || null) : undefined;
  const discountType = row["DISCOUNT TYPE"] !== undefined ? (String(row["DISCOUNT TYPE"]).trim() || null) : undefined;
  const brand = row["BRAND"] !== undefined ? (String(row["BRAND"]).trim() || null) : undefined;
  const dept = row["DEPT"] !== undefined ? (String(row["DEPT"]).trim() || null) : undefined;
  const stok = row["STOK"] !== undefined && row["STOK"] !== "" ? parseInt(row["STOK"]) || 0 : undefined;
  const sales_mtd = row["SALES_MTD"] !== undefined && row["SALES_MTD"] !== "" ? parseInt(row["SALES_MTD"]) || 0 : undefined;
  const sales_mtd_retail = row["MTD_SALES_RETAIL"] !== undefined ? safeFloat(row["MTD_SALES_RETAIL"]) : undefined;
  const sales_ytd = row["YTD_SALES_UNIT"] !== undefined ? parseInt(row["YTD_SALES_UNIT"]) || 0 : undefined;
  const sales_ytd_retail = row["YTD_SALES_RETAIL"] !== undefined ? safeFloat(row["YTD_SALES_RETAIL"]) : undefined;
  const eoh_retail = row["EOH_RETAIL"] !== undefined ? safeFloat(row["EOH_RETAIL"]) : undefined;
  
  const color = row["COLOR"] !== undefined ? (String(row["COLOR"]).trim() || null) : undefined;
  const size = row["SIZE"] !== undefined ? (String(row["SIZE"]).trim() || null) : undefined;
  const lastPurchaseDate = row["LAST_PURCHASE_DATE"] !== undefined ? (String(row["LAST_PURCHASE_DATE"]).trim() || null) : undefined;
  const bom_unit = row["BOM_UNIT"] !== undefined && row["BOM_UNIT"] !== "" ? parseInt(row["BOM_UNIT"]) || 0 : undefined;
  const day_sales_unit = row["DAY_SALES_UNIT"] !== undefined && row["DAY_SALES_UNIT"] !== "" ? parseInt(row["DAY_SALES_UNIT"]) || 0 : undefined;
  const day_sales_retail = row["DAY_SALES_RETAIL"] !== undefined ? safeFloat(row["DAY_SALES_RETAIL"]) : undefined;

  return {
    sku, article, description, acara, fromDate, toDate, hargaNormal, hargaPromo, diskon, discountType, brand, dept,
    stok, sales_mtd, sales_mtd_retail, sales_ytd, sales_ytd_retail, eoh_retail,
    color, size, lastPurchaseDate, bom_unit, day_sales_unit, day_sales_retail
  };
}

async function main() {
  const filePath = "D:\\Website\\SUKO\\PQ\\POWER QUERY 28 SEPTEMBER 2026.csv";
  const ws = xlsx.readFile(filePath).Sheets[xlsx.readFile(filePath).SheetNames[0]];
  const rawData = xlsx.utils.sheet_to_json(ws, { header: 1, defval: "" });
  
  let headerRowIndex = 0;
  for (let i = 0; i < 20; i++) {
    if (rawData[i].some(c => String(c).trim().toUpperCase().includes("SKU"))) {
      headerRowIndex = i; break;
    }
  }
  const headers = rawData[headerRowIndex].map(h => String(h).trim());
  const rawRows = [];
  for (let i = headerRowIndex + 1; i < rawData.length; i++) {
    const rowArr = rawData[i];
    if (rowArr.length === 0 || (rowArr.length === 1 && !rowArr[0])) continue;
    const rowObj = {};
    for (let j = 0; j < headers.length; j++) rowObj[headers[j]] = rowArr[j] !== undefined ? rowArr[j] : "";
    rawRows.push(rowObj);
  }
  
  const rows = rawRows.map(r => remapKeys(normalizeKeys(r)));
  
  const productMap = new Map();
  for (const row of rows) {
    const sku = String(row["SKU"] ?? "").trim();
    if (!sku) continue;
    productMap.set(sku, parseRow(row));
  }
  
  const allItems = Array.from(productMap.values());
  const itemsToCreate = [];
  for (const item of allItems) {
    itemsToCreate.push({
      ...item,
      description: item.description ?? "-",
      hargaNormal: item.hargaNormal ?? 0,
      stok: item.stok ?? 0,
      sales_mtd: item.sales_mtd ?? 0,
      sales_mtd_retail: item.sales_mtd_retail ?? 0,
      sales_ytd: item.sales_ytd ?? 0,
      sales_ytd_retail: item.sales_ytd_retail ?? 0,
      eoh_retail: item.eoh_retail ?? 0,
      color: item.color ?? null,
      size: item.size ?? null,
      lastPurchaseDate: item.lastPurchaseDate ?? null,
      bom_unit: item.bom_unit ?? 0,
      day_sales_unit: item.day_sales_unit ?? 0,
      day_sales_retail: item.day_sales_retail ?? 0,
    });
  }
  
  console.log("Attempting to create", itemsToCreate.length, "items...");
  try {
    const res = await prisma.product.createMany({
      data: itemsToCreate,
      skipDuplicates: true
    });
    console.log("Success! created", res.count);
  } catch (err) {
    console.error("Bulk create error:", err.message);
  }
}
main().finally(() => process.exit(0));
