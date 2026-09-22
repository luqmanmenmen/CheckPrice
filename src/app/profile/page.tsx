"use client";
import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { ChevronLeft, KeyRound, Save } from "lucide-react";
import { AlertModal } from "@/components/AlertModal";

const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function ProfilePage() {
  const { data: userData } = useSWR("/api/auth/me", fetcher);
  
  const [oldPin, setOldPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [loading, setLoading] = useState(false);

  const [alert, setAlert] = useState<{ isOpen: boolean; title: string; message: string; type: "success" | "error" | "warning" }>({
    isOpen: false,
    title: "",
    message: "",
    type: "success"
  });

  const showAlert = (title: string, message: string, type: "success" | "error" | "warning") => {
    setAlert({ isOpen: true, title, message, type });
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
            <h1 className="text-2xl font-black">{user?.name || "Karyawan"}</h1>
            <p className="text-blue-200 font-medium tracking-wider mt-1">{user?.nik}</p>
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
          </div>
        </div>
      </div>

      <AlertModal 
        isOpen={alert.isOpen}
        title={alert.title}
        message={alert.message}
        type={alert.type}
        onClose={() => setAlert(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
