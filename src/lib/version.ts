export const APP_VERSION = "2.5.1";
export const APP_BUILD_ID = "20261018-v2.5.1-fast-barcode-and-fast-db";

export interface VersionInfo {
  version: string;
  buildId: string;
  releaseDate: string;
  notes?: string;
}

export async function checkAppVersion(): Promise<{
  hasUpdate: boolean;
  serverVersion: string;
  currentVersion: string;
  buildDate?: string;
}> {
  try {
    const res = await fetch(`/api/app-version?t=${Date.now()}`, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });
    
    if (!res.ok) {
      return {
        hasUpdate: false,
        serverVersion: APP_VERSION,
        currentVersion: APP_VERSION
      };
    }

    const data: VersionInfo = await res.json();
    const storedVersion = typeof window !== 'undefined' ? localStorage.getItem('suko_client_version') : null;
    const current = storedVersion || APP_VERSION;
    
    // Simpan current version jika belum ada
    if (typeof window !== 'undefined' && !storedVersion) {
      localStorage.setItem('suko_client_version', APP_VERSION);
    }

    const hasUpdate = Boolean(data.version && data.version !== current);

    return {
      hasUpdate,
      serverVersion: data.version,
      currentVersion: current,
      buildDate: data.releaseDate
    };
  } catch (err) {
    console.error("Gagal memeriksa versi aplikasi:", err);
    return {
      hasUpdate: false,
      serverVersion: APP_VERSION,
      currentVersion: APP_VERSION
    };
  }
}

/**
 * Membersihkan cache browser, service worker, dan memaksa reload halaman
 * Berguna untuk mengatasi Safari/iOS PWA yang terjebak di bundle lama
 */
export async function forceAppUpdate(options?: { clearOfflineData?: boolean }) {
  if (typeof window === 'undefined') return;

  try {
    // 1. Unregister semua Service Worker jika ada
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        await registration.unregister();
      }
    }

    // 2. Bersihkan Cache Storage
    if ('caches' in window) {
      const cacheKeys = await caches.keys();
      for (const key of cacheKeys) {
        await caches.delete(key);
      }
    }

    // 3. Update flag versi di localStorage
    localStorage.setItem('suko_client_version', APP_VERSION);
    localStorage.setItem('suko_last_force_reload', Date.now().toString());

    // 4. Jika diminta bersihkan offline database juga
    if (options?.clearOfflineData) {
      localStorage.removeItem('suko_server_version');
      localStorage.removeItem('suko_db_schema_version');
      try {
        const Dexie = (await import('dexie')).default;
        await Dexie.delete('SukoScannerDB');
      } catch (e) {
        console.error("Gagal mengosongkan offline db:", e);
      }
    }

    // 5. Force reload dengan cache buster parameter
    const cleanUrl = window.location.origin + window.location.pathname + '?reload=' + Date.now();
    window.location.replace(cleanUrl);
  } catch (e) {
    console.error("Gagal melakukan force update:", e);
    // Fallback reload biasa
    window.location.reload();
  }
}
