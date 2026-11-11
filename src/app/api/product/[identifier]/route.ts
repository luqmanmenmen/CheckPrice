import { NextRequest, NextResponse } from "next/server";
import { prisma as db } from "@/lib/prisma";
import { checkSingleItemStock, isStoreOpen, calculateEan13CheckDigit } from "@/lib/mdsBisaClient";
import {
  expandRetailQuery,
  computeProductRelevanceScore,
  consultGeminiSearchAgent,
  groupProductsByArticle,
} from "@/lib/smartSearchEngine";
import {
  BrandGroupKey,
  CategoryKey,
  buildBrandPrismaWhere,
  buildCategoryPrismaWhere,
} from "@/lib/productTaxonomy";
import {
  PRODUCT_LIST_SELECT,
  cleanPromoList,
  checkAndCleanPromo,
  getProductSiblings,
  summarizeTaxonomyCounts,
  filterByTaxonomy,
  buildSubBrandPrismaClause,
  buildTaxonomyListPayload,
} from "@/lib/productQueryHelpers";

export const dynamic = 'force-dynamic';

const SEARCH_CACHE_TTL_MS = 60_000;
const SEARCH_CACHE_MAX_KEYS = 80;
const searchListCache = new Map<
  string,
  {
    groupedArticles: any[];
    totalSkus: number;
    aiAssisted: boolean;
    brandCounts: Record<BrandGroupKey, number>;
    categoryCounts: Record<CategoryKey, number>;
    expiresAt: number;
  }
>();

const VALID_BRANDS = new Set<BrandGroupKey>(["ALL", "SUKO", "MUKU", "ZES"]);
const VALID_CATEGORIES = new Set<CategoryKey>([
  "ALL",
  "JAKET",
  "ATASAN",
  "CELANA",
  "DRESS_ROK",
  "SEPATU_SANDAL",
  "TAS_AKSESORIS",
  "BEAUTY",
  "TIDUR_DALAM",
  "OTHER",
]);

const SIZE_TOKEN_RE = /^(XXS|XS|S|M|L|XL|XXL|2XL|3XL|4XL|5XL|2L|3L|4L|ALL|\d{1,2})$/i;

function getCachedSearchResult(key: string) {
  const hit = searchListCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    searchListCache.delete(key);
    return null;
  }
  return hit;
}

function setCachedSearchResult(
  key: string,
  value: {
    groupedArticles: any[];
    totalSkus: number;
    aiAssisted: boolean;
    brandCounts: Record<BrandGroupKey, number>;
    categoryCounts: Record<CategoryKey, number>;
  }
) {
  if (searchListCache.size >= SEARCH_CACHE_MAX_KEYS) {
    const oldestKey = searchListCache.keys().next().value;
    if (oldestKey !== undefined) searchListCache.delete(oldestKey);
  }
  searchListCache.set(key, {
    ...value,
    expiresAt: Date.now() + SEARCH_CACHE_TTL_MS,
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ identifier: string }> }
) {
  try {
    const { identifier } = await params;
    const rawInput = identifier ? decodeURIComponent(identifier).trim() : "";
    if (!rawInput) {
      return NextResponse.json({ error: "Kata kunci pencarian kosong" }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const groupSections = searchParams.get('groupSections') !== '0';

    const rawBrand = (searchParams.get('brandGroup') || 'ALL').toUpperCase() as BrandGroupKey;
    const rawCategory = (searchParams.get('category') || 'ALL').toUpperCase() as CategoryKey;
    const subBrand = (searchParams.get('subBrand') || '').trim().toUpperCase();
    const brandGroup: BrandGroupKey = VALID_BRANDS.has(rawBrand) ? rawBrand : 'ALL';
    const category: CategoryKey = VALID_CATEGORIES.has(rawCategory) ? rawCategory : 'ALL';
    const hasTaxonomyFilter = brandGroup !== 'ALL' || category !== 'ALL' || Boolean(subBrand);

    // ─────────────────────────────────────────────────────────────
    //  TAHAP 1: EXACT MATCH PRIORITAS (Hanya jika input memuat angka / format kode)
    //  Menghemat 2-4 roundtrip SQL saat kasir mencari teks murni seperti "jaket"
    // ─────────────────────────────────────────────────────────────
    const mayBeCode = /\d/.test(rawInput) && !/\s/.test(rawInput);
    if (mayBeCode) {
      let directProduct = await db.product.findFirst({
        where: { OR: [{ sku: rawInput }, { barcode: rawInput }] }
      });

      if (!directProduct && /^\d+$/.test(rawInput)) {
        const stripped = rawInput.replace(/^0+/, "");
        if (stripped && stripped !== rawInput) {
          directProduct = await db.product.findFirst({
            where: { OR: [{ barcode: stripped }, { sku: stripped }] }
          });
        }
        // Fallback cerdas: koreksi 1 digit check-digit GS1 EAN-13 jika user mengetik manual barcode 234000*
        if (!directProduct && /^234000\d{7}$/.test(rawInput)) {
          const validCd = calculateEan13CheckDigit(rawInput.slice(0, 12));
          const fixedBarcode = rawInput.slice(0, 12) + validCd;
          if (fixedBarcode !== rawInput) {
            directProduct = await db.product.findFirst({ where: { barcode: fixedBarcode } });
          }
        }
      }

      if (directProduct) {
        directProduct = checkAndCleanPromo(directProduct);
        const siblings = await getProductSiblings(directProduct);
        return NextResponse.json({ data: directProduct, siblings });
      }
    }

    // JALUR KILAT KODE ANGKA MURNI (SKU 8 digit / Barcode 12-14 digit):
    if (/^\d{8,14}$/.test(rawInput)) {
      const numericMatches = await db.product.findMany({
        where: {
          OR: [
            { sku: { contains: rawInput } },
            { barcode: { contains: rawInput } },
            { article: { contains: rawInput, mode: 'insensitive' as const } }
          ]
        },
        orderBy: [{ stok: 'desc' }],
        take: 20
      });

      if (numericMatches.length === 1) {
        const top = checkAndCleanPromo(numericMatches[0]);
        const siblings = await getProductSiblings(top);
        return NextResponse.json({ data: top, siblings });
      }
      if (numericMatches.length > 1) {
        const cleaned = cleanPromoList(numericMatches);
        return NextResponse.json({
          data: cleaned,
          meta: { page: 1, limit: 20, total: cleaned.length, totalSkus: cleaned.length, totalPages: 1 }
        });
      }

      // Coba live MDS BISA StoreHub: 5.5 detik saat toko buka agar scan/cari barang baru 100% tembus
      try {
        const liveTimeoutMs = isStoreOpen() ? 5500 : 1500;
        const liveRes: any = await Promise.race([
          checkSingleItemStock(rawInput),
          new Promise((resolve) => setTimeout(() => resolve({ success: false, timeout: true }), liveTimeoutMs))
        ]);
        if (liveRes?.success && liveRes?.sku) {
          let fetched = await db.product.findFirst({
            where: {
              OR: [
                { sku: liveRes.sku },
                ...(liveRes.barcode ? [{ barcode: liveRes.barcode }] : []),
                { barcode: rawInput }
              ]
            }
          });
          if (fetched) {
            fetched = checkAndCleanPromo(fetched);
            const siblings = await getProductSiblings(fetched);
            return NextResponse.json({ data: fetched, siblings, source: 'MDS_BISA_LIVE' });
          }
        }
      } catch {}

      return NextResponse.json(
        {
          error: `Produk tidak ditemukan untuk: "${rawInput}"`,
          hint: "Pastikan garis barcode fokus di tengah kotak kamera atau ketik 8 digit SKU / Kode Artikel."
        },
        { status: 404 }
      );
    }

    // ─────────────────────────────────────────────────────────────
    //  CACHE KILAT HALAMAN (Page 2 / Sebelumnya / Ulangi Kata = 1ms!)
    // ─────────────────────────────────────────────────────────────
    const cacheKey = `${rawInput.toLowerCase()}::b=${brandGroup}::s=${subBrand}::c=${category}`;
    const cachedList = getCachedSearchResult(cacheKey);
    if (cachedList) {
      const total = cachedList.groupedArticles.length;
      if (total === 1 && page === 1 && !hasTaxonomyFilter) {
        const topProduct = cachedList.groupedArticles[0];
        const siblings = await getProductSiblings(topProduct);
        return NextResponse.json({ data: topProduct, siblings, aiAssisted: cachedList.aiAssisted });
      }
      const payload = buildTaxonomyListPayload({
        groupedList: cachedList.groupedArticles,
        totalSkus: cachedList.totalSkus,
        brandGroup,
        category,
        subBrand,
        page,
        limit,
        groupSections,
        isBrowseMode: false,
        brandCounts: cachedList.brandCounts,
        categoryCounts: cachedList.categoryCounts,
      });
      return NextResponse.json({
        data: payload.data,
        aiAssisted: cachedList.aiAssisted,
        meta: {
          ...payload.meta,
          cached: true,
        }
      });
    }

    // ─────────────────────────────────────────────────────────────
    //  TAHAP 2: EKSPANSI PINTAR (30% PARTIAL TEXT + SINONIM KASIR)
    //  Hanya menyentuh kolom terindeks GIN pg_trgm agar eksekusi SQL ~50-150ms!
    // ─────────────────────────────────────────────────────────────
    const isSearchingDummy = rawInput.toLowerCase().includes("dummy");
    const expanded = expandRetailQuery(rawInput);
    const extraAndFilters: any[] = [];
    if (!isSearchingDummy) {
      extraAndFilters.push({
        NOT: [
          { article: { contains: "DUMMY", mode: 'insensitive' as const } },
          { description: { contains: "SKU DUMMY", mode: 'insensitive' as const } },
          { description: { contains: "ITEM TIDAK DIGUNAKAN", mode: 'insensitive' as const } }
        ]
      });
    }
    const brandWhere = buildBrandPrismaWhere(brandGroup);
    if (brandWhere) extraAndFilters.push(brandWhere);
    const subWhere = buildSubBrandPrismaClause(subBrand);
    if (subWhere) extraAndFilters.push(subWhere);
    const categoryWhere = buildCategoryPrismaWhere(category);
    if (categoryWhere) extraAndFilters.push(categoryWhere);

    const buildTermOrClause = (term: string) => {
      const clauses: any[] = [
        { description: { contains: term, mode: 'insensitive' as const } },
        { article: { contains: term, mode: 'insensitive' as const } },
        { brand: { contains: term, mode: 'insensitive' as const } },
        { dept: { contains: term, mode: 'insensitive' as const } },
        { color: { contains: term, mode: 'insensitive' as const } }
      ];
      if (SIZE_TOKEN_RE.test(term)) {
        clauses.push({ size: { contains: term, mode: 'insensitive' as const } });
      }
      if (/\d/.test(term)) {
        clauses.push(
          { sku: { contains: term, mode: 'insensitive' as const } },
          { barcode: { contains: term, mode: 'insensitive' as const } }
        );
      }
      return clauses;
    };

    const tokenGroupAndConditions = expanded.tokenGroups.map(group => ({
      OR: group.flatMap(term => buildTermOrClause(term))
    }));

    // Tambahkan kondisi frasa utuh hanya jika multi-kata / punya bentuk tanpa spasi unik
    const firstGroupHasRaw =
      expanded.tokenGroups.length === 1 &&
      expanded.tokenGroups[0].includes(rawInput.toUpperCase());

    const strictOrBranches: any[] = [{ AND: tokenGroupAndConditions }];
    if (!firstGroupHasRaw) {
      strictOrBranches.unshift({ OR: buildTermOrClause(rawInput) });
    }
    if (expanded.spaceless.length >= 3 && expanded.spaceless !== rawInput.toUpperCase()) {
      strictOrBranches.push({
        OR: [
          { article: { contains: expanded.spaceless, mode: 'insensitive' as const } },
          { description: { contains: expanded.spaceless, mode: 'insensitive' as const } }
        ]
      });
    }

    const strictWhere: any =
      strictOrBranches.length === 1 ? strictOrBranches[0] : { OR: strictOrBranches };
    if (extraAndFilters.length > 0) {
      strictWhere.AND = [...(strictWhere.AND || []), ...extraAndFilters];
    }

    const candidateMap = new Map<string, any>();

    const strictMatches = await db.product.findMany({
      where: strictWhere,
      select: PRODUCT_LIST_SELECT,
      orderBy: [{ stok: 'desc' }],
      take: 240
    });
    for (const p of strictMatches) candidateMap.set(p.sku, p);

    // ─────────────────────────────────────────────────────────────
    //  TAHAP 2B: RELAXED 30% PARTIAL TEXT FALLBACK
    // ─────────────────────────────────────────────────────────────
    if (candidateMap.size < 25 && expanded.allExpandedTerms.length > 0) {
      const meaningfulTerms = expanded.allExpandedTerms.filter(t => t.length >= 3).slice(0, 12);
      if (meaningfulTerms.length > 0) {
        const relaxedWhere: any = {
          OR: meaningfulTerms.flatMap(term => [
            { description: { contains: term, mode: 'insensitive' as const } },
            { article: { contains: term, mode: 'insensitive' as const } },
            { brand: { contains: term, mode: 'insensitive' as const } },
            { dept: { contains: term, mode: 'insensitive' as const } },
            { color: { contains: term, mode: 'insensitive' as const } }
          ])
        };
        if (extraAndFilters.length > 0) relaxedWhere.AND = extraAndFilters;

        const relaxedMatches = await db.product.findMany({
          where: relaxedWhere,
          select: PRODUCT_LIST_SELECT,
          orderBy: [{ stok: 'desc' }],
          take: 140
        });
        for (const p of relaxedMatches) {
          if (!candidateMap.has(p.sku)) candidateMap.set(p.sku, p);
        }
      }
    }

    // ─────────────────────────────────────────────────────────────
    //  TAHAP 3: GEMINI AI RETAIL SEARCH AGENT
    // ─────────────────────────────────────────────────────────────
    let aiExpandedTerms: string[] = [];
    if (candidateMap.size < 5 && !/^\d+$/.test(rawInput) && rawInput.length >= 3) {
      aiExpandedTerms = await consultGeminiSearchAgent(rawInput);
      if (aiExpandedTerms.length > 0) {
        expanded.tokenGroups.push(aiExpandedTerms);
        for (const t of aiExpandedTerms) {
          if (!expanded.allExpandedTerms.includes(t)) expanded.allExpandedTerms.push(t);
        }

        const aiWhere: any = {
          OR: aiExpandedTerms.flatMap(term => [
            { description: { contains: term, mode: 'insensitive' as const } },
            { article: { contains: term, mode: 'insensitive' as const } },
            { brand: { contains: term, mode: 'insensitive' as const } },
            { dept: { contains: term, mode: 'insensitive' as const } },
            { color: { contains: term, mode: 'insensitive' as const } }
          ])
        };
        if (extraAndFilters.length > 0) aiWhere.AND = extraAndFilters;

        const aiMatches = await db.product.findMany({
          where: aiWhere,
          select: PRODUCT_LIST_SELECT,
          orderBy: [{ stok: 'desc' }],
          take: 100
        });
        for (const p of aiMatches) {
          if (!candidateMap.has(p.sku)) candidateMap.set(p.sku, p);
        }
      }
    }

    const candidateMatches = Array.from(candidateMap.values());

    if (candidateMatches.length === 0) {
      if (/^\d{8,14}$/.test(rawInput)) {
        try {
          const liveRes = await checkSingleItemStock(rawInput);
          if (liveRes.success && liveRes.sku) {
            let fetched = await db.product.findUnique({ where: { sku: liveRes.sku } });
            if (fetched) {
              fetched = checkAndCleanPromo(fetched);
              const siblings = await getProductSiblings(fetched);
              return NextResponse.json({ data: fetched, siblings, source: 'MDS_BISA_LIVE' });
            }
          }
        } catch (e) {
          console.warn("Gagal lookup live MDS BISA fallback:", e);
        }
      }

      const totalCount = await db.product.count();
      return NextResponse.json(
        {
          error: `Produk tidak ditemukan untuk: "${rawInput}"`,
          hint: `Total produk di database: ${totalCount.toLocaleString('id-ID')} SKU. Coba ketik sebagian nama produk (30% teks), kode artikel, SKU, atau scan barcode.`
        },
        { status: 404 }
      );
    }

    // ─────────────────────────────────────────────────────────────
    //  TAHAP 4: BOBOT RELEVANSI CERDAS & PENGELOMPOKAN ARTIKEL
    // ─────────────────────────────────────────────────────────────
    const scoredProducts = candidateMatches.map(p => ({
      product: p,
      score: computeProductRelevanceScore(p, expanded, isSearchingDummy)
    }));

    scoredProducts.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.product.stok !== a.product.stok) return b.product.stok - a.product.stok;
      return (a.product.description || "").localeCompare(b.product.description || "");
    });

    const rankedProducts = cleanPromoList(scoredProducts.map(sp => sp.product));
    const taxonomyFiltered = filterByTaxonomy(rankedProducts, brandGroup, category, subBrand);
    const groupedArticles = groupProductsByArticle(taxonomyFiltered);
    const { brandCounts, categoryCounts } = summarizeTaxonomyCounts(groupedArticles);

    // Simpan ke cache server 60s agar klik Selanjutnya/Sebelumnya = 1ms!
    setCachedSearchResult(cacheKey, {
      groupedArticles,
      totalSkus: taxonomyFiltered.length,
      aiAssisted: aiExpandedTerms.length > 0,
      brandCounts,
      categoryCounts,
    });

    if (groupedArticles.length === 1 && page === 1 && !hasTaxonomyFilter) {
      const topProduct = groupedArticles[0];
      const siblings = await getProductSiblings(topProduct);
      return NextResponse.json({ data: topProduct, siblings, aiAssisted: aiExpandedTerms.length > 0 });
    }

    const payload = buildTaxonomyListPayload({
      groupedList: groupedArticles,
      totalSkus: taxonomyFiltered.length,
      brandGroup,
      category,
      subBrand,
      page,
      limit,
      groupSections,
      isBrowseMode: false,
      brandCounts,
      categoryCounts,
    });

    return NextResponse.json({
      data: payload.data,
      aiAssisted: aiExpandedTerms.length > 0,
      meta: payload.meta,
    });

  } catch (error) {
    console.error("Error fetching product:", error);
    return NextResponse.json(
      { error: "Terjadi kesalahan internal: " + String(error) },
      { status: 500 }
    );
  }
}
