const fs = require('fs');
const { parse } = require('csv-parse/sync');

const p19 = fs.readFileSync('D:\\Website\\SUKO\\PQ\\POWER QUERY 19 SEPTEMBER 2026.csv', 'utf8');
const p21 = fs.readFileSync('D:\\Website\\SUKO\\PQ\\POWER QUERY 21 SEPTEMBER 2026.csv', 'utf8');

const r19 = parse(p19, { columns: true }).filter(r => parseInt(r.MTD_SALES_UNIT) > 10).slice(0, 3);
const r21 = parse(p21, { columns: true });

for (const row of r19) {
  const match = r21.find(r => r.SKU === row.SKU);
  console.log(`SKU: ${row.SKU} - PQ19: ${row.MTD_SALES_UNIT} - PQ21: ${match ? match.MTD_SALES_UNIT : 'N/A'}`);
}
