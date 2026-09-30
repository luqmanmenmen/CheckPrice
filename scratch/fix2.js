const fs = require('fs');
const file = 'src/app/api/upload/chunk/route.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  /const oldMtdRetail = \(existingInfo as any\).sales_mtd_retail \|\| 0;\s*const newMtdRetail = item.sales_mtd_retail !== undefined \? item.sales_mtd_retail : 0;\s*const omzetDelta = newMtdRetail > oldMtdRetail \? newMtdRetail - oldMtdRetail : 0;\s*\/\/\s*Hitung delta QTY \(sales_mtd\)\s*const oldMtdQty = \(existingInfo as any\).sales_mtd \|\| 0;\s*const newMtdQty = item.sales_mtd !== undefined && item.sales_mtd !== null \? item.sales_mtd : 0;\s*const qtyDelta = newMtdQty > oldMtdQty \? newMtdQty - oldMtdQty : 0;/,
  `// Hitung delta omzet MTD retail (untuk dailySales.omzet)
        const oldMtdRetail = (existingInfo as any).sales_mtd_retail || 0;
        let newMtdRetail = item.sales_mtd_retail !== undefined && item.sales_mtd_retail !== null ? item.sales_mtd_retail : 0;
        if (newMtdRetail < oldMtdRetail) {
          newMtdRetail = oldMtdRetail;
          item.sales_mtd_retail = oldMtdRetail;
        }
        const omzetDelta = newMtdRetail > oldMtdRetail ? newMtdRetail - oldMtdRetail : 0;

        // Hitung delta QTY (sales_mtd)
        const oldMtdQty = (existingInfo as any).sales_mtd || 0;
        let newMtdQty = item.sales_mtd !== undefined && item.sales_mtd !== null ? item.sales_mtd : 0;
        if (newMtdQty < oldMtdQty) {
          newMtdQty = oldMtdQty;
          item.sales_mtd = oldMtdQty;
        }
        
        let qtyDelta = newMtdQty > oldMtdQty ? newMtdQty - oldMtdQty : 0;
        
        if (qtyDelta === 0 && item.day_sales_unit && item.day_sales_unit > 0) {
           qtyDelta = item.day_sales_unit;
        }`
);

code = code.replace(
  /rowPlaceholders\.push\(`\(\\\$\\\$\{paramIndex\+\+\}::text,\s*\\\$\\\$\{paramIndex\+\+\}::double precision,\s*\\\$\\\$\{paramIndex\+\+\}::text,\s*\\\$\\\$\{paramIndex\+\+\}::text,\s*\\\$\\\$\{paramIndex\+\+\}::text,\s*\\\$\\\$\{paramIndex\+\+\}::text,\s*\\\$\\\$\{paramIndex\+\+\}::int,\s*\\\$\\\$\{paramIndex\+\+\}::double precision,\s*\\\$\\\$\{paramIndex\+\+\}::int,\s*\\\$\\\$\{paramIndex\+\+\}::double precision,\s*\\\$\\\$\{paramIndex\+\+\}::int,\s*\\\$\\\$\{paramIndex\+\+\}::double precision,\s*\\\$\\\$\{paramIndex\+\+\}::int,\s*\\\$\\\$\{paramIndex\+\+\}::double precision,\s*\\\$\\\$\{paramIndex\+\+\}::int,\s*\\\$\\\$\{paramIndex\+\+\}::double precision,\s*\\\$\\\$\{paramIndex\+\+\}::double precision,\s*\\\$\\\$\{paramIndex\+\+\}::double precision,\s*\\\$\\\$\{paramIndex\+\+\}::text,\s*\\\$\\\$\{paramIndex\+\+\}::text,\s*\\\$\\\$\{paramIndex\+\+\}::text,\s*\\\$\\\$\{paramIndex\+\+\}::text,\s*\\\$\\\$\{paramIndex\+\+\}::text,\s*\\\$\\\$\{paramIndex\+\+\}::text\)`\);/g,
  `rowPlaceholders.push(\`(\$\${paramIndex++}::text, \$\${paramIndex++}::double precision, \$\${paramIndex++}::text, \$\${paramIndex++}::text, \$\${paramIndex++}::text, \$\${paramIndex++}::text, \$\${paramIndex++}::int, \$\${paramIndex++}::double precision, \$\${paramIndex++}::int, \$\${paramIndex++}::double precision, \$\${paramIndex++}::int, \$\${paramIndex++}::double precision, \$\${paramIndex++}::int, \$\${paramIndex++}::double precision, \$\${paramIndex++}::int, \$\${paramIndex++}::double precision, \$\${paramIndex++}::int, \$\${paramIndex++}::int, \$\${paramIndex++}::double precision, \$\${paramIndex++}::double precision, \$\${paramIndex++}::double precision, \$\${paramIndex++}::text, \$\${paramIndex++}::text, \$\${paramIndex++}::text, \$\${paramIndex++}::text, \$\${paramIndex++}::text, \$\${paramIndex++}::text)\`);`
);

code = code.replace(
  /omzetDelta,\s*finalPromoToSave,/g,
  `item.bom_unit           !== undefined ? item.bom_unit           : null,
          item.day_sales_unit     !== undefined ? item.day_sales_unit     : null,
          item.day_sales_retail   !== undefined ? item.day_sales_retail   : null,
          omzetDelta,
          finalPromoToSave,`
);

code = code.replace(
  /omzet:\s*omzetDelta\s*,/g,
  `omzet: omzetDelta > 0 ? omzetDelta : (item.day_sales_retail || 0)`
);

code = code.replace(
  /"boy_retail"\s*=\s*COALESCE\(v\."boy_retail",\s*p\."boy_retail"\),/g,
  `"boy_retail"       = COALESCE(v."boy_retail",       p."boy_retail"),
              "bom_unit"         = COALESCE(v."bom_unit",         p."bom_unit"),
              "day_sales_unit"   = COALESCE(v."day_sales_unit",   p."day_sales_unit"),
              "day_sales_retail" = COALESCE(v."day_sales_retail", p."day_sales_retail"),`
);

code = code.replace(
  /AS v\("sku", "hargaNormal", "description", "article", "brand", "dept", "stok", "eoh_retail", "sales_mtd", "sales_mtd_retail", "sales_wtd", "sales_wtd_retail", "sales_ytd", "sales_ytd_retail", "boy_unit", "boy_retail", "omzetDelta", "hargaPromo", "diskon", "discountType", "acara", "fromDate", "toDate", "promoFileName"\)/g,
  `AS v("sku", "hargaNormal", "description", "article", "brand", "dept", "stok", "eoh_retail", "sales_mtd", "sales_mtd_retail", "sales_wtd", "sales_wtd_retail", "sales_ytd", "sales_ytd_retail", "boy_unit", "boy_retail", "bom_unit", "day_sales_unit", "day_sales_retail", "omzetDelta", "hargaPromo", "diskon", "discountType", "acara", "fromDate", "toDate", "promoFileName")`
);

fs.writeFileSync(file, code);
console.log('Fixed api/upload/chunk/route.ts');
