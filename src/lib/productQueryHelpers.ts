import { prisma as db } from "@/lib/prisma";
import {
  BrandGroupKey,
  CategoryKey,
  classifyBrandGroup,
  classifyProductCategory,
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
  if (
    prod.article &&
    prod.article.trim() &&
    !["0", "-", "PRODUK BARU"].includes(prod.article.trim().toUpperCase())
  ) {
    const allSiblings = await db.product.findMany({
      where: { article: prod.article },
      orderBy: [{ color: "asc" }, { size: "asc" }, { description: "asc" }],
    });
    siblings = cleanPromoList(allSiblings);
  } else if (prod.description) {
    const parts = prod.description.split(":");
    if (parts.length > 1) {
      const parentName = parts[0].trim();
      const allSiblings = await db.product.findMany({
        where: { description: { startsWith: parentName + ":" } },
        orderBy: { description: "asc" },
      });
      siblings = cleanPromoList(allSiblings);
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
    OTHER: 0,
  };
  const categoryCounts: Record<CategoryKey, number> = {
    ALL: groupedArticles.length,
    JAKET: 0,
    ATASAN: 0,
    CELANA: 0,
    DRESS_ROK: 0,
    SEPATU_SANDAL: 0,
    TAS_AKSESORIS: 0,
    TIDUR_DALAM: 0,
    OTHER: 0,
  };

  for (const item of groupedArticles) {
    const bg: BrandGroupKey = (item.brandGroup as BrandGroupKey) || classifyBrandGroup(item);
    brandCounts[bg] = (brandCounts[bg] || 0) + 1;
    const cat: CategoryKey = (item.categoryKey as CategoryKey) || classifyProductCategory(item);
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
  }

  return { brandCounts, categoryCounts };
}

/**
 * Memastikan hasil sesuai presedensi Brand & Kategori (menghindari edge case SQL LIKE)
 */
export function filterByTaxonomy<T extends Record<string, any>>(
  items: T[],
  brandGroup: BrandGroupKey,
  category: CategoryKey
): T[] {
  return items.filter((item) => {
    if (brandGroup !== "ALL") {
      const g = item.brandGroup || classifyBrandGroup(item);
      if (g !== brandGroup) return false;
    }
    if (category !== "ALL") {
      const c = item.categoryKey || classifyProductCategory(item);
      if (c !== category) return false;
    }
    return true;
  });
}
