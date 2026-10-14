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
}

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
  }
}

export const db = new SukoDatabase();

export async function checkIfUpdateAvailable(): Promise<boolean> {
  try {
    const count = await db.products.count();
    const localVersion = localStorage.getItem("suko_server_version");
    const localDbSchema = localStorage.getItem("suko_db_schema_version");

    const checkRes = await fetch(`/api/check-update?t=${Date.now()}`, { cache: "no-store" });
    const checkData = await checkRes.json();

    if (checkData.success) {
      const serverVersion = checkData.lastUpdate.toString();
      if (localDbSchema !== "v6" || localVersion !== serverVersion || count < 1000) {
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
    const count = await db.products.count();
    const localVersion = localStorage.getItem("suko_server_version");
    const localDbSchema = localStorage.getItem("suko_db_schema_version");

    const checkRes = await fetch(`/api/check-update?t=${Date.now()}`, { cache: "no-store" });
    const checkData = await checkRes.json();

    if (checkData.success) {
      const serverVersion = checkData.lastUpdate.toString();

      if (forceSync || localDbSchema !== "v6" || localVersion !== serverVersion || count < 1000) {
        if (onSyncStateChange) onSyncStateChange(true, 10);

        let progress = 10;
        progressInterval = setInterval(() => {
          progress += (90 - progress) * 0.2;
          if (onSyncStateChange) onSyncStateChange(true, Math.round(progress));
        }, 120);

        const res = await fetch(`/api/export-products?t=${Date.now()}`, { cache: "no-store" });
        const result = await res.json();

        if (progressInterval) clearInterval(progressInterval);

        if (result.success && Array.isArray(result.data)) {
          if (onSyncStateChange) onSyncStateChange(true, 92);
          await db.products.clear();
          await db.products.bulkPut(result.data);

          if (onSyncStateChange) onSyncStateChange(true, 100);
          localStorage.setItem("suko_server_version", serverVersion);
          localStorage.setItem("suko_db_schema_version", "v6");
          console.log(`[OfflineDB] Berhasil sync ${result.data.length} produk v6 (versi: ${serverVersion})`);
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
