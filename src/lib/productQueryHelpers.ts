import { prisma as db } from "@/lib/prisma";
import {
  BrandGroupKey,
  CategoryKey,
  GenderKey,
  SubBrandCount,
  classifyBrandGroup,
  classifyProductCategory,
  classifyProductGender,
  getNormalizedSubBrand,
  createEmptyCategoryCounts,
  createEmptyGenderCounts,
  sortSubBrandStats,
  paginateBrandSections,
  paginateCategorySections,
} from "@/lib/productTaxonomy";

let cachedEstimatedCount: { value: number; fetchedAt: number } | null = null;
const ESTIMATED_COUNT_TTL_MS = 30 * 60 * 1000;

/**
 * Mengambil estimasi jumlah baris tabel Product secara O(1) (1 row read!) dari `offline-db/manifest.json`
 * agar bebas full B-tree scan `COUNT(*)` 310.536 rows read di Turso SQLite.
 */
export async function getEstimatedProductCount(): Promise<number> {
  const now = Date.now();
  if (cachedEstimatedCount && now - cachedEstimatedCount.fetchedAt < ESTIMATED_COUNT_TTL_MS) {
    return cachedEstimatedCount.value;
  }
  try {
    const { readTursoStorageJson } = await import("@/lib/tursoStorage");
    const manifest = await readTursoStorageJson<any>("offline-db/manifest.json");
    const total = Number(manifest?.totalSkus || 0);
    if (total > 0) {
      cachedEstimatedCount = { value: total, fetchedAt: now };
      return total;
    }
    return cachedEstimatedCount?.value ?? 310536;
  } catch {
    return cachedEstimatedCount?.value ?? 310536;
  }
}

/**
 * Membaca pre-computed analytics JSON langsung dari Turso Cloud Storage (`analytics/<file>`)
 * yang dihasilkan oleh `python-engine/run_admin_analytics.py` (0% Supabase).
 */
export async function fetchStorageAnalyticsJson<T = any>(
  fileName: string
): Promise<T | null> {
  try {
    const { readTursoStorageJson } = await import("@/lib/tursoStorage");
    const clean = fileName.replace(/^\/+/, "");
    return await readTursoStorageJson<T>(`analytics/${clean}`);
  } catch {
    return null;
  }
}

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
  const raw = String(toDate).trim();
  if (!raw) return false;
  const datePart = raw.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    const todayWib = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return todayWib > datePart;
  }
  const toDateObj = new Date(raw);
  if (isNaN(toDateObj.getTime())) return false;
  toDateObj.setHours(23, 59, 59, 999);
  return new Date() > toDateObj;
}

export function isNormalPriceTerm(val?: string | null): boolean {
  if (!val) return false;
  const s = String(val).trim().toUpperCase();
  return s.includes("NORMAL") || s === "REGULAR" || s === "HARGA NORMAL";
}

export function isItemPromoActive(item: any): boolean {
  if (!item || isPromoExpired(item.toDate)) return false;
  const hasPromoPrice = Boolean(
    item.hargaPromo &&
      Number(item.hargaPromo) > 0 &&
      (!item.hargaNormal || Number(item.hargaPromo) < Number(item.hargaNormal))
  );
  const hasDiskon = Boolean(
    item.diskon &&
      String(item.diskon).trim() !== "" &&
      String(item.diskon).trim() !== "0" &&
      String(item.diskon).trim() !== "0%" &&
      !isNormalPriceTerm(item.diskon)
  );
  const hasDiscountType = Boolean(
    item.discountType &&
      !isNormalPriceTerm(item.discountType)
  );
  return Boolean(hasPromoPrice || hasDiskon || hasDiscountType);
}

/**
 * Membersihkan promo kedaluwarsa & label promo palsu (NORMAL PRICE) di memori tanpa spam koneksi DB per-baris,
 * lalu menjadwalkan 1 updateMany asinkron ke PostgreSQL bila ada promo expired atau fake promo.
 */
export function sanitizeRetailPrice(val: any): number {
  const n = Number(val || 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n >= 1_000_000_000 ? Math.round(n / 1_000_000) : n;
}

export function cleanPromoList(rows: any[]): any[] {
  const expiredIds: number[] = [];
  const fakePromoIds: number[] = [];
  const cleaned = rows.map((p) => {
    if (!p) return p;
    const normP =
      (Number(p.hargaNormal || 0) >= 1_000_000_000 || Number(p.hargaPromo || 0) >= 1_000_000_000)
        ? {
            ...p,
            hargaNormal: sanitizeRetailPrice(p.hargaNormal),
            hargaPromo: p.hargaPromo ? sanitizeRetailPrice(p.hargaPromo) : null,
          }
        : p;
    const isExpired = isPromoExpired(normP.toDate);
    const isFakeNormal = Boolean(
      (normP.acara && isNormalPriceTerm(normP.acara)) ||
      (normP.discountType && isNormalPriceTerm(normP.discountType)) ||
      (normP.hargaPromo && normP.hargaNormal && Number(normP.hargaPromo) >= Number(normP.hargaNormal))
    );

    if (isExpired || isFakeNormal) {
      if (typeof normP.id === "number" && normP.id > 0) {
        if (isExpired) expiredIds.push(normP.id);
        if (isFakeNormal) fakePromoIds.push(normP.id);
      }
      return {
        ...normP,
        hargaPromo: null,
        diskon: null,
        discountType: null,
        acara: null,
        fromDate: null,
        toDate: null,
      };
    }
    return normP;
  });

  const idsToClean = Array.from(new Set([...expiredIds, ...fakePromoIds]));
  if (idsToClean.length > 0) {
    db.product
      .updateMany({
        where: { id: { in: idsToClean } },
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
  const genderCounts: Record<GenderKey, number> = {
    ...createEmptyGenderCounts(),
    ALL: groupedArticles.length,
  };
  const mukuSubBrandTotals = new Map<string, SubBrandCount>();

  for (const item of groupedArticles) {
    const bg: BrandGroupKey = (item.brandGroup as BrandGroupKey) || classifyBrandGroup(item);
    brandCounts[bg] = (brandCounts[bg] || 0) + 1;
    const cat: CategoryKey = (item.categoryKey as CategoryKey) || classifyProductCategory(item);
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    const gen = item.genderKey || classifyProductGender(item);
    if (gen in genderCounts) {
      genderCounts[gen as GenderKey] = (genderCounts[gen as GenderKey] || 0) + 1;
    }

    if (bg === "MUKU") {
      const sb = item.subBrand || getNormalizedSubBrand(item);
      const prev = mukuSubBrandTotals.get(sb) || { name: sb, count: 0, photoCount: 0 };
      prev.count += 1;
      if (item.imageUrl) prev.photoCount += 1;
      mukuSubBrandTotals.set(sb, prev);
    }
  }

  const subBrandCounts = sortSubBrandStats(Array.from(mukuSubBrandTotals.values()), (x) => x.name);
  return { brandCounts, categoryCounts, genderCounts, subBrandCounts };
}

/**
 * Memastikan hasil sesuai presedensi Brand, Kategori, Sub-Brand, & Segmen Gender (menghindari edge case SQL LIKE)
 */
export function filterByTaxonomy<T extends Record<string, any>>(
  items: T[],
  brandGroup: BrandGroupKey,
  category: CategoryKey,
  subBrand: string = "",
  gender: GenderKey = "ALL"
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
    if (gender !== "ALL") {
      const gen = item.genderKey || classifyProductGender(item);
      if (gen !== gender) return false;
    }
    return true;
  });
}

/** Klausa Prisma OR untuk memfilter sub-brand normalisasi Mu+Ku sebelum filter JS presisi */
export function buildSubBrandPrismaClause(subBrand: string): any | undefined {
  const clean = subBrand.trim().toUpperCase();
  if (!clean) return undefined;
  const subClauses: any[] = [
    { brand: { contains: clean } },
    { dept: { contains: clean } },
  ];
  if (clean === "MUKU") {
    subClauses.push(
      { article: { startsWith: "MK-" } },
      { description: { contains: "MUKU" } }
    );
  } else if (clean === "BYRCH & CO") {
    subClauses.push(
      { brand: { contains: "BYRCH" } },
      { dept: { contains: "BYRCH" } }
    );
  } else if (clean === "ST YVES") {
    subClauses.push(
      { brand: { contains: "SAINT YVES" } },
      { dept: { contains: "SAINT YVES" } }
    );
  } else if (clean === "NAYOUNG") {
    subClauses.push(
      { brand: { equals: "ELFORMULA" } },
      { description: { contains: "NA-YOUNG" } }
    );
  } else if (clean === "DISNEY") {
    subClauses.push({ dept: { contains: "THATS DONALD" } });
  } else if (clean === "CHARACTER") {
    subClauses.push({ dept: { contains: "LICENSE" } });
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
  gender = "ALL",
  page = 1,
  limit = 20,
  groupSections = true,
  isBrowseMode = true,
  brandCounts,
  categoryCounts,
  genderCounts,
  promoCount,
  onlyPromo = false,
}: {
  groupedList: any[];
  totalSkus: number;
  brandGroup: BrandGroupKey;
  category: CategoryKey;
  subBrand?: string;
  gender?: GenderKey;
  page?: number;
  limit?: number;
  groupSections?: boolean;
  isBrowseMode?: boolean;
  brandCounts: Record<BrandGroupKey, number>;
  categoryCounts: Record<CategoryKey, number>;
  genderCounts?: Record<GenderKey, number>;
  promoCount?: number;
  onlyPromo?: boolean;
}) {
  const computedPromoCount =
    typeof promoCount === "number"
      ? promoCount
      : groupedList.reduce((acc, item) => (isItemPromoActive(item) ? acc + 1 : acc), 0);
  const workingList = onlyPromo ? groupedList.filter((item) => isItemPromoActive(item)) : groupedList;
  const total = workingList.length;
  const { subBrandCounts, genderCounts: fallbackGenderCounts } = summarizeTaxonomyCounts(workingList);
  const resolvedGenderCounts = genderCounts || fallbackGenderCounts;

  if (brandGroup === "MUKU" && !subBrand && groupSections && workingList.length > 0) {
    const brandPages = paginateBrandSections(workingList, page, 8, 5);
    return {
      data: brandPages.sections.flatMap((s) => s.items),
      meta: {
        page: brandPages.page,
        limit,
        total,
        totalSkus,
        promoCount: computedPromoCount,
        totalPages: brandPages.totalPages,
        brandGroup,
        category,
        subBrand,
        gender,
        brandCounts,
        categoryCounts,
        genderCounts: resolvedGenderCounts,
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
    workingList.length > 0
  ) {
    const catPages = paginateCategorySections(workingList, page, 5, 5);
    return {
      data: catPages.sections.flatMap((s) => s.items),
      meta: {
        page: catPages.page,
        limit,
        total,
        totalSkus,
        promoCount: computedPromoCount,
        totalPages: catPages.totalPages,
        brandGroup,
        category,
        subBrand,
        gender,
        brandCounts,
        categoryCounts,
        genderCounts: resolvedGenderCounts,
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
    data: workingList.slice(safeSkip, safeSkip + limit),
    meta: {
      page: safePage,
      limit,
      total,
      totalSkus,
      promoCount: computedPromoCount,
      totalPages,
      brandGroup,
      category,
      subBrand,
      gender,
      brandCounts,
      categoryCounts,
      genderCounts: resolvedGenderCounts,
      subBrandCounts,
      sectionMode: "LIST" as const,
    },
  };
}
