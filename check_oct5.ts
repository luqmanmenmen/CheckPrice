import * as xlsx from 'xlsx';

async function run() {
  const res = await fetch('https://5efxwburvir1yyoz.public.blob.vercel-storage.com/PQ/POWER%20QUERY%2005%20OKTOBER%202026.csv');
  const buffer = await res.arrayBuffer();
  const workbook = xlsx.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const ws = workbook.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json(ws, { defval: "", range: 1 });
  
  let totalMtdRetail = 0;
  for (const row of rows as any[]) {
    const val = row["SUM of MTD_SALES_RETAIL"] || row["MTD_SALES_RETAIL"] || row["MTD SALES RETAIL"] || row["OMZET MTD"] || 0;
    if (val) {
      const n = parseFloat(String(val).replace(/[^0-9.-]/g, ""));
      if (!isNaN(n)) totalMtdRetail += n;
    }
  }
  
  console.log("Oct 5 PQ MTD Retail:", totalMtdRetail);
}
run();
