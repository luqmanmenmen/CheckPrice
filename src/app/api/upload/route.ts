import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import * as xlsx from "xlsx";
import * as path from "path";
import * as fs from "fs";

const prisma = new PrismaClient();

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
const REQUIRED_COLS = ["SKU", "DESCRIPTION", "HARGA NORMAL"];

// Mapping fleksibel nama kolom → nama standar kita
// Agar sheet dengan variasi nama kolom tetap terbaca
const COL_ALIASES: Record<string, string[]> = {
  "SKU":          ["SKU", "KODE", "KODE PRODUK", "PRODUCT CODE", "CODE", "ID"],
  "DESCRIPTION":  ["DESCRIPTION", "NAMA", "NAMA PRODUK", "PRODUCT NAME", "DESC", "KETERANGAN", "DESKRIPSI"],
  "HARGA NORMAL": ["HARGA NORMAL", "HARGA", "NORMAL PRICE", "PRICE", "HARGA JUAL", "REGULAR PRICE", "HARGA POKOK"],
  "HARGA PROMO":  ["HARGA PROMO", "PROMO PRICE", "PROMO", "HARGA DISKON", "DISC PRICE"],
  "ARTICLE":      ["ARTICLE", "ARTIKEL", "BARCODE", "NO ARTIKEL"],
  "FROM DATE":    ["FROM DATE", "DARI TANGGAL", "START DATE", "TGL MULAI", "FROM"],
  "TO DATE":      ["TO DATE", "SAMPAI TANGGAL", "END DATE", "TGL AKHIR", "TO", "BERLAKU SAMPAI"],
  "DISKON":       ["DISKON", "DISCOUNT", "DISC", "POTONGAN"],
  "DISCOUNT TYPE":["DISCOUNT TYPE", "TIPE DISKON", "JENIS DISKON"],
  "BRAND":        ["BRAND", "MEREK", "MERK"],
  "DEPT":         ["DEPT", "DEPARTMENT", "DIVISI", "KATEGORI", "CATEGORY"],
  "ACARA":        ["ACARA", "EVENT", "PROMO NAME", "NAMA PROMO"],
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
  const article = String(row["ARTICLE"] ?? "").trim() || null;
  const description = String(row["DESCRIPTION"] ?? "").trim();
  const acara = String(row["ACARA"] ?? "").trim() || null;
  const fromDate = parseExcelDate(row["FROM DATE"]);
  const toDate = parseExcelDate(row["TO DATE"]);
  const hargaNormal = safeFloat(row["HARGA NORMAL"]);
  const rawPromo = row["HARGA PROMO"];
  // "NORMAL PRICE" string in hargaPromo column means no promo
  const hargaPromoRaw =
    typeof rawPromo === "string" && rawPromo.toUpperCase().includes("NORMAL")
      ? null
      : safeFloat(rawPromo);
  const hargaPromo = hargaPromoRaw && hargaPromoRaw > 0 ? hargaPromoRaw : null;
  const diskon = String(row["DISKON"] ?? "").trim() || null;
  const discountType = String(row["DISCOUNT TYPE"] ?? "").trim() || null;
  const brand = String(row["BRAND"] ?? "").trim() || null;
  const dept = String(row["DEPT"] ?? "").trim() || null;

  // Jika tidak ada harga promo, reset semua field promo ke null
  // Agar produk harga normal tidak menyimpan tanggal/diskon yang tidak relevan
  const hasPromo = hargaPromo !== null && hargaPromo > 0 && hargaPromo !== hargaNormal;

  return {
    sku,
    article,
    description,
    brand,
    dept,
    hargaNormal,
    hargaPromo: hasPromo ? hargaPromo : null,
    diskon: hasPromo ? diskon : null,
    discountType: hasPromo ? discountType : null,
    acara: hasPromo ? acara : null,
    fromDate: hasPromo ? fromDate : null,
    toDate: hasPromo ? toDate : null,
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
        const existingIsPromo = existing.hargaPromo !== null && existing.hargaPromo > 0;
        const newIsPromo = parsed.hargaPromo !== null && parsed.hargaPromo > 0;

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
    select: { sku: true },
  });
  const existingSkuSet = new Set(existingProducts.map((p) => p.sku));

  const itemsToCreate = [];
  const itemsToUpdate = [];

  for (const item of allItems) {
    if (existingSkuSet.has(item.sku)) {
      itemsToUpdate.push(item);
    } else {
      itemsToCreate.push(item);
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

  // 3. Update produk lama (Bulk Update via Transaction)
  // FULL SYNC: semua field promo selalu diupdate termasuk reset ke null
  // Jika di Excel baru SKU tidak ada promonya, maka promo di DB otomatis dihapus
  if (itemsToUpdate.length > 0) {
    const chunkSize = 500;
    for (let i = 0; i < itemsToUpdate.length; i += chunkSize) {
      const chunk = itemsToUpdate.slice(i, i + chunkSize);
      try {
        const updatePromises = chunk.map((item) => {
          // Cek apakah promo masih aktif (toDate belum lewat)
          let promoStillValid = false;
          if (item.hargaPromo && item.toDate) {
            const toDateObj = new Date(item.toDate);
            toDateObj.setHours(23, 59, 59, 999);
            promoStillValid = new Date() <= toDateObj;
          } else if (item.hargaPromo && !item.toDate) {
            // Ada harga promo tapi tidak ada tanggal → tetap pakai promo
            promoStillValid = true;
          }

          return prisma.product.update({
            where: { sku: item.sku },
            data: {
              // Selalu update harga normal
              hargaNormal: item.hargaNormal,
              // Update deskripsi & info produk juga
              description: item.description,
              article: item.article,
              brand: item.brand,
              dept: item.dept,
              // Promo: jika valid pakai data baru, jika tidak reset ke null
              hargaPromo: promoStillValid ? item.hargaPromo : null,
              diskon: promoStillValid ? item.diskon : null,
              discountType: promoStillValid ? item.discountType : null,
              acara: promoStillValid ? item.acara : null,
              fromDate: promoStillValid ? item.fromDate : null,
              toDate: promoStillValid ? item.toDate : null,
            },
          });
        });
        await prisma.$transaction(updatePromises);
        updated += chunk.length;
      } catch (err) {
        console.error("Bulk update error on chunk", err);
        failed += chunk.length;
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
    const formData = await request.formData();
    const files = formData.getAll("file") as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "File tidak ditemukan" }, { status: 400 });
    }

    let totalCreated = 0;
    let totalUpdated = 0;
    let totalFailed = 0;
    const allLogs: string[] = [];

    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const { productMap, sheetLog } = processWorkbook(buffer);
      allLogs.push(`--- ${file.name} ---`);
      allLogs.push(...sheetLog);

      const { created, updated, failed } = await upsertProducts(productMap);
      totalCreated += created;
      totalUpdated += updated;
      totalFailed  += failed;
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
          const existingIsPromo = existing.hargaPromo !== null && existing.hargaPromo > 0;
          const newIsPromo = item.hargaPromo !== null && item.hargaPromo > 0;
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
