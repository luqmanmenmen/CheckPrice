const fs = require('fs');
let file = fs.readFileSync('src/app/api/admin/sales-report/route.ts', 'utf8');

file = file.replace(/itemTotal = unitPrice \* sale\.qtySold;\n        }\n      } else {/g, `itemTotal = unitPrice * sale.qtySold;\n        }\n        if (p.discountType !== 'BXGY') {\n          itemTotal = unitPrice * sale.qtySold;\n        }\n      } else {`);

fs.writeFileSync('src/app/api/admin/sales-report/route.ts', file);
console.log("Done");
