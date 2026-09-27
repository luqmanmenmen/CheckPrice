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
      
      let price = p.hargaNormal;
      // Cek promo aktif
      if (p.hargaPromo && p.hargaPromo > 0 && p.toDate) {
         const toDateObj = new Date(p.toDate);
         toDateObj.setHours(23, 59, 59, 999);
         if (new Date() <= toDateObj) {
            price = p.hargaPromo;
         }
      }

      return {
        sku: p.sku,
        name,
        color,
        size,
        price
      };
    });

    return NextResponse.json({ success: true, data: parsedProducts });
  } catch (error) {
    console.error("Export Products Error:", error);
    return NextResponse.json({ success: false, error: "Gagal mengambil data produk" }, { status: 500 });
  }
}
