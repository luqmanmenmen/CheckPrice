import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// In-memory cache per chunk agar hemat query Supabase dan bebas limit payload 4.5MB Vercel
const chunkCache = new Map<string, { data: any[]; hasMore: boolean; lastUpdate: number }>();

function formatProductRow(p: any) {
  const parts = p.description ? p.description.split(":") : [];
  let name = parts[0]?.trim() || p.description || "";
  const art = (p.article || "").trim();

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
    images: p.imageUrl ? [p.imageUrl] : [],
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const chunk = Math.max(0, parseInt(searchParams.get("chunk") || "0", 10) || 0);
    // Batasi maksimal 12.000 baris per chunk (~2.0 MB JSON) agar 100% aman di bawah batas 4.5MB Vercel Serverless
    const limit = Math.min(12000, Math.max(1000, parseInt(searchParams.get("limit") || "10000", 10) || 10000));
    const skip = chunk * limit;

    // 1. Ambil timestamp update produk paling baru (~40ms)
    const latestProduct = await prisma.product.findFirst({
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true }
    });
    const currentLastUpdate = latestProduct ? latestProduct.updatedAt.getTime() : 0;

    const cacheKey = `${chunk}_${limit}`;
    const cached = chunkCache.get(cacheKey);
    if (cached && cached.lastUpdate === currentLastUpdate && cached.data.length > 0) {
      return NextResponse.json(
        {
          success: true,
          data: cached.data,
          chunk,
          limit,
          hasMore: cached.hasMore,
          version: currentLastUpdate,
          cached: true,
        },
        {
          headers: {
            "Cache-Control": "public, max-age=60, s-maxage=120, stale-while-revalidate=300",
          },
        }
      );
    }

    // 2. Urutkan berdasarkan `stok DESC` terlebih dahulu agar Chunk 0 otomatis membawa
    //    SELURUH 5.895 produk yang ada stok fisiknya di toko + produk promo aktif!
    const products = await prisma.product.findMany({
      orderBy: [{ stok: 'desc' }, { sku: 'asc' }],
      skip,
      take: limit,
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
      },
    });

    const parsedProducts = products.map(formatProductRow);
    const hasMore = products.length === limit;

    // Batasi ukuran Map cache maksimal 12 chunk agar RAM serverless selalu lega
    if (chunkCache.size > 12) {
      chunkCache.clear();
    }
    chunkCache.set(cacheKey, {
      data: parsedProducts,
      hasMore,
      lastUpdate: currentLastUpdate,
    });

    return NextResponse.json(
      {
        success: true,
        data: parsedProducts,
        chunk,
        limit,
        hasMore,
        version: currentLastUpdate,
      },
      {
        headers: {
          "Cache-Control": "public, max-age=60, s-maxage=120, stale-while-revalidate=300",
        },
      }
    );
  } catch (error) {
    console.error("Export Products Error:", error);
    return NextResponse.json({ success: false, error: "Gagal mengambil data produk" }, { status: 500 });
  }
}
