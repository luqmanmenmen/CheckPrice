"use client";

import { useState } from "react";
import { X, Package2, ArrowLeft, CloudDownload, Loader2, Menu, LayoutDashboard, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AnimatedLogoutButton from "./AnimatedLogoutButton";
import ShiftLoader from "./ShiftLoader";

export default function Sidebar({ user }: { user: any }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [syncProgress, setSyncProgress] = useState<number | undefined>(undefined);
  const [showUpToDateModal, setShowUpToDateModal] = useState(false);
  const router = useRouter();

  const handleManualSync = async () => {
    setIsSyncing(true);
    setSyncProgress(0); // Set to 0 immediately so it doesn't spin infinitely during check
    setIsOpen(false); // Tutup sidebar agar loading/modal terlihat
    try {
      const { syncOfflineDatabase, checkIfUpdateAvailable } = await import('@/lib/offlineDb');
      const isAvailable = await checkIfUpdateAvailable();
      
      if (!isAvailable) {
        setShowUpToDateModal(true);
        setIsSyncing(false);
        return;
      }

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

  const handleLogout = () => {
    setIsLoggingOut(true);
    
    // Kirim request ke background (keepalive agar tidak mati saat pindah page)
    fetch("/api/auth/logout", { method: "POST", keepalive: true }).catch(console.error);
    
    // Paksa keluar ke halaman login setelah 1.2 detik (pas animasi selesai)
    setTimeout(() => {
      window.location.href = "/login";
    }, 1200);
  };

  if (!user) return null;

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className="p-2 -ml-2 rounded-full hover:bg-slate-100 transition-colors mr-2"
      >
        <Menu className="w-6 h-6 text-slate-700" />
      </button>

      {/* Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-[100]"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Drawer */}
      <div className={`fixed top-0 left-0 h-full w-72 bg-white shadow-2xl z-[110] transform transition-transform duration-300 flex flex-col ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="bg-gradient-to-r from-blue-700 to-indigo-800 p-6 flex justify-between items-center text-white">
          <h2 className="font-bold text-lg">Menu Utama</h2>
          <button onClick={() => setIsOpen(false)} className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          <Link href="/" onClick={() => setIsOpen(false)} className="flex items-center gap-4 p-4 bg-slate-50 hover:bg-slate-100 rounded-xl transition-colors font-bold text-slate-700 shadow-sm border border-slate-100">
            <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center shrink-0">
              <Package2 className="w-5 h-5" />
            </div>
            Aplikasi Toko (SA)
          </Link>

          {(user.jobTitle === 'Gudang Stock' || user.role === 'SUPERVISOR') && (
            <Link href="/warehouse" onClick={() => setIsOpen(false)} className="flex items-center gap-4 p-4 bg-slate-50 hover:bg-slate-100 rounded-xl transition-colors font-bold text-slate-700 shadow-sm border border-slate-100">
              <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center shrink-0">
                <Package2 className="w-5 h-5" />
              </div>
              Gudang & Stok
            </Link>
          )}
          
          {user.role === 'SUPERVISOR' && (
            <Link href="/spv-gateway" onClick={() => setIsOpen(false)} className="flex items-center gap-4 p-4 bg-slate-50 hover:bg-slate-100 rounded-xl transition-colors font-bold text-slate-700 shadow-sm border border-slate-100">
              <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center shrink-0">
                <ArrowLeft className="w-5 h-5" />
              </div>
              Portal SPV
            </Link>
          )}

          {(user.role === 'SUPERVISOR' || (user.name && user.name.includes('Developer'))) && (
            <Link href="/super-admin" onClick={() => setIsOpen(false)} className="flex items-center gap-4 p-4 bg-slate-50 hover:bg-slate-100 rounded-xl transition-colors font-bold text-slate-700 shadow-sm border border-slate-100">
              <div className="w-10 h-10 bg-rose-100 text-rose-600 rounded-lg flex items-center justify-center shrink-0">
                <LayoutDashboard className="w-5 h-5" />
              </div>
              Master Control
            </Link>
          )}
          
          <button 
            onClick={handleManualSync}
            disabled={isSyncing}
            className="flex items-center gap-4 p-4 bg-slate-50 hover:bg-slate-100 rounded-xl transition-colors font-bold text-slate-700 text-left shadow-sm border border-slate-100 disabled:opacity-50"
          >
            <div className="w-10 h-10 bg-sky-100 text-sky-600 rounded-lg flex items-center justify-center shrink-0">
              {isSyncing ? <Loader2 className="w-5 h-5 animate-spin" /> : <CloudDownload className="w-5 h-5" />}
            </div>
            {isSyncing ? "Mengupdate..." : "Update Data Offline"}
          </button>
        </div>
        
        <div className="p-4 border-t border-slate-100 mt-auto bg-slate-50">
          <AnimatedLogoutButton onLogout={handleLogout} />
        </div>
      </div>

      {/* Full Screen Logout Loader */}
      {isLoggingOut && (
        <div className="fixed inset-0 z-[200] bg-white flex flex-col items-center justify-center animate-in fade-in duration-500">
          <ShiftLoader />
          <p className="text-slate-800 font-bold mt-16 text-sm tracking-[0.3em] animate-pulse">MENGAKHIRI SHIFT...</p>
        </div>
      )}

      {/* Up To Date Modal */}
      {showUpToDateModal && (
        <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
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

      {/* Full Screen Download Overlay if Syncing */}
      {isSyncing && (
        <div className="fixed inset-0 z-[200] bg-white flex flex-col items-center justify-center transition-all duration-700 ease-out opacity-100 visible">
          <ShiftLoader progress={syncProgress} />
          <p className="text-slate-800 font-bold mt-16 text-sm tracking-[0.3em] animate-pulse">LOADING...</p>
        </div>
      )}
    </>
  );
}
