const fs = require('fs');
let c = fs.readFileSync('src/app/api/admin/sales-report/route.ts', 'utf8');

const replacement = `
        // [SUPER ALGORITHM V2] Smooth out initial import anomaly AND ANY missing gaps (Skipped Uploads)
        if (trendData.length > 0) {
          // Sort trend data by date ascending just to be safe
          trendData.sort((a, b) => new Date(a.fullDate).getTime() - new Date(b.fullDate).getTime());
          
          let smoothedTrendData = [];
          
          for (let k = 0; k < trendData.length; k++) {
            const currentData = trendData[k];
            const currentDate = new Date(currentData.fullDate);
            
            if (k === 0) {
              const dayOfMonth = currentDate.getDate();
              if (dayOfMonth > 1 && currentData.omzet > 0) {
                // If it's the first data point and > 100jt, assume it's MTD accumulation
                const isAnomaly = currentData.omzet > 100000000 || (trendData.length > 1 && currentData.omzet > trendData[1].omzet * 2);
                if (isAnomaly) {
                  const avgOmzet = currentData.omzet / dayOfMonth;
                  const avgQty = Math.round(currentData.qty / dayOfMonth);
                  
                  for (let i = 1; i <= dayOfMonth; i++) {
                    const dateObj = new Date(currentDate.getFullYear(), currentDate.getMonth(), i);
                    const localDateObj = new Date(dateObj.getTime() - dateObj.getTimezoneOffset() * 60000);
                    const dateStr = localDateObj.toISOString().split('T')[0];
                    const dateLabel = localDateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
                    smoothedTrendData.push({ date: dateLabel, fullDate: dateStr, omzet: avgOmzet, qty: avgQty });
                  }
                  continue; // Skip pushing currentData normally
                }
              }
              smoothedTrendData.push(currentData);
            } else {
              // Check gap with the PREVIOUS date in the LOOP, not the original array if we generated missing days.
              // But actually, we just need to compare with the last pushed date in smoothedTrendData!
              const lastPushedData = smoothedTrendData[smoothedTrendData.length - 1];
              const lastDate = new Date(lastPushedData.fullDate);
              
              const diffTime = Math.abs(currentDate.getTime() - lastDate.getTime());
              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
              
              if (diffDays > 1) {
                // There is a gap! This means the user skipped uploading PQ for some days.
                // The current data's delta actually contains the sales for ALL missing days + current day.
                // For example, if last is Sep 19, current is Sep 23, diffDays is 4.
                // We should divide the current omzet/qty by 4 and fill Sep 20, 21, 22, 23.
                const avgOmzet = currentData.omzet / diffDays;
                const avgQty = Math.round(currentData.qty / diffDays);
                
                for (let i = 1; i <= diffDays; i++) {
                  const gapDate = new Date(lastDate.getTime() + (i * 24 * 60 * 60 * 1000));
                  const localGapDate = new Date(gapDate.getTime() - gapDate.getTimezoneOffset() * 60000);
                  const dateStr = localGapDate.toISOString().split('T')[0];
                  const dateLabel = localGapDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
                  smoothedTrendData.push({ date: dateLabel, fullDate: dateStr, omzet: avgOmzet, qty: avgQty });
                }
              } else {
                smoothedTrendData.push(currentData);
              }
            }
          }
          
          trendData = smoothedTrendData;
        }`;

// Replace lines 303 to 326
const lines = c.split('\n');
lines.splice(302, 24, replacement);
c = lines.join('\n');
fs.writeFileSync('src/app/api/admin/sales-report/route.ts', c);
