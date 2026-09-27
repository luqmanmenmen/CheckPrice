const fs = require('fs');
let c = fs.readFileSync('src/app/api/admin/sales-report/route.ts', 'utf8');

const regex = /if \(timeframe === "1M"\) \{[\s\S]*?\} else if \(timeframe === "1Y" \|\| timeframe === "ALL"\) \{/;

const replacement = `if (timeframe === "1M") {
      const trendDates = [...availableDates].slice(0, 31).reverse();
      if (trendDates.length > 0) {
        const startDate = new Date(\`\${trendDates[0]}T00:00:00.000Z\`);
        const endDate = new Date(\`\${trendDates[trendDates.length - 1]}T23:59:59.999Z\`);
        
        const allSales = await prisma.dailySales.findMany({
          where: { date: { gte: startDate, lte: endDate } },
          include: { product: true }
        });

        const salesByDay = new Map();
        for (const ds of allSales) {
          const day = ds.date.toISOString().split('T')[0];
          if (!salesByDay.has(day)) salesByDay.set(day, []);
          salesByDay.get(day).push(ds);
        }

        // Generate contiguous days from startDate to endDate to show 0 on missing days
        const startDay = new Date(startDate);
        const endDay = new Date(endDate);
        const contiguousDays = [];
        let curr = new Date(startDay);
        while (curr <= endDay) {
          const localCurr = new Date(curr.getTime() - curr.getTimezoneOffset() * 60000);
          contiguousDays.push(localCurr.toISOString().split('T')[0]);
          curr.setDate(curr.getDate() + 1);
        }

        for (const d of contiguousDays) {
          const daySales = salesByDay.get(d) || [];
          let dayRev = 0;
          let dayQty = 0;
          
          for (const ds of daySales) {
            const p = ds.product;
            const posOmzet = (ds as any).omzet || 0;
            if (posOmzet > 0) { dayRev += posOmzet; dayQty += ds.qtySold; continue; }
            const isPromo = (p.hargaPromo !== null && p.hargaPromo > 0) || p.discountType !== null || p.diskon !== null;
            let itemRev = (p.hargaNormal || 0) * ds.qtySold;
            
            if (isPromo) {
               if (p.discountType === 'BXGY') {
                 let b = 1, g = 1;
                 const match = p.acara ? p.acara.match(/B(\\d+)\\s*G(\\d+)/i) : null;
                 if (match) { b = parseInt(match[1]); g = parseInt(match[2]); }
                 const discountFactor = b / (b + g);
                 itemRev = (p.hargaNormal || 0) * ds.qtySold * discountFactor;
               } else if (p.hargaPromo && p.hargaPromo > 0) {
                 itemRev = p.hargaPromo * ds.qtySold;
               } else if (p.diskon && p.diskon.includes('%') && p.hargaNormal) {
                 const pct = parseFloat(p.diskon);
                 if (!isNaN(pct)) itemRev = (p.hargaNormal - (p.hargaNormal * (pct / 100))) * ds.qtySold;
               } else if (p.diskon && p.discountType === 'AMOUNT' && p.hargaNormal) {
                 const numericPart = p.diskon.replace(/\\D/g, '');
                 const amt = numericPart ? parseFloat(numericPart) : 0;
                 if (!isNaN(amt) && amt > 0) itemRev = (p.hargaNormal - amt) * ds.qtySold;
               }
            }
            dayRev += itemRev;
            dayQty += ds.qtySold;
          }
          
          const dateLabel = new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
          trendData.push({ date: dateLabel, fullDate: d, omzet: dayRev, qty: dayQty });
        }
      }
    } else if (timeframe === "1Y" || timeframe === "ALL") {`;

c = c.replace(regex, replacement);
fs.writeFileSync('src/app/api/admin/sales-report/route.ts', c);
