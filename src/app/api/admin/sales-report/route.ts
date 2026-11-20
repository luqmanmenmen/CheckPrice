import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchStorageAnalyticsJson, getEstimatedProductCount } from "@/lib/productQueryHelpers";

// Simple in-memory cache to speed up dashboard loading
interface CacheEntry {
  data: any;
  timestamp: number;
}
let routeCache: Record<string, CacheEntry> = {};
let lastSyncId: string | null = null;
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const timeframe = searchParams.get("timeframe") || "1M";
    const deptFilter = searchParams.get("dept") || "";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "99999");
    const skip = (page - 1) * limit;
    const targetDateParam = searchParams.get("date") || "";
    const cutoffStartParam = (searchParams.get("cutoffStart") || "").trim();
    const cutoffEndParam = (searchParams.get("cutoffEnd") || "").trim();
    const hasCustomCutoff =
      /^\d{4}-\d{2}-\d{2}$/.test(cutoffStartParam) &&
      /^\d{4}-\d{2}-\d{2}$/.test(cutoffEndParam) &&
      cutoffStartParam <= cutoffEndParam;

    // Check latest sync to invalidate cache if new data arrived (mendukung MDS_SALES_SYNC, STOCK_SYNC, dan PQ_HARIAN)
    const SALES_SYNC_TYPES = ["MDS_SALES_SYNC", "STOCK_SYNC", "PQ_HARIAN"];
    const latestSync = await prisma.syncHistory.findFirst({
      where: { type: { in: SALES_SYNC_TYPES }, status: "SUCCESS" },
      orderBy: { createdAt: "desc" },
      select: { id: true }
    });

    if (latestSync && latestSync.id !== lastSyncId) {
      routeCache = {}; // Invalidate cache
      lastSyncId = latestSync.id;
    }

    const forceRefresh = searchParams.get("refresh") === "1";
    const cacheKey = `${targetDateParam}_${timeframe}_${deptFilter}_${page}_${limit}_${cutoffStartParam}_${cutoffEndParam}`;
    if (!forceRefresh && routeCache[cacheKey] && Date.now() - routeCache[cacheKey].timestamp < CACHE_TTL) {
      return NextResponse.json(routeCache[cacheKey].data);
    }

    // Tanggal hari ini (WIB)
    const todayStr = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().split('T')[0];

    // ============================================================
    // SUMBER DATA UTAMA: MDS BISA (SUKO Delta-Stock Sales) + CDN Pre-computed Analytics (0 Full-Scan Postgres!)
    // ============================================================

    const allPqSyncs = await prisma.syncHistory.findMany({
      where: { type: { in: SALES_SYNC_TYPES }, status: "SUCCESS" },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: { fileName: true, createdAt: true, id: true, type: true }
    });

    const MONTHS: Record<string, string> = {
      JANUARI: '01', JANUARY: '01', FEBRUARI: '02', FEBRUARY: '02', MARET: '03', MARCH: '03', APRIL: '04',
      MEI: '05', MAY: '05', JUNI: '06', JUNE: '06', JULI: '07', JULY: '07', AGUSTUS: '08', AUGUST: '08',
      SEPTEMBER: '09', OKTOBER: '10', OCTOBER: '10', NOVEMBER: '11', DESEMBER: '12', DECEMBER: '12'
    };

    const parsedSyncs = allPqSyncs.map(sync => {
      const wibCreated = new Date(new Date(sync.createdAt).getTime() + 7 * 60 * 60 * 1000).toISOString().split('T')[0];
      let dateLabel = wibCreated;
      const bukuMatch = sync.fileName.match(/Buku\s+(\d{4}-\d{2}-\d{2})/i);
      const match = sync.fileName.match(/(\d{1,2})\s+([A-Z]+)\s+(\d{4})/i);
      if (bukuMatch) {
        dateLabel = bukuMatch[1];
      } else if (match) {
        const m = MONTHS[match[2].toUpperCase()] || '01';
        dateLabel = `${match[3]}-${m}-${match[1].padStart(2, '0')}`;
      }
      return {
        date: dateLabel,
        createdAt: sync.createdAt,
        fileName: sync.fileName,
        type: sync.type,
      };
    });

    // Deteksi khusus: Apakah KEMARIN belum pernah tarik sales?
    // Jika belum (dan kemarin >= tanggal baseline bersih 2026-11-21), tarikan sales pertama hari ini
    // akan memunculkan alert & otomatis dibukukan ke tanggal kemarin. Setelah selesai, tarikan berikutnya masuk hari ini.
    const SALES_BASELINE_START_DATE = "2026-11-21";
    const wibTodayDt = new Date(`${todayStr}T00:00:00.000Z`);
    const wibYesterdayDt = new Date(wibTodayDt.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayWibStr = wibYesterdayDt.toISOString().split('T')[0];
    let hasMissedYesterday = false;

    if (yesterdayWibStr >= SALES_BASELINE_START_DATE) {
      const syncedYesterdayInHistory = parsedSyncs.some((s) => {
        if (s.date !== yesterdayWibStr) return false;
        // Abaikan entri inisialisasi baseline awal (bukan tarikan sales real)
        if (/Baseline Sales/i.test(s.fileName)) return false;
        return s.type === "MDS_SALES_SYNC" || s.type === "STOCK_SYNC";
      });
      if (!syncedYesterdayInHistory) {
        const yestStartUtc = new Date(`${yesterdayWibStr}T00:00:00.000Z`);
        const yestEndUtc = new Date(`${yesterdayWibStr}T23:59:59.999Z`);
        const yestSalesCount = await prisma.dailySales.count({
          where: { date: { gte: yestStartUtc, lte: yestEndUtc } },
        });
        hasMissedYesterday = yestSalesCount === 0;
      }
    }

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

    let targetDateValue = availableDates.length > 0 ? availableDates[0] : (
      timeframe === '1Y' ? todayStr.substring(0, 4) :
        timeframe === '1M' ? todayStr.substring(0, 7) :
          todayStr
    );
    let selectedSync = availableSyncs.length > 0 ? availableSyncs[0] : null;

    if (targetDateParam && targetDateParam !== "") {
      const cleanParam = targetDateParam.trim();
      const found = availableSyncs.find(s => {
        if (timeframe === '1Y') return s.date.substring(0, 4) === cleanParam.substring(0, 4);
        if (timeframe === '1M') return s.date.substring(0, 7) === cleanParam.substring(0, 7);
        return s.date === cleanParam;
      });
      if (found) {
        selectedSync = found;
      } else {
        selectedSync = null;
      }
      // Terima kalender Masehi penuh (2020–2130, 100+ tahun ke depan) meski belum ada data SyncHistory
      if (timeframe === '1Y' && /^\d{4}/.test(cleanParam)) {
        targetDateValue = cleanParam.substring(0, 4);
      } else if (timeframe === '1M' && /^\d{4}-\d{2}/.test(cleanParam)) {
        targetDateValue = cleanParam.substring(0, 7);
      } else if (/^\d{4}-\d{2}-\d{2}/.test(cleanParam)) {
        targetDateValue = cleanParam.substring(0, 10);
      } else if (found) {
        targetDateValue = cleanParam;
      }
    }

    let pqDateLabel = targetDateValue;
    const pqUploadTime = selectedSync?.createdAt
      ? new Date(selectedSync.createdAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '-';

    let mtdMonthObj = new Date(`${todayStr}T00:00:00.000Z`);
    if (timeframe === '1Y' && /^\d{4}$/.test(targetDateValue)) {
      mtdMonthObj = new Date(parseInt(targetDateValue, 10), 11, 31);
    } else if (timeframe === '1M' && /^\d{4}-\d{2}/.test(targetDateValue)) {
      const [y, m] = targetDateValue.split('-');
      mtdMonthObj = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
    } else if (/^\d{4}-\d{2}-\d{2}/.test(targetDateValue)) {
      const [y, m, d] = targetDateValue.slice(0, 10).split('-');
      mtdMonthObj = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
    }

    // Default Cut-Off Bulanan: Tanggal 1 s/d tanggal berakhirnya bulan tersebut (28/29/30/31)
    const monthStartDefault = new Date(mtdMonthObj.getFullYear(), mtdMonthObj.getMonth(), 1, 0, 0, 0, 0);
    const monthEndDefault = new Date(mtdMonthObj.getFullYear(), mtdMonthObj.getMonth() + 1, 0, 23, 59, 59, 999);
    const fmtYmd = (dt: Date) =>
      `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;

    const startOfMonth = hasCustomCutoff
      ? new Date(`${cutoffStartParam}T00:00:00.000Z`)
      : monthStartDefault;
    const endOfMonth = hasCustomCutoff
      ? new Date(`${cutoffEndParam}T23:59:59.999Z`)
      : monthEndDefault;
    const cutoffStartStr = hasCustomCutoff ? cutoffStartParam : fmtYmd(monthStartDefault);
    const cutoffEndStr = hasCustomCutoff ? cutoffEndParam : fmtYmd(monthEndDefault);

    let startDateObj: Date;
    let endDateObj: Date;

    if (hasCustomCutoff) {
      startDateObj = startOfMonth;
      endDateObj = endOfMonth;
    } else if (timeframe === '1Y') {
      const y = parseInt(targetDateValue, 10) || mtdMonthObj.getFullYear();
      startDateObj = new Date(y, 0, 1);
      endDateObj = new Date(y, 11, 31, 23, 59, 59, 999);
    } else if (timeframe === '1M') {
      startDateObj = monthStartDefault;
      endDateObj = monthEndDefault;
    } else if (timeframe === '1W') {
      endDateObj = new Date(mtdMonthObj.getFullYear(), mtdMonthObj.getMonth(), mtdMonthObj.getDate(), 23, 59, 59, 999);
      startDateObj = new Date(endDateObj);
      startDateObj.setDate(startDateObj.getDate() - 6);
      startDateObj.setHours(0, 0, 0, 0);
    } else { // 1D
      startDateObj = new Date(mtdMonthObj.getFullYear(), mtdMonthObj.getMonth(), mtdMonthObj.getDate(), 0, 0, 0, 0);
      endDateObj = new Date(mtdMonthObj.getFullYear(), mtdMonthObj.getMonth(), mtdMonthObj.getDate(), 23, 59, 59, 999);
    }

    const targetYearMonth = cutoffStartStr.substring(0, 7);
    const isCurrentMonth = targetYearMonth === todayStr.substring(0, 7);
    const isCurrentYear = cutoffStartStr.substring(0, 4) === todayStr.substring(0, 4);
    const useDailySalesOnly = hasCustomCutoff || !isCurrentMonth;

    // 1. SUMMARY CARDS (Prioritaskan pre-computed JSON Python CDN -> 0 full Product aggregate Disk IO)
    const precomputedSummary = await fetchStorageAnalyticsJson<any>("sales-report-summary.json");
    const agg = precomputedSummary?.aggSummary
      ? { _sum: precomputedSummary.aggSummary }
      : await prisma.product.aggregate({
        _sum: {
          day_sales_retail: true,
          day_sales_unit: true,
          sales_wtd: true,
          sales_wtd_retail: true,
          sales_mtd: true,
          sales_mtd_retail: true,
          sales_ytd: true,
          sales_ytd_retail: true,
          eoh_retail: true,
          stok: true,
          boy_unit: true,
          boy_retail: true,
          bom_unit: true,
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

    // Perbandingan Kemarin (Day-over-Day)
    const yesterdayDate = new Date(startDateObj);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yestStart = new Date(yesterdayDate.getFullYear(), yesterdayDate.getMonth(), yesterdayDate.getDate(), 0, 0, 0, 0);
    const yestEnd = new Date(yesterdayDate.getFullYear(), yesterdayDate.getMonth(), yesterdayDate.getDate(), 23, 59, 59, 999);
    const yestAgg = await prisma.dailySales.aggregate({
      where: { date: { gte: yestStart, lte: yestEnd } },
      _sum: { omzet: true, qtySold: true }
    });
    const yesterdayOmzet = yestAgg._sum.omzet || 0;
    const yesterdayQty = yestAgg._sum.qtySold || 0;

    // Perbandingan Bulan Lalu (Month-over-Month)
    const lastMonthStart = new Date(mtdMonthObj.getFullYear(), mtdMonthObj.getMonth() - 1, 1);
    const lastMonthEnd = new Date(mtdMonthObj.getFullYear(), mtdMonthObj.getMonth(), 0, 23, 59, 59, 999);
    const lastMonthAgg = await prisma.dailySales.aggregate({
      where: { date: { gte: lastMonthStart, lte: lastMonthEnd } },
      _sum: { omzet: true, qtySold: true }
    });
    const lastMonthOmzet = lastMonthAgg._sum.omzet || 0;
    const lastMonthQty = lastMonthAgg._sum.qtySold || 0;

    const [totalProducts, totalWithPromo] = precomputedSummary?.aggSummary
      ? [
        Number(precomputedSummary.aggSummary.totalProducts || 0),
        Number(precomputedSummary.aggSummary.totalWithPromo || 0),
      ]
      : await Promise.all([
        getEstimatedProductCount(),
        prisma.catalogArticle.count({ where: { articleHasPromo: true } }),
      ]);

    // Hitung omzet promo & Siapkan Report Items dari DailySales
    let omzetPromo = 0;
    let qtyPromo = 0;
    const items = [];
    let anomalyCount = 0;

    if (selectedSync || useDailySalesOnly) {
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
          article: true, brand: true, dept: true,
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
          article: p.article || undefined,
          brand: p.brand || undefined,
          dept: p.dept || undefined,
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
          article: true,
          brand: true,
          dept: true,
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
          article: p.article || undefined,
          brand: p.brand || undefined,
          dept: p.dept || undefined,
          qtySold: qty,
          hargaNormal: p.hargaNormal,
          hargaPromo: p.hargaPromo,
          unitPrice,
          status,
          itemTotal: total
        });
      }
    }

    // 2. CATEGORY BREAKDOWN per Department (Prioritaskan pre-computed CDN Python -> 0 full-scan 310rb baris Postgres!)
    const categoryBreakdown: any = {};
    const precomputedDepts = precomputedSummary?.deptBreakdown;
    const hasPrecomputedDepts = Boolean(precomputedDepts && typeof precomputedDepts === 'object' && Object.keys(precomputedDepts).length > 0);

    // Ambil delta penjualan aktual bulan berjalan dari DailySales (tabel kecil & bersih mulai 21 Nov 2026)
    const mtdDeptSales = await prisma.dailySales.findMany({
      where: { date: { gte: startOfMonth, lte: endOfMonth } },
      include: { product: { select: { dept: true } } }
    });
    const deptMtdMap = new Map<string, { omzet: number; qty: number; todayOmzet: number; todayQty: number }>();
    for (const ds of mtdDeptSales) {
      const dept = (ds.product?.dept || 'SUKO LAINNYA').trim();
      const entry = deptMtdMap.get(dept) || { omzet: 0, qty: 0, todayOmzet: 0, todayQty: 0 };
      entry.omzet += ds.omzet || 0;
      entry.qty += ds.qtySold || 0;
      const dsDateStr = ds.date.toISOString().slice(0, 10);
      if (dsDateStr === todayStr) {
        entry.todayOmzet += ds.omzet || 0;
        entry.todayQty += ds.qtySold || 0;
      }
      deptMtdMap.set(dept, entry);
    }

    const isNewMonth = calculatedMtdOmzet < (agg._sum.sales_mtd_retail || 0) * 0.5;

    if (hasPrecomputedDepts) {
      for (const [deptName, rawMetrics] of Object.entries(precomputedDepts as Record<string, any>)) {
        const liveMtd = deptMtdMap.get(deptName);
        categoryBreakdown[deptName] = {
          omzet: useDailySalesOnly ? (liveMtd?.omzet || 0) : Math.max(Number(rawMetrics.omzet || 0), liveMtd?.omzet || 0),
          qty: useDailySalesOnly ? (liveMtd?.qty || 0) : Math.max(Number(rawMetrics.qty || 0), liveMtd?.qty || 0),
          omzet_hari_ini: useDailySalesOnly ? (liveMtd?.todayOmzet || 0) : Math.max(Number(rawMetrics.omzet_hari_ini || 0), liveMtd?.todayOmzet || 0),
          qty_hari_ini: useDailySalesOnly ? (liveMtd?.todayQty || 0) : Math.max(Number(rawMetrics.qty_hari_ini || 0), liveMtd?.todayQty || 0),
          omzet_wtd: useDailySalesOnly ? (liveMtd?.omzet || 0) : Math.max(Number(rawMetrics.omzet_wtd || 0), liveMtd?.omzet || 0),
          qty_wtd: useDailySalesOnly ? (liveMtd?.qty || 0) : Math.max(Number(rawMetrics.qty_wtd || 0), liveMtd?.qty || 0),
          omzet_ytd: useDailySalesOnly ? (liveMtd?.omzet || 0) : Math.max(Number(rawMetrics.omzet_ytd || 0), liveMtd?.omzet || 0),
          qty_ytd: useDailySalesOnly ? (liveMtd?.qty || 0) : Math.max(Number(rawMetrics.qty_ytd || 0), liveMtd?.qty || 0),
          stok: Number(rawMetrics.stok || 0),
          eoh: Number(rawMetrics.eoh || 0),
          bom_unit: Number(rawMetrics.bom_unit || 0),
          boy_unit: Number(rawMetrics.boy_unit || 0),
        };
      }
    } else {
      const deptBreakdown = await prisma.product.groupBy({
        by: ['dept'],
        where: { OR: [{ stok: { gt: 0 } }, { sales_mtd: { gt: 0 } }, { day_sales_unit: { gt: 0 } }] },
        _sum: {
          sales_mtd_retail: true,
          sales_mtd: true,
          sales_wtd_retail: true,
          sales_wtd: true,
          sales_ytd_retail: true,
          sales_ytd: true,
          stok: true,
          eoh_retail: true,
          day_sales_retail: true,
          day_sales_unit: true,
          bom_unit: true,
          boy_unit: true,
          boy_retail: true,
        },
        orderBy: { _sum: { sales_mtd_retail: 'desc' } },
      });
      deptBreakdown.forEach((d) => {
        const deptName = (d.dept || 'SUKO LAINNYA').trim();
        const liveMtd = deptMtdMap.get(deptName);
        categoryBreakdown[deptName] = {
          omzet: useDailySalesOnly ? (liveMtd?.omzet || 0) : Math.max(d._sum.sales_mtd_retail || 0, liveMtd?.omzet || 0),
          qty: useDailySalesOnly ? (liveMtd?.qty || 0) : Math.max(d._sum.sales_mtd || 0, liveMtd?.qty || 0),
          omzet_hari_ini: useDailySalesOnly ? (liveMtd?.todayOmzet || 0) : Math.max(d._sum.day_sales_retail || 0, liveMtd?.todayOmzet || 0),
          qty_hari_ini: useDailySalesOnly ? (liveMtd?.todayQty || 0) : Math.max(d._sum.day_sales_unit || 0, liveMtd?.todayQty || 0),
          omzet_wtd: useDailySalesOnly ? (liveMtd?.omzet || 0) : (d._sum.sales_wtd_retail || 0),
          qty_wtd: useDailySalesOnly ? (liveMtd?.qty || 0) : (d._sum.sales_wtd || 0),
          omzet_ytd: useDailySalesOnly ? (liveMtd?.omzet || 0) : (d._sum.sales_ytd_retail || 0),
          qty_ytd: useDailySalesOnly ? (liveMtd?.qty || 0) : (d._sum.sales_ytd || 0),
          stok: Math.max(0, d._sum.stok || 0),
          eoh: Math.max(0, d._sum.eoh_retail || 0),
          bom_unit: Math.max(0, d._sum.bom_unit || 0),
          boy_unit: Math.max(0, d._sum.boy_unit || 0),
        };
      });
    }

    // 3. TOP FAST MOVE (Dinamis berdasarkan timeframe & mode Cut-Off)
    let topFast: any[] = [];
    try {
      if (useDailySalesOnly) {
        const cutoffAgg = await prisma.dailySales.groupBy({
          by: ['productId'],
          where: {
            date: { gte: startOfMonth, lte: endOfMonth },
            ...(deptFilter ? { product: { dept: deptFilter } } : {}),
          },
          _sum: { qtySold: true, omzet: true },
          orderBy: { _sum: { qtySold: 'desc' } },
          take: 10
        });
        const productIds = cutoffAgg.map((a: any) => a.productId);
        const topFastProducts = productIds.length > 0
          ? await prisma.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true, sku: true, description: true }
          })
          : [];
        topFast = cutoffAgg.map((agg: any) => {
          const p = topFastProducts.find((x: any) => x.id === agg.productId);
          return {
            sku: p?.sku || '-',
            description: p?.description || '-',
            sales_qty: agg._sum.qtySold || 0,
            omzet_total: agg._sum.omzet || 0
          };
        });
      } else if (timeframe === '1D') {
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

          if (!deptFilter && qtyCol === 'sales_mtd' && Array.isArray(precomputedSummary?.topFastMtd)) {
            topFast = precomputedSummary.topFastMtd;
          } else {
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
      }
    } catch (e) {
      console.error("Failed to compute topFast dynamic:", e);
    }

    // 4. SLOW MOVE
    const slowWhere: any = deptFilter
      ? { dept: deptFilter, stok: { gt: 5 }, sales_mtd: { lte: 2 } }
      : { stok: { gt: 5 }, sales_mtd: { lte: 2 } };
    const topSlow = !deptFilter && Array.isArray(precomputedSummary?.topSlow)
      ? precomputedSummary.topSlow
      : await prisma.product.findMany({
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
    const topKritis = !deptFilter && Array.isArray(precomputedSummary?.topKritis)
      ? precomputedSummary.topKritis
      : await prisma.product.findMany({
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
      let startDate = startOfMonth;
      let endDate = endOfMonth;
      const targetDate = selectedSync ? new Date(selectedSync.date) : new Date();

      if (!hasCustomCutoff) {
        if (timeframe === '1W' || timeframe === '1D') {
          startDate = new Date(targetDate);
          startDate.setDate(startDate.getDate() - 6);
          startDate.setHours(0, 0, 0, 0);
          endDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59, 999);
        } else if (timeframe === '1Y') {
          startDate = new Date(targetDate.getFullYear(), 0, 1);
          endDate = new Date(targetDate.getFullYear(), 11, 31, 23, 59, 59, 999);
        }
      }

      const salesByDay = await prisma.dailySales.groupBy({
        by: ['date'],
        where: { date: { gte: startDate, lte: endDate } },
        _sum: { qtySold: true, omzet: true },
        orderBy: { date: 'asc' },
      });

      if (timeframe === '1Y' && !hasCustomCutoff) {
        const monthMap = new Map();
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
        for (const d of salesByDay) {
          const mIdx = d.date.getMonth();
          const mName = months[mIdx];
          if (!monthMap.has(mName)) monthMap.set(mName, { date: mName, fullDate: `${targetDate.getFullYear()}-${String(mIdx + 1).padStart(2, '0')}-01`, omzet: 0, qty: 0 });
          const item = monthMap.get(mName);
          item.omzet += d._sum.omzet || 0;
          item.qty += d._sum.qtySold || 0;
        }
        trendData = Array.from(monthMap.values());
      } else {
        trendData = salesByDay.map(d => ({
          date: new Date(d.date.getTime() - d.date.getTimezoneOffset() * 60000).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }),
          fullDate: d.date.toISOString().split('T')[0],
          omzet: d._sum.omzet || 0,
          qty: d._sum.qtySold || 0,
        }));
      }
    } catch (_e) { /* DailySales kosong */ }

    if (trendData.length === 0) {
      const fallbackOmzet = useDailySalesOnly
        ? calculatedMtdOmzet
        : (calculatedMtdOmzet || agg._sum.sales_mtd_retail || 0);
      const fallbackQty = useDailySalesOnly
        ? calculatedMtdQty
        : (calculatedMtdQty || agg._sum.sales_mtd || 0);

      trendData = [{
        date: useDailySalesOnly ? `${cutoffStartStr.slice(8, 10)}–${cutoffEndStr.slice(8, 10)}` : new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }),
        fullDate: useDailySalesOnly ? cutoffEndStr : todayStr,
        omzet: fallbackOmzet,
        qty: fallbackQty,
        label: useDailySalesOnly ? `Cut-Off ${cutoffStartStr} s/d ${cutoffEndStr}` : ('MTD s/d ' + todayStr),
      }];
    }

    // 7. TABEL PRODUK (paginasi, menggunakan data items dari DailySales)
    const totalTopCount = items.length;
    const paginatedItems = items.slice(skip, skip + limit);

    const sanitizeBrandText = (val?: string | null) =>
      val
        ? val
          .replace(/MDS\s*[-]?\s*BISA/gi, 'luqman org')
          .replace(/StoreHub/gi, 'luqman org')
          .replace(/(?:https?:\/\/)?(?:www\.)?matahari\.com/gi, 'luqman org')
          .replace(/\bMatahari\b/gi, 'luqman org')
        : null;

    const responseData = {
      success: true,
      data: {
        targetDate: pqDateLabel,
        pqUploadTime,
        pqFileName: sanitizeBrandText(selectedSync?.fileName),
        availableDates: availableDates,
        cutoff: {
          start: cutoffStartStr,
          end: cutoffEndStr,
          isCustom: hasCustomCutoff,
        },
        missedYesterday: {
          hasMissed: hasMissedYesterday,
          yesterdayDate: yesterdayWibStr,
          todayDate: todayStr,
        },
        summary: {
          // SPD (Sales Per Day / Hari Ini) — gabungkan DailySales live agar instan tanpa tunggu CDN
          spd_omzet: useDailySalesOnly ? selectedDateOmzet : Math.max(selectedDateOmzet, agg._sum.day_sales_retail || 0),
          spd_qty: useDailySalesOnly ? selectedDateQty : Math.max(selectedDateQty, agg._sum.day_sales_unit || 0),
          yesterday_omzet: yesterdayOmzet,
          yesterday_qty: yesterdayQty,

          // WTD (Week To Date / Minggu Ini)
          wtd_omzet: useDailySalesOnly ? calculatedMtdOmzet : Math.max(calculatedMtdOmzet, agg._sum.sales_wtd_retail || 0),
          wtd_qty: useDailySalesOnly ? calculatedMtdQty : Math.max(calculatedMtdQty, agg._sum.sales_wtd || 0),

          // MTD (Month To Date / Cut-Off 1 s/d Akhir Bulan)
          mtd_omzet: useDailySalesOnly
            ? calculatedMtdOmzet
            : Math.max(calculatedMtdOmzet, agg._sum.sales_mtd_retail || 0),
          mtd_qty: useDailySalesOnly
            ? calculatedMtdQty
            : Math.max(calculatedMtdQty, agg._sum.sales_mtd || 0),
          last_month_omzet: lastMonthOmzet,
          last_month_qty: lastMonthQty,

          // YTD (Year To Date / Tahun Ini)
          ytd_omzet: isCurrentYear ? Math.max(calculatedMtdOmzet, agg._sum.sales_ytd_retail || 0) : selectedDateOmzet,
          ytd_qty: isCurrentYear ? Math.max(calculatedMtdQty, agg._sum.sales_ytd || 0) : selectedDateQty,

          // Valuasi & Inventori SUKO Aktif
          nilai_inventori: agg._sum.eoh_retail || 0,
          total_stok: agg._sum.stok || 0,
          active_stock_skus: precomputedSummary?.aggSummary?.activeStockSkus || 0,
          boy_unit: agg._sum.boy_unit || 0,
          boy_retail: agg._sum.boy_retail || 0,
          bom_unit: agg._sum.bom_unit || 0,
          data_source: precomputedSummary?.source || "LUQMAN_ORG_LIVE",

          // Promo
          omzet_promo: omzetPromo,
          qty_promo: qtyPromo,
          total_produk: totalProducts,
          total_promo: totalWithPromo,

          // Legacy keys (backward compat)
          omzet_hari_ini: selectedDateOmzet || agg._sum.day_sales_retail || 0,
          qty_hari_ini: selectedDateQty || agg._sum.day_sales_unit || 0,
          totalRevenue: selectedDateOmzet || agg._sum.day_sales_retail || 0,
          totalQty: selectedDateQty || agg._sum.day_sales_unit || 0,
          totalPromoRevenue: omzetPromo,
          totalOmzetPOS: isCurrentMonth ? (calculatedMtdOmzet || agg._sum.sales_mtd_retail || 0) : (agg._sum.sales_mtd_retail || 0),
          mtd_omzet_pos: isCurrentMonth ? (calculatedMtdOmzet || agg._sum.sales_mtd_retail || 0) : (agg._sum.sales_mtd_retail || 0),
          ytd_sales_unit: agg._sum.sales_ytd || 0,
          anomalyCount: anomalyCount,
        },
        categoryBreakdown,
        trendData,
        topFast,
        topSlow,
        topKritis,
        items: paginatedItems,
        pagination: {
          total: totalTopCount,
          page,
          limit,
          totalPages: Math.ceil(totalTopCount / limit),
        }
      }
    };

    routeCache[cacheKey] = {
      data: responseData,
      timestamp: Date.now()
    };

    return NextResponse.json(responseData);

  } catch (error) {
    console.error("Error in sales-report route:", error);
    return NextResponse.json(
      { success: false, error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
