"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { Tag, Sparkles, AlertCircle, Camera, RefreshCw, Zap, CheckCircle2 } from "lucide-react";
import { DetectedSku } from "@/components/TextScanner";

// Engine TextScanner — scan teks SKU 8 digit
const TextScanner = dynamic(() => import("@/components/TextScanner"), { ssr: false });

type ProductData = {
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

function parseProductInfo(product: ProductData) {
  const parts = (product.description || "").split(":");
  const name = product.article || parts[0]?.trim() || product.description;
  let color = product.color || (parts.length > 1 ? parts[1].trim() : "");
  let size = product.size || (parts.length > 2 ? parts[2].trim() : "");
  if (["F", "M", "SOLID"].includes(color.toUpperCase())) color = "";
  if (size.toUpperCase() === "SOLID") size = "";
  return { name, color, size };
}

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
  } catch { /* ignore */ }
};

export default function CekHargaPage() {
  // Setup database offline lokal di awal
  const [dbState, setDbState] = useState<"checking" | "syncing" | "ready">("checking");
  const [syncProgress, setSyncProgress] = useState(0);

  // Status tampilan
  const [isScanning, setIsScanning] = useState(true);
  const [loading, setLoading] = useState(false);
  const [searchingFor, setSearchingFor] = useState("");
  const [product, setProduct] = useState<ProductData | null>(null);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(25);

  // In-memory session cache — scan ulang produk yang sama = instan (0ms)
  const sessionCache = useRef<Map<string, ProductData>>(new Map());

  // Inisialisasi Database Offline di awal kunjungan (Download Cache 180 KB)
  useEffect(() => {
    let isMounted = true;

    const initDb = async () => {
      try {
        const { db, syncOfflineDatabase, checkIfUpdateAvailable } = await import("@/lib/offlineDb");
        const count = await db.products.count();

        // 1. Jika pertama kali buka dan DB lokal masih kosong (< 500 produk):
        // Tampilkan loading sync cepat (~0.5 - 1 detik untuk unduh 180 KB)
        if (count < 500) {
          if (isMounted) setDbState("syncing");
          await syncOfflineDatabase((syncing, prog) => {
            if (isMounted && prog !== undefined) setSyncProgress(prog);
          }, true);
        } else {
          // Jika sudah ada data di HP, langsung siap tanpa tunggu!
          if (isMounted) setDbState("ready");

          // Di background, cek jika ada update harga di database server
          const hasUpdate = await checkIfUpdateAvailable();
          if (hasUpdate) {
            console.log("[CekHarga] Update database harga terdeteksi, sync di background...");
            await syncOfflineDatabase(undefined, true);
            sessionCache.current.clear();
          }
        }

        if (isMounted) setDbState("ready");
      } catch (e) {
        console.error("Init DB Error:", e);
        if (isMounted) setDbState("ready"); // Tetap buka scanner walau sync gagal (fallback ke API)
      }
    };

    initDb();

    // 2. Auto-cek update berkala setiap 2 menit & saat tab aktif kembali
    const checkUpdateInterval = setInterval(async () => {
      try {
        const { checkIfUpdateAvailable, syncOfflineDatabase } = await import("@/lib/offlineDb");
        const hasUpdate = await checkIfUpdateAvailable();
        if (hasUpdate) {
          console.log("[CekHarga] Background sync harga terbaru...");
          await syncOfflineDatabase(undefined, true);
          sessionCache.current.clear();
        }
      } catch (e) {
        /* ignore */
      }
    }, 120000);

    const handleVisibility = async () => {
      if (document.visibilityState === "visible") {
        try {
          const { checkIfUpdateAvailable, syncOfflineDatabase } = await import("@/lib/offlineDb");
          const hasUpdate = await checkIfUpdateAvailable();
          if (hasUpdate) {
            await syncOfflineDatabase(undefined, true);
            sessionCache.current.clear();
          }
        } catch (e) {
          /* ignore */
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      isMounted = false;
      clearInterval(checkUpdateInterval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  // Kembali ke mode scan
  const resetKiosk = useCallback(() => {
    setProduct(null);
    setError("");
    setIsScanning(true);
    setCountdown(25);
  }, []);

  // Countdown auto-reset setelah produk tampil
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

  // Pencarian Produk: Offline First (0ms) -> Fallback ke Server API
  const searchProduct = async (identifier: string) => {
    const trimmed = identifier.trim();
    if (!trimmed) return;

    const cacheKey = trimmed.toLowerCase();

    // 1. Cek in-memory cache sesi ini (Instan 0ms)
    const cached = sessionCache.current.get(cacheKey);
    if (cached) {
      playScanBeep();
      setProduct(cached);
      setError("");
      setIsScanning(false);
      setLoading(false);
      return;
    }

    // 2. OFFLINE-FIRST: Cek database lokal di HP (Dexie IndexedDB) — Kecepatan 5ms!
    try {
      const { db } = await import("@/lib/offlineDb");
      let foundLocal = await db.products.where("sku").equals(trimmed).first();
      if (!foundLocal) {
        foundLocal = await db.products.where("barcode").equals(trimmed).first();
      }

      if (foundLocal) {
        const prodData: ProductData = {
          sku: foundLocal.sku,
          barcode: foundLocal.barcode || null,
          article: foundLocal.name,
          description: [foundLocal.name, foundLocal.color, foundLocal.size].filter(Boolean).join(" : "),
          hargaNormal: foundLocal.hargaNormal,
          hargaPromo: foundLocal.hargaPromo,
          diskon: foundLocal.diskon,
          discountType: foundLocal.discountType || null,
          brand: foundLocal.brand || null,
          dept: foundLocal.dept || null,
          color: foundLocal.color || null,
          size: foundLocal.size || null,
          toDate: foundLocal.toDate || null,
        };

        playScanBeep();
        sessionCache.current.set(cacheKey, prodData);
        sessionCache.current.set(foundLocal.sku.toLowerCase(), prodData);
        if (foundLocal.barcode) sessionCache.current.set(foundLocal.barcode.toLowerCase(), prodData);

        setProduct(prodData);
        setError("");
        setIsScanning(false);
        setLoading(false);
        return;
      }
    } catch (e) {
      console.warn("Offline search error:", e);
    }

    // 3. Fallback jika SKU belum ada di cache HP (baru ditambahkan beberapa menit lalu)
    setLoading(true);
    setSearchingFor(trimmed);
    setIsScanning(false);

    try {
      const res = await fetch(`/api/product/${encodeURIComponent(trimmed)}?page=1`, {
        cache: "no-store",
      });
      const data = await res.json();

      if (res.ok) {
        let found: ProductData | null = null;
        if (Array.isArray(data.data) && data.data.length > 0) found = data.data[0];
        else if (data.data && !Array.isArray(data.data)) found = data.data;

        if (found) {
          playScanBeep();
          sessionCache.current.set(cacheKey, found);
          sessionCache.current.set(found.sku.toLowerCase(), found);
          if (found.barcode) sessionCache.current.set(found.barcode.toLowerCase(), found);
          setProduct(found);
        } else {
          setError("SKU tidak ditemukan. Coba arahkan ulang ke angka SKU pada label.");
        }
      } else {
        setError(data.error || "Produk tidak ditemukan.");
      }
    } catch {
      setError("Gagal terhubung ke server. Periksa koneksi internet.");
    } finally {
      setLoading(false);
      setSearchingFor("");
    }
  };

  // Handler TextScanner — dipanggil otomatis begitu SKU 8 digit terdeteksi
  const handleTextScanSuccess = (sku: string, _detected: DetectedSku) => {
    if (sku) searchProduct(sku);
  };

  // Auto-search dari URL params (?sku= / ?barcode= / ?q=)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const query = params.get("barcode") || params.get("sku") || params.get("q");
      if (query) {
        setIsScanning(false);
        searchProduct(query);
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Promo expired check
  let isPromoExpired = false;
  if (product?.toDate) {
    const d = new Date(product.toDate);
    if (!isNaN(d.getTime())) {
      d.setHours(23, 59, 59, 999);
      if (new Date() > d) isPromoExpired = true;
    }
  }
  const isOnPromo =
    product &&
    product.hargaPromo &&
    product.hargaPromo > 0 &&
    product.hargaPromo !== product.hargaNormal &&
    !isPromoExpired;

  // ── SCREEN 1: DOWNLOAD CACHE DI AWAL (HANYA MUNCUL DI KUNJUNGAN PERTAMA ~0.5 DETIK) ──
  if (dbState === "syncing") {
    return (
      <div className="fixed inset-0 z-[200] bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center select-none">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/30 mb-6 animate-pulse">
          <Zap className="w-8 h-8 text-white" />
        </div>
        <img src="/suko-logo.png" alt="SUKO" className="h-10 object-contain mb-4 filter invert opacity-90" />
        <h2 className="text-xl font-black text-white tracking-tight mb-2">Menyiapkan Pemindai Cepat</h2>
        <p className="text-slate-400 text-xs max-w-xs mb-6 font-medium">
          Mengunduh katalog database harga resmi toko agar pemindaian selanjutnya instan 0 detik.
        </p>

        {/* Progress Bar */}
        <div className="w-full max-w-xs bg-slate-800 rounded-full h-2.5 overflow-hidden p-0.5 border border-slate-700/60 mb-3">
          <div
            className="bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-400 h-full rounded-full transition-all duration-200"
            style={{ width: `${Math.max(syncProgress, 5)}%` }}
          />
        </div>
        <div className="flex items-center justify-between w-full max-w-xs text-[11px] text-slate-400 font-mono">
          <span>Ukuran data: ~180 KB</span>
          <span className="font-bold text-white">{syncProgress}%</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-black flex flex-col font-sans">
      {/* ── SCANNING VIEW (Full Screen TextScanner) ── */}
      {isScanning && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col">
          {/* Header bersih — TANPA tombol login staff */}
          <div className="flex justify-between items-center px-4 py-3 bg-slate-900/90 backdrop-blur-md text-white z-10">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span className="font-black text-sm tracking-wide">CEK HARGA • Scan Teks SKU</span>
            </div>
            {/* Status Kecepatan Offline 0ms */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-bold text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Mode Cepat 0ms
            </div>
          </div>

          {/* TextScanner full height */}
          <div className="flex-1 overflow-hidden">
            <TextScanner onScanResult={handleTextScanSuccess} />
          </div>
        </div>
      )}

      {/* ── LOADING VIEW (Hanya jika perlu fallback ke API server) ── */}
      {!isScanning && loading && (
        <div className="fixed inset-0 z-[90] bg-gradient-to-b from-slate-50 to-slate-100 flex flex-col items-center justify-center p-6">
          <img src="/suko-logo.png" alt="SUKO" className="h-10 object-contain mb-8 opacity-60" />
          <div className="w-16 h-16 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin mb-6" />
          <p className="text-slate-700 font-black text-lg">MEMERIKSA HARGA...</p>
          {searchingFor && (
            <div className="mt-3 bg-white border border-slate-200 px-5 py-2.5 rounded-xl shadow-sm">
              <span className="font-mono text-base font-bold text-slate-800 tracking-widest">{searchingFor}</span>
            </div>
          )}
        </div>
      )}

      {/* ── ERROR VIEW ── */}
      {!isScanning && !loading && error && (
        <div className="fixed inset-0 z-[90] bg-gradient-to-b from-slate-50 to-slate-100 flex flex-col items-center justify-center p-6">
          <div className="w-full max-w-sm bg-white rounded-3xl p-8 shadow-2xl border border-rose-100 text-center flex flex-col items-center">
            <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mb-4">
              <AlertCircle className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-black text-slate-800 mb-2">SKU Tidak Ditemukan</h3>
            <p className="text-slate-500 text-sm leading-relaxed mb-6 font-medium">{error}</p>
            <button
              onClick={resetKiosk}
              className="w-full h-12 bg-slate-900 hover:bg-black text-white font-black text-sm rounded-2xl shadow-lg transition-all active:scale-98 flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Scan Ulang
            </button>
          </div>
        </div>
      )}

      {/* ── PRODUCT RESULT VIEW (Tampil Instan 0 Detik dari Cache) ── */}
      {!isScanning &&
        !loading &&
        product &&
        (() => {
          const { name, color, size } = parseProductInfo(product);
          return (
            <div className="fixed inset-0 z-[90] bg-gradient-to-b from-slate-50 via-white to-slate-100 flex flex-col items-center justify-between p-4 sm:p-6 overflow-y-auto">
              {/* Logo & Judul Toko */}
              <header className="w-full max-w-lg text-center pt-2 mb-4 flex flex-col items-center">
                <img src="/suko-logo.png" alt="SUKO" className="h-10 sm:h-12 object-contain drop-shadow-xs mb-2" />
                <div className="inline-flex items-center gap-1.5 bg-slate-900 text-white px-3.5 py-1 rounded-full text-[11px] font-black tracking-widest uppercase">
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  Cek Harga Resmi Toko
                </div>
              </header>

              {/* Kartu produk */}
              <main className="w-full max-w-lg flex-1 flex flex-col justify-center">
                <div className="w-full bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden animate-in slide-in-from-bottom-6 duration-300 flex flex-col">
                  {isOnPromo && (
                    <div className="bg-gradient-to-r from-rose-600 via-red-600 to-amber-600 px-6 py-3.5 flex items-center justify-between text-white">
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

                  <div className="p-6 sm:p-8 flex flex-col items-center text-center">
                    <div className="inline-block bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-[11px] font-black tracking-widest uppercase mb-3">
                      {product.brand || product.dept || "SUKO"}
                    </div>
                    <h1 className="text-xl sm:text-2xl md:text-3xl font-black text-slate-900 leading-snug mb-4 max-w-md">
                      {name}
                    </h1>

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
                      <span className="bg-slate-50 text-slate-500 font-mono px-3 py-1 rounded-full text-[11px] border border-slate-100">
                        SKU: {product.sku}
                      </span>
                    </div>

                    <div className="w-full max-w-[200px] h-px bg-slate-100 mb-6" />

                    <div className="flex flex-col items-center w-full">
                      <p className="text-[11px] font-black text-slate-400 tracking-widest uppercase mb-1">
                        HARGA RESMI
                      </p>

                      {isOnPromo ? (
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-lg sm:text-xl font-bold text-slate-400 line-through decoration-rose-500/60 decoration-2">
                            {formatRupiah(product.hargaNormal)}
                          </span>
                          <span className="text-4xl sm:text-5xl md:text-6xl font-black text-rose-600 tracking-tight">
                            {formatRupiah(product.hargaPromo!)}
                          </span>
                          <span className="mt-3 inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 px-4 py-1.5 rounded-full text-xs font-black">
                            HEMAT {formatRupiah(product.hargaNormal - product.hargaPromo!)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-4xl sm:text-5xl md:text-6xl font-black text-slate-900 tracking-tight">
                          {formatRupiah(product.hargaNormal)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Footer tombol scan barang lain */}
                  <div className="bg-slate-50 p-4 sm:p-6 border-t border-slate-100 flex flex-col gap-2.5 items-center">
                    <button
                      onClick={resetKiosk}
                      className="w-full h-13 bg-slate-900 hover:bg-black text-white font-black text-base rounded-2xl shadow-xl transition-all active:scale-98 flex items-center justify-center gap-2.5"
                    >
                      <Camera className="w-5 h-5 text-amber-300" />
                      Scan Barang Lain
                    </button>
                    <p className="text-[11px] text-slate-400 font-medium">
                      Layar otomatis kembali dalam {countdown} detik
                    </p>
                  </div>
                </div>
              </main>

              {/* Footer Bersih */}
              <footer className="w-full max-w-lg text-center pt-4 pb-safe">
                <span className="text-[11px] text-slate-400 font-medium">
                  SUKO Price Checker • Informasi Harga Akurat & Terkini
                </span>
              </footer>
            </div>
          );
        })()}
    </div>
  );
}
