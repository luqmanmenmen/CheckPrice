import Dexie from "dexie";
import {
  expandRetailQuery,
  computeProductRelevanceScore,
  groupProductsByArticle,
  getProductArticleGroupKey,
  isIgnoredCatalogProduct,
} from "./smartSearchEngine";
import {
  BrandGroupKey,
  CategoryKey,
  ResolvedBrandGroup,
  ResolvedCategoryKey,
  SubBrandCount,
  BrandShowcaseSection,
  CategoryShowcaseSection,
  classifyBrandGroup,
  classifyProductCategory,
  getNormalizedSubBrand,
  createEmptyCategoryCounts,
  sortSubBrandStats,
  paginateBrandSections,
  paginateCategorySections,
  compareBrowseItems,
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
  subBrand?: string;
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

/** Bentuk daftar kandidat kode SKU/barcode fleksibel untuk pencarian lokal (case-insensitive & tanpa pemisah). */
export function buildCodeSearchCandidates(rawCode: string): string[] {
  const trimmed = String(rawCode || "").trim();
  if (!trimmed) return [];
  const upper = trimmed.toUpperCase();
  const noSep = upper.replace(/[\s\-_./]/g, "");
  const out = new Set<string>([trimmed, upper, noSep]);
  if (/^\d+$/.test(trimmed)) {
    const stripped = trimmed.replace(/^0+/, "");
    if (stripped) out.add(stripped);
    if (trimmed.length === 12) out.add(`0${trimmed}`);
    if (trimmed.length === 13 && trimmed.startsWith("0")) out.add(trimmed.slice(1));
  }
  return Array.from(out).filter(Boolean);
}

/** Cari 1 SKU/barcode di Dexie lokal dengan normalisasi huruf kapital, pemisah (-/_/./spasi), dan nol depan. */
export async function findOfflineProductByCode(rawCode: string): Promise<CachedProduct | null> {
  const candidates = buildCodeSearchCandidates(rawCode);
  if (candidates.length === 0) return null;
  await ensureDbOpenSafe();
  const bySku = await db.products.where("sku").anyOf(candidates).first();
  if (bySku) return bySku;
  const byBarcode = await db.products.where("barcode").anyOf(candidates).first();
  return byBarcode || null;
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

  const withSubBrand = cleanM.subBrand
    ? cleanM
    : { ...cleanM, subBrand: getNormalizedSubBrand(cleanM) };

  if (!withSubBrand._searchHay) {
    withSubBrand._searchHay = `${withSubBrand.article || ""} ${withSubBrand.description || ""} ${withSubBrand.brand || ""} ${withSubBrand.subBrand || ""} ${withSubBrand.dept || ""} ${withSubBrand.articleColors?.join(" ") || withSubBrand.color || ""} ${withSubBrand.sku} ${withSubBrand.barcode || ""}`.toUpperCase();
  }
  return withSubBrand;
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
      const key = getProductArticleGroupKey(g);
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
        subBrand: getNormalizedSubBrand(g),
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

const MODELS_TAXONOMY_VERSION = "v16_zes_clean_dedup";

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

      // 1. Prioritaskan ambil index pre-computed langsung dari Python (`CatalogArticle` via /api/catalog-models) ~1 detik
      try {
        const fetchedModels: CachedArticleModel[] = [];
        for (let chunk = 0; chunk < 12; chunk++) {
          const res = await fetch(`/api/catalog-models?chunk=${chunk}&limit=9000&t=${Date.now()}`, {
            cache: "no-store",
          });
          if (!res.ok) break;
          const json = await res.json();
          if (!json?.success || !Array.isArray(json.data) || json.data.length === 0) break;
          for (const row of json.data) {
            fetchedModels.push(sanitizeAndIndexModel(row as CachedArticleModel));
          }
          if (json.data.length < 9000) break;
        }
        if (fetchedModels.length >= 1000) {
          await db.models.clear();
          const WRITE_BATCH = 2500;
          for (let i = 0; i < fetchedModels.length; i += WRITE_BATCH) {
            const slice = fetchedModels.slice(i, i + WRITE_BATCH).map(({ _searchHay, ...rest }) => rest);
            await db.models.bulkPut(slice as CachedArticleModel[]);
          }
          memoryModelsCache = fetchedModels;
          if (typeof window !== "undefined") {
            localStorage.setItem("suko_models_taxonomy_ver", MODELS_TAXONOMY_VERSION);
          }
          return memoryModelsCache;
        }
      } catch {}

      // 2. Fallback lokal dari db.products jika sedang offline
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

export interface SyncProgressDetails {
  percent: number;
  downloadedSkus: number;
  totalSkus: number;
  etaSeconds: number | null;
  statusText: string;
  stage: "checking" | "downloading" | "indexing" | "done" | "error";
}

export type SyncProgressCallback = (
  isSyncing: boolean,
  progress?: number,
  details?: SyncProgressDetails
) => void;

const SYNC_BACKOFF_STORAGE_KEY = "suko_sync_backoff_until";
let activeSyncPromise: Promise<boolean> | null = null;
const activeSyncListeners = new Set<SyncProgressCallback>();

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
 * Sinkronisasi Offline Database Berbasis Keyset Cursor & Chunk (Anti-Looping + Estimasi ETA Real-Time)
 * - Memakai single-flight lock (`activeSyncPromise`) agar tidak pernah terjadi download ganda / looping paralel.
 * - Menggunakan keyset cursor (`cursorStok`, `cursorSku`) sehingga chunk akhir (90.000+) tetap instan O(1).
 * - Mengirimkan persentase monotonik (0% -> 100%) & estimasi sisa waktu nyata per batch penulisan.
 */
export async function syncOfflineDatabase(
  onSyncStateChange?: SyncProgressCallback,
  forceSync: boolean = false
): Promise<boolean> {
  if (onSyncStateChange) {
    activeSyncListeners.add(onSyncStateChange);
  }

  if (activeSyncPromise) {
    return activeSyncPromise;
  }

  const notifyAll = (
    isSyncing: boolean,
    progress?: number,
    details?: SyncProgressDetails
  ) => {
    for (const cb of activeSyncListeners) {
      try {
        cb(isSyncing, progress, details);
      } catch {}
    }
  };

  activeSyncPromise = (async () => {
    let highestPercent = 0;
    let smoothedEta: number | null = null;

    const emit = (
      isSyncing: boolean,
      rawPercent: number,
      downloadedSkus: number,
      totalSkus: number,
      etaSeconds: number | null,
      statusText: string,
      stage: SyncProgressDetails["stage"]
    ) => {
      if (stage === "done") {
        highestPercent = 100;
      } else if (stage === "error") {
        highestPercent = Math.max(0, highestPercent);
      } else {
        highestPercent = Math.max(highestPercent, Math.min(99, Math.round(rawPercent)));
      }

      if (typeof etaSeconds === "number" && isFinite(etaSeconds) && etaSeconds > 0) {
        smoothedEta =
          smoothedEta === null
            ? Math.ceil(etaSeconds)
            : Math.max(1, Math.round(smoothedEta * 0.55 + etaSeconds * 0.45));
      } else if (stage === "done") {
        smoothedEta = 0;
      }

      const details: SyncProgressDetails = {
        percent: stage === "error" ? highestPercent : highestPercent,
        downloadedSkus,
        totalSkus,
        etaSeconds: stage === "checking" ? null : stage === "done" ? 0 : smoothedEta ?? etaSeconds,
        statusText,
        stage,
      };
      notifyAll(isSyncing, details.percent, details);
    };

    try {
      // Cegah auto-looping terus-menerus jika baru saja gagal jaringan/server
      if (!forceSync && typeof window !== "undefined") {
        const backoffUntil = Number(sessionStorage.getItem(SYNC_BACKOFF_STORAGE_KEY) || "0");
        if (backoffUntil > Date.now()) {
          return false;
        }
      } else if (forceSync && typeof window !== "undefined") {
        sessionStorage.removeItem(SYNC_BACKOFF_STORAGE_KEY);
      }

      emit(true, 2, 0, 0, null, "Memeriksa pembaruan katalog server...", "checking");

      await ensureDbOpenSafe();
      const count = await db.products.count().catch(() => 0);
      const localVersion = localStorage.getItem("suko_server_version");
      const localDbSchema = localStorage.getItem("suko_db_schema_version");

      const checkRes = await fetch(`/api/check-update?t=${Date.now()}`, { cache: "no-store" });
      if (!checkRes.ok) {
        throw new Error(`HTTP ${checkRes.status} saat cek versi`);
      }
      const checkData = await checkRes.json();

      if (!checkData?.success) {
        throw new Error(checkData?.error || "Respon cek update tidak valid");
      }

      const serverVersion = checkData.lastUpdate.toString();
      const needsDownload =
        forceSync || localDbSchema !== "v12" || localVersion !== serverVersion || count < 80000;

      if (!needsDownload) {
        await ensureModelsIndexReady();
        emit(false, 100, count, count, 0, "Data offline sudah mutakhir.", "done");
        return true;
      }

      emit(true, 4, 0, Math.max(count, 97546), null, "Memulai unduhan data produk...", "downloading");

      const CHUNK_LIMIT = 6000;
      const MAX_CHUNKS = 60; // Mendukung hingga 360.000 SKU secara aman
      const downloadStartedAt = Date.now();
      let totalSynced = 0;
      let expectedTotal = Math.max(count, 97546);
      let completedAllChunks = false;
      let cursorStok: number | null = null;
      let cursorSku: string | null = null;

      for (let chunkIdx = 0; chunkIdx < MAX_CHUNKS; chunkIdx++) {
        let result: any = null;
        let lastErr: any = null;

        // Auto-retry hingga 3x dengan backoff bertahap jika jaringan toko kedip
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const cursorQuery =
              cursorStok !== null && cursorSku
                ? `&cursorStok=${encodeURIComponent(String(cursorStok))}&cursorSku=${encodeURIComponent(cursorSku)}`
                : "";
            const res = await fetch(
              `/api/export-products?chunk=${chunkIdx}&limit=${CHUNK_LIMIT}&v=${encodeURIComponent(serverVersion)}${cursorQuery}`,
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
          if (attempt < 2) {
            emit(
              true,
              Math.max(highestPercent, 5),
              totalSynced,
              expectedTotal,
              smoothedEta,
              `Koneksi agak lambat, mencoba ulang bagian ${chunkIdx + 1} (${attempt + 2}/3)...`,
              "downloading"
            );
            await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
          }
        }

        if (!result) {
          throw lastErr || new Error(`Gagal unduh bagian ${chunkIdx + 1}`);
        }

        if (typeof result.totalCount === "number" && result.totalCount > 0) {
          expectedTotal = Math.max(result.totalCount, totalSynced + (result.data?.length || 0));
        }

        if (!result.success || !Array.isArray(result.data) || result.data.length === 0) {
          completedAllChunks = true;
          break;
        }

        await ensureDbOpenSafe();
        const items = result.data;
        const WRITE_BATCH = 3000;
        for (let i = 0; i < items.length; i += WRITE_BATCH) {
          const sub = items.slice(i, i + WRITE_BATCH);
          await db.products.bulkPut(sub);
          totalSynced += sub.length;

          const elapsedSec = Math.max(0.25, (Date.now() - downloadStartedAt) / 1000);
          const ratio = Math.min(0.99, totalSynced / Math.max(expectedTotal, totalSynced, 1));
          const progressVal = 5 + ratio * 84; // 5% .. 89%

          // Mulai hitung ETA yang akurat setelah minimal 1 batch selesai ditulis
          let etaSec: number | null = null;
          if (totalSynced >= 3000 && elapsedSec >= 0.4 && ratio > 0.02) {
            const remainingDownloadSec = (elapsedSec / ratio) - elapsedSec;
            etaSec = Math.max(1, remainingDownloadSec + 2.5); // +2.5 detik estimasi rebuild indeks lokal
          }

          emit(
            true,
            progressVal,
            totalSynced,
            Math.max(expectedTotal, totalSynced),
            etaSec,
            `${totalSynced.toLocaleString("id-ID")} / ${Math.max(expectedTotal, totalSynced).toLocaleString("id-ID")} SKU tersimpan`,
            "downloading"
          );
        }

        if (result.nextCursor?.sku) {
          cursorStok = result.nextCursor.stok ?? 0;
          cursorSku = result.nextCursor.sku;
        } else {
          cursorStok = null;
          cursorSku = null;
        }

        if (!result.hasMore || items.length < CHUNK_LIMIT) {
          completedAllChunks = true;
          break;
        }
      }

      if (!completedAllChunks || totalSynced === 0) {
        throw new Error("Sinkronisasi data belum tuntas");
      }

      emit(true, 91, totalSynced, expectedTotal, 2, "Menyusun index pencarian & katalog cepat...", "indexing");

      await ensureDbOpenSafe();
      const finalCount = await db.products.count().catch(() => totalSynced);
      memoryModelsCache = null;
      await rebuildModelsIndexFromProducts();

      emit(true, 97, finalCount, finalCount, 1, "Menyegarkan model katalog...", "indexing");

      localStorage.setItem("suko_server_version", serverVersion);
      localStorage.setItem("suko_dismissed_update", serverVersion);
      localStorage.setItem("suko_db_schema_version", "v12");
      localStorage.setItem("suko_models_taxonomy_ver", MODELS_TAXONOMY_VERSION);
      if (typeof window !== "undefined") {
        sessionStorage.removeItem(SYNC_BACKOFF_STORAGE_KEY);
      }

      emit(false, 100, finalCount, finalCount, 0, "Selesai! Semua data siap digunakan.", "done");
      console.log(`[OfflineDB] Berhasil sync ${totalSynced.toLocaleString()} produk (Total DB: ${finalCount.toLocaleString()} SKU, versi: ${serverVersion})`);
      return true;
    } catch (e) {
      console.error("Failed to sync offline DB:", e);
      if (typeof window !== "undefined") {
        sessionStorage.setItem(SYNC_BACKOFF_STORAGE_KEY, String(Date.now() + 90_000));
      }
      emit(false, highestPercent, 0, 0, null, "Sinkronisasi tertunda karena jaringan/server.", "error");
      return false;
    } finally {
      activeSyncPromise = null;
      if (onSyncStateChange) {
        activeSyncListeners.delete(onSyncStateChange);
      }
      activeSyncListeners.clear();
    }
  })();

  return activeSyncPromise;
}

/**
 * Pencarian Pintar Offline (SKU, Barcode, Artikel, maupun 30% Nama Deskripsi)
 * Digunakan saat internet toko mati/lambat agar kasir tetap bisa mencari manual
 */
export type LocalSubBrandCount = SubBrandCount;
export type LocalBrandShowcaseSection = BrandShowcaseSection<CachedArticleModel>;
export type LocalCategoryShowcaseSection = CategoryShowcaseSection<CachedArticleModel>;

export interface LocalQueryResponse {
  data: CachedArticleModel[];
  singleMatch?: CachedArticleModel | null;
  total: number;
  totalSkus: number;
  page: number;
  totalPages: number;
  brandCounts: Record<BrandGroupKey, number>;
  categoryCounts: Record<CategoryKey, number>;
  subBrandCounts?: LocalSubBrandCount[];
  brandShowcaseSections?: LocalBrandShowcaseSection[];
  categoryShowcaseSections?: LocalCategoryShowcaseSection[];
  sectionMode?: "BRAND_PAGES" | "CATEGORY_PAGES" | "LIST";
}

/**
 * Mesin kueri instan ~5-10ms di memori HP atas 17k+ model per artikel (~97.546 SKU).
 * Mengembalikan paginasi per Brand (untuk Mu+Ku), per Kategori (untuk SUKO/ZES), & filter tanpa delay jaringan!
 */
export async function queryLocalModelsInstant({
  query = "",
  brandGroup = "ALL",
  category = "ALL",
  subBrand = "",
  page = 1,
  limit = 20,
  groupSections = true,
}: {
  query?: string;
  brandGroup?: BrandGroupKey;
  category?: CategoryKey;
  subBrand?: string;
  page?: number;
  limit?: number;
  groupSections?: boolean;
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
        const hitSubBrand = exactArts[0].subBrand || getNormalizedSubBrand(exactArts[0]);
        return {
          data: exactArts,
          singleMatch: exactArts[0],
          total: 1,
          totalSkus: exactArts[0].articleGroupCount || 1,
          page: 1,
          totalPages: 1,
          brandCounts: { ALL: 1, SUKO: 0, MUKU: 0, ZES: 0, [exactArts[0].brandGroup]: 1 },
          categoryCounts: {
            ...createEmptyCategoryCounts(),
            ALL: 1,
            [exactArts[0].categoryKey]: 1,
          },
          subBrandCounts:
            exactArts[0].brandGroup === "MUKU"
              ? [{ name: hitSubBrand, count: 1, photoCount: exactArts[0].imageUrl ? 1 : 0 }]
              : [],
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
    baseMatched = models.filter((m) => !isIgnoredCatalogProduct(m));
    baseMatched.sort(compareBrowseItems);
  }

  // Hitung brandCounts lintas semua brand (terfilter oleh kategori jika aktif)
  const brandCounts: Record<BrandGroupKey, number> = { ALL: 0, SUKO: 0, MUKU: 0, ZES: 0 };
  const categoryCounts: Record<CategoryKey, number> = createEmptyCategoryCounts();
  const mukuSubBrandTotals = new Map<string, LocalSubBrandCount>();

  const finalMatched: CachedArticleModel[] = [];
  let totalSkus = 0;

  for (let i = 0; i < baseMatched.length; i++) {
    const m = baseMatched[i];
    if (!isDummy && isIgnoredCatalogProduct(m)) continue;
    const itemSubBrand = m.subBrand || getNormalizedSubBrand(m);
    const matchBrand = brandGroup === "ALL" || m.brandGroup === brandGroup;
    const matchCat = category === "ALL" || m.categoryKey === category;
    const matchSubBrand = !subBrandUpper || itemSubBrand === subBrandUpper;

    if (matchCat) {
      brandCounts.ALL += 1;
      brandCounts[m.brandGroup] += 1;
    }
    if (matchBrand && matchSubBrand) {
      categoryCounts.ALL += 1;
      categoryCounts[m.categoryKey] += 1;
    }
    if (m.brandGroup === "MUKU" && matchCat) {
      const prev = mukuSubBrandTotals.get(itemSubBrand) || {
        name: itemSubBrand,
        count: 0,
        photoCount: 0,
      };
      prev.count += 1;
      if (m.imageUrl) prev.photoCount += 1;
      mukuSubBrandTotals.set(itemSubBrand, prev);
    }
    if (matchBrand && matchCat && matchSubBrand) {
      finalMatched.push(m);
      totalSkus += m.articleGroupCount || 1;
    }
  }

  const subBrandCounts = sortSubBrandStats(Array.from(mukuSubBrandTotals.values()), (x) => x.name);

  const total = finalMatched.length;

  // Mode 1: Toko Multibrand Mu+Ku (tanpa merk spesifik): paginasi STRICT PER BRAND (8 brand/halaman, anti-dobel lintas page!)
  if (brandGroup === "MUKU" && !subBrandUpper && groupSections && finalMatched.length > 0) {
    const brandPages = paginateBrandSections(finalMatched, page, 8, 5);
    return {
      data: brandPages.sections.flatMap((s) => s.items),
      total,
      totalSkus,
      page: brandPages.page,
      totalPages: brandPages.totalPages,
      brandCounts,
      categoryCounts,
      subBrandCounts,
      brandShowcaseSections: brandPages.sections,
      sectionMode: "BRAND_PAGES",
    };
  }

  // Mode 2: Monostore SUKO / ZES atau merk spesifik Mu+Ku pada tab Semua Kategori:
  // Paginasi STRICT PER KATEGORI (5 kategori/halaman, tiap kategori hanya muncul 1x — tidak pernah dobel di Hal 1, 2, dst!)
  if (
    (brandGroup === "SUKO" || brandGroup === "ZES" || (brandGroup === "MUKU" && Boolean(subBrandUpper))) &&
    category === "ALL" &&
    !trimmed &&
    groupSections &&
    finalMatched.length > 0
  ) {
    const catPages = paginateCategorySections(finalMatched, page, 5, 5);
    return {
      data: catPages.sections.flatMap((s) => s.items),
      total,
      totalSkus,
      page: catPages.page,
      totalPages: catPages.totalPages,
      brandCounts,
      categoryCounts,
      subBrandCounts,
      categoryShowcaseSections: catPages.sections,
      sectionMode: "CATEGORY_PAGES",
    };
  }

  // Mode 3: Daftar Artikel Berurutan (per kategori terpilih, hasil pencarian teks, atau mode Semua Artikel)
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
    subBrandCounts,
    sectionMode: "LIST",
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
  subBrandCounts?: LocalSubBrandCount[];
} | null> {
  try {
    const res = await queryLocalModelsInstant({ query: "", brandGroup: "ALL", category: "ALL", page: 1, limit: 1 });
    if (!res) return null;
    return {
      brandCounts: res.brandCounts,
      categoryCounts: res.categoryCounts,
      subBrandCounts: res.subBrandCounts,
    };
  } catch {
    return null;
  }
}
