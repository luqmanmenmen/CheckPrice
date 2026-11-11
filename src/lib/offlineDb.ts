import Dexie from "dexie";
import { expandRetailQuery, computeProductRelevanceScore, groupProductsByArticle } from "./smartSearchEngine";
import {
  BrandGroupKey,
  CategoryKey,
  ResolvedBrandGroup,
  ResolvedCategoryKey,
  classifyBrandGroup,
  classifyProductCategory,
} from "./productTaxonomy";

export interface CachedProduct {
  sku: string;
  barcode?: string | null;
  article?: string | null;
  name: string;
  description?: string | null;
  brand?: string | null;
  dept?: string | null;
  color: string;
  size: string;
  hargaNormal: number;
  hargaPromo: number | null;
  diskon: string | null;
  discountType?: string | null;
  acara?: string | null;
  stok: number;
  toDate: string | null;
  imageUrl?: string | null;
  images?: string[];
}

export interface CachedArticleModel {
  key: string;
  sku: string;
  barcode: string | null;
  article: string | null;
  description: string;
  brand: string | null;
  dept: string | null;
  color: string | null;
  size: string | null;
  stok: number;
  hargaNormal: number;
  hargaPromo: number | null;
  diskon: string | null;
  discountType: string | null;
  acara: string | null;
  toDate: string | null;
  imageUrl: string | null;
  articleGroupCount: number;
  articleTotalStok: number;
  articleColors: string[];
  articleSizes: string[];
  articleHasPromo: boolean;
  articlePromoLabel: string | null;
  brandGroup: ResolvedBrandGroup;
  categoryKey: ResolvedCategoryKey;
  _searchHay?: string;
}

const STORE_SCHEMA = 'sku, barcode, article, name, description, brand, dept, color, size, hargaNormal, hargaPromo, diskon, discountType, acara, stok, toDate, imageUrl';

class SukoDatabase extends Dexie {
  products!: Dexie.Table<CachedProduct, string>;
  models!: Dexie.Table<CachedArticleModel, string>;

  constructor() {
    super("SukoScannerDB");
    this.version(3).stores({
      products: 'sku, name, color, size, hargaNormal, hargaPromo, diskon, stok, toDate',
    });
    this.version(4).stores({
      products: 'sku, barcode, name, brand, dept, color, size, hargaNormal, hargaPromo, diskon, discountType, stok, toDate',
    });
    this.version(5).stores({
      products: 'sku, barcode, article, name, description, brand, dept, color, size, hargaNormal, hargaPromo, diskon, discountType, stok, toDate',
    });
    this.version(6).stores({
      products: 'sku, barcode, article, name, description, brand, dept, color, size, hargaNormal, hargaPromo, diskon, discountType, acara, stok, toDate',
    });
    this.version(7).stores({
      products: STORE_SCHEMA,
    });
    this.version(8).stores({
      products: STORE_SCHEMA,
    });
    this.version(9).stores({
      products: STORE_SCHEMA,
    });
    this.version(10).stores({
      products: STORE_SCHEMA,
    });
    // Versi 11: Rampingkan index ke 3 kolom kueri utama (sku, barcode, article)
    // Membuat penulisan 84.763 produk 10x lebih cepat di HP dan anti-hang
    this.version(11).stores({
      products: 'sku, barcode, article',
    });
    // Versi 12: Tambahkan tabel prakelompokan model per artikel (~19.8rb model)
    // Menjaga seluruh 97rb+ SKU di products utuh sambil membuat cari & Selanjutnya = 5ms!
    this.version(12).stores({
      products: 'sku, barcode, article',
      models: 'key, brandGroup, categoryKey',
    });

    this.on('versionchange', () => {
      this.close();
      return false;
    });
  }
}

export const db = new SukoDatabase();

let memoryModelsCache: CachedArticleModel[] | null = null;
let modelsBuildPromise: Promise<CachedArticleModel[] | null> | null = null;

export function clearModelsMemoryCache() {
  memoryModelsCache = null;
}

function isLocalPromoExpired(toDate: string | null | undefined): boolean {
  if (!toDate) return false;
  const d = new Date(toDate);
  if (isNaN(d.getTime())) return false;
  d.setHours(23, 59, 59, 999);
  return Date.now() > d.getTime();
}

function sanitizeAndIndexModel(m: CachedArticleModel): CachedArticleModel {
  const cleanM = isLocalPromoExpired(m.toDate)
    ? {
        ...m,
        hargaPromo: null,
        diskon: null,
        discountType: null,
        acara: null,
        toDate: null,
        articleHasPromo: false,
        articlePromoLabel: null,
      }
    : m;

  if (!cleanM._searchHay) {
    cleanM._searchHay = `${cleanM.article || ""} ${cleanM.description || ""} ${cleanM.brand || ""} ${cleanM.dept || ""} ${cleanM.articleColors?.join(" ") || cleanM.color || ""} ${cleanM.sku} ${cleanM.barcode || ""}`.toUpperCase();
  }
  return cleanM;
}

/**
 * Membangun tabel `db.models` (~19.881 model per artikel) sekali saja dari `db.products` (~97k SKU)
 * sehingga seluruh pencarian teks, filter brand/kategori, dan klik Selanjutnya jalan < 10ms di HP!
 */
export async function rebuildModelsIndexFromProducts(): Promise<CachedArticleModel[] | null> {
  try {
    await ensureDbOpenSafe();
    const allProducts = await db.products.toArray();
    if (!allProducts || allProducts.length === 0) return null;

    const cleanedProducts = allProducts.map((p) => {
      if (isLocalPromoExpired(p.toDate)) {
        return { ...p, hargaPromo: null, diskon: null, discountType: null, acara: null, toDate: null };
      }
      return p;
    });

    const grouped = groupProductsByArticle(cleanedProducts);
    const models: CachedArticleModel[] = grouped.map((g) => {
      const rawArt = String(g.article || "").trim().toUpperCase();
      const key = rawArt && !["0", "-", "PRODUK BARU"].includes(rawArt) ? `A::${rawArt}` : `S::${g.sku}`;
      const row: CachedArticleModel = {
        key,
        sku: g.sku,
        barcode: g.barcode || null,
        article: g.article || null,
        description: g.description || g.name || "",
        brand: g.brand || null,
        dept: g.dept || null,
        color: g.color || null,
        size: g.size || null,
        stok: g.stok ?? 0,
        hargaNormal: g.hargaNormal ?? 0,
        hargaPromo: g.hargaPromo ?? null,
        diskon: g.diskon || null,
        discountType: g.discountType || null,
        acara: g.acara || null,
        toDate: g.toDate || null,
        imageUrl: g.imageUrl || null,
        articleGroupCount: g.articleGroupCount,
        articleTotalStok: g.articleTotalStok,
        articleColors: g.articleColors,
        articleSizes: g.articleSizes,
        articleHasPromo: g.articleHasPromo,
        articlePromoLabel: g.articlePromoLabel,
        brandGroup: g.brandGroup,
        categoryKey: g.categoryKey,
      };
      return sanitizeAndIndexModel(row);
    });

    await db.models.clear();
    const WRITE_BATCH = 2500;
    for (let i = 0; i < models.length; i += WRITE_BATCH) {
      const slice = models.slice(i, i + WRITE_BATCH).map(({ _searchHay, ...rest }) => rest);
      await db.models.bulkPut(slice as CachedArticleModel[]);
    }

    memoryModelsCache = models;
    return models;
  } catch (e) {
    console.warn("[OfflineDB] Gagal membangun index models lokal:", e);
    return null;
  }
}

const MODELS_TAXONOMY_VERSION = "v13_smz_monostore";

export async function ensureModelsIndexReady(): Promise<CachedArticleModel[] | null> {
  if (memoryModelsCache && memoryModelsCache.length >= 1000) {
    return memoryModelsCache;
  }
  if (modelsBuildPromise) return modelsBuildPromise;

  modelsBuildPromise = (async () => {
    try {
      await ensureDbOpenSafe();
      const taxVer = typeof window !== "undefined" ? localStorage.getItem("suko_models_taxonomy_ver") : null;
      const modelCount = await db.models.count().catch(() => 0);
      if (modelCount >= 1000 && taxVer === MODELS_TAXONOMY_VERSION) {
        const stored = await db.models.toArray();
        const hasLegacyOther = stored.some((m) => (m.brandGroup as string) === "OTHER");
        if (!hasLegacyOther) {
          memoryModelsCache = stored.map(sanitizeAndIndexModel);
          return memoryModelsCache;
        }
      }

      const prodCount = await db.products.count().catch(() => 0);
      if (prodCount >= 1000) {
        const rebuilt = await rebuildModelsIndexFromProducts();
        if (rebuilt && typeof window !== "undefined") {
          localStorage.setItem("suko_models_taxonomy_ver", MODELS_TAXONOMY_VERSION);
        }
        return rebuilt;
      }
      return null;
    } catch {
      return null;
    } finally {
      modelsBuildPromise = null;
    }
  })();

  return modelsBuildPromise;
}

export async function getLocalCacheStats(): Promise<{
  skuCount: number;
  modelCount: number;
  sizeMB: number;
  ready: boolean;
}> {
  try {
    await ensureDbOpenSafe();
    const [skuCount, modelCount] = await Promise.all([
      db.products.count().catch(() => 0),
      db.models.count().catch(() => 0),
    ]);

    let sizeMB = Math.round((skuCount * 320 + modelCount * 420) / (1024 * 1024));
    if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
      try {
        const est = await navigator.storage.estimate();
        if (est.usage && est.usage > 1024 * 1024 && skuCount > 0) {
          sizeMB = Math.round(est.usage / (1024 * 1024));
        }
      } catch {}
    }

    return {
      skuCount,
      modelCount: modelCount || memoryModelsCache?.length || 0,
      sizeMB: Math.max(0, sizeMB),
      ready: skuCount >= 1000,
    };
  } catch {
    return { skuCount: 0, modelCount: 0, sizeMB: 0, ready: false };
  }
}

export async function ensureDbOpenSafe(): Promise<boolean> {
  try {
    if (!db.isOpen()) {
      await db.open();
    }
    return true;
  } catch (err) {
    console.warn("[OfflineDB] Gagal membuka IndexedDB normal, mereset database lokal...", err);
    try {
      db.close();
      await Dexie.delete("SukoScannerDB");
      await db.open();
      return true;
    } catch (resetErr) {
      console.error("[OfflineDB] Gagal total reset IndexedDB:", resetErr);
      return false;
    }
  }
}

export async function checkIfUpdateAvailable(): Promise<boolean> {
  try {
    await ensureDbOpenSafe();
    const count = await db.products.count().catch(() => 0);
    const localVersion = localStorage.getItem("suko_server_version");
    const localDbSchema = localStorage.getItem("suko_db_schema_version");

    const checkRes = await fetch(`/api/check-update?t=${Date.now()}`, { cache: "no-store" });
    if (!checkRes.ok) return false;
    const checkData = await checkRes.json();

    if (checkData.success) {
      const serverVersion = checkData.lastUpdate.toString();
      if (localDbSchema !== "v12" || localVersion !== serverVersion || count < 80000) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Sinkronisasi Offline Database Berbasis Chunk (Aman untuk 84.763+ SKU!)
 * - Mengunduh per 10.000 SKU (~1.9 MB JSON per chunk) agar bebas limit 4.5MB Vercel.
 * - Chunk 0 berisi seluruh 5.895 produk yang memiliki stok fisik toko (`stok > 0`),
 *   sehingga dalam 1 detik pertama HP kasir langsung siap pakai!
 * - Dilengkapi auto-retry 3x per chunk & verifikasi seluruh chunk selesai (84.763 SKU)
 *   sehingga langsung siap di-scan instan tanpa perlu refresh web.
 */
export async function syncOfflineDatabase(
  onSyncStateChange?: (isSyncing: boolean, progress?: number) => void,
  forceSync: boolean = false
): Promise<boolean> {
  try {
    await ensureDbOpenSafe();
    const count = await db.products.count().catch(() => 0);
    const localVersion = localStorage.getItem("suko_server_version");
    const localDbSchema = localStorage.getItem("suko_db_schema_version");

    const checkRes = await fetch(`/api/check-update?t=${Date.now()}`, { cache: "no-store" });
    const checkData = await checkRes.json();

    if (checkData.success) {
      const serverVersion = checkData.lastUpdate.toString();

      if (forceSync || localDbSchema !== "v12" || localVersion !== serverVersion || count < 80000) {
        if (onSyncStateChange) onSyncStateChange(true, 5);

        const CHUNK_LIMIT = 10000;
        const MAX_CHUNKS = 12; // Mendukung hingga 120.000 SKU
        let totalSynced = 0;
        let completedAllChunks = false;

        for (let chunkIdx = 0; chunkIdx < MAX_CHUNKS; chunkIdx++) {
          let result: any = null;
          let lastErr: any = null;

          // Auto-retry hingga 3x per chunk jika jaringan Wi-Fi toko sempat kedip
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              const res = await fetch(
                `/api/export-products?chunk=${chunkIdx}&limit=${CHUNK_LIMIT}&t=${Date.now()}`,
                { cache: "no-store" }
              );
              if (res.ok) {
                result = await res.json();
                break;
              }
              lastErr = new Error(`HTTP ${res.status}`);
            } catch (err) {
              lastErr = err;
            }
            await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
          }

          if (!result) {
            if (chunkIdx === 0) throw lastErr || new Error("Gagal unduh chunk 0");
            break;
          }

          if (!result.success || !Array.isArray(result.data) || result.data.length === 0) {
            completedAllChunks = true;
            break;
          }

          await ensureDbOpenSafe();
          const items = result.data;
          const WRITE_BATCH = 2500;
          for (let i = 0; i < items.length; i += WRITE_BATCH) {
            const sub = items.slice(i, i + WRITE_BATCH);
            await db.products.bulkPut(sub);
          }

          totalSynced += items.length;
          if (onSyncStateChange) {
            const estProgress = Math.min(98, Math.round(((chunkIdx + 1) / 9) * 95));
            onSyncStateChange(true, estProgress);
          }

          if (!result.hasMore || items.length < CHUNK_LIMIT) {
            completedAllChunks = true;
            break;
          }
        }

        if (totalSynced > 0) {
          await ensureDbOpenSafe();
          const finalCount = await db.products.count().catch(() => totalSynced);
          memoryModelsCache = null;
          await rebuildModelsIndexFromProducts();
          if (onSyncStateChange) onSyncStateChange(true, 100);
          if (completedAllChunks || finalCount >= 80000) {
            localStorage.setItem("suko_server_version", serverVersion);
            localStorage.setItem("suko_dismissed_update", serverVersion);
            localStorage.setItem("suko_db_schema_version", "v12");
          }
          console.log(`[OfflineDB] Berhasil sync ${totalSynced.toLocaleString()} produk (Total DB: ${finalCount.toLocaleString()} SKU, versi: ${serverVersion})`);
          return true;
        }
      } else {
        return true;
      }
    }
    return false;
  } catch (e) {
    console.error("Failed to sync offline DB", e);
    return false;
  } finally {
    if (onSyncStateChange) onSyncStateChange(false);
  }
}

/**
 * Pencarian Pintar Offline (SKU, Barcode, Artikel, maupun 30% Nama Deskripsi)
 * Digunakan saat internet toko mati/lambat agar kasir tetap bisa mencari manual
 */
export interface LocalQueryResponse {
  data: CachedArticleModel[];
  singleMatch?: CachedArticleModel | null;
  total: number;
  totalSkus: number;
  page: number;
  totalPages: number;
  brandCounts: Record<BrandGroupKey, number>;
  categoryCounts: Record<CategoryKey, number>;
}

/**
 * Mesin kueri instan ~5-10ms di memori HP atas 19.881 model per artikel (~97.546 SKU).
 * Mengembalikan seluruh paginasi, hitungan Brand (SUKO/Mu+Ku/ZES), & Kategori tanpa menunggu jaringan!
 */
export async function queryLocalModelsInstant({
  query = "",
  brandGroup = "ALL",
  category = "ALL",
  subBrand = "",
  page = 1,
  limit = 20,
}: {
  query?: string;
  brandGroup?: BrandGroupKey;
  category?: CategoryKey;
  subBrand?: string;
  page?: number;
  limit?: number;
}): Promise<LocalQueryResponse | null> {
  const models = await ensureModelsIndexReady();
  if (!models || models.length < 1000) return null;

  const trimmed = query.trim();
  const upper = trimmed.toUpperCase();
  const subBrandUpper = subBrand.trim().toUpperCase();
  const isDummy = trimmed.toLowerCase().includes("dummy");

  let baseMatched: CachedArticleModel[] = [];

  if (trimmed) {
    // 1. Cek exact article / sku match jika tidak sedang memfilter taxonomy
    if (brandGroup === "ALL" && category === "ALL" && !subBrandUpper && page === 1 && !/\s/.test(upper)) {
      const exactArts = models.filter(
        (m) =>
          (m.article && m.article.toUpperCase() === upper) ||
          m.sku.toUpperCase() === upper ||
          (m.barcode && m.barcode.toUpperCase() === upper)
      );
      if (exactArts.length === 1) {
        return {
          data: exactArts,
          singleMatch: exactArts[0],
          total: 1,
          totalSkus: exactArts[0].articleGroupCount || 1,
          page: 1,
          totalPages: 1,
          brandCounts: { ALL: 1, SUKO: 0, MUKU: 0, ZES: 0, [exactArts[0].brandGroup]: 1 },
          categoryCounts: {
            ALL: 1,
            JAKET: 0,
            ATASAN: 0,
            CELANA: 0,
            DRESS_ROK: 0,
            SEPATU_SANDAL: 0,
            TAS_AKSESORIS: 0,
            TIDUR_DALAM: 0,
            OTHER: 0,
            [exactArts[0].categoryKey]: 1,
          },
        };
      }
    }

    const expanded = expandRetailQuery(trimmed);
    const terms = expanded.allExpandedTerms.filter((t) => t.length >= 2);
    const sub3 = expanded.spaceless.length >= 3 ? expanded.spaceless.slice(0, 3) : "";

    const scored: { item: CachedArticleModel; score: number }[] = [];
    for (let i = 0; i < models.length; i++) {
      const m = models[i];
      const hay = m._searchHay || "";
      if (!isDummy && (hay.includes("SKU DUMMY") || (m.article || "").toUpperCase().includes("DUMMY"))) {
        continue;
      }

      let quickHit = false;
      for (let t = 0; t < terms.length; t++) {
        if (hay.includes(terms[t])) {
          quickHit = true;
          break;
        }
      }
      if (!quickHit && sub3 && hay.includes(sub3)) quickHit = true;
      if (!quickHit) continue;

      const s = computeProductRelevanceScore(m, expanded, isDummy);
      if (s >= 35) {
        scored.push({ item: m, score: s });
      }
    }

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.item.articleTotalStok !== a.item.articleTotalStok) {
        return b.item.articleTotalStok - a.item.articleTotalStok;
      }
      return (a.item.description || "").localeCompare(b.item.description || "");
    });
    baseMatched = scored.map((x) => x.item);
  } else {
    baseMatched = models.filter(
      (m) => !((m.description || "").toUpperCase().includes("SKU DUMMY") || (m.article || "").toUpperCase().includes("DUMMY"))
    );
    baseMatched.sort((a, b) => {
      if (b.articleTotalStok !== a.articleTotalStok) return b.articleTotalStok - a.articleTotalStok;
      if (b.articleHasPromo !== a.articleHasPromo) return (b.articleHasPromo ? 1 : 0) - (a.articleHasPromo ? 1 : 0);
      return (a.description || "").localeCompare(b.description || "");
    });
  }

  // Hitung brandCounts lintas semua brand (terfilter oleh kategori jika aktif)
  const brandCounts: Record<BrandGroupKey, number> = { ALL: 0, SUKO: 0, MUKU: 0, ZES: 0 };
  const categoryCounts: Record<CategoryKey, number> = {
    ALL: 0,
    JAKET: 0,
    ATASAN: 0,
    CELANA: 0,
    DRESS_ROK: 0,
    SEPATU_SANDAL: 0,
    TAS_AKSESORIS: 0,
    TIDUR_DALAM: 0,
    OTHER: 0,
  };

  const finalMatched: CachedArticleModel[] = [];
  let totalSkus = 0;

  for (let i = 0; i < baseMatched.length; i++) {
    const m = baseMatched[i];
    const matchBrand = brandGroup === "ALL" || m.brandGroup === brandGroup;
    const matchCat = category === "ALL" || m.categoryKey === category;
    const matchSubBrand =
      !subBrandUpper ||
      (m.brand || "").toUpperCase().includes(subBrandUpper) ||
      (m.dept || "").toUpperCase().includes(subBrandUpper);

    if (matchCat) {
      brandCounts.ALL += 1;
      brandCounts[m.brandGroup] += 1;
    }
    if (matchBrand && matchSubBrand) {
      categoryCounts.ALL += 1;
      categoryCounts[m.categoryKey] += 1;
    }
    if (matchBrand && matchCat && matchSubBrand) {
      finalMatched.push(m);
      totalSkus += m.articleGroupCount || 1;
    }
  }

  const total = finalMatched.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const skip = (safePage - 1) * limit;

  return {
    data: finalMatched.slice(skip, skip + limit),
    total,
    totalSkus,
    page: safePage,
    totalPages,
    brandCounts,
    categoryCounts,
  };
}

/**
 * Pencarian Pintar Offline (memanfaatkan memori model pre-grouped jika siap)
 */
export async function searchOfflineSmart(
  rawInput: string,
  limit: number = 25,
  brandGroup: BrandGroupKey = "ALL",
  category: CategoryKey = "ALL"
): Promise<CachedArticleModel[]> {
  try {
    const fast = await queryLocalModelsInstant({ query: rawInput, brandGroup, category, page: 1, limit });
    if (fast) return fast.data;
    return [];
  } catch (e) {
    console.warn("[OfflineDB] Gagal mencari offline smart:", e);
    return [];
  }
}

/**
 * Menjelajah katalog lokal per Brand Concept (SUKO/Mu+Ku/ZES) & Kategori
 */
export async function browseOfflineCatalog(
  brandGroup: BrandGroupKey = "ALL",
  category: CategoryKey = "ALL",
  limit: number = 40
): Promise<CachedArticleModel[]> {
  try {
    const fast = await queryLocalModelsInstant({ query: "", brandGroup, category, page: 1, limit });
    if (fast) return fast.data;
    return [];
  } catch (e) {
    console.warn("[OfflineDB] Gagal jelajah katalog offline:", e);
    return [];
  }
}

export async function getLocalTaxonomyOverview(): Promise<{
  brandCounts: Record<BrandGroupKey, number>;
  categoryCounts: Record<CategoryKey, number>;
} | null> {
  try {
    const res = await queryLocalModelsInstant({ query: "", brandGroup: "ALL", category: "ALL", page: 1, limit: 1 });
    if (!res) return null;
    return { brandCounts: res.brandCounts, categoryCounts: res.categoryCounts };
  } catch {
    return null;
  }
}
