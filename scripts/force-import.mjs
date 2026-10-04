import { PrismaClient } from "@prisma/client";
import xlsx from "xlsx";
import fs from "fs";
import path from "path";
import { createRequire } from "module";

process.loadEnvFile("c:/Max Display/price-checker/.env");

const prisma = new PrismaClient();
const BLOB_DIR = "C:/Users/LUCKMEN/.gemini/antigravity-ide/brain/1453a1a0-5638-4a14-8bcf-608ce30bc7fb/scratch/blobs";

// Helpers
function safeFloat(val) {
  if (val === null || val === undefined || val === "") return 0;
  const n = parseFloat(String(val).replace(/[^0-9.-]/g, ""));
  return isNaN(n) ? 0 : n;
}

function parseExcelDate(value) {
  if (!value && value !== 0) return null;
  if (typeof value === "number") {
    try {
      const parsed = xlsx.SSF.parse_date_code(value);
      if (!parsed) return String(value);
      return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
    } catch {
      return String(value);
    }
  }
  const str = String(value).trim();
  return str || null;
}

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
  "BOM_UNIT": ["BOM UNIT", "BOM_UNIT", "SUM OF BOY_UNIT", "SUM OF BOY_RE_BOM UNIT"],
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

function parseRow(row) {
  const sku = String(row["SKU"] ?? "").trim();
  const article = row["ARTICLE"] !== undefined ? (String(row["ARTICLE"]).trim() || null) : undefined;
  const description = row["DESCRIPTION"] !== undefined ? String(row["DESCRIPTION"]).trim() : undefined;
  const acara = row["ACARA"] !== undefined ? (String(row["ACARA"]).trim() || null) : undefined;
  const fromDate = row["FROM DATE"] !== undefined ? parseExcelDate(row["FROM DATE"]) : undefined;
  const toDate = row["TO DATE"] !== undefined ? parseExcelDate(row["TO DATE"]) : undefined;
  
  let hargaNormal = row["HARGA NORMAL"] !== undefined ? safeFloat(row["HARGA NORMAL"]) : undefined;
  
  const stok = row["STOK"] !== undefined && row["STOK"] !== "" ? parseInt(row["STOK"]) || 0 : undefined;
  const sales_mtd = row["SALES_MTD"] !== undefined && row["SALES_MTD"] !== "" ? parseInt(row["SALES_MTD"]) || 0 : undefined;
  const sales_mtd_retail = row["MTD_SALES_RETAIL"] !== undefined ? safeFloat(row["MTD_SALES_RETAIL"]) : undefined;
  const sales_wtd = row["WTD_SALES_UNIT"] !== undefined ? parseInt(row["WTD_SALES_UNIT"]) || 0 : undefined;
  const sales_wtd_retail = row["WTD_SALES_RETAIL"] !== undefined ? safeFloat(row["WTD_SALES_RETAIL"]) : undefined;
  const sales_ytd = row["YTD_SALES_UNIT"] !== undefined ? parseInt(row["YTD_SALES_UNIT"]) || 0 : undefined;
  const sales_ytd_retail = row["YTD_SALES_RETAIL"] !== undefined ? safeFloat(row["YTD_SALES_RETAIL"]) : undefined;
  const eoh_retail = row["EOH_RETAIL"] !== undefined ? safeFloat(row["EOH_RETAIL"]) : undefined;
  const boy_unit = row["BOY_UNIT"] !== undefined && row["BOY_UNIT"] !== "" ? parseInt(row["BOY_UNIT"]) || 0 : undefined;
  const boy_retail = row["BOY_RETAIL"] !== undefined ? safeFloat(row["BOY_RETAIL"]) : undefined;
  const bom_unit = row["BOM_UNIT"] !== undefined && row["BOM_UNIT"] !== "" ? parseInt(row["BOM_UNIT"]) || 0 : undefined;
  const day_sales_unit = row["DAY_SALES_UNIT"] !== undefined && row["DAY_SALES_UNIT"] !== "" ? parseInt(row["DAY_SALES_UNIT"]) || 0 : undefined;
  const day_sales_retail = row["DAY_SALES_RETAIL"] !== undefined ? safeFloat(row["DAY_SALES_RETAIL"]) : undefined;

  // Smart Price Extraction 
  if ((hargaNormal === undefined || hargaNormal === 0) && eoh_retail !== undefined) {
    const eohUnit = stok || 0;
    const boyUnit = boy_unit || 0;

    let basePrice = 0;
    if (eohUnit > 0 && eoh_retail > 0) basePrice = eoh_retail / eohUnit;
    else if (boyUnit > 0 && boy_retail > 0) basePrice = boy_retail / boyUnit;

    if (basePrice > 0) hargaNormal = Math.round(basePrice);
  }

  const rawPromo = row["HARGA PROMO"];
  let hargaPromo = undefined;
  if (rawPromo !== undefined) {
    if (typeof rawPromo === "number") {
      hargaPromo = rawPromo > 0 ? rawPromo : null;
    } else {
      const rawPromoStr = String(rawPromo).toUpperCase().trim();
      const isTextPromo = rawPromoStr.includes("NORMAL") || rawPromoStr.match(/B\dG\d/) || rawPromoStr.includes("BXGY") || rawPromoStr === "";
      const hargaPromoRaw = isTextPromo ? null : safeFloat(rawPromo);
      hargaPromo = hargaPromoRaw && hargaPromoRaw > 0 ? hargaPromoRaw : null;
    }
  }

  const diskon       = row["DISKON"]         !== undefined ? (String(row["DISKON"]).trim()        || null) : undefined;
  const discountType = row["DISCOUNT TYPE"]  !== undefined ? (String(row["DISCOUNT TYPE"]).trim() || null) : undefined;
  const brand        = row["BRAND"]          !== undefined ? (String(row["BRAND"]).trim()         || null) : undefined;
  const dept         = row["DEPT"]           !== undefined ? (String(row["DEPT"]).trim()          || null) : undefined;

  const sourceFile  = row["__SOURCE_FILE__"]  !== undefined ? String(row["__SOURCE_FILE__"])  : undefined;
  const sourceSheet = row["__SOURCE_SHEET__"] !== undefined ? String(row["__SOURCE_SHEET__"]) : undefined;

  return {
    sku, article, description, acara, fromDate, toDate,
    hargaNormal, hargaPromo, diskon, discountType, brand, dept,
    stok, eoh_retail,
    sales_mtd, sales_mtd_retail,
    sales_wtd, sales_wtd_retail,
    sales_ytd, sales_ytd_retail,
    boy_unit, boy_retail,
    bom_unit, day_sales_unit, day_sales_retail,
    sourceFile, sourceSheet,
  };
}

function processWorkbook(buffer, fileName) {
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

    const rows = rawRows.map(r => {
      const normalized = remapKeys(normalizeKeys(r));
      if (fileName) normalized["__SOURCE_FILE__"] = fileName;
      normalized["__SOURCE_SHEET__"] = sheetName;
      return normalized;
    });

    const firstRow = rows[0];
    if (!sheetHasRequiredCols(firstRow)) continue;

    for (const row of rows) {
      const sku = String(row["SKU"] ?? "").trim();
      if (!sku) continue;

      const parsed = parseRow(row);
      const existing = productMap.get(sku);

      if (!existing) {
        productMap.set(sku, parsed);
      } else {
        const existingIsPromo = (existing.hargaPromo !== null && existing.hargaPromo !== undefined && existing.hargaPromo > 0) || 
                                (existing.diskon !== null && existing.diskon !== undefined);
        const newIsPromo = (parsed.hargaPromo !== null && parsed.hargaPromo !== undefined && parsed.hargaPromo > 0) || 
                           (parsed.diskon !== null && parsed.diskon !== undefined);

        if (!existingIsPromo && newIsPromo) {
          productMap.set(sku, parsed);
        }
      }
    }
  }

  return productMap;
}

async function upsertProducts(productMap, uploadType, fileName) {
  let created = 0;
  let updated = 0;
  
  const allItems = Array.from(productMap.values());
  const allSkus = allItems.map((item) => item.sku);

  const existingProducts = await prisma.product.findMany({
    where: { sku: { in: allSkus } },
    select: { 
      id: true, sku: true, stok: true,
      sales_mtd: true, sales_mtd_retail: true,
      hargaNormal: true,
      hargaPromo: true, diskon: true, discountType: true, acara: true, fromDate: true, toDate: true
    },
  });
  const existingProductMap = new Map(existingProducts.map((p) => [p.sku, p]));

  const itemsToCreate = [];
  const itemsToUpdate = [];

  for (const item of allItems) {
    if (existingProductMap.has(item.sku)) {
      itemsToUpdate.push(item);
    } else {
      const isPromo = item.hargaPromo !== undefined || item.diskon !== undefined || item.discountType !== undefined || item.acara !== undefined;
      const explicitFileName = item.sourceFile && item.sourceSheet ? `${item.sourceFile} [Sheet: ${item.sourceSheet}]` : fileName;
      
      itemsToCreate.push({
        sku:               item.sku,
        article:           item.article            || null,
        brand:             item.brand              || null,
        dept:              item.dept               || null,
        description:       item.description        ?? "-",
        hargaNormal:       item.hargaNormal        ?? 0,
        stok:              item.stok               ?? 0,
        eoh_retail:        item.eoh_retail         ?? 0,
        sales_mtd:         item.sales_mtd          ?? 0,
        sales_mtd_retail:  item.sales_mtd_retail   ?? 0,
        sales_wtd:         item.sales_wtd          ?? 0,
        sales_wtd_retail:  item.sales_wtd_retail   ?? 0,
        sales_ytd:         item.sales_ytd          ?? 0,
        sales_ytd_retail:  item.sales_ytd_retail   ?? 0,
        boy_unit:          item.boy_unit           ?? 0,
        boy_retail:        item.boy_retail         ?? 0,
        bom_unit:          item.bom_unit           ?? 0,
        day_sales_unit:    item.day_sales_unit     ?? 0,
        day_sales_retail:  item.day_sales_retail   ?? 0,
        hargaPromo:        item.hargaPromo         ?? null,
        diskon:            item.diskon             ?? null,
        discountType:      item.discountType       ?? null,
        acara:             item.acara              ?? null,
        fromDate:          item.fromDate           ?? null,
        toDate:            item.toDate             ?? null,
        promoFileName:     isPromo && explicitFileName ? explicitFileName : null,
      });
    }
  }

  if (itemsToCreate.length > 0) {
    try {
      const result = await prisma.product.createMany({
        data: itemsToCreate,
        skipDuplicates: true,
      });
      created = result.count;
    } catch (err) {
      console.error("Bulk create error", err);
    }
  }

  if (itemsToUpdate.length > 0) {
    const chunkSize = 1000;
    
    for (let i = 0; i < itemsToUpdate.length; i += chunkSize) {
      const chunk = itemsToUpdate.slice(i, i + chunkSize);
      
      const values = [];
      const rowPlaceholders = [];
      let paramIndex = 1;

      for (const item of chunk) {
        const existingInfo = existingProductMap.get(item.sku);
        if (!existingInfo) continue;

        let finalPromoToSave = existingInfo.hargaPromo;
        let finalDiskonToSave = existingInfo.diskon;
        let finalDiscountTypeToSave = existingInfo.discountType;
        let finalAcaraToSave = existingInfo.acara;
        let finalFromDateToSave = existingInfo.fromDate;
        let finalToDateToSave = existingInfo.toDate;
        let finalPromoFileNameToSave = existingInfo.promoFileName;

        const explicitFileName = item.sourceFile && item.sourceSheet ? `${item.sourceFile} [Sheet: ${item.sourceSheet}]` : fileName;

        if (uploadType === "UPDATE_PROMO") {
          let extractedPromo = item.hargaPromo;
          if (extractedPromo === undefined && item.hargaNormal !== undefined) {
            extractedPromo = item.hargaNormal;
          }

          const newHargaPromo   = extractedPromo    !== undefined ? extractedPromo    : existingInfo.hargaPromo;
          const newDiskon       = item.diskon       !== undefined ? item.diskon       : existingInfo.diskon;
          const newDiscountType = item.discountType !== undefined ? item.discountType : existingInfo.discountType;
          const newAcara        = item.acara        !== undefined ? item.acara        : existingInfo.acara;
          const newFromDate     = item.fromDate     !== undefined ? item.fromDate     : existingInfo.fromDate;
          const newToDate       = item.toDate       !== undefined ? item.toDate       : existingInfo.toDate;

          const isPromoActive = (newHargaPromo !== null && newHargaPromo > 0) ||
                                (newDiskon !== null && newDiskon !== undefined) ||
                                (newDiscountType !== null && newDiscountType !== undefined);

          let promoStillValid = false;
          if (isPromoActive) {
            if (newToDate) {
              const toDateObj = new Date(newToDate);
              toDateObj.setHours(23, 59, 59, 999);
              promoStillValid = new Date() <= toDateObj;
            } else {
              promoStillValid = true;
            }
          }

          finalPromoToSave        = promoStillValid ? newHargaPromo   : null;
          finalDiskonToSave       = promoStillValid ? newDiskon       : null;
          finalDiscountTypeToSave = promoStillValid ? newDiscountType : null;
          finalAcaraToSave        = promoStillValid ? newAcara        : null;
          finalFromDateToSave     = promoStillValid ? newFromDate     : null;
          finalToDateToSave       = promoStillValid ? newToDate       : null;
          finalPromoFileNameToSave = explicitFileName;
        }

        rowPlaceholders.push(`($${paramIndex++}::text, $${paramIndex++}::double precision, $${paramIndex++}::text, $${paramIndex++}::text, $${paramIndex++}::text, $${paramIndex++}::text, $${paramIndex++}::int, $${paramIndex++}::double precision, $${paramIndex++}::int, $${paramIndex++}::double precision, $${paramIndex++}::int, $${paramIndex++}::double precision, $${paramIndex++}::int, $${paramIndex++}::double precision, $${paramIndex++}::int, $${paramIndex++}::double precision, $${paramIndex++}::int, $${paramIndex++}::double precision, $${paramIndex++}::text, $${paramIndex++}::text, $${paramIndex++}::text, $${paramIndex++}::text, $${paramIndex++}::text, $${paramIndex++}::text)`);
        
        values.push(
          item.sku,
          item.hargaNormal        !== undefined ? item.hargaNormal        : null,
          item.description        !== undefined ? item.description        : null,
          item.article            !== undefined ? item.article            : null,
          item.brand              !== undefined ? item.brand              : null,
          item.dept               !== undefined ? item.dept               : null,
          item.stok               !== undefined ? item.stok               : null,
          item.eoh_retail         !== undefined ? item.eoh_retail         : null,
          item.sales_mtd          !== undefined ? item.sales_mtd          : null,
          item.sales_mtd_retail   !== undefined ? item.sales_mtd_retail   : null,
          item.sales_wtd          !== undefined ? item.sales_wtd          : null,
          item.sales_wtd_retail   !== undefined ? item.sales_wtd_retail   : null,
          item.sales_ytd          !== undefined ? item.sales_ytd          : null,
          item.sales_ytd_retail   !== undefined ? item.sales_ytd_retail   : null,
          item.boy_unit           !== undefined ? item.boy_unit           : null,
          item.boy_retail         !== undefined ? item.boy_retail         : null,
          item.bom_unit           !== undefined ? item.bom_unit           : null,
          finalPromoToSave,
          finalDiskonToSave,
          finalDiscountTypeToSave,
          finalAcaraToSave,
          finalFromDateToSave,
          finalToDateToSave,
          finalPromoFileNameToSave !== undefined ? finalPromoFileNameToSave : null
        );
      }

      if (rowPlaceholders.length > 0) {
        try {
          const query = `
            UPDATE "Product" as p
            SET 
              "hargaNormal"      = COALESCE(v."hargaNormal",      p."hargaNormal"),
              "description"      = COALESCE(v."description",      p."description"),
              "article"          = COALESCE(v."article",          p."article"),
              "brand"            = COALESCE(v."brand",            p."brand"),
              "dept"             = COALESCE(v."dept",             p."dept"),
              "stok"             = COALESCE(v."stok",             p."stok"),
              "eoh_retail"       = COALESCE(v."eoh_retail",       p."eoh_retail"),
              "sales_mtd"        = COALESCE(v."sales_mtd",        p."sales_mtd"),
              "sales_mtd_retail" = COALESCE(v."sales_mtd_retail", p."sales_mtd_retail"),
              "sales_wtd"        = COALESCE(v."sales_wtd",        p."sales_wtd"),
              "sales_wtd_retail" = COALESCE(v."sales_wtd_retail", p."sales_wtd_retail"),
              "sales_ytd"        = COALESCE(v."sales_ytd",        p."sales_ytd"),
              "sales_ytd_retail" = COALESCE(v."sales_ytd_retail", p."sales_ytd_retail"),
              "boy_unit"         = COALESCE(v."boy_unit",         p."boy_unit"),
              "boy_retail"       = COALESCE(v."boy_retail",       p."boy_retail"),
              "bom_unit"         = COALESCE(v."bom_unit",         p."bom_unit"),
              "hargaPromo"       = v."hargaPromo",
              "diskon"           = v."diskon",
              "discountType"     = v."discountType",
              "acara"            = v."acara",
              "fromDate"         = v."fromDate",
              "toDate"           = v."toDate",
              "promoFileName"    = COALESCE(v."promoFileName",    p."promoFileName"),
              "updatedAt"        = CURRENT_TIMESTAMP
            FROM (VALUES
              ${rowPlaceholders.join(", ")}
            ) AS v("sku", "hargaNormal", "description", "article", "brand", "dept", "stok", "eoh_retail", "sales_mtd", "sales_mtd_retail", "sales_wtd", "sales_wtd_retail", "sales_ytd", "sales_ytd_retail", "boy_unit", "boy_retail", "bom_unit", "hargaPromo", "diskon", "discountType", "acara", "fromDate", "toDate", "promoFileName")
            WHERE p."sku" = v."sku"
          `;

          await prisma.$executeRawUnsafe(query, ...values);
          updated += rowPlaceholders.length;
        } catch (err) {
          console.error("Bulk raw update error", err);
        }
      }
    }
  }

  return { created, updated };
}

async function main() {
  console.log("Starting forced full import...");
  let totalCreated = 0;
  let totalUpdated = 0;

  // Process PQ files
  const pqDir = path.join(BLOB_DIR, "PQ");
  if (fs.existsSync(pqDir)) {
    const files = fs.readdirSync(pqDir);
    for (const f of files) {
      console.log(`Processing PQ file: ${f}`);
      const buf = fs.readFileSync(path.join(pqDir, f));
      const map = processWorkbook(buf, f);
      const res = await upsertProducts(map, "PQ_HARIAN", f);
      totalCreated += res.created;
      totalUpdated += res.updated;
    }
  }

  // Process PROMO files
  const promoDir = path.join(BLOB_DIR, "PROMO");
  if (fs.existsSync(promoDir)) {
    const files = fs.readdirSync(promoDir);
    for (const f of files) {
      console.log(`Processing PROMO file: ${f}`);
      const buf = fs.readFileSync(path.join(promoDir, f));
      const map = processWorkbook(buf, f);
      const res = await upsertProducts(map, "UPDATE_PROMO", f);
      totalCreated += res.created;
      totalUpdated += res.updated;
    }
  }

  console.log("Import Complete!");
  console.log(`Created: ${totalCreated}`);
  console.log(`Updated: ${totalUpdated}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
