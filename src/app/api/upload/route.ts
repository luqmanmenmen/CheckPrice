import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import * as xlsx from "xlsx";
import * as path from "path";
import * as fs from "fs";
import { verifyToken } from "@/lib/auth";

const prisma = new PrismaClient();

export const maxDuration = 60; // Izinkan proses upload hingga 60 detik (Mencegah Vercel 10s Timeout)

// -------------------------------------------------------
// Helper: parse Excel date serial OR string date
// -------------------------------------------------------
function parseExcelDate(value: any): string | null {
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

// -------------------------------------------------------
// Helper: safe float parse
// -------------------------------------------------------
function safeFloat(val: any): number {
  if (val === null || val === undefined || val === "") return 0;
  const n = parseFloat(String(val).replace(/[^0-9.-]/g, ""));
  return isNaN(n) ? 0 : n;
}

// -------------------------------------------------------
// REQUIRED: a sheet must have at least SKU + DESCRIPTION + HARGA NORMAL
// -------------------------------------------------------
// REQUIRED: a sheet must have at least SKU
const REQUIRED_COLS = ["SKU"];

// Mapping fleksibel nama kolom → nama standar kita
// Agar sheet dengan variasi nama kolom tetap terbaca
const COL_ALIASES: Record<string, string[]> = {
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

// Some sheets have column names with leading/trailing spaces like " HARGA NORMAL "
// Normalize a row object so all keys are trimmed
function normalizeKeys(row: any): any {
  const out: any = {};
  for (const key of Object.keys(row)) {
    out[key.trim().toUpperCase()] = row[key];
  }
  return out;
}

// Remap keys from raw normalized row using alias mapping
function remapKeys(row: any): any {
  const out: any = { ...row };
  for (const [standard, aliases] of Object.entries(COL_ALIASES)) {
    if (standard in out) continue; // already has the standard key
    for (const alias of aliases) {
      if (alias in out) {
        out[standard] = out[alias];
        break;
      }
    }
  }
  return out;
}

function sheetHasRequiredCols(remappedRow: any): boolean {
  return REQUIRED_COLS.every((col) => col in remappedRow && remappedRow[col] !== undefined && remappedRow[col] !== "");
}

// -------------------------------------------------------
// Parse a single data row into our Product shape
// -------------------------------------------------------
function parseRow(row: any) {
  const sku = String(row["SKU"] ?? "").trim();
  const article = row["ARTICLE"] !== undefined ? (String(row["ARTICLE"]).trim() || null) : undefined;
  const description = row["DESCRIPTION"] !== undefined ? String(row["DESCRIPTION"]).trim() : undefined;
  const acara = row["ACARA"] !== undefined ? (String(row["ACARA"]).trim() || null) : undefined;
  const fromDate = row["FROM DATE"] !== undefined ? parseExcelDate(row["FROM DATE"]) : undefined;
  const toDate = row["TO DATE"] !== undefined ? parseExcelDate(row["TO DATE"]) : undefined;
  let hargaNormal = row["HARGA NORMAL"] !== undefined ? safeFloat(row["HARGA NORMAL"]) : undefined;
  
  // Smart Price Extraction untuk file Power Query (jika kolom harga tidak ada)
  if (hargaNormal === undefined || hargaNormal === 0) {
    const eohUnit = safeFloat(row["EOH_UNIT"]);
    const eohRetail = safeFloat(row["EOH_RETAIL"]);
    const boyUnit = safeFloat(row["BOY_UNIT"]);
    const boyRetail = safeFloat(row["BOY_RETAIL"]);

    let basePrice = 0;
    if (eohUnit > 0) basePrice = eohRetail / eohUnit;
    else if (boyUnit > 0) basePrice = boyRetail / boyUnit;

    if (basePrice > 0) {
      hargaNormal = Math.round(basePrice);
    }
  }
  
  // Promo detection: use DISCOUNT TYPE as primary signal
  const rawPromo = row["HARGA PROMO"];
  const rawDiscountType = row["DISCOUNT TYPE"] !== undefined ? String(row["DISCOUNT TYPE"]).trim().toUpperCase() : "";
  const rawDiskonVal = row["DISKON"] !== undefined ? String(row["DISKON"]).trim() : "";
  const rawPromoStr = rawPromo !== undefined ? String(rawPromo).trim().toUpperCase() : "";

  let hargaPromo: number | null | undefined = undefined;
  let diskon: string | null | undefined = undefined;
  const discountType = row["DISCOUNT TYPE"] !== undefined ? (String(row["DISCOUNT TYPE"]).trim() || null) : undefined;

  if (rawPromo !== undefined || row["DISCOUNT TYPE"] !== undefined) {
    if (rawDiscountType === "SPECIAL PRICE" || rawDiscountType === "SHARP PRICE") {
      // Harga tajam → save numeric hargaPromo
      const v = safeFloat(rawPromo);
      hargaPromo = v > 0 ? v : null;
      diskon = "SP";
    } else if (rawDiscountType === "BXGY" || rawPromoStr.match(/^B\dG\d/) || rawPromoStr === "B2G1" || rawPromoStr === "B1G1") {
      // Promo tipe BXGY/B2G1/B1G1 → no flat price, tapi tetap promo
      hargaPromo = null;
      diskon = rawPromoStr || rawDiskonVal || "BXGY";
    } else if (rawDiskonVal && rawDiskonVal !== "0" && !isNaN(parseFloat(rawDiskonVal))) {
      // Diskon amount/persen
      hargaPromo = null;
      diskon = rawDiskonVal;
    } else {
      // NORMAL PRICE = no promo
      hargaPromo = null;
      diskon = undefined; // undefined = jangan ubah nilai yang sudah ada di DB
    }
  }
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
    sku,
    article,
    description,
    acara,
    fromDate,
    toDate,
    hargaNormal,
    hargaPromo,
    diskon,
    discountType,
    brand,
    dept,
    stok,
    sales_mtd,
    sales_mtd_retail,
    sales_ytd,
    sales_ytd_retail,
    eoh_retail,
    color,
    size,
    lastPurchaseDate,
    bom_unit,
    day_sales_unit,
    day_sales_retail,
  };
}

// -------------------------------------------------------
// Process one workbook (Buffer) → deduped product map
//   Priority rule: PROMO record wins over NORMAL PRICE for same SKU
// -------------------------------------------------------
function processWorkbook(
  buffer: Buffer, 
  productMap: Map<string, ReturnType<typeof parseRow>> = new Map()
): {
  productMap: Map<string, ReturnType<typeof parseRow>>;
  sheetLog: string[];
} {
  const workbook = xlsx.read(buffer, { type: "buffer", cellDates: false });
  const sheetLog: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const ws = workbook.Sheets[sheetName];
    
    // Dynamic Header Detection (untuk membaca file PQ berformat Pivot)
    const rawData = xlsx.utils.sheet_to_json(ws, { header: 1, defval: "" }) as any[][];

    if (rawData.length === 0) {
      sheetLog.push(`[EMPTY] ${sheetName}`);
      continue;
    }

    let headerRowIndex = 0;
    const skuAliases = ["SKU", "KODE", "KODE PRODUK", "PRODUCT CODE", "CODE", "ID"];
    for (let i = 0; i < Math.min(20, rawData.length); i++) {
      const rowArr = rawData[i].map(c => String(c).trim().toUpperCase());
      if (rowArr.some(cell => skuAliases.includes(cell))) {
        headerRowIndex = i;
        break;
      }
    }

    const headers = rawData[headerRowIndex].map(h => String(h).trim());
    const rawRows = [];
    for (let i = headerRowIndex + 1; i < rawData.length; i++) {
      const rowArr = rawData[i];
      if (rowArr.length === 0 || (rowArr.length === 1 && !rowArr[0])) continue;
      
      const rowObj: any = {};
      let hasData = false;
      for (let j = 0; j < headers.length; j++) {
        if (headers[j]) {
          rowObj[headers[j]] = rowArr[j] !== undefined ? rowArr[j] : "";
          if (rowArr[j] !== "" && rowArr[j] !== undefined) hasData = true;
        }
      }
      if (hasData) rawRows.push(rowObj);
    }

    if (rawRows.length === 0) {
      sheetLog.push(`[EMPTY] ${sheetName} (No data rows)`);
      continue;
    }

    // Normalize ALL rows to trim whitespace from column names, then remap aliases
    const rows = rawRows.map(r => remapKeys(normalizeKeys(r)));

    const firstRow = rows[0];
    if (!sheetHasRequiredCols(firstRow)) {
      const foundKeys = Object.keys(firstRow).slice(0, 8).join(", ");
      sheetLog.push(`[SKIP] ${sheetName} — header tidak sesuai (found: ${foundKeys})`);
      continue;
    }

    let added = 0;
    let updated = 0;

    for (const row of rows) {
      const sku = String(row["SKU"] ?? "").trim();
      if (!sku) continue;

      const parsed = parseRow(row);
      const existing = productMap.get(sku);

      if (!existing) {
        // New SKU → add
        productMap.set(sku, parsed);
        added++;
      } else {
        // Duplicate SKU in different sheet of same file
        // Rule: Promo active wins over Normal Price
        const existingIsPromo = (existing.hargaPromo !== null && existing.hargaPromo !== undefined && existing.hargaPromo > 0) || 
                                (existing.diskon !== null && existing.diskon !== undefined);
        const newIsPromo = (parsed.hargaPromo !== null && parsed.hargaPromo !== undefined && parsed.hargaPromo > 0) || 
                           (parsed.diskon !== null && parsed.diskon !== undefined);

        if (!existingIsPromo && newIsPromo) {
          // Replace: new has promo, old doesn't
          productMap.set(sku, parsed);
          updated++;
        }
        // else: keep existing
      }
    }

    sheetLog.push(`[OK] ${sheetName} — ${added} new, ${updated} updated`);
  }

  return { productMap, sheetLog };
}

// -------------------------------------------------------
// Upsert a map of products to DB
//   - SKU baru    → tambah semua data (create)
//   - SKU lama    → hanya update harga & info promo (update)
// -------------------------------------------------------
async function upsertProducts(
  productMap: Map<string, ReturnType<typeof parseRow>>,
  uploadDate: Date = new Date()
): Promise<{ created: number; updated: number; failed: number }> {
  let created = 0;
  let updated = 0;
  let failed = 0;

  const allItems = Array.from(productMap.values());
  const allSkus = allItems.map((item) => item.sku);

  // 1. Ambil semua SKU yang sudah ada di database (Batch Query)
  const existingProducts = await prisma.product.findMany({
    where: { sku: { in: allSkus } },
    select: { 
      id: true, sku: true, stok: true,
      hargaPromo: true, diskon: true, discountType: true, acara: true, fromDate: true, toDate: true,
      sales_mtd: true, sales_mtd_retail: true
    },
  });
  const existingProductMap = new Map(existingProducts.map((p) => [p.sku, p]));

  const itemsToCreate = [];
  const itemsToUpdate = [];
  const dailySalesData: any[] = []; // Global array for all DailySales to insert

  for (const item of allItems) {
    if (existingProductMap.has(item.sku)) {
      itemsToUpdate.push(item);
    } else {
      // New SKU → add with default fallback for missing required fields
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
  }

  // 2. Insert produk baru sekaligus (Bulk Insert)
  if (itemsToCreate.length > 0) {
    try {
      // Chunking if array is too large, but 8000 is usually fine for createMany
      const result = await prisma.product.createMany({
        data: itemsToCreate,
        skipDuplicates: true,
      });
      created = result.count;

      // Ambil ID produk yang baru dibuat untuk DailySales
      const skusToFetch = itemsToCreate.filter(i => (i.day_sales_unit || i.sales_mtd || 0) > 0).map(i => i.sku);
      if (skusToFetch.length > 0) {
        const newProducts = await prisma.product.findMany({
          where: { sku: { in: skusToFetch } },
          select: { id: true, sku: true }
        });
        const newSkuToId = new Map(newProducts.map(p => [p.sku, p.id]));
        
        for (const item of itemsToCreate) {
          const dsUnit = item.day_sales_unit || item.sales_mtd || 0;
          if (dsUnit > 0) {
            const pid = newSkuToId.get(item.sku);
            if (pid) {
              dailySalesData.push({
                productId: pid,
                date: uploadDate,
                qtySold: dsUnit,
                omzet: item.day_sales_retail || 0
              });
            }
          }
        }
      }
    } catch (err) {
      console.error("Bulk create error", err);
      failed += itemsToCreate.length;
    }
  }

  // 3. Update produk lama (FAST Bulk Update Raw SQL)
  if (itemsToUpdate.length > 0) {
    const chunkSize = 1000; // Proses 1000 data sekaligus dalam 1 detik
    
    for (let i = 0; i < itemsToUpdate.length; i += chunkSize) {
      const chunk = itemsToUpdate.slice(i, i + chunkSize);
      
      const values: any[] = [];
      const rowPlaceholders: string[] = [];
      let paramIndex = 1;

      for (const item of chunk) {
        const existingInfo = existingProductMap.get(item.sku);
        if (!existingInfo) continue;

        // LOGIKA DELTA EOH & MTD
        const oldStok = existingInfo.stok || 0;
        let salesDelta = item.day_sales_unit || 0; // Prioritaskan kolom day_sales_unit jika ada
        
        if (salesDelta === 0 && item.sales_mtd !== undefined && existingInfo.sales_mtd !== undefined) {
          const mtdDeltaCalc = item.sales_mtd - existingInfo.sales_mtd;
          if (mtdDeltaCalc > 0) salesDelta = mtdDeltaCalc; // Fallback ke selisih MTD
        }
        
        if (salesDelta === 0 && item.stok !== undefined && oldStok > 0 && item.stok < oldStok) {
          salesDelta = oldStok - item.stok; // Fallback terakhir ke selisih stok
        }

        // Cek promo
        let finalPromoToSave;
        let finalDiskonToSave;
        let finalDiscountTypeToSave;
        let finalAcaraToSave;
        let finalFromDateToSave;
        let finalToDateToSave;

        // Smart File Recognition: Determine if THIS ROW contains ANY promo-related data updates
        const isPromoFile = item.hargaPromo !== undefined || 
                            item.diskon !== undefined || 
                            item.discountType !== undefined || 
                            item.acara !== undefined;

        if (!isPromoFile) {
          // File Excel murni PQ Harian (tanpa kolom promo) -> Proteksi promo yang ada!
          finalPromoToSave = existingInfo.hargaPromo;
          finalDiskonToSave = existingInfo.diskon;
          finalDiscountTypeToSave = existingInfo.discountType;
          finalAcaraToSave = existingInfo.acara;
          finalFromDateToSave = existingInfo.fromDate;
          finalToDateToSave = existingInfo.toDate;
        } else {
          // File Excel memiliki kolom promo -> Terapkan COALESCE dan Layered Validity
          
          // Jika kolom ada tapi isinya kosong (""), parser mengembalikan null (Niat Menghapus).
          // Jika kolom hilang dari header, parser mengembalikan undefined (Niat Mengabaikan / Mempertahankan).
          const newHargaPromo = item.hargaPromo !== undefined ? item.hargaPromo : existingInfo.hargaPromo;
          const newDiskon = item.diskon !== undefined ? item.diskon : existingInfo.diskon;
          const newDiscountType = item.discountType !== undefined ? item.discountType : existingInfo.discountType;
          const newAcara = item.acara !== undefined ? item.acara : existingInfo.acara;
          const newFromDate = item.fromDate !== undefined ? item.fromDate : existingInfo.fromDate;
          const newToDate = item.toDate !== undefined ? item.toDate : existingInfo.toDate;

          // Validity Check: Apakah benar-benar ada promo aktif secara logis?
          const isPromoActive = (newHargaPromo !== null && newHargaPromo > 0) || 
                                (newDiskon !== null) || 
                                (newDiscountType !== null);

          let promoStillValid = false;
          if (isPromoActive) {
            if (newToDate) {
              const toDateObj = new Date(newToDate);
              toDateObj.setHours(23, 59, 59, 999);
              promoStillValid = new Date() <= toDateObj;
            } else {
              promoStillValid = true; // Tidak ada tanggal akhir = Berlaku selamanya
            }
          }

          finalPromoToSave = promoStillValid ? newHargaPromo : null;
          finalDiskonToSave = promoStillValid ? newDiskon : null;
          finalDiscountTypeToSave = promoStillValid ? newDiscountType : null;
          finalAcaraToSave = promoStillValid ? newAcara : null;
          finalFromDateToSave = promoStillValid ? newFromDate : null;
          finalToDateToSave = promoStillValid ? newToDate : null;
        }

        rowPlaceholders.push(`($${paramIndex++}::text, $${paramIndex++}::double precision, $${paramIndex++}::text, $${paramIndex++}::text, $${paramIndex++}::text, $${paramIndex++}::text, $${paramIndex++}::text, $${paramIndex++}::text, $${paramIndex++}::text, $${paramIndex++}::int, $${paramIndex++}::int, $${paramIndex++}::int, $${paramIndex++}::double precision, $${paramIndex++}::int, $${paramIndex++}::double precision, $${paramIndex++}::double precision, $${paramIndex++}::double precision, $${paramIndex++}::text, $${paramIndex++}::text, $${paramIndex++}::text, $${paramIndex++}::text, $${paramIndex++}::text, $${paramIndex++}::int, $${paramIndex++}::int, $${paramIndex++}::double precision)`);
        
        values.push(
          item.sku,
          item.hargaNormal !== undefined ? item.hargaNormal : null,
          item.description !== undefined ? item.description : null,
          item.article !== undefined ? item.article : null,
          item.brand !== undefined ? item.brand : null,
          item.dept !== undefined ? item.dept : null,
          item.color !== undefined ? item.color : null,
          item.size !== undefined ? item.size : null,
          item.lastPurchaseDate !== undefined ? item.lastPurchaseDate : null,
          item.stok !== undefined ? item.stok : null,
          salesDelta,
          item.sales_mtd !== undefined ? item.sales_mtd : null,
          item.sales_mtd_retail !== undefined ? item.sales_mtd_retail : null,
          item.sales_ytd !== undefined ? item.sales_ytd : null,
          item.sales_ytd_retail !== undefined ? item.sales_ytd_retail : null,
          item.eoh_retail !== undefined ? item.eoh_retail : null,
          finalPromoToSave,
          finalDiskonToSave,
          finalDiscountTypeToSave,
          finalAcaraToSave,
          finalFromDateToSave,
          finalToDateToSave,
          item.bom_unit !== undefined ? item.bom_unit : null,
          item.day_sales_unit !== undefined ? item.day_sales_unit : null,
          item.day_sales_retail !== undefined ? item.day_sales_retail : null
        );

        if (salesDelta > 0) {
          // Hitung delta retail jika tidak ada day_sales_retail
          let omzetDelta = item.day_sales_retail || 0;
          if (omzetDelta === 0 && item.sales_mtd_retail !== undefined && existingInfo.sales_mtd_retail !== undefined) {
            const retailDeltaCalc = item.sales_mtd_retail - existingInfo.sales_mtd_retail;
            if (retailDeltaCalc > 0) omzetDelta = retailDeltaCalc;
          }

          dailySalesData.push({
            productId: existingInfo.id,
            date: uploadDate,
            qtySold: salesDelta,
            omzet: omzetDelta
          });
        }
      }

      if (rowPlaceholders.length > 0) {
        try {
          const query = `
            UPDATE "Product" as p
            SET 
              "hargaNormal" = COALESCE(v."hargaNormal", p."hargaNormal"),
              "description" = COALESCE(v."description", p."description"),
              "article" = COALESCE(v."article", p."article"),
              "brand" = COALESCE(v."brand", p."brand"),
              "dept" = COALESCE(v."dept", p."dept"),
              "color" = COALESCE(v."color", p."color"),
              "size" = COALESCE(v."size", p."size"),
              "lastPurchaseDate" = COALESCE(v."lastPurchaseDate", p."lastPurchaseDate"),
              "stok" = COALESCE(v."stok", p."stok"),
              "sales_mtd" = COALESCE(v."sales_mtd", p."sales_mtd" + v."salesDelta"),
              "sales_mtd_retail" = COALESCE(v."sales_mtd_retail", p."sales_mtd_retail"),
              "sales_ytd" = COALESCE(v."sales_ytd", p."sales_ytd"),
              "sales_ytd_retail" = COALESCE(v."sales_ytd_retail", p."sales_ytd_retail"),
              "eoh_retail" = COALESCE(v."eoh_retail", p."eoh_retail"),
              "bom_unit" = COALESCE(v."bom_unit", p."bom_unit"),
              "day_sales_unit" = COALESCE(v."day_sales_unit", p."day_sales_unit"),
              "day_sales_retail" = COALESCE(v."day_sales_retail", p."day_sales_retail"),
              "hargaPromo" = v."hargaPromo",
              "diskon" = v."diskon",
              "discountType" = v."discountType",
              "acara" = v."acara",
              "fromDate" = v."fromDate",
              "toDate" = v."toDate",
              "updatedAt" = CURRENT_TIMESTAMP
            FROM (VALUES
              ${rowPlaceholders.join(", ")}
            ) AS v("sku", "hargaNormal", "description", "article", "brand", "dept", "color", "size", "lastPurchaseDate", "stok", "salesDelta", "sales_mtd", "sales_mtd_retail", "sales_ytd", "sales_ytd_retail", "eoh_retail", "hargaPromo", "diskon", "discountType", "acara", "fromDate", "toDate", "bom_unit", "day_sales_unit", "day_sales_retail")
            WHERE p."sku" = v."sku"
          `;

          await prisma.$executeRawUnsafe(query, ...values);
          updated += rowPlaceholders.length;
        } catch (err) {
          console.error("Bulk raw update error", err);
          failed += rowPlaceholders.length;
        }
      }
    }
  }

  // 4. Insert ALL DailySales data
  if (dailySalesData.length > 0) {
    try {
      await prisma.dailySales.createMany({
        data: dailySalesData,
        skipDuplicates: true
      });
    } catch (err) {
      console.error("Bulk create DailySales error", err);
    }
  }

  return { created, updated, failed };
}

// -------------------------------------------------------
// POST: upload one or more Excel files via form
// -------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    const session = token ? await verifyToken(token) : null;
    const userId = session?.userId;

    const formData = await request.formData();
    const files = formData.getAll("file") as File[];

    const uploadType = formData.get("type") as string || "UNKNOWN";

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "File tidak ditemukan" }, { status: 400 });
    }

    // Helper untuk mengekstrak tanggal dari nama file PQ
    function extractDateFromFilename(filename: string): Date {
      const match = filename.toUpperCase().match(/POWER QUERY (\d{1,2}) ([A-Z]+) (\d{4})/);
      if (match) {
        const day = parseInt(match[1]);
        const monthStr = match[2];
        const year = parseInt(match[3]);
        
        const months: Record<string, number> = {
          "JANUARI": 0, "JANUARY": 0, "JAN": 0,
          "FEBRUARI": 1, "FEBRUARY": 1, "FEB": 1,
          "MARET": 2, "MARCH": 2, "MAR": 2,
          "APRIL": 3, "APR": 3,
          "MEI": 4, "MAY": 4,
          "JUNI": 5, "JUNE": 5, "JUN": 5,
          "JULI": 6, "JULY": 6, "JUL": 6,
          "AGUSTUS": 7, "AUGUST": 7, "AUG": 7,
          "SEPTEMBER": 8, "SEP": 8,
          "OKTOBER": 9, "OCTOBER": 9, "OCT": 9,
          "NOVEMBER": 10, "NOV": 10,
          "DESEMBER": 11, "DECEMBER": 11, "DEC": 11
        };
        
        const month = months[monthStr] !== undefined ? months[monthStr] : new Date().getMonth();
        return new Date(year, month, day, 12, 0, 0); // jam 12 siang untuk hindari bug timezone
      }
      return new Date();
    }

    let totalCreated = 0;
    let totalUpdated = 0;
    let totalFailed = 0;
    const allLogs: string[] = [];

    // 1. Validasi semua file sebelum diproses
    for (const file of files) {
      if (uploadType === "PQ_HARIAN") {
        const fileNameUpper = file.name.toUpperCase();
        const isValidFormat = /^POWER QUERY \d{1,2} [A-Z]+ \d{4}\.(CSV|XLSX)$/.test(fileNameUpper);
        if (!isValidFormat) {
          return NextResponse.json({ 
            error: `Format nama file salah: "${file.name}". Harus mengikuti format "POWER QUERY [TANGGAL] [BULAN] [TAHUN]"` 
          }, { status: 400 });
        }
      }

      const existingHistory = await prisma.syncHistory.findFirst({
        where: { fileName: file.name, status: "SUCCESS" }
      });

      if (existingHistory) {
        return NextResponse.json({ 
          error: `File "${file.name}" sudah pernah di-upload sukses sebelumnya.` 
        }, { status: 400 });
      }
    }

    // 2. Proses semua isi file ke dalam SATU Map Global agar tidak kena Timeout
    const globalProductMap = new Map<string, ReturnType<typeof parseRow>>();
    
    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const { sheetLog } = processWorkbook(buffer, globalProductMap);
      allLogs.push(`--- ${file.name} ---`);
      allLogs.push(...sheetLog);
    }

    // 3. Simpan ke database HANYA SEKALI untuk semua file sekaligus
    // Ambil tanggal dari nama file terakhir yang diupload
    const targetUploadDate = extractDateFromFilename(files[files.length - 1].name);
    const { created, updated, failed } = await upsertProducts(globalProductMap, targetUploadDate);
    totalCreated = created;
    totalUpdated = updated;
    totalFailed = failed;

    // 4. Catat histori sukses untuk masing-masing file
    if (userId) {
      const historyData = files.map(file => ({
        userId,
        type: uploadType,
        fileName: file.name,
        status: failed > 0 && created === 0 && updated === 0 ? "FAILED" : "SUCCESS",
        records: Math.max(1, Math.floor((created + updated) / files.length)), // estimasi kasar
      }));
      await prisma.syncHistory.createMany({ data: historyData });
    }

    return NextResponse.json({
      success: true,
      message: `Selesai! ${totalCreated} produk baru ditambahkan, ${totalUpdated} harga diperbarui. Gagal: ${totalFailed}.`,
      logs: allLogs,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Terjadi kesalahan saat memproses file" }, { status: 500 });
  }
}

// -------------------------------------------------------
// GET: import otomatis dari folder D:\Website\SUKO
// -------------------------------------------------------
export async function GET() {
  const SUKO_DIR = "D:\\Website\\SUKO";

  try {
    if (!fs.existsSync(SUKO_DIR)) {
      return NextResponse.json(
        { error: `Folder tidak ditemukan: ${SUKO_DIR}` },
        { status: 404 }
      );
    }

    const xlsxFiles = fs
      .readdirSync(SUKO_DIR)
      .filter(
        (f) =>
          f.endsWith(".xlsx") &&
          !f.startsWith("~") &&       // skip Excel lock files
          !f.startsWith("Summary")    // skip summary file
      );

    if (xlsxFiles.length === 0) {
      return NextResponse.json(
        { error: "Tidak ada file .xlsx di folder SUKO" },
        { status: 404 }
      );
    }

    // Step 1: Build a GLOBAL deduplicated product map across ALL files
    // Same priority rule: if SKU seen before as promo, keep promo; else update.
    const globalMap = new Map<string, ReturnType<typeof parseRow>>();
    const allLogs: string[] = [];
    const processedFiles: string[] = [];

    for (const fileName of xlsxFiles) {
      const filePath = path.join(SUKO_DIR, fileName);
      const buffer = fs.readFileSync(filePath);
      const { productMap, sheetLog } = processWorkbook(buffer);

      allLogs.push(`\n=== ${fileName} ===`);
      allLogs.push(...sheetLog);
      processedFiles.push(fileName);

      // Merge file's productMap into globalMap
      for (const [sku, item] of productMap) {
        const existing = globalMap.get(sku);
        if (!existing) {
          globalMap.set(sku, item);
        } else {
          const existingIsPromo = existing.hargaPromo !== null && existing.hargaPromo !== undefined && existing.hargaPromo > 0;
          const newIsPromo = item.hargaPromo !== null && item.hargaPromo !== undefined && item.hargaPromo > 0;
          if (!existingIsPromo && newIsPromo) {
            globalMap.set(sku, item);
          }
        }
      }
    }

    // Step 2: Upsert all to DB
    const { created, updated, failed } = await upsertProducts(globalMap);

    return NextResponse.json({
      success: true,
      message: `Import selesai! ${processedFiles.length} file diproses. ${globalMap.size} SKU unik. ${created} produk baru, ${updated} harga diperbarui. Gagal: ${failed}.`,
      totalUniqueSku: globalMap.size,
      files: processedFiles,
      logs: allLogs,
    });
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json(
      { error: "Terjadi kesalahan saat mengimpor folder SUKO" },
      { status: 500 }
    );
  }
}
