import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // Auto-clean expired promos
    const todayStr = new Date().toISOString().split('T')[0];
    await prisma.product.updateMany({
      where: {
        toDate: { not: null, lt: todayStr },
        OR: [{ hargaPromo: { not: null } }, { diskon: { not: null } }]
      },
      data: {
        hargaPromo: null, diskon: null, discountType: null, acara: null, fromDate: null, toDate: null
      }
    });

    const { searchParams } = new URL(request.url);
    const timeframe = searchParams.get("timeframe") || "1M";
    const deptFilter = searchParams.get("dept") || "";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "99999");
    const skip = (page - 1) * limit;

    // ============================================================
    // SUMBER DATA UTAMA: Product table langsung dari PQ upload
    // Grand total sudah tersedia di PQ: MTD, YTD, EOH, DAY_SALES
    // ============================================================

    // Extract all sync history dates for the dropdown
    const allPqSyncs = await prisma.syncHistory.findMany({
      where: { type: "PQ_HARIAN", status: "SUCCESS" },
      orderBy: { createdAt: "desc" },
      select: { fileName: true, createdAt: true, id: true }
    });

    const MONTHS: Record<string, string> = {
      JANUARI:'01', JANUARY:'01', FEBRUARI:'02', FEBRUARY:'02', MARET:'03', MARCH:'03', APRIL:'04',
      MEI:'05', MAY:'05', JUNI:'06', JUNE:'06', JULI:'07', JULY:'07', AGUSTUS:'08', AUGUST:'08',
      SEPTEMBER:'09', OKTOBER:'10', OCTOBER:'10', NOVEMBER:'11', DESEMBER:'12', DECEMBER:'12'
    };

    const parsedSyncs = allPqSyncs.map(sync => {
      let dateLabel = new Date(sync.createdAt).toISOString().split('T')[0];
      const match = sync.fileName.match(/(\d{1,2})\s+([A-Z]+)\s+(\d{4})/i);
      if (match) {
        const m = MONTHS[match[2].toUpperCase()] || '01';
        dateLabel = `${match[3]}-${m}-${match[1].padStart(2,'0')}`;
      }
      return {
        date: dateLabel,
        createdAt: sync.createdAt,
        fileName: sync.fileName
      };
    });

    // Build options based on timeframe
    let availableDates: string[] = [];
    let availableSyncs: any[] = [];
    
    if (timeframe === "1Y") {
      const uniqueYearsMap = new Map();
      for (const sync of parsedSyncs) {
        const year = sync.date.substring(0, 4);
        if (!uniqueYearsMap.has(year)) uniqueYearsMap.set(year, sync);
      }
      availableSyncs = Array.from(uniqueYearsMap.values());
      availableDates = availableSyncs.map(s => s.date.substring(0, 4));
    } else if (timeframe === "1M") {
      const uniqueMonthsMap = new Map();
      for (const sync of parsedSyncs) {
        const yearMonth = sync.date.substring(0, 7);
        if (!uniqueMonthsMap.has(yearMonth)) uniqueMonthsMap.set(yearMonth, sync);
      }
      availableSyncs = Array.from(uniqueMonthsMap.values());
      availableDates = availableSyncs.map(s => s.date.substring(0, 7));
    } else {
      const uniqueDaysMap = new Map();
      for (const sync of parsedSyncs) {
        const day = sync.date;
        if (!uniqueDaysMap.has(day)) uniqueDaysMap.set(day, sync);
      }
      availableSyncs = Array.from(uniqueDaysMap.values());
      availableDates = availableSyncs.map(s => s.date);
    }

    const targetDateParam = searchParams.get("date");
    let targetDateValue = availableDates.length > 0 ? availableDates[0] : (
      timeframe === '1Y' ? todayStr.substring(0,4) :
      timeframe === '1M' ? todayStr.substring(0,7) :
      todayStr
    );
    let selectedSync = availableSyncs.length > 0 ? availableSyncs[0] : null;

    if (targetDateParam && targetDateParam !== "") {
      const found = availableSyncs.find(s => {
        if (timeframe === '1Y') return s.date.substring(0,4) === targetDateParam.substring(0,4);
        if (timeframe === '1M') return s.date.substring(0,7) === targetDateParam.substring(0,7);
        return s.date === targetDateParam;
      });
      if (found) {
        selectedSync = found;
        if (timeframe === '1Y') targetDateValue = targetDateParam.substring(0,4);
        else if (timeframe === '1M') targetDateValue = targetDateParam.substring(0,7);
        else targetDateValue = targetDateParam;
      }
    }

    let pqDateLabel = targetDateValue; 
    const pqUploadTime = selectedSync?.createdAt
      ? new Date(selectedSync.createdAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
      : '-';

    let mtdMonthObj = new Date();
    if (timeframe === '1Y') {
      mtdMonthObj = new Date(parseInt(targetDateValue), 11, 31);
    } else if (timeframe === '1M') {
      const [y, m] = targetDateValue.split('-');
      mtdMonthObj = new Date(parseInt(y), parseInt(m) - 1, 1);
    } else {
      mtdMonthObj = new Date(targetDateValue);
    }
    const startOfMonth = new Date(mtdMonthObj.getFullYear(), mtdMonthObj.getMonth(), 1);
    const endOfMonth = new Date(mtdMonthObj.getFullYear(), mtdMonthObj.getMonth() + 1, 0, 23, 59, 59, 999);

    let startDateObj: Date;
    let endDateObj: Date;

    if (timeframe === '1Y') {
      const y = parseInt(targetDateValue);
      startDateObj = new Date(y, 0, 1);
      endDateObj = new Date(y, 11, 31, 23, 59, 59, 999);
    } else if (timeframe === '1M') {
      const [y, m] = targetDateValue.split('-');
      startDateObj = new Date(parseInt(y), parseInt(m) - 1, 1);
      endDateObj = new Date(parseInt(y), parseInt(m), 0, 23, 59, 59, 999);
    } else if (timeframe === '1W') {
      const targetDate = new Date(targetDateValue);
      endDateObj = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59, 999);
      startDateObj = new Date(endDateObj);
      startDateObj.setDate(startDateObj.getDate() - 6);
      startDateObj.setHours(0, 0, 0, 0);
    } else { // 1D
      const targetDate = new Date(targetDateValue);
      startDateObj = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 0, 0, 0, 0);
      endDateObj = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59, 999);
    }

    const targetYearMonth = mtdMonthObj.toISOString().substring(0, 7);

    // 1. SUMMARY CARDS
    const agg = await prisma.product.aggregate({
      _sum: {
        sales_mtd:        true,
        sales_mtd_retail: true,
        sales_ytd:        true,
        sales_ytd_retail: true,
        eoh_retail:       true,
        stok:             true,
      }
    });

    let selectedDateOmzet = 0;
    let selectedDateQty = 0;
    let calculatedMtdOmzet = 0;
    let calculatedMtdQty = 0;

    const mtdAgg = await prisma.dailySales.aggregate({
      where: { date: { gte: startOfMonth, lte: endOfMonth } },
      _sum: { omzet: true, qtySold: true }
    });
    calculatedMtdOmzet = mtdAgg._sum.omzet || 0;
    calculatedMtdQty = mtdAgg._sum.qtySold || 0;

    const tfAgg = await prisma.dailySales.aggregate({
      where: { date: { gte: startDateObj, lte: endDateObj } },
      _sum: { omzet: true, qtySold: true }
    });
    selectedDateOmzet = tfAgg._sum.omzet || 0;
    selectedDateQty = tfAgg._sum.qtySold || 0;

    const [totalProducts, totalWithPromo] = await Promise.all([
      prisma.product.count(),
      prisma.product.count({
        where: { OR: [{ hargaPromo: { not: null } }, { diskon: { not: null } }] }
      })
    ]);

    // Hitung omzet promo & Siapkan Report Items dari DailySales
    let omzetPromo = 0;
    let qtyPromo = 0;
    const items = [];
    let anomalyCount = 0;

    if (selectedSync) {
      const dsAgg = await prisma.dailySales.groupBy({
        by: ['productId'],
        where: { date: { gte: startOfMonth, lte: endOfMonth } },
        _sum: { qtySold: true, omzet: true }
      });
      
      const productIds = dsAgg.map((a: any) => a.productId);
      const dsProducts = await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: {
          id: true, sku: true, description: true,
          hargaNormal: true, hargaPromo: true, diskon: true, discountType: true
        }
      });

      for (const d of dsAgg) {
        const p = dsProducts.find((x: any) => x.id === d.productId);
        if (!p) continue;
        
        const qty = d._sum.qtySold || 0;
        const total = d._sum.omzet || 0;
        
        let unitPrice = p.hargaNormal || 0;
        let isPromo = false;
        let status = 'NORMAL';

        if ((p.hargaPromo && p.hargaPromo > 0) || (p.diskon && p.diskon !== '0' && p.diskon !== '' && p.diskon !== 'NORMAL')) {
          isPromo = true;
          status = 'PROMO';
          unitPrice = p.hargaPromo || p.hargaNormal;
          qtyPromo += qty;
          omzetPromo += total; // Use actual total from PQ for accuracy
        }
        
        if (unitPrice === 0) {
          status = 'NO_PRICE';
          anomalyCount++;
        }

        items.push({
          id: p.id.toString(), // Use product ID instead of dailySales ID to avoid duplicates
          sku: p.sku,
          description: p.description,
          qtySold: qty,
          hargaNormal: p.hargaNormal,
          hargaPromo: p.hargaPromo,
          unitPrice,
          status,
          itemTotal: total
        });
      }
      
      // Sort items by total desc
      items.sort((a, b) => b.itemTotal - a.itemTotal);
    } else {
      // Fallback for current day if no history (legacy logic)
      const promoProducts = await prisma.product.findMany({
        where: {
          day_sales_unit: { gt: 0 },
        },
        select: {
          id: true,
          sku: true,
          description: true,
          day_sales_unit: true,
          day_sales_retail: true,
          hargaPromo: true,
          hargaNormal: true,
          diskon: true,
          discountType: true,
        }
      });

      for (const p of promoProducts) {
        const qty = p.day_sales_unit || 0;
        const total = p.day_sales_retail || 0;
        let unitPrice = p.hargaNormal || 0;
        let isPromo = false;
        let status = 'NORMAL';

        if ((p.hargaPromo && p.hargaPromo > 0) || (p.diskon && p.diskon !== '0' && p.diskon !== '' && p.diskon !== 'NORMAL')) {
          isPromo = true;
          status = 'PROMO';
          unitPrice = p.hargaPromo || p.hargaNormal;
          qtyPromo += qty;
          omzetPromo += total;
        }

        if (unitPrice === 0) {
          status = 'NO_PRICE';
          anomalyCount++;
        }

        items.push({
          id: p.id,
          sku: p.sku,
          description: p.description,
          qtySold: qty,
          hargaNormal: p.hargaNormal,
          hargaPromo: p.hargaPromo,
          unitPrice,
          status,
          itemTotal: total
        });
      }
    }

    // 2. CATEGORY BREAKDOWN per Department (MTD)
    // Akan lebih akurat jika ini juga dari DailySales, 
    // tetapi untuk sekarang kita pakai default query dan fallback ke DailySales jika perlu.
    // Jika ganti bulan, product.sales_mtd_retail mungkin masih data bulan lalu
    // Kita overwrite omzet MTD department jika total calculatedMtdOmzet beda signifikan
    const deptBreakdown = await prisma.product.groupBy({
      by: ['dept'],
      _sum: {
        sales_mtd_retail: true,
        sales_mtd:        true,
        stok:             true,
        eoh_retail:       true,
        day_sales_retail: true,
        day_sales_unit:   true,
      },
      orderBy: { _sum: { sales_mtd_retail: 'desc' } },
    });

    const categoryBreakdown: any = {};
    
    // Periksa apakah ganti bulan terjadi (calculatedMtdOmzet jauh lebih kecil dari total sales_mtd_retail)
    const isNewMonth = calculatedMtdOmzet < (agg._sum.sales_mtd_retail || 0) * 0.5;

    if (isNewMonth) {
      // Ambil breakdown department murni dari DailySales untuk bulan berjalan
      const mtdDeptSales = await prisma.dailySales.findMany({
        where: {
          date: { gte: startOfMonth, lte: endOfMonth }
        },
        include: { product: { select: { dept: true } } }
      });
      
      const deptMtdMap = new Map();
      mtdDeptSales.forEach(ds => {
        const dept = ds.product.dept || 'LAINNYA';
        if (!deptMtdMap.has(dept)) deptMtdMap.set(dept, { omzet: 0, qty: 0 });
        const val = deptMtdMap.get(dept);
        val.omzet += ds.omzet || 0;
        val.qty += ds.qtySold || 0;
      });
      
      deptBreakdown.forEach((d) => {
        const deptName = d.dept || 'LAINNYA';
        const mtdValues = deptMtdMap.get(deptName) || { omzet: 0, qty: 0 };
        categoryBreakdown[deptName] = {
          omzet:           mtdValues.omzet,
          qty:             mtdValues.qty,
          omzet_hari_ini:  d._sum.day_sales_retail   || 0,
          qty_hari_ini:    d._sum.day_sales_unit      || 0,
          stok:            d._sum.stok                || 0,
          eoh:             d._sum.eoh_retail          || 0,
        };
      });
    } else {
      deptBreakdown.forEach((d) => {
        const deptName = d.dept || 'LAINNYA';
        categoryBreakdown[deptName] = {
          omzet:           d._sum.sales_mtd_retail  || 0,
          qty:             d._sum.sales_mtd          || 0,
          omzet_hari_ini:  d._sum.day_sales_retail   || 0,
          qty_hari_ini:    d._sum.day_sales_unit      || 0,
          stok:            d._sum.stok                || 0,
          eoh:             d._sum.eoh_retail          || 0,
        };
      });
    }

    // 3. TOP FAST MOVE (Dinamis berdasarkan timeframe)
    let topFast: any[] = [];
    try {
      if (timeframe === '1D') {
        const startDate = selectedSync ? new Date(selectedSync.date) : new Date();
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(startDate);
        endDate.setHours(23, 59, 59, 999);
        
        const dailyAgg = await prisma.dailySales.groupBy({
          by: ['productId'],
          where: { date: { gte: startDate, lte: endDate } },
          _sum: { qtySold: true, omzet: true },
          orderBy: { _sum: { qtySold: 'desc' } },
          take: 10
        });
        
        const productIds = dailyAgg.map((a: any) => a.productId);
        const topFastProducts = await prisma.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, sku: true, description: true }
        });
        
        topFast = dailyAgg.map((agg: any) => {
          const p = topFastProducts.find((x: any) => x.id === agg.productId);
          return {
            sku: p?.sku || '-',
            description: p?.description || '-',
            sales_qty: agg._sum.qtySold || 0,
            omzet_total: agg._sum.omzet || 0
          };
        });
      } else {
        if (isNewMonth && timeframe === '1M') {
           // Gunakan DailySales
           const mtdAgg = await prisma.dailySales.groupBy({
             by: ['productId'],
             where: { date: { gte: startOfMonth, lte: endOfMonth } },
             _sum: { qtySold: true, omzet: true },
             orderBy: { _sum: { qtySold: 'desc' } },
             take: 10
           });
           
           const productIds = mtdAgg.map((a: any) => a.productId);
           const topFastProducts = await prisma.product.findMany({
             where: { id: { in: productIds } },
             select: { id: true, sku: true, description: true }
           });
           
           topFast = mtdAgg.map((agg: any) => {
             const p = topFastProducts.find((x: any) => x.id === agg.productId);
             return {
               sku: p?.sku || '-',
               description: p?.description || '-',
               sales_qty: agg._sum.qtySold || 0,
               omzet_total: agg._sum.omzet || 0
             };
           });
        } else {
          let qtyCol = 'sales_mtd';
          let omzetCol = 'sales_mtd_retail';
          
          if (timeframe === '1W') {
            qtyCol = 'sales_wtd';
            omzetCol = 'sales_wtd_retail';
          } else if (timeframe === '1Y') {
            qtyCol = 'sales_ytd';
            omzetCol = 'sales_ytd_retail';
          }

          const fastWhere: any = { [qtyCol]: { gt: 0 } };
          if (deptFilter) fastWhere.dept = deptFilter;

          const topFastProducts = await prisma.product.findMany({
            where: fastWhere,
            orderBy: [{ [qtyCol]: 'desc' }, { [omzetCol]: 'desc' }],
            take: 10,
            select: {
              sku: true, description: true,
              sales_wtd: true, sales_wtd_retail: true,
              sales_mtd: true, sales_mtd_retail: true,
              sales_ytd: true, sales_ytd_retail: true
            }
          });
          topFast = topFastProducts.map((p: any) => ({
            sku: p.sku,
            description: p.description,
            sales_qty: p[qtyCol],
            omzet_total: p[omzetCol]
          }));
        }
      }
    } catch (e) {
      console.error("Failed to compute topFast dynamic:", e);
    }

    // 4. SLOW MOVE
    const slowWhere: any = deptFilter
      ? { dept: deptFilter, stok: { gt: 5 }, sales_mtd: { lte: 2 } }
      : { stok: { gt: 5 }, sales_mtd: { lte: 2 } };
    const topSlow = await prisma.product.findMany({
      where: slowWhere,
      orderBy: [{ stok: 'desc' }, { sales_mtd: 'asc' }],
      take: 20,
      select: {
        sku: true, description: true, article: true, dept: true, brand: true,
        hargaNormal: true, hargaPromo: true, diskon: true,
        stok: true, sales_mtd: true, sales_mtd_retail: true,
        sales_ytd: true, eoh_retail: true, bom_unit: true,
      }
    });

    // 5. KRITIS (laku tapi stok menipis)
    const kritisWhere: any = deptFilter
      ? { dept: deptFilter, sales_mtd: { gte: 3 }, stok: { gte: 0, lte: 5 } }
      : { sales_mtd: { gte: 3 }, stok: { gte: 0, lte: 5 } };
    const topKritis = await prisma.product.findMany({
      where: kritisWhere,
      orderBy: [{ stok: 'asc' }, { sales_mtd: 'desc' }],
      take: 20,
      select: {
        sku: true, description: true, article: true, dept: true,
        hargaNormal: true, hargaPromo: true,
        stok: true, sales_mtd: true, sales_mtd_retail: true, day_sales_unit: true,
      }
    });

    // 6. TREND DATA - dari DailySales jika ada, fallback ke 1 titik MTD dari PQ
    let trendData: any[] = [];
    try {
      const targetDate = selectedSync ? new Date(selectedSync.date) : new Date();
      
      let startDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
      let endDate = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0, 23, 59, 59, 999);

      if (timeframe === '1W' || timeframe === '1D') {
        // For 1D, just show the last 7 days leading up to the selected date as the trend context
        startDate = new Date(targetDate);
        startDate.setDate(startDate.getDate() - 6);
        startDate.setHours(0, 0, 0, 0);
      } else if (timeframe === '1Y') {
        startDate = new Date(targetDate.getFullYear(), 0, 1);
        endDate = new Date(targetDate.getFullYear(), 11, 31, 23, 59, 59, 999);
      }

      const salesByDay = await prisma.dailySales.groupBy({
        by: ['date'],
        where: { date: { gte: startDate, lte: endDate } },
        _sum: { qtySold: true, omzet: true },
        orderBy: { date: 'asc' },
      });

      if (timeframe === '1Y') {
        const monthMap = new Map();
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
        for (const d of salesByDay) {
          const mIdx = d.date.getMonth();
          const mName = months[mIdx];
          if (!monthMap.has(mName)) monthMap.set(mName, { date: mName, fullDate: `${targetDate.getFullYear()}-${String(mIdx+1).padStart(2,'0')}-01`, omzet: 0, qty: 0 });
          const item = monthMap.get(mName);
          item.omzet += d._sum.omzet || 0;
          item.qty += d._sum.qtySold || 0;
        }
        trendData = Array.from(monthMap.values());
      } else {
        trendData = salesByDay.map(d => ({
          date:  new Date(d.date.getTime() - d.date.getTimezoneOffset() * 60000).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }),
          fullDate: d.date.toISOString().split('T')[0],
          omzet: d._sum.omzet    || 0,
          qty:   d._sum.qtySold  || 0,
        }));
      }
    } catch (_e) { /* DailySales kosong */ }

    if (trendData.length === 0) {
      const fallbackOmzet = (targetYearMonth === todayStr.substring(0, 7)) ? (calculatedMtdOmzet || agg._sum.sales_mtd_retail || 0) : (agg._sum.sales_mtd_retail || 0);
      const fallbackQty = (targetYearMonth === todayStr.substring(0, 7)) ? (calculatedMtdQty || agg._sum.sales_mtd || 0) : (agg._sum.sales_mtd || 0);
      
      trendData = [{
        date:  new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }),
        fullDate: todayStr,
        omzet: fallbackOmzet,
        qty:   fallbackQty,
        label: 'MTD s/d ' + todayStr,
      }];
    }

    // 7. TABEL PRODUK (paginasi, menggunakan data items dari DailySales)
    const totalTopCount = items.length;
    const paginatedItems = items.slice(skip, skip + limit);

    const isCurrentMonth = targetYearMonth === todayStr.substring(0, 7);

    return NextResponse.json({
      success: true,
      data: {
        targetDate: pqDateLabel,
        pqUploadTime,
        pqFileName: selectedSync?.fileName || null,
        availableDates: availableDates,
        summary: {
          // Cards utama
          omzet_hari_ini:  selectedDateOmzet,
          qty_hari_ini:    selectedDateQty,
          omzet_promo:     omzetPromo,
          qty_promo:       qtyPromo,
          mtd_omzet:       isCurrentMonth ? (calculatedMtdOmzet || agg._sum.sales_mtd_retail || 0) : (agg._sum.sales_mtd_retail || 0),
          mtd_qty:         isCurrentMonth ? (calculatedMtdQty || agg._sum.sales_mtd || 0) : (agg._sum.sales_mtd || 0),
          ytd_omzet:       agg._sum.sales_ytd_retail  || 0,
          ytd_qty:         agg._sum.sales_ytd          || 0,
          nilai_inventori: agg._sum.eoh_retail         || 0,
          total_stok:      agg._sum.stok               || 0,
          total_produk:    totalProducts,
          total_promo:     totalWithPromo,
          // Legacy keys (backward compat)
          totalRevenue:    selectedDateOmzet,
          totalQty:        selectedDateQty,
          totalPromoRevenue: omzetPromo,
          totalOmzetPOS:   isCurrentMonth ? (calculatedMtdOmzet || agg._sum.sales_mtd_retail || 0) : (agg._sum.sales_mtd_retail || 0),
          mtd_omzet_pos:   isCurrentMonth ? (calculatedMtdOmzet || agg._sum.sales_mtd_retail || 0) : (agg._sum.sales_mtd_retail || 0),
          ytd_sales_unit:  agg._sum.sales_ytd           || 0,
          anomalyCount:    anomalyCount,
        },

        categoryBreakdown,
        trendData,
        topFast,
        topSlow,
        topKritis,
        items: paginatedItems,
        pagination: {
          total:      totalTopCount,
          page,
          limit,
          totalPages: Math.ceil(totalTopCount / limit),
        }
      }
    });

  } catch (error) {
    console.error("Error in sales-report route:", error);
    return NextResponse.json(
      { success: false, error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
