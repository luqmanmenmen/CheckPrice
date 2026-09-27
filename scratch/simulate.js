const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

const productMap = new Map();
productMap.set('13473057', { id: 2991, prevMtdRetail: 0, prevMtdQty: 0 });

const allFiles = [
  'POWER QUERY 19 SEPTEMBER 2026.csv',
  'POWER QUERY 21 SEPTEMBER 2026.csv',
  'POWER QUERY 23 SEPTEMBER 2026.csv'
];

for (const fileName of allFiles) {
  const filePath = path.join('D:\\Website\\SUKO\\PQ', fileName);
  const rawContent = fs.readFileSync(filePath, 'utf8');
  const rows = parse(rawContent, { columns: true });
  
  const row = rows.find(r => String(r.SKU || '').trim() === '13473057');
  if (row) {
    const mtd_r = parseFloat(row.MTD_SALES_RETAIL) || 0;
    const mtd_u = parseInt(row.MTD_SALES_UNIT) || 0;
    
    const existing = productMap.get('13473057');
    const qtyDelta = mtd_u > existing.prevMtdQty ? mtd_u - existing.prevMtdQty : 0;
    
    console.log(`${fileName}: mtd_u=${mtd_u}, prev=${existing.prevMtdQty}, delta=${qtyDelta}`);
    
    existing.prevMtdRetail = mtd_r;
    existing.prevMtdQty = mtd_u;
  }
}
