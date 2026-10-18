import Dexie from "dexie";

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

    // Otomatis tutup koneksi jika tab lain melakukan upgrade agar tidak hang/deadlock
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
      if (localDbSchema !== "v10" || localVersion !== serverVersion || count < 1000) {
        return true;
      }
    }
    return false;
  } catch (e) {
    return false;
  }
}

export async function syncOfflineDatabase(
  onSyncStateChange?: (isSyncing: boolean, progress?: number) => void,
  forceSync: boolean = false
): Promise<boolean> {
  let progressInterval: NodeJS.Timeout | null = null;
  try {
    await ensureDbOpenSafe();
    const count = await db.products.count().catch(() => 0);
    const localVersion = localStorage.getItem("suko_server_version");
    const localDbSchema = localStorage.getItem("suko_db_schema_version");

    const checkRes = await fetch(`/api/check-update?t=${Date.now()}`, { cache: "no-store" });
    const checkData = await checkRes.json();

    if (checkData.success) {
      const serverVersion = checkData.lastUpdate.toString();

      if (forceSync || localDbSchema !== "v10" || localVersion !== serverVersion || count < 1000) {
        if (onSyncStateChange) onSyncStateChange(true, 10);

        let progress = 10;
        progressInterval = setInterval(() => {
          progress += (90 - progress) * 0.15;
          if (onSyncStateChange) onSyncStateChange(true, Math.round(progress));
        }, 120);

        const res = await fetch(`/api/export-products?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status} gagal unduh produk`);
        const result = await res.json();

        if (progressInterval) {
          clearInterval(progressInterval);
          progressInterval = null;
        }

        if (result.success && Array.isArray(result.data) && result.data.length > 0) {
          if (onSyncStateChange) onSyncStateChange(true, 92);
          
          await ensureDbOpenSafe();
          await db.products.clear().catch(() => {});
          
          // Simpan dalam chunk 2000 item agar browser HP tidak kehabisan memori atau freeze
          const total = result.data.length;
          const CHUNK = 2000;
          for (let i = 0; i < total; i += CHUNK) {
            const chunk = result.data.slice(i, i + CHUNK);
            await db.products.bulkPut(chunk);
            if (onSyncStateChange) {
              const p = 92 + Math.round(((i + chunk.length) / total) * 7);
              onSyncStateChange(true, Math.min(99, p));
            }
          }

          if (onSyncStateChange) onSyncStateChange(true, 100);
          localStorage.setItem("suko_server_version", serverVersion);
          localStorage.setItem("suko_db_schema_version", "v10");
          console.log(`[OfflineDB] Berhasil sync ${result.data.length} produk v10 (versi: ${serverVersion})`);
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
    if (progressInterval) clearInterval(progressInterval);
    if (onSyncStateChange) onSyncStateChange(false);
  }
}
