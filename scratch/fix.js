const fs = require('fs');
let file = fs.readFileSync('src/app/api/admin/sales-report/route.ts', 'utf8');

file = file.replace(/itemTotal = unitPrice \* sale\.qtySold;\r?\n\s*}\r?\n\s*} else {/g, `itemTotal = unitPrice * sale.qtySold;
        }
        if (p.discountType !== 'BXGY') {
          itemTotal = unitPrice * sale.qtySold;
        }
      } else {`);

fs.writeFileSync('src/app/api/admin/sales-report/route.ts', file);
console.log("Done");
