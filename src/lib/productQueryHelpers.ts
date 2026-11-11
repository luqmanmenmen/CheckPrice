import { prisma as db } from "@/lib/prisma";
import {
  BrandGroupKey,
  CategoryKey,
  SubBrandCount,
  classifyBrandGroup,
  classifyProductCategory,
  getNormalizedSubBrand,
  createEmptyCategoryCounts,
  sortSubBrandStats,
  paginateBrandSections,
  paginateCategorySections,
} from "@/lib/productTaxonomy";

export const PRODUCT_LIST_SELECT = {
  id: true,
  sku: true,
  barcode: true,
  article: true,
  description: true,
  acara: true,
  fromDate: true,
  toDate: true,
  hargaNormal: true,
  hargaPromo: true,
  diskon: true,
  discountType: true,
  brand: true,
  dept: true,
  color: true,
  size: true,
  stok: true,
  imageUrl: true,
  promoFileName: true,
} as const;

export function isPromoExpired(toDate: string | null | undefined): boolean {
  if (!toDate) return false;
  const toDateObj = new Date(toDate);
  if (isNaN(toDateObj.getTime())) return false;
  toDateObj.setHours(23, 59, 59, 999);
  return new Date() > toDateObj;
}

/**
 * Membersihkan promo kedaluwarsa di memori tanpa spam koneksi DB per-baris,
 * lalu menjadwalkan 1 updateMany asinkron ke PostgreSQL bila ada promo expired.
 */
export function cleanPromoList(rows: any[]): any[] {
  const expiredIds: number[] = [];
  const cleaned = rows.map((p) => {
    if (p && isPromoExpired(p.toDate)) {
      if (typeof p.id === "number" && p.id > 0) expiredIds.push(p.id);
      return {
        ...p,
        hargaPromo: null,
        diskon: null,
        discountType: null,
        acara: null,
        fromDate: null,
        toDate: null,
      };
    }
    return p;
  });

  if (expiredIds.length > 0) {
    db.product
      .updateMany({
        where: { id: { in: expiredIds } },
        data: {
          hargaPromo: null,
          diskon: null,
          discountType: null,
          acara: null,
          fromDate: null,
          toDate: null,
        },
      })
      .catch((e) => console.error("Auto-clean promo background error:", e));
  }
  return cleaned;
}

export function checkAndCleanPromo(p: any) {
  return cleanPromoList([p])[0];
}

export async function getProductSiblings(prod: any): Promise<any[]> {
  let siblings: any[] = [];
  const targetBrandGroup = classifyBrandGroup(prod);
  const targetCategory = classifyProductCategory(prod);
  const matchesTargetScope = (s: any) =>
    classifyBrandGroup(s) === targetBrandGroup &&
    classifyProductCategory(s) === targetCategory;

  if (
    prod.article &&
    prod.article.trim() &&
    !["0", "-", "PRODUK BARU"].includes(prod.article.trim().toUpperCase())
  ) {
    const allSiblings = await db.product.findMany({
      where: { article: prod.article },
      orderBy: [{ color: "asc" }, { size: "asc" }, { description: "asc" }],
    });
    const scoped = allSiblings.filter(matchesTargetScope);
    siblings = cleanPromoList(scoped.length > 0 ? scoped : allSiblings);
  } else if (prod.description) {
    const parts = prod.description.split(":");
    if (parts.length > 1) {
      const parentName = parts[0].trim();
      const allSiblings = await db.product.findMany({
        where: {
          description: { startsWith: parentName + ":" },
          ...(prod.brand ? { brand: prod.brand } : {}),
        },
        orderBy: { description: "asc" },
      });
      const scoped = allSiblings.filter(matchesTargetScope);
      siblings = cleanPromoList(scoped.length > 0 ? scoped : allSiblings);
    }
  }
  return siblings;
}

/**
 * Menghitung ringkasan jumlah model per Brand (SUKO/Mu+Ku/ZES/Lainnya) & Kategori
 */
export function summarizeTaxonomyCounts(groupedArticles: any[]) {
  const brandCounts: Record<BrandGroupKey, number> = {
    ALL: groupedArticles.length,
    SUKO: 0,
    MUKU: 0,
    ZES: 0,
  };
  const categoryCounts: Record<CategoryKey, number> = {
    ...createEmptyCategoryCounts(),
    ALL: groupedArticles.length,
  };
  const mukuSubBrandTotals = new Map<string, SubBrandCount>();

  for (const item of groupedArticles) {
    const bg: BrandGroupKey = (item.brandGroup as BrandGroupKey) || classifyBrandGroup(item);
    brandCounts[bg] = (brandCounts[bg] || 0) + 1;
    const cat: CategoryKey = (item.categoryKey as CategoryKey) || classifyProductCategory(item);
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;

    if (bg === "MUKU") {
      const sb = item.subBrand || getNormalizedSubBrand(item);
      const prev = mukuSubBrandTotals.get(sb) || { name: sb, count: 0, photoCount: 0 };
      prev.count += 1;
      if (item.imageUrl) prev.photoCount += 1;
      mukuSubBrandTotals.set(sb, prev);
    }
  }

  const subBrandCounts = sortSubBrandStats(Array.from(mukuSubBrandTotals.values()), (x) => x.name);
  return { brandCounts, categoryCounts, subBrandCounts };
}

/**
 * Memastikan hasil sesuai presedensi Brand, Kategori, & Sub-Brand (menghindari edge case SQL LIKE)
 */
export function filterByTaxonomy<T extends Record<string, any>>(
  items: T[],
  brandGroup: BrandGroupKey,
  category: CategoryKey,
  subBrand: string = ""
): T[] {
  const subUpper = subBrand.trim().toUpperCase();
  return items.filter((item) => {
    if (brandGroup !== "ALL") {
      const g = item.brandGroup || classifyBrandGroup(item);
      if (g !== brandGroup) return false;
    }
    if (category !== "ALL") {
      const c = item.categoryKey || classifyProductCategory(item);
      if (c !== category) return false;
    }
    if (subUpper) {
      const sb = item.subBrand || getNormalizedSubBrand(item);
      if (sb !== subUpper) return false;
    }
    return true;
  });
}

/** Klausa Prisma OR untuk memfilter sub-brand normalisasi Mu+Ku sebelum filter JS presisi */
export function buildSubBrandPrismaClause(subBrand: string): any | undefined {
  const clean = subBrand.trim().toUpperCase();
  if (!clean) return undefined;
  const subClauses: any[] = [
    { brand: { contains: clean, mode: "insensitive" } },
    { dept: { contains: clean, mode: "insensitive" } },
  ];
  if (clean === "MUKU") {
    subClauses.push(
      { article: { startsWith: "MK-", mode: "insensitive" } },
      { description: { contains: "MUKU", mode: "insensitive" } }
    );
  } else if (clean === "BYRCH & CO") {
    subClauses.push(
      { brand: { contains: "BYRCH", mode: "insensitive" } },
      { dept: { contains: "BYRCH", mode: "insensitive" } }
    );
  } else if (clean === "ST YVES") {
    subClauses.push(
      { brand: { contains: "SAINT YVES", mode: "insensitive" } },
      { dept: { contains: "SAINT YVES", mode: "insensitive" } }
    );
  } else if (clean === "NAYOUNG") {
    subClauses.push(
      { brand: { equals: "ELFORMULA", mode: "insensitive" } },
      { description: { contains: "NA-YOUNG", mode: "insensitive" } }
    );
  } else if (clean === "DISNEY") {
    subClauses.push({ dept: { contains: "THATS DONALD", mode: "insensitive" } });
  } else if (clean === "CHARACTER") {
    subClauses.push({ dept: { contains: "LICENSE", mode: "insensitive" } });
  }
  return { OR: subClauses };
}

/** Formatter payload seragam (per Brand / per Kategori / list biasa) untuk `/api/catalog` & `/api/product` */
export function buildTaxonomyListPayload({
  groupedList,
  totalSkus,
  brandGroup,
  category,
  subBrand = "",
  page = 1,
  limit = 20,
  groupSections = true,
  isBrowseMode = true,
  brandCounts,
  categoryCounts,
}: {
  groupedList: any[];
  totalSkus: number;
  brandGroup: BrandGroupKey;
  category: CategoryKey;
  subBrand?: string;
  page?: number;
  limit?: number;
  groupSections?: boolean;
  isBrowseMode?: boolean;
  brandCounts: Record<BrandGroupKey, number>;
  categoryCounts: Record<CategoryKey, number>;
}) {
  const total = groupedList.length;
  const { subBrandCounts } = summarizeTaxonomyCounts(groupedList);

  if (brandGroup === "MUKU" && !subBrand && groupSections && groupedList.length > 0) {
    const brandPages = paginateBrandSections(groupedList, page, 8, 5);
    return {
      data: brandPages.sections.flatMap((s) => s.items),
      meta: {
        page: brandPages.page,
        limit,
        total,
        totalSkus,
        totalPages: brandPages.totalPages,
        brandGroup,
        category,
        subBrand,
        brandCounts,
        categoryCounts,
        subBrandCounts,
        brandShowcaseSections: brandPages.sections,
        sectionMode: "BRAND_PAGES" as const,
      },
    };
  }

  if (
    isBrowseMode &&
    (brandGroup === "SUKO" || brandGroup === "ZES" || (brandGroup === "MUKU" && Boolean(subBrand))) &&
    category === "ALL" &&
    groupSections &&
    groupedList.length > 0
  ) {
    const catPages = paginateCategorySections(groupedList, page, 5, 5);
    return {
      data: catPages.sections.flatMap((s) => s.items),
      meta: {
        page: catPages.page,
        limit,
        total,
        totalSkus,
        totalPages: catPages.totalPages,
        brandGroup,
        category,
        subBrand,
        brandCounts,
        categoryCounts,
        subBrandCounts,
        categoryShowcaseSections: catPages.sections,
        sectionMode: "CATEGORY_PAGES" as const,
      },
    };
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const safeSkip = (safePage - 1) * limit;

  return {
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
      sectionMode: "LIST" as const,
    },
  };
}
