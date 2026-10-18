"use client";

import { useState, useEffect } from "react";
import { 
  X, 
  Package2, 
  ArrowLeft, 
  CloudDownload, 
  Loader2, 
  Menu, 
  LayoutDashboard, 
  ShieldCheck, 
  Gift, 
  Sparkles, 
  RotateCw, 
  Info,
  CheckCircle2,
  RefreshCw,
  UserCircle2,
  ScanBarcode,
  AlertCircle
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import AnimatedLogoutButton from "./AnimatedLogoutButton";
import ShiftLoader from "./ShiftLoader";
import { APP_VERSION, forceAppUpdate } from "@/lib/version";

export default function Sidebar({ user: propUser }: { user?: any }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [syncProgress, setSyncProgress] = useState<number | undefined>(undefined);
  const [syncStatusMsg, setSyncStatusMsg] = useState<string>("Mengunduh data harga, promo & gambar terbaru...");
  const [syncError, setSyncError] = useState<string | null>(null);
  const [showUpToDateModal, setShowUpToDateModal] = useState(false);
  const [cachedUser, setCachedUser] = useState<any>(null);
  const [lastSyncDate, setLastSyncDate] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Ambil user dari cache lokal jika propUser belum selesai dimuat
  useEffect(() => {
    if (typeof window !== "undefined") {
      if (propUser) {
        localStorage.setItem("suko_user", JSON.stringify(propUser));
        setCachedUser(propUser);
      } else {
        const stored = localStorage.getItem("suko_user");
        if (stored) {
          try {
            setCachedUser(JSON.parse(stored));
          } catch (e) {
            // ignore JSON error
          }
        }
      }

      // Ambil timestamp update server yang tersimpan
      const storedVer = localStorage.getItem("suko_server_version");
      if (storedVer) {
        const timeNum = parseInt(storedVer, 10);
        if (!isNaN(timeNum)) {
          setLastSyncDate(new Date(timeNum).toLocaleString("id-ID", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit"
          }));
        }
      }
    }
  }, [propUser]);

  const activeUser = propUser || cachedUser;

  const handleManualSync = async () => {
    setIsSyncing(true);
    setSyncProgress(5);
    setSyncError(null);
    setSyncStatusMsg("Menyiapkan sinkronisasi data...");
    setIsOpen(false);
    try {
      const { syncOfflineDatabase } = await import('@/lib/offlineDb');
      const success = await syncOfflineDatabase((syncing, prog, msg) => {
        setIsSyncing(syncing);
        if (prog !== undefined) setSyncProgress(prog);
        if (msg) setSyncStatusMsg(msg);
      }, true);

      if (!success) {
        setSyncError("Gagal memperbarui database offline. Pastikan koneksi internet stabil.");
      } else {
        // Refresh status tanggal sync
        const storedVer = localStorage.getItem("suko_server_version");
        if (storedVer) {
          const timeNum = parseInt(storedVer, 10);
          if (!isNaN(timeNum)) {
            setLastSyncDate(new Date(timeNum).toLocaleString("id-ID", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit"
            }));
          }
        }
      }
    } catch (e: any) {
      console.error(e);
      setSyncError(e?.message || "Terjadi kesalahan saat sinkronisasi data.");
    }
  };

  const handleForceUpdateApp = async () => {
    if (confirm("Perbarui aplikasi dan bersihkan cache? Aplikasi akan memuat ulang versi terbaru.")) {
      setIsClearingCache(true);
      await forceAppUpdate({ clearOfflineData: false });
    }
  };

  const handleLogout = async () => {
    // 1. Segera tutup drawer sidebar agar tidak tertinggal di layar
    setIsOpen(false);
    
    // 2. Tampilkan full page loader 'MENGAKHIRI SHIFT...'
    setIsLoggingOut(true);
    
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch (error) {
      console.error(error);
    }
    
    if (typeof window !== "undefined") {
      localStorage.removeItem("suko_user");
    }

    // 3. Jeda sejenak agar animasi page loading selesai dengan mulus sebelum pindah ke /login
    setTimeout(() => {
      window.location.href = "/login";
    }, 700);
  };

  return (
    <>
      {/* Hamburger Trigger - Dibuat mudah ditekan di layar kecil (iPhone XR) */}
      <button 
        onClick={() => setIsOpen(true)}
        aria-label="Buka Menu"
        className="min-w-[44px] min-h-[44px] flex items-center justify-center -ml-2 rounded-xl text-slate-700 hover:bg-slate-100 active:bg-slate-200 transition-colors"
      >
        <Menu className="w-6 h-6" />
      </button>

      {/* Portal elements to document.body so they escape sticky header backdrop-blur containing block */}
      {mounted && createPortal(
        <>
          {/* Overlay Backdrop */}
          {isOpen && (
            <div 
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[9990] transition-opacity duration-300"
              onClick={() => setIsOpen(false)}
            />
          )}

          {/* Drawer Menu */}
          <div 
            className={`fixed top-0 left-0 h-[100dvh] max-h-[100dvh] w-80 max-w-[85vw] bg-white shadow-2xl z-[9995] transform transition-transform duration-300 ease-out flex flex-col ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
          >
            {/* Drawer Header */}
            <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-indigo-800 p-5 pt-[max(1.25rem,env(safe-area-inset-top))] flex justify-between items-center text-white shrink-0 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center border border-white/20">
                  <UserCircle2 className="w-5 h-5" />
                </div>
                <div className="flex flex-col items-start leading-tight">
                  <h2 className="font-bold text-base leading-tight">
                    {activeUser?.name ? activeUser.name.replace(/\s*\(Developer\)/i, '').trim() : "Menu Toko"}
                  </h2>
                  <div className="flex flex-col items-start gap-1 mt-0.5">
                    <p className="text-[11px] text-blue-200 font-medium">
                      {activeUser?.jobTitle || (activeUser?.role === 'SUPERVISOR' ? 'Supervisor' : 'Aplikasi Toko')}
                    </p>
                    {activeUser?.name?.toLowerCase().includes('developer') && (
                      <span className="text-[9px] font-black bg-white/20 text-white border border-white/30 px-2 py-0.5 rounded tracking-wider uppercase">
                        Developer
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setIsOpen(false)} 
                aria-label="Tutup Menu"
                className="w-9 h-9 flex items-center justify-center bg-white/10 rounded-full hover:bg-white/20 active:bg-white/30 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Scrollable Navigation Items */}
            <div className="flex-1 overflow-y-auto touch-scroll p-4 flex flex-col gap-2.5 custom-scrollbar">
              
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1 pt-1">
                Navigasi Utama
              </div>

              <Link 
                href="/" 
                onClick={() => setIsOpen(false)} 
                className="flex items-center gap-3.5 p-3.5 bg-slate-50 hover:bg-blue-50/60 active:bg-blue-100/60 rounded-xl transition-all font-bold text-slate-700 shadow-xs border border-slate-100 group"
              >
                <div className="w-9 h-9 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <Package2 className="w-4 h-4" />
                </div>
                <span className="text-sm">Aplikasi Toko (SA)</span>
              </Link>

              <Link 
                href="/promo-unik" 
                onClick={() => setIsOpen(false)} 
                className="flex items-center gap-3.5 p-3.5 bg-slate-50 hover:bg-purple-50/60 active:bg-purple-100/60 rounded-xl transition-all font-bold text-slate-700 shadow-xs border border-slate-100 group"
              >
                <div className="w-9 h-9 bg-purple-100 text-purple-600 rounded-lg flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <Gift className="w-4 h-4" />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm">Katalog Promo Unik</span>
                  <span className="text-[10px] text-purple-600 font-semibold">BOGO & Diskon Khusus</span>
                </div>
              </Link>

              <Link 
                href="/barang-baru" 
                onClick={() => setIsOpen(false)} 
                className="flex items-center gap-3.5 p-3.5 bg-slate-50 hover:bg-amber-50/60 active:bg-amber-100/60 rounded-xl transition-all font-bold text-slate-700 shadow-xs border border-slate-100 group"
              >
                <div className="w-9 h-9 bg-amber-100 text-amber-600 rounded-lg flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm">Barang Baru Masuk</span>
                  <span className="text-[10px] text-amber-600 font-semibold">Koleksi Terkini Toko</span>
                </div>
              </Link>

              <Link 
                href="/cek-harga" 
                onClick={() => setIsOpen(false)} 
                className="flex items-center gap-3.5 p-3.5 bg-slate-50 hover:bg-emerald-50/60 active:bg-emerald-100/60 rounded-xl transition-all font-bold text-slate-700 shadow-xs border border-slate-100 group"
              >
                <div className="w-9 h-9 bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <ScanBarcode className="w-4 h-4" />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm">Kiosk Cek Harga</span>
                  <span className="text-[10px] text-emerald-600 font-semibold">Tampilan Publik / Tablet</span>
                </div>
              </Link>

              {(activeUser?.jobTitle === 'Gudang Stock' || activeUser?.role === 'SUPERVISOR') && (
                <Link 
                  href="/warehouse" 
                  onClick={() => setIsOpen(false)} 
                  className="flex items-center gap-3.5 p-3.5 bg-slate-50 hover:bg-indigo-50/60 active:bg-indigo-100/60 rounded-xl transition-all font-bold text-slate-700 shadow-xs border border-slate-100 group"
                >
                  <div className="w-9 h-9 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Package2 className="w-4 h-4" />
                  </div>
                  <span className="text-sm">Gudang & Stok</span>
                </Link>
              )}
              
              {activeUser?.role === 'SUPERVISOR' && (
                <Link 
                  href="/spv-gateway" 
                  onClick={() => setIsOpen(false)} 
                  className="flex items-center gap-3.5 p-3.5 bg-slate-50 hover:bg-emerald-50/60 active:bg-emerald-100/60 rounded-xl transition-all font-bold text-slate-700 shadow-xs border border-slate-100 group"
                >
                  <div className="w-9 h-9 bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <ArrowLeft className="w-4 h-4" />
                  </div>
                  <span className="text-sm">Portal SPV</span>
                </Link>
              )}

              {(activeUser?.role === 'SUPERVISOR' || (activeUser?.name && activeUser?.name.includes('Developer'))) && (
                <Link 
                  href="/super-admin" 
                  onClick={() => setIsOpen(false)} 
                  className="flex items-center gap-3.5 p-3.5 bg-slate-50 hover:bg-rose-50/60 active:bg-rose-100/60 rounded-xl transition-all font-bold text-slate-700 shadow-xs border border-slate-100 group"
                >
                  <div className="w-9 h-9 bg-rose-100 text-rose-600 rounded-lg flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <LayoutDashboard className="w-4 h-4" />
                  </div>
                  <span className="text-sm">Master Control</span>
                </Link>
              )}

              {/* Section Pembaruan & Sinkronisasi */}
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1 pt-3">
                Pembaruan & Sinkronisasi
              </div>
              
              {/* Tombol Update Data Offline */}
              <button 
                onClick={handleManualSync}
                disabled={isSyncing}
                className="flex items-center justify-between p-3.5 bg-sky-50/60 hover:bg-sky-100/70 active:bg-sky-200/60 rounded-xl transition-all font-bold text-slate-700 text-left shadow-xs border border-sky-100 disabled:opacity-50 group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-sky-500 text-white rounded-lg flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform shadow-xs">
                    {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudDownload className="w-4 h-4" />}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm text-sky-900 leading-tight">Update Data Offline</span>
                    <span className="text-[10px] text-slate-500 font-medium">
                      {lastSyncDate ? `Tersinkron: ${lastSyncDate}` : 'Download data harga & promo'}
                    </span>
                  </div>
                </div>
                <div className="w-2 h-2 rounded-full bg-sky-500 shrink-0"></div>
              </button>

              {/* Tombol Update Versi Aplikasi & Bersihkan Cache */}
              <button 
                onClick={handleForceUpdateApp}
                disabled={isClearingCache}
                className="flex items-center justify-between p-3.5 bg-slate-50 hover:bg-slate-100 active:bg-slate-200/80 rounded-xl transition-all font-bold text-slate-700 text-left shadow-xs border border-slate-100 group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-slate-200 text-slate-700 rounded-lg flex items-center justify-center shrink-0 group-hover:rotate-180 transition-transform duration-500">
                    {isClearingCache ? <Loader2 className="w-4 h-4 animate-spin text-blue-600" /> : <RotateCw className="w-4 h-4" />}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm leading-tight">Perbarui Versi Web</span>
                    <span className="text-[10px] text-slate-400 font-medium">
                      Versi {APP_VERSION} • Bersihkan Cache
                    </span>
                  </div>
                </div>
                <span className="text-[9px] bg-slate-200 text-slate-600 font-bold px-1.5 py-0.5 rounded">
                  RELOAD
                </span>
              </button>

            </div>
            
            {/* Drawer Footer dengan Safe Area iOS */}
            <div className="p-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-slate-100 mt-auto bg-slate-50/80 shrink-0">
              {activeUser ? (
                <AnimatedLogoutButton onLogout={handleLogout} />
              ) : (
                <Link
                  href="/login"
                  onClick={() => setIsOpen(false)}
                  className="w-full h-11 flex items-center justify-center gap-2 bg-blue-600 text-white font-bold rounded-xl shadow-sm text-sm"
                >
                  Masuk / Login
                </Link>
              )}
              <div className="text-center text-[10px] text-slate-400 font-medium mt-2">
                Max Display Pro • v{APP_VERSION}
              </div>
            </div>
          </div>

          {/* Full Screen Centered Logout Loader */}
          {isLoggingOut && (
            <div className="fixed inset-0 z-[99999] bg-slate-950/75 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-in fade-in duration-300 select-none">
              <div className="bg-white/95 backdrop-blur-xl border border-white/50 rounded-3xl p-8 sm:p-10 shadow-2xl flex flex-col items-center max-w-xs w-full text-center">
                <ShiftLoader />
                <div className="mt-8 flex flex-col items-center gap-1.5">
                  <h3 className="text-base sm:text-lg font-black text-slate-800 tracking-wider">
                    MENGAKHIRI SHIFT
                  </h3>
                  <p className="text-xs text-slate-500 font-medium leading-relaxed">
                    Menyimpan sesi & keluar dengan aman...
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Up To Date Modal */}
          {showUpToDateModal && (
            <div className="fixed inset-0 z-[99990] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full animate-in zoom-in-95 duration-300">
                <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner">
                  <ShieldCheck className="w-8 h-8" />
                </div>
                <h2 className="text-xl font-bold text-slate-800 mb-2 text-center">Data Sudah Terupdate!</h2>
                <p className="text-sm text-slate-500 mb-6 leading-relaxed text-center font-medium">
                  Data harga dan promo di perangkat ini sudah menggunakan versi terbaru yang sama dengan server. Tidak perlu mengunduh ulang.
                </p>
                <button
                  onClick={() => setShowUpToDateModal(false)}
                  className="w-full h-12 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-all"
                >
                  Tutup
                </button>
              </div>
            </div>
          )}

          {/* Full Screen Download Overlay if Syncing or Sync Error */}
          {(isSyncing || syncError) && (
            <div className="fixed inset-0 z-[99999] bg-slate-950/75 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-in fade-in duration-300 select-none">
              <div className="bg-white/95 backdrop-blur-xl border border-white/50 rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col items-center max-w-xs w-full text-center">
                {syncError ? (
                  <>
                    <div className="w-14 h-14 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-3">
                      <AlertCircle className="w-7 h-7" />
                    </div>
                    <h3 className="text-base font-bold text-slate-800 mb-1">
                      Sinkronisasi Gagal
                    </h3>
                    <p className="text-xs text-slate-500 mb-5 leading-relaxed">
                      {syncError}
                    </p>
                    <div className="flex gap-2 w-full">
                      <button
                        onClick={() => {
                          setSyncError(null);
                          handleManualSync();
                        }}
                        className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all"
                      >
                        Coba Lagi
                      </button>
                      <button
                        onClick={() => {
                          setSyncError(null);
                          setIsSyncing(false);
                        }}
                        className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
                      >
                        Tutup
                      </button>
                    </div>
                  </>
                ) : (
                  <>
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

                      {/* Visible Progress Bar */}
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mt-1 border border-slate-200/50">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full transition-all duration-300"
                          style={{ width: `${Math.max(5, syncProgress ?? 0)}%` }}
                        />
                      </div>

                      <p className="text-[11px] text-slate-500 font-medium leading-relaxed mt-2 truncate w-full">
                        {syncStatusMsg}
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </>,
        document.body
      )}
    </>
  );
}
