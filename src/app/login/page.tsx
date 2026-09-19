"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

import ShiftToggle from "@/components/ShiftToggle";

export default function Login() {
  const [nik, setNik] = useState("");
  const [pin, setPin] = useState("");
  const [jobTitle, setJobTitle] = useState("Cashier");
  const [shift, setShift] = useState("1");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  
  // Client-side only states for random positions
  const [mounted, setMounted] = useState(false);
  const [stars, setStars] = useState<{ x: number; y: number; delay: string }[]>([]);

  useEffect(() => {
    setMounted(true);
    setStars(Array.from({ length: 50 }).map(() => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      delay: (Math.random() * 3).toFixed(2),
    })));
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Posisi / Role</label>
            <select
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              className="w-full border border-gray-300 rounded-lg p-3 text-lg bg-white"
            >
              <option value="Cashier">Cashier</option>
              <option value="Fitter">Fitter</option>
              <option value="Runner">Runner</option>
              <option value="Gudang Stock">Gudang Stock</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">NIK Karyawan</label>
            <input
              type="text"
              required
              className="w-full border border-gray-300 rounded-lg p-3 text-lg"
              placeholder="Contoh: S001 atau 10045"
              value={nik}
              onChange={(e) => setNik(e.target.value.toUpperCase())}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">PIN (6 Angka)</label>
            <input
              type="password"
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
            disabled={loading || pin.length < 6 || !nik}
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-black py-4 rounded-xl mt-6 shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "MEMERIKSA..." : "MULAI SHIFT SAYA"}
          </button>
        </form>

        <div className="mt-6 p-4 bg-blue-50 rounded-lg text-xs text-blue-800">
          <p className="font-bold mb-1">Akun Testing Sementara:</p>
          <ul className="list-disc pl-4 space-y-1">
            <li>SA: NIK <b>S001</b>, PIN <b>123456</b></li>
            <li>Gudang: NIK <b>W001</b>, PIN <b>123456</b></li>
          </ul>
        </div>
      </div>

      <div className="flex-grow shrink-0 min-h-[4rem]"></div>

      <div className="text-center text-xs font-bold text-white/50 tracking-wide z-10 drop-shadow-sm pb-4">
        Powered by Luqmen 😼🕶️
      </div>
    </div>
  );
}
