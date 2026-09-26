"use client";

import { useRouter } from "next/navigation";
import { ShieldCheck, Store, LayoutDashboard, ArrowRight, LogOut } from "lucide-react";
import { useEffect, useState } from "react";

export default function SpvGateway() {
  const router = useRouter();
  const [user, setUser] = useState<{name: string, toko: string} | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then(res => res.json())
      .then(data => {
        if (data.user) setUser(data.user);
      });
  }, []);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/login", { method: "DELETE" });
      router.replace("/login");
    } catch (e) {
      setLoggingOut(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-500">
        <div className="bg-gradient-to-br from-indigo-600 to-blue-700 p-8 text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]"></div>
          <div className="w-20 h-20 bg-white/20 backdrop-blur-md rounded-2xl mx-auto flex items-center justify-center mb-4 shadow-inner">
            <ShieldCheck className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-black text-white tracking-wide">PORTAL SUPERVISOR</h1>
          <p className="text-indigo-100 mt-2 text-sm">
            Selamat datang, <strong className="text-white">{user?.name || "SPV"}</strong>
          </p>
          {user?.toko && (
            <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 bg-black/20 rounded-full text-xs font-bold text-white backdrop-blur-sm border border-white/10">
              <Store className="w-3 h-3" />
              {user.toko}
            </div>
          )}
        </div>
        
        <div className="p-6 flex flex-col gap-4">
          <p className="text-center text-sm font-semibold text-slate-500 mb-2">Pilih area kerja Anda hari ini:</p>
          
          <button 
            onClick={() => router.push("/super-admin")}
            className="group relative w-full flex items-center p-4 rounded-2xl border-2 border-slate-100 bg-white hover:border-indigo-500 hover:bg-indigo-50 transition-all duration-300 shadow-sm hover:shadow-md text-left"
          >
            <div className="w-12 h-12 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
              <LayoutDashboard className="w-6 h-6" />
            </div>
            <div className="ml-4 flex-grow">
              <h3 className="text-base font-bold text-slate-800 group-hover:text-indigo-700">Master Control</h3>
              <p className="text-xs text-slate-500 mt-0.5">Laporan Sales, PO, Manajemen User & Promo</p>
            </div>
            <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-indigo-600 group-hover:translate-x-1 transition-all" />
          </button>
          
          <button 
            onClick={() => router.push("/")}
            className="group relative w-full flex items-center p-4 rounded-2xl border-2 border-slate-100 bg-white hover:border-blue-500 hover:bg-blue-50 transition-all duration-300 shadow-sm hover:shadow-md text-left"
          >
            <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
              <Store className="w-6 h-6" />
            </div>
            <div className="ml-4 flex-grow">
              <h3 className="text-base font-bold text-slate-800 group-hover:text-blue-700">Aplikasi Toko (SA)</h3>
              <p className="text-xs text-slate-500 mt-0.5">Check Price, Scanner, dan Request Barang</p>
            </div>
            <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-blue-600 group-hover:translate-x-1 transition-all" />
          </button>
        </div>
        
        <div className="p-4 bg-slate-50 border-t border-slate-100">
          <button 
            onClick={handleLogout}
            disabled={loggingOut}
            className="w-full py-3 flex items-center justify-center gap-2 text-sm font-bold text-slate-500 hover:text-red-600 transition-colors disabled:opacity-50"
          >
            <LogOut className="w-4 h-4" />
            {loggingOut ? "Keluar..." : "Logout & Akhiri Sesi"}
          </button>
        </div>
      </div>
    </div>
  );
}
