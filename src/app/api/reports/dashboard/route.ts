import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { fetchStorageAnalyticsJson } from '@/lib/productQueryHelpers';

let cachedDashboard: { payload: any; fetchedAt: number } | null = null;
const DASHBOARD_TTL_MS = 5 * 60 * 1000;

export async function GET() {
  try {
    const now = Date.now();
    if (cachedDashboard && now - cachedDashboard.fetchedAt < DASHBOARD_TTL_MS) {
      return NextResponse.json(cachedDashboard.payload);
    }

    // Prioritaskan pre-computed JSON dari Turso Storage (1 row read, BUKAN 310rb full-scan!)
    const precomputed = await fetchStorageAnalyticsJson<any>('sales-report-summary.json');
    const summary = precomputed?.aggSummary
      ? {
          totalEohUnit: Number(precomputed.aggSummary.stok || 0),
          totalEohRetail: Number(precomputed.aggSummary.eoh_retail || 0),
          totalMtdSalesRetail: Number(precomputed.aggSummary.sales_mtd_retail || 0),
          totalYtdSalesRetail: Number(precomputed.aggSummary.sales_ytd_retail || 0),
        }
      : await prisma.product
          .aggregate({
            _sum: {
              stok: true,
              eoh_retail: true,
              sales_mtd_retail: true,
              sales_ytd_retail: true,
            },
          })
          .then((ag) => ({
            totalEohUnit: ag._sum.stok || 0,
            totalEohRetail: ag._sum.eoh_retail || 0,
            totalMtdSalesRetail: ag._sum.sales_mtd_retail || 0,
            totalYtdSalesRetail: ag._sum.sales_ytd_retail || 0,
          }));

    const fastMovers = Array.isArray(precomputed?.topFast)
      ? precomputed.topFast.slice(0, 10)
      : await prisma.product.findMany({
          where: { sales_mtd: { gt: 0 } },
          orderBy: { sales_mtd: 'desc' },
          take: 10,
          select: {
            sku: true,
            description: true,
            brand: true,
            stok: true,
            sales_mtd: true,
            sales_mtd_retail: true,
          },
        });

    const deadStock = Array.isArray(precomputed?.topSlow)
      ? precomputed.topSlow.slice(0, 10)
      : await prisma.product.findMany({
          where: { sales_mtd: 0, stok: { gt: 0 } },
          orderBy: { eoh_retail: 'desc' },
          take: 10,
          select: {
            sku: true,
            description: true,
            brand: true,
            stok: true,
            eoh_retail: true,
          },
        });

    const payload = {
      success: true,
      data: {
        summary,
        fastMovers,
        deadStock,
      },
    };
    cachedDashboard = { payload, fetchedAt: now };
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Dashboard Report Error:", error);
    return NextResponse.json({ success: false, error: "Failed to generate report" }, { status: 500 });
  }
}
