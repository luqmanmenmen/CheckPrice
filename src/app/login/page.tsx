"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

import ShiftToggle from "@/components/ShiftToggle";
import ShiftLoader from "@/components/ShiftLoader";
import { ShoppingCart, Shirt, Footprints, Package } from "lucide-react";

export default function Login() {
  const [nik, setNik] = useState("");
  const [pin, setPin] = useState("");
  const [jobTitle, setJobTitle] = useState("Cashier");
  const [shift, setShift] = useState("1");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [fadeExit, setFadeExit] = useState(false);

  const performExit = (dest: string) => {
    setFadeExit(true);
    setTimeout(() => {
      window.location.replace(dest);
    }, 1000); // Wait for 1s fade-out animation
  };
  const [toko, setToko] = useState("");
  const [userName, setUserName] = useState("");
  const [checkingNik, setCheckingNik] = useState(false);
  
  const [showChangePin, setShowChangePin] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [loginRole, setLoginRole] = useState("");
  const [changingPin, setChangingPin] = useState(false);
  
  // Client-side only states for random positions
  const [mounted, setMounted] = useState(false);
  const [stars, setStars] = useState<{ x: number; y: number; delay: string }[]>([]);

  useEffect(() => {
    const checkNik = async () => {
      if (nik.length >= 4) { // Can be "S001" or 6 digits
        setCheckingNik(true);
        try {
          const res = await fetch(`/api/auth/check-nik?nik=${nik}`);
          const data = await res.json();
          if (res.ok) {
            setToko(data.toko || "Toko Belum Di-set");
            setUserName(data.name || "");
          } else {
            setToko("");
            setUserName("");
          }
        } catch (error) {
          setToko("");
          setUserName("");
        } finally {
          setCheckingNik(false);
        }
      } else {
        setToko("");
        setUserName("");
      }
    };
    
    const timeoutId = setTimeout(checkNik, 500); // Debounce
    return () => clearTimeout(timeoutId);
  }, [nik]);

  useEffect(() => {
    setMounted(true);
    setStars(Array.from({ length: 50 }).map(() => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      delay: (Math.random() * 3).toFixed(2),
    })));

    // Auto-select shift based on time
    const currentHour = new Date().getHours();
    // Jika jam 1 siang (13:00) ke atas, otomatis Shift Siang ("2"), jika di bawah itu Shift Pagi ("1")
    if (currentHour >= 13) {
      setShift("2");
    } else {
      setShift("1");
    }
  }, []);

  const router = useRouter();

  const [showForceLoginModal, setShowForceLoginModal] = useState(false);

  const handleForceLogin = async () => {
    setShowForceLoginModal(false);
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nik, pin, shift, jobTitle, force: true })
      });

      const data = await res.json();
      if (res.ok) {
        if (pin === "123456") {
          setLoginRole(data.role);
          setShowChangePin(true);
        } else {
          if (data.role === "SUPERVISOR") {
            performExit("/spv-gateway");
          } else if (jobTitle === "Gudang Stock") {
            performExit("/warehouse");
          } else {
            performExit("/");
          }
        }
      } else {
        setError(data.error || "Gagal login");
      }
    } catch (err) {
      setError("Terjadi kesalahan jaringan");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nik, pin, shift, jobTitle })
      });

      const data = await res.json();
      
      if (res.status === 409 && data.isAlreadyLoggedIn) {
        setShowForceLoginModal(true);
        setLoading(false);
        return;
      }
      
      if (res.ok) {
        if (pin === "123456") {
          setLoginRole(data.role);
          setShowChangePin(true);
        } else {
          if (data.role === "SUPERVISOR") {
            performExit("/spv-gateway");
          } else if (jobTitle === "Gudang Stock") {
            performExit("/warehouse");
          } else {
            performExit("/");
          }
        }
      } else {
        setError(data.error || "Gagal login");
      }
    } catch (err) {
      setError("Terjadi kesalahan jaringan");
    } finally {
      setLoading(false);
    }
  };

  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPin.length < 4) {
      setError("PIN baru minimal 4 angka");
      return;
    }
    
    setChangingPin(true);
    setError("");
    try {
      const res = await fetch("/api/auth/change-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPin })
      });
      
      const data = await res.json();
      if (res.ok) {
        if (loginRole === "SUPERVISOR") {
          performExit("/spv-gateway");
        } else if (jobTitle === "Gudang Stock") {
          performExit("/warehouse");
        } else {
          performExit("/");
        }
      } else {
        setError(data.error || "Gagal mengubah PIN");
      }
    } catch (err) {
      setError("Terjadi kesalahan jaringan");
    } finally {
      setChangingPin(false);
    }
  };

  return (
    <div id="login-stage" className="login-stage relative min-h-screen flex flex-col p-4">
      {/* Background Stars (Optional extra effect) */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <div className="page-stars" id="pageStars">
          {mounted && stars.map((s, i) => (
            <span key={i} style={{ left: `${s.x}%`, top: `${s.y}%`, animationDelay: `${s.delay}s` }}></span>
          ))}
        </div>
      </div>

      <div className="flex-grow shrink-0 min-h-[2rem]"></div>

      {showChangePin ? (
        <div className="relative z-20 mx-auto bg-white/95 backdrop-blur-xl p-8 rounded-3xl shadow-2xl w-full max-w-sm border border-white/40 shrink-0 animate-in zoom-in-95 duration-300">
          <div className="text-center mb-6">
            <h2 className="text-xl font-black text-slate-800">Ubah PIN Default</h2>
            <p className="text-sm text-slate-500 mt-2">Demi keamanan, silakan ganti PIN Anda sebelum melanjutkan.</p>
          </div>
          
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4 text-center">
              {error}
            </div>
          )}

          <form onSubmit={handleChangePin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">PIN Baru</label>
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                required
                maxLength={6}
                className="w-full border border-gray-300 rounded-lg p-3 text-lg tracking-widest text-center font-mono bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="••••••"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                autoFocus
              />
              <p className="text-xs text-slate-400 mt-2 text-center">Gunakan kombinasi angka yang mudah diingat.</p>
            </div>
            
            <button
              type="submit"
              disabled={changingPin || newPin.length < 4}
              className="w-full bg-gradient-to-r from-green-600 to-emerald-600 text-white font-black py-4 rounded-xl mt-6 shadow-lg shadow-green-500/30 hover:shadow-green-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {changingPin ? "MENYIMPAN..." : "SIMPAN & LANJUTKAN"}
            </button>
          </form>
        </div>
      ) : (
        <div className="relative z-20 mx-auto bg-white/95 backdrop-blur-xl p-8 rounded-3xl shadow-2xl w-full max-w-sm border border-white/40 shrink-0">
          <div className="text-center mb-8 flex flex-col items-center">
            <img src="/suko-logo.png" alt="SUKO Logo" className="h-20 mb-4 object-contain drop-shadow-md" />
            <p className="text-gray-500 text-sm font-medium">Masuk untuk memulai shift Anda</p>
          </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4 text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">NIK Karyawan</label>
            <input
              type="text"
              required
              className="w-full border border-gray-300 rounded-lg p-3 text-lg bg-white text-gray-900"
              placeholder="Contoh: 123456"
              value={nik}
              onChange={(e) => setNik(e.target.value.toUpperCase())}
            />
            {checkingNik && <p className="text-xs text-blue-600 mt-1 animate-pulse">Memeriksa NIK...</p>}
          </div>

          {toko && userName && (
            <div className="animate-in slide-in-from-top-2 duration-300 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nama Karyawan</label>
                <div className="w-full border border-gray-300 rounded-lg p-3 text-lg bg-gray-50 text-gray-700 font-bold">
                  {userName}
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Penempatan Toko</label>
                <div className="w-full border border-gray-300 rounded-lg p-3 text-lg bg-gray-50 text-gray-500 font-bold">
                  {toko}
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">PIN (Keamanan)</label>
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  required
                  maxLength={6}
                  className="w-full border border-gray-300 rounded-lg p-3 text-lg tracking-widest text-center font-mono bg-white text-gray-900"
                  placeholder="••••••"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Posisi / Role</label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { name: "Cashier", icon: ShoppingCart },
                    { name: "Fitter", icon: Shirt },
                    { name: "Runner", icon: Footprints },
                    { name: "Gudang Stock", icon: Package },
                  ].map((role) => {
                    const Icon = role.icon;
                    const isSelected = jobTitle === role.name;
                    return (
                      <button
                        key={role.name}
                        type="button"
                        onClick={() => setJobTitle(role.name)}
                        className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all duration-200 ${
                          isSelected
                            ? "border-blue-500 bg-blue-50 text-blue-700 shadow-sm ring-2 ring-blue-500/20 ring-offset-1"
                            : "border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200 hover:bg-slate-100"
                        }`}
                      >
                        <Icon className={`w-6 h-6 mb-1 ${isSelected ? "text-blue-600" : "text-slate-400"}`} />
                        <span className="text-[11px] font-bold tracking-wide uppercase">{role.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <ShiftToggle isNight={shift === "2"} onToggle={(isNight) => setShift(isNight ? "2" : "1")} />

              <button
                type="submit"
                disabled={loading || pin.length < 4 || !nik || !toko}
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-black py-4 rounded-xl mt-6 shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "MEMERIKSA..." : "MULAI SHIFT SAYA"}
              </button>
            </div>
          )}
        </form>
      </div>
      )}

      <div className="flex-grow shrink-0 min-h-[4rem]"></div>

      <div className="text-center text-xs font-bold text-white/50 tracking-wide z-10 drop-shadow-sm pb-4">
        Powered by Luqmen 😼🕶️
      </div>

      {/* Modal Force Login */}
      {showForceLoginModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full animate-[spring_.5s]">
            <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">Sesi Masih Aktif!</h2>
            <p className="text-sm text-slate-500 mb-6 leading-relaxed">
              Akun ini terdeteksi sedang aktif (login) di perangkat lain. Apakah Anda ingin mengakhiri sesi di perangkat tersebut dan memindahkan login ke perangkat ini?
            </p>
            
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowForceLoginModal(false)}
                className="flex-1 h-12 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-all"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleForceLogin}
                className="flex-1 h-12 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-lg shadow-rose-200 transition-all"
              >
                Ya, Lanjutkan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full Screen Shift Loader */}
      {loading && (
        <div className={`fixed inset-0 z-[100] bg-slate-900/90 backdrop-blur-md flex flex-col items-center justify-center transition-opacity duration-1000 ${fadeExit ? "opacity-0" : "opacity-100"}`}>
          <ShiftLoader />
          <p className="text-white font-bold mt-16 text-lg tracking-widest animate-pulse">MEMULAI SHIFT...</p>
        </div>
      )}
    </div>
  );
}
