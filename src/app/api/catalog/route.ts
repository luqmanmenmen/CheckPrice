import { NextRequest, NextResponse } from "next/server";
import { prisma as db } from "@/lib/prisma";
import { groupProductsByArticle } from "@/lib/smartSearchEngine";
import {
  BrandGroupKey,
  CategoryKey,
  buildBrandPrismaWhere,
  buildCategoryPrismaWhere,
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

    const cacheKey = `b=${brandGroup}::c=${category}::s=${subBrand}`;
    const cached = catalogCache.get(cacheKey);
    if (cached && Date.now() <= cached.expiresAt) {
      const total = cached.groupedArticles.length;
      return NextResponse.json({
        data: cached.groupedArticles.slice(skip, skip + limit),
        meta: {
          page,
          limit,
          total,
          totalSkus: cached.totalSkus,
          totalPages: Math.max(1, Math.ceil(total / limit)),
          brandGroup,
          category,
          subBrand,
          brandCounts: cached.brandCounts,
          categoryCounts: cached.categoryCounts,
          cached: true,
        },
      });
    }

    const andClauses: any[] = [
      { NOT: { article: { contains: "DUMMY", mode: "insensitive" } } },
      { NOT: { description: { contains: "SKU DUMMY", mode: "insensitive" } } },
    ];

    const brandWhere = buildBrandPrismaWhere(brandGroup);
    if (brandWhere) andClauses.push(brandWhere);

    if (subBrand) {
      andClauses.push({
        OR: [
          { brand: { contains: subBrand, mode: "insensitive" } },
          { dept: { contains: subBrand, mode: "insensitive" } },
        ],
      });
    }

    const categoryWhere = buildCategoryPrismaWhere(category);
    if (categoryWhere) andClauses.push(categoryWhere);

    const rows = await db.product.findMany({
      where: { AND: andClauses },
      select: PRODUCT_LIST_SELECT,
      orderBy: [{ stok: "desc" }, { id: "desc" }],
      take: brandGroup === "SUKO" || brandGroup === "ZES" ? 12000 : subBrand ? 5000 : 2200,
    });

    const cleaned = cleanPromoList(rows);
    const matched = filterByTaxonomy(cleaned, brandGroup, category);
    const groupedArticles = groupProductsByArticle(matched);
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

    const total = groupedArticles.length;
    return NextResponse.json({
      data: groupedArticles.slice(skip, skip + limit),
      meta: {
        page,
        limit,
        total,
        totalSkus: matched.length,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        brandGroup,
        category,
        brandCounts,
        categoryCounts,
      },
    });
  } catch (error) {
    console.error("Error browsing catalog:", error);
    return NextResponse.json(
      { error: "Gagal memuat katalog produk: " + String(error) },
      { status: 500 }
    );
  }
}

