import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    // Ambil data produk yang diperlukan untuk offline scanner & public kiosk
    const products = await prisma.product.findMany({
      select: {
        sku: true,
        barcode: true,
        article: true,
        brand: true,
        dept: true,
        description: true,
        color: true,
        size: true,
        hargaNormal: true,
        hargaPromo: true,
        diskon: true,
        discountType: true,
        acara: true,
        stok: true,
        toDate: true,
      },
    });

    const parsedProducts = products.map((p) => {
      // Parse description for color and size jika kolom kosong
      const parts = p.description ? p.description.split(":") : [];
      const name = parts[0]?.trim() || p.description || "";
      const color = p.color || (parts.length > 1 ? parts[1].trim() : "");
      const size = p.size || (parts.length > 2 ? parts[2].trim() : "");

      return {
        sku: p.sku,
        barcode: p.barcode || null,
        article: p.article || null,
        name,
        description: p.description || name,
        brand: p.brand || null,
        dept: p.dept || null,
        color,
        size,
        hargaNormal: p.hargaNormal,
        hargaPromo: p.hargaPromo,
        diskon: p.diskon || null,
        discountType: p.discountType || null,
        acara: p.acara || null,
        stok: p.stok || 0,
        toDate: p.toDate || null,
      };
    });

    return NextResponse.json(
      { success: true, data: parsedProducts },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
          "Pragma": "no-cache",
          "Expires": "0",
        },
      }
    );
  } catch (error) {
    console.error("Export Products Error:", error);
    return NextResponse.json({ success: false, error: "Gagal mengambil data produk" }, { status: 500 });
  }
}
