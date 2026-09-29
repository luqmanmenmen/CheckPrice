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
    const limit = parseInt(searchParams.get("limit") || "50");
    const skip = (page - 1) * limit;

    // ============================================================
    // SUMBER DATA UTAMA: Product table langsung dari PQ upload
    // Grand total sudah tersedia di PQ: MTD, YTD, EOH, DAY_SALES
    // ============================================================

    // 1. SUMMARY CARDS
    const agg = await prisma.product.aggregate({
      _sum: {
        day_sales_unit:   true,
        day_sales_retail: true,
        sales_mtd:        true,
        sales_mtd_retail: true,
        sales_ytd:        true,
        sales_ytd_retail: true,
        eoh_retail:       true,
        stok:             true,
      }
    });

    const [totalProducts, totalWithPromo] = await Promise.all([
      prisma.product.count(),
      prisma.product.count({
        where: { OR: [{ hargaPromo: { not: null } }, { diskon: { not: null } }] }
      })
    ]);

    // 2. CATEGORY BREAKDOWN per Department (MTD)
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

    // 3. TOP FAST MOVE
    const fastWhere: any = deptFilter ? { dept: deptFilter, sales_mtd: { gt: 0 } } : { sales_mtd: { gt: 0 } };
    const topFast = await prisma.product.findMany({
      where: fastWhere,
      orderBy: [{ day_sales_unit: 'desc' }, { sales_mtd: 'desc' }],
      take: 20,
      select: {
        sku: true, description: true, article: true, dept: true, brand: true,
        hargaNormal: true, hargaPromo: true, diskon: true, discountType: true,
        stok: true, sales_mtd: true, sales_mtd_retail: true,
        day_sales_unit: true, day_sales_retail: true,
        sales_ytd: true, sales_ytd_retail: true, eoh_retail: true, bom_unit: true,
      }
    });

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
      const salesByDay = await prisma.dailySales.groupBy({
        by: ['date'],
        _sum: { qtySold: true, omzet: true },
        orderBy: { date: 'asc' },
      });
      trendData = salesByDay.map(d => ({
        date:  new Date(d.date.getTime() - d.date.getTimezoneOffset() * 60000).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }),
        fullDate: d.date.toISOString().split('T')[0],
        omzet: d._sum.omzet    || 0,
        qty:   d._sum.qtySold  || 0,
      }));
    } catch (_e) { /* DailySales kosong */ }

    if (trendData.length === 0) {
      trendData = [{
        date:  new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }),
        fullDate: todayStr,
        omzet: agg._sum.sales_mtd_retail || 0,
        qty:   agg._sum.sales_mtd        || 0,
        label: 'MTD s/d ' + todayStr,
      }];
    }

    // 7. TABEL PRODUK (paginasi, untuk laporan detail)
    const tableWhere: any = deptFilter ? { dept: deptFilter, sales_mtd: { gt: 0 } } : { sales_mtd: { gt: 0 } };
    const [topProducts, totalTopCount] = await Promise.all([
      prisma.product.findMany({
        where: tableWhere,
        orderBy: [{ day_sales_unit: 'desc' }, { sales_mtd: 'desc' }],
        skip,
        take: limit,
      }),
      prisma.product.count({ where: tableWhere })
    ]);
    
    // Map data for compatibility with the frontend format
    const reportItems = topProducts.map(p => ({
        id: p.id,
        sku: p.sku,
        description: p.description,
        qtySold: p.sales_mtd || 0, // In MTD
        hargaNormal: p.hargaNormal || 0,
        hargaPromo: p.hargaPromo,
        unitPrice: p.hargaPromo || p.hargaNormal || 0,
        status: (p.hargaPromo || p.diskon) ? "PROMO" : "NORMAL",
        itemTotal: p.sales_mtd_retail || 0,
        omzetPOS: p.sales_mtd_retail || 0,
    }));

    return NextResponse.json({
      success: true,
      data: {
        targetDate: todayStr,
        availableDates: [todayStr],
        summary: {
          // Cards utama
          omzet_hari_ini:  agg._sum.day_sales_retail  || 0,
          qty_hari_ini:    agg._sum.day_sales_unit     || 0,
          mtd_omzet:       agg._sum.sales_mtd_retail  || 0,
          mtd_qty:         agg._sum.sales_mtd          || 0,
          ytd_omzet:       agg._sum.sales_ytd_retail  || 0,
          ytd_qty:         agg._sum.sales_ytd          || 0,
          nilai_inventori: agg._sum.eoh_retail         || 0,
          total_stok:      agg._sum.stok               || 0,
          total_produk:    totalProducts,
          total_promo:     totalWithPromo,
          // Legacy keys (backward compat dengan ReportClient lama)
          totalRevenue:    agg._sum.day_sales_retail   || 0, // Show today revenue on dashboard
          totalQty:        agg._sum.day_sales_unit      || 0,
          totalOmzetPOS:   agg._sum.sales_mtd_retail   || 0,
          mtd_omzet_pos:   agg._sum.sales_mtd_retail   || 0,
          ytd_sales_unit:  agg._sum.sales_ytd           || 0,
          anomalyCount:    0,
        },
        categoryBreakdown,
        trendData,
        topFast,
        topSlow,
        topKritis,
        items: reportItems,
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
