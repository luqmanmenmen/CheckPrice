import fs from 'fs';
import * as xlsx from 'xlsx';

async function run() {
  console.log("Downloading CSV...");
  const res = await fetch('https://5efxwburvir1yyoz.public.blob.vercel-storage.com/PQ/POWER%20QUERY%2030%20SEPTEMBER%202026.csv');
  const buffer = await res.arrayBuffer();
  console.log("Parsing CSV...");
  
  const workbook = xlsx.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const ws = workbook.Sheets[sheetName];
  
  const rows = xlsx.utils.sheet_to_json(ws, { defval: "" });
  
  let totalMtdRetail = 0;
  let totalMtdQty = 0;
  
  for (const row of rows as any[]) {
    const val = row["SALES_MTD_RETAIL"] || row["MTD_SALES_RETAIL"] || row["MTD SALES RETAIL"] || row["OMZET MTD"] || 0;
    const qty = row["SALES_MTD"] || row["MTD_SALES_UNIT"] || row["MTD SALES UNIT"] || row["SALES MTD"] || 0;
    
    if (val) {
      const n = parseFloat(String(val).replace(/[^0-9.-]/g, ""));
      if (!isNaN(n)) totalMtdRetail += n;
    }
    if (qty) {
      const q = parseInt(String(qty).replace(/[^0-9.-]/g, ""));
      if (!isNaN(q)) totalMtdQty += q;
    }
  }
  
  console.log("True Sept MTD Retail:", totalMtdRetail);
  console.log("True Sept MTD Qty:", totalMtdQty);
}

run().catch(console.error);
