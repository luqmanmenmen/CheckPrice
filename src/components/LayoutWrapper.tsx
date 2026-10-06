"use client";

import { useEffect, useState } from "react";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Package, UploadCloud } from "lucide-react";
import useSWR from "swr";
import Sidebar from "./Sidebar";
import ShiftLoader from "./ShiftLoader";

const fetcher = (url: string) => fetch(url, { credentials: "same-origin" }).then(res => res.json());

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuth = pathname?.startsWith("/login");
  const { data, isLoading } = useSWR(isAuth ? null : "/api/auth/me", fetcher);
  
  const isSuperAdmin = data?.user?.role === "SUPERVISOR";

  // NOTE: Auto-logout dihapus. SWR cache lama ({ user: null }) bisa memicu
  // POST /api/auth/logout tepat setelah login baru dan menghapus session yang valid.
  // Proteksi route ditangani oleh middleware + cek auth di masing-masing page.

  // Entry transition effect
  const [entryFade, setEntryFade] = useState(true);
  const [prevPath, setPrevPath] = useState(pathname);

  // Derive state from pathname change to instantly catch the transition without flashing
  if (pathname !== prevPath) {
    setPrevPath(pathname);
    if (prevPath?.startsWith("/login") && !pathname?.startsWith("/login")) {
      setEntryFade(true);
    }
  }

  useEffect(() => {
    // Memulai fade out HANYA saat komponen portal mount DAN data user sudah selesai diload
    if (!isAuth && !isLoading && entryFade) {
      const timer = setTimeout(() => setEntryFade(false), 300); // Beri waktu 300ms ekstra agar render DOM sempurna
      return () => clearTimeout(timer);
    } else if (isAuth) {
      setEntryFade(false); // Kalau di halaman login, tidak perlu entry fade dari layout ini
    }
  }, [isAuth, isLoading, entryFade]);

  // Update Checker for Offline DB
  const [isSyncing, setIsSyncing] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [syncProgress, setSyncProgress] = useState<number | undefined>(undefined);
  
  useEffect(() => {
    if (!isAuth && data?.user) {
      import("@/lib/offlineDb").then(({ checkIfUpdateAvailable }) => {
        checkIfUpdateAvailable().then((isAvailable) => {
          if (isAvailable) setShowUpdateModal(true);
        });
      });
    }
  }, [isAuth, data]);

  const handleStartUpdate = async () => {
    setShowUpdateModal(false);
    setIsSyncing(true);
    setSyncProgress(0);
    try {
      const { syncOfflineDatabase } = await import("@/lib/offlineDb");
      await syncOfflineDatabase((syncing, prog) => {
        setIsSyncing(syncing);
        if (prog !== undefined) setSyncProgress(prog);
      }, true);
    } catch (e) {
      console.error(e);
      setIsSyncing(false);
    } finally {
      setSyncProgress(undefined);
    }
  };

  if (isAuth) {
    return (
      <main className="w-full min-h-screen">
        {children}
      </main>
    );
  }

  return (
    <>
      {/* Seamless Transition Overlay */}
      <div 
        className={`fixed inset-0 z-[999] bg-white transition-opacity duration-1000 ease-in-out pointer-events-none ${entryFade ? 'opacity-100' : 'opacity-0'}`} 
      />
      
      <header className="bg-white shadow-sm border-b sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Sidebar user={data?.user} />
          </div>
          <div className="flex items-center gap-4">
            {/* Nav items can be placed here if needed */}
            <Link 
              href={data?.user?.role === 'SUPERVISOR' ? '/spv-gateway' : data?.user?.jobTitle === 'Gudang Stock' ? '/warehouse' : '/'} 
              className="flex items-center"
            >
              <img src="/suko-logo.png" alt="SUKO" className="h-10 md:h-12 object-contain drop-shadow-sm" />
            </Link>
          </div>
        </div>
      </header>

      {/* Update Available Modal */}
      {showUpdateModal && (
        <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full animate-in zoom-in-95 duration-300">
            <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner">
              <UploadCloud className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2 text-center">Pembaruan Data Tersedia!</h2>
            <p className="text-sm text-slate-500 mb-6 leading-relaxed text-center font-medium">
              Terdapat data harga atau promosi terbaru dari server. Apakah Anda ingin mengunduhnya sekarang agar aplikasi berjalan optimal?
            </p>
            
            <div className="flex flex-col gap-3">
              <button
                onClick={handleStartUpdate}
                className="w-full h-12 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-blue-500/30 transition-all"
              >
                Ya, Unduh Sekarang
              </button>
              <button
                onClick={() => setShowUpdateModal(false)}
                className="w-full h-12 bg-slate-50 hover:bg-slate-100 text-slate-500 font-bold rounded-xl transition-all"
              >
                Nanti Saja
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Full Screen Download Overlay if Syncing */}
      {isSyncing && (
        <div className="fixed inset-0 z-[200] bg-white flex flex-col items-center justify-center transition-all duration-700 ease-out opacity-100 visible">
          <ShiftLoader progress={syncProgress} />
          <p className="text-slate-800 font-bold mt-16 text-sm tracking-[0.3em] animate-pulse">LOADING...</p>
        </div>
      )}

      <main className="flex-1 max-w-7xl mx-auto w-full p-0 lg:p-8 bg-white shadow-sm min-h-[calc(100vh-64px-60px)] flex flex-col">
        {children}
      </main>
      <footer className="w-full py-4 text-center text-xs font-medium text-slate-400 bg-white border-t mt-auto">
        Powered by Luqmen 😼🕶️
      </footer>
    </>
  );
}
