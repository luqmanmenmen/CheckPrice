import { NextRequest, NextResponse } from "next/server";
import { prisma as db } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ identifier: string }> }
) {
  try {
    const { identifier } = await params;
    const cleaned = identifier.trim();
    let product;
    // 1. Exact match by SKU, Barcode, or Article
    product = await db.product.findFirst({ where: { sku: cleaned } });
    
    if (!product && cleaned) {
      product = await db.product.findFirst({ where: { barcode: cleaned } });
    }

    if (!product && cleaned) {
      product = await db.product.findFirst({ where: { article: cleaned } });
    }

    // Helper to auto-remove promo if expired
    const checkAndCleanPromo = async (p: any) => {
      if (p && p.toDate) {
        const toDateObj = new Date(p.toDate);
        if (!isNaN(toDateObj.getTime())) {
          toDateObj.setHours(23, 59, 59, 999);
          if (new Date() > toDateObj) {
            try {
              // Promo expired, update DB to remove promo fields
              const updated = await db.product.update({
                where: { id: p.id },
                data: {
                  hargaPromo: null,
                  diskon: null,
                  discountType: null,
                  acara: null,
                  fromDate: null,
                  toDate: null
                }
              });
              return updated;
            } catch (e) {
              console.error("Auto-clean promo error:", e);
            }
          }
        }
      }
      return p;
    };

    // 2. Try searching by name (description)
    if (!product && cleaned) {
      const { searchParams } = new URL(request.url);
      const page = parseInt(searchParams.get('page') || '1', 10);
      const limit = 10;
      const skip = (page - 1) * limit;

      const [nameMatches, total] = await Promise.all([
        db.product.findMany({
          where: { description: { contains: cleaned, mode: 'insensitive' } },
          skip,
          take: limit,
          orderBy: { description: 'asc' }
        }),
        db.product.count({
          where: { description: { contains: cleaned, mode: 'insensitive' } }
        })
      ]);
      
      if (total > 1 || page > 1) {
        const cleanedMatches = await Promise.all(nameMatches.map(checkAndCleanPromo));
        return NextResponse.json({ 
          data: cleanedMatches,
          meta: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
          }
        });
      } else if (total === 1 && page === 1) {
        product = nameMatches[0];
      }
    }

    if (!product) {
      const total = await db.product.count();
      return NextResponse.json(
        {
          error: `Produk tidak ditemukan untuk: "${cleaned}"`,
          hint: `Total produk di database: ${total}. Pastikan SKU atau nama sudah benar.`,
        },
        { status: 404 }
      );
    }

    product = await checkAndCleanPromo(product);

    return NextResponse.json({ data: product });
  } catch (error) {
    console.error("Error fetching product:", error);
    return NextResponse.json(
      { error: "Terjadi kesalahan internal: " + String(error) },
      { status: 500 }
    );
  }
}
