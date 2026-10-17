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
        imageUrl: true,
        images: true,
      },
    });

    const parsedProducts = products.map((p) => {
      const parts = p.description ? p.description.split(":") : [];
      let name = parts[0]?.trim() || p.description || "";
      const art = (p.article || "").trim();

      // Bersihkan kode artikel yang menempel di ujung nama produk agar ramah pelanggan
      if (art) {
        const words = art.split(/\s+/);
        const codesToRemove: string[] = [];
        if (words.length <= 2) codesToRemove.push(art);
        if (words.length > 1) codesToRemove.push(words[words.length - 1]);

        const descWords = name.split(/\s+/);
        const lastDescWord = descWords[descWords.length - 1];
        if (
          lastDescWord &&
          /^[A-Z0-9\-_]{3,12}$/i.test(lastDescWord) &&
          art.toLowerCase().includes(lastDescWord.toLowerCase())
        ) {
          codesToRemove.push(lastDescWord);
        }

        for (const code of Array.from(new Set(codesToRemove))) {
          if (!code || code.length < 2) continue;
          const esc = code.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
          name = name.replace(new RegExp(`[\\s\\-_/]+${esc}$`, "i"), "");
          name = name.replace(new RegExp(`\\b${esc}\\b`, "i"), "");
        }
        name = name.replace(/\s{2,}/g, " ").replace(/[\s\-_/]+$/, "").trim();
      }

      const color = p.color || (parts.length > 1 ? parts[1].trim() : "");
      const size = p.size || (parts.length > 2 ? parts[2].trim() : "");

      return {
        sku: p.sku,
        barcode: p.barcode || null,
        article: p.article || null,
        name: name || parts[0]?.trim() || p.description || "",
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
        imageUrl: p.imageUrl || null,
        images: p.images && p.images.length > 0 ? p.images : (p.imageUrl ? [p.imageUrl] : []),
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
