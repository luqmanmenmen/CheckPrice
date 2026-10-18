"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { Tag, Sparkles, AlertCircle, Camera, RefreshCw, Zap, Gift, Percent } from "lucide-react";
import ProductImageSlider from "@/components/ProductImageSlider";

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
  acara?: string | null;
  brand?: string | null;
  dept?: string | null;
  color?: string | null;
  size?: string | null;
  toDate?: string | null;
  imageUrl?: string | null;
  images?: string[];
};

function formatRupiah(angka: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(angka);
}

// Bersihkan nama produk dari artikel & format internal (BUKAN artikel yang jadi judul)
function parseProductInfo(product: ProductData) {
  const rawDesc = product.description || "";
  const parts = rawDesc.split(":");
  let name = parts[0]?.trim() || rawDesc || "Produk";

  // Ambil kode artikel untuk dihapus dari teks deskripsi produk
  const rawArticle = (product.article || "").trim();
  if (rawArticle) {
    const artWords = rawArticle.split(/\s+/);
    const codesToRemove: string[] = [];
    if (artWords.length <= 2) codesToRemove.push(rawArticle);
    if (artWords.length > 1) codesToRemove.push(artWords[artWords.length - 1]);

    const descWords = name.split(/\s+/);
    const lastDescWord = descWords[descWords.length - 1];
    if (
      lastDescWord &&
      /^[A-Z0-9\-_]{3,12}$/i.test(lastDescWord) &&
      rawArticle.toLowerCase().includes(lastDescWord.toLowerCase())
    ) {
      codesToRemove.push(lastDescWord);
    }

    for (const code of Array.from(new Set(codesToRemove))) {
      if (!code || code.length < 2) continue;
      const esc = code.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
      name = name.replace(new RegExp(`[\\s\\-_/]+${esc}$`, "i"), "");
      name = name.replace(new RegExp(`\\b${esc}\\b`, "i"), "");
    }

    // Bersihkan spasi berlebih dan tanda hubung di ujung
    name = name.replace(/\s{2,}/g, " ").replace(/[\s\-_/]+$/, "").trim();
  }

  let color = product.color || (parts.length > 1 ? parts[1].trim() : "");
  let size = product.size || (parts.length > 2 ? parts[2].trim() : "");
  if (["F", "M", "SOLID"].includes(color.toUpperCase())) color = "";
  if (size.toUpperCase() === "SOLID") size = "";
  return { name: name || parts[0]?.trim() || rawDesc, color, size };
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
  const [siblings, setSiblings] = useState<ProductData[]>([]);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(25);

  // In-memory session cache — scan ulang produk yang sama = instan (0ms)
  const sessionCache = useRef<Map<string, ProductData>>(new Map());

  // Inisialisasi Database Offline di awal kunjungan
  useEffect(() => {
    let isMounted = true;

    const initDb = async () => {
      try {
        const { db, syncOfflineDatabase, checkIfUpdateAvailable, ensureDbOpenSafe } = await import("@/lib/offlineDb");
        await ensureDbOpenSafe();
        const count = await db.products.count().catch(() => 0);
        const localSchema = typeof window !== "undefined" ? localStorage.getItem("suko_db_schema_version") : null;

        // 1. Jika pertama kali buka atau skema belum v10:
        if (count < 500 || localSchema !== "v10") {
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
        if (isMounted) setDbState("ready");
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

    let lastVisibilityCheck = Date.now();
    const handleVisibility = async () => {
      if (document.visibilityState === "visible") {
        // Cooldown 60 detik agar tidak membebani network/CPU saat sering buka/tutup minimize
        if (Date.now() - lastVisibilityCheck < 60000) return;
        lastVisibilityCheck = Date.now();
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
    setSiblings([]);
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
          article: foundLocal.article || null,
          description: foundLocal.description || foundLocal.name,
          hargaNormal: foundLocal.hargaNormal,
          hargaPromo: foundLocal.hargaPromo,
          diskon: foundLocal.diskon,
          discountType: foundLocal.discountType || null,
          acara: foundLocal.acara || null,
          brand: foundLocal.brand || null,
          dept: foundLocal.dept || null,
          color: foundLocal.color || null,
          size: foundLocal.size || null,
          toDate: foundLocal.toDate || null,
          imageUrl: foundLocal.imageUrl || null,
          images: foundLocal.images && foundLocal.images.length > 0 ? foundLocal.images : (foundLocal.imageUrl ? [foundLocal.imageUrl] : []),
        };

        let sibs: ProductData[] = [prodData];
        if (foundLocal.article) {
          const localSibs = await db.products.where("article").equals(foundLocal.article).toArray();
          if (localSibs && localSibs.length > 0) {
            sibs = localSibs.map(s => ({
              sku: s.sku,
              barcode: s.barcode || null,
              article: s.article || null,
              description: s.description || s.name,
              hargaNormal: s.hargaNormal,
              hargaPromo: s.hargaPromo,
              diskon: s.diskon,
              discountType: s.discountType || null,
              acara: s.acara || null,
              brand: s.brand || null,
              dept: s.dept || null,
              color: s.color || null,
              size: s.size || null,
              toDate: s.toDate || null,
              imageUrl: s.imageUrl || null,
              images: s.images && s.images.length > 0 ? s.images : (s.imageUrl ? [s.imageUrl] : []),
            }));
          }
        }

        playScanBeep();
        sessionCache.current.set(cacheKey, prodData);
        sessionCache.current.set(foundLocal.sku.toLowerCase(), prodData);
        if (foundLocal.barcode) sessionCache.current.set(foundLocal.barcode.toLowerCase(), prodData);

        setProduct(prodData);
        setSiblings(sibs);
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
          setSiblings(data.siblings || [found]);
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

  // Pilih warna varian lain dari artikel yang sama
  const handleSelectColor = (targetSku: string) => {
    const target = siblings.find(s => s.sku === targetSku);
    if (target) {
      setProduct(target);
      return;
    }
    searchProduct(targetSku);
  };

  // Handler TextScanner — dipanggil otomatis begitu SKU 8 digit terdeteksi
  const handleTextScanSuccess = (sku: string) => {
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

  // ── DETEKSI PROMO LENGKAP: BOGO, BXGY, DISKON 60%, HARGA SPESIAL FLAT ──
  let isPromoExpired = false;
  if (product?.toDate) {
    const d = new Date(product.toDate);
    if (!isNaN(d.getTime())) {
      d.setHours(23, 59, 59, 999);
      if (new Date() > d) isPromoExpired = true;
    }
  }

  // 1. Promo Flat Price (misal Rp 99.000)
  const hasHargaPromo = Boolean(
    product &&
    product.hargaPromo &&
    product.hargaPromo > 0 &&
    product.hargaPromo !== product.hargaNormal &&
    !isPromoExpired
  );

  // 2. Promo BOGO / BXGY / Beli X Gratis Y (misal: "BELI 2 GRATIS 1", "BELI 1 GRATIS 1", "B2G1", "B1G1", "BXGY")
  const isBogoPromo = Boolean(
    product &&
    !isPromoExpired &&
    ((product.discountType && (/B\dG\d|B\dD\d+|B\dX\d+/i.test(product.discountType) || /BELI \d+ (GRATIS|DISKON)/i.test(product.discountType) || /BOGO|BXGY/i.test(product.discountType))) ||
     (product.diskon && (/B\dG\d|B\dD\d+|B\dX\d+/i.test(product.diskon) || /BOGO|BXGY/i.test(product.diskon))))
  );

  // 3. Promo Diskon Persentase (misal: "BELI 1 DISKON 60%", "DISKON 60%", "60%", "50%")
  const isPercentPromo = Boolean(
    product &&
    !isPromoExpired &&
    ((product.discountType && (product.discountType.includes("%") || /DISKON \d+%/i.test(product.discountType))) ||
     (product.diskon && (product.diskon.includes("%") || /DISKON \d+%/i.test(product.diskon))))
  );

  // 4. Promo Tipe Khusus Lainnya (HARGA SPESIAL, SPECIAL PRICE, dsb)
  const hasSpecialDiscountType = Boolean(
    product &&
    !isPromoExpired &&
    product.discountType &&
    !/NORMAL/i.test(product.discountType) &&
    product.discountType.trim() !== ""
  );

  // Total status promo aktif
  const isOnPromo = (hasHargaPromo || isBogoPromo || isPercentPromo || hasSpecialDiscountType) && !isPromoExpired;

  // Hitung persentase diskon untuk badge
  let discountPct = 0;
  if (hasHargaPromo && product) {
    discountPct = Math.round(((product.hargaNormal - product.hargaPromo!) / product.hargaNormal) * 100);
  } else if (isPercentPromo && product) {
    const textToCheck = `${product.discountType || ""} ${product.diskon || ""}`;
    const match = textToCheck.match(/\b(\d+)%\b/);
    if (match) discountPct = parseInt(match[1], 10);
  }

  // Label promo utama
  const promoTitle =
    product?.discountType ||
    (isBogoPromo
      ? "PROMO BOGO / BELI X GRATIS Y"
      : isPercentPromo
      ? `PROMO DISKON ${discountPct}%`
      : "PENAWARAN SPESIAL TOKO");

  // ── SCREEN 1: PREPARATION LOADING (HANYA MUNCUL DI KUNJUNGAN PERTAMA ~0.5 DETIK) ──
  if (dbState === "syncing") {
    return (
      <div className="fixed inset-0 z-[200] bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center select-none">
        <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-6 shadow-2xl backdrop-blur-md">
          <div className="w-8 h-8 border-3 border-white/20 border-t-amber-400 rounded-full animate-spin" />
        </div>
        <img src="/suko-logo.png" alt="SUKO" className="h-10 object-contain mb-4 filter invert opacity-90" />
        <h2 className="text-xl font-black text-white tracking-tight mb-1.5">Menyiapkan Pemindai...</h2>
        <p className="text-slate-400 text-xs max-w-xs mb-6 font-medium">
          Memuat sistem pemindai harga resmi toko
        </p>

        {/* Progress Bar Halus */}
        <div className="w-full max-w-[200px] bg-slate-800/80 rounded-full h-1.5 overflow-hidden border border-slate-700/40">
          <div
            className="bg-gradient-to-r from-blue-500 via-indigo-500 to-amber-400 h-full rounded-full transition-all duration-200"
            style={{ width: `${Math.max(syncProgress, 10)}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-black flex flex-col font-sans">
      {/* ── SCANNING VIEW (Full Screen TextScanner SKU 8 Digit) ── */}
      {isScanning && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col">
          {/* Header bersih */}
          <div className="flex justify-between items-center px-4 py-3 bg-slate-900/90 backdrop-blur-md text-white z-10 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span className="font-black text-sm tracking-wide">CEK HARGA • Scan SKU</span>
            </div>
            {/* Status Kecepatan Offline 0ms */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-bold text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Mode Cepat 0ms
            </div>
          </div>

          {/* TextScanner full height — Murni Scan Teks SKU 8 Digit */}
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

          // Kode artikel bersih untuk badge samping SKU
          let articleDisplay = product.article ? product.article.trim() : "";
          if (articleDisplay) {
            const artWords = articleDisplay.split(/\s+/);
            if (artWords.length > 3) {
              articleDisplay = artWords[artWords.length - 1];
            }
          }

          // Ekstrak varian warna unik dari artikel ini (seperti katalog Matahari)
          const availableColors: { color: string; sku: string; isActive: boolean }[] = [];
          const seen = new Set<string>();
          const currentColorUpper = (color || "").toUpperCase();

          if (color) {
            seen.add(currentColorUpper);
            availableColors.push({ color, sku: product.sku, isActive: true });
          }

          siblings.forEach((s) => {
            const { color: sColor } = parseProductInfo(s);
            const col = (sColor || s.color || "").trim();
            if (col && !seen.has(col.toUpperCase())) {
              seen.add(col.toUpperCase());
              availableColors.push({ color: col, sku: s.sku, isActive: false });
            }
          });

          return (
            <div className="fixed inset-0 z-[90] bg-gradient-to-b from-slate-50 via-white to-slate-100 flex flex-col items-center justify-between p-4 sm:p-6 overflow-y-auto">
              {/* Logo & Judul Toko */}
              <header className="w-full max-w-lg text-center pt-2 mb-3 flex flex-col items-center shrink-0">
                <img src="/suko-logo.png" alt="SUKO" className="h-10 sm:h-11 object-contain drop-shadow-xs mb-1.5" />
                <div className="inline-flex items-center gap-1.5 bg-slate-900 text-white px-3.5 py-1 rounded-full text-[11px] font-black tracking-widest uppercase">
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  Cek Harga Resmi Toko
                </div>
              </header>

              {/* Main Content: BOX ATAS (HARGA) & BOX BAWAH (IMAGE) */}
              <main className="w-full max-w-lg flex-1 flex flex-col justify-start gap-4 pb-8">
                {/* ── 📦 1. BOX ATAS: KETERANGAN PRODUK & HARGA ── */}
                <div className="w-full bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden animate-in slide-in-from-bottom-4 duration-300 flex flex-col">
                  {/* Banner Promo Header */}
                  {isOnPromo && (
                    <div
                      className={`px-5 py-3 flex items-center justify-between text-white ${
                        isBogoPromo || isPercentPromo
                          ? "bg-gradient-to-r from-purple-600 via-indigo-600 to-rose-600"
                          : "bg-gradient-to-r from-rose-600 via-red-600 to-amber-600"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {isBogoPromo ? (
                          <Gift className="w-4 h-4 text-amber-300 shrink-0" />
                        ) : isPercentPromo ? (
                          <Percent className="w-4 h-4 text-amber-300 shrink-0" />
                        ) : (
                          <Tag className="w-4 h-4 fill-white shrink-0" />
                        )}
                        <span className="font-black tracking-wider text-xs sm:text-sm uppercase line-clamp-1">
                          {promoTitle}
                        </span>
                      </div>
                      <span className="text-[10px] sm:text-xs font-black bg-white/20 backdrop-blur-sm px-2.5 py-1 rounded-full uppercase tracking-wider shrink-0 ml-2">
                        {hasHargaPromo
                          ? `HEMAT ${formatRupiah(product.hargaNormal - product.hargaPromo!)}`
                          : "PROMO AKTIF"}
                      </span>
                    </div>
                  )}

                  <div className="p-5 sm:p-7 flex flex-col items-center text-center">
                    <div className="inline-block bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-[11px] font-black tracking-widest uppercase mb-2">
                      {product.brand || product.dept || "SUKO"}
                    </div>

                    {/* Judul Produk */}
                    <h1 className="text-xl sm:text-2xl font-black text-slate-900 leading-snug mb-3 max-w-md">
                      {name}
                    </h1>

                    {/* Badges: Ukuran, Warna, Artikel, dan SKU */}
                    <div className="flex flex-wrap justify-center items-center gap-2 mb-5">
                      {color && (
                        <span className="bg-indigo-50 text-indigo-800 border border-indigo-200/80 px-3 py-1 rounded-full text-xs font-black tracking-wide flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-indigo-600" />
                          Warna: {color}
                        </span>
                      )}
                      {size && (
                        <span className="bg-blue-50 text-blue-700 border border-blue-200/60 px-3 py-1 rounded-full text-xs font-black tracking-wide">
                          Ukuran: {size}
                        </span>
                      )}
                      {articleDisplay && (
                        <span className="bg-amber-50 text-amber-800 border border-amber-200/80 font-mono px-3 py-1 rounded-full text-[11px] font-bold tracking-wide">
                          Artikel: {articleDisplay}
                        </span>
                      )}
                      <span className="bg-slate-50 text-slate-600 font-mono px-3 py-1 rounded-full text-[11px] font-bold border border-slate-200/80">
                        SKU: {product.sku}
                      </span>
                    </div>

                    <div className="w-full max-w-[200px] h-px bg-slate-100 mb-5" />

                    {/* ── AREA HARGA (Besar, Jelas, & Kontras Tinggi) ── */}
                    <div className="flex flex-col items-center w-full">
                      {hasHargaPromo ? (
                        <div className="flex flex-col items-center gap-1">
                          <p className="text-[11px] font-black text-slate-400 tracking-widest uppercase mb-0.5">
                            HARGA PROMO RESMI
                          </p>
                          <span className="text-lg sm:text-xl font-bold text-slate-400 line-through decoration-rose-500/60 decoration-2">
                            {formatRupiah(product.hargaNormal)}
                          </span>
                          <span className="text-4xl sm:text-5xl md:text-6xl font-black text-rose-600 tracking-tight leading-none my-1">
                            {formatRupiah(product.hargaPromo!)}
                          </span>
                          <div className="mt-3 flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 px-4 py-1.5 rounded-full text-xs font-black">
                              HEMAT {formatRupiah(product.hargaNormal - product.hargaPromo!)}
                            </span>
                            {discountPct > 0 && (
                              <span className="bg-rose-600 text-white px-3 py-1.5 rounded-full text-xs font-black shadow-sm">
                                {discountPct}% OFF
                              </span>
                            )}
                          </div>
                        </div>
                      ) : isOnPromo ? (
                        <div className="flex flex-col items-center gap-3 w-full max-w-sm">
                          <div>
                            <p className="text-[11px] font-black text-slate-400 tracking-widest uppercase mb-1">
                              HARGA NORMAL SATUAN
                            </p>
                            <span className="text-4xl sm:text-5xl font-black text-slate-900 tracking-tight">
                              {formatRupiah(product.hargaNormal)}
                            </span>
                          </div>
                          <div className="w-full bg-gradient-to-br from-purple-50 via-indigo-50/50 to-pink-50 border-2 border-purple-200/90 rounded-2xl p-4 flex flex-col items-center shadow-sm">
                            <div className="inline-flex items-center gap-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider shadow-sm mb-2">
                              {isBogoPromo ? <Gift className="w-3.5 h-3.5" /> : <Tag className="w-3.5 h-3.5 fill-white" />}
                              {product.discountType || product.diskon || "PROMO SPESIAL"}
                            </div>
                            <p className="text-purple-950 font-black text-base sm:text-lg text-center leading-tight">
                              {product.discountType || (isBogoPromo ? "Promo Beli X Gratis Y" : "Promo Diskon Khusus")}
                            </p>
                            <p className="text-xs text-purple-700 font-bold text-center mt-1.5">
                              🎉 Promo otomatis terhitung di kasir saat pembayaran
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center">
                          <p className="text-[11px] font-black text-slate-400 tracking-widest uppercase mb-1">
                            HARGA RESMI
                          </p>
                          <span className="text-4xl sm:text-5xl md:text-6xl font-black text-slate-900 tracking-tight">
                            {formatRupiah(product.hargaNormal)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* ── 🖼️ 2. BOX BAWAH: BOX IMAGE PRODUK (AKURAT PER SKU & WARNA) ── */}
                <div className="w-full bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden p-5 sm:p-6 flex flex-col items-center animate-in slide-in-from-bottom-6 duration-400">
                  <div className="w-full flex items-center justify-between mb-3 px-1">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-xs font-black text-slate-800 uppercase tracking-wider">
                        Foto Model & Detail Produk
                      </span>
                    </div>
                    {color && (
                      <span className="text-[11px] font-black bg-indigo-50 text-indigo-800 border border-indigo-200/60 px-3 py-1 rounded-full uppercase">
                        Warna: {color}
                      </span>
                    )}
                  </div>

                  {/* Slider Foto Akurat Sesuai SKU dan Warnanya */}
                  <div className="w-full flex justify-center my-2">
                    <ProductImageSlider
                      images={product.images && product.images.length > 0 ? product.images : (product.imageUrl ? [product.imageUrl] : [])}
                      alt={`${name} - ${color || product.sku}`}
                      className="w-52 h-68 sm:w-60 sm:h-80"
                    />
                  </div>

                  {/* Varian Warna Lain dari Artikel ini (Color Swatches seperti di Matahari) */}
                  {availableColors.length > 1 && (
                    <div className="w-full pt-4 mt-3 border-t border-slate-100 flex flex-col items-center">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2.5">
                        WARNA LAIN PADA ARTIKEL INI ({availableColors.length} WARNA):
                      </p>
                      <div className="flex flex-wrap justify-center gap-2">
                        {availableColors.map((c) => {
                          const isSelected = c.isActive;
                          return (
                            <button
                              key={c.sku}
                              type="button"
                              onClick={() => handleSelectColor(c.sku)}
                              className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 border ${
                                isSelected
                                  ? "bg-slate-900 text-white border-slate-900 shadow-md scale-105"
                                  : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300 active:scale-95"
                              }`}
                            >
                              <span className={`w-2 h-2 rounded-full ${isSelected ? "bg-amber-400" : "bg-slate-400"}`} />
                              {c.color}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Tombol Scan Barang Lain */}
                <button
                  onClick={resetKiosk}
                  className="w-full h-14 bg-slate-900 hover:bg-black text-white font-black text-base rounded-2xl shadow-xl transition-all active:scale-98 flex items-center justify-center gap-2.5 mt-1"
                >
                  <Camera className="w-5 h-5 text-amber-300" />
                  Scan Barang Lain ({countdown}s)
                </button>
              </main>

              {/* Footer Bersih */}
              <footer className="w-full max-w-lg text-center pt-2 pb-safe shrink-0">
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
