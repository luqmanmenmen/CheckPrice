import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET() {
  try {
    const activePromos = await prisma.product.findMany({
      where: { hargaPromo: { not: null } },
      take: 50 // limit to 50 for performance
    });

    const results = [];

    for (const product of activePromos) {
      if (!product.fromDate) continue;

      const promoStartStr = product.fromDate;
      
      // We rely on DailySales which stores date as string YYYY-MM-DD
      const sales = await prisma.dailySales.findMany({
        where: { productId: product.id }
      });

      if (sales.length === 0) continue;

      let salesBefore = 0;
      let daysBefore = 0;
      let salesDuring = 0;
      let daysDuring = 0;

      const promoDate = new Date(promoStartStr).getTime();

      for (const s of sales) {
        const saleDate = new Date(s.date).getTime();
        if (saleDate < promoDate) {
          salesBefore += s.qtySold;
          daysBefore++;
        } else {
          salesDuring += s.qtySold;
          daysDuring++;
        }
      }

      // If we don't have before days, we assume 1 to avoid division by zero
      const avgBefore = daysBefore > 0 ? salesBefore / daysBefore : 0;
      const avgDuring = daysDuring > 0 ? salesDuring / daysDuring : 0;
      
      let percentage = 0;
      if (avgBefore > 0) {
        percentage = ((avgDuring - avgBefore) / avgBefore) * 100;
      } else if (avgDuring > 0) {
        percentage = 100; // Infinity effectively, but cap to 100% for display
      }

      results.push({
        id: product.id,
        sku: product.sku,
        description: product.description,
        hargaNormal: product.hargaNormal,
        hargaPromo: product.hargaPromo,
        promoStart: product.fromDate,
        promoEnd: product.toDate,
        avgBefore,
        avgDuring,
        percentage
      });
    }

    results.sort((a, b) => b.percentage - a.percentage);

    return NextResponse.json({ success: true, data: results });
  } catch (error) {
    console.error('Error in promo analysis:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
