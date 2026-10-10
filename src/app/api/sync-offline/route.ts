import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET() {
  try {
    const products = await prisma.product.findMany({
      select: {
        sku: true,
        article: true,
        barcode: true,
        description: true,
        hargaNormal: true,
        hargaPromo: true,
        discountType: true,
        stok: true,
        acara: true,
        dept: true,
        brand: true,
        toDate: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ success: true, data: products });
  } catch (error: any) {
    console.error("Error fetching all products for sync:", error);
    return NextResponse.json(
      { success: false, error: "Gagal mengambil data sinkronisasi." },
      { status: 500 }
    );
  }
}
