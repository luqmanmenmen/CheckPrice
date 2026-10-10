import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

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
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: "Gagal cek update" }, { status: 500 });
  }
}
