import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

let cachedLastUpdateMs = 0;
let cachedAtMs = 0;
const CHECK_CACHE_TTL_MS = 15000;

export async function GET() {
  try {
    const now = Date.now();
    if (cachedLastUpdateMs > 0 && now - cachedAtMs < CHECK_CACHE_TTL_MS) {
      return NextResponse.json({
        success: true,
        lastUpdate: cachedLastUpdateMs,
        cached: true,
      }, {
        headers: {
          'Cache-Control': 'public, max-age=10, s-maxage=15, stale-while-revalidate=30',
        }
      });
    }

    // Ambil dari Product_updatedAt_idx (< 1ms Index Only Scan)
    const latestProduct = await prisma.product.findFirst({
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true }
    });

    cachedLastUpdateMs = latestProduct ? latestProduct.updatedAt.getTime() : 0;
    cachedAtMs = now;

    // Kembalikan timestamp dalam bentuk milidetik
    return NextResponse.json({ 
      success: true, 
      lastUpdate: cachedLastUpdateMs 
    }, {
      headers: {
        'Cache-Control': 'public, max-age=10, s-maxage=15, stale-while-revalidate=30',
      }
    });
  } catch (error) {
    if (cachedLastUpdateMs > 0) {
      return NextResponse.json({ success: true, lastUpdate: cachedLastUpdateMs, stale: true });
    }
    return NextResponse.json({ success: false, error: "Gagal cek update" }, { status: 500 });
  }
}
