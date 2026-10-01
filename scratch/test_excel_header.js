const xlsx = require("xlsx");

// Create a dummy workbook simulating the PQ file
const wsData = [
  ["DATA_AS_OF", "9/28/2026"], // Row 0
  [], // Row 1
  [], // Row 2
  ["GROUP", "DEPARTMENT", "SKU", "ITEM_DESCRIPTION", "STOK", "HARGA NORMAL"], // Row 3 (Header)
  ["CHILDREN", "SUKO", "12345", "T-SHIRT", "10", "50000"] // Row 4 (Data)
];

const ws = xlsx.utils.aoa_to_sheet(wsData);

const findHeaderRowIndex = (ws) => {
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: "" });
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

const headerIdx = findHeaderRowIndex(ws);
console.log("Found header at index:", headerIdx);

const rawRows = xlsx.utils.sheet_to_json(ws, { range: headerIdx, defval: "" });
console.log("Parsed rows:", rawRows);
