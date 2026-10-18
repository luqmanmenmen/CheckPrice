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
    this.version(9).stores({
      products: 'sku, barcode, article',
    });

    // Cegah deadlock upgrade IndexedDB jika tab lain masih membuka koneksi versi lama
    this.on("versionchange", () => {
      console.warn("[OfflineDB] Versi database diupdate. Menutup koneksi lama agar upgrade berjalan...");
      this.close();
      return false;
    });

    this.on("blocked", () => {
      console.warn("[OfflineDB] Upgrade database terhalang oleh koneksi lain.");
    });
  }
}

export const db = new SukoDatabase();

// Safety wrapper untuk memastikan db tidak hang saat dibuka di HP
async function ensureDbOpenSafe(): Promise<boolean> {
  try {
    if (!db.isOpen()) {
      await Promise.race([
        db.open(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout buka IndexedDB")), 3000)),
      ]);
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

// Safety wrapper untuk hitung produk tanpa resiko hang
async function safeDbCount(): Promise<number> {
  try {
    return await Promise.race([
      db.products.count(),
      new Promise<number>((_, reject) => setTimeout(() => reject(new Error("Timeout count DB")), 2500)),
    ]);
  } catch {
    return 0;
  }
}

export async function checkIfUpdateAvailable(): Promise<boolean> {
  try {
    const count = await safeDbCount();
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

// Pub/Sub Sync Manager agar semua komponen (Modal, Sidebar, dsb) mendapat progress serentak tanpa race condition
type SyncListener = (isSyncing: boolean, progress?: number, message?: string) => void;
const syncListeners = new Set<SyncListener>();
let activeSyncPromise: Promise<boolean> | null = null;
let currentProgress = 0;
let currentStatusMessage = "Menyiapkan sinkronisasi data...";

function broadcastSync(isSyncing: boolean, progress?: number, message?: string) {
  if (progress !== undefined) currentProgress = progress;
  if (message !== undefined) currentStatusMessage = message;
  syncListeners.forEach((listener) => {
    try {
      listener(isSyncing, currentProgress, currentStatusMessage);
    } catch (err) {
      console.error("[OfflineDB] Listener callback error:", err);
    }
  });
}

export async function syncOfflineDatabase(
  onSyncStateChange?: SyncListener,
  forceSync: boolean = false
): Promise<boolean> {
  // 1. Daftarkan listener jika disediakan
  if (onSyncStateChange) {
    syncListeners.add(onSyncStateChange);
  }

  // 2. Jika proses sync sedang berjalan di background, gabungkan caller ke proses yang ada
  if (activeSyncPromise) {
    console.log("[OfflineDB] Menggabungkan listener ke sinkronisasi yang sedang berjalan.");
    if (onSyncStateChange) {
      onSyncStateChange(true, currentProgress, currentStatusMessage);
    }
    return activeSyncPromise;
  }

  // 3. Mulai proses sync baru
  activeSyncPromise = (async () => {
    try {
      broadcastSync(true, 10, "Mengunduh katalog produk terbaru...");

      // Unduh data katalog produk terbaru dari server langsung
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

      broadcastSync(true, 30, "Mengekstrak data produk...");
      const result = await res.json();
      if (!result.success || !Array.isArray(result.data) || result.data.length === 0) {
        throw new Error("Data produk dari server kosong atau tidak valid");
      }

      const products: CachedProduct[] = result.data;
      const total = products.length;
      const serverVersion = result.version ? String(result.version) : Date.now().toString();

      broadcastSync(true, 40, `Menyiapkan ${total.toLocaleString("id-ID")} produk...`);

      // Buka dan bersihkan database lama dengan proteksi timeout & auto-repair
      await ensureDbOpenSafe();
      await db.products.clear().catch(() => {});

      // Simpan dalam batch 500 item agar browser HP tetap 60 FPS dan tidak kehabisan memori
      const CHUNK_SIZE = 500;
      for (let i = 0; i < total; i += CHUNK_SIZE) {
        const chunk = products.slice(i, i + CHUNK_SIZE);
        await db.products.bulkPut(chunk);

        const processed = Math.min(i + CHUNK_SIZE, total);
        const currentPercent = 40 + Math.round((processed / total) * 58); // range 40% - 98%
        broadcastSync(
          true,
          currentPercent,
          `Menyimpan data (${processed.toLocaleString("id-ID")} / ${total.toLocaleString("id-ID")})...`
        );
        // Jeda 8ms ke event loop agar animasi UI tetap halus di HP
        await new Promise((r) => setTimeout(r, 8));
      }

      localStorage.setItem("suko_server_version", serverVersion);
      localStorage.setItem("suko_db_schema_version", "v9");

      broadcastSync(true, 100, "Sinkronisasi berhasil!");
      await new Promise((r) => setTimeout(r, 400));

      console.log(`[OfflineDB] Berhasil sync ${total} produk v9 (versi: ${serverVersion})`);
      return true;
    } catch (e: any) {
      console.error("[OfflineDB] Gagal sinkronisasi data offline:", e);
      broadcastSync(false, undefined, e?.message || "Gagal sinkronisasi data");
      return false;
    } finally {
      activeSyncPromise = null;
      broadcastSync(false, 100, "Selesai");
      syncListeners.clear();
    }
  })();

  return activeSyncPromise;
}
