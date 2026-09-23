import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET() {
  try {
    // 1. Get Active Promos
    const activePromos = await prisma.product.findMany({
      where: { hargaPromo: { not: null } },
      // take: 200 // removed limit so we can aggregate properly
    });

    const items = [];
    const eventMap = new Map();
    const deptMap = new Map();

    let totalAvgBefore = 0;
    let totalAvgDuring = 0;

    for (const product of activePromos) {
      if (!product.fromDate) continue;
      
      const sales = await prisma.dailySales.findMany({
        where: { productId: product.id }
      });

      if (sales.length === 0) continue;

      let salesBefore = 0;
      let daysBefore = 0;
      let salesDuring = 0;
      let daysDuring = 0;

      const promoDate = new Date(product.fromDate).getTime();

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

      const avgBefore = daysBefore > 0 ? salesBefore / daysBefore : 0;
      const avgDuring = daysDuring > 0 ? salesDuring / daysDuring : 0;
      
      let percentage = 0;
      if (avgBefore > 0) {
        percentage = ((avgDuring - avgBefore) / avgBefore) * 100;
      } else if (avgDuring > 0) {
        percentage = 100; 
      }

      const itemData = {
        id: product.id,
        sku: product.sku,
        description: product.description,
        dept: product.dept || 'Tanpa Departemen',
        acara: product.acara || 'Promo Reguler',
        hargaNormal: product.hargaNormal,
        hargaPromo: product.hargaPromo,
        promoStart: product.fromDate,
        promoEnd: product.toDate,
        avgBefore,
        avgDuring,
        percentage
      };

      items.push(itemData);

      totalAvgBefore += avgBefore;
      totalAvgDuring += avgDuring;

      // Group by Event (Acara)
      if (!eventMap.has(itemData.acara)) {
        eventMap.set(itemData.acara, {
          acara: itemData.acara,
          itemCount: 0,
          totalAvgBefore: 0,
          totalAvgDuring: 0,
        });
      }
      const ev = eventMap.get(itemData.acara);
      ev.itemCount++;
      ev.totalAvgBefore += avgBefore;
      ev.totalAvgDuring += avgDuring;

      // Group by Dept
      if (!deptMap.has(itemData.dept)) {
        deptMap.set(itemData.dept, {
          dept: itemData.dept,
          itemCount: 0,
          totalAvgBefore: 0,
          totalAvgDuring: 0,
        });
      }
      const dp = deptMap.get(itemData.dept);
      dp.itemCount++;
      dp.totalAvgBefore += avgBefore;
      dp.totalAvgDuring += avgDuring;
    }

    // Sort items by percentage
    items.sort((a, b) => b.percentage - a.percentage);

    // Finalize Groupings
    const groupedByEvent = Array.from(eventMap.values()).map(ev => {
      let percentage = 0;
      if (ev.totalAvgBefore > 0) percentage = ((ev.totalAvgDuring - ev.totalAvgBefore) / ev.totalAvgBefore) * 100;
      else if (ev.totalAvgDuring > 0) percentage = 100;
      return { ...ev, percentage };
    }).sort((a, b) => b.percentage - a.percentage);

    const groupedByDept = Array.from(deptMap.values()).map(dp => {
      let percentage = 0;
      if (dp.totalAvgBefore > 0) percentage = ((dp.totalAvgDuring - dp.totalAvgBefore) / dp.totalAvgBefore) * 100;
      else if (dp.totalAvgDuring > 0) percentage = 100;
      return { ...dp, percentage };
    }).sort((a, b) => b.percentage - a.percentage);

    // Calculate overall percentage
    let overallPercentage = 0;
    if (totalAvgBefore > 0) {
      overallPercentage = ((totalAvgDuring - totalAvgBefore) / totalAvgBefore) * 100;
    } else if (totalAvgDuring > 0) {
      overallPercentage = 100;
    }

    const overallSummary = {
      totalItems: items.length,
      totalAvgBefore: totalAvgBefore,
      totalAvgDuring: totalAvgDuring,
      overallPercentage
    };

    return NextResponse.json({ 
      success: true, 
      overallSummary,
      groupedByEvent,
      groupedByDept,
      itemLevel: items
    });
  } catch (error) {
    console.error('Error in promo analysis:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
