const fs = require('fs');
const { parse } = require('csv-parse/sync');

function getSum(path) {
  const file = fs.readFileSync(path, 'utf8');
  const rows = parse(file, { columns: true });
  let sum = 0;
  for (const r of rows) {
    sum += parseInt(r.MTD_SALES_UNIT) || 0;
  }
  return sum;
}

console.log("PQ19 SUM:", getSum('D:\\Website\\SUKO\\PQ\\POWER QUERY 19 SEPTEMBER 2026.csv'));
console.log("PQ21 SUM:", getSum('D:\\Website\\SUKO\\PQ\\POWER QUERY 21 SEPTEMBER 2026.csv'));
console.log("PQ23 SUM:", getSum('D:\\Website\\SUKO\\PQ\\POWER QUERY 23 SEPTEMBER 2026.csv'));
console.log("PQ24 SUM:", getSum('D:\\Website\\SUKO\\PQ\\POWER QUERY 24 SEPTEMBER 2026.csv'));
