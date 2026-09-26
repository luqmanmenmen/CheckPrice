const fs = require('fs');
let file = fs.readFileSync('src/app/api/admin/sales-report/route.ts', 'utf8');

file = file.replace(/const amt = parseFloat\(p\.diskon\.replace\(\/\\D\/g, ''\)\);/g, `const numericPart = p.diskon.replace(/\\D/g, '');\n          const amt = numericPart ? parseFloat(numericPart) : 0;`);

fs.writeFileSync('src/app/api/admin/sales-report/route.ts', file);
console.log("Done");
