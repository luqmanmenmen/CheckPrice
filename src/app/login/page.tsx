"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Login() {
  const [nik, setNik] = useState("");
  const [pin, setPin] = useState("");
  const [shift, setShift] = useState("1");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nik, pin, shift })
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
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-blue-600">MaxDisplay</h1>
          <p className="text-gray-500 text-sm">Masuk untuk memulai shift Anda</p>
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
              className="w-full border border-gray-300 rounded-lg p-3 text-lg"
              placeholder="Contoh: S001 atau W001"
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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Pilih Shift</label>
            <select
              className="w-full border border-gray-300 rounded-lg p-3 text-lg bg-white"
              value={shift}
              onChange={(e) => setShift(e.target.value)}
            >
              <option value="1">Shift 1 (Pagi)</option>
              <option value="2">Shift 2 (Siang)</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={loading || pin.length < 6}
            className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg mt-4 disabled:opacity-50"
          >
            {loading ? "Memeriksa..." : "Mulai Shift"}
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
    </div>
  );
}
