import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    // Endpoint legacy dibatasi ketat (tidak pernah full-dump 310rb baris Postgres agar Disk IO aman)
    const products = await prisma.product.findMany({
      orderBy: { id: "desc" },
      take: 2000,
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

    return NextResponse.json(
      { success: true, data: products },
      {
        headers: {
          "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
        },
      }
    );
  } catch (error: any) {
    console.error("Error fetching all products for sync:", error);
    return NextResponse.json(
      { success: false, error: "Gagal mengambil data sinkronisasi." },
      { status: 500 }
    );
  }
}
