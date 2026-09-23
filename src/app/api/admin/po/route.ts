import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const minMtd = parseInt(searchParams.get('minMtd') || '5', 10);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const skip = (page - 1) * limit;

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where: {
          sales_mtd: { gte: minMtd },
          stok: { gt: 0 }
        },
        include: {
          dailySales: {
            orderBy: { date: 'asc' }
          }
        },
        orderBy: { sales_mtd: 'desc' },
        skip,
        take: limit
      }),
      prisma.product.count({
        where: { 
          sales_mtd: { gte: minMtd },
          stok: { gt: 0 }
        }
      })
    ]);

    // Calculate Pivot Data
    const pivotData = products.map(p => {
      // SPD berdasarkan MTD (30 hari) agar lebih stabil
      const spd = Number((p.sales_mtd / 30).toFixed(2));
      
      // Rumus Logistik Standar
      // Asumsi Lead Time 14 hari, Safety Stock 7 hari (Total Min = 21 hari coverage)
      const minStock = Math.ceil(spd * 21); 
      // Asumsi Max Stock (45 hari coverage)
      const maxStock = Math.ceil(spd * 45);
      
      let saranPo = 0;
      if (p.stok <= minStock) {
        saranPo = maxStock - p.stok;
        if (saranPo < 0) saranPo = 0;
      }

      // 1. Calculate WTD dynamically from DailySales (last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const dynamicWtd = p.dailySales
        .filter(ds => ds.date >= sevenDaysAgo)
        .reduce((sum, ds) => sum + ds.qtySold, 0);

      // 2. Kalkulasi Tren
      let trend = "STABIL";
      if (dynamicWtd > (p.sales_mtd / 4)) {
        trend = "NAIK";
      } else if (dynamicWtd === 0 && p.stok > 3) {
        // Jika tidak ada penjualan seminggu terakhir tapi stok masih ada, berarti barang ini MATI/TURUN
        trend = "TURUN";
      }

      return {
        id: p.id,
        sku: p.sku,
        description: p.description,
        dept: p.dept,
        stok: p.stok,
        sales_wtd: dynamicWtd,
        sales_mtd: p.sales_mtd,
        spd,
        minStock,
        maxStock,
        saranPo,
        trend,
        dailySales: p.dailySales.map(ds => ({
          date: ds.date.toISOString(),
          qty: ds.qtySold
        }))
      };
    });

    return NextResponse.json({
      success: true,
      data: pivotData,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Error fetching PO pivot data:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
