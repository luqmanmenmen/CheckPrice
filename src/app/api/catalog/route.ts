import { NextRequest, NextResponse } from "next/server";
import { prisma as db } from "@/lib/prisma";
import { groupProductsByArticle } from "@/lib/smartSearchEngine";
import {
  BrandGroupKey,
  CategoryKey,
  CATEGORY_DISPLAY_ORDER,
  CATEGORY_LABELS,
  CATEGORY_OPTIONS,
  ResolvedCategoryKey,
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
const CATALOG_CACHE_MAX = 80;
const catalogCache = new Map<
  string,
  {
    payload: { data: any[]; meta: Record<string, any> };
    expiresAt: number;
  }
>();

function cacheCatalogPayload(key: string, payload: { data: any[]; meta: Record<string, any> }) {
  if (catalogCache.size >= CATALOG_CACHE_MAX) {
    const oldest = catalogCache.keys().next().value;
    if (oldest !== undefined) catalogCache.delete(oldest);
  }
  catalogCache.set(key, {
    payload,
    expiresAt: Date.now() + CATALOG_CACHE_TTL_MS,
  });
}

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
  const activeBrandSubMap = new Map<string, { subBrand: string; count: number; totalSkus: number; photoCount: number }>();
  const activeCatMap = new Map<ResolvedCategoryKey, { count: number; totalSkus: number }>();
  let totalSkus = 0;
  let totalArticles = 0;

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

      if (brandGroup === "MUKU" && !subBrand) {
        const bPrev = activeBrandSubMap.get(r.subBrand) || {
          subBrand: r.subBrand,
          count: 0,
          totalSkus: 0,
          photoCount: summary.photoMap.get(r.subBrand) || 0,
        };
        bPrev.count += r.count;
        bPrev.totalSkus += r.skuSum;
        activeBrandSubMap.set(r.subBrand, bPrev);
      }
    }
    if (matchBrand && matchCat && matchSub) {
      totalSkus += r.skuSum;
      totalArticles += r.count;
      if (category === "ALL") {
        const ck = r.categoryKey as ResolvedCategoryKey;
        const cPrev = activeCatMap.get(ck) || { count: 0, totalSkus: 0 };
        cPrev.count += r.count;
        cPrev.totalSkus += r.skuSum;
        activeCatMap.set(ck, cPrev);
      }
    }
  }

  const subBrandCounts = sortSubBrandStats(Array.from(mukuSubMap.values()), (x) => x.name);
  const brandShowcaseMeta = sortSubBrandStats(Array.from(activeBrandSubMap.values()), (x) => x.subBrand);
  const categoryShowcaseMeta = CATEGORY_DISPLAY_ORDER
    .filter((ck) => (activeCatMap.get(ck)?.count || 0) > 0)
    .map((ck) => ({
      catKey: ck,
      label: CATEGORY_LABELS[ck],
      icon: CATEGORY_OPTIONS.find((o) => o.key === ck)?.icon || "📦",
      count: activeCatMap.get(ck)!.count,
      totalSkus: activeCatMap.get(ck)!.totalSkus,
    }));

  return { brandCounts, categoryCounts, subBrandCounts, totalSkus, totalArticles, brandShowcaseMeta, categoryShowcaseMeta };
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

    const cacheKey = `b=${brandGroup}::c=${category}::s=${subBrand}::p=${page}::l=${limit}::g=${groupSections ? 1 : 0}`;
    const cached = catalogCache.get(cacheKey);
    if (cached && Date.now() <= cached.expiresAt) {
      return NextResponse.json({
        data: cached.payload.data,
        meta: { ...cached.payload.meta, cached: true },
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // JALUR UTAMA (<150ms): Paginasi SQL langsung pada tabel pre-computed
    // `CatalogArticle` (hanya menarik 20-40 baris per halaman, bukan 54rb baris!)
    // ─────────────────────────────────────────────────────────────────────────
    const prebuiltSummary = await getPrebuiltCatalogSummary().catch(() => null);
    if (prebuiltSummary) {
      const {
        brandCounts,
        categoryCounts,
        subBrandCounts,
        totalSkus,
        totalArticles,
        brandShowcaseMeta,
        categoryShowcaseMeta,
      } = summarizeFromPrebuilt(prebuiltSummary, brandGroup, category, subBrand);

      const baseWhere: any = {};
      if (brandGroup !== "ALL") baseWhere.brandGroup = brandGroup;
      if (category !== "ALL") baseWhere.categoryKey = category;
      if (subBrand) baseWhere.subBrand = subBrand;

      let responsePayload: { data: any[]; meta: Record<string, any> };

      if (brandGroup === "MUKU" && !subBrand && groupSections && brandShowcaseMeta.length > 0) {
        const totalBrands = brandShowcaseMeta.length;
        const totalPages = Math.max(1, Math.ceil(totalBrands / 8));
        const safePage = Math.min(Math.max(1, page), totalPages);
        const pageMeta = brandShowcaseMeta.slice((safePage - 1) * 8, safePage * 8);
        const sectionItems = await Promise.all(
          pageMeta.map((sec) =>
            db.catalogArticle.findMany({
              where: { ...baseWhere, subBrand: sec.subBrand },
              orderBy: { sortRank: "asc" },
              take: 5,
            })
          )
        );
        const sections = pageMeta.map((sec, i) => ({
          subBrand: sec.subBrand,
          count: sec.count,
          totalSkus: sec.totalSkus,
          items: sectionItems[i] || [],
        }));
        responsePayload = {
          data: sections.flatMap((s) => s.items),
          meta: {
            page: safePage,
            limit,
            total: totalArticles,
            totalSkus,
            totalPages,
            brandGroup,
            category,
            subBrand,
            brandCounts,
            categoryCounts,
            subBrandCounts,
            brandShowcaseSections: sections,
            sectionMode: "BRAND_PAGES",
          },
        };
      } else if (
        (brandGroup === "SUKO" || brandGroup === "ZES" || (brandGroup === "MUKU" && Boolean(subBrand))) &&
        category === "ALL" &&
        groupSections &&
        categoryShowcaseMeta.length > 0
      ) {
        const totalCategories = categoryShowcaseMeta.length;
        const totalPages = Math.max(1, Math.ceil(totalCategories / 5));
        const safePage = Math.min(Math.max(1, page), totalPages);
        const pageMeta = categoryShowcaseMeta.slice((safePage - 1) * 5, safePage * 5);
        const sectionItems = await Promise.all(
          pageMeta.map((sec) =>
            db.catalogArticle.findMany({
              where: { ...baseWhere, categoryKey: sec.catKey },
              orderBy: { sortRank: "asc" },
              take: 5,
            })
          )
        );
        const sections = pageMeta.map((sec, i) => ({
          catKey: sec.catKey,
          label: sec.label,
          icon: sec.icon,
          count: sec.count,
          totalSkus: sec.totalSkus,
          items: sectionItems[i] || [],
        }));
        responsePayload = {
          data: sections.flatMap((s) => s.items),
          meta: {
            page: safePage,
            limit,
            total: totalArticles,
            totalSkus,
            totalPages,
            brandGroup,
            category,
            subBrand,
            brandCounts,
            categoryCounts,
            subBrandCounts,
            categoryShowcaseSections: sections,
            sectionMode: "CATEGORY_PAGES",
          },
        };
      } else {
        const totalPages = Math.max(1, Math.ceil(totalArticles / limit));
        const safePage = Math.min(Math.max(1, page), totalPages);
        const pageRows =
          totalArticles > 0
            ? await db.catalogArticle.findMany({
                where: baseWhere,
                orderBy: { sortRank: "asc" },
                skip: (safePage - 1) * limit,
                take: limit,
              })
            : [];
        responsePayload = {
          data: pageRows,
          meta: {
            page: safePage,
            limit,
            total: totalArticles,
            totalSkus,
            totalPages,
            brandGroup,
            category,
            subBrand,
            brandCounts,
            categoryCounts,
            subBrandCounts,
            sectionMode: "LIST",
          },
        };
      }

      cacheCatalogPayload(cacheKey, responsePayload);
      return NextResponse.json(responsePayload);
    }

    // Fallback aman jika `CatalogArticle` belum terisi
    const andClauses: any[] = [
      { NOT: { article: { contains: "DUMMY", mode: "insensitive" } } },
      { NOT: { description: { contains: "SKU DUMMY", mode: "insensitive" } } },
      { NOT: { description: { contains: "ITEM TIDAK DIGUNAKAN", mode: "insensitive" } } },
      { NOT: { description: { contains: "ITEM TIDAK DAPAT", mode: "insensitive" } } },
      { NOT: { description: { contains: "TIDAK DI GUNAKAN", mode: "insensitive" } } },
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

    const fallbackPayload = buildTaxonomyListPayload({
      groupedList: groupedArticles,
      totalSkus: matched.length,
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
    cacheCatalogPayload(cacheKey, fallbackPayload);

    return NextResponse.json(fallbackPayload);
  } catch (error) {
    console.error("Error browsing catalog:", error);
    return NextResponse.json(
      { error: "Gagal memuat katalog produk: " + String(error) },
      { status: 500 }
    );
  }
}

