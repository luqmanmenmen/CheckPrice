"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

import ShiftToggle from "@/components/ShiftToggle";
import { ShoppingCart, Shirt, Footprints, Package } from "lucide-react";

export default function Login() {
  const [nik, setNik] = useState("");
  const [pin, setPin] = useState("");
  const [jobTitle, setJobTitle] = useState("Cashier");
  const [shift, setShift] = useState("1");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [toko, setToko] = useState("");
  const [checkingNik, setCheckingNik] = useState(false);
  
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
          } else {
            setToko("");
          }
        } catch (error) {
          setToko("");
        } finally {
          setCheckingNik(false);
        }
      } else {
        setToko("");
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
      if (res.ok) {
        if (data.role === "WAREHOUSE") {
          router.push("/warehouse");
        } else {
          router.push("/");
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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">NIK Karyawan</label>
            <input
              type="text"
              required
              className="w-full border border-gray-300 rounded-lg p-3 text-lg"
              placeholder="Contoh: 123456"
              value={nik}
              onChange={(e) => setNik(e.target.value.toUpperCase())}
            />
            {checkingNik && <p className="text-xs text-blue-600 mt-1 animate-pulse">Memeriksa NIK...</p>}
          </div>

          {toko && (
            <div className="animate-in slide-in-from-top-2 duration-300">
              <label className="block text-sm font-medium text-gray-700 mb-1">Penempatan Toko</label>
              <div className="w-full border border-gray-300 rounded-lg p-3 text-lg bg-gray-50 text-gray-500 font-bold">
                {toko}
              </div>
            </div>
          )}

          <div className={`transition-all duration-500 ${toko ? 'opacity-100 h-auto block' : 'opacity-50 pointer-events-none'}`}>
            <label className="block text-sm font-medium text-gray-700 mb-1">PIN (Keamanan)</label>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              required
              maxLength={6}
              className="w-full border border-gray-300 rounded-lg p-3 text-lg tracking-widest text-center font-mono"
              placeholder="••••••"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            />
          </div>

          <ShiftToggle isNight={shift === "2"} onToggle={(isNight) => setShift(isNight ? "2" : "1")} />

          <button
            type="submit"
            disabled={loading || pin.length < 4 || !nik || !toko}
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-black py-4 rounded-xl mt-6 shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "MEMERIKSA..." : "MULAI SHIFT SAYA"}
          </button>
        </form>
      </div>

      <div className="flex-grow shrink-0 min-h-[4rem]"></div>

      <div className="text-center text-xs font-bold text-white/50 tracking-wide z-10 drop-shadow-sm pb-4">
        Powered by Luqmen 😼🕶️
      </div>
    </div>
  );
}
