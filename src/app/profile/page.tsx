"use client";
import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { ChevronLeft, KeyRound, Save, LogOut, ShieldAlert, Smartphone } from "lucide-react";
import { AlertModal } from "@/components/AlertModal";

const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function ProfilePage() {
  const { data: userData } = useSWR("/api/auth/me", fetcher);
  
  const [oldPin, setOldPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [loggingOutScope, setLoggingOutScope] = useState<"self" | "all" | null>(null);

  const [alert, setAlert] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: "success" | "error" | "warning";
    onConfirm?: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    type: "success"
  });

  const showAlert = (
    title: string,
    message: string,
    type: "success" | "error" | "warning",
    onConfirm?: () => void
  ) => {
    setAlert({ isOpen: true, title, message, type, onConfirm });
  };

  const triggerLogoutAll = (scope: "self" | "all") => {
    const isAllScope = scope === "all";
    showAlert(
      isAllScope ? "Logout All Device (Semua + Developer)?" : "Logout Semua Perangkat (Akun Ini)?",
      isAllScope
        ? "Semua pengguna yang sedang login (Crew Store, Supervisor, TERMASUK Developer 22054178) akan dikeluarkan dari seluruh perangkat dan shift aktif ditutup.\n\nPerangkat ini juga akan kembali ke halaman Login."
        : "Sesi akun Anda saat ini akan diakhiri dan kunci perangkat akan dibuka agar Anda bisa login kembali dari perangkat lain.",
      isAllScope ? "error" : "warning",
      async () => {
        setLoggingOutScope(scope);
        try {
          const res = await fetch("/api/auth/logout-all", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scope }),
          });
          const data = await res.json();
          if (res.ok && data.success) {
            if (typeof window !== "undefined") {
              localStorage.removeItem("suko_user");
              window.location.href = "/login?reason=logged_out_all";
            }
          } else {
            setLoggingOutScope(null);
            showAlert("Gagal", data.error || "Gagal memproses Logout All Device.", "error");
          }
        } catch {
          setLoggingOutScope(null);
          showAlert("Error", "Terjadi kesalahan jaringan.", "error");
        }
      }
    );
  };

  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPin !== confirmPin) {
      return showAlert("Kesalahan", "PIN Baru dan Konfirmasi PIN tidak cocok!", "warning");
    }
    
    if (newPin.length < 4) {
      return showAlert("Kesalahan", "PIN minimal 4 karakter!", "warning");
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldPin, newPin })
      });
      
      const data = await res.json();
      if (res.ok) {
        showAlert("Berhasil", "PIN keamanan Anda berhasil diperbarui.", "success");
        setOldPin("");
        setNewPin("");
        setConfirmPin("");
      } else {
        showAlert("Gagal", data.error || "Gagal mengubah PIN.", "error");
      }
    } catch (err) {
      showAlert("Error", "Terjadi kesalahan jaringan", "error");
    } finally {
      setLoading(false);
    }
  };

  const user = userData?.user;

  return (
    <div className="min-h-[calc(100vh-130px)] bg-slate-50 flex flex-col p-4 md:p-8">
      <div className="max-w-xl mx-auto w-full">
        {/* Header */}
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-blue-600 transition-colors mb-6">
          <ChevronLeft className="w-5 h-5" /> Kembali
        </Link>
        
        <div className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
          <div className="bg-gradient-to-r from-blue-700 to-indigo-800 p-8 text-white text-center">
            <div className="w-20 h-20 bg-white/20 rounded-full mx-auto mb-4 flex items-center justify-center border-2 border-white/30 shadow-inner backdrop-blur-sm">
              <span className="text-3xl font-black">{user?.name ? user.name.charAt(0).toUpperCase() : '?'}</span>
            </div>
            <h1 className="text-2xl font-black">{user?.name ? user.name.replace(/\s*\(Developer\)/i, '').trim() : "Karyawan"}</h1>
            <p className="text-blue-200 font-medium tracking-wider mt-1">{user?.nik}</p>
            {user?.name?.toLowerCase().includes('developer') && (
              <div className="mt-2.5">
                <span className="inline-block px-3 py-1 bg-white/20 text-white border border-white/30 rounded-full text-xs font-bold tracking-widest uppercase backdrop-blur-md shadow-sm">
                  Developer
                </span>
              </div>
            )}
            {user?.toko && (
              <span className="inline-block mt-3 px-3 py-1 bg-white/20 rounded-full text-xs font-bold tracking-widest uppercase border border-white/30 backdrop-blur-md shadow-sm">
                {user.toko}
              </span>
            )}
          </div>

          <div className="p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-800">Ubah PIN Keamanan</h2>
                <p className="text-xs text-slate-500">Gunakan PIN yang mudah Anda ingat tapi sulit ditebak orang lain.</p>
              </div>
            </div>

            <form onSubmit={handleChangePin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wide">PIN Lama</label>
                <input 
                  type="password" 
                  inputMode="numeric"
                  required 
                  value={oldPin} 
                  onChange={e => setOldPin(e.target.value)} 
                  className="w-full p-3.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all font-mono tracking-widest text-lg" 
                  placeholder="••••••" 
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wide">PIN Baru</label>
                  <input 
                    type="password" 
                    inputMode="numeric"
                    required 
                    value={newPin} 
                    onChange={e => setNewPin(e.target.value)} 
                    className="w-full p-3.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all font-mono tracking-widest text-lg" 
                    placeholder="••••••" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wide">Ulangi PIN Baru</label>
                  <input 
                    type="password" 
                    inputMode="numeric"
                    required 
                    value={confirmPin} 
                    onChange={e => setConfirmPin(e.target.value)} 
                    className="w-full p-3.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all font-mono tracking-widest text-lg" 
                    placeholder="••••••" 
                  />
                </div>
              </div>

              <button 
                disabled={loading} 
                type="submit" 
                className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-200 hover:bg-blue-700 hover:shadow-blue-300 transition-all flex items-center justify-center gap-2 mt-6 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                ) : (
                  <><Save className="w-5 h-5" /> Simpan PIN Baru</>
                )}
              </button>
            </form>

            {/* Keamanan Sesi & Logout All Device */}
            <div className="mt-8 pt-6 border-t border-slate-100 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 shrink-0">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-bold text-slate-800 whitespace-normal break-words">
                    Keamanan Sesi & Perangkat (1 Akun = 1 Device)
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed whitespace-normal break-words">
                    Demi mencegah akun dipakai bersamaan di banyak perangkat, satu akun hanya bisa aktif pada 1 perangkat dalam satu waktu. Gunakan tombol di bawah untuk mengakhiri sesi dengan aman sebelum berpindah perangkat.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2.5">
                <button
                  type="button"
                  disabled={loggingOutScope !== null}
                  onClick={() => triggerLogoutAll("self")}
                  className="w-full py-3.5 px-4 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-60 whitespace-normal break-words text-center"
                >
                  <LogOut className="w-4 h-4 shrink-0" />
                  <span>{loggingOutScope === "self" ? "Memproses Logout..." : "Logout Semua Perangkat (Akun Saya)"}</span>
                </button>

                {(user?.role === "SUPERVISOR" || user?.nik === "22054178") && (
                  <button
                    type="button"
                    disabled={loggingOutScope !== null}
                    onClick={() => triggerLogoutAll("all")}
                    className="w-full py-3.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm shadow-md shadow-rose-200 transition-all flex items-center justify-center gap-2 disabled:opacity-60 whitespace-normal break-words text-center"
                  >
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    <span>{loggingOutScope === "all" ? "Mengeluarkan Semua..." : "Logout All Device (Semua Akun + Developer)"}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <AlertModal 
        isOpen={alert.isOpen}
        title={alert.title}
        message={alert.message}
        type={alert.type}
        onConfirm={alert.onConfirm}
        onClose={() => setAlert(prev => ({ ...prev, isOpen: false, onConfirm: undefined }))}
      />
    </div>
  );
}
