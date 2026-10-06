import Dexie from "dexie";

class SukoDatabase extends Dexie {
  products!: Dexie.Table<{
    sku: string;
    name: string;
    color: string;
    size: string;
    hargaNormal: number;
    hargaPromo: number | null;
    diskon: string | null;
    stok: number;
    toDate: string | null;
  }, string>;

  constructor() {
    super("SukoScannerDB");
    this.version(3).stores({
      products: 'sku, name, color, size, hargaNormal, hargaPromo, diskon, stok, toDate' 
    });
  }
}

export const db = new SukoDatabase();

export async function checkIfUpdateAvailable() {
  try {
    const count = await db.products.count();
    const localVersion = localStorage.getItem("suko_server_version");
    
    const checkRes = await fetch('/api/check-update');
    const checkData = await checkRes.json();
    
    if (checkData.success) {
      const serverVersion = checkData.lastUpdate.toString();
      if (localVersion !== serverVersion || count < 100) {
        return true;
      }
    }
    return false;
  } catch (e) {
    return false;
  }
}


export async function syncOfflineDatabase(onSyncStateChange?: (isSyncing: boolean, progress?: number) => void, forceSync: boolean = false) {
  try {
    const count = await db.products.count();
    const localVersion = localStorage.getItem("suko_server_version");
    
    const checkRes = await fetch('/api/check-update');
    const checkData = await checkRes.json();
    
    if (checkData.success) {
      const serverVersion = checkData.lastUpdate.toString();
      
      if (forceSync || localVersion !== serverVersion || count < 1000) {
        if (onSyncStateChange) onSyncStateChange(true, 0);
        
        let progress = 0;
        const progressInterval = setInterval(() => {
          progress += (90 - progress) * 0.15; // Zeno's paradox, smooth approach to 90%
          if (onSyncStateChange) onSyncStateChange(true, Math.round(progress));
        }, 150);

        const res = await fetch('/api/export-products');
        const result = await res.json();
        
        clearInterval(progressInterval);
        
        if (result.success && result.data) {
          if (onSyncStateChange) onSyncStateChange(true, 95); // Sedang insert ke DB lokal
          await db.products.clear();
          await db.products.bulkPut(result.data);
          
          if (onSyncStateChange) onSyncStateChange(true, 100); // Selesai
          localStorage.setItem("suko_server_version", serverVersion);
          console.log("Offline Database Updated to version:", serverVersion);
        }
      }
    }
  } catch (e) {
    console.error("Failed to sync offline DB", e);
  } finally {
    if (onSyncStateChange) onSyncStateChange(false);
  }
}
