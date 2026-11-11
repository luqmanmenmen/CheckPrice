import Dexie from "dexie";
import { expandRetailQuery, computeProductRelevanceScore, groupProductsByArticle } from "./smartSearchEngine";

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

const STORE_SCHEMA = 'sku, barcode, article, name, description, brand, dept, color, size, hargaNormal, hargaPromo, diskon, discountType, acara, stok, toDate, imageUrl';

class SukoDatabase extends Dexie {
  products!: Dexie.Table<CachedProduct, string>;

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

    this.on('versionchange', () => {
      this.close();
      return false;
    });
  }
}

export const db = new SukoDatabase();

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
export async function searchOfflineSmart(rawInput: string, limit: number = 25): Promise<CachedProduct[]> {
  try {
    await ensureDbOpenSafe();
    const trimmed = rawInput.trim();
    if (!trimmed) return [];

    // 1. Cek exact Article di index Dexie dulu (0ms)
    const exactArt = await db.products.where("article").equalsIgnoreCase(trimmed).toArray();
    if (exactArt.length > 0) {
      return exactArt.sort((a, b) => (b.stok || 0) - (a.stok || 0));
    }

    // 2. Scan pintar dengan ekspansi sinonim & 30% partial text
    const expanded = expandRetailQuery(trimmed);
    const isDummy = trimmed.toLowerCase().includes("dummy");
    const scored: { item: CachedProduct; score: number }[] = [];

    await db.products.each((p) => {
      // Quick pre-filter: minimal 1 istilah ekspansi atau potongan 3 huruf cocok
      const hay = `${p.brand || ""} ${p.dept || ""} ${p.article || ""} ${p.description || p.name || ""} ${p.color || ""} ${p.sku} ${p.barcode || ""}`.toUpperCase();
      let quickHit = false;
      for (const term of expanded.allExpandedTerms) {
        if (term.length >= 2 && hay.includes(term)) {
          quickHit = true;
          break;
        }
      }
      if (!quickHit && expanded.spaceless.length >= 3) {
        const sub3 = expanded.spaceless.slice(0, 3);
        if (hay.includes(sub3)) quickHit = true;
      }
      if (!quickHit) return;

      const s = computeProductRelevanceScore(p, expanded, isDummy);
      if (s >= 35) {
        scored.push({ item: p, score: s });
      }
    });

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (b.item.stok || 0) - (a.item.stok || 0);
    });

    const grouped = groupProductsByArticle(scored.map((x) => x.item));
    return grouped.slice(0, limit);
  } catch (e) {
    console.warn("[OfflineDB] Gagal mencari offline smart:", e);
    return [];
  }
}
