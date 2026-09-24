const xlsx = require('xlsx');

const fullPath = 'D:\\Website\\SUKO\\Update Promo\\24 31 september\\PROMO 3344-SUKO ESSENTIALS WEEK39 SAS SIS 24-30SEP2026.xlsx';
const workbook = xlsx.readFile(fullPath);
const sheet = workbook.Sheets['B2G1'];
const json = xlsx.utils.sheet_to_json(sheet, { defval: "" });

const skuToFind = '52558151';
const row = json.find(r => String(r['SKU'] ?? r['ID'] ?? r['KODE'] ?? Object.values(r).join('')).includes(skuToFind));

console.log('Row Object:', row);
