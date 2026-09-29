import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET() {
  try {
    // Total Inventory Value & Units
    const inventoryAggr = await prisma.product.aggregate({
      _sum: {
        stok: true,
        eoh_retail: true,
        sales_mtd: true,
        sales_mtd_retail: true,
        sales_ytd_retail: true
      }
    });

    // Top 10 Fast Movers (Highest MTD Sales)
    const fastMovers = await prisma.product.findMany({
      where: {
        sales_mtd: {
          gt: 0
        }
      },
      orderBy: {
        sales_mtd: 'desc'
      },
      take: 10,
      select: {
        sku: true,
        description: true,
        brand: true,
        stok: true,
        sales_mtd: true,
        sales_mtd_retail: true
      }
    });

    // Top 10 Dead Stock (High Inventory Value, 0 MTD Sales)
    const deadStock = await prisma.product.findMany({
      where: {
        sales_mtd: 0,
        stok: {
          gt: 0
        }
      },
      orderBy: {
        eoh_retail: 'desc'
      },
      take: 10,
      select: {
        sku: true,
        description: true,
        brand: true,
        stok: true,
        eoh_retail: true
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        summary: {
          totalEohUnit: inventoryAggr._sum.stok || 0,
          totalEohRetail: inventoryAggr._sum.eoh_retail || 0,
          totalMtdSalesRetail: inventoryAggr._sum.sales_mtd_retail || 0,
          totalYtdSalesRetail: inventoryAggr._sum.sales_ytd_retail || 0,
        },
        fastMovers,
        deadStock
      }
    });
  } catch (error) {
    console.error("Dashboard Report Error:", error);
    return NextResponse.json({ success: false, error: "Failed to generate report" }, { status: 500 });
  }
}
