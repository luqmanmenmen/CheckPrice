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
  const hargaNormal = row["HARGA NORMAL"] !== undefined ? safeFloat(row["HARGA NORMAL"]) : undefined;
  
  const rawPromo = row["HARGA PROMO"];
  let hargaPromo: number | null | undefined = undefined;
  if (rawPromo !== undefined) {
    const hargaPromoRaw = typeof rawPromo === "string" && rawPromo.toUpperCase().includes("NORMAL")
      ? null
      : safeFloat(rawPromo);
    hargaPromo = hargaPromoRaw && hargaPromoRaw > 0 ? hargaPromoRaw : null;
  }

  const diskon = row["DISKON"] !== undefined ? (String(row["DISKON"]).trim() || null) : undefined;
  const discountType = row["DISCOUNT TYPE"] !== undefined ? (String(row["DISCOUNT TYPE"]).trim() || null) : undefined;
  const brand = row["BRAND"] !== undefined ? (String(row["BRAND"]).trim() || null) : undefined;
  const dept = row["DEPT"] !== undefined ? (String(row["DEPT"]).trim() || null) : undefined;
  
  const stok = row["STOK"] !== undefined && row["STOK"] !== "" ? parseInt(row["STOK"]) || 0 : undefined;
  const sales_mtd = row["SALES_MTD"] !== undefined && row["SALES_MTD"] !== "" ? parseInt(row["SALES_MTD"]) || 0 : undefined;

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
  };
}

// -------------------------------------------------------
// Process one workbook (Buffer) → deduped product map
//   Priority rule: PROMO record wins over NORMAL PRICE for same SKU
// -------------------------------------------------------
function processWorkbook(buffer: Buffer): {
  productMap: Map<string, ReturnType<typeof parseRow>>;
  sheetLog: string[];
} {
  const workbook = xlsx.read(buffer, { type: "buffer", cellDates: false });
  const productMap = new Map<string, ReturnType<typeof parseRow>>();
  const sheetLog: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const ws = workbook.Sheets[sheetName];
    const rawRows = xlsx.utils.sheet_to_json(ws, { defval: "" }) as any[];

    if (rawRows.length === 0) {
      sheetLog.push(`[EMPTY] ${sheetName}`);
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
        // Rule: Promo price wins over Normal Price
        const existingIsPromo = existing.hargaPromo !== null && existing.hargaPromo !== undefined && existing.hargaPromo > 0;
        const newIsPromo = parsed.hargaPromo !== null && parsed.hargaPromo !== undefined && parsed.hargaPromo > 0;

        if (!existingIsPromo && newIsPromo) {
          // Replace: new has promo, old doesn't
          productMap.set(sku, parsed);
          updated++;
        }
        // else: keep existing (existing already has promo, or both are normal price)
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
  productMap: Map<string, ReturnType<typeof parseRow>>
): Promise<{ created: number; updated: number; failed: number }> {
  let created = 0;
  let updated = 0;
  let failed = 0;

  const allItems = Array.from(productMap.values());
  const allSkus = allItems.map((item) => item.sku);

  // 1. Ambil semua SKU yang sudah ada di database (Batch Query)
  const existingProducts = await prisma.product.findMany({
    where: { sku: { in: allSkus } },
    select: { id: true, sku: true, stok: true },
  });
  const existingProductMap = new Map(existingProducts.map((p) => [p.sku, p]));

  const itemsToCreate = [];
  const itemsToUpdate = [];

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
        if (item.stok !== undefined && oldStok > 0 && item.stok < oldStok) {
          salesDelta = oldStok - item.stok;
        }

        // Cek apakah promo masih aktif (toDate belum lewat)
        let finalPromo = item.hargaPromo;
        let promoStillValid = false;
        if (item.hargaPromo && item.toDate) {
          const toDateObj = new Date(item.toDate);
          toDateObj.setHours(23, 59, 59, 999);
          promoStillValid = new Date() <= toDateObj;
        } else if (item.hargaPromo && !item.toDate) {
          promoStillValid = true;
        }

        rowPlaceholders.push(`($${paramIndex++}::text, $${paramIndex++}::double precision, $${paramIndex++}::text, $${paramIndex++}::text, $${paramIndex++}::text, $${paramIndex++}::text, $${paramIndex++}::int, $${paramIndex++}::int, $${paramIndex++}::double precision, $${paramIndex++}::text, $${paramIndex++}::text, $${paramIndex++}::text, $${paramIndex++}::text, $${paramIndex++}::text)`);
        
        values.push(
          item.sku,
          item.hargaNormal !== undefined ? item.hargaNormal : null,
          item.description !== undefined ? item.description : null,
          item.article !== undefined ? item.article : null,
          item.brand !== undefined ? item.brand : null,
          item.dept !== undefined ? item.dept : null,
          item.stok !== undefined ? item.stok : null,
          salesDelta,
          promoStillValid ? finalPromo : null,
          promoStillValid ? item.diskon : null,
          promoStillValid ? item.discountType : null,
          promoStillValid ? item.acara : null,
          promoStillValid ? item.fromDate : null,
          promoStillValid ? item.toDate : null
        );

        if (salesDelta > 0) {
          dailySalesData.push({
            productId: existingInfo.id,
            date: new Date(),
            qtySold: salesDelta
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
              "stok" = COALESCE(v."stok", p."stok"),
              "sales_mtd" = p."sales_mtd" + v."salesDelta",
              "hargaPromo" = v."hargaPromo",
              "diskon" = v."diskon",
              "discountType" = v."discountType",
              "acara" = v."acara",
              "fromDate" = v."fromDate",
              "toDate" = v."toDate",
              "updatedAt" = CURRENT_TIMESTAMP
            FROM (VALUES
              ${rowPlaceholders.join(", ")}
            ) AS v("sku", "hargaNormal", "description", "article", "brand", "dept", "stok", "salesDelta", "hargaPromo", "diskon", "discountType", "acara", "fromDate", "toDate")
            WHERE p."sku" = v."sku"
          `;

          await prisma.$executeRawUnsafe(query, ...values);
          updated += rowPlaceholders.length;

          if (dailySalesData.length > 0) {
            await prisma.dailySales.createMany({
              data: dailySalesData
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

    const formData = await request.formData();
    const files = formData.getAll("file") as File[];

    const uploadType = formData.get("type") as string || "UNKNOWN";

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "File tidak ditemukan" }, { status: 400 });
    }

    let totalCreated = 0;
    let totalUpdated = 0;
    let totalFailed = 0;
    const allLogs: string[] = [];

    for (const file of files) {
      if (uploadType === "PQ_HARIAN") {
        // 1. Validasi format nama file HANYA UNTUK PQ
        const fileNameUpper = file.name.toUpperCase();
        const isValidFormat = /^POWER QUERY \d{1,2} [A-Z]+ \d{4}\.(CSV|XLSX)$/.test(fileNameUpper);
        
        if (!isValidFormat) {
          return NextResponse.json({ 
            error: `Format nama file salah: "${file.name}". Harus mengikuti format "POWER QUERY [TANGGAL] [BULAN] [TAHUN]" (contoh: POWER QUERY 19 SEPTEMBER 2026)` 
          }, { status: 400 });
        }
      }

      // 2. Validasi duplikasi upload
      const existingHistory = await prisma.syncHistory.findFirst({
        where: {
          fileName: file.name,
          status: "SUCCESS"
        }
      });

      if (existingHistory) {
        return NextResponse.json({ 
          error: `File "${file.name}" sudah pernah di-upload sukses sebelumnya. Tidak bisa meng-upload file yang sama dua kali.` 
        }, { status: 400 });
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const { productMap, sheetLog } = processWorkbook(buffer);
      allLogs.push(`--- ${file.name} ---`);
      allLogs.push(...sheetLog);

      const { created, updated, failed } = await upsertProducts(productMap);
      totalCreated += created;
      totalUpdated += updated;
      totalFailed  += failed;
      
      // Catat ke SyncHistory jika ada userId
      if (userId) {
        await prisma.syncHistory.create({
          data: {
            userId,
            type: uploadType,
            fileName: file.name,
            status: failed > 0 && created === 0 && updated === 0 ? "FAILED" : "SUCCESS",
            records: created + updated,
          }
        });
      }
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
