"use client";

import { useEffect, useState } from "react";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Package, UploadCloud } from "lucide-react";
import useSWR from "swr";
import Sidebar from "./Sidebar";

const fetcher = (url: string) => fetch(url, { credentials: "same-origin" }).then(res => res.json());

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuth = pathname?.startsWith("/login");
  const { data } = useSWR(isAuth ? null : "/api/auth/me", fetcher);
  
  const isSuperAdmin = data?.user?.role === "SUPERVISOR";

  // NOTE: Auto-logout dihapus. SWR cache lama ({ user: null }) bisa memicu
  // POST /api/auth/logout tepat setelah login baru dan menghapus session yang valid.
  // Proteksi route ditangani oleh middleware + cek auth di masing-masing page.

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
            <Sidebar user={data?.user} />
            <Link href="/" className="flex items-center">
              <img src="/suko-logo.png" alt="SUKO" className="h-12 object-contain" />
            </Link>
          </div>
          <nav className="flex gap-4 items-center">
            {/* Nav items can be placed here if needed */}
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
