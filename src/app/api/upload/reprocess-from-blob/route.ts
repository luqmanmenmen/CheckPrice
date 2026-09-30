import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import * as xlsx from "xlsx";
import { verifyToken } from "@/lib/auth";

const prisma = new PrismaClient();

export const maxDuration = 60;

function safeFloat(val: any): number {
  if (val === null || val === undefined || val === "") return 0;
  const n = parseFloat(String(val).replace(/[^0-9.-]/g, ""));
  return isNaN(n) ? 0 : n;
}

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
  return String(value).trim() || null;
}

const COL_ALIASES: Record<string, string[]> = {
  "SKU":              ["SKU", "KODE", "KODE PRODUK", "PRODUCT CODE", "CODE", "ID", "ITEM", "MATERIAL", "NO MATERIAL", "PLU"],
  "DESCRIPTION":      ["DESCRIPTION", "ITEM_DESCRIPTION", "ITEM DESCRIPTION", "NAMA", "NAMA PRODUK", "PRODUCT NAME", "DESC", "KETERANGAN", "DESKRIPSI", "ITEM_DESCRIP"],
  "HARGA NORMAL":     ["HARGA NORMAL", "HARGA", "NORMAL PRICE", "PRICE", "HARGA JUAL", "REGULAR PRICE", "HARGA POKOK"],
  "ARTICLE":          ["ARTICLE", "ARTIKEL", "BARCODE", "NO ARTIKEL", "PARENT_NAME", "PARENT NAME"],
  "BRAND":            ["BRAND", "MEREK", "MERK", "GROUP"],
  "DEPT":             ["DEPT", "DEPARTMENT", "DIVISI", "KATEGORI", "CATEGORY"],
  "STOK":             ["STOK", "EOH_UNIT", "EOH UNIT", "EOH", "SISA STOK", "STOK SISA"],
  "EOH_RETAIL":       ["EOH_RETAIL", "EOH RETAIL", "NILAI STOK", "STOCK VALUE"],
  "SALES_MTD":        ["SALES_MTD", "MTD_SALES_UNIT", "MTD SALES UNIT", "SALES MTD", "MTD", "TERJUAL", "SALES"],
  "SALES_MTD_RETAIL": ["SALES_MTD_RETAIL", "MTD_SALES_RETAIL", "MTD SALES RETAIL", "OMZET MTD", "OMZET BULAN INI"],
  "SALES_WTD":        ["SALES_WTD", "WTD_SALES_UNIT", "WTD SALES UNIT", "SALES WTD", "WTD"],
  "SALES_WTD_RETAIL": ["SALES_WTD_RETAIL", "WTD_SALES_RETAIL", "WTD SALES RETAIL", "OMZET WTD"],
  "SALES_YTD":        ["SALES_YTD", "YTD_SALES_UNIT", "YTD SALES UNIT", "SALES YTD", "YTD"],
  "SALES_YTD_RETAIL": ["SALES_YTD_RETAIL", "YTD_SALES_RETAIL", "YTD SALES RETAIL", "OMZET YTD", "OMZET TAHUN INI"],
  "BOY_UNIT":         ["BOY_UNIT", "BOY UNIT", "STOK AWAL TAHUN"],
  "BOY_RETAIL":       ["BOY_RETAIL", "BOY RETAIL", "NILAI STOK AWAL TAHUN"],
  "DAY_SALES_UNIT":   ["DAY_SALES_UNIT", "DAY SALES UNIT", "PENJUALAN HARI INI", "SALES HARI INI"],
  "DAY_SALES_RETAIL": ["DAY_SALES_RETAIL", "DAY SALES RETAIL", "OMZET HARI INI"],
};

function normalizeKeys(row: any): any {
  const out: any = {};
  for (const key of Object.keys(row)) {
    out[key.trim().toUpperCase()] = row[key];
  }
  return out;
}

function remapKeys(row: any): any {
  const out: any = { ...row };
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

// Parse CSV text into array of row objects
function parseCSV(text: string): any[] {
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
  const rows: any[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    // Simple CSV split (handles quoted fields with commas)
    const vals: string[] = [];
    let inQuote = false;
    let cur = "";
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote; }
      else if (ch === "," && !inQuote) { vals.push(cur); cur = ""; }
      else { cur += ch; }
    }
    vals.push(cur);
    const row: any = {};
    headers.forEach((h, idx) => { row[h] = vals[idx] ?? ""; });
    rows.push(row);
  }
  return rows;
}

// Download a file from a URL and return text or buffer
async function fetchFileFromBlob(url: string): Promise<{ text?: string; buffer?: Buffer }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const isCSV = url.toLowerCase().includes(".csv");
  if (isCSV) {
    const text = await res.text();
    return { text };
  } else {
    const ab = await res.arrayBuffer();
    return { buffer: Buffer.from(ab) };
  }
}

// Build a product map from rows
function buildProductMap(rows: any[], fileName: string): Map<string, any> {
  const productMap = new Map<string, any>();
  for (const rawRow of rows) {
    const row = remapKeys(normalizeKeys(rawRow));
    const sku = String(row["SKU"] ?? "").trim();
    if (!sku) continue;

    const stok             = row["STOK"]             !== "" ? parseInt(row["STOK"]) || 0 : undefined;
    const eoh_retail       = row["EOH_RETAIL"]       !== "" ? safeFloat(row["EOH_RETAIL"]) : undefined;
    const sales_mtd        = row["SALES_MTD"]        !== "" ? parseInt(row["SALES_MTD"]) || 0 : undefined;
    const sales_mtd_retail = row["SALES_MTD_RETAIL"] !== "" ? safeFloat(row["SALES_MTD_RETAIL"]) : undefined;
    const sales_wtd        = row["SALES_WTD"]        !== "" ? parseInt(row["SALES_WTD"]) || 0 : undefined;
    const sales_wtd_retail = row["SALES_WTD_RETAIL"] !== "" ? safeFloat(row["SALES_WTD_RETAIL"]) : undefined;
    const sales_ytd        = row["SALES_YTD"]        !== "" ? parseInt(row["SALES_YTD"]) || 0 : undefined;
    const sales_ytd_retail = row["SALES_YTD_RETAIL"] !== "" ? safeFloat(row["SALES_YTD_RETAIL"]) : undefined;
    const boy_unit         = row["BOY_UNIT"]         !== "" ? parseInt(row["BOY_UNIT"]) || 0 : undefined;
    const boy_retail       = row["BOY_RETAIL"]       !== "" ? safeFloat(row["BOY_RETAIL"]) : undefined;
    const day_sales_unit   = row["DAY_SALES_UNIT"]   !== "" ? parseInt(row["DAY_SALES_UNIT"]) || 0 : undefined;
    const day_sales_retail = row["DAY_SALES_RETAIL"] !== "" ? safeFloat(row["DAY_SALES_RETAIL"]) : undefined;
    let hargaNormal = row["HARGA NORMAL"] !== "" ? safeFloat(row["HARGA NORMAL"]) : undefined;
    const description = row["DESCRIPTION"] !== undefined ? String(row["DESCRIPTION"]).trim() : undefined;
    const article     = row["ARTICLE"]     !== undefined ? (String(row["ARTICLE"]).trim() || null) : undefined;
    const brand       = row["BRAND"]       !== undefined ? (String(row["BRAND"]).trim() || null) : undefined;
    const dept        = row["DEPT"]        !== undefined ? (String(row["DEPT"]).trim() || null) : undefined;

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

    productMap.set(sku, {
      sku, description, article, brand, dept, hargaNormal,
      stok, eoh_retail, sales_mtd, sales_mtd_retail,
      sales_wtd, sales_wtd_retail, sales_ytd, sales_ytd_retail,
      boy_unit, boy_retail, day_sales_unit, day_sales_retail,
      sourceFile: fileName,
    });
  }
  return productMap;
}

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    const session = token ? await verifyToken(token) : null;
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get the 2 most recent PQ files from SyncHistory (in asc order so PQ28 first, PQ29 second)
    const pqHistory = await prisma.syncHistory.findMany({
      where: { type: "PQ_HARIAN", fileUrl: { not: null } },
      orderBy: { createdAt: "asc" },
      take: 10,
      select: { id: true, fileName: true, fileUrl: true, createdAt: true }
    });

    if (pqHistory.length < 2) {
      return NextResponse.json({
        success: false,
        error: `Hanya ditemukan ${pqHistory.length} file PQ di Blob. Dibutuhkan minimal 2 file (hari sebelumnya + hari ini) untuk menghitung delta penjualan harian.`
      }, { status: 400 });
    }

    // Sort ascending → oldest = PQ28, newest = PQ29
    pqHistory.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const oldFile = pqHistory[pqHistory.length - 2]; // PQ28
    const newFile = pqHistory[pqHistory.length - 1]; // PQ29

    console.log(`Re-processing: OLD=${oldFile.fileName}, NEW=${newFile.fileName}`);

    // Download both files from Blob
    const [oldData, newData] = await Promise.all([
      fetchFileFromBlob(oldFile.fileUrl!),
      fetchFileFromBlob(newFile.fileUrl!),
    ]);

    // Parse rows
    const oldRows = oldData.text ? parseCSV(oldData.text) : [];
    const newRows = newData.text ? parseCSV(newData.text) : [];

    if (oldRows.length === 0 || newRows.length === 0) {
      return NextResponse.json({ success: false, error: "Gagal parse baris dari file Blob. Pastikan file CSV valid." }, { status: 400 });
    }

    // Build maps
    const oldMap = buildProductMap(oldRows, oldFile.fileName!);
    const newMap = buildProductMap(newRows, newFile.fileName!);

    // Compute delta: for each SKU in new, compare with old to get day_sales
    const uploadDate = new Date(newFile.createdAt);
    
    // Clear existing DailySales for the target date (to avoid duplicates)
    const dateStart = new Date(uploadDate);
    dateStart.setHours(0, 0, 0, 0);
    const dateEnd = new Date(uploadDate);
    dateEnd.setHours(23, 59, 59, 999);

    await prisma.dailySales.deleteMany({
      where: { date: { gte: dateStart, lte: dateEnd } }
    });

    // Get all existing products from DB
    const allSkus = Array.from(newMap.keys());
    const existingProducts = await prisma.product.findMany({
      where: { sku: { in: allSkus } },
      select: { id: true, sku: true, sales_mtd_retail: true, sales_mtd: true, stok: true,
                hargaPromo: true, diskon: true, discountType: true, acara: true, fromDate: true, toDate: true }
    });
    const existingMap = new Map(existingProducts.map(p => [p.sku, p]));

    // Build bulk update values
    const values: any[] = [];
    const rowPlaceholders: string[] = [];
    const dailySalesData: any[] = [];
    let paramIndex = 1;
    let processedCount = 0;

    for (const [sku, newItem] of newMap) {
      const existing = existingMap.get(sku);
      if (!existing) continue; // Only update existing products

      const oldItem = oldMap.get(sku);

      // Delta calc: prefer explicit DAY_SALES columns, else derive from MTD diff
      let qtyDelta = (newItem.day_sales_unit && newItem.day_sales_unit > 0)
        ? newItem.day_sales_unit
        : 0;
      let omzetDelta = (newItem.day_sales_retail && newItem.day_sales_retail > 0)
        ? newItem.day_sales_retail
        : 0;

      if (qtyDelta === 0 && oldItem) {
        const oldMtdQty = oldItem.sales_mtd || 0;
        const newMtdQty = newItem.sales_mtd || 0;
        if (newMtdQty > oldMtdQty) qtyDelta = newMtdQty - oldMtdQty;
      }

      if (omzetDelta === 0 && oldItem) {
        const oldMtdRetail = oldItem.sales_mtd_retail || 0;
        const newMtdRetail = newItem.sales_mtd_retail || 0;
        if (newMtdRetail > oldMtdRetail) omzetDelta = newMtdRetail - oldMtdRetail;
      }

      const finalDaySalesUnit   = newItem.day_sales_unit   ?? (qtyDelta   > 0 ? qtyDelta   : null);
      const finalDaySalesRetail = newItem.day_sales_retail ?? (omzetDelta > 0 ? omzetDelta : null);

      // Protect existing promo data
      const finalPromo   = existing.hargaPromo;
      const finalDiskon  = existing.diskon;
      const finalDT      = existing.discountType;
      const finalAcara   = existing.acara;
      const finalFrom    = existing.fromDate;
      const finalTo      = existing.toDate;

      rowPlaceholders.push(
        `($${paramIndex++}::text, $${paramIndex++}::double precision, $${paramIndex++}::text, $${paramIndex++}::text, $${paramIndex++}::text, $${paramIndex++}::text, $${paramIndex++}::int, $${paramIndex++}::double precision, $${paramIndex++}::int, $${paramIndex++}::double precision, $${paramIndex++}::int, $${paramIndex++}::double precision, $${paramIndex++}::int, $${paramIndex++}::double precision, $${paramIndex++}::int, $${paramIndex++}::double precision, $${paramIndex++}::int, $${paramIndex++}::int, $${paramIndex++}::double precision, $${paramIndex++}::double precision, $${paramIndex++}::text, $${paramIndex++}::text, $${paramIndex++}::text, $${paramIndex++}::text, $${paramIndex++}::text, $${paramIndex++}::text)`
      );

      values.push(
        sku,
        newItem.hargaNormal        ?? null,
        newItem.description        ?? null,
        newItem.article            ?? null,
        newItem.brand              ?? null,
        newItem.dept               ?? null,
        newItem.stok               ?? null,
        newItem.eoh_retail         ?? null,
        newItem.sales_mtd          ?? null,
        newItem.sales_mtd_retail   ?? null,
        newItem.sales_wtd          ?? null,
        newItem.sales_wtd_retail   ?? null,
        newItem.sales_ytd          ?? null,
        newItem.sales_ytd_retail   ?? null,
        newItem.boy_unit           ?? null,
        newItem.boy_retail         ?? null,
        newItem.bom_unit           ?? null,
        finalDaySalesUnit,
        finalDaySalesRetail,
        omzetDelta,
        finalPromo,
        finalDiskon,
        finalDT,
        finalAcara,
        finalFrom,
        finalTo,
      );

      // Record DailySales if there was any sale
      if (qtyDelta > 0 || omzetDelta > 0) {
        dailySalesData.push({
          productId: existing.id,
          date: uploadDate,
          qtySold: qtyDelta || 1,
          omzet: omzetDelta || 0,
        });
      }

      processedCount++;

      // Flush every 500 rows
      if (rowPlaceholders.length >= 500) {
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
            "day_sales_unit"   = COALESCE(v."day_sales_unit",   p."day_sales_unit"),
            "day_sales_retail" = COALESCE(v."day_sales_retail", p."day_sales_retail"),
            "hargaPromo"       = v."hargaPromo",
            "diskon"           = v."diskon",
            "discountType"     = v."discountType",
            "acara"            = v."acara",
            "fromDate"         = v."fromDate",
            "toDate"           = v."toDate",
            "updatedAt"        = CURRENT_TIMESTAMP
          FROM (VALUES
            ${rowPlaceholders.join(", ")}
          ) AS v("sku", "hargaNormal", "description", "article", "brand", "dept", "stok", "eoh_retail", "sales_mtd", "sales_mtd_retail", "sales_wtd", "sales_wtd_retail", "sales_ytd", "sales_ytd_retail", "boy_unit", "boy_retail", "bom_unit", "day_sales_unit", "day_sales_retail", "omzetDelta", "hargaPromo", "diskon", "discountType", "acara", "fromDate", "toDate")
          WHERE p."sku" = v."sku"
        `;
        await prisma.$executeRawUnsafe(query, ...values);
        rowPlaceholders.length = 0;
        values.length = 0;
        paramIndex = 1;
      }
    }

    // Flush remaining rows
    if (rowPlaceholders.length > 0) {
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
          "day_sales_unit"   = COALESCE(v."day_sales_unit",   p."day_sales_unit"),
          "day_sales_retail" = COALESCE(v."day_sales_retail", p."day_sales_retail"),
          "hargaPromo"       = v."hargaPromo",
          "diskon"           = v."diskon",
          "discountType"     = v."discountType",
          "acara"            = v."acara",
          "fromDate"         = v."fromDate",
          "toDate"           = v."toDate",
          "updatedAt"        = CURRENT_TIMESTAMP
        FROM (VALUES
          ${rowPlaceholders.join(", ")}
        ) AS v("sku", "hargaNormal", "description", "article", "brand", "dept", "stok", "eoh_retail", "sales_mtd", "sales_mtd_retail", "sales_wtd", "sales_wtd_retail", "sales_ytd", "sales_ytd_retail", "boy_unit", "boy_retail", "bom_unit", "day_sales_unit", "day_sales_retail", "omzetDelta", "hargaPromo", "diskon", "discountType", "acara", "fromDate", "toDate")
        WHERE p."sku" = v."sku"
      `;
      await prisma.$executeRawUnsafe(query, ...values);
    }

    // Bulk insert DailySales
    if (dailySalesData.length > 0) {
      await prisma.dailySales.createMany({
        data: dailySalesData,
        skipDuplicates: true,
      });
    }

    return NextResponse.json({
      success: true,
      message: `Re-proses selesai! ${processedCount} produk diupdate, ${dailySalesData.length} entri DailySales dibuat.`,
      oldFile: oldFile.fileName,
      newFile: newFile.fileName,
      dailySalesCount: dailySalesData.length,
      productsUpdated: processedCount,
    });

  } catch (error: any) {
    console.error("Reprocess from blob error:", error);
    return NextResponse.json({ success: false, error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
