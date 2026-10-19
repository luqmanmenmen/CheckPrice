"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import Sidebar from "./Sidebar";
import { forceAppUpdate, APP_VERSION } from "@/lib/version";

const fetcher = (url: string) => fetch(url, { credentials: "same-origin" }).then(res => res.json());

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuth = pathname?.startsWith("/login");
  const isCekHarga = pathname?.startsWith("/cek-harga");
  const { data, isLoading } = useSWR(isAuth || isCekHarga ? null : "/api/auth/me", fetcher, {
    refreshInterval: 60000, // Heartbeat setiap 1 menit saat aplikasi terbuka
    revalidateOnFocus: true
  });

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
