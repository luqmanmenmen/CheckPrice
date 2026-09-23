import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get("date");
    
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

    const startOfDay = new Date(`${targetDateStr}T00:00:00.000Z`);
    const endOfDay = new Date(`${targetDateStr}T23:59:59.999Z`);

    // Fetch the sales for the target date
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

    const reportItems = salesData.map(sale => {
      const p = sale.product;
      const isPromo = p.hargaPromo !== null && p.hargaPromo > 0;
      
      // Hitung harga satuan (Promo vs Normal)
      let unitPrice = 0;
      let status = "NORMAL";
      
      if (isPromo) {
        unitPrice = p.hargaPromo!;
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
