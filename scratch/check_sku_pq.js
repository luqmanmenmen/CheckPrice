const fs = require('fs');
const { parse } = require('csv-parse/sync');

function checkSku(sku) {
  const p19 = fs.readFileSync('D:\\Website\\SUKO\\PQ\\POWER QUERY 19 SEPTEMBER 2026.csv', 'utf8');
  const p21 = fs.readFileSync('D:\\Website\\SUKO\\PQ\\POWER QUERY 21 SEPTEMBER 2026.csv', 'utf8');
  
  const r19 = parse(p19, { columns: true }).find(r => r.SKU === sku);
  const r21 = parse(p21, { columns: true }).find(r => r.SKU === sku);
  
  console.log('PQ19:', r19 ? r19.MTD_SALES_UNIT : 'Not found');
  console.log('PQ21:', r21 ? r21.MTD_SALES_UNIT : 'Not found');
}

checkSku('13473057');
