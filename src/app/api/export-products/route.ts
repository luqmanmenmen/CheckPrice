import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET() {
  try {
    // Ambil data produk yang diperlukan untuk offline scanner
    const products = await prisma.product.findMany({
      select: {
        sku: true,
        description: true,
        hargaNormal: true,
        hargaPromo: true,
        toDate: true,
      },
    });

    const parsedProducts = products.map(p => {
      // Parse description for color and size
      // Format usually: NAME:COLOR:SIZE:...
      const parts = p.description.split(":");
      const name = parts[0]?.trim() || "";
      const color = parts[1]?.trim() || "";
      const size = parts[2]?.trim() || "";
      
      return {
        sku: p.sku,
        name,
        color,
        size,
        hargaNormal: p.hargaNormal,
        hargaPromo: p.hargaPromo,
        toDate: p.toDate ? p.toDate.toISOString() : null
      };
    });

    return NextResponse.json({ success: true, data: parsedProducts });
  } catch (error) {
    console.error("Export Products Error:", error);
    return NextResponse.json({ success: false, error: "Gagal mengambil data produk" }, { status: 500 });
  }
}
