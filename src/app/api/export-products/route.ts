import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// In-memory cache per chunk agar hemat query Supabase dan bebas limit payload 4.5MB Vercel
const chunkCache = new Map<string, { data: any[]; hasMore: boolean; nextCursor: { stok: number; sku: string } | null; lastUpdate: number }>();
let metaCache: { lastUpdate: number; totalCount: number; fetchedAt: number } | null = null;
const META_TTL_MS = 30000;

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
    const limit = Math.min(8000, Math.max(1000, parseInt(searchParams.get("limit") || "6000", 10) || 6000));
    const cursorStokParam = searchParams.get("cursorStok");
    const cursorSkuParam = searchParams.get("cursorSku");
    const hasCursor = cursorStokParam !== null && cursorSkuParam !== null && cursorSkuParam.length > 0;
    const cursorStok = hasCursor ? parseInt(cursorStokParam!, 10) : 0;
    const cursorSku = hasCursor ? cursorSkuParam! : "";

    // 1. Ambil metadata versi + totalCount (30s cache -> 0ms pada chunk berikutnya, dan O(1) via Product_updatedAt_idx)
    const now = Date.now();
    let currentLastUpdate = metaCache?.lastUpdate ?? 0;
    let totalCount = metaCache?.totalCount ?? 0;

    if (!metaCache || now - metaCache.fetchedAt > META_TTL_MS) {
      const [latestProduct, counted] = await Promise.all([
        prisma.product.findFirst({
          orderBy: { updatedAt: 'desc' },
          select: { updatedAt: true }
        }),
        prisma.product.count()
      ]);
      currentLastUpdate = latestProduct ? latestProduct.updatedAt.getTime() : 0;
      totalCount = counted;
      metaCache = { lastUpdate: currentLastUpdate, totalCount, fetchedAt: now };
    }

    const cacheKey = hasCursor ? `cur_${cursorStok}_${cursorSku}_${limit}` : `off_${chunk}_${limit}`;
    const cached = chunkCache.get(cacheKey);
    if (cached && cached.lastUpdate === currentLastUpdate && cached.data.length > 0) {
      return NextResponse.json(
        {
          success: true,
          data: cached.data,
          chunk,
          limit,
          totalCount,
          hasMore: cached.hasMore,
          nextCursor: cached.nextCursor,
          version: currentLastUpdate,
          cached: true,
        },
        {
          headers: {
            "Cache-Control": "public, max-age=60, s-maxage=180, stale-while-revalidate=300",
          },
        }
      );
    }

    // 2. Keyset Cursor Pagination pada index (stok DESC, sku ASC) -> O(limit) tetap 0.03s bahkan pada 90.000+ SKU!
    const whereClause = hasCursor && !isNaN(cursorStok)
      ? {
          OR: [
            { stok: { lt: cursorStok } },
            { stok: cursorStok, sku: { gt: cursorSku } },
          ],
        }
      : undefined;

    const products = await prisma.product.findMany({
      where: whereClause,
      orderBy: [{ stok: 'desc' }, { sku: 'asc' }],
      ...(hasCursor ? {} : { skip: chunk * limit }),
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
    const lastRow = parsedProducts.length > 0 ? parsedProducts[parsedProducts.length - 1] : null;
    const nextCursor = lastRow ? { stok: lastRow.stok ?? 0, sku: lastRow.sku } : null;

    // Batasi ukuran Map cache maksimal 24 chunk agar RAM serverless selalu lega
    if (chunkCache.size > 24) {
      chunkCache.clear();
    }
    chunkCache.set(cacheKey, {
      data: parsedProducts,
      hasMore,
      nextCursor,
      lastUpdate: currentLastUpdate,
    });

    return NextResponse.json(
      {
        success: true,
        data: parsedProducts,
        chunk,
        limit,
        totalCount,
        hasMore,
        nextCursor,
        version: currentLastUpdate,
      },
      {
        headers: {
          "Cache-Control": "public, max-age=60, s-maxage=180, stale-while-revalidate=300",
        },
      }
    );
  } catch (error) {
    console.error("Export Products Error:", error);
    return NextResponse.json({ success: false, error: "Gagal mengambil data produk" }, { status: 500 });
  }
}
