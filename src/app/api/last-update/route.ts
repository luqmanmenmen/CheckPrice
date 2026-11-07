import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    // 1. Ambil waktu update produk terakhir dari tabel Product
    const lastUpdatedProduct = await prisma.product.findFirst({
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true }
    });

    // 2. Ambil 10 riwayat sinkronisasi terakhir dari tabel SyncHistory
    const recentHistories = await prisma.syncHistory.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        user: {
          select: {
            name: true,
            nik: true,
            role: true
          }
        }
      }
    });

    // 3. Ambil riwayat terakhir masing-masing pilar
    const lastMds = recentHistories.find(h => h.type === 'MDS_BISA_SYNC' || h.type === 'STOCK_SYNC');
    const lastPhoto = recentHistories.find(h => h.type === 'PHOTO_SYNC');
    const lastPromo = recentHistories.find(h => h.type === 'UPDATE_PROMO' || h.type === 'PROMO_MINGGUAN');

    return NextResponse.json({
      success: true,
      lastUpdate: lastUpdatedProduct ? lastUpdatedProduct.updatedAt : null,
      histories: recentHistories,
      pillars: {
        mdsBisa: lastMds ? {
          type: lastMds.type,
          fileName: lastMds.fileName,
          status: lastMds.status,
          records: lastMds.records,
          createdAt: lastMds.createdAt
        } : null,
        photos: lastPhoto ? {
          type: lastPhoto.type,
          fileName: lastPhoto.fileName,
          status: lastPhoto.status,
          records: lastPhoto.records,
          createdAt: lastPhoto.createdAt
        } : null,
        promo: lastPromo ? {
          type: lastPromo.type,
          fileName: lastPromo.fileName,
          status: lastPromo.status,
          records: lastPromo.records,
          createdAt: lastPromo.createdAt
        } : null,
      }
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
      }
    });
  } catch (error) {
    console.error('Error fetching last update & history:', error);
    return NextResponse.json({ 
      success: false, 
      lastUpdate: null, 
      histories: [],
      pillars: { mdsBisa: null, photos: null, promo: null } 
    }, { status: 500 });
  }
}
