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
  const match = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (match) {
    return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  }
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
  "SKU":              ["SKU", "KODE", "KODE PRODUK", "PRODUCT CODE", "CODE", "ID", "ITEM", "MATERIAL", "NO MATERIAL", "PLU"],
  "DESCRIPTION":      ["DESCRIPTION", "ITEM_DESCRIPTION", "ITEM DESCRIPTION", "NAMA", "NAMA PRODUK", "PRODUCT NAME", "DESC", "KETERANGAN", "DESKRIPSI", "ITEM_DESCRIP"],
  "HARGA NORMAL":     ["HARGA NORMAL", "HARGA", "NORMAL PRICE", "PRICE", "HARGA JUAL", "REGULAR PRICE", "HARGA POKOK", "RP RETAIL"],
  "HARGA PROMO":      ["HARGA PROMO", "PROMO PRICE", "PROMO", "HARGA DISKON", "DISC PRICE"],
  "ARTICLE":          ["ARTICLE", "ARTIKEL", "BARCODE", "NO ARTIKEL", "PARENT_NAME", "PARENT NAME"],
  "FROM DATE":        ["FROM DATE", "DARI TANGGAL", "START DATE", "TGL MULAI", "FROM"],
  "TO DATE":          ["TO DATE", "SAMPAI TANGGAL", "END DATE", "TGL AKHIR", "TO", "BERLAKU SAMPAI"],
  "DISKON":           ["DISKON", "DISCOUNT", "DISC", "POTONGAN"],
  "DISCOUNT TYPE":    ["DISCOUNT TYPE", "TIPE DISKON", "JENIS DISKON"],
  "BRAND":            ["BRAND", "MEREK", "MERK", "GROUP"],
  "DEPT":             ["DEPT", "DEPARTMENT", "DIVISI", "KATEGORI", "CATEGORY"],
  "ACARA":            ["ACARA", "EVENT", "PROMO NAME", "NAMA PROMO"],
  // Stok & Sales
  "STOK":             ["STOK", "EOH_UNIT", "EOH UNIT", "EOH", "SISA STOK", "STOK SISA"],
  "EOH_RETAIL":       ["EOH_RETAIL", "EOH RETAIL", "NILAI STOK", "STOCK VALUE", "SUM OF EOH_RETAIL", "JUMLAH DARI EOH_RETAIL"],
  "SALES_MTD":        ["SALES_MTD", "MTD_SALES_UNIT", "MTD SALES UNIT", "SALES MTD", "MTD", "TERJUAL", "SALES"],
  "SALES_MTD_RETAIL": ["SALES_MTD_RETAIL", "MTD_SALES_RETAIL", "MTD SALES RETAIL", "OMZET MTD", "OMZET BULAN INI"],
  "SALES_WTD":        ["SALES_WTD", "WTD_SALES_UNIT", "WTD SALES UNIT", "SALES WTD", "WTD"],
  "SALES_WTD_RETAIL": ["SALES_WTD_RETAIL", "WTD_SALES_RETAIL", "WTD SALES RETAIL", "OMZET WTD"],
  "SALES_YTD":        ["SALES_YTD", "YTD_SALES_UNIT", "YTD SALES UNIT", "SALES YTD", "YTD", "SUM OF YTD_SALES_UNIT"],
  "SALES_YTD_RETAIL": ["SALES_YTD_RETAIL", "YTD_SALES_RETAIL", "YTD SALES RETAIL", "OMZET YTD", "OMZET TAHUN INI", "SUM OF YTD_SALES_RETAIL"],
  "BOY_UNIT":         ["BOY_UNIT", "BOY UNIT", "STOK AWAL TAHUN", "SUM OF BOY_UNIT"],
  "BOY_RETAIL":       ["BOY_RETAIL", "BOY RETAIL", "NILAI STOK AWAL TAHUN", "SUM OF BOY_RETAIL"],
  "DAY_SALES_UNIT":   ["DAY_SALES_UNIT", "DAY SALES UNIT"],
  "DAY_SALES_RETAIL": ["DAY_SALES_RETAIL", "DAY SALES RETAIL"],
  "BOM_UNIT":         ["BOM_UNIT", "BOM UNIT"],
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

  // ---- STOK & SALES (semua kolom PQ yang penting) ----
  // PENTING: Kembalikan `undefined` jika kolom tidak ada di header sheet.
  // Kembalikan nilai (termasuk 0) hanya jika kolom ADA, agar COALESCE di SQL
  // bisa membedakan antara "data 0" vs "kolom tidak ada".
  // Khusus untuk EOH/Stok: jika kolom ada tapi kosong (""), anggap nilainya NULL
  // supaya COALESCE melindungi nilai lama. Ini menjaga stok tidak tiba-tiba jadi 0.
  const stok             = row["STOK"] !== undefined
    ? (row["STOK"] === "" ? null : (parseInt(row["STOK"]) || 0))
    : undefined;
  const eoh_retail       = row["EOH_RETAIL"] !== undefined
    ? (row["EOH_RETAIL"] === "" ? null : safeFloat(row["EOH_RETAIL"]))
    : undefined;
  const sales_mtd        = row["SALES_MTD"] !== undefined
    ? (row["SALES_MTD"] === "" ? null : (parseInt(row["SALES_MTD"]) || 0))
    : undefined;
  const sales_mtd_retail = row["SALES_MTD_RETAIL"] !== undefined
    ? (row["SALES_MTD_RETAIL"] === "" ? null : safeFloat(row["SALES_MTD_RETAIL"]))
    : undefined;
  const sales_wtd        = row["SALES_WTD"] !== undefined
    ? (row["SALES_WTD"] === "" ? null : (parseInt(row["SALES_WTD"]) || 0))
    : undefined;
  const sales_wtd_retail = row["SALES_WTD_RETAIL"] !== undefined
    ? (row["SALES_WTD_RETAIL"] === "" ? null : safeFloat(row["SALES_WTD_RETAIL"]))
    : undefined;
  const sales_ytd        = row["SALES_YTD"] !== undefined
    ? (row["SALES_YTD"] === "" ? null : (parseInt(row["SALES_YTD"]) || 0))
    : undefined;
  const sales_ytd_retail = row["SALES_YTD_RETAIL"] !== undefined
    ? (row["SALES_YTD_RETAIL"] === "" ? null : safeFloat(row["SALES_YTD_RETAIL"]))
    : undefined;
  const boy_unit         = row["BOY_UNIT"] !== undefined
    ? (row["BOY_UNIT"] === "" ? null : (parseInt(row["BOY_UNIT"]) || 0))
    : undefined;
  const boy_retail       = row["BOY_RETAIL"] !== undefined
    ? (row["BOY_RETAIL"] === "" ? null : safeFloat(row["BOY_RETAIL"]))
    : undefined;
  const bom_unit         = row["BOM_UNIT"] !== undefined
    ? (row["BOM_UNIT"] === "" ? null : (parseInt(row["BOM_UNIT"]) || 0))
    : undefined;
  const day_sales_unit   = row["DAY_SALES_UNIT"] !== undefined
    ? (row["DAY_SALES_UNIT"] === "" ? null : (parseInt(row["DAY_SALES_UNIT"]) || 0))
    : undefined;
  const day_sales_retail = row["DAY_SALES_RETAIL"] !== undefined
    ? (row["DAY_SALES_RETAIL"] === "" ? null : safeFloat(row["DAY_SALES_RETAIL"]))
    : undefined;

  // ---- HARGA NORMAL ----
  let hargaNormal = row["HARGA NORMAL"] !== undefined ? safeFloat(row["HARGA NORMAL"]) : undefined;

  // Smart Price Extraction dari data PQ jika kolom harga eksplisit tidak ada
  if ((hargaNormal === undefined || hargaNormal === 0) && eoh_retail !== undefined) {
    const eohUnit = stok || 0;
    const ytdUnit = sales_ytd || 0;
    const boyUnit = boy_unit || 0;

    let basePrice = 0;
    if (eohUnit > 0 && eoh_retail! > 0) basePrice = eoh_retail! / eohUnit;
    else if (ytdUnit > 0 && sales_ytd_retail! > 0) basePrice = sales_ytd_retail! / ytdUnit;
    else if (boyUnit > 0 && boy_retail! > 0) basePrice = boy_retail! / boyUnit;

    if (basePrice > 0) hargaNormal = Math.round(basePrice);
  }

  // ---- HARGA PROMO ----
  const rawPromo = row["HARGA PROMO"];
  let hargaPromo: number | null | undefined = undefined;
  if (rawPromo !== undefined) {
    const rawPromoStr = typeof rawPromo === "string" ? rawPromo.toUpperCase() : "";
    const isTextPromo = rawPromoStr.includes("NORMAL") || rawPromoStr.match(/B\dG\d/) || rawPromoStr.includes("BXGY") || rawPromoStr === "";
    const hargaPromoRaw = isTextPromo ? null : safeFloat(rawPromo);
    hargaPromo = hargaPromoRaw && hargaPromoRaw > 0 ? hargaPromoRaw : null;
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

// -------------------------------------------------------
// Process one workbook (Buffer) → deduped product map
//   Priority rule: PROMO record wins over NORMAL PRICE for same SKU
// -------------------------------------------------------
function processWorkbook(
  buffer: Buffer, 
  productMap: Map<string, ReturnType<typeof parseRow>> = new Map(),
  fileName?: string
): {
  productMap: Map<string, ReturnType<typeof parseRow>>;
  sheetLog: string[];
} {
  const workbook = xlsx.read(buffer, { type: "buffer", cellDates: false });
  const sheetLog: string[] = [];

  // Helper untuk mencari index baris header (yang ada SKU/KODE)
  const findHeaderRowIndex = (ws: any): number => {
    const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: "" }) as any[][];
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
    const rawRows = xlsx.utils.sheet_to_json(ws, { range: headerRowIndex, defval: "" }) as any[];

    if (rawRows.length === 0) {
      sheetLog.push(`[EMPTY] ${sheetName}`);
      continue;
    }

    // Normalize ALL rows to trim whitespace from column names, then remap aliases
    const rows = rawRows.map(r => {
      const normalized = remapKeys(normalizeKeys(r));
      if (fileName) normalized["__SOURCE_FILE__"] = fileName;
      normalized["__SOURCE_SHEET__"] = sheetName;
      return normalized;
    });

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
  uploadDate: Date = new Date(),
  fileName: string | null = null,
  uploadType: string = "PQ_HARIAN"  // "PQ_HARIAN" atau "UPDATE_PROMO"
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
      // New SKU → add with default fallback for missing required fields
      const isPromo = item.hargaPromo !== undefined || item.diskon !== undefined || item.discountType !== undefined || item.acara !== undefined;
      const explicitFileName = item.sourceFile && item.sourceSheet ? `${item.sourceFile} [Sheet: ${item.sourceSheet}]` : fileName;
      
      itemsToCreate.push({
        sku:               item.sku,
        barcode:           (item as any).barcode   || null,
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

  // 2. Insert produk baru sekaligus (Bulk Insert)
  if (itemsToCreate.length > 0) {
    try {
      // Chunking if array is too large, but 8000 is usually fine for createMany
      const result = await prisma.product.createMany({
        data: itemsToCreate,
        skipDuplicates: true,
      });
      created = result.count;

      // Hasilkan DailySales untuk produk baru yang memiliki sales > 0
      const newSkus = itemsToCreate.filter(i => (i.day_sales_unit || i.sales_mtd || 0) > 0).map(i => i.sku);
      if (newSkus.length > 0) {
        const newlyInserted = await prisma.product.findMany({
          where: { sku: { in: newSkus } },
          select: { id: true, sku: true }
        });
        const skuToId = new Map(newlyInserted.map(p => [p.sku, p.id]));
        
        const newDailySales = [];
        for (const item of itemsToCreate) {
          const qty = item.day_sales_unit || item.sales_mtd || 0;
          if (qty > 0) {
            const pid = skuToId.get(item.sku);
            if (pid) {
              newDailySales.push({
                productId: pid,
                date: uploadDate,
                qtySold: qty,
                omzet: item.day_sales_retail || item.sales_mtd_retail || 0
              });
            }
          }
        }
        
        if (newDailySales.length > 0) {
          await prisma.dailySales.createMany({
            data: newDailySales,
            skipDuplicates: true
          });
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
      const dailySalesData: any[] = [];

      for (const item of chunk) {
        const existingInfo = existingProductMap.get(item.sku);
        if (!existingInfo) continue;

        // LOGIKA DELTA EOH
        const oldStok = existingInfo.stok || 0;
        let salesDelta = 0;
        if (item.stok !== undefined && item.stok !== null && oldStok > 0 && item.stok < oldStok) {
          salesDelta = oldStok - item.stok;
        }

        // Cek promo
        let finalPromoToSave;
        let finalDiskonToSave;
        let finalDiscountTypeToSave;
        let finalAcaraToSave;
        let finalFromDateToSave;
        let finalToDateToSave;

        const explicitFileName = item.sourceFile && item.sourceSheet ? `${item.sourceFile} [Sheet: ${item.sourceSheet}]` : fileName;

        // ============================================================
        // LOGIKA PROMO: Pakai `uploadType`, bukan tebak dari kolom!
        // - PQ_HARIAN  → SELALU lindungi promo yang ada di DB
        // - UPDATE_PROMO → SELALU terapkan data promo dari file
        // ============================================================
        if (uploadType !== "UPDATE_PROMO") {
          // === JALUR PQ HARIAN: Jangan sentuh promo sama sekali ===
          finalPromoToSave          = existingInfo.hargaPromo;
          finalDiskonToSave         = existingInfo.diskon;
          finalDiscountTypeToSave   = existingInfo.discountType;
          finalAcaraToSave          = existingInfo.acara;
          finalFromDateToSave       = existingInfo.fromDate;
          finalToDateToSave         = existingInfo.toDate;
        } else {
          // === JALUR UPDATE PROMO: Terapkan data baru dari file promo ===
          // Jika file promo tidak ada kolom "HARGA PROMO" khusus, maka harga apapun yg ada (misal RP RETAIL / HARGA NORMAL) adalah harga promo
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

          // Validity Check: Cek apakah promo masih berlaku (belum kadaluarsa)
          const isPromoActive = (newHargaPromo !== null && newHargaPromo! > 0) ||
                                (newDiskon !== null && newDiskon !== undefined) ||
                                (newDiscountType !== null && newDiscountType !== undefined);

          let promoStillValid = false;
          if (isPromoActive) {
            if (newToDate) {
              const toDateObj = new Date(newToDate);
              toDateObj.setHours(23, 59, 59, 999);
              promoStillValid = new Date() <= toDateObj;
            } else {
              promoStillValid = true; // Tidak ada tanggal akhir = berlaku selamanya
            }
          }

          finalPromoToSave        = promoStillValid ? newHargaPromo   : null;
          finalDiskonToSave       = promoStillValid ? newDiskon       : null;
          finalDiscountTypeToSave = promoStillValid ? newDiscountType : null;
          finalAcaraToSave        = promoStillValid ? newAcara        : null;
          finalFromDateToSave     = promoStillValid ? newFromDate     : null;
          finalToDateToSave       = promoStillValid ? newToDate       : null;
        }

        const finalPromoFileNameToSave = (uploadType === "UPDATE_PROMO" && explicitFileName) ? explicitFileName : undefined;

        // Hitung delta omzet MTD retail (untuk dailySales.omzet)
        // Hitung delta omzet MTD retail (untuk dailySales.omzet)
        const oldMtdRetail = (existingInfo as any).sales_mtd_retail || 0;
        let newMtdRetail = item.sales_mtd_retail !== undefined && item.sales_mtd_retail !== null ? item.sales_mtd_retail : 0;
        if (newMtdRetail < oldMtdRetail) {
          newMtdRetail = oldMtdRetail;
          item.sales_mtd_retail = oldMtdRetail;
        }
        const omzetDelta = newMtdRetail > oldMtdRetail ? newMtdRetail - oldMtdRetail : 0;

        // Hitung delta QTY (sales_mtd)
        const oldMtdQty = (existingInfo as any).sales_mtd || 0;
        let newMtdQty = item.sales_mtd !== undefined && item.sales_mtd !== null ? item.sales_mtd : 0;
        if (newMtdQty < oldMtdQty) {
          newMtdQty = oldMtdQty;
          item.sales_mtd = oldMtdQty;
        }
        
        let qtyDelta = newMtdQty > oldMtdQty ? newMtdQty - oldMtdQty : 0;
        
        if (qtyDelta === 0 && item.day_sales_unit && item.day_sales_unit > 0) {
           qtyDelta = item.day_sales_unit;
        }

        rowPlaceholders.push(`($${paramIndex++}::text, $${paramIndex++}::double precision, $${paramIndex++}::text, $${paramIndex++}::text, $${paramIndex++}::text, $${paramIndex++}::text, $${paramIndex++}::int, $${paramIndex++}::double precision, $${paramIndex++}::int, $${paramIndex++}::double precision, $${paramIndex++}::int, $${paramIndex++}::double precision, $${paramIndex++}::int, $${paramIndex++}::double precision, $${paramIndex++}::int, $${paramIndex++}::double precision, $${paramIndex++}::int, $${paramIndex++}::int, $${paramIndex++}::double precision, $${paramIndex++}::double precision, $${paramIndex++}::double precision, $${paramIndex++}::text, $${paramIndex++}::text, $${paramIndex++}::text, $${paramIndex++}::text, $${paramIndex++}::text, $${paramIndex++}::text)`);
        
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
          item.day_sales_unit     !== undefined && item.day_sales_unit !== null ? item.day_sales_unit     : (qtyDelta > 0 ? qtyDelta : null),
          item.day_sales_retail   !== undefined && item.day_sales_retail !== null ? item.day_sales_retail   : (omzetDelta > 0 ? omzetDelta : null),
          omzetDelta,
          finalPromoToSave,
          finalDiskonToSave,
          finalDiscountTypeToSave,
          finalAcaraToSave,
          finalFromDateToSave,
          finalToDateToSave,
          finalPromoFileNameToSave !== undefined ? finalPromoFileNameToSave : null
        );

        // Gunakan qtyDelta untuk mencatat qty yang sebenarnya terjual HARI INI
        if (qtyDelta !== 0) {
          dailySalesData.push({
            productId: existingInfo.id,
            date: uploadDate,
            qtySold: qtyDelta,
            omzet: omzetDelta > 0 ? omzetDelta : (item.day_sales_retail || 0)
          });
        }
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
              "day_sales_unit"   = CASE WHEN v."day_sales_unit" IS NOT NULL THEN v."day_sales_unit" ELSE p."day_sales_unit" END,
              "day_sales_retail" = CASE WHEN v."day_sales_retail" IS NOT NULL THEN v."day_sales_retail" ELSE p."day_sales_retail" END,
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
            ) AS v("sku", "hargaNormal", "description", "article", "brand", "dept", "stok", "eoh_retail", "sales_mtd", "sales_mtd_retail", "sales_wtd", "sales_wtd_retail", "sales_ytd", "sales_ytd_retail", "boy_unit", "boy_retail", "bom_unit", "day_sales_unit", "day_sales_retail", "omzetDelta", "hargaPromo", "diskon", "discountType", "acara", "fromDate", "toDate", "promoFileName")
            WHERE p."sku" = v."sku"
          `;

          await prisma.$executeRawUnsafe(query, ...values);
          updated += rowPlaceholders.length;

          if (dailySalesData.length > 0) {
            await prisma.dailySales.createMany({
              data: dailySalesData,
              skipDuplicates: true
            });
          }
        } catch (err) {
          console.error("Bulk raw update error", err);
          failed += rowPlaceholders.length;
        }
      }
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

    const payload = await request.json();
    const { type, rows, fileName, fileUrl, uploadDate, isLastChunk, totalRecords } = payload;

    if (!rows || !Array.isArray(rows)) {
      return NextResponse.json({ error: "Data baris (rows) tidak valid" }, { status: 400 });
    }

    if (rows.length === 0) {
      return NextResponse.json({ success: true, message: "Tidak ada data untuk diproses" });
    }

    // 1. Convert raw JSON rows to ProductMap
    const productMap = new Map<string, ReturnType<typeof parseRow>>();
    
    // Normalize and remap keys for all rows
    const normalizedRows = rows.map(r => remapKeys(normalizeKeys(r)));

    let added = 0;
    let updated = 0;

    for (const row of normalizedRows) {
      const sku = String(row["SKU"] ?? "").trim();
      if (!sku) continue;

      const parsed = parseRow(row);
      const existing = productMap.get(sku);

      if (!existing) {
        productMap.set(sku, parsed);
        added++;
      } else {
        const existingIsPromo = (existing.hargaPromo !== null && existing.hargaPromo !== undefined && existing.hargaPromo > 0) || 
                                (existing.diskon !== null && existing.diskon !== undefined);
        const newIsPromo = (parsed.hargaPromo !== null && parsed.hargaPromo !== undefined && parsed.hargaPromo > 0) || 
                           (parsed.diskon !== null && parsed.diskon !== undefined);

        if (!existingIsPromo && newIsPromo) {
          productMap.set(sku, parsed);
          updated++;
        }
      }
    }

    // 2. Upsert to DB
    const targetUploadDate = uploadDate ? new Date(uploadDate) : new Date();
    const { created, updated: dbUpdated, failed } = await upsertProducts(productMap, targetUploadDate, fileName, type || "PQ_HARIAN");

    // 3. Log History if this is the last chunk
    if (isLastChunk && userId && fileName) {
      await prisma.syncHistory.create({
        data: {
          userId,
          type: type || "UNKNOWN",
          fileName: fileName,
          fileUrl: fileUrl,
          status: failed > 0 && created === 0 && dbUpdated === 0 ? "FAILED" : "SUCCESS",
          records: totalRecords || (created + dbUpdated),
        }
      });
    }

    return NextResponse.json({
      success: true,
      message: `Chunk diproses: ${created} baru, ${dbUpdated} diupdate, ${failed} gagal.`,
    });
  } catch (error) {
    console.error("Chunk upload error:", error);
    return NextResponse.json({ error: "Terjadi kesalahan saat memproses chunk" }, { status: 500 });
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
      const { productMap, sheetLog } = processWorkbook(buffer, new Map(), fileName);

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
    const { created, updated, failed } = await upsertProducts(globalMap, new Date(), "SUKO_SYNC_FOLDER");

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
