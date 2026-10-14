"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Search, X, Camera, ScanBarcode, ScanText, Tag, Sparkles, AlertCircle, RefreshCw } from "lucide-react";
import { ChipLoader } from "@/components/ChipLoader";

// Gunakan engine scanner yang sama persis dengan halaman utama toko yang sudah terbukti bekerja
const Scanner = dynamic(() => import("@/components/Scanner"), { ssr: false });
const TextScanner = dynamic(() => import("@/components/TextScanner"), { ssr: false });

type ProductData = {
  id?: number;
  sku: string;
  barcode?: string | null;
  article?: string | null;
  description: string;
  hargaNormal: number;
  hargaPromo?: number | null;
  diskon?: string | null;
  discountType?: string | null;
  brand?: string | null;
  dept?: string | null;
  color?: string | null;
  size?: string | null;
  toDate?: string | null;
};

function formatRupiah(angka: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(angka);
}

// Parse deskripsi produk untuk ekstraksi nama, warna, dan ukuran spesifik item yang discan
function parseProductInfo(product: ProductData) {
  const parts = (product.description || "").split(":");
  const name = product.article || parts[0]?.trim() || product.description;
  
  let color = product.color || (parts.length > 1 ? parts[1].trim() : "");
  let size = product.size || (parts.length > 2 ? parts[2].trim() : "");

  // Bersihkan nilai dummy
  if (color.toUpperCase() === "F" || color.toUpperCase() === "M" || color.toUpperCase() === "SOLID") color = "";
  if (size.toUpperCase() === "SOLID") size = "";

  return { name, color, size };
}

// Audio beep feedback saat barcode/SKU berhasil di-scan
const playScanBeep = () => {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(950, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1400, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch {
    // Abaikan jika audio tidak didukung
  }
};

export default function CekHargaPage() {
  const [scanMode, setScanMode] = useState<"none" | "barcode" | "text">("none");
  const [manualInput, setManualInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [product, setProduct] = useState<ProductData | null>(null);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(25);
  const inputRef = useRef<HTMLInputElement>(null);

  // Timer auto-reset kembali ke mode awal
  const resetKiosk = useCallback(() => {
    setProduct(null);
    setManualInput("");
    setError("");
    setScanMode("none");
    setCountdown(25);
  }, []);

  // Countdown timer saat produk sedang ditampilkan
  useEffect(() => {
    if (!product) return;

    setCountdown(25);
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          resetKiosk();
          return 25;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [product, resetKiosk]);

  // Eksekusi pencarian produk (Offline Dexie first -> Online API fallback)
  const searchProduct = async (identifier: string) => {
    const trimmed = identifier.trim();
    if (!trimmed) return;

    setLoading(true);
    setError("");

    try {
      // 1. OFFLINE-FIRST: Cek database lokal IndexedDB jika ada
      try {
        const { db } = await import("@/lib/offlineDb");
        const local = await db.products
          .where("sku")
          .equals(trimmed)
          .first();

        if (local) {
          playScanBeep();
          setProduct({
            sku: local.sku,
            barcode: null,
            article: local.name,
            description: [local.name, local.color, local.size].filter(Boolean).join(" : "),
            hargaNormal: local.hargaNormal,
            hargaPromo: local.hargaPromo,
            diskon: local.diskon || null,
            color: local.color,
            size: local.size,
            toDate: local.toDate,
          });
        }
      } catch {
        // Lanjutkan jika offline DB tidak ada
      }

      // 2. Minta data live ke server
      const res = await fetch(`/api/product/${encodeURIComponent(trimmed)}?page=1`, {
        cache: "no-store",
      });
      const data = await res.json();

      if (res.ok) {
        let found: ProductData | null = null;
        if (Array.isArray(data.data) && data.data.length > 0) {
          found = data.data[0];
        } else if (data.data) {
          found = data.data;
        }

        if (found) {
          playScanBeep();
          setProduct(found);
          setError("");
        } else if (!product) {
          setError("Produk tidak ditemukan. Pastikan barcode atau SKU sudah benar.");
        }
      } else if (!product) {
        setError(data.error || "Produk tidak ditemukan.");
      }
    } catch {
      if (!product) {
        setError("Gagal terhubung ke database. Periksa koneksi internet.");
      }
    } finally {
      setLoading(false);
      setManualInput("");
    }
  };

  // Handler saat scan Barcode berhasil
  const handleBarcodeSuccess = (result: string) => {
    setScanMode("none");
    searchProduct(result);
  };

  // Handler saat scan Teks SKU berhasil
  const handleTextScanSuccess = (sku: string) => {
    setScanMode("none");
    if (sku) {
      searchProduct(sku);
    }
  };

  // Cek apakah ada parameter ?sku= atau ?barcode= di URL (misal scan QR dari promo)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const query = params.get("barcode") || params.get("sku") || params.get("q");
      if (query) {
        searchProduct(query);
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Cek masa aktif promo jika ada tanggal berlaku
  let isPromoExpired = false;
  if (product && product.toDate) {
    const toDateObj = new Date(product.toDate);
    if (!isNaN(toDateObj.getTime())) {
      toDateObj.setHours(23, 59, 59, 999);
      if (new Date() > toDateObj) {
        isPromoExpired = true;
      }
    }
  }

  const isOnPromo =
    product &&
    product.hargaPromo &&
    product.hargaPromo > 0 &&
    product.hargaPromo !== product.hargaNormal &&
    !isPromoExpired;

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-slate-50 via-white to-slate-100 flex flex-col items-center justify-between p-4 sm:p-6 md:p-8 font-sans selection:bg-black selection:text-white">
      
      {/* 1. Kiosk Header */}
      <header className="w-full max-w-xl text-center pt-2 sm:pt-4 mb-4 sm:mb-6 animate-in fade-in duration-500 flex flex-col items-center">
        <img
          src="/suko-logo.png"
          alt="SUKO"
          className="h-10 sm:h-12 md:h-14 object-contain drop-shadow-xs mb-2"
        />
        <div className="inline-flex items-center gap-1.5 bg-slate-900 text-white px-3.5 py-1 rounded-full text-[11px] font-black tracking-widest uppercase shadow-xs">
          <Sparkles className="w-3.5 h-3.5 text-amber-300" />
          Cek Harga Resmi Toko
        </div>
      </header>

      {/* 2. Main Container */}
      <main className="w-full max-w-lg flex-1 flex flex-col items-center justify-center">

        {/* LOADING STATE */}
        {loading && (
          <div className="w-full bg-white rounded-3xl p-10 shadow-2xl border border-slate-100 flex flex-col items-center justify-center animate-in zoom-in-95 duration-300">
            <ChipLoader />
            <p className="mt-5 text-slate-700 font-black text-base animate-pulse">MEMERIKSA HARGA...</p>
            <p className="text-slate-400 text-xs mt-1">Mengambil data resmi dari database toko</p>
          </div>
        )}

        {/* ERROR STATE */}
        {error && !loading && (
          <div className="w-full bg-white rounded-3xl p-8 shadow-2xl border border-rose-100 text-center animate-in zoom-in-95 duration-300 flex flex-col items-center">
            <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mb-4">
              <AlertCircle className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-black text-slate-800 mb-2">Produk Tidak Ditemukan</h3>
            <p className="text-slate-500 text-sm max-w-xs leading-relaxed mb-6 font-medium">
              {error}
            </p>
            <div className="w-full flex flex-col gap-2.5">
              <button
                onClick={() => {
                  setError("");
                  setScanMode("barcode");
                }}
                className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm rounded-2xl shadow-lg transition-all active:scale-98 flex items-center justify-center gap-2"
              >
                <ScanBarcode className="w-4 h-4" />
                Scan Barcode Garis
              </button>
              <button
                onClick={() => {
                  setError("");
                  setScanMode("text");
                }}
                className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-sm rounded-2xl shadow-lg transition-all active:scale-98 flex items-center justify-center gap-2"
              >
                <ScanText className="w-4 h-4" />
                Scan Teks SKU (8 Digit)
              </button>
              <button
                onClick={resetKiosk}
                className="w-full h-11 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-2xl transition-all"
              >
                Kembali ke Beranda
              </button>
            </div>
          </div>
        )}

        {/* READY STATE: CARD TOMBOL SCAN & INPUT MANUAL */}
        {!product && !loading && !error && (
          <div className="w-full flex flex-col items-center gap-5 animate-in fade-in duration-300">
            
            {/* Action Card: Scan Kamera */}
            <div className="w-full bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-100 flex flex-col items-center text-center">
              <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center mb-5 shadow-inner">
                <ScanBarcode className="w-10 h-10" />
              </div>

              <h2 className="text-xl sm:text-2xl font-black text-slate-900 mb-2">
                Scan Barcode Produk
              </h2>
              <p className="text-slate-500 text-xs sm:text-sm max-w-xs leading-relaxed mb-6 font-medium">
                Pindai barcode garis atau angka SKU pada label harga baju untuk melihat harga resmi dan promo aktif.
              </p>

              {/* 2 Pilihan Scan Sesuai Engine Toko */}
              <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={() => setScanMode("barcode")}
                  className="w-full h-14 bg-blue-600 hover:bg-blue-700 active:scale-98 text-white font-black text-sm rounded-2xl shadow-lg shadow-blue-500/25 transition-all flex items-center justify-center gap-2.5"
                >
                  <ScanBarcode className="w-5 h-5 text-blue-200" />
                  Scan Barcode
                </button>

                <button
                  onClick={() => setScanMode("text")}
                  className="w-full h-14 bg-indigo-600 hover:bg-indigo-700 active:scale-98 text-white font-black text-sm rounded-2xl shadow-lg shadow-indigo-500/25 transition-all flex items-center justify-center gap-2.5"
                >
                  <ScanText className="w-5 h-5 text-indigo-200" />
                  Scan Teks SKU
                </button>
              </div>
            </div>

            {/* Alternatif: Input Manual */}
            <div className="w-full bg-white p-2.5 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-2">
              <div className="relative flex-1 flex items-center">
                <Search className="absolute left-3.5 w-5 h-5 text-slate-400" />
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Ketik SKU atau Barcode..."
                  className="w-full pl-11 pr-4 py-2.5 text-sm font-semibold text-slate-800 placeholder:text-slate-400 bg-transparent focus:outline-none"
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && searchProduct(manualInput)}
                />
                {manualInput && (
                  <button
                    onClick={() => setManualInput("")}
                    className="p-1 text-slate-400 hover:text-slate-600 mr-2"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <button
                onClick={() => searchProduct(manualInput)}
                disabled={!manualInput.trim() || loading}
                className="px-5 py-2.5 bg-slate-900 hover:bg-black text-white text-xs font-black rounded-xl transition-all disabled:opacity-40"
              >
                Cari
              </button>
            </div>

          </div>
        )}

        {/* 3. PRODUCT RESULT CARD (Hanya Artikel, Harga Real, Ukuran/Warna dari SKU yang Discan, TIDAK MENAMPILKAN STOK) */}
        {product && !loading && (() => {
          const { name, color, size } = parseProductInfo(product);

          return (
            <div className="w-full bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden animate-in slide-in-from-bottom-6 duration-300 flex flex-col">
              
              {/* Promo Header Banner */}
              {isOnPromo && (
                <div className="bg-gradient-to-r from-rose-600 via-red-600 to-amber-600 px-6 py-3.5 flex items-center justify-between text-white shadow-sm">
                  <div className="flex items-center gap-2">
                    <Tag className="w-4 h-4 fill-white" />
                    <span className="font-black tracking-wider text-xs uppercase">
                      {product.discountType || "PENAWARAN SPESIAL"}
                    </span>
                  </div>
                  <span className="text-[10px] font-black bg-white/20 px-2 py-0.5 rounded-full uppercase tracking-wider">
                    PROMO AKTIF
                  </span>
                </div>
              )}

              {/* Body Konten Produk */}
              <div className="p-6 sm:p-8 flex flex-col items-center text-center">
                
                {/* Brand / Departemen */}
                <div className="inline-block bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-[11px] font-black tracking-widest uppercase mb-3">
                  {product.brand || product.dept || "SUKO"}
                </div>

                {/* Nama Artikel Lengkap */}
                <h1 className="text-xl sm:text-2xl md:text-3xl font-black text-slate-900 leading-snug mb-4 max-w-md">
                  {name}
                </h1>

                {/* Detail Ukuran, Warna, dan SKU Khusus Barang yang Di-Scan (TIDAK ADA STOK & TIDAK ADA VARIAN LAIN) */}
                <div className="flex flex-wrap justify-center items-center gap-2 mb-6">
                  {size && (
                    <span className="bg-blue-50 text-blue-700 border border-blue-200/60 px-3.5 py-1 rounded-full text-xs font-black tracking-wide">
                      Ukuran: {size}
                    </span>
                  )}
                  {color && (
                    <span className="bg-slate-100 text-slate-700 border border-slate-200 px-3.5 py-1 rounded-full text-xs font-black tracking-wide">
                      Warna: {color}
                    </span>
                  )}
                  <span className="bg-slate-50 text-slate-500 font-mono px-3 py-1 rounded-full text-[11px] font-medium border border-slate-100">
                    SKU: {product.sku}
                  </span>
                </div>

                {/* Garis Pembatas */}
                <div className="w-full max-w-[200px] h-px bg-slate-100 mb-6"></div>

                {/* HARGA REAL */}
                <div className="flex flex-col items-center w-full">
                  <p className="text-[11px] font-black text-slate-400 tracking-widest uppercase mb-1">
                    HARGA RESMI
                  </p>

                  {isOnPromo ? (
                    <div className="flex flex-col items-center gap-1">
                      {/* Harga Normal Dicoret */}
                      <span className="text-lg sm:text-xl font-bold text-slate-400 line-through decoration-rose-500/60 decoration-2">
                        {formatRupiah(product.hargaNormal)}
                      </span>

                      {/* Harga Promo Besar */}
                      <span className="text-4xl sm:text-5xl md:text-6xl font-black text-rose-600 tracking-tight drop-shadow-xs">
                        {formatRupiah(product.hargaPromo!)}
                      </span>

                      {/* Badge Hemat */}
                      <span className="mt-3 inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 px-4 py-1.5 rounded-full text-xs font-black">
                        HEMAT {formatRupiah(product.hargaNormal - product.hargaPromo!)}
                      </span>
                    </div>
                  ) : (
                    <span className="text-4xl sm:text-5xl md:text-6xl font-black text-slate-900 tracking-tight drop-shadow-xs">
                      {formatRupiah(product.hargaNormal)}
                    </span>
                  )}
                </div>
              </div>

              {/* Action Footer: Tombol Scan Barang Lain */}
              <div className="bg-slate-50 p-4 sm:p-6 border-t border-slate-100 flex flex-col gap-2.5 items-center">
                <button
                  onClick={() => {
                    resetKiosk();
                    setScanMode("barcode");
                  }}
                  className="w-full h-13 bg-slate-900 hover:bg-black text-white font-black text-base rounded-2xl shadow-xl shadow-slate-900/10 active:scale-98 transition-all flex items-center justify-center gap-2.5"
                >
                  <Camera className="w-5 h-5 text-amber-300" />
                  Scan Barang Lain
                </button>
                <p className="text-[11px] text-slate-400 font-medium">
                  Layar otomatis kembali dalam {countdown} detik
                </p>
              </div>

            </div>
          );
        })()}

      </main>

      {/* 4. Full Screen Scanner Views (Sesuai Engine Asli Toko di page.tsx yang Sudah Bekerja) */}
      {scanMode !== "none" && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col animate-in fade-in zoom-in-95 duration-300">
          
          {/* Header Scanner dengan Switcher Barcode / Teks SKU */}
          <div className="flex justify-between items-center px-4 py-3 bg-slate-900/90 backdrop-blur-md text-white shadow-md z-10 border-b border-slate-800">
            <div className="flex items-center gap-1.5 bg-slate-800 p-1 rounded-xl">
              <button
                onClick={() => setScanMode("barcode")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  scanMode === "barcode"
                    ? "bg-blue-600 text-white shadow"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <ScanBarcode className="w-4 h-4" />
                Scan Barcode
              </button>
              <button
                onClick={() => setScanMode("text")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  scanMode === "text"
                    ? "bg-indigo-600 text-white shadow"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <ScanText className="w-4 h-4" />
                Scan Teks SKU
              </button>
            </div>

            <button
              onClick={() => setScanMode("none")}
              className="p-2 bg-slate-800 hover:bg-slate-700 rounded-full transition-colors active:scale-95 text-white"
              aria-label="Tutup Scanner"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body Kamera Scanner */}
          <div className="flex-1 relative overflow-hidden bg-black flex items-center justify-center p-4">
            {scanMode === "barcode" ? (
              <div className="w-full h-full max-w-2xl mx-auto flex flex-col justify-center px-4 relative">
                <Scanner onScanSuccess={handleBarcodeSuccess} />
                <p className="text-center text-xs sm:text-sm font-bold text-slate-300 mt-6 absolute bottom-12 w-full left-0 pointer-events-none drop-shadow">
                  Arahkan kamera ke barcode garis
                </p>
              </div>
            ) : (
              <div className="w-full h-full max-w-2xl mx-auto flex flex-col justify-center px-4">
                <TextScanner onScanResult={handleTextScanSuccess} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. Kiosk Bottom Footer */}
      <footer className="w-full max-w-xl text-center text-xs text-slate-400 font-medium pt-4 pb-safe flex flex-col items-center gap-1.5">
        <p className="text-[11px]">SUKO Self-Service Price Checker • Mode Publik</p>
        <Link
          href="/login"
          className="text-[11px] text-slate-400 hover:text-slate-700 underline transition-colors"
        >
          Portal Karyawan / Login Staff 🔒
        </Link>
      </footer>
    </div>
  );
}
