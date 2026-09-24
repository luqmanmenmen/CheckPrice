const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const dir = 'D:\\Website\\SUKO\\Update Promo\\24 31 september';
const skusToFind = ['52558151', '57854321'];

console.log(`Searching for SKUs ${skusToFind.join(', ')} in ${dir}...`);

function searchInDir(directory) {
  const files = fs.readdirSync(directory);
  for (const file of files) {
    const fullPath = path.join(directory, file);
    if (fs.statSync(fullPath).isDirectory()) {
      searchInDir(fullPath);
    } else if (file.endsWith('.xlsx')) {
      try {
        const workbook = xlsx.readFile(fullPath);
        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          const json = xlsx.utils.sheet_to_json(sheet, { header: 1, raw: false });
          
          for (let i = 0; i < json.length; i++) {
            const row = json[i];
            const rowStr = JSON.stringify(row);
            for (const sku of skusToFind) {
              if (rowStr.includes(sku)) {
                console.log(`FOUND SKU ${sku} in file: ${file}, Sheet: ${sheetName}, Row: ${i + 1}`);
                console.log(`Row Data:`, row);
              }
            }
          }
        }
      } catch (e) {
        console.error(`Error reading ${file}: ${e.message}`);
      }
    }
  }
}

searchInDir(dir);
console.log('Search complete.');
