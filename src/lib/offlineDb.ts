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

export async function syncOfflineDatabase(onSyncStateChange?: (isSyncing: boolean) => void) {
  try {
    const count = await db.products.count();
    const localVersion = localStorage.getItem("suko_server_version");
    
    const checkRes = await fetch('/api/check-update');
    const checkData = await checkRes.json();
    
    if (checkData.success) {
      const serverVersion = checkData.lastUpdate.toString();
      
      if (localVersion !== serverVersion || count < 1000) {
        if (count < 1000 && onSyncStateChange) onSyncStateChange(true);
        
        const res = await fetch('/api/export-products');
        const result = await res.json();
        
        if (result.success && result.data) {
          await db.products.clear();
          await db.products.bulkPut(result.data);
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
