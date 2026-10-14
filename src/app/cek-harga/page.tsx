"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Search, X, Camera, ScanBarcode, Tag, Sparkles, AlertCircle, RefreshCw } from "lucide-react";
import { ChipLoader } from "@/components/ChipLoader";

const Scanner = dynamic(() => import("@/components/Scanner"), { ssr: false });

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

// Parse deskripsi produk untuk ekstraksi nama, warna, dan ukuran spesifik item
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

// Audio beep feedback saat barcode berhasil di-scan
const playScanBeep = () => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
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
  } catch (e) {
    // ignore
  }
};

export default function CekHargaPage() {
  const [manualInput, setManualInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [product, setProduct] = useState<ProductData | null>(null);
  const [error, setError] = useState("");
  const [cameraError, setCameraError] = useState("");
  const [countdown, setCountdown] = useState(25);
  const inputRef = useRef<HTMLInputElement>(null);

  // Timer auto-reset kembali ke mode scanner
  const resetKiosk = useCallback(() => {
    setProduct(null);
    setManualInput("");
    setError("");
    setCameraError("");
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

  // Eksekusi pencarian produk via API
  const searchProduct = async (identifier: string) => {
    const trimmed = identifier.trim();
    if (!trimmed) return;

    setLoading(true);
    setError("");
    setProduct(null);

    try {
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
        } else {
          setError("Produk tidak ditemukan. Pastikan barcode yang discan sudah benar.");
        }
      } else {
        setError(data.error || "Produk tidak ditemukan.");
      }
    } catch {
      setError("Gagal terhubung ke server. Periksa koneksi internet.");
    } finally {
      setLoading(false);
      setManualInput("");
    }
  };

  const handleBarcodeSuccess = (result: string) => {
    if (loading) return;
    searchProduct(result);
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
  }, []);

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
            <h3 className="text-xl font-black text-slate-800 mb-2">Barcode Tidak Ditemukan</h3>
            <p className="text-slate-500 text-sm max-w-xs leading-relaxed mb-6 font-medium">
              {error}
            </p>
            <button
              onClick={resetKiosk}
              className="w-full h-12 bg-slate-900 hover:bg-black text-white font-black text-sm rounded-2xl shadow-lg transition-all active:scale-98 flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Scan Ulang
            </button>
          </div>
        )}

        {/* CAMERA SCANNER VIEW (Langsung aktif jika belum ada produk yang di-scan) */}
        {!product && !loading && !error && (
          <div className="w-full flex flex-col items-center gap-4 animate-in fade-in duration-300">
            
            {/* Viewfinder Card */}
            <div className="w-full bg-slate-950 p-3 sm:p-4 rounded-3xl shadow-2xl border border-slate-800 flex flex-col items-center relative overflow-hidden">
              
              {/* Petunjuk Arah */}
              <div className="w-full text-center pb-3 flex items-center justify-center gap-2 text-slate-300 text-xs font-bold tracking-wide">
                <ScanBarcode className="w-4 h-4 text-blue-400" />
                Arahkan barcode label pakaian ke kamera
              </div>

              {/* Kamera Scanner Viewport */}
              <div className="w-full aspect-square max-w-[340px] rounded-2xl overflow-hidden relative bg-black flex items-center justify-center border-2 border-slate-700/60 shadow-inner">
                <Scanner
                  onScanSuccess={handleBarcodeSuccess}
                  onScanError={(err) => setCameraError(err)}
                />

                {/* Laser Guide Garis Merah */}
                <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 pointer-events-none flex flex-col items-center">
                  <div className="w-full h-0.5 bg-rose-500 shadow-[0_0_12px_#f43f5e] animate-pulse"></div>
                </div>

                {/* Corner Frame Accents */}
                <div className="absolute top-3 left-3 w-6 h-6 border-t-2 border-l-2 border-white pointer-events-none"></div>
                <div className="absolute top-3 right-3 w-6 h-6 border-t-2 border-r-2 border-white pointer-events-none"></div>
                <div className="absolute bottom-3 left-3 w-6 h-6 border-b-2 border-l-2 border-white pointer-events-none"></div>
                <div className="absolute bottom-3 right-3 w-6 h-6 border-b-2 border-r-2 border-white pointer-events-none"></div>
              </div>

              {cameraError && (
                <p className="text-[11px] text-amber-400 mt-2 text-center px-4">
                  {cameraError}
                </p>
              )}
            </div>

            {/* Input Manual Fallback */}
            <div className="w-full bg-white p-2 sm:p-2.5 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-2">
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

        {/* 3. PRODUCT RESULT CARD (Hanya Artikel, Harga Real, Ukuran/Warna dari SKU yang Discan) */}
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

                {/* Detail Ukuran, Warna, dan SKU Khusus Barang yang Di-Scan */}
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
                  onClick={resetKiosk}
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

      {/* 4. Kiosk Bottom Footer */}
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
