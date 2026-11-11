"use client";

import { useState, useRef } from "react";
import dynamic from "next/dynamic";
import { Search, ScanText, Barcode, X, CalendarRange, Tag, Package2, Layers, MessageSquare, HandHelping, LogOut, UserCircle2, CheckCircle2, XCircle, ArrowLeft, CloudDownload, Loader2, Menu, Sparkles, ArrowRight, Gift, Maximize2, Zap } from "lucide-react";
import { useEffect } from "react";
import AnimatedLogoutButton from "@/components/AnimatedLogoutButton";
import PullToRefresh from "@/components/PullToRefresh";
import useSWR from "swr";
import { Bell } from "lucide-react";
import Link from "next/link";
import { ChipLoader } from "@/components/ChipLoader";
import ProductImageSlider, { optimizeRetailImageUrl, preloadProductImages } from "@/components/ProductImageSlider";
import ShiftLoader from "@/components/ShiftLoader";
import ImageLightboxModal from "@/components/ImageLightboxModal";
import { createPortal } from "react-dom";
import {
  BrandGroupKey,
  CategoryKey,
  ResolvedBrandGroup,
  ResolvedCategoryKey,
  BRAND_GROUP_OPTIONS,
  CATEGORY_OPTIONS,
  CATEGORY_LABELS,
  CATEGORY_DISPLAY_ORDER,
  classifyBrandGroup,
  classifyProductCategory,
  getBrandGroupMeta,
} from "@/lib/productTaxonomy";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const TextScanner = dynamic(() => import("@/components/TextScanner"), { ssr: false });

type ProductData = {
  id: number;
  sku: string;
  barcode: string | null;
  article: string | null;
  description: string;
  acara: string | null;
  fromDate: string | null;
  toDate: string | null;
  hargaNormal: number;
  hargaPromo: number | null;
  diskon: string | null;
  discountType: string | null;
  brand: string | null;
  dept: string | null;
  color?: string | null;
  size?: string | null;
  stok: number;
  promoFileName: string | null;
  imageUrl?: string | null;
  images?: string[];
  articleGroupCount?: number;
  articleTotalStok?: number;
  articleColors?: string[];
  articleSizes?: string[];
  articleHasPromo?: boolean;
  articlePromoLabel?: string | null;
  brandGroup?: ResolvedBrandGroup;
  categoryKey?: ResolvedCategoryKey;
};

// Parse product info to get clean product name, color, and size
function parseProductInfo(p: { description: string; article?: string | null; color?: string | null; size?: string | null }): { name: string; color: string; size: string; variants: string[] } {
  const desc = p.description || "";
  const parts = desc.split(":");
  let name = parts[0]?.trim() || desc;
  const rawVariants = parts.length > 1 ? parts.slice(1).map(x => x.trim()).filter(Boolean) : [];

  const art = (p.article || "").trim();
  if (art) {
    const artWords = art.split(/\s+/);
    const codesToRemove: string[] = [];
    if (artWords.length <= 2) codesToRemove.push(art);
    if (artWords.length > 1) codesToRemove.push(artWords[artWords.length - 1]);

    const descWords = name.split(/\s+/);
    const lastDescWord = descWords[descWords.length - 1];
    if (
      lastDescWord &&
      /^[A-Z0-9\-_]{3,12}$/i.test(lastDescWord) &&
      art.toLowerCase().includes(lastDescWord.toLowerCase())
    ) {
      codesToRemove.push(lastDescWord);
    }

    for (const code of Array.from(new Set(codesToRemove))) {
      if (!code || code.length < 2) continue;
      const esc = code.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
      name = name.replace(new RegExp(`[\\s\\-_/]+${esc}$`, "i"), "");
      name = name.replace(new RegExp(`\\b${esc}\\b`, "i"), "");
    }

    name = name.replace(/\s{2,}/g, " ").replace(/[\s\-_/]+$/, "").trim();
  }

  // Prioritaskan kolom color & size dari DB, lalu fallback ke token deskripsi
  let color = (p.color && p.color !== "-" ? p.color.trim() : "") || (rawVariants.length > 0 ? rawVariants[0] : "");
  let size = (p.size && p.size !== "-" ? p.size.trim() : "") || (rawVariants.length > 1 ? rawVariants[1] : "");

  if (["SOLID", "-"].includes(color.toUpperCase())) color = "";
  if (["SOLID", "-"].includes(size.toUpperCase())) size = "";

  const finalVariants: string[] = [];
  if (color) finalVariants.push(color);
  if (size) finalVariants.push(size);
  if (finalVariants.length === 0 && rawVariants.length > 0) {
    finalVariants.push(...rawVariants);
  }

  return { 
    name: name || parts[0]?.trim() || desc, 
    color, 
    size,
    variants: finalVariants
  };
}

// Helper untuk kompatibilitas
function parseDescription(desc: string, article?: string | null): { name: string; variants: string[] } {
  const info = parseProductInfo({ description: desc, article });
  return { name: info.name, variants: info.variants };
}

// Fungsi bantu untuk mengurutkan ukuran baju/celana secara logis
function sortSizes(a: string, b: string): number {
  const sizeOrder = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "3XL", "4XL", "5XL", "ALL SIZE", "ALLSIZE"];
  const aIdx = sizeOrder.indexOf(a.toUpperCase());
  const bIdx = sizeOrder.indexOf(b.toUpperCase());

  // Keduanya ada di daftar ukuran
  if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
  // Jika hanya satu yang ada, prioritaskan yang ada
  if (aIdx !== -1) return -1;
  if (bIdx !== -1) return 1;

  // Coba urutkan sebagai angka (misal ukuran celana: 28, 30, 32)
  const aNum = parseFloat(a);
  const bNum = parseFloat(b);
  if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;

  // Fallback pengurutan abjad
  return a.localeCompare(b);
}

// Fungsi bantu untuk memetakan nama warna ke data hex & kontras
function getColorData(colorName: string): { hex: string, isDark: boolean } | null {
  const c = colorName.toUpperCase().trim();
  const colorMap: Record<string, string> = {
    // A
    "ALMOND": "#EFDECD", "AQUA": "#00FFFF",
    // B
    "BANANA": "#FFE135", "BEIGE": "#F5F5DC", "BLA": "#000000", "BLAC": "#000000", "BLACK": "#000000",
    "BLUSH": "#DE5D83", "BRILLIANT BLUE": "#3399FF", "BROWN SUGAR": "#AF6E4D",
    // C
    "CACTUS GREEN": "#5F7161", "CERAMIC": "#F0EDE5", "CHA": "#36454F", "CHAR": "#36454F", "CHARCOAL": "#36454F",
    "CHRISTMAS GREEN": "#006400", "CLASSIC BLUE": "#0F4C81", "CLASSIC GREEN": "#008000", "CLASSIC ORANGE": "#FFA500",
    "CLASSIC RED": "#FF0000", "CLASSIC YELLOW": "#FFFF00", "COBALT BLUE": "#0047AB", "CORAL": "#FF7F50",
    // D
    "DARK BROWN": "#654321", "DARK DENIM": "#2C3E50", "DARK GREEN": "#006400", "DARK GREY": "#A9A9A9", "DARK JADE": "#007A5E",
    "DEEP BROWN": "#5C4033", "DEEP CHOCO": "#411900", "DEEP OLIVE": "#556B2F", "DUSTY PINK": "#DCAE96",
    // E
    "EGGPLANT": "#614051", "EMERALD GRE": "#50C878", "EMERALD GREEN": "#50C878",
    // F - G
    "FOREST GREEN": "#228B22", "FROST GREY": "#D3D3D3", "GOLD": "#FFD700", "GOLDEN BROWN": "#996515",
    "GOLDEN DEEP": "#CC9900", "GRASS GREEN": "#7CFC00",
    // H - K
    "HAWAIIAN OCEAN": "#008B8B", "INDIGO BLUE": "#4B0082", "JADE": "#00A86B", "KHAKI": "#C3B091",
    // L
    "LIGHT BLUE": "#ADD8E6", "LIGHT BROWN": "#B5651D", "LIGHT COOL": "#D1E8E2", "LIGHT CORAL": "#F08080",
    "LIGHT DENIM": "#748AA6", "LIGHT GREEN": "#90EE90", "LIGHT GREY": "#D3D3D3", "LIGHT NEUTRAL": "#F5F5DC",
    "LIGHT RED": "#FFCCCB", "LILAC": "#C8A2C8", "LIME": "#BFFF00",
    // M
    "MANDARIN ORANGE": "#F28C28", "MAROON": "#800000", "MEDIUM DENIM": "#5E86C1", "MEDIUM OLIVE": "#6B8E23",
    "MEDIUM WARM": "#D2B48C", "MISTY DARK BLUE": "#4A5D73", "MISTY DARK BROWN": "#5C4A3D", "MISTY DARK GREY": "#696969",
    "MISTY LIGHT BLUE": "#ADD8E6", "MISTY LIGHT BROWN": "#D2B48C", "MISTY LIGHT GREY": "#E5E4E2",
    "MISTY LIGHT KHAKI": "#F0E68C", "MISTY MEDIUM BROWN": "#8B4513", "MOCHA GRAY": "#705C53", "MUSTARD": "#FFDB58",
    // N - O
    "NAV": "#000080", "NAVY": "#000080", "NAVY BLUE": "#000080", "NEON GREEN": "#39FF14", "NEON YELLOW": "#FFFF33",
    "NEUTRAL": "#F5F5DC", "OFF WHITE": "#FAF9F6", "OLIVE": "#808000",
    // P
    "PAS": "#AEC6CF", "PASTEL BLUE": "#AEC6CF", "PASTEL GREEN": "#77DD77", "PASTEL GREY": "#CFCFC4",
    "PASTEL LAVENDER": "#B19CD9", "PASTEL ORANGE": "#FFB347", "PASTEL PINK": "#FFD1DC", "PASTEL PURPLE": "#B39EB5",
    "PASTEL YELLOW": "#FDFD96", "PEPPERMINT": "#D2E8E3", "PINK LEMONADE": "#EEA2AD",
    // R - S
    "ROSE GOLD": "#B76E79", "RUSTIC BROWN": "#784A32", "RUSTIC GOLD": "#C89D3C", "RUSTIC ORANGE": "#E86F28",
    "SALMON": "#FA8072", "SAND": "#C2B280", "SILVER": "#C0C0C0", "SUNSHINE YELLOW": "#FFFD37",
    // T - Z
    "TAUPE GREY": "#8B8589", "TEAL": "#008080", "TERRACOTTA": "#E2725B", "TURQOUISE": "#40E0D0", "VANILLA": "#F3E5AB",
    "WHI": "#FFFFFF", "WHIT": "#FFFFFF", "WHITE": "#FFFFFF", "WINE": "#722F37", "WOOD BROWN": "#8B5A2B"
  };
  
  const hex = colorMap[c];
  if (!hex) return null;
  
  // Hitung luminance YIQ untuk menentukan warna text (hitam/putih)
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
  
  return { hex, isDark: yiq < 140 };
}

function formatRupiah(angka: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(angka);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

export default function Home() {
  const [isScanning, setIsScanning] = useState(false);
  const [manualInput, setManualInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [product, setProduct] = useState<ProductData | null>(null);
  const [siblings, setSiblings] = useState<ProductData[]>([]);
  const [productsList, setProductsList] = useState<ProductData[]>([]);
  const [resultFilter, setResultFilter] = useState<"ALL" | "STOCK" | "PROMO">("ALL");
  const [selectedBrandGroup, setSelectedBrandGroup] = useState<BrandGroupKey>("ALL");
  const [selectedCategory, setSelectedCategory] = useState<CategoryKey>("ALL");
  const [groupByCategory, setGroupByCategory] = useState<boolean>(true);
  const [taxonomyBrandCounts, setTaxonomyBrandCounts] = useState<Record<string, number> | null>(null);
  const [taxonomyCategoryCounts, setTaxonomyCategoryCounts] = useState<Record<string, number> | null>(null);
  const [totalModelsCount, setTotalModelsCount] = useState(0);
  const [totalSkusCount, setTotalSkusCount] = useState(0);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState("");
  const [localCacheStats, setLocalCacheStats] = useState<{
    skuCount: number;
    modelCount: number;
    sizeMB: number;
    ready: boolean;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem("suko_recent_searches");
        if (raw) {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr)) setRecentSearches(arr.slice(0, 6));
        }
      } catch {}
    }
  }, []);

  const recordRecentSearch = (term: string) => {
    const clean = term.trim();
    if (!clean || clean.length < 2) return;
    setRecentSearches((prev) => {
      const next = [clean, ...prev.filter((x) => x.toLowerCase() !== clean.toLowerCase())].slice(0, 6);
      if (typeof window !== "undefined") {
        localStorage.setItem("suko_recent_searches", JSON.stringify(next));
      }
      return next;
    });
  };
  
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [orderPreviewImage, setOrderPreviewImage] = useState<{ url: string; title: string; sku: string } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const [checkingLiveStock, setCheckingLiveStock] = useState(false);
  const [liveStockVerified, setLiveStockVerified] = useState<string | null>(null);

  const handleCheckLiveStock = async () => {
    if (!product?.sku || checkingLiveStock) return;
    setCheckingLiveStock(true);
    try {
      const res = await fetch("/api/live-stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku: product.sku }),
      });
      const data = await res.json();
      if (data.success && data.stok !== undefined) {
        setProduct((prev) => prev ? { ...prev, stok: data.stok } : null);

        // Update seluruh siblings (varian warna & ukuran dalam 1 artikel yang sama)
        if (data.variants && data.variants.length > 0) {
          const stockMap = new Map<string, number>(data.variants.map((v: any) => [v.sku, v.stok]));
          setSiblings((prevSiblings) => {
            const updated = prevSiblings.map((sib) => {
              if (stockMap.has(sib.sku)) {
                return { ...sib, stok: stockMap.get(sib.sku)! };
              }
              return sib;
            });
            // Update cache memory agar klik varian warna/ukuran selanjutnya instan 0ms membawa stok baru
            updated.forEach(s => {
              if (s.sku) sessionCacheRef.current.set(s.sku.toLowerCase(), { product: s, siblings: updated });
              if (s.barcode) sessionCacheRef.current.set(s.barcode.toLowerCase(), { product: s, siblings: updated });
            });
            return updated;
          });
        }

        if (data.storeOffline) {
          setLiveStockVerified(`Tersimpan: ${data.stok} pcs`);
          showToast(data.message || `Toko tutup (malam). Menampilkan stok tersimpan: ${data.stok} pcs`, "info");
        } else {
          const countText = data.totalVariantsUpdated > 1 ? ` (${data.totalVariantsUpdated} varian warna & ukuran)` : '';
          setLiveStockVerified(`Live: ${data.stok} pcs${countText}`);
          showToast(`Stok seluruh warna & ukuran artikel ${data.article || product.article || ''} terverifikasi live by luqman org!`, "success");
        }
      } else {
        showToast(data.message || "Menampilkan stok tersimpan di sistem", "info");
      }
    } catch {
      showToast("Menampilkan stok tersimpan di sistem", "info");
    } finally {
      setCheckingLiveStock(false);
    }
  };

  const [submitting, setSubmitting] = useState(false);
  const [qty, setQty] = useState(1);
  const [activeTab, setActiveTab] = useState<"FACING_OUT" | "STOCK_CHECK" | "ORDERS">("FACING_OUT");
  const [cart, setCart] = useState<any[]>([]);

  // Tahan draft keranjang request facing out selama 24 jam di memori HP agar tidak hilang jika tak sengaja logout
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem("suko_facing_out_cart");
        if (raw) {
          const parsed = JSON.parse(raw);
          const now = Date.now();
          if (parsed?.timestamp && (now - parsed.timestamp < 24 * 60 * 60 * 1000) && Array.isArray(parsed?.items)) {
            setCart(parsed.items);
          } else {
            localStorage.removeItem("suko_facing_out_cart");
          }
        }
      } catch {}
    }
  }, []);

  const updateCart = (newCart: any[]) => {
    setCart(newCart);
    if (typeof window !== "undefined") {
      if (newCart.length > 0) {
        localStorage.setItem("suko_facing_out_cart", JSON.stringify({
          timestamp: Date.now(),
          items: newCart
        }));
      } else {
        localStorage.removeItem("suko_facing_out_cart");
      }
    }
  };
  const [continuousMode, setContinuousMode] = useState(false);
  const [user, setUser] = useState<{name: string, nik: string, role: string, status?: string, jobTitle?: string} | null>(null);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Fetch last update date (Cek tiap 5 menit = 300000 ms agar tidak membebani server/kuota)
  const { data: updateData, mutate: mutateLastUpdate } = useSWR("/api/last-update", fetcher, { refreshInterval: 300000 });
  const serverVersion = updateData?.lastUpdate ? new Date(updateData.lastUpdate).getTime().toString() : null;
  
  const [localVersion, setLocalVersion] = useState<string | null>(null);
  const [hasAppCodeUpdate, setHasAppCodeUpdate] = useState(false);
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);
  
  useEffect(() => {
    if (typeof window !== "undefined") {
      setLocalVersion(localStorage.getItem("suko_server_version"));
      setDismissedVersion(localStorage.getItem("suko_dismissed_update"));
    }
    // Cek juga update kode aplikasi / UI / fitur baru
    import("@/lib/version").then(({ checkAppVersion }) => {
      checkAppVersion().then(res => {
        if (res.hasUpdate) setHasAppCodeUpdate(true);
      }).catch(() => {});
    });
  }, []);

  // Cek apakah banner ini sudah pernah di-update atau ditutup user untuk versi ini
  const isDismissedForThisVersion = Boolean(
    serverVersion && dismissedVersion && (
      dismissedVersion === serverVersion || 
      Number(dismissedVersion) >= Number(serverVersion)
    )
  );

  const hasNewUpdate = Boolean(
    !isDismissedForThisVersion && (
      (serverVersion && localVersion && Number(serverVersion) > Number(localVersion)) || 
      hasAppCodeUpdate
    )
  );

  // Download awal otomatis jika database lokal belum lengkap & panaskan index model lokal di RAM (~7 MB)
  useEffect(() => {
    let isMounted = true;
    const initialSyncIfEmpty = async () => {
      try {
        const {
          syncOfflineDatabase,
          db,
          ensureDbOpenSafe,
          ensureModelsIndexReady,
          getLocalCacheStats,
        } = await import('@/lib/offlineDb');
        await ensureDbOpenSafe();
        const count = await db.products.count().catch(() => 0);
        const schemaVer = localStorage.getItem("suko_db_schema_version");
        if (count < 80000 || schemaVer !== "v12") {
          if (isMounted) setIsSyncing(true);
          await syncOfflineDatabase((syncing, prog) => {
            if (isMounted) {
              setIsSyncing(syncing);
              if (prog !== undefined) setSyncProgress(prog);
            }
          }, true);
          sessionCacheRef.current.clear();
          listCacheRef.current.clear();
          await ensureDbOpenSafe();
          if (serverVersion) {
            localStorage.setItem("suko_server_version", serverVersion);
            setLocalVersion(serverVersion);
          }
          if (isMounted) {
            setIsSyncing(false);
            setSyncProgress(undefined);
          }
        } else {
          await ensureModelsIndexReady();
        }
        const stats = await getLocalCacheStats();
        if (isMounted) setLocalCacheStats(stats);
      } catch (e) {
        if (isMounted) setIsSyncing(false);
      }
    };
    initialSyncIfEmpty();
    return () => { isMounted = false; };
  }, [serverVersion]);

  const lastUpdateDate = updateData?.lastUpdate 
    ? new Date(updateData.lastUpdate).toLocaleString('id-ID', {
        day: 'numeric', month: 'long', year: 'numeric', 
        hour: '2-digit', minute: '2-digit'
      }) 
    : 'Memuat...';

  const [syncProgress, setSyncProgress] = useState<number | undefined>(undefined);

  const handleManualSync = async () => {
    setIsSyncing(true);
    setSyncProgress(0);
    showToast("Memperbarui data & sistem...", "success");
    try {
      const {
        syncOfflineDatabase,
        ensureDbOpenSafe,
        db,
        clearModelsMemoryCache,
        getLocalCacheStats,
      } = await import('@/lib/offlineDb');
      await syncOfflineDatabase((syncing, prog) => {
        setIsSyncing(syncing);
        if (prog !== undefined) setSyncProgress(prog);
      }, true);

      // Reset penuh RAM cache & segarkan koneksi Dexie agar langsung siap di-scan tanpa refresh manual!
      sessionCacheRef.current.clear();
      listCacheRef.current.clear();
      clearModelsMemoryCache();
      await ensureDbOpenSafe();
      const totalOffline = await db.products.count().catch(() => 0);
      const stats = await getLocalCacheStats();
      setLocalCacheStats(stats);

      // Bersihkan Cache Storage & Service Worker lama di background
      if (typeof window !== "undefined") {
        try {
          if ('serviceWorker' in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations();
            for (const r of regs) await r.unregister();
          }
          if ('caches' in window) {
            const keys = await caches.keys();
            for (const k of keys) await caches.delete(k);
          }
        } catch {}
      }

      // Cek apakah ada update versi kode UI/UX SEBELUM menimpa suko_client_version
      const { checkAppVersion, forceAppUpdate, APP_VERSION } = await import('@/lib/version');
      const verCheck = await checkAppVersion();

      const targetVersion = serverVersion || Date.now().toString();
      localStorage.setItem("suko_server_version", targetVersion);
      localStorage.setItem("suko_dismissed_update", targetVersion);
      localStorage.setItem("suko_client_version", APP_VERSION);
      localStorage.removeItem("suko_update_detected_at");

      setLocalVersion(targetVersion);
      setDismissedVersion(targetVersion);
      setHasAppCodeUpdate(false);
      mutateLastUpdate();

      if (verCheck.hasUpdate) {
        await forceAppUpdate({ clearOfflineData: false });
        return;
      }

      showToast(
        `Database offline (${totalOffline.toLocaleString('id-ID')} SKU) siap langsung di-scan!`,
        "success"
      );
    } catch (e) {
      showToast("Gagal update data offline", "error");
    } finally {
      setIsSyncing(false);
      setSyncProgress(undefined);
    }
  };

  // ── Penegakan Pembaruan: Jika lewat 1 hari (24 jam) belum update, sistem paksa download otomatis ──
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!hasNewUpdate) {
      localStorage.removeItem("suko_update_detected_at");
      return;
    }

    const ONE_DAY_MS = 24 * 60 * 60 * 1000; // 24 Jam
    const now = Date.now();
    const detectedAt = localStorage.getItem("suko_update_detected_at");

    if (!detectedAt) {
      // Catat pertama kali update terdeteksi
      localStorage.setItem("suko_update_detected_at", now.toString());
    } else {
      const elapsed = now - parseInt(detectedAt, 10);
      if (elapsed >= ONE_DAY_MS && !isSyncing) {
        // SUDAH LEWAT 1 HARI! Paksa download dan sinkronisasi otomatis
        console.warn("[UPDATE] Melebihi 24 jam belum update versi, memaksa download otomatis...");
        handleManualSync();
      }
    }
  }, [hasNewUpdate, isSyncing]);

  // Logout Summary States
  const [showSummary, setShowSummary] = useState(false);
  const [shiftSummary, setShiftSummary] = useState<any>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const previousProcessedIds = useRef<Set<string>>(new Set());

  // Fetch SA's active tickets every 10 seconds to reduce DB load
  const { data: ticketData, mutate: mutateTickets } = useSWR(user && user.role === "SA" ? "/api/tickets" : null, fetcher, { refreshInterval: 10000 });
  const activeTickets = ticketData?.tickets || [];
  
  const pendingCount = activeTickets.filter((t: any) => t.status === "PENDING").length;
  const processedCount = activeTickets.filter((t: any) => ["READY", "OOS"].includes(t.status)).length;

  useEffect(() => {
    if (!activeTickets.length || !user || user.status === "BREAK") return;

    // We only care about tickets that just became READY or OOS
    const currentProcessedIds = new Set<string>(
      activeTickets.filter((t: any) => t.status === "READY" || t.status === "OOS").map((t: any) => t.id)
    );
    
    let hasNewProcessed = false;
    let newProcessedTickets: any[] = [];

    for (const id of currentProcessedIds) {
      if (!previousProcessedIds.current.has(id)) {
        hasNewProcessed = true;
        const ticket = activeTickets.find((t: any) => t.id === id);
        if (ticket) newProcessedTickets.push(ticket);
      }
    }

    if (hasNewProcessed && previousProcessedIds.current.size > 0) {
      playTingTong();
      
      // Show toasts for the newly processed tickets
      newProcessedTickets.forEach(t => {
        if (t.status === "READY") {
          showToast(`Pesanan ${t.sku} sudah READY!`, "success");
        } else if (t.status === "OOS") {
          showToast(`Pesanan ${t.sku} KOSONG!`, "error");
        }
      });
    }

    previousProcessedIds.current = currentProcessedIds;
  }, [activeTickets, user]);

  const playTingTong = () => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContext();
      
      const playTone = (freq: number, startTime: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.5, startTime);
        gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
        osc.start(startTime);
        osc.stop(startTime + duration);
      };

      const now = ctx.currentTime;
      playTone(659.25, now, 0.5); // Ting (E5)
      playTone(523.25, now + 0.4, 0.7); // Tong (C5)
    } catch (e) {
      console.error("Audio playback failed", e);
    }
  };

  useEffect(() => {
    let isActive = true;
    const verifyActiveSession = async () => {
      try {
        const res = await fetch("/api/auth/me?t=" + Date.now(), {
          credentials: "same-origin",
          cache: "no-store",
        });
        const data = await res.json();
        if (!isActive) return;

        if (data.user) {
          setUser(data.user);
          localStorage.setItem("suko_user", JSON.stringify(data.user));
        } else {
          // Sesi sudah pindah ke tab/HP lain atau habis -> langsung lempar ke login
          // (Keranjang suko_facing_out_cart di localStorage tetap aman 100%!)
          localStorage.removeItem("suko_user");
          const reasonParam = data.reason === "device_switched" ? "device_switched" : "session_expired_cart_saved";
          window.location.href = `/login?reason=${reasonParam}`;
        }
      } catch (err) {
        // Abaikan error jaringan sesaat saat offline agar kasir tetap bisa scan offline
      }
    };

    verifyActiveSession();

    const onFocusOrVisible = () => {
      if (document.visibilityState === "visible") {
        verifyActiveSession();
      }
    };

    window.addEventListener("focus", onFocusOrVisible);
    document.addEventListener("visibilitychange", onFocusOrVisible);
    const intervalId = setInterval(verifyActiveSession, 25000);

    return () => {
      isActive = false;
      window.removeEventListener("focus", onFocusOrVisible);
      document.removeEventListener("visibilitychange", onFocusOrVisible);
      clearInterval(intervalId);
    };
  }, []);

  const toggleStatus = async () => {
    if (!user || togglingStatus) return;
    setTogglingStatus(true);
    const newStatus = user.status === "ACTIVE" ? "BREAK" : "ACTIVE";
    try {
      const res = await fetch("/api/auth/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus })
      });
      const data = await res.json();
      if (res.ok) {
        setUser({ ...user, status: data.status });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setTogglingStatus(false);
    }
  };

  const handleLogoutClick = async () => {
    setLoadingSummary(true);
    setShowSummary(true);
    try {
      const res = await fetch("/api/auth/shift-summary");
      const data = await res.json();
      setShiftSummary(data.summary || { total: 0, pending: 0, completed: 0, rejected: 0, recentTickets: [] });
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingSummary(false);
    }
  };

  const confirmLogout = async () => {
    setIsLoggingOut(true);
    setShowSummary(false);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      if (typeof window !== "undefined") {
        localStorage.removeItem("suko_user");
      }
    } catch (error) {
      console.error("Failed to logout:", error);
    }
    setTimeout(() => {
      window.location.href = "/login";
    }, 700);
  };

  // ── Penanganan Tombol Back (Hardware / Browser) & Pencegahan Back Rancu ke Login ──
  const isScanningRef = useRef(isScanning);
  const productRef = useRef(product);
  const productsListRef = useRef(productsList);
  const showSummaryRef = useRef(showSummary);

  useEffect(() => {
    isScanningRef.current = isScanning;
    productRef.current = product;
    productsListRef.current = productsList;
    showSummaryRef.current = showSummary;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Trap navigasi back di beranda portal
    try {
      window.history.pushState({ portalRoot: true }, "", window.location.href);
    } catch (e) {}

    const handlePopState = () => {
      // 1. Jika modal logout/shift summary sedang terbuka -> tutup modalnya
      if (showSummaryRef.current) {
        setShowSummary(false);
        try { window.history.pushState({ portalRoot: true }, "", window.location.href); } catch (e) {}
        return;
      }

      // 2. Jika kamera scanner sedang terbuka -> tutup kamera
      if (isScanningRef.current) {
        setIsScanning(false);
        try { window.history.pushState({ portalRoot: true }, "", window.location.href); } catch (e) {}
        return;
      }

      // 3. Jika sedang melihat detail produk / list hasil pencarian -> tutup dan reset ke beranda
      if (productRef.current || (productsListRef.current && productsListRef.current.length > 0)) {
        setProduct(null);
        setProductsList([]);
        setManualInput("");
        setError("");
        try { window.history.pushState({ portalRoot: true }, "", window.location.href); } catch (e) {}
        return;
      }

      // 4. Jika sudah di beranda paling awal (portal) dan tombol back ditekan lagi:
      // Tahan history agar tidak tembus ke /login dan tampilkan popup konfirmasi logout!
      try { window.history.pushState({ portalRoot: true }, "", window.location.href); } catch (e) {}
      handleLogoutClick();
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);


  const markAsCompleted = async (ticketId: string) => {
    // 1. Optimistic Update instan (0 milidetik langsung hilang dari daftar layar)
    mutateTickets((currentData: any) => {
      if (!currentData?.tickets) return currentData;
      return {
        ...currentData,
        tickets: currentData.tickets.filter((t: any) => t.id !== ticketId)
      };
    }, false);

    try {
      await fetch("/api/tickets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId, status: "COMPLETED" })
      });
      mutateTickets();
    } catch (error) {
      console.error("Failed to mark ticket as completed:", error);
      mutateTickets();
    }
  };

  const searchCounterRef = useRef(0);
  const sessionCacheRef = useRef<Map<string, { product: ProductData; siblings: ProductData[] }>>(new Map());
  const listCacheRef = useRef<
    Map<
      string,
      {
        list: ProductData[];
        total: number;
        totalSkus: number;
        page: number;
        totalPages: number;
        brandCounts?: Record<string, number> | null;
        categoryCounts?: Record<string, number> | null;
        cachedAt: number;
      }
    >
  >(new Map());

  // Ganti varian warna/ukuran secara instan (0ms) dari memori tanpa reload layar
  const handleSelectVariant = (targetSku: string) => {
    setManualInput(targetSku);

    // 1. Cek dari daftar siblings yang sedang aktif di memori
    const existing = siblings.find(s => s.sku === targetSku);
    if (existing) {
      setProduct(existing);
      sessionCacheRef.current.set(targetSku, { product: existing, siblings });
      return;
    }

    // 2. Jika tidak ada di siblings aktif, cari via searchProduct
    searchProduct(targetSku);
  };

  const scrollPageToTop = () => {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handlePageChange = (nextPage: number) => {
    if (nextPage < 1 || nextPage > totalPages || loading) return;
    scrollPageToTop();
    searchProduct(manualInput, nextPage, true);
  };

  const buildSearchEndpointUrl = (
    trimmedQuery: string,
    targetPage: number,
    brandGroup: BrandGroupKey,
    category: CategoryKey
  ) => {
    if (!trimmedQuery) {
      return `/api/catalog?brandGroup=${encodeURIComponent(brandGroup)}&category=${encodeURIComponent(category)}&page=${targetPage}`;
    }
    const params = new URLSearchParams({ page: String(targetPage) });
    if (brandGroup !== "ALL") params.set("brandGroup", brandGroup);
    if (category !== "ALL") params.set("category", category);
    return `/api/product/${encodeURIComponent(trimmedQuery)}?${params.toString()}`;
  };

  const handleBrandFilterChange = (nextBrand: BrandGroupKey) => {
    const resolvedBrand: BrandGroupKey = selectedBrandGroup === nextBrand && nextBrand !== "ALL" ? "ALL" : nextBrand;
    setSelectedBrandGroup(resolvedBrand);
    if (!manualInput.trim() && resolvedBrand === "ALL" && selectedCategory === "ALL") {
      setProductsList([]);
      setProduct(null);
      setSiblings([]);
      setTotalModelsCount(0);
      setTotalSkusCount(0);
      setTaxonomyBrandCounts(null);
      setTaxonomyCategoryCounts(null);
      setError("");
      return;
    }
    searchProduct(manualInput, 1, false, resolvedBrand, selectedCategory);
  };

  const handleCategoryFilterChange = (nextCategory: CategoryKey) => {
    const resolvedCat: CategoryKey = selectedCategory === nextCategory && nextCategory !== "ALL" ? "ALL" : nextCategory;
    setSelectedCategory(resolvedCat);
    if (!manualInput.trim() && selectedBrandGroup === "ALL" && resolvedCat === "ALL") {
      setProductsList([]);
      setProduct(null);
      setSiblings([]);
      setTotalModelsCount(0);
      setTotalSkusCount(0);
      setTaxonomyBrandCounts(null);
      setTaxonomyCategoryCounts(null);
      setError("");
      return;
    }
    searchProduct(manualInput, 1, false, selectedBrandGroup, resolvedCat);
  };

  const handleResetTaxonomyFilters = () => {
    setSelectedBrandGroup("ALL");
    setSelectedCategory("ALL");
    if (!manualInput.trim()) {
      setProductsList([]);
      setProduct(null);
      setSiblings([]);
      setTotalModelsCount(0);
      setTotalSkusCount(0);
      setTaxonomyBrandCounts(null);
      setTaxonomyCategoryCounts(null);
      setError("");
      return;
    }
    searchProduct(manualInput, 1, false, "ALL", "ALL");
  };

  const searchProduct = async (
    identifier: string,
    page: number = 1,
    shouldScrollTop: boolean = false,
    overrideBrandGroup?: BrandGroupKey,
    overrideCategory?: CategoryKey
  ) => {
    const trimmed = identifier.trim();
    const activeBrand = overrideBrandGroup ?? selectedBrandGroup;
    const activeCategory = overrideCategory ?? selectedCategory;
    const hasTaxonomyFilter = activeBrand !== "ALL" || activeCategory !== "ALL";

    if (!trimmed && !hasTaxonomyFilter) return;

    const currentSearch = ++searchCounterRef.current;
    setError("");

    // 0A. CEK SIBLING LANGSUNG (0ms INSTAN!):
    if (trimmed && !hasTaxonomyFilter && page === 1 && siblings && siblings.length > 0) {
      const existingSibling = siblings.find(
        s => (s.sku && s.sku.toLowerCase() === trimmed.toLowerCase()) ||
             (s.barcode && s.barcode.toLowerCase() === trimmed.toLowerCase())
      );
      if (existingSibling) {
        setProduct(existingSibling);
        setManualInput(existingSibling.sku);
        setProductsList([]);
        setLoading(false);
        if (isScanning) setIsScanning(false);
        sessionCacheRef.current.set(trimmed.toLowerCase(), { product: existingSibling, siblings });
        sessionCacheRef.current.set(existingSibling.sku.toLowerCase(), { product: existingSibling, siblings });
        if (existingSibling.barcode) {
          sessionCacheRef.current.set(existingSibling.barcode.toLowerCase(), { product: existingSibling, siblings });
        }
        return;
      }
    }

    // 0B. Cek Session Cache Memory (0ms instant!)
    const inMemory = trimmed && !hasTaxonomyFilter
      ? (sessionCacheRef.current.get(trimmed.toLowerCase()) || sessionCacheRef.current.get(trimmed))
      : undefined;
    if (inMemory && page === 1) {
      setProduct(inMemory.product);
      setSiblings(inMemory.siblings);
      setProductsList([]);
      setLoading(false);
      if (isScanning) setIsScanning(false);
      return;
    }

    const listCacheKey = `${trimmed ? trimmed.toLowerCase() : "CATALOG"}::b=${activeBrand}::c=${activeCategory}::p${page}`;

    const prefetchNextPage = (
      currentPageNum: number,
      maxPages: number,
      fallbackTotal: number,
      fallbackTotalSkus: number,
      fallbackBrands?: Record<string, number> | null,
      fallbackCats?: Record<string, number> | null
    ) => {
      const nextPageNum = currentPageNum + 1;
      const nextCacheKey = `${trimmed ? trimmed.toLowerCase() : "CATALOG"}::b=${activeBrand}::c=${activeCategory}::p${nextPageNum}`;
      if (currentPageNum < maxPages && !listCacheRef.current.has(nextCacheKey)) {
        fetch(buildSearchEndpointUrl(trimmed, nextPageNum, activeBrand, activeCategory), { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : null))
          .then((nextJson) => {
            if (nextJson && Array.isArray(nextJson.data) && nextJson.data.length > 0) {
              listCacheRef.current.set(nextCacheKey, {
                list: nextJson.data,
                total: nextJson.meta?.total ?? fallbackTotal,
                totalSkus: nextJson.meta?.totalSkus ?? fallbackTotalSkus,
                page: nextJson.meta?.page || nextPageNum,
                totalPages: nextJson.meta?.totalPages || maxPages,
                brandCounts: nextJson.meta?.brandCounts || fallbackBrands || null,
                categoryCounts: nextJson.meta?.categoryCounts || fallbackCats || null,
                cachedAt: Date.now(),
              });
              preloadProductImages(nextJson.data.map((item: any) => item.imageUrl), 400);
            }
          })
          .catch(() => {});
      }
    };

    // 0C. Cek Cache Halaman Katalog (0ms instant untuk Selanjutnya / Sebelumnya / Filter!)
    const cachedPage = listCacheRef.current.get(listCacheKey);
    if (cachedPage && Date.now() - cachedPage.cachedAt < 60_000) {
      setProduct(null);
      setSiblings([]);
      setProductsList(cachedPage.list);
      setResultFilter("ALL");
      setTotalModelsCount(cachedPage.total);
      setTotalSkusCount(cachedPage.totalSkus);
      if (cachedPage.brandCounts !== undefined) setTaxonomyBrandCounts(cachedPage.brandCounts || null);
      if (cachedPage.categoryCounts !== undefined) setTaxonomyCategoryCounts(cachedPage.categoryCounts || null);
      setCurrentPage(cachedPage.page);
      setTotalPages(cachedPage.totalPages);
      setLoading(false);
      if (isScanning) setIsScanning(false);
      preloadProductImages(cachedPage.list.map((item) => item.imageUrl), 400);
      prefetchNextPage(
        cachedPage.page,
        cachedPage.totalPages,
        cachedPage.total,
        cachedPage.totalSkus,
        cachedPage.brandCounts,
        cachedPage.categoryCounts
      );
      if (shouldScrollTop && typeof window !== "undefined") {
        requestAnimationFrame(() => scrollPageToTop());
      }
      return;
    }

    // 0D. INSTAN DATA LOKAL HP (~5-10ms): Untuk cari teks ("jaket"), filter SUKO/Mu+Ku/ZES, & klik Selanjutnya!
    const isCodeSearch = Boolean(trimmed && !hasTaxonomyFilter && /\d/.test(trimmed) && !/\s/.test(trimmed));
    if (!isCodeSearch) {
      try {
        const { queryLocalModelsInstant } = await import('@/lib/offlineDb');
        const localRes = await queryLocalModelsInstant({
          query: trimmed,
          brandGroup: activeBrand,
          category: activeCategory,
          page,
          limit: 20,
        });
        if (searchCounterRef.current !== currentSearch) return;
        if (localRes && !localRes.singleMatch && localRes.total > 0) {
          setProduct(null);
          setSiblings([]);
          setProductsList(localRes.data as unknown as ProductData[]);
          setResultFilter("ALL");
          setTotalModelsCount(localRes.total);
          setTotalSkusCount(localRes.totalSkus);
          setTaxonomyBrandCounts(localRes.brandCounts);
          setTaxonomyCategoryCounts(localRes.categoryCounts);
          if (trimmed) recordRecentSearch(trimmed);
          preloadProductImages(localRes.data.map((item) => item.imageUrl), 400);
          setCurrentPage(localRes.page);
          setTotalPages(localRes.totalPages);
          setLoading(false);
          if (isScanning) setIsScanning(false);
          if (shouldScrollTop && typeof window !== "undefined") {
            requestAnimationFrame(() => scrollPageToTop());
          }
          return;
        }
      } catch {}
    }

    setLoading(true);

    try {
      // 1. OFFLINE-FIRST: Cek SKU/Barcode di Dexie hanya bila input berbentuk kode berangka
      let localData = null;
      if (trimmed && !hasTaxonomyFilter && page === 1 && /\d/.test(trimmed) && !/\s/.test(trimmed)) {
        const { db, ensureDbOpenSafe } = await import('@/lib/offlineDb');
        await ensureDbOpenSafe();
        localData = await db.products.where('sku').equals(trimmed).first();
        if (!localData) {
          localData = await db.products.where('barcode').equals(trimmed).first();
        }
        if (!localData && /^\d+$/.test(trimmed)) {
          const stripped = trimmed.replace(/^0+/, '');
          if (stripped && stripped !== trimmed) {
            localData = await db.products.where('barcode').equals(stripped).first();
          }
        }

        // Jika data ditemukan di HP, langsung tampilkan (0ms instan & tanpa internet!)
        if (localData) {
          if (searchCounterRef.current !== currentSearch) return;

          setError("");
          const localProduct: ProductData = {
            id: 0,
            sku: localData.sku,
            barcode: localData.barcode || null,
            article: localData.article || null,
            description: localData.description || localData.name,
            acara: localData.acara || null,
            fromDate: null,
            toDate: localData.toDate,
            hargaNormal: localData.hargaNormal,
            hargaPromo: localData.hargaPromo,
            diskon: localData.diskon || null,
            discountType: localData.discountType || null,
            brand: localData.brand || null,
            dept: localData.dept || null,
            color: localData.color || null,
            size: localData.size || null,
            stok: localData.stok ?? 0,
            promoFileName: null,
            imageUrl: localData.imageUrl || null,
            images: localData.images && localData.images.length > 0 ? localData.images : (localData.imageUrl ? [localData.imageUrl] : [])
          };
          setProduct(localProduct);

          // Ambil siblings varian dari Dexie secara instan (stok & warna varian lain langsung muncul!)
          let currentSiblings: ProductData[] = [localProduct];
          if (localData.article) {
            const localSiblings = await db.products.where('article').equals(localData.article).toArray();
            if (localSiblings && localSiblings.length > 0) {
              currentSiblings = localSiblings.map(s => ({
                id: 0,
                sku: s.sku,
                barcode: s.barcode || null,
                article: s.article || null,
                description: s.description || s.name,
                acara: s.acara || null,
                fromDate: null,
                toDate: s.toDate || null,
                hargaNormal: s.hargaNormal,
                hargaPromo: s.hargaPromo || null,
                diskon: s.diskon || null,
                discountType: s.discountType || null,
                brand: s.brand || null,
                dept: s.dept || null,
                color: s.color || null,
                size: s.size || null,
                stok: s.stok ?? 0,
                promoFileName: null,
                imageUrl: s.imageUrl || null,
                images: s.images && s.images.length > 0 ? s.images : (s.imageUrl ? [s.imageUrl] : [])
              }));
            }
          }
          setSiblings(currentSiblings);
          preloadProductImages([localProduct.imageUrl, ...currentSiblings.map((s) => s.imageUrl)], 400);
          sessionCacheRef.current.set(trimmed.toLowerCase(), { product: localProduct, siblings: currentSiblings });
          currentSiblings.forEach((s) => {
            if (s.sku) sessionCacheRef.current.set(s.sku.toLowerCase(), { product: s, siblings: currentSiblings });
            if (s.barcode) sessionCacheRef.current.set(s.barcode.toLowerCase(), { product: s, siblings: currentSiblings });
          });

          setProductsList([]);
          setLoading(false);
          if (isScanning) setIsScanning(false);
        }
      }

      // 2. Minta data terbaru/live ke server (di background jika localData sudah tampil)
      let res: Response | null = null;
      const endpointUrl = buildSearchEndpointUrl(trimmed, page, activeBrand, activeCategory);
      try {
        res = await fetch(endpointUrl, {
          cache: 'no-store'
        });
      } catch (fetchErr) {
        if (localData) return; // Jika sudah tampil dari Dexie lokal, abaikan error sinyal!
        throw fetchErr;
      }
      
      if (searchCounterRef.current !== currentSearch) return;

      const data = await res.json();

      if (res.ok) {
        setError("");
        if (Array.isArray(data.data)) {
          if (data.data.length === 0) {
            setProductsList([]);
            setProduct(null);
            setSiblings([]);
            setTotalModelsCount(0);
            setTotalSkusCount(0);
            setTaxonomyBrandCounts(data.meta?.brandCounts || null);
            setTaxonomyCategoryCounts(data.meta?.categoryCounts || null);
            if (!hasTaxonomyFilter && trimmed) {
              const isDigitCode = /^\d{8,14}$/.test(trimmed);
              if (isDigitCode) {
                setError(`Produk tidak ditemukan untuk: "${trimmed}". (Produk baru belum tercatat di database master toko. Akan otomatis disinkronkan saat toko buka besok).`);
              } else {
                setError(`Produk tidak ditemukan untuk: "${trimmed}"`);
              }
            }
            return;
          }
          const resolvedPage = data.meta?.page || page;
          const resolvedTotalPages = data.meta?.totalPages || 1;
          const resolvedTotal = data.meta?.total ?? data.data.length;
          const resolvedTotalSkus = data.meta?.totalSkus ?? data.data.length;
          const resolvedBrandCounts = data.meta?.brandCounts || null;
          const resolvedCategoryCounts = data.meta?.categoryCounts || null;

          setProduct(null);
          setSiblings([]);
          setProductsList(data.data);
          setResultFilter("ALL");
          setTotalModelsCount(resolvedTotal);
          setTotalSkusCount(resolvedTotalSkus);
          setTaxonomyBrandCounts(resolvedBrandCounts);
          setTaxonomyCategoryCounts(resolvedCategoryCounts);
          if (trimmed) recordRecentSearch(trimmed);
          preloadProductImages(data.data.map((item: any) => item.imageUrl), 400);
          setCurrentPage(resolvedPage);
          setTotalPages(resolvedTotalPages);
          listCacheRef.current.set(
            `${trimmed ? trimmed.toLowerCase() : "CATALOG"}::b=${activeBrand}::c=${activeCategory}::p${resolvedPage}`,
            {
              list: data.data,
              total: resolvedTotal,
              totalSkus: resolvedTotalSkus,
              page: resolvedPage,
              totalPages: resolvedTotalPages,
              brandCounts: resolvedBrandCounts,
              categoryCounts: resolvedCategoryCounts,
              cachedAt: Date.now(),
            }
          );

          if (shouldScrollTop && typeof window !== "undefined") {
            requestAnimationFrame(() => scrollPageToTop());
          }

          // Prefetch diam-diam halaman berikutnya + thumbnail 400px agar tombol Selanjutnya 0ms!
          prefetchNextPage(
            resolvedPage,
            resolvedTotalPages,
            resolvedTotal,
            resolvedTotalSkus,
            resolvedBrandCounts,
            resolvedCategoryCounts
          );
        } else {
          setProduct(data.data);
          recordRecentSearch(data.data?.article && !["0", "-", "PRODUK BARU"].includes(String(data.data.article).toUpperCase()) ? data.data.article : trimmed);
          const serverSiblings = data.siblings || [];
          setSiblings(serverSiblings);
          setProductsList([]);
          preloadProductImages([data.data?.imageUrl, ...serverSiblings.map((s: any) => s.imageUrl)], 400);

          // Simpan produk & SEMUA siblings ke session cache agar klik/scan varian berikutnya 0ms
          sessionCacheRef.current.set(trimmed.toLowerCase(), { product: data.data, siblings: serverSiblings });
          serverSiblings.forEach((s: ProductData) => {
            if (s.sku) sessionCacheRef.current.set(s.sku.toLowerCase(), { product: s, siblings: serverSiblings });
            if (s.barcode) sessionCacheRef.current.set(s.barcode.toLowerCase(), { product: s, siblings: serverSiblings });
          });

          // Sinkronisasi data live produk & siblings ini ke Dexie agar harga promo selalu tersimpan
          import('@/lib/offlineDb').then(({ db }) => {
            const items = [data.data, ...serverSiblings].map((item: any) => ({
              sku: item.sku,
              barcode: item.barcode || null,
              article: item.article || null,
              name: item.description?.split(':')[0]?.trim() || item.description,
              description: item.description,
              brand: item.brand || null,
              dept: item.dept || null,
              color: item.color || "",
              size: item.size || "",
              hargaNormal: item.hargaNormal,
              hargaPromo: item.hargaPromo || null,
              diskon: item.diskon || null,
              discountType: item.discountType || null,
              acara: item.acara || null,
              stok: item.stok ?? 0,
              toDate: item.toDate || null,
              imageUrl: item.imageUrl || null,
              images: item.images && item.images.length > 0 ? item.images : (item.imageUrl ? [item.imageUrl] : [])
            }));
            db.products.bulkPut(items).catch(() => {});
          });
        }
        if (isScanning) setIsScanning(false);
      } else {
        if (!localData) {
          setError(data.error || "Produk tidak ditemukan");
        }
      }
    } catch {
      if (searchCounterRef.current === currentSearch && !product) {
        try {
          const { searchOfflineSmart, browseOfflineCatalog } = await import('@/lib/offlineDb');
          const offlineMatches = trimmed
            ? await searchOfflineSmart(trimmed, 40, activeBrand, activeCategory)
            : await browseOfflineCatalog(activeBrand, activeCategory, 40);
          if (offlineMatches && offlineMatches.length > 0) {
            const mappedList: ProductData[] = offlineMatches.map((m) => ({
              id: 0,
              sku: m.sku,
              barcode: m.barcode || null,
              article: m.article || null,
              description: m.description || m.name,
              acara: m.acara || null,
              fromDate: null,
              toDate: m.toDate || null,
              hargaNormal: m.hargaNormal,
              hargaPromo: m.hargaPromo || null,
              diskon: m.diskon || null,
              discountType: m.discountType || null,
              brand: m.brand || null,
              dept: m.dept || null,
              color: m.color || null,
              size: m.size || null,
              stok: m.stok ?? 0,
              promoFileName: null,
              imageUrl: m.imageUrl || null,
              images: m.images && m.images.length > 0 ? m.images : (m.imageUrl ? [m.imageUrl] : []),
            }));
            if (mappedList.length === 1 && !hasTaxonomyFilter) {
              setProduct(mappedList[0]);
              setSiblings(mappedList);
              setProductsList([]);
            } else {
              setProductsList(mappedList);
              setResultFilter("ALL");
              setTotalModelsCount(mappedList.length);
              setTotalSkusCount(mappedList.length);
              setCurrentPage(1);
              setTotalPages(1);
            }
            setError("");
            return;
          }
        } catch {}
        setError("Koneksi jaringan lambat & produk belum ditemukan di memori lokal.");
      }
    } finally {
      if (searchCounterRef.current === currentSearch) {
        setLoading(false);
      }
    }
  };

  const handleTextScanSuccess = (sku: string) => {
    if (sku) {
      setManualInput(sku);
      searchProduct(sku);
      setIsScanning(false);
    }
  };

  // State Multi-Warna & Multi-Size Sekaligus dalam 1x Scan (SKU -> Qty)
  const [multiVariantQty, setMultiVariantQty] = useState<Record<string, number>>({});

  // Reset pilihan multi-varian jika pindah ke artikel yang berbeda
  useEffect(() => {
    setMultiVariantQty({});
  }, [product?.article]);

  const adjustVariantQty = (sku: string, delta: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setMultiVariantQty((prev) => {
      const current = prev[sku] || 0;
      const next = Math.max(0, current + delta);
      const copy = { ...prev };
      if (next === 0) {
        delete copy[sku];
      } else {
        copy[sku] = next;
      }
      return copy;
    });
  };

  const addToCart = (type: string, qty: number, size: string, keepOpen: boolean = false) => {
    if (!product) return;

    // Gabungkan jika SKU & tipe yang sama sudah ada di keranjang
    const existingIdx = cart.findIndex((c) => c.sku === product.sku && c.type === type);
    let nextCart: any[];
    if (existingIdx !== -1) {
      nextCart = [...cart];
      nextCart[existingIdx] = {
        ...nextCart[existingIdx],
        qty: (nextCart[existingIdx].qty || 1) + qty,
      };
    } else {
      nextCart = [
        ...cart,
        {
          sku: product.sku,
          productName: product.description,
          type,
          qty,
          size,
          photoUrl: product.imageUrl || null,
          ocrData: null,
        },
      ];
    }

    updateCart(nextCart);
    setQty(1);

    if (keepOpen) {
      showToast(`+${qty} pcs (${size || product.sku}) masuk keranjang! Silakan pilih warna/size lain.`, "success");
      return;
    }

    setProduct(null);
    setManualInput("");
    setMultiVariantQty({});
    showToast(`Berhasil ditambahkan ke daftar. Total: ${nextCart.length} item`);
    if (continuousMode) {
      setIsScanning(true);
    }
  };

  const addMultipleVariantsToCart = (type: string, keepOpen: boolean = false) => {
    if (!product) return;
    const allSibs = siblings && siblings.length > 0 ? siblings : [product];
    const selectedEntries = Object.entries(multiVariantQty).filter(([, q]) => q > 0);
    if (selectedEntries.length === 0) return;

    let nextCart = [...cart];
    let totalPcsAdded = 0;

    for (const [targetSku, selectedQty] of selectedEntries) {
      const sib = allSibs.find((s) => s.sku === targetSku);
      if (!sib) continue;
      const sibInfo = parseProductInfo(sib);
      const itemSize = sibInfo.size || sib.size || "";
      totalPcsAdded += selectedQty;

      const existingIdx = nextCart.findIndex((c) => c.sku === sib.sku && c.type === type);
      if (existingIdx !== -1) {
        nextCart[existingIdx] = {
          ...nextCart[existingIdx],
          qty: (nextCart[existingIdx].qty || 1) + selectedQty,
        };
      } else {
        nextCart.push({
          sku: sib.sku,
          productName: sib.description,
          type,
          qty: selectedQty,
          size: itemSize,
          photoUrl: sib.imageUrl || product.imageUrl || null,
          ocrData: null,
        });
      }
    }

    updateCart(nextCart);
    setMultiVariantQty({});
    setQty(1);

    if (keepOpen) {
      showToast(`Berhasil menambahkan ${selectedEntries.length} varian (${totalPcsAdded} pcs) ke keranjang!`, "success");
      return;
    }

    setProduct(null);
    setManualInput("");
    showToast(`Mantap! ${selectedEntries.length} warna/size (${totalPcsAdded} pcs) masuk keranjang!`, "success");
    if (continuousMode) {
      setIsScanning(true);
    }
  };

  const submitCart = async () => {
    if (cart.length === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: cart })
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`${cart.length} tiket berhasil dikirim ke Gudang!`);
        updateCart([]);
      } else if (res.status === 401) {
        // Sesi pindah tab/belum login: Pastikan keranjang tetap tersimpan di localStorage lalu arahkan ke login!
        updateCart(cart);
        showToast("Sesi login berpindah tab. Keranjang Anda aman, mengarahkan ke halaman login...", "info");
        setTimeout(() => {
          window.location.href = "/login?reason=session_expired_cart_saved";
        }, 900);
      } else {
        showToast(data.error || "Gagal mengirim tiket", "error");
      }
    } catch (err) {
      showToast("Terjadi kesalahan jaringan", "error");
    } finally {
      setSubmitting(false);
      mutateTickets(); // refresh list after submit
    }
  };

  const handleClear = () => {
    setManualInput("");
    setProduct(null);
    setSiblings([]);
    setProductsList([]);
    setResultFilter("ALL");
    setSelectedBrandGroup("ALL");
    setSelectedCategory("ALL");
    setTaxonomyBrandCounts(null);
    setTaxonomyCategoryCounts(null);
    setTotalModelsCount(0);
    setTotalSkusCount(0);
    setMultiVariantQty({});
    setError("");
    setQty(1);
    inputRef.current?.focus();
  };

  // Cek apakah promo sudah habis berdasarkan toDate
  let isPromoExpired = false;
  if (product && product.toDate) {
    const toDateObj = new Date(product.toDate);
    if (!isNaN(toDateObj.getTime())) {
      // Set to end of the day to ensure promo is valid during that entire day
      toDateObj.setHours(23, 59, 59, 999);
      if (new Date() > toDateObj) {
        isPromoExpired = true;
      }
    }
  }

  const isBogoPromo = product && product.discountType && (/B\dG\d|B\dD\d+|B\dX\d+/i.test(product.discountType) || /BELI \d+ (GRATIS|DISKON) \d+/i.test(product.discountType)) && !isPromoExpired;
  const isPercentPromo = product && product.discountType && product.discountType.includes('%') && !isPromoExpired;
  const hasHargaPromo = product && product.hargaPromo && product.hargaPromo > 0 && product.hargaPromo !== product.hargaNormal;
  const isOnPromo = (hasHargaPromo || isBogoPromo || isPercentPromo) && !isPromoExpired;
  
  const discountPct = (hasHargaPromo && product)
    ? Math.round(((product.hargaNormal - product.hargaPromo!) / product.hargaNormal) * 100)
    : 0;

  const handleRefresh = async () => {
    window.location.reload();
  };
  const handlePrintLabel = () => {
    if (!product) return;
    try {
      import("jspdf").then(({ jsPDF }) => {
        const doc = new jsPDF({
          orientation: "landscape",
          unit: "mm",
          format: [70, 40]
        });

        doc.setDrawColor(0);
        doc.setLineWidth(0.5);
        doc.rect(2, 2, 66, 36);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.text(product.brand || "SUKO", 35, 6, { align: "center" });
        doc.line(2, 8, 68, 8);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        const nameLines = doc.splitTextToSize(product.description.substring(0, 50), 62);
        doc.text(nameLines, 35, 12, { align: "center" });

        doc.setFont("helvetica", "bold");
        if (isOnPromo) {
           doc.setFontSize(9);
           doc.text(`Normal: ${formatRupiah(product.hargaNormal)}`, 35, 20, { align: "center" });
           doc.line(25, 19, 45, 19); 
           doc.setFontSize(14);
           doc.text(formatRupiah(product.hargaPromo!), 35, 26, { align: "center" });
           doc.setFontSize(6);
           doc.text("PROMO", 35, 29, { align: "center" });
        } else {
           doc.setFontSize(14);
           doc.text(formatRupiah(product.hargaNormal), 35, 24, { align: "center" });
        }

        doc.line(2, 32, 68, 32);
        doc.setFontSize(8);
        doc.text(`SKU: ${product.sku}`, 35, 36, { align: "center" });

        doc.save(`PriceTag_${product.sku}.pdf`);
        showToast("PDF Label berhasil diunduh!");
      });
    } catch (e) {
      showToast("Gagal membuat PDF", "error");
    }
  };

  return (
    <>
    {/* Toast Notification */}
    {toast && (
      <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-10 duration-300 font-bold text-sm whitespace-nowrap ${
        toast.type === 'success' ? 'bg-emerald-600 text-white' : (toast.type === 'info' ? 'bg-indigo-600 text-white' : 'bg-red-600 text-white')
      }`}>
        {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : (toast.type === 'info' ? <Bell className="w-5 h-5" /> : <XCircle className="w-5 h-5" />)}
        <span>{toast.message}</span>
      </div>
    )}



    <div className="w-full h-full">
      <div className={`flex flex-col lg:flex-row gap-6 max-w-7xl mx-auto w-full ${cart.length > 0 ? 'pb-32' : 'pb-6'}`}>
        <div className="flex-1 flex flex-col w-full">
          {/* Slim Dark Cockpit Header + Integrated Mode Tabs + System Status */}
          <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 lg:rounded-2xl rounded-b-2xl px-3.5 pt-4 pb-3 shadow-lg border-b border-indigo-500/20 lg:border text-white mb-3">
            {/* Row 1: User Profile & Active/Break Toggle */}
            {user && (
              <div className="flex justify-between items-center gap-2 pb-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 bg-white/10 rounded-full flex items-center justify-center backdrop-blur-sm border border-white/20 shrink-0">
                    <UserCircle2 className="w-5 h-5 text-blue-200" />
                  </div>
                  <Link href="/profile" className="group cursor-pointer min-w-0 flex flex-col items-start">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h1 className="font-bold text-sm leading-tight group-hover:text-blue-200 transition-colors truncate max-w-[165px] sm:max-w-xs">
                        {user.name.replace(/\s*\(Developer\)/i, '').trim()}
                      </h1>
                      {user.name?.toLowerCase().includes('developer') && (
                        <span className="text-[9px] font-black bg-indigo-500/40 text-indigo-100 border border-indigo-400/40 px-1.5 py-0.5 rounded uppercase tracking-wider">
                          DEV
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-blue-200/80 font-medium tracking-wide uppercase truncate">
                      {user.jobTitle || 'Sales Area'} • by luqman org
                    </p>
                  </Link>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <div
                    className={`relative flex p-0.5 rounded-full shadow-inner w-[88px] md:w-24 h-7 cursor-pointer border transition-colors ${togglingStatus ? 'opacity-50 pointer-events-none' : ''} ${user.status === 'ACTIVE' ? 'bg-slate-950/60 border-white/15' : 'bg-slate-950/80 border-amber-400/30'}`}
                    onClick={toggleStatus}
                  >
                    <div
                      className={`absolute top-0.5 bottom-0.5 w-[calc(50%-2px)] rounded-full shadow-sm transition-all duration-300 ease-in-out ${user.status === 'ACTIVE' ? 'bg-emerald-500 left-0.5' : 'bg-amber-500 left-[50%]'}`}
                    />
                    <div className={`relative flex-1 flex items-center justify-center text-[9px] font-black z-10 transition-colors duration-300 ${user.status === 'ACTIVE' ? 'text-white' : 'text-slate-400'}`}>
                      AKTIF
                    </div>
                    <div className={`relative flex-1 flex items-center justify-center text-[9px] font-black z-10 transition-colors duration-300 ${user.status === 'BREAK' ? 'text-white' : 'text-slate-400'}`}>
                      REHAT
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Row 2: Integrated Mode Selector Tabs */}
            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-950/45 rounded-xl border border-white/10">
              <button
                type="button"
                onClick={() => setActiveTab("FACING_OUT")}
                className={`py-2 px-2 rounded-lg flex items-center justify-center gap-1.5 text-xs transition-all cursor-pointer ${
                  activeTab === "FACING_OUT"
                    ? "bg-white text-amber-600 font-bold shadow-sm"
                    : "text-slate-300 font-medium hover:text-white hover:bg-white/5"
                }`}
              >
                <Package2 className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Facing Out</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("STOCK_CHECK")}
                className={`py-2 px-2 rounded-lg flex items-center justify-center gap-1.5 text-xs transition-all cursor-pointer ${
                  activeTab === "STOCK_CHECK"
                    ? "bg-white text-indigo-700 font-bold shadow-sm"
                    : "text-slate-300 font-medium hover:text-white hover:bg-white/5"
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Tanya Stok</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("ORDERS")}
                className={`py-2 px-2 rounded-lg flex items-center justify-center gap-1.5 text-xs transition-all cursor-pointer ${
                  activeTab === "ORDERS"
                    ? "bg-white text-amber-700 font-bold shadow-sm"
                    : "text-slate-300 font-medium hover:text-white hover:bg-white/5"
                }`}
              >
                <div className="relative shrink-0">
                  <Bell className={`w-3.5 h-3.5 ${activeTab === 'ORDERS' ? 'text-amber-600' : 'text-slate-300'}`} />
                  {(pendingCount > 0 || processedCount > 0) && (
                    <span className="absolute -top-1 -right-1 flex h-2 w-2">
                      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${processedCount > 0 ? 'bg-emerald-400' : 'bg-amber-400'}`}></span>
                      <span className={`relative inline-flex rounded-full h-2 w-2 border border-slate-900 ${processedCount > 0 ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                    </span>
                  )}
                </div>
                <span className="truncate">Cek Pesanan</span>
              </button>
            </div>

            {/* Row 3: Slim System Status Strip + Info Ukuran Cache HP */}
            <div className="mt-2.5 flex items-center justify-between gap-2 bg-white/10 border border-white/10 rounded-xl px-2.5 py-1.5 text-[10px]">
              <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                <span className="inline-flex items-center gap-1.5 text-slate-200 font-semibold shrink-0">
                  <span className={`w-2 h-2 rounded-full ${lastUpdateDate === 'Memuat...' ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400 shadow-[0_0_6px_#34d399]'}`} />
                  <span className="truncate max-w-[140px] sm:max-w-none">{lastUpdateDate}</span>
                </span>
                {localCacheStats?.ready ? (
                  <span
                    title={`Seluruh ${localCacheStats.skuCount.toLocaleString('id-ID')} SKU (${localCacheStats.modelCount.toLocaleString('id-ID')} model) sudah tersimpan lokal di HP (~${localCacheStats.sizeMB} MB)`}
                    className="inline-flex items-center gap-1 bg-emerald-400/20 text-emerald-100 px-2 py-0.5 rounded-md border border-emerald-300/25 font-bold"
                  >
                    ⚡ HP Siap (~{localCacheStats.sizeMB || 32} MB • {localCacheStats.skuCount.toLocaleString('id-ID')} SKU)
                  </span>
                ) : updateData?.pillars?.mdsBisa ? (
                  <span className="hidden sm:inline-flex items-center gap-1 bg-cyan-400/15 text-cyan-200 px-2 py-0.5 rounded-md border border-cyan-300/20 font-semibold">
                    by luqman org: {updateData.pillars.mdsBisa.records.toLocaleString('id-ID')}
                  </span>
                ) : null}
                {updateData?.pillars?.promo && (
                  <span className="hidden md:inline-flex items-center gap-1 bg-indigo-400/20 text-indigo-100 px-1.5 py-0.5 rounded-md border border-indigo-300/20 font-semibold">
                    Promo: {updateData.pillars.promo.records.toLocaleString('id-ID')}
                  </span>
                )}
              </div>
              {!hasNewUpdate && (
                <button
                  type="button"
                  onClick={() => handleManualSync()}
                  disabled={isSyncing}
                  title="Unduh / sinkronkan seluruh 97rb+ SKU (~32 MB) ke memori HP agar pencarian & paginasi 0ms"
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/15 hover:bg-white/25 text-white font-bold transition-colors shrink-0 cursor-pointer ${isSyncing ? 'opacity-50' : ''}`}
                >
                  <CloudDownload className={`w-3.5 h-3.5 ${isSyncing ? 'animate-bounce text-cyan-300' : ''}`} />
                  <span className="hidden sm:inline">{localCacheStats?.ready ? "Sync" : "Unduh (~32 MB)"}</span>
                </button>
              )}
            </div>
          </div>

      {/* Main Content Wrapper */}
      <div className="px-3.5 lg:px-0 flex flex-col gap-3.5">

        {/* Update Alert Banner */}
        {hasNewUpdate && (
          <div className="bg-rose-500 rounded-xl p-3 shadow-md border border-rose-600 flex items-center justify-between animate-in slide-in-from-top-2 gap-3">
            <div className="flex items-center gap-3">
              <CloudDownload className="w-6 h-6 text-white animate-bounce shrink-0" />
              <div>
                <p className="text-white font-black text-sm uppercase tracking-wide leading-tight">Pembaruan Tersedia!</p>
                <p className="text-rose-100 text-[10px] font-medium leading-tight mt-0.5">Update data promo, harga, dan fitur sistem terbaru.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleManualSync()}
                disabled={isSyncing}
                className={`px-3 py-2 bg-white text-rose-600 font-black text-xs rounded-lg hover:bg-rose-50 transition-colors shadow-sm shrink-0 whitespace-nowrap cursor-pointer ${isSyncing ? 'opacity-50' : ''}`}
              >
                {isSyncing ? "UPDATE..." : "UPDATE SEKARANG"}
              </button>
              <button
                onClick={() => {
                  const targetVersion = serverVersion || Date.now().toString();
                  localStorage.setItem("suko_server_version", targetVersion);
                  localStorage.setItem("suko_dismissed_update", targetVersion);
                  setLocalVersion(targetVersion);
                  setDismissedVersion(targetVersion);
                  setHasAppCodeUpdate(false);
                }}
                title="Tutup pemberitahuan"
                className="p-1.5 text-white/80 hover:text-white hover:bg-rose-600 rounded-lg transition-colors cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      {/* Logout Summary Modal (Portal) */}
      {mounted && showSummary && createPortal(
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm z-[99990] p-4 flex flex-col justify-center items-center">
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95 duration-200 border border-slate-100">
            <div className="bg-gradient-to-r from-slate-800 to-slate-900 p-6 text-white text-center">
              <h2 className="text-xl font-black">Ingin Mengakhiri Shift & Keluar?</h2>
              <p className="text-slate-300 text-xs mt-1">Aktivitas Kerja (Daily Activity) Anda Hari Ini</p>
            </div>
            
            <div className="p-6 bg-slate-50">
              {loadingSummary ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-800" />
                </div>
              ) : shiftSummary ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white border p-3 rounded-xl shadow-sm text-center">
                      <p className="text-xs text-slate-500 font-bold uppercase mb-1">Total Tiket</p>
                      <p className="text-2xl font-black text-slate-800">{shiftSummary.total}</p>
                    </div>
                    <div className="bg-green-50 border border-green-100 p-3 rounded-xl shadow-sm text-center">
                      <p className="text-xs text-green-600 font-bold uppercase mb-1">Diambil/Selesai</p>
                      <p className="text-2xl font-black text-green-700">{shiftSummary.completed}</p>
                    </div>
                    <div className="bg-red-50 border border-red-100 p-3 rounded-xl shadow-sm text-center">
                      <p className="text-xs text-red-600 font-bold uppercase mb-1">OOS / Habis</p>
                      <p className="text-2xl font-black text-red-700">{shiftSummary.rejected}</p>
                    </div>
                    <div className="bg-amber-50 border border-amber-100 p-3 rounded-xl shadow-sm text-center">
                      <p className="text-xs text-amber-600 font-bold uppercase mb-1">Menunggu</p>
                      <p className="text-2xl font-black text-amber-700">{shiftSummary.pending}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-center text-slate-500">Gagal memuat rekap data.</p>
              )}
            </div>

            <div className="p-4 border-t flex flex-col gap-3 bg-white">
              <button 
                onClick={confirmLogout}
                className="w-full bg-red-600 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-red-200 hover:bg-red-700 transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                Ya, Akhiri Shift & Logout
              </button>
              <button 
                onClick={() => setShowSummary(false)}
                className="w-full bg-slate-100 text-slate-700 font-bold py-3.5 rounded-xl hover:bg-slate-200 transition-all"
              >
                Batal (Tetap di Aplikasi)
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Full Screen Download Overlay if Syncing Data Offline */}
      {mounted && isSyncing && createPortal(
        <div className="fixed inset-0 z-[99999] bg-slate-950/75 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-in fade-in duration-300 select-none">
          <div className="bg-white/95 backdrop-blur-xl border border-white/50 rounded-3xl p-8 sm:p-10 shadow-2xl flex flex-col items-center max-w-xs w-full text-center">
            <ShiftLoader progress={syncProgress} />
            <div className="mt-8 flex flex-col items-center gap-1.5">
              <h3 className="text-base sm:text-lg font-black text-slate-800 tracking-wider">
                MENYINKRONKAN DATA
              </h3>
              <p className="text-xs text-slate-500 font-medium leading-relaxed">
                Mengunduh data harga, promo & gambar terbaru...
              </p>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Full Screen Centered Logout Loader (Portal) */}
      {mounted && isLoggingOut && createPortal(
        <div className="fixed inset-0 z-[99999] bg-slate-950/75 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-in fade-in duration-300 select-none">
          <div className="bg-white/95 backdrop-blur-xl border border-white/50 rounded-3xl p-8 sm:p-10 shadow-2xl flex flex-col items-center max-w-xs w-full text-center">
            <ShiftLoader />
            <div className="mt-8 flex flex-col items-center gap-1.5">
              <h3 className="text-base sm:text-lg font-black text-slate-800 tracking-wider">
                MENGAKHIRI SHIFT
              </h3>
              <p className="text-xs text-slate-500 font-medium leading-relaxed">
                Menyimpan sesi & keluar dengan aman...
              </p>
            </div>
          </div>
        </div>,
        document.body
      )}

      {activeTab === "ORDERS" ? (
        <div className="pt-2 flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <h2 className="text-sm font-bold text-slate-500 uppercase mb-1">Daftar Pesanan Aktif</h2>
          {activeTickets.length === 0 ? (
            <div className="flex flex-col items-center py-12 opacity-50 bg-slate-50 rounded-2xl border-2 border-dashed">
              <CheckCircle2 className="w-12 h-12 mb-2 text-slate-400" />
              <p className="text-center font-bold text-slate-500">Tidak ada pesanan aktif.</p>
              <p className="text-xs text-center mt-1">Semua pesanan sudah selesai.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {activeTickets.map((t: any) => {
                const itemImage = t.imageUrl || t.photoUrl;
                return (
                <div key={t.id} className="bg-white border shadow-sm p-4 rounded-xl flex flex-col gap-3">
                  <div className="flex justify-between items-start gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      {itemImage && (
                        <div 
                          onClick={() => setOrderPreviewImage({ url: itemImage, title: t.productName || t.sku, sku: t.sku })}
                          className="w-16 h-16 rounded-xl overflow-hidden shrink-0 border border-slate-200 cursor-pointer group relative bg-slate-50"
                          title="Perbesar foto"
                        >
                          <img 
                            src={itemImage} 
                            alt={t.sku} 
                            className="w-full h-full object-cover transition-transform group-hover:scale-105"
                          />
                          <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                            <Maximize2 className="w-3.5 h-3.5 drop-shadow" />
                          </div>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <span className="text-[10px] font-bold uppercase text-slate-400">
                          {t.type === 'REQUEST' ? 'Request' : t.type === 'FACING_OUT' ? 'Facing Out' : 'Tanya Stok'}
                        </span>
                        <div className="flex flex-wrap items-center gap-2 mt-0.5">
                          {t.article && !["0", "-", "PRODUK BARU"].includes(String(t.article).trim().toUpperCase()) && (
                            <span className="font-mono font-black text-sm bg-slate-900 text-white px-2 py-0.5 rounded-md">
                              {t.article}
                            </span>
                          )}
                          <span className="font-black text-base text-slate-800">{t.sku}</span>
                        </div>
                        <p className="text-sm font-bold text-slate-700 leading-snug whitespace-normal break-words mt-1">{t.productName}</p>
                        {(t.color || t.productSize || t.size || t.qty) && (
                          <p className="text-xs font-semibold text-slate-500 mt-1">
                            {[t.color, t.size || t.productSize ? `Size ${t.size || t.productSize}` : null, t.qty ? `${t.qty} pcs` : null].filter(Boolean).join(" • ")}
                          </p>
                        )}
                        {t.hargaNormal > 0 && (
                          <p className="text-xs font-semibold text-blue-600 mt-0.5">Rp {t.hargaNormal.toLocaleString('id-ID')}</p>
                        )}
                        <p className="text-xs font-medium text-slate-500 mt-0.5">{new Date(t.createdAt).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}</p>
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold px-3 py-1.5 rounded-full border uppercase tracking-wider shrink-0 ${
                      t.status === 'READY' ? 'bg-green-50 text-green-700 border-green-200' :
                      t.status === 'OOS' ? 'bg-red-50 text-red-700 border-red-200' :
                      'bg-amber-50 text-amber-700 border-amber-200'
                    }`}>
                      {t.status === 'READY' ? 'READY (Ada)' : t.status === 'OOS' ? 'KOSONG' : 'MENUNGGU'}
                    </span>
                  </div>
                  
                  {/* Action to clear it from list */}
                  {(t.status === 'READY' || t.status === 'OOS') && (
                    <button 
                      onClick={() => markAsCompleted(t.id)}
                      className="w-full mt-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-lg text-sm transition-colors active:scale-95"
                    >
                      Selesai & Tutup Pesanan
                    </button>
                  )}
                </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Compact 1-Row Search & Scan Cockpit */}
          <div className="flex flex-col gap-2.5 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Cari Info Produk</h2>
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200/80">
                <Sparkles className="w-3 h-3 text-indigo-600" />
                AI Smart • Artikel, SKU & Teks
              </span>
            </div>

            <div className="flex gap-2 items-center">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 pointer-events-none" />
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Ketik Artikel, SKU, Barcode, atau Nama Produk..."
                  className="w-full pl-9 pr-9 py-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 transition-all text-sm font-medium shadow-xs placeholder:text-slate-400"
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && searchProduct(manualInput)}
                  autoFocus
                />
                {manualInput && (
                  <button
                    type="button"
                    onClick={handleClear}
                    title="Hapus pencarian"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-colors cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setIsScanning(!isScanning)}
                title="Scan Barcode Produk"
                className={`p-3 rounded-xl border transition-all shadow-xs shrink-0 cursor-pointer flex items-center justify-center ${
                  isScanning
                    ? "bg-emerald-600 text-white border-emerald-700 ring-2 ring-emerald-200"
                    : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                }`}
              >
                <Barcode className="w-5 h-5" />
              </button>

              <button
                type="button"
                onClick={() => searchProduct(manualInput)}
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white px-4 sm:px-5 py-3 rounded-xl transition-all font-bold shadow-sm text-sm shrink-0 cursor-pointer disabled:opacity-60"
              >
                Cari
              </button>
            </div>

            {/* Bar Filter Pemisah Brand (SUKO, Mu+Ku, ZES) & Pengelompokan Kategori */}
            {!product && (
              <div className="bg-white rounded-xl border border-slate-200/80 p-2.5 shadow-2xs flex flex-col gap-2">
                {/* Bar 1: Pemisah Produk Brand Toko */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider shrink-0 mr-0.5">
                    Brand:
                  </span>
                  {BRAND_GROUP_OPTIONS.map((opt) => {
                    const isActive = selectedBrandGroup === opt.key;
                    const countVal = taxonomyBrandCounts?.[opt.key];
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => handleBrandFilterChange(opt.key)}
                        className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-all whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1 ${
                          isActive ? opt.activeClass : opt.idleClass
                        }`}
                      >
                        <span>{opt.shortLabel}</span>
                        {typeof countVal === "number" && (selectedBrandGroup === "ALL" || isActive) && (
                          <span className={`text-[9px] px-1 rounded ${isActive ? "bg-white/20 text-white" : "bg-black/5 text-slate-500"}`}>
                            {countVal}
                          </span>
                        )}
                      </button>
                    );
                  })}
                  {(selectedBrandGroup !== "ALL" || selectedCategory !== "ALL") && (
                    <button
                      type="button"
                      onClick={handleResetTaxonomyFilters}
                      className="ml-auto text-[10px] font-bold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2 py-1 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Reset Filter
                    </button>
                  )}
                </div>

                {/* Bar 2: Pengelompokan Kategori Produk */}
                <div className="flex items-center gap-1.5 overflow-x-auto pt-1 border-t border-slate-100">
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider shrink-0 mr-0.5">
                    Kategori:
                  </span>
                  {CATEGORY_OPTIONS.map((cat) => {
                    const isActive = selectedCategory === cat.key;
                    const countVal = taxonomyCategoryCounts?.[cat.key];
                    return (
                      <button
                        key={cat.key}
                        type="button"
                        onClick={() => handleCategoryFilterChange(cat.key)}
                        className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-all whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1 ${
                          isActive
                            ? "bg-indigo-600 text-white border-indigo-700 shadow-xs"
                            : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200"
                        }`}
                      >
                        <span>{cat.icon}</span>
                        <span>{cat.shortLabel}</span>
                        {typeof countVal === "number" && (selectedCategory === "ALL" || isActive) && countVal > 0 && (
                          <span className={`text-[9px] px-1 rounded ${isActive ? "bg-white/20 text-white" : "bg-slate-200/70 text-slate-600"}`}>
                            {countVal}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Idle Quick Recent Chips & 2-Column Shortcut Banners */}
            {!product && productsList.length === 0 && !loading && selectedBrandGroup === "ALL" && selectedCategory === "ALL" && (
              <div className="flex flex-col gap-2.5 pt-0.5">
                {recentSearches.length > 0 && (
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase shrink-0">Terakhir:</span>
                    {recentSearches.map((term) => (
                      <button
                        key={term}
                        type="button"
                        onClick={() => {
                          setManualInput(term);
                          searchProduct(term);
                        }}
                        className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-white hover:bg-blue-50 hover:text-blue-700 text-slate-600 border border-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-2xs"
                      >
                        {term}
                      </button>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2.5">
                  <Link href="/barang-baru" className="block group">
                    <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl p-3 text-white shadow-sm hover:shadow-md transition-all flex items-center justify-between gap-2 h-full">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="bg-white/20 p-1.5 rounded-lg backdrop-blur-sm shrink-0">
                          <Sparkles className="w-4 h-4 text-yellow-200" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-black text-xs sm:text-sm leading-tight truncate">Barang Baru!</h3>
                          <p className="text-[10px] text-emerald-50/90 leading-tight truncate mt-0.5">Produk baru masuk</p>
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-emerald-100 shrink-0 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </Link>

                  <Link href="/promo-unik" className="block group">
                    <div className="bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl p-3 text-white shadow-sm hover:shadow-md transition-all flex items-center justify-between gap-2 h-full">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="bg-white/20 p-1.5 rounded-lg backdrop-blur-sm shrink-0">
                          <Gift className="w-4 h-4 text-pink-200" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-black text-xs sm:text-sm leading-tight truncate">Promo BOGO</h3>
                          <p className="text-[10px] text-purple-50/90 leading-tight truncate mt-0.5">BG, diskon &amp; unik</p>
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-purple-100 shrink-0 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </Link>
                </div>
              </div>
            )}
          </div>

      {/* Full Screen Barcode Scanner */}
      {isScanning && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col animate-in fade-in zoom-in-95 duration-300">
          <div className="flex justify-between items-center p-4 bg-slate-900 text-white shadow-md z-10 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Barcode className="w-5 h-5 text-emerald-400" />
              <h3 className="font-bold text-sm sm:text-base">Scan Barcode Produk (EAN-13 / UPC)</h3>
            </div>
            <button onClick={() => setIsScanning(false)} className="p-2 bg-slate-800 rounded-full hover:bg-slate-700 transition-colors">
              <X className="w-6 h-6 text-white" />
            </button>
          </div>
          <div className="flex-1 w-full h-full relative overflow-hidden bg-black">
            <div className="absolute inset-0 w-full h-full max-w-2xl mx-auto">
              <TextScanner onScanResult={handleTextScanSuccess} />
            </div>
          </div>
        </div>
      )}



      {/* Loading Indicator */}
      {loading && (
        <div className="bg-blue-50/90 border border-blue-200 text-blue-700 rounded-xl px-3.5 py-2.5 flex items-center justify-center gap-2 text-xs font-bold animate-pulse">
          <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
          <span>Memuat katalog &amp; stok produk...</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-xl text-center border border-red-200 text-sm font-medium animate-in zoom-in duration-200">
          {error}
        </div>
      )}

      {/* Konsep 3: Hasil Pencarian / Katalog Brand & Kategori */}
      {productsList.length > 0 && (() => {
        const isProductOnPromo = (item: ProductData) =>
          Boolean(
            item.articleHasPromo ||
            (item.hargaPromo && item.hargaPromo > 0 && (!item.hargaNormal || item.hargaPromo < item.hargaNormal)) ||
            item.diskon ||
            item.acara
          );
        const getTotalStock = (item: ProductData) => item.articleTotalStok ?? item.stok ?? 0;

        const stockCount = productsList.filter((item) => getTotalStock(item) > 0).length;
        const promoCount = productsList.filter((item) => isProductOnPromo(item)).length;
        const modelCount = totalModelsCount || productsList.length;

        const filteredProducts = productsList.filter((item) => {
          if (resultFilter === "STOCK") return getTotalStock(item) > 0;
          if (resultFilter === "PROMO") return isProductOnPromo(item);
          return true;
        });

        const getItemCategory = (item: ProductData): ResolvedCategoryKey =>
          item.categoryKey || classifyProductCategory(item);

        const getItemBrandGroup = (item: ProductData): ResolvedBrandGroup =>
          item.brandGroup || classifyBrandGroup(item);

        // Kelompokkan per kategori jika mode Kelompok Kategori aktif & kategori filter masih "ALL"
        const groupedSections =
          groupByCategory && selectedCategory === "ALL"
            ? CATEGORY_DISPLAY_ORDER.map((catKey) => ({
                catKey,
                label: CATEGORY_LABELS[catKey],
                icon: CATEGORY_OPTIONS.find((o) => o.key === catKey)?.icon || "📦",
                items: filteredProducts.filter((item) => getItemCategory(item) === catKey),
              })).filter((sec) => sec.items.length > 0)
            : [];

        const shouldRenderCategorySections = groupedSections.length > 0 && groupByCategory && selectedCategory === "ALL";

        const activeBrandLabel = selectedBrandGroup !== "ALL" ? getBrandGroupMeta(selectedBrandGroup).shortLabel : null;
        const activeCatLabel = selectedCategory !== "ALL" ? CATEGORY_LABELS[selectedCategory] : null;
        const headerPrefix = manualInput.trim() ? "Hasil Pencarian" : "Katalog Produk";

        const renderProductCard = (p: ProductData) => {
          const info = parseProductInfo(p);
          const cleanArticle =
            p.article && !["0", "-", "PRODUK BARU"].includes(p.article.trim().toUpperCase())
              ? p.article.trim()
              : null;
          const hasLowerPromoPrice = Boolean(
            p.hargaPromo && p.hargaPromo > 0 && (!p.hargaNormal || p.hargaPromo < p.hargaNormal)
          );
          const hasPromo = isProductOnPromo(p);
          const promoBadge =
            p.articlePromoLabel ||
            p.diskon ||
            (hasLowerPromoPrice ? "PROMO" : p.acara ? "ACARA" : null);
          const displayPrice = hasLowerPromoPrice ? (p.hargaPromo || p.hargaNormal) : p.hargaNormal;
          const totalStok = getTotalStock(p);
          const variantCount = p.articleGroupCount ?? 1;
          const brandGroup = getItemBrandGroup(p);
          const brandMeta = getBrandGroupMeta(brandGroup);
          const catKey = getItemCategory(p);
          const colorsSummary =
            p.articleColors && p.articleColors.length > 0
              ? p.articleColors.slice(0, 2).join(", ") +
                (p.articleColors.length > 2 ? ` +${p.articleColors.length - 2}` : "")
              : info.color;
          const sizesSummary =
            p.articleSizes && p.articleSizes.length > 1
              ? `${p.articleSizes[0]}–${p.articleSizes[p.articleSizes.length - 1]}`
              : p.articleSizes?.[0] || info.size;

          return (
            <button
              key={cleanArticle ? `${cleanArticle}-${p.sku}` : (p.id || p.sku)}
              type="button"
              onClick={() => {
                setProduct(p);
                setSiblings([p]);
                setProductsList([]);
                setManualInput(p.sku);
                scrollPageToTop();
                searchProduct(p.sku, 1, false, "ALL", "ALL");
              }}
              className="group text-left bg-white border border-slate-200 hover:border-blue-400 hover:shadow-md rounded-xl overflow-hidden transition-all flex flex-col h-full cursor-pointer"
            >
              {/* Clean Portrait Product Photo (Zero Overlay Badges) */}
              <div className="w-full aspect-[3/4] bg-slate-50 shrink-0 overflow-hidden border-b border-slate-100">
                {p.imageUrl ? (
                  <img
                    src={optimizeRetailImageUrl(p.imageUrl, 400)}
                    alt={info.name}
                    loading="eager"
                    decoding="sync"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-300 gap-1">
                    <Package2 className="w-7 h-7" />
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">No Foto</span>
                  </div>
                )}
              </div>

              {/* Card Body (Brand SUKO/Mu+Ku/ZES, Artikel, Kategori, Promo Tag, & Harga di Samping/Bawah) */}
              <div className="flex-1 p-2 sm:p-2.5 flex flex-col justify-between min-w-0">
                <div>
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="text-[9px] sm:text-[10px] font-mono font-bold bg-slate-900 text-white px-1.5 py-0.5 rounded">
                      {cleanArticle || p.sku}
                    </span>
                    {brandGroup !== "OTHER" ? (
                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${brandMeta.badgeClass}`}>
                        {brandMeta.shortLabel}
                      </span>
                    ) : (
                      p.brand && (
                        <span className="text-[9px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 px-1.5 py-0.5 rounded truncate max-w-[85px]">
                          {p.brand}
                        </span>
                      )
                    )}
                    {variantCount > 1 && (
                      <span className="text-[9px] font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                        {variantCount} var
                      </span>
                    )}
                  </div>

                  <p className="font-bold text-slate-900 text-[11px] sm:text-xs leading-snug line-clamp-2 mt-1.5 group-hover:text-blue-700 transition-colors">
                    {info.name}
                  </p>

                  <div className="flex flex-wrap gap-1 mt-1">
                    <span className="text-[9px] font-semibold bg-indigo-50/70 text-indigo-700 border border-indigo-100 px-1.5 py-0.5 rounded">
                      {CATEGORY_LABELS[catKey]}
                    </span>
                    {colorsSummary && (
                      <span className="text-[9px] font-semibold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded truncate max-w-full">
                        {colorsSummary}
                      </span>
                    )}
                    {sizesSummary && (
                      <span className="text-[9px] font-semibold bg-blue-50 text-blue-700 border border-blue-100 px-1.5 py-0.5 rounded">
                        {sizesSummary}
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-2 pt-1.5 border-t border-slate-100 flex flex-col gap-1">
                  {hasPromo && promoBadge && (
                    <span className="inline-block self-start text-[9px] font-black px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 uppercase tracking-tight max-w-full truncate">
                      {promoBadge}
                    </span>
                  )}
                  <div className="flex items-end justify-between gap-1">
                    <div className="min-w-0">
                      {hasLowerPromoPrice && p.hargaNormal > (p.hargaPromo || 0) && (
                        <p className="text-[9px] text-slate-400 line-through leading-none">
                          {formatRupiah(p.hargaNormal)}
                        </p>
                      )}
                      <p className={`text-xs font-black leading-tight truncate ${hasLowerPromoPrice ? 'text-rose-600' : 'text-blue-700'}`}>
                        {formatRupiah(displayPrice)}
                      </p>
                    </div>

                    <span
                      className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded border shrink-0 ${
                        totalStok > 0
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-rose-50 text-rose-700 border-rose-200"
                      }`}
                    >
                      Stok: {totalStok}
                    </span>
                  </div>
                </div>
              </div>
            </button>
          );
        };

        return (
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200/80 overflow-hidden animate-in slide-in-from-bottom-6 duration-400 p-3.5 sm:p-4">
            {/* Header & 1-Tap Filter Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-slate-100 mb-3">
              <div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h2 className="text-xs sm:text-sm font-black text-slate-800 uppercase tracking-wide">
                    {headerPrefix}: <span className="text-blue-600">{modelCount} Model</span>
                  </h2>
                  {activeBrandLabel && (
                    <span className="text-[10px] font-black bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">
                      {activeBrandLabel}
                    </span>
                  )}
                  {activeCatLabel && (
                    <span className="text-[10px] font-black bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full">
                      {activeCatLabel}
                    </span>
                  )}
                  {totalSkusCount > modelCount && (
                    <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200">
                      {totalSkusCount} SKU varian
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Dikelompokkan per artikel • Ketuk kartu untuk cek semua warna &amp; ukuran
                </p>
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                <button
                  type="button"
                  onClick={() => setResultFilter("ALL")}
                  className={`text-[11px] font-bold px-2.5 py-1.5 rounded-lg border transition-colors whitespace-nowrap cursor-pointer ${
                    resultFilter === "ALL"
                      ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                      : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  Semua ({productsList.length})
                </button>
                <button
                  type="button"
                  onClick={() => setResultFilter("STOCK")}
                  className={`text-[11px] font-bold px-2.5 py-1.5 rounded-lg border transition-colors whitespace-nowrap cursor-pointer ${
                    resultFilter === "STOCK"
                      ? "bg-emerald-600 text-white border-emerald-700 shadow-xs"
                      : "bg-emerald-50/70 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                  }`}
                >
                  Ada Stok ({stockCount})
                </button>
                <button
                  type="button"
                  onClick={() => setResultFilter("PROMO")}
                  className={`text-[11px] font-bold px-2.5 py-1.5 rounded-lg border transition-colors whitespace-nowrap cursor-pointer ${
                    resultFilter === "PROMO"
                      ? "bg-rose-600 text-white border-rose-700 shadow-xs"
                      : "bg-rose-50/70 text-rose-700 border-rose-200 hover:bg-rose-100"
                  }`}
                >
                  Sedang Promo ({promoCount})
                </button>
                {selectedCategory === "ALL" && (
                  <button
                    type="button"
                    onClick={() => setGroupByCategory((prev) => !prev)}
                    className={`text-[11px] font-bold px-2.5 py-1.5 rounded-lg border transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1 ${
                      groupByCategory
                        ? "bg-indigo-600 text-white border-indigo-700 shadow-xs"
                        : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-indigo-50"
                    }`}
                  >
                    <Layers className="w-3 h-3" />
                    <span>Kelompok Kategori</span>
                  </button>
                )}
              </div>
            </div>

            {/* Catalog Grid Cards (Dikelompokkan per Kategori atau Urut Relevansi) */}
            {filteredProducts.length === 0 ? (
              <div className="py-8 text-center flex flex-col items-center gap-2 text-slate-500">
                <p className="text-xs sm:text-sm font-semibold">Tidak ada model di halaman ini untuk filter yang dipilih.</p>
                <button
                  type="button"
                  onClick={() => setResultFilter("ALL")}
                  className="text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg border border-blue-200 transition-colors cursor-pointer"
                >
                  Tampilkan Semua
                </button>
              </div>
            ) : shouldRenderCategorySections ? (
              <div className="flex flex-col gap-5">
                {groupedSections.map((section) => (
                  <div key={section.catKey} className="flex flex-col gap-2.5">
                    <div className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200/80 rounded-xl px-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm leading-none">{section.icon}</span>
                        <h3 className="text-xs sm:text-sm font-black text-slate-800 uppercase tracking-wide truncate">
                          {section.label}
                        </h3>
                        <span className="text-[10px] font-bold bg-white text-slate-600 border border-slate-200 px-2 py-0.5 rounded-full shrink-0">
                          {section.items.length} Model
                        </span>
                      </div>
                      {section.catKey !== "OTHER" && (
                        <button
                          type="button"
                          onClick={() => handleCategoryFilterChange(section.catKey)}
                          className="text-[10px] sm:text-[11px] font-bold text-indigo-700 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          Fokus {section.label} →
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5 sm:gap-3">
                      {section.items.map(renderProductCard)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5 sm:gap-3">
                {filteredProducts.map(renderProductCard)}
              </div>
            )}

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex justify-between items-center mt-4 pt-3.5 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage <= 1 || loading}
                  className="px-4 py-2 bg-slate-100 text-slate-600 font-bold text-xs rounded-lg disabled:opacity-50 hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  Sebelumnya
                </button>
                <span className="text-xs font-bold text-slate-500">
                  Hal {currentPage} dari {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage >= totalPages || loading}
                  className="px-4 py-2 bg-blue-100 text-blue-700 font-bold text-xs rounded-lg disabled:opacity-50 hover:bg-blue-200 transition-colors cursor-pointer"
                >
                  Selanjutnya
                </button>
              </div>
            )}
          </div>
        );
      })()}

      {/* Product Card */}
      {product && (() => {
        const parsedInfo = parseProductInfo(product);

        // Group siblings by Size, then map Colors
        const variantsGroupedBySize: Record<string, any[]> = {};
        const sourceSiblings = (siblings && siblings.length > 0) ? siblings : [product];

        sourceSiblings.forEach(s => {
          const sInfo = parseProductInfo(s);
          const color = sInfo.color || "STANDAR";
          const size = sInfo.size || "ALL SIZE";

          const isVariantPromoExpired = s.toDate ? (() => {
            const t = new Date(s.toDate);
            t.setHours(23, 59, 59, 999);
            return new Date() > t;
          })() : false;

          const isVariantOnPromo = !isVariantPromoExpired && Boolean(
            (s.hargaPromo && s.hargaPromo > 0 && s.hargaPromo < s.hargaNormal) ||
            s.discountType
          );

          if (!variantsGroupedBySize[size]) variantsGroupedBySize[size] = [];
          if (!variantsGroupedBySize[size].some(item => item.sku === s.sku)) {
            variantsGroupedBySize[size].push({
              sku: s.sku,
              color,
              size,
              stok: s.stok ?? 0,
              hargaNormal: s.hargaNormal,
              hargaPromo: isVariantPromoExpired ? null : s.hargaPromo,
              discountType: isVariantPromoExpired ? null : s.discountType,
              isOnPromo: isVariantOnPromo,
              isCurrent: s.sku === product.sku
            });
          }
        });

        return (
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">

            {/* Discount Badge Header */}
            {isOnPromo && (
              <div className="bg-gradient-to-r from-purple-600 via-indigo-600 to-rose-600 px-5 py-3 flex flex-wrap items-center justify-between gap-2 text-white">
                <div className="flex items-center gap-2 font-bold text-sm min-w-0">
                  <Tag className="w-4 h-4 shrink-0 text-amber-300" />
                  <span className="truncate">{product.discountType ? product.discountType : "SPECIAL PRICE"}</span>
                </div>
                {hasHargaPromo ? (
                  <span className="bg-white text-red-600 font-extrabold text-xs sm:text-sm px-3 py-1 rounded-full shadow-sm shrink-0">
                    HEMAT {formatRupiah(product.hargaNormal - product.hargaPromo!)}
                  </span>
                ) : (
                  <span className="bg-white/20 backdrop-blur-sm text-white font-extrabold text-[11px] px-2.5 py-1 rounded-full shadow-sm shrink-0 uppercase tracking-wider">
                    PROMO AKTIF
                  </span>
                )}
              </div>
            )}

            <div className="p-5 flex flex-col gap-4">

              {/* Product Header: Title & Badges */}
              <div>
                <h2 className="text-xl font-bold text-slate-800 leading-snug">{parsedInfo.name}</h2>
                <div className="flex flex-wrap gap-2 mt-2.5">
                  {parsedInfo.color && (
                    <div className="flex items-center overflow-hidden rounded-md border border-indigo-100 bg-indigo-50/50">
                      <span className="bg-indigo-100/80 px-2 py-1 text-[10px] font-bold text-indigo-800 uppercase tracking-wider border-r border-indigo-100">
                        Warna
                      </span>
                      <span className="px-2.5 py-1 text-xs font-semibold text-indigo-950">
                        {parsedInfo.color}
                      </span>
                    </div>
                  )}

                  {parsedInfo.size && (
                    <div className="flex items-center overflow-hidden rounded-md border border-indigo-100 bg-indigo-50/50">
                      <span className="bg-indigo-100/80 px-2 py-1 text-[10px] font-bold text-indigo-800 uppercase tracking-wider border-r border-indigo-100">
                        Ukuran
                      </span>
                      <span className="px-2.5 py-1 text-xs font-semibold text-indigo-950">
                        {parsedInfo.size}
                      </span>
                    </div>
                  )}
                  
                  {product.brand && (
                    <div className="flex items-center overflow-hidden rounded-md border border-slate-200 bg-slate-50">
                      <span className="bg-slate-200/80 px-2 py-1 text-[10px] font-bold text-slate-700 uppercase tracking-wider border-r border-slate-200">
                        Group
                      </span>
                      <span className="px-2.5 py-1 text-xs font-semibold text-slate-800">
                        {product.brand}
                      </span>
                    </div>
                  )}

                  {product.dept && (
                    <div className="flex items-center overflow-hidden rounded-md border border-slate-200 bg-slate-50">
                      <span className="bg-slate-200/80 px-2 py-1 text-[10px] font-bold text-slate-700 uppercase tracking-wider border-r border-slate-200">
                        Dept
                      </span>
                      <span className="px-2.5 py-1 text-xs font-semibold text-slate-800">
                        {product.dept}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Promo Banner di bawah Deskripsi — Aman dan Tidak Pernah Ter-crop */}
              {isOnPromo && (
                <div className="w-full bg-gradient-to-r from-purple-50 via-indigo-50 to-pink-50 border border-purple-200/90 rounded-xl p-3 flex items-center justify-between gap-3 shadow-xs">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                      <Tag className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold text-purple-600 uppercase tracking-wider leading-tight">
                        Program Promo Toko
                      </p>
                      <p className="text-sm font-black text-purple-950 leading-snug break-words">
                        {product.discountType || product.diskon || "PROMO SPESIAL"}
                      </p>
                    </div>
                  </div>
                  <span className="bg-purple-600 text-white text-[10px] font-black px-2.5 py-1 rounded-full shrink-0 shadow-xs uppercase tracking-wide">
                    {hasHargaPromo ? `HEMAT ${formatRupiah(product.hargaNormal - product.hargaPromo!)}` : "PROMO AKTIF"}
                  </span>
                </div>
              )}

              {/* Meta badges */}
              <div className="flex flex-wrap gap-2">
                <span className="flex items-center gap-1 bg-slate-100 text-slate-600 text-xs font-mono px-2.5 py-1.5 rounded-lg">
                  <Package2 className="w-3.5 h-3.5" />
                  SKU: {product.sku}
                </span>
                {product.article && (
                  <span className="flex items-center gap-1.5 bg-blue-100 text-blue-800 text-xs font-black font-mono px-3 py-1.5 rounded-lg border border-blue-200 shadow-sm" title="Artikel Induk (Group)">
                    <Layers className="w-3.5 h-3.5 opacity-70" />
                    ARTIKEL: {product.article}
                  </span>
                )}
                {product.barcode && (
                  <span className="flex items-center gap-1.5 bg-emerald-100 text-emerald-800 text-xs font-black font-mono px-3 py-1.5 rounded-lg border border-emerald-200 shadow-sm" title="Barcode UPC / EAN-13 Hangtag">
                    <Barcode className="w-3.5 h-3.5 text-emerald-600" />
                    BARCODE: {product.barcode}
                  </span>
                )}
                {isPromoExpired && (
                  <span className="bg-rose-100 text-rose-700 text-xs font-bold px-2.5 py-1.5 rounded-lg border border-rose-200">
                    Masa Berlaku Promo Habis
                  </span>
                )}
              </div>

              {/* Harga & Stok */}
              <div className="bg-slate-50 rounded-xl p-4 border flex flex-col gap-4">
                {isOnPromo ? (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <p className="text-xs text-slate-500 uppercase font-medium mb-1">
                          {hasHargaPromo ? "Harga Promo" : "Harga Normal Satuan"}
                        </p>
                        <p className="text-3xl sm:text-4xl font-extrabold text-red-600 leading-none">
                          {formatRupiah(product.hargaPromo && product.hargaPromo > 0 ? product.hargaPromo : product.hargaNormal)}
                        </p>
                        {hasHargaPromo && (
                          <p className="text-base text-slate-400 line-through mt-1">
                            {formatRupiah(product.hargaNormal)}
                          </p>
                        )}
                      </div>
                      {hasHargaPromo && discountPct > 0 && (
                        <div className="bg-red-600 text-white rounded-lg px-2.5 py-1.5 text-center shrink-0 shadow-sm flex flex-col justify-center items-center h-fit">
                          <p className="text-sm font-black leading-none">{discountPct}%</p>
                          <p className="text-[9px] font-bold uppercase mt-0.5 opacity-90 tracking-wide">OFF</p>
                        </div>
                      )}
                    </div>

                    {!hasHargaPromo && (
                      <div className="w-full bg-purple-100/90 border border-purple-200/90 rounded-xl p-2.5 flex items-center gap-2 text-purple-950">
                        <Tag className="w-4 h-4 text-purple-700 shrink-0" />
                        <span className="text-xs font-black tracking-wide break-words flex-1">
                          {product.discountType || product.diskon || "PROMO SPESIAL KASIR"}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <p className="text-xs text-slate-500 uppercase font-medium mb-1">Harga Normal</p>
                    <p className="text-4xl font-extrabold text-slate-800 leading-none">
                      {formatRupiah(product.hargaNormal)}
                    </p>
                  </div>
                )}
                
                {/* Stok Box */}
                <div className="pt-4 border-t flex items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-bold text-slate-500 uppercase">Sisa Stok (EOH)</p>
                      {liveStockVerified && (
                        <span className="text-[10px] font-black text-emerald-700 bg-emerald-100/90 border border-emerald-300 px-1.5 py-0.5 rounded-md animate-in fade-in">
                          ✓ {liveStockVerified}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400">Total ketersediaan unit fisik</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCheckLiveStock}
                      disabled={checkingLiveStock}
                      title="Periksa stok langsung ke server kasir toko 719 untuk seluruh varian artikel ini"
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold transition-all disabled:opacity-50 active:scale-95 shadow-2xs"
                    >
                      {checkingLiveStock ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                      ) : (
                        <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                      )}
                      <span>{checkingLiveStock ? "Cek Artikel..." : "⚡ Live Stok Artikel"}</span>
                    </button>
                    <span className={`px-4 py-1.5 rounded-lg text-lg font-black tracking-wide ${
                      (product.stok ?? 0) > 10 ? 'bg-green-100 text-green-700' :
                      (product.stok ?? 0) > 0 ? 'bg-amber-100 text-amber-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {product.stok ?? 0} <span className="text-[10px] font-bold uppercase opacity-80">pcs</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* ── 🖼️ BOX IMAGE: FOTO MODEL & DETAIL AKURAT PER SKU & WARNA ── */}
              <div className="bg-slate-50/90 rounded-2xl p-4 sm:p-5 border border-slate-200/90 flex flex-col items-center shadow-xs">
                <div className="w-full flex items-center justify-between mb-3 px-1">
                  <span className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Foto Model & Detail Produk
                  </span>
                  {parsedInfo.color && (
                    <span className="text-[11px] font-black bg-white text-indigo-900 border border-indigo-200 px-2.5 py-0.5 rounded-full uppercase">
                      Warna: {parsedInfo.color}
                    </span>
                  )}
                </div>
                <ProductImageSlider
                  images={(() => {
                    if (product.images && product.images.length > 0) return product.images;
                    if (product.imageUrl) return [product.imageUrl];
                    const sameColorSib = sourceSiblings.find(
                      (s) => s.imageUrl && s.color && product.color && s.color.toUpperCase() === product.color.toUpperCase()
                    );
                    if (sameColorSib?.imageUrl) return [sameColorSib.imageUrl];
                    const anySibWithImg = sourceSiblings.find((s) => s.imageUrl);
                    return anySibWithImg?.imageUrl ? [anySibWithImg.imageUrl] : [];
                  })()}
                  alt={`${parsedInfo.name} - ${parsedInfo.color || product.sku}`}
                  className="w-48 h-64 sm:w-56 sm:h-72"
                />
              </div>

              {/* Matrix Varian Produk (Siblings) + Multi-Pick Qty per Warna & Ukuran */}
              {Object.keys(variantsGroupedBySize).length > 0 && (() => {
                const selectedVariantEntries = Object.entries(multiVariantQty).filter(([, q]) => q > 0);
                const selectedVariantsCount = selectedVariantEntries.length;
                const selectedTotalPcs = selectedVariantEntries.reduce((acc, [, q]) => acc + q, 0);

                return (
                <div className="bg-white rounded-xl p-4 border border-slate-200 mt-2 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div>
                      <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                        <Layers className="w-4 h-4 text-indigo-500" />
                        Pilih Banyak Warna & Ukuran Sekaligus
                      </h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Tekan <span className="font-bold text-emerald-600">+</span> pada kotak warna/size untuk memilih beberapa varian sekaligus tanpa scan ulang
                      </p>
                    </div>
                    <span className="text-[11px] font-bold bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-full">
                      {sourceSiblings.length} Pilihan
                    </span>
                  </div>
                  <div className="flex flex-col gap-3 mt-3">
                    {Object.entries(variantsGroupedBySize)
                      .sort((a, b) => sortSizes(a[0], b[0]))
                      .map(([size, items]) => (
                      <div key={size} className="flex items-start sm:items-center gap-2 sm:gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                        <div className="w-10 h-10 shrink-0 bg-slate-100 rounded-lg flex items-center justify-center border font-black text-slate-700 text-sm mt-1 sm:mt-0">
                          {size}
                        </div>
                        <div className="flex-1 flex gap-2.5 overflow-x-auto sm:overflow-visible sm:flex-wrap pb-2 sm:pb-0 snap-x">
                          {items.map((item, idx) => {
                            const cData = getColorData(item.color);
                            const bgStyle = cData ? { backgroundColor: cData.hex } : {};
                            const pickedQty = multiVariantQty[item.sku] || 0;
                            
                            let buttonClass = `flex flex-col border rounded-xl px-3 py-2.5 min-w-[142px] sm:min-w-[132px] shrink-0 snap-start text-left transition-all duration-100 border-black/10 cursor-pointer `;
                            if (pickedQty > 0) {
                              buttonClass += cData
                                ? 'ring-2 ring-emerald-500 ring-offset-2 shadow-md font-bold '
                                : 'bg-emerald-50/70 border-emerald-500 ring-2 ring-emerald-500 shadow-md font-bold ';
                            } else if (item.isCurrent) {
                              buttonClass += cData 
                                ? 'ring-2 ring-indigo-500 ring-offset-2 shadow-sm font-bold ' 
                                : 'bg-indigo-50 border-indigo-500 ring-2 ring-indigo-500 shadow-sm font-bold ';
                            } else {
                              buttonClass += cData 
                                ? 'hover:ring-2 hover:ring-slate-300 ' 
                                : 'bg-white hover:bg-slate-50 hover:border-indigo-200 ';
                            }

                            const titleColor = cData 
                              ? (cData.isDark ? 'text-white' : 'text-slate-900')
                              : (item.isCurrent ? 'text-indigo-800' : 'text-slate-600');
                              
                            const subColor = cData
                              ? (cData.isDark ? 'text-white/70' : 'text-slate-500')
                              : 'text-slate-400';

                            const itemHasPromo = item.isOnPromo;
                            const hasPromoPrice = Boolean(item.hargaPromo && item.hargaPromo > 0 && item.hargaPromo < item.hargaNormal);

                            return (
                              <div
                                key={idx}
                                onClick={() => handleSelectVariant(item.sku)}
                                style={bgStyle}
                                className={buttonClass}
                              >
                                <div className="flex items-center justify-between w-full mb-1 gap-1">
                                  <span className={`text-[11px] font-bold uppercase truncate ${titleColor}`} title={item.color}>
                                    {item.color}
                                  </span>
                                  {pickedQty > 0 ? (
                                    <span className="bg-emerald-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded shadow-xs shrink-0 uppercase">
                                      +{pickedQty}
                                    </span>
                                  ) : itemHasPromo ? (
                                    <span className="bg-red-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded shadow-xs shrink-0 tracking-tight leading-none uppercase">
                                      PROMO
                                    </span>
                                  ) : null}
                                </div>
                                <div className="flex items-center justify-between mt-0.5 gap-2">
                                  <span className={`text-[10px] font-mono ${subColor}`}>{item.sku.slice(-4)}</span>
                                  <span className={`text-xs font-black ${item.stok > 0 ? (cData && cData.isDark ? 'text-green-300' : 'text-green-600') : (cData && cData.isDark ? 'text-red-300' : 'text-red-500')}`}>
                                    {item.stok} <span className="text-[9px] font-normal opacity-80">pcs</span>
                                  </span>
                                </div>
                                <div className="mt-1.5 pt-1.5 border-t border-black/10 flex items-center justify-between gap-1 w-full">
                                  {hasPromoPrice ? (
                                    <>
                                      <span className={`text-[9px] line-through font-medium ${cData && cData.isDark ? 'text-white/60' : 'text-slate-400'}`}>
                                        {formatRupiah(item.hargaNormal)}
                                      </span>
                                      <span className={`text-[10px] font-black ${cData && cData.isDark ? 'text-amber-300' : 'text-red-600'}`}>
                                        {formatRupiah(item.hargaPromo)}
                                      </span>
                                    </>
                                  ) : (
                                    <span className={`text-[10px] font-bold ml-auto ${cData && cData.isDark ? 'text-white/80' : 'text-slate-600'}`}>
                                      {formatRupiah(item.hargaNormal)}
                                    </span>
                                  )}
                                </div>

                                {/* Kontrol Qty Multi-Warna & Multi-Size Langsung di Tiap Kartu Varian */}
                                <div
                                  onClick={(e) => e.stopPropagation()}
                                  className="mt-2 pt-1.5 border-t border-black/10 flex items-center justify-between gap-1 w-full"
                                >
                                  <button
                                    type="button"
                                    onClick={(e) => adjustVariantQty(item.sku, -1, e)}
                                    disabled={pickedQty === 0}
                                    className={`w-6 h-6 rounded-md font-black text-xs flex items-center justify-center transition-colors ${
                                      pickedQty > 0
                                        ? "bg-white text-slate-800 shadow-xs hover:bg-rose-50 hover:text-rose-600 border border-slate-200"
                                        : "bg-black/10 text-slate-400 opacity-40 cursor-not-allowed"
                                    }`}
                                  >
                                    -
                                  </button>
                                  <span
                                    className={`text-[11px] font-black px-1.5 py-0.5 rounded ${
                                      pickedQty > 0
                                        ? "bg-emerald-600 text-white shadow-2xs"
                                        : cData && cData.isDark
                                        ? "text-white/80"
                                        : "text-slate-600"
                                    }`}
                                  >
                                    {pickedQty > 0 ? `${pickedQty} pcs` : "Pilih"}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={(e) => adjustVariantQty(item.sku, 1, e)}
                                    className="w-6 h-6 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs flex items-center justify-center shadow-xs active:scale-90 transition-transform"
                                  >
                                    +
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Panel Ringkasan Multi-Warna & Multi-Size yang Dipilih */}
                  {selectedVariantsCount > 0 && (
                    <div className="mt-4 p-3.5 rounded-xl bg-emerald-50/90 border border-emerald-200 flex flex-col gap-2.5 animate-in fade-in duration-200">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-black text-emerald-900 uppercase tracking-wide">
                          🎯 Dipilih: {selectedVariantsCount} Varian ({selectedTotalPcs} Pcs)
                        </span>
                        <button
                          type="button"
                          onClick={() => setMultiVariantQty({})}
                          className="text-[11px] font-bold text-rose-600 hover:underline"
                        >
                          Reset Pilihan
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedVariantEntries.map(([vSku, vQty]) => {
                          const foundSib = sourceSiblings.find((s) => s.sku === vSku);
                          const info = foundSib ? parseProductInfo(foundSib) : { color: "", size: "" };
                          return (
                            <span
                              key={vSku}
                              className="inline-flex items-center gap-1.5 bg-white text-slate-800 border border-emerald-300 px-2.5 py-1 rounded-lg text-xs font-bold shadow-2xs"
                            >
                              <span>{info.color || "STANDAR"}</span>
                              <span className="bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded text-[10px] font-black">
                                {info.size || "ALL"}
                              </span>
                              <span className="text-emerald-700 font-black">x{vQty}</span>
                            </span>
                          );
                        })}
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2 mt-1">
                        {activeTab === "FACING_OUT" ? (
                          <button
                            type="button"
                            onClick={() => addMultipleVariantsToCart("FACING_OUT", false)}
                            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3 px-4 rounded-xl shadow-md active:scale-95 transition-all flex items-center justify-center gap-2 text-sm"
                          >
                            <Package2 className="w-4 h-4" />
                            Masukkan Semua ke Facing Out ({selectedVariantsCount} Varian • {selectedTotalPcs} Pcs)
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => addMultipleVariantsToCart("STOCK_CHECK", false)}
                            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-black py-3 px-4 rounded-xl shadow-md active:scale-95 transition-all flex items-center justify-center gap-2 text-sm"
                          >
                            <MessageSquare className="w-4 h-4" />
                            Tanya Stok Semua Pilihan ({selectedVariantsCount} Varian • {selectedTotalPcs} Pcs)
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                );
              })()}

              {/* Aksi Gudang (Varian Tunggal Aktif) */}
              <div className="flex flex-col gap-3 mt-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                <div className="flex justify-between items-center">
                  <p className="text-xs font-bold text-slate-500 uppercase">Masukkan Varian Aktif ({parsedInfo.color || "-"} • {parsedInfo.size || "-"})</p>
                  
                  <div className="flex items-center gap-3">
                    {/* Continuous Toggle */}
                    <label className="flex items-center gap-1.5 cursor-pointer" title="Otomatis buka kamera setelah ditambahkan">
                      <input 
                        type="checkbox" 
                        className="w-3.5 h-3.5 text-blue-600 rounded border-gray-300 focus:ring-blue-500" 
                        checked={continuousMode}
                        onChange={(e) => setContinuousMode(e.target.checked)}
                      />
                      <span className="text-[10px] font-bold text-slate-500 uppercase">Scan Lanjut</span>
                    </label>

                    <div className="h-4 w-px bg-slate-300"></div>

                    {/* Qty Selector */}
                    <div className="flex items-center gap-2 bg-white px-2 py-1 rounded-lg border shadow-sm">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">QTY:</span>
                      <button onClick={() => setQty(Math.max(1, qty - 1))} className="w-6 h-6 flex items-center justify-center bg-slate-100 text-slate-600 rounded hover:bg-slate-200 font-bold">-</button>
                      <span className="text-sm font-black text-slate-700 w-6 text-center">{qty}</span>
                      <button onClick={() => setQty(qty + 1)} className="w-6 h-6 flex items-center justify-center bg-slate-100 text-slate-600 rounded hover:bg-slate-200 font-bold">+</button>
                    </div>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                  {activeTab === "FACING_OUT" && (
                    <>
                      <button
                        type="button"
                        onClick={() => addToCart("FACING_OUT", qty, parsedInfo.size || product.size || "", true)}
                        className="w-full bg-white text-amber-700 border-2 border-amber-400 font-bold py-3 rounded-xl flex items-center justify-center gap-1.5 hover:bg-amber-50 active:scale-95 transition-all text-xs sm:text-sm"
                      >
                        ➕ Tambah & Pilih Warna Lain
                      </button>
                      <button
                        type="button"
                        onClick={() => addToCart("FACING_OUT", qty, parsedInfo.size || product.size || "", false)}
                        className="w-full bg-amber-500 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 hover:bg-amber-600 shadow-md active:scale-95 transition-all text-xs sm:text-sm"
                      >
                        <Package2 className="w-5 h-5" /> Facing Out (Selesai)
                      </button>
                    </>
                  )}
                  {activeTab === "STOCK_CHECK" && (
                    <>
                      <button
                        type="button"
                        onClick={() => addToCart("STOCK_CHECK", qty, parsedInfo.size || product.size || "", true)}
                        className="w-full bg-white text-indigo-700 border-2 border-indigo-400 font-bold py-3 rounded-xl flex items-center justify-center gap-1.5 hover:bg-indigo-50 active:scale-95 transition-all text-xs sm:text-sm"
                      >
                        ➕ Tambah & Pilih Warna Lain
                      </button>
                      <button
                        type="button"
                        onClick={() => addToCart("STOCK_CHECK", qty, parsedInfo.size || product.size || "", false)}
                        className="w-full bg-indigo-600 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 hover:bg-indigo-700 shadow-md active:scale-95 transition-all text-xs sm:text-sm"
                      >
                        <MessageSquare className="w-5 h-5" /> Tanya Stok (Selesai)
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Cetak Label */}
              <div className="flex flex-col gap-2 mt-2 pt-4 border-t border-slate-100">
                <button onClick={handlePrintLabel} className="w-full bg-slate-800 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-slate-700 active:scale-95 transition-all shadow-sm">
                  <span className="text-lg">🖨️</span> Cetak Label Harga (PDF)
                </button>
              </div>

              {/* Promo Info - hanya tampil jika ada harga promo aktif */}
              {isOnPromo && product.acara && (
                <div className={`border rounded-xl p-3.5 flex flex-col gap-1.5 ${isPromoExpired ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
                  <div className="flex justify-between items-start">
                    <p className={`text-xs font-bold uppercase tracking-wide ${isPromoExpired ? 'text-red-700' : 'text-amber-700'}`}>
                      Info Promo
                    </p>
                    {isPromoExpired && (
                      <span className="bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase animate-pulse">
                        Promo Habis
                      </span>
                    )}
                  </div>
                  <p className={`text-sm font-medium leading-snug ${isPromoExpired ? 'text-red-800' : 'text-amber-800'}`}>
                    {product.acara}
                  </p>
                  {(product.fromDate || product.toDate) && (
                    <div className={`flex items-center gap-1.5 text-xs mt-1 ${isPromoExpired ? 'text-red-700' : 'text-amber-700'}`}>
                      <CalendarRange className="w-3.5 h-3.5" />
                      <span>{formatDate(product.fromDate)} – {formatDate(product.toDate)}</span>
                    </div>
                  )}
                  {product.promoFileName && (
                    <div className="flex items-start gap-1.5 text-[10px] mt-2 pt-2 border-t border-amber-200/50 text-amber-700/70">
                      <span className="font-bold uppercase shrink-0">SUMBER FILE:</span>
                      <span className="font-mono break-all">{product.promoFileName}</span>
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>
        );
      })()}

      {/* Sleek Empty State / Active Filter No-Match */}
      {!product && productsList.length === 0 && !loading && !error && (
        selectedBrandGroup !== "ALL" || selectedCategory !== "ALL" ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center flex flex-col items-center gap-3 shadow-xs">
            <Package2 className="w-10 h-10 text-slate-300" />
            <div>
              <p className="text-sm font-bold text-slate-700">
                Tidak ada model untuk kombinasi filter ini
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {[
                  selectedBrandGroup !== "ALL" ? `Brand: ${getBrandGroupMeta(selectedBrandGroup).shortLabel}` : null,
                  selectedCategory !== "ALL" ? `Kategori: ${CATEGORY_LABELS[selectedCategory]}` : null,
                ].filter(Boolean).join(" • ")}
              </p>
            </div>
            <button
              type="button"
              onClick={handleResetTaxonomyFilters}
              className="text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl transition-colors cursor-pointer"
            >
              Reset Filter Brand &amp; Kategori
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center py-8 px-4 gap-3 text-slate-400">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 border border-slate-200/70 flex items-center justify-center text-slate-400">
              <Search className="w-6 h-6" />
            </div>
            <div className="text-center">
              <p className="text-xs sm:text-sm font-bold text-slate-600">Siap mencari produk, memilih brand (SUKO / Mu+Ku / ZES), atau scan barcode</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Contoh: ketik kode artikel, SKU <span className="font-mono">13463728</span>, atau pilih filter Brand &amp; Kategori di atas</p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1">
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/70">
                ⚡ 0ms Foto Produk
              </span>
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200/70">
                📦 Offline 97rb+ SKU
              </span>
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200/70">
                🌐 Live by luqman org
              </span>
            </div>
          </div>
        )
      )}
      </>
      )}

      </div> {/* End Main Content Wrapper */}
      
      </div> {/* End left column */}

      {/* Cart FAB (Mobile) / Sidebar (Desktop) */}
      {cart.length > 0 && (
        <div className="fixed lg:sticky lg:top-24 bottom-0 left-0 right-0 lg:left-auto lg:right-auto p-4 lg:p-5 bg-white lg:rounded-2xl lg:border border-t shadow-[0_-10px_20px_rgba(0,0,0,0.05)] lg:shadow-xl z-50 animate-in slide-in-from-bottom-full lg:slide-in-from-right-8 duration-300 w-full lg:w-[350px] mx-auto h-fit">
          <div className="flex justify-between items-center mb-3">
            <div>
              <p className="text-xs text-slate-500 font-bold uppercase">Daftar Kirim</p>
              <p className="font-extrabold text-blue-700">{cart.length} Barang</p>
            </div>
            <button onClick={() => updateCart([])} className="text-xs text-red-500 font-bold uppercase py-1 px-3 bg-red-50 rounded-lg hover:bg-red-100 transition-colors">Kosongkan</button>
          </div>
          
          {/* Desktop Cart Items Preview */}
          <div className="hidden lg:flex flex-col gap-2 mb-4 max-h-[40vh] overflow-y-auto pr-1">
            {cart.map((item, idx) => (
              <div key={idx} className="text-xs border rounded-lg p-2.5 flex justify-between items-start gap-2 bg-slate-50">
                <div className="min-w-0 flex-1">
                  <span className="font-bold block whitespace-normal break-words text-slate-800">{item.productName.split(':')[0]}</span>
                  <span className="text-slate-500 font-mono">{item.sku}{item.size ? ` • ${item.size}` : ''}{item.qty ? ` • ${item.qty} pcs` : ''}</span>
                </div>
                <div className="font-bold text-blue-700 shrink-0">{item.type === 'REQUEST' ? 'REQ' : 'CEK'}</div>
              </div>
            ))}
          </div>

          <button onClick={submitCart} disabled={submitting} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-xl shadow-lg shadow-blue-200 flex items-center justify-center gap-2 active:scale-95 transition-all">
            {submitting ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" /> : "Kirim Semua ke Gudang 🚀"}
          </button>
        </div>
      )}

      </div>
    </div>

    {/* SA Order Image Lightbox Modal with pinch-to-zoom & pan */}
    <ImageLightboxModal 
      isOpen={Boolean(orderPreviewImage)}
      onClose={() => setOrderPreviewImage(null)}
      imageUrl={orderPreviewImage?.url || ""}
      title={orderPreviewImage?.title || ""}
      sku={orderPreviewImage?.sku}
    />
    </>
  );
}
