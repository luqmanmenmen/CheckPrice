import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    // Cari produk yang paling baru diupdate
    const latestProduct = await prisma.product.findFirst({
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true }
    });

    // Kembalikan timestamp dalam bentuk milidetik
    return NextResponse.json({ 
      success: true, 
      lastUpdate: latestProduct ? latestProduct.updatedAt.getTime() : 0 
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
      }
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: "Gagal cek update" }, { status: 500 });
  }
}
