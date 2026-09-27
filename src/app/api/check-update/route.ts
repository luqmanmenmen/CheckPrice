import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET() {
  try {
    // Cari history sinkronisasi terakhir (PQ atau PROMO)
    const latestSync = await prisma.syncHistory.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true }
    });

    // Kembalikan timestamp dalam bentuk milidetik
    return NextResponse.json({ 
      success: true, 
      lastUpdate: latestSync ? latestSync.createdAt.getTime() : 0 
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: "Gagal cek update" }, { status: 500 });
  }
}
