import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(request: Request) {
  try {
    // 1. Get all products with significant sales (MTD > 5)
    const fastMovingProducts = await prisma.product.findMany({
      where: {
        sales_mtd: { gt: 5 }
      }
    });

    const CYCLE_DAYS = 14;
    const LEAD_TIME = 7;
    const SAFETY_DAYS = 3;
    let generatedCount = 0;

    for (const product of fastMovingProducts) {
      // ADS based on 14 days assumption
      const ads = product.sales_mtd / 14; 
      
      const safetyStock = Math.ceil(ads * SAFETY_DAYS);
      const minStock = Math.ceil((ads * LEAD_TIME) + safetyStock);
      const maxStock = Math.ceil(minStock + (ads * CYCLE_DAYS));

      if (product.stok <= minStock) {
        const qtyToOrder = Math.max(0, maxStock - product.stok);
        
        if (qtyToOrder > 0) {
          // Check if there's already an open suggestion
          const existing = await prisma.poSuggestion.findFirst({
            where: {
              productId: product.id,
              status: 'OPEN'
            }
          });

          if (!existing) {
            const reason = `Dalam 14 hari terakhir terjual ${product.sales_mtd} pcs (Rata-rata ${ads.toFixed(1)} pcs/hari). Sisa stok ${product.stok} pcs. Disarankan pesan ${qtyToOrder} pcs untuk target ${CYCLE_DAYS} hari.`;
            
            await prisma.poSuggestion.create({
              data: {
                productId: product.id,
                suggestedQty: qtyToOrder,
                reason: reason,
              }
            });
            generatedCount++;
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Berhasil men-generate ${generatedCount} saran PO baru.`
    });

  } catch (error) {
    console.error('Error generating PO suggestions:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
