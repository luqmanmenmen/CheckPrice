"use client";

import { useEffect, useState } from "react";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Package, UploadCloud } from "lucide-react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuth = pathname?.startsWith("/login");
  const { data } = useSWR("/api/auth/me", fetcher);
  
  const isSuperAdmin = data?.user?.role === "SUPERVISOR";

  // Redirect to login if session is invalidated (e.g. login from another device)
  useEffect(() => {
    if (!isAuth && data && !data.user) {
      window.location.href = "/login";
    }
  }, [isAuth, data]);

  // Global Background Auto-Sync for Offline DB
  const [isSyncing, setIsSyncing] = useState(false);
  useEffect(() => {
    if (!isAuth && data?.user) {
      import("@/lib/offlineDb").then(({ syncOfflineDatabase }) => {
        syncOfflineDatabase(setIsSyncing);
      });
    }
  }, [isAuth, data]);

  if (isAuth) {
    return (
      <main className="w-full min-h-screen">
        {children}
      </main>
    );
  }

  return (
    <>
      <header className="bg-white shadow-sm border-b sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {!["/", "/warehouse", "/super-admin", "/spv-gateway", "/login"].includes(pathname || "") && (
              <button onClick={() => window.history.back()} className="p-2 -ml-2 rounded-full hover:bg-slate-100 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-600"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
              </button>
            )}
            <Link href="/" className="flex items-center">
              <img src="/suko-logo.png" alt="SUKO" className="h-12 object-contain" />
            </Link>
          </div>
          <nav className="flex gap-4 items-center">
            {isSuperAdmin && (
              <Link href="/super-admin" className="flex flex-col items-center text-xs text-slate-500 hover:text-blue-600">
                <UploadCloud className="w-5 h-5 mb-1" />
                Update Data
              </Link>
            )}
          </nav>
        </div>
      </header>
      
      {/* Full Screen Download Overlay if Syncing */}
      {isSyncing && (
        <div className="fixed inset-0 z-[200] bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center px-4">
          <div className="bg-white p-6 rounded-3xl shadow-2xl border border-slate-100 flex flex-col items-center max-w-xs w-full text-center animate-in zoom-in-95 duration-300">
             <div className="relative mb-4">
                <div className="absolute inset-0 border-4 border-slate-100 rounded-full"></div>
                <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <UploadCloud className="w-6 h-6 text-indigo-600 animate-pulse" />
                </div>
             </div>
             <h3 className="font-black text-lg text-slate-800 mb-1">Mengunduh Data Baru</h3>
             <p className="text-sm text-slate-500 font-medium leading-tight">
               Mohon tunggu sebentar, sistem sedang memperbarui stok dan harga...
             </p>
          </div>
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
