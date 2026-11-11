import { NextRequest, NextResponse } from "next/server";
import { prisma as db } from "@/lib/prisma";
import { groupProductsByArticle } from "@/lib/smartSearchEngine";
import {
  BrandGroupKey,
  CategoryKey,
  SubBrandCount,
  buildBrandPrismaWhere,
  buildCategoryPrismaWhere,
  compareBrowseItems,
  createEmptyCategoryCounts,
  sortSubBrandStats,
} from "@/lib/productTaxonomy";
import {
  PRODUCT_LIST_SELECT,
  cleanPromoList,
  filterByTaxonomy,
  summarizeTaxonomyCounts,
  buildSubBrandPrismaClause,
  buildTaxonomyListPayload,
} from "@/lib/productQueryHelpers";

export const dynamic = "force-dynamic";

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

const CATALOG_CACHE_TTL_MS = 120_000;
const CATALOG_CACHE_MAX = 40;
const catalogCache = new Map<
  string,
  {
    groupedArticles: any[];
    totalSkus: number;
    brandCounts: Record<BrandGroupKey, number>;
    categoryCounts: Record<CategoryKey, number>;
    subBrandCounts?: SubBrandCount[];
    expiresAt: number;
  }
>();

interface GlobalCatalogSummary {
  rows: Array<{
    brandGroup: string;
    categoryKey: string;
    subBrand: string;
    count: number;
    skuSum: number;
  }>;
  photoMap: Map<string, number>;
  expiresAt: number;
}
let globalCatalogSummaryCache: GlobalCatalogSummary | null = null;

async function getPrebuiltCatalogSummary(): Promise<GlobalCatalogSummary | null> {
  if (globalCatalogSummaryCache && Date.now() <= globalCatalogSummaryCache.expiresAt) {
    return globalCatalogSummaryCache;
  }
  const [aggRows, photoAgg] = await Promise.all([
    db.catalogArticle.groupBy({
      by: ["brandGroup", "categoryKey", "subBrand"],
      _count: { _all: true },
      _sum: { articleGroupCount: true },
    }),
    db.catalogArticle.groupBy({
      by: ["subBrand"],
      where: { imageUrl: { not: null } },
      _count: { _all: true },
    }),
  ]);
  if (!aggRows || aggRows.length === 0) return null;

  const photoMap = new Map<string, number>();
  for (const p of photoAgg) {
    photoMap.set(p.subBrand, p._count._all);
  }
  globalCatalogSummaryCache = {
    rows: aggRows.map((r) => ({
      brandGroup: r.brandGroup,
      categoryKey: r.categoryKey,
      subBrand: r.subBrand,
      count: r._count._all,
      skuSum: r._sum.articleGroupCount || r._count._all,
    })),
    photoMap,
    expiresAt: Date.now() + CATALOG_CACHE_TTL_MS,
  };
  return globalCatalogSummaryCache;
}

function summarizeFromPrebuilt(
  summary: GlobalCatalogSummary,
  brandGroup: BrandGroupKey,
  category: CategoryKey,
  subBrand: string
) {
  const brandCounts: Record<BrandGroupKey, number> = { ALL: 0, SUKO: 0, MUKU: 0, ZES: 0 };
  const categoryCounts: Record<CategoryKey, number> = createEmptyCategoryCounts();
  const mukuSubMap = new Map<string, SubBrandCount>();
  let totalSkus = 0;

  for (const r of summary.rows) {
    const matchCat = category === "ALL" || r.categoryKey === category;
    const matchBrand = brandGroup === "ALL" || r.brandGroup === brandGroup;
    const matchSub = !subBrand || r.subBrand === subBrand;

    if (matchCat) {
      brandCounts.ALL += r.count;
      if (r.brandGroup in brandCounts) {
        brandCounts[r.brandGroup as BrandGroupKey] += r.count;
      }
    }
    if (matchBrand && matchSub) {
      categoryCounts.ALL += r.count;
      if (r.categoryKey in categoryCounts) {
        categoryCounts[r.categoryKey as CategoryKey] += r.count;
      }
    }
    if (r.brandGroup === "MUKU" && matchCat) {
      const prev = mukuSubMap.get(r.subBrand) || {
        name: r.subBrand,
        count: 0,
        photoCount: summary.photoMap.get(r.subBrand) || 0,
      };
      prev.count += r.count;
      mukuSubMap.set(r.subBrand, prev);
    }
    if (matchBrand && matchCat && matchSub) {
      totalSkus += r.skuSum;
    }
  }

  const subBrandCounts = sortSubBrandStats(Array.from(mukuSubMap.values()), (x) => x.name);
  return { brandCounts, categoryCounts, subBrandCounts, totalSkus };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rawBrand = (searchParams.get("brandGroup") || "ALL").toUpperCase() as BrandGroupKey;
    const rawCategory = (searchParams.get("category") || "ALL").toUpperCase() as CategoryKey;
    const subBrand = (searchParams.get("subBrand") || "").trim().toUpperCase();
    const brandGroup: BrandGroupKey = VALID_BRANDS.has(rawBrand) ? rawBrand : "ALL";
    const category: CategoryKey = VALID_CATEGORIES.has(rawCategory) ? rawCategory : "ALL";

    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const groupSections = searchParams.get("groupSections") !== "0";

    const buildCatalogResponse = (
      groupedList: any[],
      totalSkus: number,
      brandCounts: Record<BrandGroupKey, number>,
      categoryCounts: Record<CategoryKey, number>,
      isCached: boolean,
      subBrandCountsOverride?: SubBrandCount[]
    ) => {
      const payload = buildTaxonomyListPayload({
        groupedList,
        totalSkus,
        brandGroup,
        category,
        subBrand,
        page,
        limit,
        groupSections,
        isBrowseMode: true,
        brandCounts,
        categoryCounts,
      });
      return NextResponse.json({
        data: payload.data,
        meta: {
          ...payload.meta,
          ...(subBrandCountsOverride ? { subBrandCounts: subBrandCountsOverride } : {}),
          ...(isCached ? { cached: true } : {}),
        },
      });
    };

    const cacheKey = `b=${brandGroup}::c=${category}::s=${subBrand}`;
    const cached = catalogCache.get(cacheKey);
    if (cached && Date.now() <= cached.expiresAt) {
      return buildCatalogResponse(
        cached.groupedArticles,
        cached.totalSkus,
        cached.brandCounts,
        cached.categoryCounts,
        true,
        cached.subBrandCounts
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // JALUR UTAMA (<25ms): Baca langsung tabel pre-computed `CatalogArticle`
    // hasil olahan Python Engine (`build_catalog_index.py`)!
    // ─────────────────────────────────────────────────────────────────────────
    const prebuiltSummary = await getPrebuiltCatalogSummary().catch(() => null);
    if (prebuiltSummary) {
      const { brandCounts, categoryCounts, subBrandCounts, totalSkus } = summarizeFromPrebuilt(
        prebuiltSummary,
        brandGroup,
        category,
        subBrand
      );
      const where: any = {};
      if (brandGroup !== "ALL") where.brandGroup = brandGroup;
      if (category !== "ALL") where.categoryKey = category;
      if (subBrand) where.subBrand = subBrand;

      const groupedArticles = await db.catalogArticle.findMany({
        where,
        orderBy: { sortRank: "asc" },
      });

      if (catalogCache.size >= CATALOG_CACHE_MAX) {
        const oldest = catalogCache.keys().next().value;
        if (oldest !== undefined) catalogCache.delete(oldest);
      }
      catalogCache.set(cacheKey, {
        groupedArticles,
        totalSkus,
        brandCounts,
        categoryCounts,
        subBrandCounts,
        expiresAt: Date.now() + CATALOG_CACHE_TTL_MS,
      });

      return buildCatalogResponse(
        groupedArticles,
        totalSkus,
        brandCounts,
        categoryCounts,
        false,
        subBrandCounts
      );
    }

    // Fallback aman jika `CatalogArticle` belum terisi
    const andClauses: any[] = [
      { NOT: { article: { contains: "DUMMY", mode: "insensitive" } } },
      { NOT: { description: { contains: "SKU DUMMY", mode: "insensitive" } } },
      { NOT: { description: { contains: "ITEM TIDAK DIGUNAKAN", mode: "insensitive" } } },
    ];

    const brandWhere = buildBrandPrismaWhere(brandGroup);
    if (brandWhere) andClauses.push(brandWhere);

    const subWhere = buildSubBrandPrismaClause(subBrand);
    if (subWhere) andClauses.push(subWhere);

    const categoryWhere = buildCategoryPrismaWhere(category);
    if (categoryWhere) andClauses.push(categoryWhere);

    const rows = await db.product.findMany({
      where: { AND: andClauses },
      select: PRODUCT_LIST_SELECT,
      orderBy: [{ stok: "desc" }, { id: "desc" }],
      take: brandGroup === "SUKO" || brandGroup === "ZES" ? 12000 : subBrand ? 5000 : 4500,
    });

    const cleaned = cleanPromoList(rows);
    const matched = filterByTaxonomy(cleaned, brandGroup, category, subBrand);
    const groupedArticles = groupProductsByArticle(matched);
    groupedArticles.sort(compareBrowseItems);
    const { brandCounts, categoryCounts } = summarizeTaxonomyCounts(groupedArticles);

    if (catalogCache.size >= CATALOG_CACHE_MAX) {
      const oldest = catalogCache.keys().next().value;
      if (oldest !== undefined) catalogCache.delete(oldest);
    }
    catalogCache.set(cacheKey, {
      groupedArticles,
      totalSkus: matched.length,
      brandCounts,
      categoryCounts,
      expiresAt: Date.now() + CATALOG_CACHE_TTL_MS,
    });

    return buildCatalogResponse(
      groupedArticles,
      matched.length,
      brandCounts,
      categoryCounts,
      false
    );
  } catch (error) {
    console.error("Error browsing catalog:", error);
    return NextResponse.json(
      { error: "Gagal memuat katalog produk: " + String(error) },
      { status: 500 }
    );
  }
}

