import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST() {
  try {
    const today = new Date();
    // Start of today so anything before today is expired
    today.setHours(0, 0, 0, 0);
    
    // Find how many products have expired promos
    // We check toDate < today and hargaPromo is not null
    // But since the format of toDate is text (yyyy-mm-dd) or Date, wait, let's check schema.
    // In schema, toDate is String!
    // If it's a string like "2026-09-23", we can just compare string lexicographically if it's ISO format,
    // but the DB stores it as YYYY-MM-DD. So string comparison works!
    
    // Let's just fetch all promos, and filter them in JS to be safe, then update
    const activePromos = await prisma.product.findMany({
      where: { hargaPromo: { not: null } }
    });
    
    const now = new Date();
    now.setHours(0, 0, 0, 0); // today start
    
    const expiredIds: number[] = [];
    
    for (const p of activePromos) {
      if (p.toDate) {
        const toDateObj = new Date(p.toDate);
        if (!isNaN(toDateObj.getTime())) {
          toDateObj.setHours(23, 59, 59, 999);
          if (new Date() > toDateObj) {
            expiredIds.push(p.id);
          }
        }
      }
    }
    
    if (expiredIds.length > 0) {
      await prisma.product.updateMany({
        where: { id: { in: expiredIds } },
        data: {
          hargaPromo: null,
          diskon: null,
          discountType: null,
          acara: null,
          fromDate: null,
          toDate: null
        }
      });
    }

    return NextResponse.json({
      success: true,
      cleanedCount: expiredIds.length,
      message: `Berhasil membersihkan ${expiredIds.length} promo kadaluarsa.`
    });
  } catch (error) {
    console.error('Error cleaning promos:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
