"use client";

import { useEffect, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { UploadCloud, Sparkles, RefreshCw, X } from "lucide-react";
import useSWR from "swr";
import Sidebar from "./Sidebar";
import ShiftLoader from "./ShiftLoader";
import { checkAppVersion, forceAppUpdate, APP_VERSION } from "@/lib/version";

const fetcher = (url: string) => fetch(url, { credentials: "same-origin" }).then(res => res.json());

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuth = pathname?.startsWith("/login");
  const isCekHarga = pathname?.startsWith("/cek-harga");
  const { data, isLoading } = useSWR(isAuth || isCekHarga ? null : "/api/auth/me", fetcher);

  // Simpan info user ke localStorage agar siap seketika saat offline / refresh
  useEffect(() => {
    if (data?.user && typeof window !== "undefined") {
      localStorage.setItem("suko_user", JSON.stringify(data.user));
    }
  }, [data]);

  // Entry transition effect cepat dan halus (tidak membuat user merasa loading lama)
  const [entryFade, setEntryFade] = useState(true);
  const [prevPath, setPrevPath] = useState(pathname);

  if (pathname !== prevPath) {
    setPrevPath(pathname);
    if (prevPath?.startsWith("/login") && !pathname?.startsWith("/login")) {
      setEntryFade(true);
    }
  }

  useEffect(() => {
    if (!isAuth && !isLoading && entryFade) {
      const timer = setTimeout(() => setEntryFade(false), 150);
      return () => clearTimeout(timer);
    } else if (isAuth) {
      setEntryFade(false);
    }
  }, [isAuth, isLoading, entryFade]);

  // 1. Deteksi Pembaruan Versi Aplikasi (Frontend Code / Web App Version)
  const [appUpdateInfo, setAppUpdateInfo] = useState<{ hasUpdate: boolean; serverVersion: string } | null>(null);

  const verifyAppVersion = useCallback(async () => {
    try {
      const res = await checkAppVersion();
      if (res.hasUpdate) {
        setAppUpdateInfo({ hasUpdate: true, serverVersion: res.serverVersion });
      }
    } catch (e) {
      // ignore check error
    }
  }, []);

  useEffect(() => {
    // Cek saat mount
    verifyAppVersion();

    // Cek berkala tiap 3 menit
    const interval = setInterval(verifyAppVersion, 180000);

    // Cek saat user kembali membuka tab browser di HP
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        verifyAppVersion();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [verifyAppVersion]);

  // 2. Deteksi Pembaruan Data Offline (Database Server Timestamp)
  const [isSyncing, setIsSyncing] = useState(false);
  const [showDbUpdateModal, setShowDbUpdateModal] = useState(false);
  const [syncProgress, setSyncProgress] = useState<number | undefined>(undefined);
  const [syncStatusMsg, setSyncStatusMsg] = useState<string>("Mengunduh data harga & promo terbaru...");
  
  useEffect(() => {
    if (!isAuth && !isCekHarga && data?.user) {
      import("@/lib/offlineDb").then(({ checkIfUpdateAvailable }) => {
        checkIfUpdateAvailable().then((isAvailable) => {
          if (isAvailable) setShowDbUpdateModal(true);
        });
      });
    }
  }, [isAuth, isCekHarga, data]);

  const handleStartDbUpdate = async () => {
    setShowDbUpdateModal(false);
    setIsSyncing(true);
    setSyncProgress(10);
    setSyncStatusMsg("Mengunduh data harga & promo terbaru...");
    try {
      const { syncOfflineDatabase } = await import("@/lib/offlineDb");
      await syncOfflineDatabase((syncing, prog, msg) => {
        setIsSyncing(syncing);
        if (prog !== undefined) setSyncProgress(prog);
        if (msg) setSyncStatusMsg(msg);
      }, true);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleApplyAppUpdate = async () => {
    await forceAppUpdate({ clearOfflineData: false });
  };

  if (isAuth || isCekHarga) {
    return (
      <main className="w-full min-h-[100dvh]">
        {children}
      </main>
    );
  }

  return (
    <>
      {/* Quick Entry Fade */}
      <div 
        className={`fixed inset-0 z-[999] bg-white transition-opacity duration-300 ease-in-out pointer-events-none ${entryFade ? 'opacity-100' : 'opacity-0'}`} 
      />
      
      {/* Header Sticky dengan dukungan Notch iOS (pt-safe) */}
      <header className="bg-white/95 backdrop-blur-md shadow-xs border-b border-slate-100 sticky top-0 z-50 pt-safe transition-all">
        <div className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sidebar user={data?.user} />
          </div>

          <div className="flex items-center gap-3">
            <Link 
              href={data?.user?.role === 'SUPERVISOR' ? '/spv-gateway' : data?.user?.jobTitle === 'Gudang Stock' ? '/warehouse' : '/'} 
              className="flex items-center active:scale-95 transition-transform"
            >
              <img src="/suko-logo.png" alt="SUKO" className="h-8 sm:h-10 md:h-11 object-contain drop-shadow-xs" />
            </Link>
          </div>
        </div>
      </header>

      {/* Floating Banner Notifikasi Versi Baru Aplikasi (Bila Code Baru Dirilis) */}
      {appUpdateInfo?.hasUpdate && (
        <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:w-96 z-[150] bg-gradient-to-r from-blue-600 to-indigo-700 text-white p-3.5 rounded-2xl shadow-2xl border border-white/20 animate-in slide-in-from-bottom-5 duration-300 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 text-amber-300 animate-spin" />
            </div>
            <div className="truncate">
              <p className="text-xs font-black tracking-wide leading-tight">Pembaruan Versi {appUpdateInfo.serverVersion}</p>
              <p className="text-[10px] text-blue-100 font-medium leading-tight">Tersedia perbaikan UI & fitur baru.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleApplyAppUpdate}
              className="px-3 py-1.5 bg-white text-blue-700 font-black text-xs rounded-lg shadow-sm hover:bg-blue-50 active:scale-95 transition-all"
            >
              Perbarui
            </button>
            <button
              onClick={() => setAppUpdateInfo(null)}
              className="p-1 text-white/70 hover:text-white"
              aria-label="Tutup"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Modal Pembaruan Data Offline Tersedia */}
      {showDbUpdateModal && (
        <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full animate-in zoom-in-95 duration-300">
            <div className="w-14 h-14 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner">
              <UploadCloud className="w-7 h-7" />
            </div>
            <h2 className="text-lg font-bold text-slate-800 mb-1.5 text-center">Pembaruan Data Tersedia!</h2>
            <p className="text-xs text-slate-500 mb-5 leading-relaxed text-center font-medium">
              Terdapat data harga dan promo terbaru dari server. Unduh sekarang agar database offline selalu akurat saat tidak ada sinyal.
            </p>
            
            <div className="flex flex-col gap-2.5">
              <button
                onClick={handleStartDbUpdate}
                className="w-full h-11 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold rounded-xl shadow-md shadow-blue-500/20 text-sm active:scale-98 transition-all"
              >
                Ya, Unduh Sekarang
              </button>
              <button
                onClick={() => setShowDbUpdateModal(false)}
                className="w-full h-11 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl text-sm transition-all"
              >
                Nanti Saja
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Full Screen Download Overlay if Syncing */}
      {isSyncing && (
        <div className="fixed inset-0 z-[200] bg-slate-950/75 backdrop-blur-md flex flex-col items-center justify-center p-4 transition-all duration-300">
          <div className="bg-white/95 backdrop-blur-xl border border-white/50 rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col items-center max-w-xs w-full text-center">
            <ShiftLoader progress={syncProgress} />
            <div className="mt-6 flex flex-col items-center gap-1.5 w-full">
              <div className="flex items-center justify-between w-full px-1">
                <span className="text-xs font-black tracking-wider text-slate-800">
                  MENYINKRONKAN DATA
                </span>
                <span className="text-xs font-bold font-mono text-blue-600">
                  {syncProgress ?? 0}%
                </span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mt-1 border border-slate-200/50">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full transition-all duration-300"
                  style={{ width: `${Math.max(5, syncProgress ?? 0)}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-500 font-medium leading-relaxed mt-2 truncate w-full">
                {syncStatusMsg}
              </p>
              <button
                type="button"
                onClick={() => setIsSyncing(false)}
                className="mt-3 text-[11px] font-semibold text-slate-400 hover:text-slate-600 transition-colors py-1 px-3 rounded-lg hover:bg-slate-100"
              >
                Lanjutkan di Latar Belakang
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-0 lg:p-8 bg-white shadow-xs min-h-[calc(100dvh-56px-50px)] flex flex-col">
        {children}
      </main>

      {/* Footer dengan Nomor Versi */}
      <footer className="w-full py-3.5 text-center text-[11px] font-medium text-slate-400 bg-white border-t border-slate-100 mt-auto pb-[max(0.875rem,env(safe-area-inset-bottom))] flex items-center justify-center gap-2">
        <span>Max Display Pro v{APP_VERSION}</span>
        <span>•</span>
        <button 
          onClick={() => forceAppUpdate()} 
          className="hover:text-blue-600 underline active:text-blue-700"
          title="Klik jika tampilan terasa lambat atau tidak terupdate"
        >
          Bersihkan Cache
        </button>
      </footer>
    </>
  );
}
