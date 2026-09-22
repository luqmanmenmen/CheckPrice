/**
 * Debug script: Simulasi parsing PQ CSV langsung dari file lokal.
 * Dijalankan di Node.js untuk memverifikasi bahwa kolom terbaca dengan benar
 * SEBELUM upload ke Vercel.
 * 
 * Cara pakai: node scripts/debug-pq-parse.mjs
 */

import * as xlsx from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

const FILE_PATH = "D:\\Website\\SUKO\\PQ\\POWER QUERY 23 SEPTEMBER 2026.csv";
const TEST_SKU = "13472861";

// --- Copy dari route.ts ---
const COL_ALIASES = {
  "SKU":          ["SKU", "KODE", "KODE PRODUK", "PRODUCT CODE", "CODE", "ID"],
  "DESCRIPTION":  ["DESCRIPTION", "ITEM_DESCRIPTION", "ITEM DESCRIPTION", "NAMA", "NAMA PRODUK", "PRODUCT NAME", "DESC", "KETERANGAN", "DESKRIPSI", "ITEM_DESCRIP"],
  "HARGA NORMAL": ["HARGA NORMAL", "HARGA", "NORMAL PRICE", "PRICE", "HARGA JUAL", "REGULAR PRICE", "HARGA POKOK"],
  "HARGA PROMO":  ["HARGA PROMO", "PROMO PRICE", "PROMO", "HARGA DISKON", "DISC PRICE"],
  "ARTICLE":      ["ARTICLE", "ARTIKEL", "BARCODE", "NO ARTIKEL", "PARENT_NAME", "PARENT NAME"],
  "STOK":         ["STOK", "EOH_UNIT", "EOH UNIT", "EOH", "SISA STOK", "QTY", "STOK SISA"],
  "SALES_MTD":    ["SALES_MTD", "MTD_SALES_UNIT", "MTD SALES UNIT", "SALES MTD", "MTD", "TERJUAL", "SALES"],
  "DEPT":         ["DEPT", "DEPARTMENT", "DIVISI", "KATEGORI", "CATEGORY"],
  "BRAND":        ["BRAND", "MEREK", "MERK", "GROUP"],
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

// --- Main ---
console.log("=== DEBUG PQ PARSER ===\n");
console.log(`File: ${FILE_PATH}`);
console.log(`Target SKU: ${TEST_SKU}\n`);

if (!fs.existsSync(FILE_PATH)) {
  console.error("❌ FILE TIDAK DITEMUKAN:", FILE_PATH);
  process.exit(1);
}

const buffer = fs.readFileSync(FILE_PATH);
const workbook = xlsx.read(buffer, { type: "buffer", cellDates: false });

console.log(`Jumlah sheet: ${workbook.SheetNames.length}`);
console.log(`Nama sheet: ${workbook.SheetNames.join(", ")}\n`);

let found = false;

for (const sheetName of workbook.SheetNames) {
  const ws = workbook.Sheets[sheetName];
  const rawRows = xlsx.utils.sheet_to_json(ws, { defval: "" });
  
  if (rawRows.length === 0) {
    console.log(`[SKIP] ${sheetName} — kosong`);
    continue;
  }

  // Tampilkan header asli dari sheet ini
  const firstRowRaw = normalizeKeys(rawRows[0]);
  const firstRowRemapped = remapKeys(firstRowRaw);
  
  console.log(`--- Sheet: "${sheetName}" ---`);
  console.log(`Header asli (dari Excel): ${Object.keys(firstRowRaw).join(", ")}`);
  console.log(`Kolom setelah remapping:`);
  console.log(`  SKU             → kolom asli: ${Object.keys(firstRowRaw).find(k => COL_ALIASES.SKU.includes(k)) || "❌ TIDAK KETEMU"}`);
  console.log(`  DESCRIPTION     → kolom asli: ${Object.keys(firstRowRaw).find(k => COL_ALIASES.DESCRIPTION.includes(k)) || "❌ TIDAK KETEMU"}`);
  console.log(`  STOK (EOH_UNIT) → kolom asli: ${Object.keys(firstRowRaw).find(k => COL_ALIASES.STOK.includes(k)) || "❌ TIDAK KETEMU"}`);
  console.log(`  SALES_MTD       → kolom asli: ${Object.keys(firstRowRaw).find(k => COL_ALIASES.SALES_MTD.includes(k)) || "❌ TIDAK KETEMU"}`);
  console.log();

  // Cari SKU target
  for (const rawRow of rawRows) {
    const row = remapKeys(normalizeKeys(rawRow));
    const sku = String(row["SKU"] ?? "").trim();
    
    if (sku === TEST_SKU) {
      found = true;
      console.log(`✅ SKU ${TEST_SKU} DITEMUKAN di sheet "${sheetName}":`);
      console.log(`   Description : ${row["DESCRIPTION"]}`);
      console.log(`   STOK (EOH)  : ${row["STOK"]}`);
      console.log(`   SALES_MTD   : ${row["SALES_MTD"]}`);
      console.log(`   HARGA NORMAL: ${row["HARGA NORMAL"]}`);
      console.log(`   HARGA PROMO : ${row["HARGA PROMO"]}`);
      console.log();
      
      // Verifikasi nilai yang akan masuk DB
      const stokParsed = row["STOK"] !== undefined && row["STOK"] !== "" ? parseInt(row["STOK"]) || 0 : undefined;
      const salesParsed = row["SALES_MTD"] !== undefined && row["SALES_MTD"] !== "" ? parseInt(row["SALES_MTD"]) || 0 : undefined;
      
      console.log(`   === Yang akan masuk ke database ===`);
      console.log(`   stok (EOH_UNIT) = ${stokParsed ?? "undefined → tidak akan diupdate"}`);
      console.log(`   sales_mtd       = ${salesParsed ?? "undefined → tidak akan diupdate"}`);
      
      if (stokParsed === 33) {
        console.log(`\n✅ SUCCESS: Stok akan tersimpan sebagai 33 (sesuai PQ)`);
      } else if (stokParsed === 0) {
        console.log(`\n❌ MASALAH: Stok akan tersimpan sebagai 0! Cek kolom mapping.`);
      } else if (stokParsed === undefined) {
        console.log(`\n⚠️  WARNING: Stok undefined — kolom STOK/EOH_UNIT tidak terbaca!`);
      } else {
        console.log(`\n⚠️  INFO: Stok = ${stokParsed} (berbeda dari 33 yang diharapkan)`);
      }
      break;
    }
  }
}

if (!found) {
  console.log(`❌ SKU ${TEST_SKU} tidak ditemukan di file ini!`);
}

console.log("\n=== SELESAI ===");
