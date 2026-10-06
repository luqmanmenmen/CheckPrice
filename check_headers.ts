import fs from 'fs';
import * as xlsx from 'xlsx';

async function run() {
  const res = await fetch('https://5efxwburvir1yyoz.public.blob.vercel-storage.com/PQ/POWER%20QUERY%2030%20SEPTEMBER%202026.csv');
  const buffer = await res.arrayBuffer();
  const workbook = xlsx.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const ws = workbook.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json(ws, { defval: "" });
  
  if (rows.length > 0) {
    console.log(Object.keys(rows[0]));
  }
}
run();
