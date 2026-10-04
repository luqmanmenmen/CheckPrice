"use client";

import { useState } from "react";
import { X, Package2, ArrowLeft, CloudDownload, Loader2, Menu, LayoutDashboard } from "lucide-react";
import Link from "next/link";
import AnimatedLogoutButton from "./AnimatedLogoutButton";

export default function Sidebar({ user }: { user: any }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      const { syncOfflineDatabase } = await import('@/lib/offlineDb');
      await syncOfflineDatabase(() => {}, true);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
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

          {user.jobTitle === 'Gudang Stock' && (
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
            onClick={() => {
              setIsOpen(false);
              handleManualSync();
            }}
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
    </>
  );
}
