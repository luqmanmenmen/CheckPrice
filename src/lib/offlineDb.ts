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
      products: 'sku, barcode, article, name, description, brand, dept, color, size, hargaNormal, hargaPromo, diskon, discountType, acara, stok, toDate, imageUrl',
    });
    this.version(8).stores({
      products: 'sku, barcode, article, name, description, brand, dept, color, size, hargaNormal, hargaPromo, diskon, discountType, acara, stok, toDate, imageUrl',
    });
    // Versi 9: Optimasi Performa Ekstrem — Hanya indeks kolom yang benar-benar di-query (sku PK, barcode, article)
    // 14 kolom lainnya tetap tersimpan utuh di objek data tanpa membebani IndexedDB dengan 160.000+ index writes!
    this.version(9).stores({
      products: 'sku, barcode, article',
    });
  }
}

export const db = new SukoDatabase();

export async function checkIfUpdateAvailable(): Promise<boolean> {
  try {
    const count = await db.products.count().catch(() => 0);
    const localVersion = localStorage.getItem("suko_server_version");
    const localDbSchema = localStorage.getItem("suko_db_schema_version");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const checkRes = await fetch(`/api/check-update?t=${Date.now()}`, {
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!checkRes.ok) return false;

    const checkData = await checkRes.json();

    if (checkData.success) {
      const serverVersion = checkData.lastUpdate.toString();
      if (localDbSchema !== "v9" || localVersion !== serverVersion || count < 1000) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

let isSyncInProgress = false;

export async function syncOfflineDatabase(
  onSyncStateChange?: (isSyncing: boolean, progress?: number, message?: string) => void,
  forceSync: boolean = false
): Promise<boolean> {
  if (isSyncInProgress) {
    console.warn("[OfflineDB] Sinkronisasi sudah sedang berjalan, mengabaikan pemicu duplikat.");
    return true;
  }

  isSyncInProgress = true;
  try {
    if (onSyncStateChange) onSyncStateChange(true, 5, "Memeriksa versi database...");

    const count = await db.products.count().catch(() => 0);
    const localVersion = localStorage.getItem("suko_server_version");
    const localDbSchema = localStorage.getItem("suko_db_schema_version");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const checkRes = await fetch(`/api/check-update?t=${Date.now()}`, {
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timeout);

    let serverVersion = Date.now().toString();
    if (checkRes.ok) {
      const checkData = await checkRes.json();
      if (checkData.success && checkData.lastUpdate) {
        serverVersion = checkData.lastUpdate.toString();
      }
    }

    const needsSync = forceSync || localDbSchema !== "v9" || localVersion !== serverVersion || count < 1000;

    if (!needsSync) {
      if (onSyncStateChange) onSyncStateChange(true, 100, "Database sudah versi terbaru!");
      await new Promise((r) => setTimeout(r, 400));
      return true;
    }

    if (onSyncStateChange) onSyncStateChange(true, 20, "Mengunduh katalog produk terbaru...");

    const exportController = new AbortController();
    const exportTimeout = setTimeout(() => exportController.abort(), 60000); // 60s
    const res = await fetch(`/api/export-products?t=${Date.now()}`, {
      cache: "no-store",
      signal: exportController.signal,
    });
    clearTimeout(exportTimeout);

    if (!res.ok) {
      throw new Error(`Gagal mengunduh katalog (HTTP ${res.status})`);
    }

    const result = await res.json();
    if (!result.success || !Array.isArray(result.data) || result.data.length === 0) {
      throw new Error("Data produk dari server kosong atau tidak valid");
    }

    const products: CachedProduct[] = result.data;
    const total = products.length;

    if (onSyncStateChange) onSyncStateChange(true, 40, `Menyiapkan ${total.toLocaleString("id-ID")} produk...`);

    // Bersihkan database lama setelah data baru dipastikan berhasil diunduh
    await db.products.clear().catch(() => { });

    // Simpan dalam batch 500 item agar browser HP tidak kehabisan memori atau freeze
    const CHUNK_SIZE = 500;
    for (let i = 0; i < total; i += CHUNK_SIZE) {
      const chunk = products.slice(i, i + CHUNK_SIZE);
      await db.products.bulkPut(chunk);

      const processed = Math.min(i + CHUNK_SIZE, total);
      const currentPercent = 40 + Math.round((processed / total) * 58); // range 40% - 98%
      if (onSyncStateChange) {
        onSyncStateChange(
          true,
          currentPercent,
          `Menyimpan data (${processed.toLocaleString("id-ID")} / ${total.toLocaleString("id-ID")})...`
        );
      }
      // Beri jeda 8ms ke event loop browser agar rendering progress bar dan animasi tetap 60 FPS di HP
      await new Promise((r) => setTimeout(r, 8));
    }

    localStorage.setItem("suko_server_version", serverVersion);
    localStorage.setItem("suko_db_schema_version", "v9");

    if (onSyncStateChange) {
      onSyncStateChange(true, 100, "Sinkronisasi berhasil!");
    }
    await new Promise((r) => setTimeout(r, 600));

    console.log(`[OfflineDB] Berhasil sync ${total} produk v9 (versi: ${serverVersion})`);
    return true;
  } catch (e: any) {
    console.error("Failed to sync offline DB", e);
    if (onSyncStateChange) {
      onSyncStateChange(false, undefined, e?.message || "Gagal sinkronisasi data");
    }
    return false;
  } finally {
    isSyncInProgress = false;
    if (onSyncStateChange) onSyncStateChange(false);
  }
}
