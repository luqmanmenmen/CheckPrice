/**
 * API Route: POST /api/admin/trigger/photos
 * Trigger 2: Sync foto produk dari matahari.com → Supabase
 * Memanggil logika yang sama dengan sync_matahari_images.js
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';

const COLLECTIONS = [
  'suko',
  'hp-brand-suko',
  'new-year-new-style-all-suko-mulai-dari-79rb',
  'promo-tengah-bulan-best-of-suko',
];

const CDN_BASE = 'https://cdn.shopify.com/s/files/1/0666/9212/0727/files';

async function checkUrl(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(3000),
    });
    return res.status === 200;
  } catch {
    return false;
  }
}

async function probeCdnPhotos(skus: string[]): Promise<string[]> {
  for (const sku of skus) {
    if (!sku || sku.length < 6) continue;
    const url1 = `${CDN_BASE}/${sku}-1.jpg`;
    const exists = await checkUrl(url1);
    if (exists) {
      const angles = await Promise.all([2, 3, 4, 5, 6].map(async (a) => {
        const u = `${CDN_BASE}/${sku}-${a}.jpg`;
        return (await checkUrl(u)) ? u : null;
      }));
      return [url1, ...angles.filter(Boolean) as string[]];
    }
  }
  return [];
}

export async function POST(req: Request) {
  // Auth check
  const cookieStore = await cookies();
  const token = cookieStore.get('token')?.value;
  const legacySessionId = cookieStore.get('sessionId')?.value;

  let user = null;
  if (token) {
    const session = await verifyToken(token);
    if (session?.userId) {
      user = await prisma.user.findUnique({ where: { id: session.userId } });
    }
  } else if (legacySessionId) {
    user = await prisma.user.findFirst({ where: { sessionId: legacySessionId, status: 'ACTIVE' } });
  }

  if (!user) return NextResponse.json({ success: false, error: 'Unauthorized - Silakan login kembali' }, { status: 401 });
  if (user.role !== 'SUPERVISOR') {
    return NextResponse.json({ success: false, error: 'Forbidden - Khusus Supervisor' }, { status: 403 });
  }

  console.log(`[TRIGGER-PHOTOS] Dimulai oleh: ${user.nik}`);

  try {
    // Ambil semua produk dari Shopify catalog
    const productMap = new Map<string, { imageUrl: string; images: string[] }>();

    for (const col of COLLECTIONS) {
      let page = 1;
      while (true) {
        const res = await fetch(
          `https://matahari.com/collections/${col}/products.json?limit=250&page=${page}`,
          { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }
        );
        if (!res.ok) break;
        const data = await res.json();
        const products = data?.products || [];
        if (products.length === 0) break;

        for (const product of products) {
          const images: string[] = (product.images || []).map((img: any) => img.src).filter(Boolean);
          const imageUrl = images[0] || '';
          
          // Extract SKU dari variants
          for (const variant of product.variants || []) {
            const sku = variant.sku?.trim();
            if (sku && !productMap.has(sku)) {
              productMap.set(sku, { imageUrl, images });
            }
          }
          
          // Juga map by product handle sebagai fallback
          const handle = product.handle?.toUpperCase();
          if (handle && !productMap.has(handle)) {
            productMap.set(handle, { imageUrl, images });
          }
        }
        page++;
      }
    }

    console.log(`[TRIGGER-PHOTOS] Ditemukan ${productMap.size} produk dari matahari.com`);

    // Match dengan produk di DB
    const dbProducts = await prisma.product.findMany({
      select: { id: true, sku: true, article: true },
    });

    const stats = { total: dbProducts.length, updated: 0, cdnFallback: 0, noPhoto: 0 };

    for (const product of dbProducts) {
      let photoData = productMap.get(product.sku);
      
      // Fallback: cari by article (style code)
      if (!photoData && product.article) {
        photoData = productMap.get(product.article);
      }

      if (photoData && photoData.imageUrl) {
        await prisma.product.update({
          where: { id: product.id },
          data: {
            imageUrl: photoData.imageUrl,
            images: photoData.images,
          },
        });
        stats.updated++;
      } else {
        // Fallback: coba CDN probe langsung dengan SKU/article
        const trySkus = [product.sku, product.article].filter(Boolean) as string[];
        const cdnPhotos = await probeCdnPhotos(trySkus);
        
        if (cdnPhotos.length > 0) {
          await prisma.product.update({
            where: { id: product.id },
            data: { imageUrl: cdnPhotos[0], images: cdnPhotos },
          });
          stats.cdnFallback++;
        } else {
          stats.noPhoto++;
        }
      }
    }

    // Log sync
    await prisma.syncHistory.create({
      data: {
        userId: user.id,
        type: 'PHOTO_SYNC',
        fileName: `photo-sync-${new Date().toISOString().slice(0, 10)}`,
        status: 'SUCCESS',
        records: stats.updated + stats.cdnFallback,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Foto disinkronkan: ${stats.updated + stats.cdnFallback} produk`,
      stats,
    });

  } catch (err: any) {
    console.error('[TRIGGER-PHOTOS] Error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
