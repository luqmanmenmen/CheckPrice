import { NextRequest, NextResponse } from "next/server";
import { prisma as db } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Mengunduh tabel pre-computed `CatalogArticle` (hasil olahan Python `build_catalog_index.py`)
 * secara cepat dalam ~2 chunk (~9.000 model/chunk) untuk mengisi `db.models` di HP < 1 detik!
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const chunk = Math.max(0, parseInt(searchParams.get("chunk") || "0", 10));
    const limit = Math.min(9500, Math.max(500, parseInt(searchParams.get("limit") || "9000", 10)));
    const skip = chunk * limit;

    const rows = await db.catalogArticle.findMany({
      orderBy: { sortRank: "asc" },
      skip,
      take: limit,
      select: {
        key: true,
        sku: true,
        barcode: true,
        article: true,
        description: true,
        brand: true,
        dept: true,
        brandGroup: true,
        subBrand: true,
        categoryKey: true,
        color: true,
        size: true,
        stok: true,
        hargaNormal: true,
        hargaPromo: true,
        diskon: true,
        discountType: true,
        acara: true,
        toDate: true,
        imageUrl: true,
        articleGroupCount: true,
        articleTotalStok: true,
        articleColors: true,
        articleSizes: true,
        articleHasPromo: true,
        articlePromoLabel: true,
      },
    });

    return NextResponse.json({
      success: true,
      chunk,
      count: rows.length,
      data: rows,
    });
  } catch (error: any) {
    console.error("[API /catalog-models] Error:", error);
    return NextResponse.json(
      { success: false, error: "Gagal mengambil model katalog Python." },
      { status: 500 }
    );
  }
}
