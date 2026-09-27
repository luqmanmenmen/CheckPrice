const fs = require('fs');
let c = fs.readFileSync('src/app/api/admin/sales-report/route.ts', 'utf8');
const r = `        }

        // [SUPER ALGORITHM] Smooth out initial import anomaly (MTD accumulation)
        if (trendData.length > 0) {
          const firstData = trendData[0];
          const firstDate = new Date(firstData.fullDate);
          const dayOfMonth = firstDate.getDate();
          if (dayOfMonth > 1 && firstData.omzet > 0) {
            const isAnomaly = firstData.omzet > 100000000 || (trendData.length > 1 && firstData.omzet > trendData[1].omzet * 2);
            if (isAnomaly) {
              const avgOmzet = firstData.omzet / dayOfMonth;
              const avgQty = Math.round(firstData.qty / dayOfMonth);
              const smoothedData = [];
              for (let i = 1; i <= dayOfMonth; i++) {
                const dateObj = new Date(firstDate.getFullYear(), firstDate.getMonth(), i);
                const localDateObj = new Date(dateObj.getTime() - dateObj.getTimezoneOffset() * 60000);
                const dateStr = localDateObj.toISOString().split('T')[0];
                const dateLabel = localDateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
                smoothedData.push({ date: dateLabel, fullDate: dateStr, omzet: avgOmzet, qty: avgQty });
              }
              trendData.shift();
              trendData = [...smoothedData, ...trendData];
            }
          }
        }
      }
    } else if (timeframe === "1Y" || timeframe === "ALL") {`;

// Handle possible \r\n vs \n differences
const regexTarget = new RegExp('}\\s*}\\s*} else if \\(timeframe === "1Y" \\|\\| timeframe === "ALL"\\) \\{', 'm');
c = c.replace(regexTarget, r);
fs.writeFileSync('src/app/api/admin/sales-report/route.ts', c);
