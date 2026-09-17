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

// Some sheets have column names with leading/trailing spaces like " HARGA NORMAL "
// Normalize a row object so all keys are trimmed
function normalizeKeys(row: any): any {
  const out: any = {};
  for (const key of Object.keys(row)) {
    out[key.trim()] = row[key];
  }
  return out;
}

function sheetHasRequiredCols(normalizedRow: any): boolean {
  return REQUIRED_COLS.every((col) => col in normalizedRow);
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

    // Normalize ALL rows to trim whitespace from column names
    const rows = rawRows.map(normalizeKeys);

    const firstRow = rows[0];
    if (!sheetHasRequiredCols(firstRow)) {
      const foundKeys = Object.keys(firstRow).slice(0, 6).join(", ");
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

  for (const [, item] of productMap) {
    try {
      // Pre-check: does this SKU already exist in DB?
      const existing = await prisma.product.findUnique({ where: { sku: item.sku }, select: { id: true } });

      if (existing) {
        // SKU sudah ada → hanya update harga & info promo
        await prisma.product.update({
          where: { sku: item.sku },
          data: {
            hargaNormal:  item.hargaNormal,
            hargaPromo:   item.hargaPromo,
            diskon:       item.diskon,
            discountType: item.discountType,
            acara:        item.acara,
            fromDate:     item.fromDate,
            toDate:       item.toDate,
          },
        });
        updated++;
      } else {
        // SKU baru → tambahkan semua data
        await prisma.product.create({ data: { ...item } });
        created++;
      }
    } catch (err) {
      console.error("Upsert error SKU", item.sku, err);
      failed++;
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
