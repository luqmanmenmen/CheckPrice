const fs = require('fs');
let file = fs.readFileSync('src/app/api/upload/chunk/route.ts', 'utf8');

file = file.replace(/if\s*\(salesDelta\s*>\s*0\)\s*\{\s*dailySalesData\.push\(\{\s*productId:\s*existingInfo\.id,\s*date:\s*uploadDate,\s*qtySold:\s*salesDelta\s*\}\);\s*\}/g, `const qtyToRecord = item.sales_mtd !== undefined && item.sales_mtd !== null ? item.sales_mtd : salesDelta;
        if (qtyToRecord !== 0) {
          dailySalesData.push({
            productId: existingInfo.id,
            date: uploadDate,
            qtySold: qtyToRecord
          });
        }`);

fs.writeFileSync('src/app/api/upload/chunk/route.ts', file);
console.log("Done uploading fix");
