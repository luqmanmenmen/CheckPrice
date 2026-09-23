import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // [SUPER ENGINE] Auto-clean expired promos on the fly BEFORE any query!
    const todayStr = new Date().toISOString().split('T')[0];
    await prisma.product.updateMany({
      where: {
        hargaPromo: { not: null },
        toDate: { not: null, lt: todayStr }
      },
      data: {
        hargaPromo: null, diskon: null, discountType: null, acara: null, fromDate: null, toDate: null
      }
    });

    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get("date");
    const timeframe = searchParams.get("timeframe") || "1M";
    
    // Fetch available dates for the filter dropdown
    const availableDatesRaw = await prisma.dailySales.groupBy({
      by: ['date'],
      orderBy: { date: 'desc' }
    });
    
    // Format to YYYY-MM-DD and remove duplicates, then take 30
    const availableDates = Array.from(new Set(availableDatesRaw.map(d => d.date.toISOString().split('T')[0]))).slice(0, 30);
    
    // Default to the most recent date if no date is provided
    let targetDateStr = dateParam;
    if (!targetDateStr && availableDates.length > 0) {
      targetDateStr = availableDates[0];
    } else if (!targetDateStr) {
      targetDateStr = new Date().toISOString().split('T')[0];
    }

    let startOfDay, endOfDay;

    // Check if targetDateStr is a month (YYYY-MM)
    if (targetDateStr.length === 7) {
      const year = parseInt(targetDateStr.split('-')[0]);
      const month = parseInt(targetDateStr.split('-')[1]) - 1; // 0-indexed
      startOfDay = new Date(year, month, 1);
      endOfDay = new Date(year, month + 1, 0, 23, 59, 59, 999);
      
      // Fix timezone offset issues when filtering
      startOfDay = new Date(startOfDay.getTime() - startOfDay.getTimezoneOffset() * 60000);
      endOfDay = new Date(endOfDay.getTime() - endOfDay.getTimezoneOffset() * 60000);
    } else {
      startOfDay = new Date(`${targetDateStr}T00:00:00.000Z`);
      endOfDay = new Date(`${targetDateStr}T23:59:59.999Z`);
    }

    // Fetch the sales for the target date or month
    const salesData = await prisma.dailySales.findMany({
      where: {
        date: {
          gte: startOfDay,
          lte: endOfDay,
        }
      },
      include: {
        product: true
      },
      orderBy: {
        qtySold: 'desc'
      }
    });

    let totalRevenue = 0;
    let totalPromoRevenue = 0;
    let totalQty = 0;
    let anomalyCount = 0;
    
    const categoryBreakdown: Record<string, { omzet: number, qty: number }> = {};

    const reportItems = salesData.map(sale => {
      const p = sale.product;
      const isPromo = (p.hargaPromo !== null && p.hargaPromo > 0) || p.discountType === 'BXGY';
      
      // Hitung harga satuan (Promo vs Normal)
      let unitPrice = 0;
      let status = "NORMAL";
      
      if (isPromo) {
        unitPrice = p.hargaPromo || p.hargaNormal || 0;
        status = "PROMO";
      } else {
        unitPrice = p.hargaNormal || 0;
        status = "NORMAL";
      }

      // Deteksi anomali: barang laku tapi harga normal = 0
      if (!isPromo && (p.hargaNormal === 0 || p.hargaNormal === null)) {
        status = "NO_PRICE";
        anomalyCount++;
      }

      const itemTotal = unitPrice * sale.qtySold;
      
      totalRevenue += itemTotal;
      if (status === "PROMO") {
        totalPromoRevenue += itemTotal;
      }
      totalQty += sale.qtySold;
      
      const dept = p.dept || 'LAINNYA';
      if (!categoryBreakdown[dept]) {
        categoryBreakdown[dept] = { omzet: 0, qty: 0 };
      }
      categoryBreakdown[dept].omzet += itemTotal;
      categoryBreakdown[dept].qty += sale.qtySold;

      return {
        id: sale.id,
        sku: p.sku,
        description: p.description,
        qtySold: sale.qtySold,
        hargaNormal: p.hargaNormal || 0,
        hargaPromo: p.hargaPromo,
        unitPrice: unitPrice,
        status: status,
        itemTotal: itemTotal,
      };
    });

    // Fetch trend data
    let trendData = [];
    
    if (timeframe === "1M") {
      const trendDates = [...availableDates].slice(0, 31).reverse();
      if (trendDates.length > 0) {
        const startDate = new Date(`${trendDates[0]}T00:00:00.000Z`);
        const endDate = new Date(`${trendDates[trendDates.length - 1]}T23:59:59.999Z`);
        
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

        for (const d of trendDates) {
          const daySales = salesByDay.get(d) || [];
          let dayRev = 0;
          let dayQty = 0;
          
          for (const ds of daySales) {
            const isPromo = (ds.product.hargaPromo !== null && ds.product.hargaPromo > 0) || ds.product.discountType === 'BXGY';
            const unitPrice = isPromo ? (ds.product.hargaPromo || ds.product.hargaNormal || 0) : (ds.product.hargaNormal || 0);
            dayRev += unitPrice * ds.qtySold;
            dayQty += ds.qtySold;
          }
          
          const dateLabel = new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
          trendData.push({ date: dateLabel, fullDate: d, omzet: dayRev, qty: dayQty });
        }
      }
    } else if (timeframe === "1Y" || timeframe === "ALL") {
      const oneYearAgo = new Date();
      if (timeframe === "1Y") {
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      } else {
        oneYearAgo.setFullYear(2000); // ALL
      }

      const allSales = await prisma.dailySales.findMany({
        where: { date: { gte: oneYearAgo } },
        include: { product: true },
        orderBy: { date: 'asc' }
      });

      const monthMap = new Map();
      for (const ds of allSales) {
        const d = new Date(ds.date);
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        
        if (!monthMap.has(monthKey)) {
          const dateLabel = d.toLocaleDateString('id-ID', { month: 'short', year: 'numeric' });
          monthMap.set(monthKey, { date: dateLabel, fullDate: monthKey, omzet: 0, qty: 0 });
        }
        
        const m = monthMap.get(monthKey);
        const isPromo = (ds.product.hargaPromo !== null && ds.product.hargaPromo > 0) || ds.product.discountType === 'BXGY';
        const unitPrice = isPromo ? (ds.product.hargaPromo || ds.product.hargaNormal || 0) : (ds.product.hargaNormal || 0);
        
        m.omzet += unitPrice * ds.qtySold;
        m.qty += ds.qtySold;
      }
      
      trendData = Array.from(monthMap.values());
    }

    return NextResponse.json({
      success: true,
      data: {
        targetDate: targetDateStr,
        availableDates,
        summary: {
          totalRevenue,
          totalPromoRevenue,
          totalQty,
          anomalyCount,
        },
        categoryBreakdown,
        trendData,
        items: reportItems
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
