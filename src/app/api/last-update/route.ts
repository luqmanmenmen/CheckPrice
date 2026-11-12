import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

let cachedPayload: any = null;
let cachedTimestamp = 0;
const LAST_UPDATE_CACHE_TTL_MS = 15000;

export async function GET() {
  try {
    const now = Date.now();
    if (cachedPayload && now - cachedTimestamp < LAST_UPDATE_CACHE_TTL_MS) {
      return NextResponse.json(cachedPayload, {
        headers: {
          'Cache-Control': 'public, max-age=10, s-maxage=15, stale-while-revalidate=30',
        }
      });
    }

    // 1. Ambil waktu update produk terakhir dari tabel Product + 10 riwayat paralel
    const [lastUpdatedProduct, recentHistories] = await Promise.all([
      prisma.product.findFirst({
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true }
      }),
      prisma.syncHistory.findMany({
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
      })
    ]);

    // 3. Ambil riwayat terakhir masing-masing pilar
    const lastMds = recentHistories.find(h => h.type === 'MDS_BISA_SYNC' || h.type === 'STOCK_SYNC');
    const lastPhoto = recentHistories.find(h => h.type === 'PHOTO_SYNC');
    const lastPromo = recentHistories.find(h => h.type === 'UPDATE_PROMO' || h.type === 'PROMO_MINGGUAN');

    const sanitizeLabel = (val?: string | null) =>
      val ? val.replace(/MDS\s*BISA/gi, 'by luqman org').replace(/StoreHub/gi, 'by luqman org') : val;

    const cleanHistories = recentHistories.map(h => ({
      ...h,
      type: h.type === 'MDS_BISA_SYNC' ? 'BY_LUQMAN_ORG_SYNC' : h.type,
      fileName: sanitizeLabel(h.fileName),
    }));

    const payload = {
      success: true,
      lastUpdate: lastUpdatedProduct ? lastUpdatedProduct.updatedAt : null,
      histories: cleanHistories,
      pillars: {
        mdsBisa: lastMds ? {
          type: 'BY_LUQMAN_ORG_SYNC',
          fileName: sanitizeLabel(lastMds.fileName),
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
    };

    cachedPayload = payload;
    cachedTimestamp = now;

    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': 'public, max-age=10, s-maxage=15, stale-while-revalidate=30',
      }
    });
  } catch (error) {
    console.error('Error fetching last update & history:', error);
    if (cachedPayload) {
      return NextResponse.json(cachedPayload);
    }
    return NextResponse.json({ 
      success: false, 
      lastUpdate: null, 
      histories: [],
      pillars: { mdsBisa: null, photos: null, promo: null } 
    }, { status: 500 });
  }
}
