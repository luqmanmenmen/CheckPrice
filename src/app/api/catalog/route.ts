import { NextRequest, NextResponse } from "next/server";
import { prisma as db } from "@/lib/prisma";
import { groupProductsByArticle } from "@/lib/smartSearchEngine";
import {
  BrandGroupKey,
  CategoryKey,
  buildBrandPrismaWhere,
  buildCategoryPrismaWhere,
  buildBrandShowcaseSections,
  compareBrowseItems,
} from "@/lib/productTaxonomy";
import {
  PRODUCT_LIST_SELECT,
  cleanPromoList,
  filterByTaxonomy,
  summarizeTaxonomyCounts,
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
    expiresAt: number;
  }
>();

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
    const skip = (page - 1) * limit;

    const buildCatalogResponse = (
      groupedList: any[],
      totalSkus: number,
      brandCounts: Record<BrandGroupKey, number>,
      categoryCounts: Record<CategoryKey, number>,
      isCached: boolean
    ) => {
      const total = groupedList.length;
      const totalPages = Math.max(1, Math.ceil(total / limit));
      const safePage = Math.min(Math.max(1, page), totalPages);
      const safeSkip = (safePage - 1) * limit;
      const { subBrandCounts } = summarizeTaxonomyCounts(groupedList);
      const brandShowcaseSections =
        brandGroup === "MUKU" && !subBrand && safePage === 1 && groupedList.length > 0
          ? buildBrandShowcaseSections(groupedList, 20, 5)
          : undefined;

      return NextResponse.json({
        data: groupedList.slice(safeSkip, safeSkip + limit),
        meta: {
          page: safePage,
          limit,
          total,
          totalSkus,
          totalPages,
          brandGroup,
          category,
          subBrand,
          brandCounts,
          categoryCounts,
          subBrandCounts,
          brandShowcaseSections,
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
        true
      );
    }

    const andClauses: any[] = [
      { NOT: { article: { contains: "DUMMY", mode: "insensitive" } } },
      { NOT: { description: { contains: "SKU DUMMY", mode: "insensitive" } } },
    ];

    const brandWhere = buildBrandPrismaWhere(brandGroup);
    if (brandWhere) andClauses.push(brandWhere);

    if (subBrand) {
      const subClauses: any[] = [
        { brand: { contains: subBrand, mode: "insensitive" } },
        { dept: { contains: subBrand, mode: "insensitive" } },
      ];
      if (subBrand === "MUKU") {
        subClauses.push(
          { article: { startsWith: "MK-", mode: "insensitive" } },
          { description: { contains: "MUKU", mode: "insensitive" } }
        );
      } else if (subBrand === "BYRCH & CO") {
        subClauses.push(
          { brand: { contains: "BYRCH", mode: "insensitive" } },
          { dept: { contains: "BYRCH", mode: "insensitive" } }
        );
      } else if (subBrand === "ST YVES") {
        subClauses.push(
          { brand: { contains: "SAINT YVES", mode: "insensitive" } },
          { dept: { contains: "SAINT YVES", mode: "insensitive" } }
        );
      } else if (subBrand === "NAYOUNG") {
        subClauses.push(
          { brand: { equals: "ELFORMULA", mode: "insensitive" } },
          { description: { contains: "NA-YOUNG", mode: "insensitive" } }
        );
      }
      andClauses.push({ OR: subClauses });
    }

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

