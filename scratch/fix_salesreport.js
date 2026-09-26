const fs = require('fs');
let file = fs.readFileSync('src/app/api/admin/sales-report/route.ts', 'utf8');

// 1. Add totalOmzetPOS variable
file = file.replace(
  /let totalRevenue = 0;\r?\n\s*let totalPromoRevenue = 0;\r?\n\s*let totalQty = 0;\r?\n\s*let anomalyCount = 0;/,
  `let totalRevenue = 0;
    let totalPromoRevenue = 0;
    let totalQty = 0;
    let anomalyCount = 0;
    let totalOmzetPOS = 0; // Omzet akurat langsung dari POS (MTD_SALES_RETAIL delta)`
);

// 2. After categoryBreakdown.qty assignment, before return — add POS omzet usage
file = file.replace(
  /categoryBreakdown\[dept\]\.qty \+= sale\.qtySold;\r?\n\r?\n\s*return \{/,
  `categoryBreakdown[dept].qty += sale.qtySold;

      // Tambahkan omzet POS jika tersedia
      const posOmzet = (sale as any).omzet || 0;
      if (posOmzet > 0) {
        totalOmzetPOS += posOmzet;
        categoryBreakdown[dept].omzet = (categoryBreakdown[dept].omzet - itemTotal) + posOmzet;
      }

      return {`
);

// 3. Add omzetPOS to returned item
file = file.replace(
  /status: status,\r?\n\s*itemTotal: itemTotal,\r?\n\s*\};\r?\n\s*\}\);\r?\n\r?\n\s*\/\/ Fetch trend data/,
  `status: status,
        itemTotal: itemTotal,
        omzetPOS: (sale as any).omzet || 0,
      };
    });

    const finalTotalRevenue = totalOmzetPOS > 0 ? totalOmzetPOS : totalRevenue;

    // Fetch trend data`
);

// 4. For trend data daily loop — prefer POS omzet
file = file.replace(
  /for \(const ds of daySales\) \{\r?\n\s*const p = ds\.product;\r?\n\s*const isPromo = \(p\.hargaPromo !== null && p\.hargaPromo > 0\) \|\| p\.discountType !== null \|\| p\.diskon !== null;\r?\n\s*let itemRev = \(p\.hargaNormal \|\| 0\) \* ds\.qtySold;/g,
  `for (const ds of daySales) {
            const p = ds.product;
            const posOmzet = (ds as any).omzet || 0;
            if (posOmzet > 0) { dayRev += posOmzet; dayQty += ds.qtySold; continue; }
            const isPromo = (p.hargaPromo !== null && p.hargaPromo > 0) || p.discountType !== null || p.diskon !== null;
            let itemRev = (p.hargaNormal || 0) * ds.qtySold;`
);

// 5. For trend data monthly loop — prefer POS omzet
file = file.replace(
  /const m = monthMap\.get\(monthKey\);\r?\n\s*const p = ds\.product;\r?\n\s*const isPromo = \(p\.hargaPromo !== null && p\.hargaPromo > 0\) \|\| p\.discountType !== null \|\| p\.diskon !== null;\r?\n\s*let itemRev = \(p\.hargaNormal \|\| 0\) \* ds\.qtySold;/g,
  `const m = monthMap.get(monthKey);
        const p = ds.product;
        const posOmzet = (ds as any).omzet || 0;
        if (posOmzet > 0) { m.omzet += posOmzet; m.qty += ds.qtySold; continue; }
        const isPromo = (p.hargaPromo !== null && p.hargaPromo > 0) || p.discountType !== null || p.diskon !== null;
        let itemRev = (p.hargaNormal || 0) * ds.qtySold;`
);

// 6. Update final return to use finalTotalRevenue and add new summary fields
file = file.replace(
  /summary: \{\r?\n\s*totalRevenue,\r?\n\s*totalPromoRevenue,\r?\n\s*totalQty,\r?\n\s*anomalyCount,\r?\n\s*\},/,
  `summary: {
          totalRevenue: finalTotalRevenue !== undefined ? finalTotalRevenue : totalRevenue,
          totalPromoRevenue,
          totalQty,
          anomalyCount,
          totalOmzetPOS,
        },`
);

fs.writeFileSync('src/app/api/admin/sales-report/route.ts', file);
console.log('Done! Checking for finalTotalRevenue:');
console.log(file.includes('finalTotalRevenue') ? 'YES - finalTotalRevenue found' : 'NO - not found');
console.log(file.includes('totalOmzetPOS') ? 'YES - totalOmzetPOS found' : 'NO - not found');
console.log(file.includes('posOmzet') ? 'YES - posOmzet found' : 'NO - not found');
