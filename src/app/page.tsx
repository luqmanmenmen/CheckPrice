"use client";

import { useState, useRef } from "react";
import dynamic from "next/dynamic";
import { Search, ScanText, Barcode, X, CalendarRange, Tag, Package2, Layers, MessageSquare, HandHelping, LogOut, UserCircle2, CheckCircle2, XCircle, ArrowLeft, CloudDownload, Loader2, Menu, Sparkles, ArrowRight, Gift, Maximize2, Zap, ShoppingCart, Camera } from "lucide-react";
import { useEffect } from "react";
import AnimatedLogoutButton from "@/components/AnimatedLogoutButton";
import PullToRefresh from "@/components/PullToRefresh";
import useSWR from "swr";
import { Bell } from "lucide-react";
import Link from "next/link";
import { ChipLoader } from "@/components/ChipLoader";
import ProductImageSlider, { optimizeRetailImageUrl, preloadProductImages } from "@/components/ProductImageSlider";
import CatalogImageController from "@/components/CatalogImageController";
import ShiftLoader, { SyncProgressModal } from "@/components/ShiftLoader";
import type { SyncProgressDetails, CachedProduct, CachedArticleModel } from "@/lib/offlineDb";
import ImageLightboxModal from "@/components/ImageLightboxModal";
import { createPortal } from "react-dom";
import {
  BrandGroupKey,
  CategoryKey,
  GenderKey,
  ResolvedBrandGroup,
  ResolvedCategoryKey,
  ResolvedGenderKey,
  BRAND_GROUP_OPTIONS,
  MUKU_SUB_BRANDS,
  CATEGORY_OPTIONS,
  CATEGORY_LABELS,
  CATEGORY_DISPLAY_ORDER,
  GENDER_OPTIONS,
  GENDER_LABELS,
  SubBrandCount,
  BrandShowcaseSection,
  CategoryShowcaseSection,
  classifyBrandGroup,
  classifyProductCategory,
  classifyProductGender,
  getBrandGroupMeta,
  getNormalizedSubBrand,
} from "@/lib/productTaxonomy";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const TextScanner = dynamic(() => import("@/components/TextScanner"), { ssr: false });

function CategoryVectorIcon({ catKey, className = "w-3.5 h-3.5 shrink-0" }: { catKey: CategoryKey; className?: string }) {
  const props = { className, fill: "none", stroke: "currentColor", strokeWidth: 2, viewBox: "0 0 24 24" };
  switch (catKey) {
    case "ALL":
      return (
        <svg {...props}>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
      );
    case "JAKET":
      return (
        <svg {...props}>
          <path d="M8 3 4 6v13h4v-7h8v7h4V6l-4-3-4 2-4-2Z" />
        </svg>
      );
    case "ATASAN":
      return (
        <svg {...props}>
          <path d="M6 4 2 8l3 2 2-2v12h10V8l2 2 3-2-4-4-3 2h-6L6 4Z" />
        </svg>
      );
    case "CELANA":
      return (
        <svg {...props}>
          <path d="M7 3h10l1 18h-4l-2-10-2 10H6L7 3Z" />
        </svg>
      );
    case "SPORT":
      return (
        <svg {...props}>
          <circle cx="15" cy="5" r="2" />
          <path d="M13 9l-3 4 4 2-1 6" />
          <path d="M10 13l-4 2-2 4" />
          <path d="M13 9l4 1 3-2" />
        </svg>
      );
    case "DRESS_ROK":
      return (
        <svg {...props}>
          <path d="M9 3h6l-1 6 5 12H5l5-12-1-6Z" />
        </svg>
      );
    case "SEPATU_SANDAL":
      return (
        <svg {...props}>
          <path d="M3 16c4 0 6-4 8-7l3 4c2 2 4 2 7 3v3H3v-3Z" />
        </svg>
      );
    case "TAS_AKSESORIS":
      return (
        <svg {...props}>
          <rect x="4" y="8" width="16" height="12" rx="2" />
          <path d="M8 8V6a4 4 0 0 1 8 0v2" />
        </svg>
      );
    case "BEAUTY":
      return (
        <svg {...props}>
          <path d="M12 3l2 4.5L18.5 9 14 11l-2 4-2-4-4.5-2L10 7.5 12 3Z" />
        </svg>
      );
    case "TIDUR_DALAM":
      return (
        <svg {...props}>
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        </svg>
      );
    default:
      return (
        <svg {...props}>
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
          <circle cx="7" cy="7" r="1.5" />
        </svg>
      );
  }
}

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
  genderKey?: ResolvedGenderKey;
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
  const [totalPromoCount, setTotalPromoCount] = useState(0);
  const [promoFocusOnly, setPromoFocusOnly] = useState(false);
  const pendingPromoFocusRef = useRef(false);
  const [selectedBrandGroup, setSelectedBrandGroup] = useState<BrandGroupKey>("ALL");
  const [selectedSubBrand, setSelectedSubBrand] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<CategoryKey>("ALL");
  const [selectedGender, setSelectedGender] = useState<GenderKey>("ALL");
  const [groupByCategory, setGroupByCategory] = useState<boolean>(true);
  const [taxonomyBrandCounts, setTaxonomyBrandCounts] = useState<Record<string, number> | null>(null);
  const [taxonomyCategoryCounts, setTaxonomyCategoryCounts] = useState<Record<string, number> | null>(null);
  const [taxonomyGenderCounts, setTaxonomyGenderCounts] = useState<Record<string, number> | null>(null);
  const [taxonomySubBrandCounts, setTaxonomySubBrandCounts] = useState<SubBrandCount[] | null>(null);
  const [brandShowcaseSections, setBrandShowcaseSections] = useState<BrandShowcaseSection<ProductData>[] | null>(null);
  const [categoryShowcaseSections, setCategoryShowcaseSections] = useState<CategoryShowcaseSection<ProductData>[] | null>(null);
  const [totalModelsCount, setTotalModelsCount] = useState(0);
  const [totalSkusCount, setTotalSkusCount] = useState(0);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState("");
  const [notFoundCode, setNotFoundCode] = useState<string>("");
  const [discoveringServer, setDiscoveringServer] = useState<boolean>(false);
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
  const [imageRefreshVersion, setImageRefreshVersion] = useState(0);
  const liveStockEpochRef = useRef(0);

  const handleCheckLiveStock = async () => {
    if (!product?.sku || checkingLiveStock) return;
    setCheckingLiveStock(true);
    const requestEpoch = ++liveStockEpochRef.current;
    const targetSku = product.sku;
    const curSibs = siblings && siblings.length > 0 ? siblings : [product];
    const needsDiscovery = curSibs.length <= 1 || !curSibs.some((s) => Boolean(s.imageUrl));
    const familySkus = curSibs.map((s) => s.sku).filter(Boolean);
    const familyVariants = curSibs
      .filter((s) => Boolean(s.sku))
      .map((s) => ({
        sku: s.sku,
        color: s.color || null,
        size: s.size || null,
        stok: typeof s.stok === "number" ? s.stok : 0,
      }));
    const payload = JSON.stringify({
      sku: targetSku,
      article: product.article || null,
      brandGroup: product.brandGroup || classifyBrandGroup(product),
      discoverFamily: needsDiscovery,
      withImages: needsDiscovery,
      syncAllSizes: true,
      // Jalur tol khusus Live Stok: 1 request langsung ke StoreHub (+ peta relatedStock), 0 tunggu DB
      fastMode: !needsDiscovery,
      familySkus: !needsDiscovery ? familySkus : [],
      familyVariants: !needsDiscovery ? familyVariants : [],
    });

    const callLiveStockOnce = async () => {
      const res = await fetch("/api/live-stock", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: payload,
      });
      const json = await res.json().catch(() => ({ success: false }));
      return { ok: res.ok, data: json };
    };

    try {
      // 1-Click Reliability: jika percobaan #1 gagal karena cold-start / refresh sesi, otomatis retry 1x diam-diam
      let attempt: { ok: boolean; data: any };
      try {
        attempt = await callLiveStockOnce();
      } catch {
        attempt = { ok: false, data: { success: false } };
      }
      if (
        liveStockEpochRef.current === requestEpoch &&
        (!attempt.ok || (!attempt.data?.success && !attempt.data?.storeOffline))
      ) {
        await new Promise((r) => setTimeout(r, 350));
        if (liveStockEpochRef.current !== requestEpoch) return;
        attempt = await callLiveStockOnce();
      }

      const data = attempt.data;
      if (liveStockEpochRef.current !== requestEpoch) return;
      if (data.success && (data.data || data.stok !== undefined)) {
        const variantStockMap = new Map<string, number>();
        if (Array.isArray(data.variants)) {
          for (const v of data.variants) {
            if (v?.sku && typeof v.stok === "number") {
              variantStockMap.set(v.sku, v.stok);
            }
          }
        }
        if (typeof data.stok === "number") {
          variantStockMap.set(data.sku || targetSku, data.stok);
        }

        if (data.data) {
          const freshMainStok = variantStockMap.get(data.data.sku) ?? data.stok ?? data.data.stok ?? 0;
          const updatedMain: ProductData = { ...data.data, stok: freshMainStok };
          const rawSiblings: ProductData[] =
            Array.isArray(data.siblings) && data.siblings.length > 0 ? data.siblings : [updatedMain];
          const nextSiblings: ProductData[] = rawSiblings.map((s) =>
            variantStockMap.has(s.sku) ? { ...s, stok: variantStockMap.get(s.sku)! } : s
          );
          setProduct((cur) => {
            if (cur && cur.sku !== updatedMain.sku) {
              const curMatch = nextSiblings.find((s) => s.sku === cur.sku);
              return curMatch || updatedMain;
            }
            return updatedMain;
          });
          setSiblings(nextSiblings);
          if (updatedMain.imageUrl || (Array.isArray(updatedMain.images) && updatedMain.images.length > 0)) {
            setImageRefreshVersion((v) => v + 1);
          }
          sessionCacheRef.current.set(targetSku.toLowerCase(), { product: updatedMain, siblings: nextSiblings });
          nextSiblings.forEach((s) => {
            if (s.sku) sessionCacheRef.current.set(s.sku.toLowerCase(), { product: s, siblings: nextSiblings });
            if (s.barcode) sessionCacheRef.current.set(s.barcode.toLowerCase(), { product: s, siblings: nextSiblings });
          });
          preloadProductImages([updatedMain.imageUrl, ...nextSiblings.map((s: ProductData) => s.imageUrl)], 400);
          persistServerFamilyToLocal(updatedMain, nextSiblings, targetSku);
          const updatedArticleTotal = nextSiblings.reduce((sum, s) => sum + Math.max(0, Number(s.stok ?? 0)), 0);
          const normArtUpper = String(data.article || updatedMain.article || '').trim().toUpperCase();
          setProductsList((prevList) =>
            prevList.map((item) => {
              const itemArtUpper = String(item.article || '').trim().toUpperCase();
              const matchedSib = nextSiblings.find((s) => s.sku === item.sku);
              if (matchedSib || (normArtUpper && itemArtUpper === normArtUpper)) {
                return {
                  ...item,
                  ...(matchedSib ? { stok: matchedSib.stok ?? item.stok } : {}),
                  articleTotalStok: updatedArticleTotal,
                };
              }
              return item;
            })
          );
          listCacheRef.current.clear();
          import("@/lib/offlineDb")
            .then(({ updateLocalFamilyStockInMemory }) =>
              updateLocalFamilyStockInMemory(nextSiblings, data.article || updatedMain.article)
            )
            .catch(() => {});
        } else {
          setProduct((prev) =>
            prev ? { ...prev, stok: variantStockMap.get(prev.sku) ?? data.stok ?? prev.stok } : null
          );
          // Update seluruh siblings (varian warna & ukuran dalam 1 artikel yang sama)
          if (variantStockMap.size > 0) {
            setSiblings((prevSiblings) => {
              const updated = prevSiblings.map((sib) => {
                if (variantStockMap.has(sib.sku)) {
                  return { ...sib, stok: variantStockMap.get(sib.sku)! };
                }
                return sib;
              });
              updated.forEach((s) => {
                if (s.sku) sessionCacheRef.current.set(s.sku.toLowerCase(), { product: s, siblings: updated });
                if (s.barcode) sessionCacheRef.current.set(s.barcode.toLowerCase(), { product: s, siblings: updated });
              });
              const updatedArticleTotal = updated.reduce((sum, s) => sum + Math.max(0, Number(s.stok ?? 0)), 0);
              const normArtUpper = String(data.article || product.article || '').trim().toUpperCase();
              setProductsList((prevList) =>
                prevList.map((item) => {
                  const itemArtUpper = String(item.article || '').trim().toUpperCase();
                  if (variantStockMap.has(item.sku) || (normArtUpper && itemArtUpper === normArtUpper)) {
                    return {
                      ...item,
                      ...(variantStockMap.has(item.sku) ? { stok: variantStockMap.get(item.sku)! } : {}),
                      articleTotalStok: updatedArticleTotal,
                    };
                  }
                  return item;
                })
              );
              listCacheRef.current.clear();
              import("@/lib/offlineDb")
                .then(({ updateLocalFamilyStockInMemory }) =>
                  updateLocalFamilyStockInMemory(updated, data.article || product.article)
                )
                .catch(() => {});
              return updated;
            });
          }
        }

        const resolvedStok = data.stok ?? data.data?.stok ?? 0;
        const totalUpdatedCount = data.totalVariantsUpdated || (Array.isArray(data.siblings) ? data.siblings.length : variantStockMap.size) || 1;
        if (data.storeOffline) {
          const imgNote = data.imagesMatched > 0 ? ` + ${data.imagesMatched} foto studio` : '';
          setLiveStockVerified(`Tersimpan: ${resolvedStok} pcs${imgNote}`);
          showToast(data.message || `Toko tutup (malam). Menampilkan stok tersimpan: ${resolvedStok} pcs${imgNote}`, "info");
        } else {
          const liveChecked = data.liveCheckedCount ?? totalUpdatedCount;
          const changed =
            data.changedCount ??
            curSibs.filter((s) => variantStockMap.has(s.sku) && variantStockMap.get(s.sku) !== (s.stok ?? 0)).length;
          const countText = liveChecked > 1 ? ` (${liveChecked} warna/size)` : '';
          setLiveStockVerified(`Live: ${resolvedStok} pcs${countText}`);
          if (changed > 0) {
            showToast(`⚡ Live Stok sukses: ${liveChecked} varian dicek (${changed} berubah) — semua warna & size tersinkron!`, "success");
          } else {
            showToast(`⚡ Live Stok sukses: ${liveChecked} varian dicek live dari luqman org (stok saat ini sudah sesuai).`, "success");
          }
        }
      } else {
        showToast(data.message || "Menampilkan stok tersimpan di sistem", "info");
      }
    } catch {
      showToast("Gagal terhubung ke server Live Stok (timeout/jaringan). Coba tekan ulang.", "error");
    } finally {
      if (liveStockEpochRef.current === requestEpoch) {
        setCheckingLiveStock(false);
      }
    }
  };

  const [healingImageKey, setHealingImageKey] = useState<string | null>(null);
  const [updatingImages, setUpdatingImages] = useState(false);
  const healingAttemptsRef = useRef<Set<string>>(new Set());

  const handleHealProductImages = async (
    target: { sku?: string | null; article?: string | null; barcode?: string | null },
    opts?: { manual?: boolean; targetColor?: string | null }
  ) => {
    const key = String(target.article || target.sku || "").trim();
    const isManual = Boolean(opts?.manual);
    if (!key) return false;
    if (!isManual && healingAttemptsRef.current.has(key)) return false;
    if (isManual && updatingImages) return false;

    healingAttemptsRef.current.add(key);
    setHealingImageKey(key);
    if (isManual) setUpdatingImages(true);
    try {
      const reqPayload = JSON.stringify({
        sku: target.sku || "",
        article: target.article || "",
        barcode: target.barcode || "",
        targetColor: opts?.targetColor || "",
        force: isManual,
      });
      const callHealOnce = async () => {
        const r = await fetch("/api/product/heal-image", {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: reqPayload,
        });
        const j = await r.json().catch(() => null);
        return { ok: r.ok, json: j };
      };

      let attempt: { ok: boolean; json: any };
      try {
        attempt = await callHealOnce();
      } catch {
        attempt = { ok: false, json: null };
      }
      // 1-Click Reliability: jika tombol manual Update Gambar gagal transient di klik #1, retry 1x diam-diam
      if (isManual && (!attempt.ok || !attempt.json?.success)) {
        await new Promise((r) => setTimeout(r, 350));
        attempt = await callHealOnce();
      }

      const json = attempt.json;
      if (attempt.ok && json?.success) {
        const healedSibs: ProductData[] = Array.isArray(json.siblings) ? json.siblings : [];
        const healedMain: ProductData | undefined = json.data;
        const sibMap = new Map(healedSibs.map((s) => [s.sku, s]));

        if (healedSibs.length > 0 && healedMain) {
          if (target.sku) sessionCacheRef.current.set(target.sku.toLowerCase(), { product: healedMain, siblings: healedSibs });
          healedSibs.forEach((s) => {
            if (s.sku) sessionCacheRef.current.set(s.sku.toLowerCase(), { product: s, siblings: healedSibs });
            if (s.barcode) sessionCacheRef.current.set(s.barcode.toLowerCase(), { product: s, siblings: healedSibs });
          });
        }

        if (healedMain) {
          setProduct((cur) => {
            if (!cur) return cur;
            const match = sibMap.get(cur.sku) || (cur.sku === healedMain.sku ? healedMain : undefined);
            if (!match && (!cur.article || cur.article !== healedMain.article)) return cur;
            const img = match?.imageUrl || healedMain.imageUrl;
            const imgs = match?.images || healedMain.images;
            return {
              ...cur,
              ...(match ? {
                article: match.article || cur.article,
                barcode: match.barcode || cur.barcode,
                brand: match.brand || cur.brand,
                dept: match.dept || cur.dept,
                color: match.color || cur.color,
                size: match.size || cur.size,
                stok: typeof match.stok === "number" ? match.stok : cur.stok,
                hargaNormal: match.hargaNormal || cur.hargaNormal,
              } : {}),
              imageUrl: img || cur.imageUrl,
              images: imgs && imgs.length > 0 ? imgs : cur.images,
            };
          });
        }
        if (healedSibs.length > 0) {
          setSiblings((prev) => {
            if (isManual && healedSibs.length >= prev.length) {
              return healedSibs;
            }
            return prev.map((s) => {
              const m = sibMap.get(s.sku);
              return m
                ? {
                    ...s,
                    article: m.article || s.article,
                    barcode: m.barcode || s.barcode,
                    stok: typeof m.stok === "number" ? m.stok : s.stok,
                    imageUrl: m.imageUrl || s.imageUrl,
                    images: m.images?.length ? m.images : s.images,
                  }
                : s;
            });
          });
          setProductsList((prev) =>
            prev.map((p) => {
              const m = sibMap.get(p.sku) || (p.article && healedMain?.article === p.article ? healedMain : undefined);
              return m?.imageUrl ? { ...p, imageUrl: m.imageUrl } : p;
            })
          );
          if ((json.updatedCount ?? 0) > 0) {
            listCacheRef.current.clear();
          }
          if (healedMain) {
            persistServerFamilyToLocal(healedMain, healedSibs, healedMain.sku || target.sku || "");
          }
          const { updateOfflineFamilyImages } = await import("@/lib/offlineDb");
          await updateOfflineFamilyImages(healedSibs, healedMain?.article || target.article);
        }

        // Paksa slider foto me-reset status error & me-remount <img> di klik pertama
        setImageRefreshVersion((v) => v + 1);

        if (isManual) {
          showToast(
            json.message || "Sinkronisasi foto produk selesai.",
            json.activeColorMatched || (json.updatedCount ?? 0) > 0 ? "success" : "info"
          );
        }
        return Boolean(json.healed);
      }
      if (isManual) {
        showToast(json?.error || "Foto warna tersebut belum ditemukan di katalog luqman org", "info");
      }
      return false;
    } catch {
      if (isManual) {
        showToast("Gagal menghubungi server pencarian foto produk.", "error");
      }
      return false;
    } finally {
      setHealingImageKey((cur) => (cur === key ? null : cur));
      if (isManual) setUpdatingImages(false);
    }
  };

  const [submitting, setSubmitting] = useState(false);
  const [qty, setQty] = useState(0);
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
  // Gunakan catalogVersion murni agar update stok harian / Live Stok tidak memicu banner "UPDATE SEKARANG"
  const serverVersion = updateData?.catalogVersion
    ? String(updateData.catalogVersion)
    : updateData?.lastUpdate
      ? new Date(updateData.lastUpdate).getTime().toString()
      : null;
  
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
  // Cukup dijalankan 1x saat mount agar tidak memicu download ganda saat `serverVersion` selesai dimuat!
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
          getLocalTaxonomyOverview,
        } = await import('@/lib/offlineDb');
        await ensureDbOpenSafe();
        const count = await db.products.count().catch(() => 0);
        const schemaVer = localStorage.getItem("suko_db_schema_version");
        if (count < 80000 || schemaVer !== "v13") {
          if (isMounted) {
            setSyncProgress(0);
            setSyncDetails({
              percent: 0,
              downloadedSkus: count,
              totalSkus: 0,
              etaSeconds: null,
              statusText: "Menghubungi server katalog...",
              stage: "checking",
            });
            setIsSyncing(true);
          }
          const ok = await syncOfflineDatabase((syncing, prog, details) => {
            if (isMounted) {
              setIsSyncing(syncing);
              if (prog !== undefined) setSyncProgress(prog);
              if (details) setSyncDetails(details);
            }
          }, false);
          sessionCacheRef.current.clear();
          listCacheRef.current.clear();
          await ensureDbOpenSafe();
          const savedVer = localStorage.getItem("suko_server_version");
          if (ok && savedVer && isMounted) {
            setLocalVersion(savedVer);
          }
          if (isMounted) {
            setIsSyncing(false);
            setSyncProgress(undefined);
            setSyncDetails(null);
          }
        } else {
          await ensureModelsIndexReady();
        }
        const [stats, overview] = await Promise.all([
          getLocalCacheStats(),
          getLocalTaxonomyOverview(),
        ]);
        if (isMounted) {
          setLocalCacheStats(stats);
          if (overview) {
            setTaxonomyBrandCounts(overview.brandCounts);
            setTaxonomyCategoryCounts(overview.categoryCounts);
            setTaxonomyGenderCounts(overview.genderCounts);
            if (overview.subBrandCounts?.length) setTaxonomySubBrandCounts(overview.subBrandCounts);
          }
        }
      } catch (e) {
        if (isMounted) {
          setIsSyncing(false);
          setSyncProgress(undefined);
          setSyncDetails(null);
        }
      }
    };
    initialSyncIfEmpty();
    return () => { isMounted = false; };
  }, []);

  const lastUpdateDate = updateData?.lastUpdate 
    ? new Date(updateData.lastUpdate).toLocaleString('id-ID', {
        day: 'numeric', month: 'long', year: 'numeric', 
        hour: '2-digit', minute: '2-digit'
      }) 
    : 'Memuat...';

  const [syncProgress, setSyncProgress] = useState<number | undefined>(undefined);
  const [syncDetails, setSyncDetails] = useState<SyncProgressDetails | null>(null);

  const handleManualSync = async () => {
    setSyncProgress(0);
    setSyncDetails({
      percent: 0,
      downloadedSkus: 0,
      totalSkus: 0,
      etaSeconds: null,
      statusText: "Menghubungi server katalog...",
      stage: "checking",
    });
    setIsSyncing(true);
    showToast("Memperbarui data & sistem...", "success");
    try {
      const {
        syncOfflineDatabase,
        ensureDbOpenSafe,
        db,
        clearModelsMemoryCache,
        getLocalCacheStats,
      } = await import('@/lib/offlineDb');
      const syncSuccess = await syncOfflineDatabase((syncing, prog, details) => {
        setIsSyncing(syncing);
        if (prog !== undefined) setSyncProgress(prog);
        if (details) setSyncDetails(details);
      }, true);

      if (!syncSuccess) {
        showToast("Gagal sinkronisasi katalog (server sibuk), coba lagi sebentar.", "error");
        return;
      }

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

      const targetVersion = localStorage.getItem("suko_server_version") || serverVersion || Date.now().toString();
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
      setSyncDetails(null);
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
    const backoffUntil = Number(sessionStorage.getItem("suko_sync_backoff_until") || "0");

    if (!detectedAt) {
      // Catat pertama kali update terdeteksi
      localStorage.setItem("suko_update_detected_at", now.toString());
    } else {
      const elapsed = now - parseInt(detectedAt, 10);
      if (elapsed >= ONE_DAY_MS && !isSyncing && backoffUntil <= now) {
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
        } else if (
          data.kickedOut ||
          data.reason === "logged_out_all" ||
          data.reason === "unauthenticated" ||
          data.reason === "device_switched"
        ) {
          // Sesi dihentikan (Logout All Device / pindah perangkat / habis) -> langsung lempar ke login
          // (Keranjang suko_facing_out_cart di localStorage tetap aman 100%!)
          localStorage.removeItem("suko_user");
          const reasonParam =
            data.reason === "logged_out_all"
              ? "logged_out_all"
              : data.reason === "device_switched"
                ? "device_switched"
                : "session_expired_cart_saved";
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
        genderCounts?: Record<string, number> | null;
        subBrandCounts?: SubBrandCount[] | null;
        brandShowcaseSections?: BrandShowcaseSection<ProductData>[] | null;
        categoryShowcaseSections?: CategoryShowcaseSection<ProductData>[] | null;
        cachedAt: number;
      }
    >
  >(new Map());

  const preDetailSearchRef = useRef<{ query: string; page: number } | null>(null);
  const productPhotoTopRef = useRef<HTMLDivElement>(null);

  const scrollToProductPhoto = () => {
    if (typeof window === "undefined") return;
    requestAnimationFrame(() => {
      if (productPhotoTopRef.current) {
        productPhotoTopRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      } else {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  };

  /** Simpan 1 artikel keluarga lengkap dari server ke RAM sessionCache & IndexedDB Dexie HP */
  const persistServerFamilyToLocal = (
    srvProduct: ProductData,
    srvSiblings: ProductData[],
    queryKey?: string,
    aliases?: Array<{ barcode: string; sku: string; barcodeNorm?: string }>
  ) => {
    const familyList = Array.isArray(srvSiblings) && srvSiblings.length > 0 ? srvSiblings : [srvProduct];
    if (queryKey && queryKey.trim()) {
      sessionCacheRef.current.set(queryKey.trim().toLowerCase(), { product: srvProduct, siblings: familyList });
    }
    familyList.forEach((s: ProductData) => {
      if (s.sku) sessionCacheRef.current.set(s.sku.toLowerCase(), { product: s, siblings: familyList });
      if (s.barcode) sessionCacheRef.current.set(s.barcode.toLowerCase(), { product: s, siblings: familyList });
    });
    if (Array.isArray(aliases)) {
      aliases.forEach((a) => {
        if (a?.barcode) sessionCacheRef.current.set(a.barcode.toLowerCase(), { product: srvProduct, siblings: familyList });
      });
    }
    import('@/lib/offlineDb').then(({ persistFamilyToLocalDb }) => {
      persistFamilyToLocalDb(srvProduct as any, familyList as any, aliases, queryKey);
    }).catch(() => {});
  };

  /** Trigger manual: cari & scrap SKU/barcode spesifik (+ foto) atau 1 keluarga artikel saat barang belum ketemu */
  const handleDiscoverProductOnServer = async (targetCode?: string, includeFamily: boolean = true) => {
    const codeToSearch = (targetCode ?? (notFoundCode || manualInput)).trim();
    if (!codeToSearch || discoveringServer) return;
    setDiscoveringServer(true);
    try {
      const res = await fetch("/api/live-stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: codeToSearch,
          discoverFamily: includeFamily,
          withImages: true,
          syncAllSizes: includeFamily,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success && data.data) {
        const resolvedSibs: ProductData[] =
          Array.isArray(data.siblings) && data.siblings.length > 0 ? data.siblings : [data.data];
        setError("");
        setNotFoundCode("");
        setProductsList([]);
        setBrandShowcaseSections(null);
        setCategoryShowcaseSections(null);
        setTotalModelsCount(0);
        setTotalSkusCount(0);
        setTotalPromoCount(0);
        applySelectedProductFamily(data.data, resolvedSibs);
        recordRecentSearch(data.article || data.data?.article || codeToSearch);
        preloadProductImages(
          [data.data?.imageUrl, ...resolvedSibs.map((s: ProductData) => s.imageUrl)],
          400
        );
        persistServerFamilyToLocal(data.data, resolvedSibs, codeToSearch, data.aliases);
        if (data.storeOffline) {
          setLiveStockVerified(`Tersimpan + Foto: ${data.stok ?? data.data.stok ?? 0} pcs`);
        } else {
          setLiveStockVerified(`Live: ${data.stok ?? data.data.stok ?? 0} pcs (${resolvedSibs.length} varian)`);
        }
        const photoCount = resolvedSibs.filter((s) => Boolean(s.imageUrl)).length;
        showToast(
          `✅ Berhasil scrap & simpan ke Database (${data.article || data.sku}): ${resolvedSibs.length} varian, barcode & ${photoCount} foto tersimpan permanen!`,
          "success"
        );
      } else {
        const notFoundMsg =
          data.message ||
          `Kode "${codeToSearch}" sudah dicek langsung ke server luqman org namun memang tidak terdaftar.`;
        setError(notFoundMsg);
        showToast("Produk tidak ditemukan di server luqman org", "error");
      }
    } catch {
      showToast("Gagal menghubungi server scrap langsung", "error");
    } finally {
      setDiscoveringServer(false);
    }
  };

  // Ganti varian warna/ukuran secara instan (0ms) dari memori tanpa reload layar
  const handleSelectVariant = (targetSku: string, scrollToPhoto: boolean = false) => {
    setManualInput(targetSku);

    // 1. Cek dari daftar siblings yang sedang aktif di memori
    const existing = siblings.find(s => s.sku === targetSku);
    if (existing) {
      setProduct(existing);
      setQty(multiVariantQty[targetSku] || 0);
      sessionCacheRef.current.set(targetSku, { product: existing, siblings });
      if (scrollToPhoto) {
        scrollToProductPhoto();
      }
      return;
    }

    // 2. Jika tidak ada di siblings aktif, cari via searchProduct
    searchProduct(targetSku, 1, scrollToPhoto);
  };

  const handleBackToCatalog = () => {
    setProduct(null);
    setSiblings([]);
    setMultiVariantQty({});
    const prev = preDetailSearchRef.current;
    preDetailSearchRef.current = null;
    if (prev) {
      setManualInput(prev.query);
      if (prev.query.trim() || selectedBrandGroup !== "ALL" || selectedCategory !== "ALL" || selectedSubBrand) {
        searchProduct(prev.query, prev.page, true);
        return;
      }
    }
    if (selectedBrandGroup !== "ALL" || selectedCategory !== "ALL" || selectedSubBrand) {
      searchProduct(manualInput, currentPage, true);
    }
  };

  const handleCopyText = (text: string, label: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    showToast(`${label} ${text} disalin!`, "info");
  };

  const scrollPageToTop = () => {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handlePageChange = (nextPage: number) => {
    if (nextPage < 1 || nextPage > totalPages || loading) return;
    scrollPageToTop();
    searchProduct(manualInput, nextPage, true, selectedBrandGroup, selectedCategory, selectedSubBrand, groupByCategory, resultFilter, selectedGender);
  };

  const buildSearchEndpointUrl = (
    trimmedQuery: string,
    targetPage: number,
    brandGroup: BrandGroupKey,
    category: CategoryKey,
    subBrand: string = "",
    useGroupSections: boolean = groupByCategory,
    onlyPromo: boolean = false,
    gender: GenderKey = "ALL"
  ) => {
    if (!trimmedQuery) {
      const params = new URLSearchParams({
        brandGroup,
        category,
        page: String(targetPage),
        groupSections: useGroupSections ? "1" : "0",
      });
      if (subBrand) params.set("subBrand", subBrand);
      if (gender !== "ALL") params.set("gender", gender);
      if (onlyPromo) params.set("onlyPromo", "1");
      return `/api/catalog?${params.toString()}`;
    }
    const params = new URLSearchParams({
      page: String(targetPage),
      groupSections: useGroupSections ? "1" : "0",
    });
    if (brandGroup !== "ALL") params.set("brandGroup", brandGroup);
    if (category !== "ALL") params.set("category", category);
    if (subBrand) params.set("subBrand", subBrand);
    if (gender !== "ALL") params.set("gender", gender);
    if (onlyPromo) params.set("onlyPromo", "1");
    return `/api/product/${encodeURIComponent(trimmedQuery)}?${params.toString()}`;
  };

  const clearListToIdle = () => {
    setProductsList([]);
    setResultFilter("ALL");
    setTotalPromoCount(0);
    setBrandShowcaseSections(null);
    setCategoryShowcaseSections(null);
    setProduct(null);
    setSiblings([]);
    setTotalModelsCount(0);
    setTotalSkusCount(0);
    setError("");
    setNotFoundCode("");
    import('@/lib/offlineDb')
      .then(({ getLocalTaxonomyOverview }) => getLocalTaxonomyOverview())
      .then((overview) => {
        setTaxonomyBrandCounts(overview?.brandCounts || null);
        setTaxonomyCategoryCounts(overview?.categoryCounts || null);
        setTaxonomyGenderCounts(overview?.genderCounts || null);
        if (overview?.subBrandCounts?.length) setTaxonomySubBrandCounts(overview.subBrandCounts);
      })
      .catch(() => {
        setTaxonomyBrandCounts(null);
        setTaxonomyCategoryCounts(null);
        setTaxonomyGenderCounts(null);
      });
  };

  const handleBrandFilterChange = (nextBrand: BrandGroupKey) => {
    const resolvedBrand: BrandGroupKey = selectedBrandGroup === nextBrand && nextBrand !== "ALL" ? "ALL" : nextBrand;
    const nextSub = resolvedBrand === "MUKU" ? selectedSubBrand : "";
    const nextGroup = resolvedBrand === "MUKU" && !nextSub ? true : groupByCategory;
    setSelectedBrandGroup(resolvedBrand);
    setSelectedSubBrand(nextSub);
    if (nextGroup !== groupByCategory) setGroupByCategory(nextGroup);
    if (resolvedBrand !== "MUKU" || nextSub) setBrandShowcaseSections(null);
    if (resolvedBrand === "MUKU" && !nextSub) setCategoryShowcaseSections(null);
    if (!manualInput.trim() && resolvedBrand === "ALL" && selectedCategory === "ALL" && selectedGender === "ALL") {
      clearListToIdle();
      return;
    }
    searchProduct(manualInput, 1, true, resolvedBrand, selectedCategory, nextSub, nextGroup, resultFilter, selectedGender);
  };

  const handleSubBrandFilterChange = (nextSubBrand: string) => {
    const resolvedSub = selectedSubBrand === nextSubBrand ? "" : nextSubBrand;
    const nextGroup = !resolvedSub ? true : groupByCategory;
    setSelectedBrandGroup("MUKU");
    setSelectedSubBrand(resolvedSub);
    if (nextGroup !== groupByCategory) setGroupByCategory(nextGroup);
    if (resolvedSub) setBrandShowcaseSections(null);
    else setCategoryShowcaseSections(null);
    searchProduct(manualInput, 1, true, "MUKU", selectedCategory, resolvedSub, nextGroup, resultFilter, selectedGender);
  };

  const handleCategoryFilterChange = (nextCategory: CategoryKey) => {
    const resolvedCat: CategoryKey = selectedCategory === nextCategory && nextCategory !== "ALL" ? "ALL" : nextCategory;
    setSelectedCategory(resolvedCat);
    if (resolvedCat !== "ALL") setCategoryShowcaseSections(null);
    if (!manualInput.trim() && selectedBrandGroup === "ALL" && resolvedCat === "ALL" && selectedGender === "ALL") {
      clearListToIdle();
      return;
    }
    searchProduct(manualInput, 1, true, selectedBrandGroup, resolvedCat, selectedSubBrand, groupByCategory, resultFilter, selectedGender);
  };

  const handleGenderFilterChange = (nextGender: GenderKey) => {
    const resolvedGender: GenderKey = selectedGender === nextGender && nextGender !== "ALL" ? "ALL" : nextGender;
    setSelectedGender(resolvedGender);
    if (!manualInput.trim() && selectedBrandGroup === "ALL" && selectedCategory === "ALL" && resolvedGender === "ALL") {
      clearListToIdle();
      return;
    }
    searchProduct(manualInput, 1, true, selectedBrandGroup, selectedCategory, selectedSubBrand, groupByCategory, resultFilter, resolvedGender);
  };

  const handleResetTaxonomyFilters = () => {
    setSelectedBrandGroup("ALL");
    setSelectedSubBrand("");
    setSelectedCategory("ALL");
    setSelectedGender("ALL");
    setBrandShowcaseSections(null);
    setCategoryShowcaseSections(null);
    if (!manualInput.trim()) {
      clearListToIdle();
      return;
    }
    searchProduct(manualInput, 1, true, "ALL", "ALL", "", groupByCategory, "ALL", "ALL");
  };

  const handleToggleSectionGrouping = () => {
    const nextGroup = !groupByCategory;
    setGroupByCategory(nextGroup);
    searchProduct(manualInput, 1, false, selectedBrandGroup, selectedCategory, selectedSubBrand, nextGroup, resultFilter, selectedGender);
  };

  const isNormalPriceText = (val?: string | null): boolean => {
    if (!val) return false;
    const s = String(val).trim().toUpperCase();
    return s.includes("NORMAL") || s === "REGULAR" || s === "HARGA NORMAL";
  };

  /**
   * Pengecekan ketat khusus untuk VARIAN produk individual:
   * Sebuah varian HANYA dianggap promo jika memiliki:
   * 1. Tanggal promo belum kedaluwarsa
   * 2. Harga promo riil yang lebih murah dari harga normal (hargaPromo > 0 && hargaPromo < hargaNormal)
   * 3. ATAU diskon riil (bukan 0/NORMAL)
   * 4. ATAU tipe diskon promo riil (bukan NORMAL/REGULAR)
   * TIDAK BOLEH mengecek articleHasPromo (karena itu flag artikel, bukan varian ini)
   * dan TIDAK BOLEH menganggap teks "NORMAL" / "NORMAL PRICE" sebagai promo.
   */
  const isVariantPromoActiveClient = (item: Pick<ProductData, "hargaPromo" | "hargaNormal" | "diskon" | "discountType" | "acara" | "toDate" | "articleHasPromo">) => {
    if (!item) return false;
    if (item.toDate) {
      const dp = String(item.toDate).trim().slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(dp)) {
        const todayWib = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
        if (todayWib > dp) return false;
      }
    }
    const hasPrice = Boolean(
      item.hargaPromo &&
      Number(item.hargaPromo) > 0 &&
      (!item.hargaNormal || Number(item.hargaPromo) < Number(item.hargaNormal))
    );
    const hasDiskon = Boolean(
      item.diskon &&
      String(item.diskon).trim() !== "" &&
      String(item.diskon).trim() !== "0" &&
      String(item.diskon).trim() !== "0%" &&
      !isNormalPriceText(item.diskon)
    );
    const hasDiscountType = Boolean(
      item.discountType &&
      !isNormalPriceText(item.discountType)
    );
    return Boolean(hasPrice || hasDiskon || hasDiscountType);
  };

  /**
   * Pengecekan promo untuk item di level KATALOG (kartu ringkasan artikel/model):
   * Aktif jika varian ini sendiri promo ATAU keluarga artikel memiliki varian promo aktif.
   */
  const isCatalogPromoActiveClient = (item: ProductData) => {
    if (!item) return false;
    return Boolean(item.articleHasPromo || isVariantPromoActiveClient(item));
  };

  const applySelectedProductFamily = (mainProd: ProductData, familySiblings: ProductData[]) => {
    const preferPromo = pendingPromoFocusRef.current;
    pendingPromoFocusRef.current = false;
    const list = familySiblings && familySiblings.length > 0 ? familySiblings : [mainProd];
    const promoSiblings = list.filter((s) => isVariantPromoActiveClient(s));
    if (preferPromo && promoSiblings.length > 0) {
      const targetPromoProd = isVariantPromoActiveClient(mainProd) ? mainProd : promoSiblings[0];
      setProduct(targetPromoProd);
      setPromoFocusOnly(promoSiblings.length < list.length);
    } else {
      setProduct(mainProd);
      setPromoFocusOnly(false);
    }
    setSiblings(list);
  };

  const searchProduct = async (
    identifier: string,
    page: number = 1,
    shouldScrollTop: boolean = false,
    overrideBrandGroup?: BrandGroupKey,
    overrideCategory?: CategoryKey,
    overrideSubBrand?: string,
    overrideGroupSections?: boolean,
    overrideResultFilter?: "ALL" | "STOCK" | "PROMO",
    overrideGender?: GenderKey
  ) => {
    const trimmed = identifier.trim();
    const activeBrand = overrideBrandGroup ?? selectedBrandGroup;
    const activeCategory = overrideCategory ?? selectedCategory;
    const activeSubBrand = overrideSubBrand ?? (activeBrand === "MUKU" ? selectedSubBrand : "");
    const activeGender = overrideGender ?? selectedGender;
    const activeGroupSections = overrideGroupSections ?? groupByCategory;
    const activeResultFilter = overrideResultFilter ?? "ALL";
    const onlyPromo = activeResultFilter === "PROMO";
    const hasTaxonomyFilter = activeBrand !== "ALL" || activeCategory !== "ALL" || Boolean(activeSubBrand) || activeGender !== "ALL";

    if (!trimmed && !hasTaxonomyFilter) return;

    const currentSearch = ++searchCounterRef.current;
    setError("");
    setNotFoundCode("");

    // 0A. CEK SIBLING LANGSUNG & ALIAS AKTIF (0ms INSTAN!):
    if (trimmed && !hasTaxonomyFilter && page === 1 && siblings && siblings.length > 0) {
      const lowerTrimmed = trimmed.toLowerCase();
      const existingSibling = siblings.find(
        s => (s.sku && s.sku.toLowerCase() === lowerTrimmed) ||
             (s.barcode && s.barcode.toLowerCase() === lowerTrimmed)
      );
      if (existingSibling) {
        applySelectedProductFamily(existingSibling, siblings);
        setManualInput(existingSibling.sku);
        setProductsList([]);
        setLoading(false);
        if (isScanning) setIsScanning(false);
        sessionCacheRef.current.set(lowerTrimmed, { product: existingSibling, siblings });
        sessionCacheRef.current.set(existingSibling.sku.toLowerCase(), { product: existingSibling, siblings });
        if (existingSibling.barcode) {
          sessionCacheRef.current.set(existingSibling.barcode.toLowerCase(), { product: existingSibling, siblings });
        }
        return;
      }
      const cachedFamily = sessionCacheRef.current.get(lowerTrimmed);
      if (cachedFamily) {
        applySelectedProductFamily(cachedFamily.product, cachedFamily.siblings);
        setProductsList([]);
        setLoading(false);
        if (isScanning) setIsScanning(false);
        return;
      }
    }

    // 0B. Cek Session Cache Memory (0ms instant!)
    const inMemory = trimmed && !hasTaxonomyFilter
      ? (sessionCacheRef.current.get(trimmed.toLowerCase()) || sessionCacheRef.current.get(trimmed))
      : undefined;
    if (inMemory && page === 1) {
      applySelectedProductFamily(inMemory.product, inMemory.siblings);
      setProductsList([]);
      setLoading(false);
      if (isScanning) setIsScanning(false);
      return;
    }

    const listCacheKey = `${trimmed ? trimmed.toLowerCase() : "CATALOG"}::b=${activeBrand}::s=${activeSubBrand}::c=${activeCategory}::gn=${activeGender}::g=${activeGroupSections ? 1 : 0}::pr=${onlyPromo ? 1 : 0}::p${page}`;

    const prefetchNextPage = (
      currentPageNum: number,
      maxPages: number,
      fallbackTotal: number,
      fallbackTotalSkus: number,
      fallbackBrands?: Record<string, number> | null,
      fallbackCats?: Record<string, number> | null,
      fallbackGenders?: Record<string, number> | null
    ) => {
      const nextPageNum = currentPageNum + 1;
      const nextCacheKey = `${trimmed ? trimmed.toLowerCase() : "CATALOG"}::b=${activeBrand}::s=${activeSubBrand}::c=${activeCategory}::gn=${activeGender}::g=${activeGroupSections ? 1 : 0}::pr=${onlyPromo ? 1 : 0}::p${nextPageNum}`;
      if (currentPageNum < maxPages && !listCacheRef.current.has(nextCacheKey)) {
        fetch(buildSearchEndpointUrl(trimmed, nextPageNum, activeBrand, activeCategory, activeSubBrand, activeGroupSections, onlyPromo, activeGender), { cache: 'no-store' })
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
                genderCounts: nextJson.meta?.genderCounts || fallbackGenders || null,
                subBrandCounts: nextJson.meta?.subBrandCounts || null,
                brandShowcaseSections: nextJson.meta?.brandShowcaseSections || null,
                categoryShowcaseSections: nextJson.meta?.categoryShowcaseSections || null,
                cachedAt: Date.now(),
              });
              preloadProductImages(
                [
                  ...nextJson.data.map((item: any) => item.imageUrl),
                  ...(nextJson.meta?.brandShowcaseSections || []).flatMap((s: any) => s.items.map((i: any) => i.imageUrl)),
                  ...(nextJson.meta?.categoryShowcaseSections || []).flatMap((s: any) => s.items.map((i: any) => i.imageUrl)),
                ],
                400
              );
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
      setResultFilter(activeResultFilter);
      setTotalPromoCount((cachedPage as any).promoCount ?? cachedPage.list.filter((it: ProductData) => isCatalogPromoActiveClient(it)).length);
      setTotalModelsCount(cachedPage.total);
      setTotalSkusCount(cachedPage.totalSkus);
      if (cachedPage.brandCounts !== undefined) setTaxonomyBrandCounts(cachedPage.brandCounts || null);
      if (cachedPage.categoryCounts !== undefined) setTaxonomyCategoryCounts(cachedPage.categoryCounts || null);
      if (cachedPage.genderCounts !== undefined) setTaxonomyGenderCounts(cachedPage.genderCounts || null);
      if (cachedPage.subBrandCounts !== undefined && (!activeSubBrand || (cachedPage.subBrandCounts?.length || 0) > 1)) {
        setTaxonomySubBrandCounts(cachedPage.subBrandCounts || null);
      }
      setBrandShowcaseSections(cachedPage.brandShowcaseSections || null);
      setCategoryShowcaseSections(cachedPage.categoryShowcaseSections || null);
      setCurrentPage(cachedPage.page);
      setTotalPages(cachedPage.totalPages);
      setLoading(false);
      if (isScanning) setIsScanning(false);
      preloadProductImages(
        [
          ...cachedPage.list.map((item) => item.imageUrl),
          ...(cachedPage.brandShowcaseSections || []).flatMap((sec) => sec.items.map((i) => i.imageUrl)),
          ...(cachedPage.categoryShowcaseSections || []).flatMap((sec) => sec.items.map((i) => i.imageUrl)),
        ],
        400
      );
      prefetchNextPage(
        cachedPage.page,
        cachedPage.totalPages,
        cachedPage.total,
        cachedPage.totalSkus,
        cachedPage.brandCounts,
        cachedPage.categoryCounts,
        cachedPage.genderCounts
      );
      if (shouldScrollTop && typeof window !== "undefined") {
        requestAnimationFrame(() => scrollPageToTop());
      }
      return;
    }

    type LocalOfflineCandidate = CachedProduct | CachedArticleModel;

    const mapCachedToProduct = (item: LocalOfflineCandidate): ProductData => {
      const nameFallback = "name" in item ? item.name : "";
      const imagesList =
        "images" in item && item.images && item.images.length > 0
          ? item.images
          : item.imageUrl
            ? [item.imageUrl]
            : [];
      return {
        id: 0,
        sku: item.sku,
        barcode: item.barcode || null,
        article: item.article || null,
        description: item.description || nameFallback || "",
        acara: item.acara || null,
        fromDate: null,
        toDate: item.toDate || null,
        hargaNormal: item.hargaNormal ?? 0,
        hargaPromo: item.hargaPromo || null,
        diskon: item.diskon || null,
        discountType: item.discountType || null,
        brand: item.brand || null,
        dept: item.dept || null,
        color: item.color || null,
        size: item.size || null,
        stok: item.stok ?? 0,
        promoFileName: null,
        imageUrl: item.imageUrl || null,
        images: imagesList,
      };
    };

    const syncServerProductToLocal = (
      srvProduct: ProductData,
      srvSiblings: ProductData[],
      aliases?: Array<{ barcode: string; sku: string; barcodeNorm?: string }>
    ) => {
      persistServerFamilyToLocal(srvProduct, srvSiblings, trimmed, aliases);
    };

    const endpointUrl = buildSearchEndpointUrl(
      trimmed,
      page,
      activeBrand,
      activeCategory,
      activeSubBrand,
      activeGroupSections,
      onlyPromo,
      activeGender
    );

    const presentLocalProductAndRefreshBg = async (localItem: LocalOfflineCandidate) => {
      const { db } = await import('@/lib/offlineDb');
      if (searchCounterRef.current !== currentSearch) return;
      setError("");
      const localProduct = mapCachedToProduct(localItem);
      let currentSiblings: ProductData[] = [localProduct];
      if (localItem.article) {
        const localSiblings = await db.products.where('article').equals(localItem.article).toArray().catch(() => []);
        if (localSiblings && localSiblings.length > 0) {
          currentSiblings = localSiblings.map(mapCachedToProduct);
        }
      }
      if (searchCounterRef.current !== currentSearch) return;
      applySelectedProductFamily(localProduct, currentSiblings);
      preloadProductImages([localProduct.imageUrl, ...currentSiblings.map((s) => s.imageUrl)], 400);
      sessionCacheRef.current.set(trimmed.toLowerCase(), { product: localProduct, siblings: currentSiblings });
      currentSiblings.forEach((s) => {
        if (s.sku) sessionCacheRef.current.set(s.sku.toLowerCase(), { product: s, siblings: currentSiblings });
        if (s.barcode) sessionCacheRef.current.set(s.barcode.toLowerCase(), { product: s, siblings: currentSiblings });
      });
      setProductsList([]);
      setLoading(false);
      if (isScanning) setIsScanning(false);

      // Non-blocking background refresh (max 4.5 detik, tidak menimpa bila user menekan Live Stok)
      const bgStartEpoch = liveStockEpochRef.current;
      const bgCtrl = new AbortController();
      const bgTimer = setTimeout(() => bgCtrl.abort(), 4500);
      fetch(endpointUrl, { cache: 'no-store', signal: bgCtrl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((bgJson: { data?: ProductData | ProductData[]; siblings?: ProductData[] } | null) => {
          if (searchCounterRef.current !== currentSearch) return;
          if (liveStockEpochRef.current !== bgStartEpoch) return;
          if (bgJson && bgJson.data && !Array.isArray(bgJson.data)) {
            const bgSibs: ProductData[] = bgJson.siblings || [];
            setSiblings(bgSibs);
            setProduct((cur) => {
              if (!cur) return bgJson.data as ProductData;
              const matched = bgSibs.find((s) => s.sku === cur.sku);
              return matched || (bgJson.data as ProductData);
            });
            preloadProductImages([bgJson.data?.imageUrl, ...bgSibs.map((s) => s.imageUrl)], 400);
            syncServerProductToLocal(bgJson.data, bgSibs, (bgJson as any).aliases);
          }
        })
        .catch(() => {})
        .finally(() => clearTimeout(bgTimer));
    };

    const showBarcodeNotFoundNotice = (codeStr: string, msg: string, notifyToast: boolean = true) => {
      setProduct(null);
      setSiblings([]);
      setProductsList([]);
      setBrandShowcaseSections(null);
      setCategoryShowcaseSections(null);
      setTotalModelsCount(0);
      setTotalSkusCount(0);
      setTotalPromoCount(0);
      if (codeStr) setNotFoundCode(codeStr);
      setError(msg);
      if (notifyToast && codeStr) {
        showToast(
          `Kode "${codeStr}" belum ada di database. Ketuk tombol Scrap luqman org untuk cari & tarik gambarnya sekarang!`,
          "info"
        );
      }
    };

    // 0D. INSTAN DATA LOKAL HP (~0-10ms SEBELUM spinner muncul):
    const isCodeSearch = Boolean(trimmed && !hasTaxonomyFilter && (/\d/.test(trimmed) || /[\-._/]/.test(trimmed)) && !/\s/.test(trimmed));
    const isPureLongDigitCode = Boolean(trimmed && !hasTaxonomyFilter && /^\d{8,20}$/.test(trimmed));
    if (isCodeSearch && page === 1) {
      try {
        const { ensureDbOpenSafe, findOfflineProductByCode } = await import('@/lib/offlineDb');
        await ensureDbOpenSafe();
        const localData = await findOfflineProductByCode(trimmed);
        if (searchCounterRef.current !== currentSearch) return;
        if (localData) {
          await presentLocalProductAndRefreshBg(localData);
          return;
        }
      } catch {}
    }

    // Cek index model (`db.models` in-RAM) untuk teks/filter, ATAU kode non-barcode panjang hanya bila RAM hangat
    // Barcode 8-20 digit TIDAK pernah jatuh ke fuzzy/catalog fallback jika exact match tidak ada!
    try {
      const {
        queryLocalModelsInstant,
        findOfflineProductByCode,
        getLoadedModelsMemoryCache,
      } = await import('@/lib/offlineDb');
      const shouldQueryModels = !isPureLongDigitCode && (!isCodeSearch || Boolean(getLoadedModelsMemoryCache()));
      const localRes = shouldQueryModels
        ? await queryLocalModelsInstant({
            query: trimmed,
            brandGroup: activeBrand,
            category: activeCategory,
            subBrand: activeSubBrand,
            gender: activeGender,
            page,
            limit: 20,
            groupSections: activeGroupSections,
            onlyPromo,
          })
        : null;
      if (searchCounterRef.current !== currentSearch) return;
      if (localRes) {
        const singleModel =
          localRes.singleMatch || (localRes.data.length === 1 && !hasTaxonomyFilter && !onlyPromo ? localRes.data[0] : null);
        if (singleModel) {
          const hitSku = await findOfflineProductByCode(singleModel.sku).catch(() => null);
          if (searchCounterRef.current !== currentSearch) return;
          await presentLocalProductAndRefreshBg(hitSku || singleModel);
          return;
        }
        if (localRes.total > 0 || !trimmed || onlyPromo || hasTaxonomyFilter) {
          setProduct(null);
          setSiblings([]);
          setProductsList(localRes.data as unknown as ProductData[]);
          setResultFilter(activeResultFilter);
          setTotalPromoCount(localRes.promoCount ?? 0);
          setTotalModelsCount(localRes.total);
          setTotalSkusCount(localRes.totalSkus);
          setTaxonomyBrandCounts(localRes.brandCounts);
          setTaxonomyCategoryCounts(localRes.categoryCounts);
          setTaxonomyGenderCounts(localRes.genderCounts);
          if (localRes.subBrandCounts?.length) setTaxonomySubBrandCounts(localRes.subBrandCounts);
          const nextBrandShowcase =
            (localRes.brandShowcaseSections as unknown as BrandShowcaseSection<ProductData>[]) || null;
          const nextCatShowcase =
            (localRes.categoryShowcaseSections as unknown as CategoryShowcaseSection<ProductData>[]) || null;
          setBrandShowcaseSections(nextBrandShowcase);
          setCategoryShowcaseSections(nextCatShowcase);
          if (trimmed && localRes.total > 0) recordRecentSearch(trimmed);
          preloadProductImages(
            [
              ...localRes.data.map((item) => item.imageUrl),
              ...(nextBrandShowcase || []).flatMap((sec) => sec.items.map((i) => i.imageUrl)),
              ...(nextCatShowcase || []).flatMap((sec) => sec.items.map((i) => i.imageUrl)),
            ],
            400
          );
          setCurrentPage(localRes.page);
          setTotalPages(localRes.totalPages);
          setLoading(false);
          if (isScanning) setIsScanning(false);
          if (shouldScrollTop && typeof window !== "undefined") {
            requestAnimationFrame(() => scrollPageToTop());
          }
          return;
        }
      }
    } catch {}

    let localDbReady = Boolean(localCacheStats?.ready);
    let localSkuCount = localCacheStats?.skuCount || 0;
    if (!localDbReady) {
      try {
        const { db, ensureDbOpenSafe, isOfflineSyncRunning } = await import('@/lib/offlineDb');
        if (!isOfflineSyncRunning()) {
          await ensureDbOpenSafe();
          localSkuCount = await Promise.race([
            db.products.count().catch(() => 0),
            new Promise<number>((resolve) => setTimeout(() => resolve(0), 300)),
          ]);
          localDbReady = localSkuCount >= 80000;
        }
      } catch {}
    }
    if (searchCounterRef.current !== currentSearch) return;

    // Jika ini pencarian SKU / barcode dan DB offline (~310rb SKU) SUDAH ada tapi kode belum ketemu lokal:
    // Cek kilat ke server (max 4.5 detik) barangkali produk baru di-scrap atau terdaftar via BarcodeAlias di database.
    // Jika server ada: tampilkan seketika dan simpan permanen ke offline DB + aliases (sehingga scan berikutnya 0ms!).
    // Jika server tidak ada (404/timeout): baru tampilkan notifikasi + kartu Notice & tombol Scrap MDS BISA.
    if (isCodeSearch && localDbReady && page === 1 && !hasTaxonomyFilter) {
      setLoading(true);
      setError("");
      setNotFoundCode("");

      const fastCtrl = new AbortController();
      const fastTimer = setTimeout(() => fastCtrl.abort(), 14000);
      const fastUrl = endpointUrl + (endpointUrl.includes("?") ? "&fast=1&live=1" : "?fast=1&live=1");
      let foundOnServer = false;

      try {
        const res = await fetch(fastUrl, { cache: "no-store", signal: fastCtrl.signal });
        if (res.ok) {
          const fastJson = await res.json().catch(() => null);
          if (fastJson?.data && searchCounterRef.current === currentSearch) {
            foundOnServer = true;
            setError("");
            setNotFoundCode("");
            setLoading(false);
            if (isScanning) setIsScanning(false);
            if (Array.isArray(fastJson.data)) {
              if (fastJson.data.length === 1) {
                applySelectedProductFamily(fastJson.data[0], [fastJson.data[0]]);
                syncServerProductToLocal(fastJson.data[0], [fastJson.data[0]], fastJson.aliases);
              } else if (fastJson.data.length > 1) {
                setProductsList(fastJson.data);
                setTotalModelsCount(fastJson.meta?.total ?? fastJson.data.length);
              }
            } else {
              const srvSibs = fastJson.siblings || [fastJson.data];
              applySelectedProductFamily(fastJson.data, srvSibs);
              preloadProductImages([fastJson.data?.imageUrl, ...srvSibs.map((s: ProductData) => s.imageUrl)], 400);
              syncServerProductToLocal(fastJson.data, srvSibs, fastJson.aliases);
            }
            return;
          }
        }
      } catch {
        // Aborted or network error, fallback to showBarcodeNotFoundNotice below
      } finally {
        clearTimeout(fastTimer);
      }

      if (searchCounterRef.current !== currentSearch) return;
      if (!foundOnServer) {
        setLoading(false);
        if (isScanning) setIsScanning(false);
        showBarcodeNotFoundNotice(
          trimmed,
          `Barcode / kode "${trimmed}" belum ada di database offline (${(localSkuCount || 310526).toLocaleString("id-ID")} SKU) maupun server. Ketuk tombol di bawah untuk langsung mencari & mengambil foto dari luqman org.`,
          true
        );
      }
      return;
    }

    setLoading(true);

    let netTimer: ReturnType<typeof setTimeout> | null = null;
    try {
      // 1. Untuk scan/pencarian kode saat DB lokal belum terisi, pakai ?fast=1 + timeout pendek 2.8s agar cepat muncul tombol Scrap!
      const timeoutMs = isCodeSearch ? 2800 : (localDbReady ? 6500 : 10000);
      const requestUrl = isCodeSearch ? `${endpointUrl}${endpointUrl.includes("?") ? "&fast=1" : "?fast=1"}` : endpointUrl;
      const netCtrl = new AbortController();
      netTimer = setTimeout(() => netCtrl.abort(), timeoutMs);
      const res = await fetch(requestUrl, {
        cache: 'no-store',
        signal: netCtrl.signal,
      });

      if (searchCounterRef.current !== currentSearch) return;

      const data = await res.json();

      if (res.ok) {
        setError("");
        setNotFoundCode("");
        if (Array.isArray(data.data)) {
          if (data.data.length === 0) {
            setProductsList([]);
            setResultFilter(activeResultFilter);
            if (typeof data.meta?.promoCount === "number") setTotalPromoCount(data.meta.promoCount);
            setBrandShowcaseSections(null);
            setCategoryShowcaseSections(null);
            setProduct(null);
            setSiblings([]);
            setTotalModelsCount(0);
            setTotalSkusCount(0);
            setTaxonomyBrandCounts(data.meta?.brandCounts || null);
            setTaxonomyCategoryCounts(data.meta?.categoryCounts || null);
            if (data.meta?.genderCounts !== undefined) setTaxonomyGenderCounts(data.meta.genderCounts || null);
            if (!hasTaxonomyFilter && trimmed && !onlyPromo) {
              const isDigitCode = /^\d{8,14}$/.test(trimmed);
              const msg = isDigitCode && localDbReady
                ? `Barcode / produk "${trimmed}" tidak ada di database offline (${(localSkuCount || 306312).toLocaleString('id-ID')} SKU) maupun server. Tekan tombol di bawah untuk langsung scrap data & gambar luqman org.`
                : isDigitCode
                  ? `Barcode / produk "${trimmed}" belum tercatat di database toko. Tekan tombol di bawah untuk langsung tarik data & gambar luqman org sekarang.`
                  : `Produk tidak ditemukan untuk: "${trimmed}"`;
              showBarcodeNotFoundNotice(trimmed, msg, true);
            }
            return;
          }
          const resolvedPage = data.meta?.page || page;
          const resolvedTotalPages = data.meta?.totalPages || 1;
          const resolvedTotal = data.meta?.total ?? data.data.length;
          const resolvedTotalSkus = data.meta?.totalSkus ?? data.data.length;
          const resolvedPromoCount =
            typeof data.meta?.promoCount === "number"
              ? data.meta.promoCount
              : data.data.filter((it: ProductData) => isCatalogPromoActiveClient(it)).length;
          const resolvedBrandCounts = data.meta?.brandCounts || null;
          const resolvedCategoryCounts = data.meta?.categoryCounts || null;
          const resolvedGenderCounts = data.meta?.genderCounts || null;
          const resolvedSubBrandCounts = (data.meta?.subBrandCounts as SubBrandCount[] | undefined) || null;
          const resolvedShowcase = (data.meta?.brandShowcaseSections as BrandShowcaseSection<ProductData>[] | undefined) || null;
          const resolvedCatShowcase =
            (data.meta?.categoryShowcaseSections as CategoryShowcaseSection<ProductData>[] | undefined) || null;

          setProduct(null);
          setSiblings([]);
          setProductsList(data.data);
          setResultFilter(activeResultFilter);
          setTotalPromoCount(resolvedPromoCount);
          setTotalModelsCount(resolvedTotal);
          setTotalSkusCount(resolvedTotalSkus);
          setTaxonomyBrandCounts(resolvedBrandCounts);
          setTaxonomyCategoryCounts(resolvedCategoryCounts);
          if (resolvedGenderCounts) setTaxonomyGenderCounts(resolvedGenderCounts);
          if (resolvedSubBrandCounts?.length && (!activeSubBrand || resolvedSubBrandCounts.length > 1)) {
            setTaxonomySubBrandCounts(resolvedSubBrandCounts);
          }
          setBrandShowcaseSections(resolvedShowcase);
          setCategoryShowcaseSections(resolvedCatShowcase);
          if (trimmed) recordRecentSearch(trimmed);
          preloadProductImages(
            [
              ...data.data.map((item: any) => item.imageUrl),
              ...(resolvedShowcase || []).flatMap((sec) => sec.items.map((i) => i.imageUrl)),
              ...(resolvedCatShowcase || []).flatMap((sec) => sec.items.map((i) => i.imageUrl)),
            ],
            400
          );
          setCurrentPage(resolvedPage);
          setTotalPages(resolvedTotalPages);
          listCacheRef.current.set(
            `${trimmed ? trimmed.toLowerCase() : "CATALOG"}::b=${activeBrand}::s=${activeSubBrand}::c=${activeCategory}::gn=${activeGender}::g=${activeGroupSections ? 1 : 0}::pr=${onlyPromo ? 1 : 0}::p${resolvedPage}`,
            {
              list: data.data,
              total: resolvedTotal,
              totalSkus: resolvedTotalSkus,
              promoCount: resolvedPromoCount,
              page: resolvedPage,
              totalPages: resolvedTotalPages,
              brandCounts: resolvedBrandCounts,
              categoryCounts: resolvedCategoryCounts,
              genderCounts: resolvedGenderCounts,
              subBrandCounts: resolvedSubBrandCounts,
              brandShowcaseSections: resolvedShowcase,
              categoryShowcaseSections: resolvedCatShowcase,
              cachedAt: Date.now(),
            } as any
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
            resolvedCategoryCounts,
            resolvedGenderCounts
          );
        } else {
          recordRecentSearch(data.data?.article && !["0", "-", "PRODUK BARU"].includes(String(data.data.article).toUpperCase()) ? data.data.article : trimmed);
          const serverSiblings = data.siblings || [];
          applySelectedProductFamily(data.data, serverSiblings);
          setProductsList([]);
          preloadProductImages([data.data?.imageUrl, ...serverSiblings.map((s: ProductData) => s.imageUrl)], 400);
          syncServerProductToLocal(data.data, serverSiblings, (data as any).aliases);
        }
        if (isScanning) setIsScanning(false);
      } else {
        const msg = isCodeSearch && localDbReady && res.status === 404
          ? `Barcode / produk "${trimmed}" tidak ditemukan di database offline (${(localSkuCount || 306312).toLocaleString('id-ID')} SKU) maupun server. Ketuk tombol di bawah untuk scrap langsung di luqman org.`
          : (data.error || `Produk tidak ditemukan untuk: "${trimmed}"`);
        showBarcodeNotFoundNotice(trimmed, msg, Boolean(trimmed));
      }
    } catch {
      if (searchCounterRef.current === currentSearch) {
        if (localDbReady && isCodeSearch) {
          showBarcodeNotFoundNotice(
            trimmed,
            `Barcode / produk "${trimmed}" tidak ditemukan di database offline (${(localSkuCount || 306312).toLocaleString('id-ID')} SKU) maupun server. Ketuk tombol di bawah untuk scrap langsung di luqman org.`,
            Boolean(trimmed)
          );
          return;
        }
        try {
          const { searchOfflineSmart, browseOfflineCatalog } = await import('@/lib/offlineDb');
          const offlineMatches = isPureLongDigitCode
            ? []
            : trimmed
              ? await searchOfflineSmart(trimmed, 40, activeBrand, activeCategory)
              : await browseOfflineCatalog(activeBrand, activeCategory, 40);
          if (offlineMatches && offlineMatches.length > 0) {
            const mappedList: ProductData[] = offlineMatches.map((m) => ({
              id: 0,
              sku: m.sku,
              barcode: m.barcode || null,
              article: m.article || null,
              description: m.description || "",
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
              images: m.imageUrl ? [m.imageUrl] : [],
              articleGroupCount: m.articleGroupCount,
              articleTotalStok: m.articleTotalStok,
              articleColors: m.articleColors,
              articleSizes: m.articleSizes,
              articleHasPromo: m.articleHasPromo,
              articlePromoLabel: m.articlePromoLabel,
              brandGroup: m.brandGroup,
              categoryKey: m.categoryKey,
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
            setNotFoundCode("");
            return;
          }
        } catch {}
        if (trimmed) setNotFoundCode(trimmed);
        setError("Koneksi jaringan lambat & produk belum ditemukan di memori lokal.");
      }
    } finally {
      if (netTimer) clearTimeout(netTimer);
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

  // Reset pilihan multi-varian jika pindah ke artikel yang berbeda (pure e-commerce: mulai dari 0)
  useEffect(() => {
    setMultiVariantQty({});
    setQty(0);
  }, [product?.article]);

  const adjustVariantQty = (sku: string, delta: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const current = multiVariantQty[sku] || 0;
    const next = Math.max(0, current + delta);
    setMultiVariantQty((prev) => {
      const updated = Math.max(0, (prev[sku] || 0) + delta);
      const copy = { ...prev };
      if (updated === 0) {
        delete copy[sku];
      } else {
        copy[sku] = updated;
      }
      return copy;
    });
    if (sku === product?.sku) {
      setQty(next);
    }
  };

  const setActiveVariantStepperQty = (nextQty: number) => {
    const clamped = Math.max(0, nextQty);
    setQty(clamped);
    if (product?.sku) {
      setMultiVariantQty((prev) => {
        const copy = { ...prev };
        if (clamped === 0) {
          delete copy[product.sku];
        } else {
          copy[product.sku] = clamped;
        }
        return copy;
      });
    }
  };

  /** Ketuk kotak size hanya untuk review/cek detail size tsb tanpa menambah jumlah */
  const handleReviewSizeVariant = (targetSku: string) => {
    handleSelectVariant(targetSku, false);
  };

  /** Tambah cepat +1 untuk semua size yang tersedia di dalam 1 warna sekaligus */
  const addFullColorSetQty = (items: { sku: string; stok: number }[], e: React.MouseEvent) => {
    e.stopPropagation();
    if (!items || items.length === 0) return;
    const hasAnyStock = items.some((x) => (x.stok ?? 0) > 0);
    const targets = hasAnyStock ? items.filter((x) => (x.stok ?? 0) > 0) : items;
    if (targets.length === 0) return;
    handleSelectVariant(targets[0].sku, false);
    setMultiVariantQty((prev) => {
      const next = { ...prev };
      for (const t of targets) {
        next[t.sku] = (next[t.sku] || 0) + 1;
      }
      return next;
    });
    setQty((multiVariantQty[targets[0].sku] || 0) + 1);
    showToast(`+1 semua ukuran (${targets.length} size) ditambahkan!`, "success");
  };

  /** Tambah cepat +1 untuk seluruh varian 1 artikel (semua warna & ukuran) */
  const addFullArticleSetQty = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!product) return;
    const sourceSiblings = siblings && siblings.length > 0 ? siblings : [product];
    const hasAnyStock = sourceSiblings.some((x) => (x.stok ?? 0) > 0);
    const targets = hasAnyStock ? sourceSiblings.filter((x) => (x.stok ?? 0) > 0) : sourceSiblings;
    if (targets.length === 0) return;
    setMultiVariantQty((prev) => {
      const next = { ...prev };
      for (const t of targets) {
        next[t.sku] = (next[t.sku] || 0) + 1;
      }
      return next;
    });
    if (product.sku && targets.some((t) => t.sku === product.sku)) {
      setQty((multiVariantQty[product.sku] || 0) + 1);
    }
    showToast(`+1 seluruh artikel (${targets.length} varian) dipilih!`, "success");
  };

  const adjustCartItemQty = (idx: number, delta: number) => {
    const targetItem = cart[idx];
    const nextQty = (targetItem?.qty || 1) + delta;
    const nextCart = cart
      .map((item, i) => (i === idx ? { ...item, qty: (item.qty || 1) + delta } : item))
      .filter((item) => (item.qty || 0) > 0);
    updateCart(nextCart);
    if (targetItem && nextQty <= 0) {
      showToast(`"${targetItem.productName?.split(':')[0] || targetItem.sku}" dihapus dari Request`, "info");
    }
  };

  const handleUnifiedAddToCart = (type: string, keepOpen: boolean = false) => {
    if (!product) return;
    const allSibs = siblings && siblings.length > 0 ? siblings : [product];
    const selectedEntries = Object.entries(multiVariantQty).filter(([, q]) => q > 0);

    if (selectedEntries.length === 0) {
      showToast("Pilih ukuran / ketuk + Pilih dulu sebelum masuk keranjang", "info");
      return;
    }

    let nextCart = [...cart];
    let totalPcsAdded = 0;

    for (const [targetSku, rawQty] of selectedEntries) {
      const sib = allSibs.find((s) => s.sku === targetSku) || (targetSku === product.sku ? product : undefined);
      if (!sib) continue;
      const sibInfo = parseProductInfo(sib);
      const itemSize = sibInfo.size || sib.size || "";
      const itemColor = sibInfo.color || sib.color || "";
      const itemQty = rawQty;
      totalPcsAdded += itemQty;

      const existingIdx = nextCart.findIndex((c) => c.sku === sib.sku && c.type === type);
      if (existingIdx !== -1) {
        nextCart[existingIdx] = {
          ...nextCart[existingIdx],
          qty: (nextCart[existingIdx].qty || 1) + itemQty,
          color: nextCart[existingIdx].color || itemColor,
        };
      } else {
        nextCart.push({
          sku: sib.sku,
          productName: sib.description,
          type,
          qty: itemQty,
          size: itemSize,
          color: itemColor,
          photoUrl: sib.imageUrl || product.imageUrl || null,
          ocrData: null,
        });
      }
    }

    updateCart(nextCart);
    setMultiVariantQty({});
    setQty(0);

    const nextTotalPcs = nextCart.reduce((acc, c) => acc + (c.qty || 1), 0);

    if (keepOpen) {
      showToast(`+${totalPcsAdded} pcs masuk keranjang! Silakan pilih warna/size lain atau kirim ke gudang.`, "success");
      return;
    }

    setProduct(null);
    setManualInput("");
    showToast(`Berhasil masuk keranjang (+${totalPcsAdded} pcs). Total keranjang: ${nextTotalPcs} pcs`, "success");
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
        const totalSentPcs = cart.reduce((acc, c) => acc + (c.qty || 1), 0);
        showToast(`${cart.length} varian (${totalSentPcs} pcs) berhasil dikirim ke Gudang!`);
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
    setResultFilter("ALL");
    setSelectedBrandGroup("ALL");
    setSelectedSubBrand("");
    setSelectedCategory("ALL");
    clearListToIdle();
    setMultiVariantQty({});
    setQty(0);
    inputRef.current?.focus();
  };

  // Cek apakah promo sudah habis berdasarkan toDate (standar tanggal WIB)
  let isPromoExpired = false;
  if (product && product.toDate) {
    const dp = String(product.toDate).trim().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(dp)) {
      const todayWib = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
      if (todayWib > dp) isPromoExpired = true;
    } else {
      const toDateObj = new Date(product.toDate);
      if (!isNaN(toDateObj.getTime())) {
        toDateObj.setHours(23, 59, 59, 999);
        if (new Date() > toDateObj) isPromoExpired = true;
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
                      <h1 className="font-bold text-sm leading-tight group-hover:text-blue-200 transition-colors whitespace-normal break-words">
                        {user.name.replace(/\s*\(Developer\)/i, '').trim()}
                      </h1>
                      {user.name?.toLowerCase().includes('developer') && (
                        <span className="text-[9px] font-black bg-indigo-500/40 text-indigo-100 border border-indigo-400/40 px-1.5 py-0.5 rounded uppercase tracking-wider">
                          DEV
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-blue-200/80 font-medium tracking-wide uppercase whitespace-normal break-words">
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
                <span className="whitespace-nowrap">Facing Out</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("STOCK_CHECK")}
                className={`py-2 px-1.5 sm:px-2 rounded-lg flex items-center justify-center gap-1 sm:gap-1.5 text-[11px] sm:text-xs transition-all cursor-pointer ${
                  activeTab === "STOCK_CHECK"
                    ? "bg-white text-indigo-700 font-bold shadow-sm"
                    : "text-slate-300 font-medium hover:text-white hover:bg-white/5"
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                <span className="whitespace-nowrap">Tanya Stok</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("ORDERS")}
                className={`py-2 px-1.5 sm:px-2 rounded-lg flex items-center justify-center gap-1 sm:gap-1.5 text-[11px] sm:text-xs transition-all cursor-pointer ${
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
                <span className="whitespace-nowrap">Cek Pesanan</span>
              </button>
            </div>

            {/* Row 3: Slim System Status Strip + Info Ukuran Cache HP */}
            <div className="mt-2.5 flex items-center justify-between gap-2 bg-white/10 border border-white/10 rounded-xl px-2.5 py-1.5 text-[10px]">
              <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                <span className="inline-flex items-center gap-1.5 text-slate-200 font-semibold">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${lastUpdateDate === 'Memuat...' ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400 shadow-[0_0_6px_#34d399]'}`} />
                  <span className="whitespace-normal break-words">{lastUpdateDate}</span>
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
                <p className="text-rose-100 text-[10px] font-medium leading-tight mt-0.5">Ada produk baru, update promo, atau fitur sistem terbaru.</p>
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
        <SyncProgressModal progress={syncProgress} details={syncDetails} />,
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
                            src={optimizeRetailImageUrl(itemImage)} 
                            alt={t.sku} 
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = "none";
                            }}
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
                  
                  {/* Action to clear/cancel it from list */}
                  {t.status === 'PENDING' && (
                    <button 
                      onClick={() => markAsCompleted(t.id)}
                      className="w-full mt-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold py-2.5 rounded-lg text-xs transition-colors active:scale-95 cursor-pointer"
                    >
                      Batalkan / Hapus Request
                    </button>
                  )}
                  {(t.status === 'READY' || t.status === 'OOS') && (
                    <button 
                      onClick={() => markAsCompleted(t.id)}
                      className="w-full mt-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-lg text-sm transition-colors active:scale-95 cursor-pointer"
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

            {/* Bar Filter Pemisah Toko Berlogo (SUKO, Mu+Ku, ZES) & Kategori Modern */}
            {!product && (
              <div className="bg-white rounded-2xl border border-slate-200/80 p-3 shadow-xs flex flex-col gap-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                    Pilih Toko / Konsep
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {localCacheStats?.skuCount ? (
                      <span className="inline-flex items-center text-[10px] font-bold text-blue-700 bg-blue-50/80 border border-blue-100 px-2.5 py-0.5 rounded-full">
                        Filter per Artikel • {localCacheStats.skuCount.toLocaleString('id-ID')} Total SKU
                      </span>
                    ) : null}
                    {(selectedBrandGroup !== "ALL" || selectedCategory !== "ALL" || selectedSubBrand || selectedGender !== "ALL") && (
                      <button
                        type="button"
                        onClick={handleResetTaxonomyFilters}
                        className="text-[10px] font-bold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2.5 py-0.5 rounded-full cursor-pointer"
                      >
                        Reset Filter
                      </button>
                    )}
                  </div>
                </div>

                {/* Bar 1: 4 Kartu Logo Toko Simetris (SUKO • Mu+Ku • ZES) */}
                <div className="grid grid-cols-4 gap-2">
                  {BRAND_GROUP_OPTIONS.map((opt) => {
                    const isActive = selectedBrandGroup === opt.key;
                    const countVal = taxonomyBrandCounts?.[opt.key];
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => handleBrandFilterChange(opt.key)}
                        className={`flex flex-col items-center justify-center gap-1.5 py-2.5 px-1.5 rounded-2xl border transition-all cursor-pointer ${
                          isActive ? opt.activeClass : opt.idleClass
                        }`}
                      >
                        {opt.logoUrl ? (
                          <div
                            className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl overflow-hidden shadow-xs border shrink-0 flex items-center justify-center ${
                              opt.key === "ZES" ? "border-slate-200 bg-white" : "border-black/10"
                            }`}
                          >
                            <img
                              src={opt.logoUrl}
                              alt={opt.shortLabel}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ) : (
                          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-xs shrink-0">
                            <CategoryVectorIcon catKey="ALL" className="w-5 h-5" />
                          </div>
                        )}
                        <div className="text-center leading-tight min-w-0 w-full">
                          <div className={`text-[11px] font-black whitespace-normal break-words ${isActive ? opt.textClass : "text-slate-800"}`}>
                            {opt.shortLabel}
                          </div>
                          {typeof countVal === "number" && (
                            <div className="text-[10px] font-semibold text-slate-400 tabular-nums">
                              {countVal.toLocaleString('id-ID')} Art.
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Bar Sub-Brand Khusus Mu+Ku (Tema Hangat Terracotta) */}
                {selectedBrandGroup === "MUKU" && (
                  <div className="flex items-center gap-1.5 overflow-x-auto rounded-xl border border-[#A54F2C]/20 bg-[#A54F2C]/5 px-2.5 py-2">
                    <span className="text-[10px] font-black text-[#A54F2C] uppercase tracking-wider shrink-0 mr-0.5">
                      Merk Mu+Ku:
                    </span>
                    <button
                      type="button"
                      onClick={() => handleSubBrandFilterChange("")}
                      className={`text-[10px] font-bold px-2.5 py-1 rounded-full border transition-all whitespace-nowrap shrink-0 cursor-pointer inline-flex items-center gap-1 ${
                        !selectedSubBrand
                          ? "bg-[#A54F2C] text-white border-[#8E3F20]"
                          : "bg-white text-[#A54F2C] border-[#A54F2C]/25 hover:bg-[#A54F2C]/10"
                      }`}
                    >
                      <span>Semua Merk</span>
                      {taxonomyBrandCounts?.MUKU !== undefined && (
                        <span className={`text-[9px] tabular-nums ${!selectedSubBrand ? "text-amber-100" : "text-[#A54F2C]/75"}`}>
                          ({taxonomyBrandCounts.MUKU.toLocaleString("id-ID")})
                        </span>
                      )}
                    </button>
                    {(taxonomySubBrandCounts && taxonomySubBrandCounts.length > 0
                      ? taxonomySubBrandCounts.slice(0, 22)
                      : MUKU_SUB_BRANDS.map((name) => ({ name, count: 0, photoCount: 0 }))
                    ).map((sbItem) => {
                      const sb = sbItem.name;
                      const isSubActive = selectedSubBrand === sb;
                      return (
                        <button
                          key={sb}
                          type="button"
                          onClick={() => handleSubBrandFilterChange(sb)}
                          className={`text-[10px] font-bold px-2.5 py-1 rounded-full border transition-all whitespace-nowrap shrink-0 cursor-pointer inline-flex items-center gap-1 ${
                            isSubActive
                              ? "bg-[#A54F2C] text-white border-[#8E3F20] shadow-2xs"
                              : "bg-white text-slate-700 border-slate-200 hover:bg-[#A54F2C]/10 hover:text-[#A54F2C]"
                          }`}
                        >
                          <span>{sb}</span>
                          {sbItem.count > 0 && (
                            <span className={`text-[9px] tabular-nums ${isSubActive ? "text-amber-100" : "text-slate-400"}`}>
                              {sbItem.count.toLocaleString("id-ID")}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Bar Teknologi Kain Khusus SUKO (Tema Navy SUKO #0E3A5D) */}
                {selectedBrandGroup === "SUKO" && (
                  <div className="flex items-center gap-1.5 overflow-x-auto rounded-xl border border-[#0E3A5D]/20 bg-[#0E3A5D]/5 px-2.5 py-2">
                    <span className="text-[10px] font-black text-[#0E3A5D] uppercase tracking-wider shrink-0 mr-0.5">
                      Teknologi Kain:
                    </span>
                    {[
                      { label: "SUKO GO", query: "SUKO GO" },
                      { label: "SOFT TOUCH", query: "SOFT TOUCH" },
                      { label: "SUPIMA", query: "SUPIMA" },
                      { label: "CLIMAFLEX", query: "CLIMAFLEX" },
                      { label: "QUICKDRY", query: "QUICKDRY" },
                      { label: "COOL TOUCH", query: "COOL TOUCH" },
                      { label: "FLEX / STRETCH", query: "FLEX" },
                    ].map((tech) => {
                      const isTechActive = manualInput.trim().toUpperCase() === tech.query.toUpperCase();
                      return (
                        <button
                          key={tech.label}
                          type="button"
                          onClick={() => {
                            if (isTechActive) {
                              setManualInput("");
                              searchProduct("", 1, false, "SUKO", selectedCategory, "", groupByCategory);
                            } else {
                              setManualInput(tech.query);
                              searchProduct(tech.query, 1, false, "SUKO", "ALL", "", false);
                            }
                          }}
                          className={`text-[10px] font-bold px-2.5 py-1 rounded-full border transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                            isTechActive
                              ? "bg-[#0E3A5D] text-white border-[#092740] shadow-2xs"
                              : "bg-white text-[#0E3A5D] border-[#0E3A5D]/25 hover:bg-[#0E3A5D]/10"
                          }`}
                        >
                          {tech.label}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Bar 2: Pengelompokan Kategori Produk (Ikon Vektor SVG Modern) */}
                <div className="flex items-center gap-1.5 overflow-x-auto pt-1.5 border-t border-slate-100">
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
                        className={`text-[11px] font-bold px-2.5 py-1.5 rounded-xl border transition-all whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
                          isActive
                            ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                            : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300"
                        }`}
                      >
                        <CategoryVectorIcon
                          catKey={cat.key}
                          className={`w-3.5 h-3.5 shrink-0 ${isActive ? "text-emerald-300" : "text-slate-500"}`}
                        />
                        <span>{cat.shortLabel}</span>
                        {typeof countVal === "number" && (selectedCategory === "ALL" || isActive) && countVal > 0 && (
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-md tabular-nums ${isActive ? "bg-white/20 text-white" : "bg-slate-200/80 text-slate-600"}`}>
                            {countVal.toLocaleString('id-ID')} Art
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Bar 3: Filter Segmen Gender (Men • Ladies • Boys • Girls) untuk SUKO, Mu+Ku, & ZES */}
                <div className="flex items-center gap-1.5 overflow-x-auto pt-1.5 border-t border-slate-100">
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider shrink-0 mr-0.5">
                    Segmen:
                  </span>
                  {GENDER_OPTIONS.map((gen) => {
                    const isActive = selectedGender === gen.key;
                    const countVal = taxonomyGenderCounts?.[gen.key];
                    const isZero = typeof countVal === "number" && countVal === 0 && gen.key !== "ALL";
                    return (
                      <button
                        key={gen.key}
                        type="button"
                        onClick={() => handleGenderFilterChange(gen.key)}
                        className={`text-[11px] font-bold px-2.5 py-1.5 rounded-xl border transition-all whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
                          isActive ? gen.activeClass : gen.idleClass
                        } ${isZero && !isActive ? "opacity-55" : ""}`}
                      >
                        <span>{gen.shortLabel}</span>
                        {typeof countVal === "number" && (
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-md tabular-nums ${isActive ? gen.badgeActiveClass : gen.badgeIdleClass}`}>
                            {countVal.toLocaleString('id-ID')}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Idle Quick Recent Chips & 2-Column Shortcut Banners */}
            {!product && productsList.length === 0 && !loading && selectedBrandGroup === "ALL" && selectedCategory === "ALL" && selectedGender === "ALL" && (
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

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  <Link href="/barang-baru" className="block group">
                    <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl p-3 text-white shadow-sm hover:shadow-md transition-all flex items-center justify-between gap-2 h-full">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="bg-white/20 p-1.5 rounded-lg backdrop-blur-sm shrink-0">
                          <Sparkles className="w-4 h-4 text-yellow-200" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-black text-xs sm:text-sm leading-tight whitespace-normal break-words">Barang Baru!</h3>
                          <p className="text-[10px] text-emerald-50/90 leading-tight whitespace-normal break-words mt-0.5">Produk baru masuk</p>
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
                          <h3 className="font-black text-xs sm:text-sm leading-tight whitespace-normal break-words">Promo BOGO</h3>
                          <p className="text-[10px] text-purple-50/90 leading-tight whitespace-normal break-words mt-0.5">BG, diskon &amp; unik</p>
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-purple-100 shrink-0 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </Link>

                  <Link href="/promo-mendatang" className="block group col-span-2 sm:col-span-1">
                    <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl p-3 text-white shadow-sm hover:shadow-md transition-all flex items-center justify-between gap-2 h-full">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="bg-white/20 p-1.5 rounded-lg backdrop-blur-sm shrink-0">
                          <CalendarRange className="w-4 h-4 text-amber-100" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-black text-xs sm:text-sm leading-tight whitespace-normal break-words">Cek Promo POP (H-2)</h3>
                          <p className="text-[10px] text-amber-50/95 leading-tight whitespace-normal break-words mt-0.5">Persiapan POP sebelum launching</p>
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-amber-100 shrink-0 group-hover:translate-x-0.5 transition-transform" />
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

      {/* Notice Barcode Belum Ada + Trigger Langsung Scrap MDS BISA & Matahari.com */}
      {error && (
        <div className="bg-gradient-to-br from-amber-50 via-white to-rose-50 text-slate-800 p-4 sm:p-5 rounded-2xl border-2 border-amber-300 text-sm animate-in zoom-in duration-200 flex flex-col items-center gap-3 shadow-md">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-100 border border-amber-300 text-amber-900 font-black text-xs whitespace-normal break-words text-center">
            <Bell className="w-4 h-4 text-amber-700 shrink-0" />
            <span>
              {notFoundCode
                ? `Barcode / Kode "${notFoundCode}" Belum Ada di Database`
                : "Informasi Pencarian Produk"}
            </span>
          </div>

          <p className="font-semibold text-slate-700 text-center leading-relaxed whitespace-normal break-words max-w-xl">
            {error}
          </p>

          {(notFoundCode || manualInput.trim()) && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2.5 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => handleDiscoverProductOnServer(notFoundCode || manualInput, true)}
                disabled={discoveringServer}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-indigo-600 via-blue-600 to-emerald-600 hover:from-indigo-700 hover:to-emerald-700 text-white font-black text-xs sm:text-sm shadow-lg active:scale-95 transition-all cursor-pointer disabled:opacity-60 whitespace-normal break-words text-center"
              >
                {discoveringServer ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-amber-200 shrink-0" />
                    <span>Sedang Scrap Data &amp; Gambar luqman org...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 text-amber-300 fill-amber-300 shrink-0" />
                    <span>Cari Barcode &amp; Gambar Sekarang (Scrap luqman org)</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => handleDiscoverProductOnServer(notFoundCode || manualInput, false)}
                disabled={discoveringServer}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-xs shadow-xs active:scale-95 transition-all cursor-pointer disabled:opacity-60 whitespace-normal break-words text-center"
              >
                <Search className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>Scrap Cepat Kode &ldquo;{(notFoundCode || manualInput).trim()}&rdquo; + Foto</span>
              </button>
            </div>
          )}

          {discoveringServer && (
            <div className="w-full max-w-lg rounded-xl bg-blue-50 border border-blue-200 px-3.5 py-2.5 text-xs text-blue-800 font-medium text-center whitespace-normal break-words">
              Sedang menghubungi server luqman org untuk menarik stok &amp; detail artikel, lalu mengambil galeri foto resmi luqman org...
            </div>
          )}
        </div>
      )}

      {/* Konsep 3: Hasil Pencarian / Katalog Brand & Kategori */}
      {(productsList.length > 0 || resultFilter === "PROMO" || selectedBrandGroup !== "ALL" || selectedCategory !== "ALL" || selectedGender !== "ALL") && !product && !loading && (() => {
        const isProductOnPromo = (item: ProductData) => isCatalogPromoActiveClient(item);
        const getTotalStock = (item: ProductData) => item.articleTotalStok ?? item.stok ?? 0;

        const stockCount = productsList.filter((item) => getTotalStock(item) > 0).length;
        const pagePromoCount = productsList.filter((item) => isProductOnPromo(item)).length;
        const displayPromoCount = Math.max(totalPromoCount, pagePromoCount);
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

        // 1. Mode Brand Pages (Mu+Ku tanpa filter brand spesifik): strictly 8 brand/halaman, anti-dobel lintas page!
        const isMukuBrandFirstMode = selectedBrandGroup === "MUKU" && !selectedSubBrand;
        const filterItemByQuickFilter = (item: ProductData) => {
          if (resultFilter === "STOCK") return getTotalStock(item) > 0;
          if (resultFilter === "PROMO") return isProductOnPromo(item);
          return true;
        };

        const mukuRenderedBrandSections: BrandShowcaseSection<ProductData>[] =
          isMukuBrandFirstMode && groupByCategory && brandShowcaseSections && brandShowcaseSections.length > 0
            ? brandShowcaseSections
                .map((sec) => ({
                  ...sec,
                  items: sec.items.filter(filterItemByQuickFilter),
                }))
                .filter((sec) => sec.items.length > 0)
            : isMukuBrandFirstMode && groupByCategory && filteredProducts.length > 0
            ? Array.from(
                filteredProducts.reduce((map, item) => {
                  const sb = (item as any).subBrand || getNormalizedSubBrand(item);
                  const arr = map.get(sb) || [];
                  arr.push(item);
                  map.set(sb, arr);
                  return map;
                }, new Map<string, ProductData[]>())
              )
                .map(([subBrand, items]) => {
                  const knownTotal = taxonomySubBrandCounts?.find((c) => c.name === subBrand)?.count;
                  return {
                    subBrand,
                    count: knownTotal || items.length,
                    totalSkus: items.reduce((sum, x) => sum + (x.articleGroupCount || 1), 0),
                    items,
                  };
                })
                .sort((a, b) => b.items.length - a.items.length || b.count - a.count)
            : [];

        const shouldRenderBrandSections = isMukuBrandFirstMode && groupByCategory && mukuRenderedBrandSections.length > 0;

        // 2. Mode Category Pages (SUKO / ZES / merk spesifik Mu+Ku pada tab Semua): 5 kategori/halaman, tiap kategori 1x saja!
        const renderedCategorySections: CategoryShowcaseSection<ProductData>[] =
          !isMukuBrandFirstMode &&
          groupByCategory &&
          selectedCategory === "ALL" &&
          !manualInput.trim() &&
          categoryShowcaseSections &&
          categoryShowcaseSections.length > 0
            ? categoryShowcaseSections
                .map((sec) => ({
                  ...sec,
                  items: sec.items.filter(filterItemByQuickFilter),
                }))
                .filter((sec) => sec.items.length > 0)
            : [];

        const shouldRenderCategorySections =
          !shouldRenderBrandSections && groupByCategory && selectedCategory === "ALL" && renderedCategorySections.length > 0;

        const hasVisibleContent = shouldRenderBrandSections
          ? mukuRenderedBrandSections.length > 0
          : shouldRenderCategorySections
          ? renderedCategorySections.length > 0
          : filteredProducts.length > 0;

        const activeBrandLabel = selectedBrandGroup !== "ALL" ? getBrandGroupMeta(selectedBrandGroup).shortLabel : null;
        const activeCatLabel = selectedCategory !== "ALL" ? CATEGORY_LABELS[selectedCategory] : null;
        const activeGenderLabel = selectedGender !== "ALL" ? GENDER_LABELS[selectedGender] : null;
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
          const catMeta = CATEGORY_OPTIONS.find((c) => c.key === catKey);
          const genderKey = p.genderKey || classifyProductGender(p);
          const genderMeta = genderKey !== "UNISEX" ? GENDER_OPTIONS.find((g) => g.key === genderKey) : null;
          const subBrandLabel = (p as any).subBrand || getNormalizedSubBrand(p);
          const swatchColors =
            p.articleColors && p.articleColors.length > 0
              ? p.articleColors
              : info.color
              ? [info.color]
              : [];
          const posterTintClass =
            brandGroup === "ZES"
              ? "from-purple-50/80 via-slate-50 to-indigo-50/60"
              : brandGroup === "SUKO"
              ? "from-indigo-50/80 via-slate-50 to-blue-50/60"
              : "from-emerald-50/70 via-slate-50 to-teal-50/50";
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
                preDetailSearchRef.current = { query: manualInput, page: currentPage };
                pendingPromoFocusRef.current = resultFilter === "PROMO";
                setPromoFocusOnly(resultFilter === "PROMO");
                setProduct(p);
                setSiblings([p]);
                setProductsList([]);
                setManualInput(p.sku);
                scrollPageToTop();
                searchProduct(p.sku, 1, false, "ALL", "ALL", "", undefined, undefined, "ALL");
              }}
              className="group text-left bg-white border border-slate-200 hover:border-blue-400 hover:shadow-md rounded-xl overflow-hidden transition-all flex flex-col h-full cursor-pointer"
            >
              {/* Clean Portrait Product Photo via CatalogImageController (Anti Blank-White & Anti Grey-Logo) */}
              <div className="w-full aspect-[3/4] bg-slate-50 shrink-0 overflow-hidden border-b border-slate-100">
                <CatalogImageController
                  imageUrl={p.imageUrl}
                  alt={info.name}
                  sku={p.sku}
                  article={p.article}
                  onHealRequested={() => {
                    handleHealProductImages({ sku: p.sku, article: p.article, barcode: p.barcode });
                  }}
                  fallback={
                    <div className={`w-full h-full bg-gradient-to-br ${posterTintClass} flex flex-col items-center justify-between py-4 px-2.5 text-center`}>
                      <span className="text-[8.5px] font-black uppercase tracking-widest text-slate-400/90">
                        {brandMeta.shortLabel} • {catMeta?.shortLabel || "Produk"}
                      </span>
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-11 h-11 rounded-2xl bg-white/95 shadow-xs border border-slate-200/80 flex items-center justify-center text-slate-600">
                          <CategoryVectorIcon catKey={catKey} className="w-5 h-5" />
                        </div>
                        {swatchColors.length > 0 && (
                          <div className="flex items-center justify-center gap-1 flex-wrap max-w-[110px]">
                            {swatchColors.slice(0, 4).map((colName) => {
                              const cData = getColorData(colName);
                              return (
                                <span
                                  key={colName}
                                  title={colName}
                                  className="w-3.5 h-3.5 rounded-full border border-slate-300/90 shadow-2xs shrink-0"
                                  style={{ backgroundColor: cData?.hex || "#CBD5E1" }}
                                />
                              );
                            })}
                            {swatchColors.length > 4 && (
                              <span className="text-[9px] font-bold text-slate-500">
                                +{swatchColors.length - 4}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <span className="text-[8.5px] font-bold text-slate-400 bg-white/80 border border-slate-200/70 px-2 py-0.5 rounded-full">
                        Foto Web Belum Tersedia
                      </span>
                    </div>
                  }
                />
              </div>

              {/* Card Body (Toko SUKO/Mu+Ku/ZES, Sub-Brand, Artikel, Kategori, Promo Tag, & Harga di Samping/Bawah) */}
              <div className="flex-1 p-2 sm:p-2.5 flex flex-col justify-between min-w-0">
                <div>
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="text-[9px] sm:text-[10px] font-mono font-bold bg-slate-900 text-white px-1.5 py-0.5 rounded">
                      {cleanArticle || p.sku}
                    </span>
                    <span className={`inline-flex items-center gap-1 text-[9px] font-black px-1.5 py-0.5 rounded border ${brandMeta.badgeClass}`}>
                      {brandMeta.logoUrl && (
                        <img
                          src={brandMeta.logoUrl}
                          alt={brandMeta.shortLabel}
                          className="w-3.5 h-3.5 rounded-[3px] object-cover bg-white shrink-0"
                        />
                      )}
                      <span>{brandMeta.shortLabel}</span>
                    </span>
                    {brandGroup === "MUKU" && subBrandLabel && subBrandLabel !== "MUKU" && (
                      <span className="text-[9px] font-bold bg-[#A54F2C]/10 text-[#A54F2C] border border-[#A54F2C]/25 px-1.5 py-0.5 rounded whitespace-normal break-words">
                        {subBrandLabel}
                      </span>
                    )}
                    {variantCount > 1 && (
                      <span className="text-[9px] font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                        {variantCount} var
                      </span>
                    )}
                  </div>

                  <p className="font-bold text-slate-900 text-[11px] sm:text-xs leading-snug whitespace-normal break-words mt-1.5 group-hover:text-blue-700 transition-colors">
                    {info.name}
                  </p>

                  <div className="flex flex-wrap gap-1 mt-1">
                    <span className="text-[9px] font-semibold bg-indigo-50/70 text-indigo-700 border border-indigo-100 px-1.5 py-0.5 rounded">
                      {CATEGORY_LABELS[catKey]}
                    </span>
                    {genderMeta && (
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${genderMeta.cardChipClass}`}>
                        {genderMeta.shortLabel}
                      </span>
                    )}
                    {colorsSummary && (
                      <span className="text-[9px] font-semibold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded whitespace-normal break-words">
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
                    <span className="inline-block self-start text-[9px] font-black px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 uppercase tracking-tight whitespace-normal break-words">
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
                      <p className={`text-xs font-black leading-tight whitespace-normal break-words ${hasLowerPromoPrice ? 'text-rose-600' : 'text-blue-700'}`}>
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
                    {headerPrefix}: <span className="text-blue-600">{modelCount.toLocaleString('id-ID')} Artikel</span>
                  </h2>
                  {activeBrandLabel && (
                    <span className="text-[10px] font-black bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">
                      {activeBrandLabel}
                    </span>
                  )}
                  {selectedSubBrand && (
                    <span className="text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
                      {selectedSubBrand}
                    </span>
                  )}
                  {activeCatLabel && (
                    <span className="text-[10px] font-black bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full">
                      {activeCatLabel}
                    </span>
                  )}
                  {activeGenderLabel && (
                    <span className="text-[10px] font-black bg-sky-50 text-sky-700 border border-sky-200 px-2 py-0.5 rounded-full">
                      {activeGenderLabel}
                    </span>
                  )}
                  {totalSkusCount > modelCount && (
                    <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200">
                      {totalSkusCount.toLocaleString('id-ID')} SKU varian
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
                  onClick={() => {
                    if (resultFilter === "PROMO") {
                      searchProduct(manualInput, 1, false, selectedBrandGroup, selectedCategory, selectedSubBrand, groupByCategory, "ALL", selectedGender);
                    } else {
                      setResultFilter("ALL");
                    }
                  }}
                  className={`text-[11px] font-bold px-2.5 py-1.5 rounded-lg border transition-colors whitespace-nowrap cursor-pointer ${
                    resultFilter === "ALL"
                      ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                      : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  Semua ({resultFilter === "PROMO" ? "Reset" : productsList.length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (resultFilter === "PROMO") {
                      searchProduct(manualInput, 1, false, selectedBrandGroup, selectedCategory, selectedSubBrand, groupByCategory, "STOCK", selectedGender);
                    } else {
                      setResultFilter("STOCK");
                    }
                  }}
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
                  onClick={() => {
                    if (resultFilter === "PROMO") {
                      searchProduct(manualInput, 1, false, selectedBrandGroup, selectedCategory, selectedSubBrand, groupByCategory, "ALL", selectedGender);
                    } else {
                      searchProduct(manualInput, 1, false, selectedBrandGroup, selectedCategory, selectedSubBrand, groupByCategory, "PROMO", selectedGender);
                    }
                  }}
                  className={`text-[11px] font-bold px-2.5 py-1.5 rounded-lg border transition-colors whitespace-nowrap cursor-pointer ${
                    resultFilter === "PROMO"
                      ? "bg-rose-600 text-white border-rose-700 shadow-xs"
                      : "bg-rose-50/70 text-rose-700 border-rose-200 hover:bg-rose-100"
                  }`}
                >
                  Sedang Promo ({displayPromoCount.toLocaleString("id-ID")})
                </button>
                {((selectedCategory === "ALL" && !manualInput.trim() && (selectedBrandGroup === "SUKO" || selectedBrandGroup === "ZES" || Boolean(selectedSubBrand))) ||
                  isMukuBrandFirstMode) && (
                  <button
                    type="button"
                    onClick={handleToggleSectionGrouping}
                    className={`text-[11px] font-bold px-2.5 py-1.5 rounded-lg border transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1 ${
                      groupByCategory
                        ? isMukuBrandFirstMode
                          ? "bg-emerald-600 text-white border-emerald-700 shadow-xs"
                          : "bg-indigo-600 text-white border-indigo-700 shadow-xs"
                        : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-indigo-50"
                    }`}
                  >
                    {isMukuBrandFirstMode ? <Tag className="w-3 h-3" /> : <Layers className="w-3 h-3" />}
                    <span>
                      {isMukuBrandFirstMode
                        ? groupByCategory
                          ? "Per Brand (8/Hal)"
                          : "Semua Artikel"
                        : groupByCategory
                        ? "Per Kategori (Ringkas)"
                        : "Semua Artikel"}
                    </span>
                  </button>
                )}
              </div>
            </div>

            {selectedBrandGroup === "ZES" && !manualInput.trim() && (
              <div className="mb-3 px-3 py-2 rounded-xl bg-purple-50/70 border border-purple-200/80 text-[11px] text-purple-900 flex items-center gap-2">
                <span className="font-black bg-purple-600 text-white px-1.5 py-0.5 rounded text-[9px] shrink-0">
                  INFO ZES
                </span>
                <span className="leading-snug">
                  <strong>luqman org</strong> belum menyediakan foto studio resmi untuk ZES. Foto merk lain yang sempat tertaut sudah dibersihkan — kartu tetap menampilkan artikel, warna, ukuran, &amp; harga akurat.
                </span>
              </div>
            )}

            {/* Catalog Grid Cards (Per Brand Mu+Ku, Per Kategori SUKO/ZES, atau Daftar Artikel) */}
            {!hasVisibleContent ? (
              <div className="py-8 text-center flex flex-col items-center gap-2 text-slate-500">
                <p className="text-xs sm:text-sm font-semibold">Tidak ada artikel di halaman ini untuk filter yang dipilih.</p>
                <button
                  type="button"
                  onClick={() => {
                    if (resultFilter === "PROMO") {
                      searchProduct(manualInput, 1, false, selectedBrandGroup, selectedCategory, selectedSubBrand, groupByCategory, "ALL", selectedGender);
                    } else if (selectedGender !== "ALL") {
                      handleGenderFilterChange("ALL");
                    } else {
                      setResultFilter("ALL");
                    }
                  }}
                  className="text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg border border-blue-200 transition-colors cursor-pointer"
                >
                  {selectedGender !== "ALL" && productsList.length === 0 ? "Tampilkan Semua Segmen" : "Tampilkan Semua"}
                </button>
              </div>
            ) : shouldRenderBrandSections ? (
              <div className="flex flex-col gap-5">
                {mukuRenderedBrandSections.map((sec) => (
                  <div key={sec.subBrand} className="flex flex-col gap-2.5">
                    <div className="flex items-center justify-between gap-2 bg-emerald-50/70 border border-emerald-200/80 rounded-xl px-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm leading-none">🏷️</span>
                        <h3 className="text-xs sm:text-sm font-black text-slate-800 uppercase tracking-wide whitespace-normal break-words">
                          {sec.subBrand}
                        </h3>
                        <span className="text-[10px] font-bold bg-white text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full shrink-0 tabular-nums">
                          {sec.count.toLocaleString("id-ID")} Artikel
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSubBrandFilterChange(sec.subBrand)}
                        className="text-[10px] sm:text-[11px] font-bold text-emerald-700 hover:text-emerald-800 bg-white hover:bg-emerald-100 border border-emerald-300 px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Lihat semua {sec.subBrand} →
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5 sm:gap-3">
                      {sec.items.map(renderProductCard)}
                    </div>
                  </div>
                ))}

                <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl px-3.5 py-2.5 text-[11px] text-emerald-800 font-semibold flex flex-wrap items-center justify-between gap-2">
                  <span>
                    Menampilkan {mukuRenderedBrandSections.length} brand unik pada Hal {currentPage}/{totalPages} (anti-dobel lintas halaman) • Ketuk <strong>Lihat semua</strong> untuk melihat seluruh artikel & kategori brand tsb.
                  </span>
                </div>
              </div>
            ) : shouldRenderCategorySections ? (
              <div className="flex flex-col gap-5">
                {renderedCategorySections.map((section) => (
                  <div key={section.catKey} className="flex flex-col gap-2.5">
                    <div className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200/80 rounded-xl px-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <CategoryVectorIcon catKey={section.catKey} className="w-4 h-4 text-slate-600 shrink-0" />
                        <h3 className="text-xs sm:text-sm font-black text-slate-800 uppercase tracking-wide whitespace-normal break-words">
                          {section.label}
                        </h3>
                        <span className="text-[10px] font-bold bg-white text-slate-600 border border-slate-200 px-2 py-0.5 rounded-full shrink-0 tabular-nums">
                          {section.count.toLocaleString("id-ID")} Artikel
                        </span>
                      </div>
                      {section.catKey !== "OTHER" && (
                        <button
                          type="button"
                          onClick={() => handleCategoryFilterChange(section.catKey)}
                          className="text-[10px] sm:text-[11px] font-bold text-indigo-700 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          Lihat semua {section.label} →
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5 sm:gap-3">
                      {section.items.map(renderProductCard)}
                    </div>
                  </div>
                ))}

                <div className="bg-indigo-50/60 border border-indigo-200 rounded-xl px-3.5 py-2 text-[11px] text-indigo-800 font-semibold">
                  Ringkasan kategori Hal {currentPage}/{totalPages} (setiap kategori tampil 1x, anti-dobel lintas halaman) • Pilih kategori di atas atau klik <strong>Per Kategori</strong> untuk mode daftar rata.
                </div>
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

      {/* Product Detail Modern Split Cockpit + Rapid Facing Out Per Warna */}
      {product && (() => {
        const parsedInfo = parseProductInfo(product);
        const sourceSiblings = (siblings && siblings.length > 0) ? siblings : [product];
        const promoOnlySiblings = sourceSiblings.filter((s) => isVariantPromoActiveClient(s));
        const hasMixedPromoVariants = promoOnlySiblings.length > 0 && promoOnlySiblings.length < sourceSiblings.length;
        const siblingsForDisplay =
          promoFocusOnly && promoOnlySiblings.length > 0 ? promoOnlySiblings : sourceSiblings;
        const activeColorUpper = (parsedInfo.color || "STANDAR").toUpperCase();
        const productBrandGroup = classifyBrandGroup(product);
        const productBrandMeta = getBrandGroupMeta(productBrandGroup);
        const productCatKey = classifyProductCategory(product);
        const productCatLabel = CATEGORY_LABELS[productCatKey];

        // Kelompokkan varian PER WARNA terlebih dahulu agar kasir bisa tap banyak warna/size dalam 1 artikel tanpa scan ulang
        const colorMap = new Map<
          string,
          {
            color: string;
            hex: string | null;
            isDark: boolean;
            totalStock: number;
            repSku: string;
            sizes: any[];
          }
        >();

        let totalArticleStockAllVariants = 0;

        sourceSiblings.forEach((s) => {
          totalArticleStockAllVariants += Math.max(0, s.stok ?? 0);
        });

        siblingsForDisplay.forEach((s) => {
          const sInfo = parseProductInfo(s);
          const color = (sInfo.color || "STANDAR").trim().toUpperCase();
          const size = (sInfo.size || "ALL SIZE").trim();
          const stokVal = s.stok ?? 0;

          const isVariantOnPromo = isVariantPromoActiveClient(s);

          let group = colorMap.get(color);
          if (!group) {
            const cData = getColorData(color);
            group = {
              color,
              hex: cData?.hex || null,
              isDark: Boolean(cData?.isDark),
              totalStock: 0,
              repSku: s.sku,
              sizes: [],
            };
            colorMap.set(color, group);
          }

          if (!group.sizes.some((item) => item.sku === s.sku)) {
            group.totalStock += Math.max(0, stokVal);
            if (s.sku === product.sku || (!group.repSku && s.imageUrl)) {
              group.repSku = s.sku;
            }
            group.sizes.push({
              sku: s.sku,
              barcode: s.barcode || null,
              color,
              size,
              stok: stokVal,
              hargaNormal: s.hargaNormal,
              hargaPromo: isVariantOnPromo ? s.hargaPromo : null,
              discountType: isVariantOnPromo ? s.discountType : null,
              isOnPromo: isVariantOnPromo,
              isCurrent: s.sku === product.sku,
            });
          }
        });

        const colorGroupsList = Array.from(colorMap.values())
          .map((cg) => ({
            ...cg,
            sizes: cg.sizes.sort((a, b) => sortSizes(a.size, b.size)),
          }))
          .sort((a, b) => {
            if (a.color === activeColorUpper && b.color !== activeColorUpper) return -1;
            if (b.color === activeColorUpper && a.color !== activeColorUpper) return 1;
            return a.color.localeCompare(b.color);
          });

        const normImgColor = (c?: string | null) =>
          String(c || "").trim().toUpperCase().replace(/[\s\-_./]+/g, "");
        const getImgOwnerSku = (url?: string | null) => {
          if (!url) return null;
          const fn = String(url).split("?")[0].split("/").pop() || "";
          const m = fn.match(/^(\d{7,9})(?:[-_.]|$)/);
          return m?.[1] || null;
        };
        const activeColorNorm = normImgColor(parsedInfo.color || product.color);
        const isUrlOwnedByOtherColor = (url?: string | null) => {
          const ownerSku = getImgOwnerSku(url);
          if (!ownerSku || !activeColorNorm) return null;
          const ownerSib = sourceSiblings.find((s) => s.sku === ownerSku);
          const ownerNorm = normImgColor(ownerSib?.color);
          if (ownerSib && ownerNorm && ownerNorm !== activeColorNorm) {
            return String(ownerSib.color || "").trim().toUpperCase();
          }
          return null;
        };

        const heroImages = (() => {
          const sameColorSibs = sourceSiblings.filter(
            (s) => normImgColor(s.color) && normImgColor(s.color) === activeColorNorm
          );
          const betterSameColorSib = sameColorSibs.find((s) => {
            const imgs = s.images && s.images.length > 0 ? s.images : s.imageUrl ? [s.imageUrl] : [];
            return imgs.length > 0 && !isUrlOwnedByOtherColor(imgs[0]);
          });

          const curList =
            product.images && product.images.length > 0
              ? product.images
              : product.imageUrl
              ? [product.imageUrl]
              : [];
          if (curList.length > 0 && !isUrlOwnedByOtherColor(curList[0])) {
            return curList;
          }
          if (betterSameColorSib) {
            return betterSameColorSib.images && betterSameColorSib.images.length > 0
              ? betterSameColorSib.images
              : [betterSameColorSib.imageUrl!];
          }
          if (curList.length > 0) return curList;
          const anySibWithImg = sourceSiblings.find((s) => s.imageUrl);
          return anySibWithImg?.imageUrl ? [anySibWithImg.imageUrl] : [];
        })();

        const mismatchedOwnerColor = heroImages.length > 0 ? isUrlOwnedByOtherColor(heroImages[0]) : null;

        const selectedVariantEntries = Object.entries(multiVariantQty).filter(([, q]) => q > 0);
        const selectedVariantsCount = selectedVariantEntries.length;
        const selectedTotalPcs = selectedVariantEntries.reduce((acc, [, q]) => acc + q, 0);
        const targetCartActionType: "FACING_OUT" | "STOCK_CHECK" =
          activeTab === "STOCK_CHECK" ? "STOCK_CHECK" : "FACING_OUT";
        const isFacingAction = targetCartActionType === "FACING_OUT";
        const totalInCartPcs = cart.reduce((acc, c) => acc + (c.qty || 1), 0);
        const effectiveActiveQty = multiVariantQty[product.sku] || 0;
        const pendingVariantsCount = selectedVariantsCount;
        const pendingTotalPcs = selectedTotalPcs;
        const activeColorGroup =
          colorGroupsList.find((c) => c.color === activeColorUpper) || colorGroupsList[0];
        const reviewColorsSorted = [...colorGroupsList].sort((a, b) => a.color.localeCompare(b.color));

        return (
          <div
            ref={productPhotoTopRef}
            className="bg-white rounded-2xl shadow-xl border border-slate-200/80 overflow-hidden scroll-mt-3"
          >
            {/* Sticky / Top Utility Bar */}
            <div className="px-3.5 sm:px-5 py-2.5 border-b border-slate-100 bg-slate-50/90 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <button
                  type="button"
                  onClick={handleBackToCatalog}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-xs font-bold text-slate-700 transition-colors cursor-pointer shrink-0 shadow-2xs"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Kembali</span>
                </button>
                <div className="flex items-center gap-1.5 text-xs text-slate-500 min-w-0">
                  <span className={`inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded border shrink-0 ${productBrandMeta.badgeClass}`}>
                    {productBrandMeta.logoUrl && (
                      <img
                        src={productBrandMeta.logoUrl}
                        alt={productBrandMeta.shortLabel}
                        className="w-3.5 h-3.5 rounded-[3px] object-cover bg-white shrink-0"
                      />
                    )}
                    <span>{productBrandMeta.shortLabel}</span>
                  </span>
                  {product.dept && (
                    <span className="font-semibold text-slate-600 whitespace-normal break-words hidden sm:inline">
                      {product.dept}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono">
                {product.article && (
                  <button
                    type="button"
                    onClick={() => handleCopyText(product.article!, "Artikel")}
                    className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 font-black cursor-pointer transition-colors"
                    title="Ketuk untuk salin Kode Artikel"
                  >
                    ART: {product.article}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleCopyText(product.sku, "SKU")}
                  className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold cursor-pointer transition-colors"
                  title="Ketuk untuk salin SKU"
                >
                  SKU: {product.sku}
                </button>
                {product.barcode && (
                  <button
                    type="button"
                    onClick={() => handleCopyText(product.barcode!, "Barcode")}
                    className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold cursor-pointer transition-colors"
                    title="Ketuk untuk salin Barcode"
                  >
                    <Barcode className="w-3 h-3" />
                    {product.barcode}
                  </button>
                )}
                {totalInCartPcs > 0 && (
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-sans font-black tabular-nums">
                    Keranjang: {totalInCartPcs} pcs
                  </span>
                )}
              </div>
            </div>

            {/* Discount Badge Header saat Promo Aktif */}
            {isOnPromo && (
              <div className="bg-gradient-to-r from-purple-600 via-indigo-600 to-rose-600 px-4 sm:px-5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-white">
                <div className="flex items-center gap-2 font-bold text-xs sm:text-sm min-w-0">
                  <Tag className="w-4 h-4 shrink-0 text-amber-300" />
                  <span className="whitespace-normal break-words">{product.discountType ? product.discountType : "SPECIAL PRICE"}</span>
                </div>
                {hasHargaPromo ? (
                  <span className="bg-white text-red-600 font-extrabold text-xs px-3 py-0.5 rounded-full shadow-sm shrink-0">
                    HEMAT {formatRupiah(product.hargaNormal - product.hargaPromo!)}
                  </span>
                ) : (
                  <span className="bg-white/20 backdrop-blur-sm text-white font-extrabold text-[11px] px-2.5 py-0.5 rounded-full shadow-sm shrink-0 uppercase tracking-wider">
                    PROMO AKTIF
                  </span>
                )}
              </div>
            )}

            {/* Split Layout Utama: Foto Full-Width Kiri (5 Col) + Info & Matrix Warna Kanan (7 Col) */}
            <div className="p-0 md:p-5 grid grid-cols-1 md:grid-cols-12 gap-0 md:gap-6 items-start">

              {/* KOLOM KIRI: Galeri Foto 3:4 Full-Width (Tanpa kotak pembungkus kecil) */}
              <div className="md:col-span-5">
                <ProductImageSlider
                  images={heroImages}
                  alt={`${parsedInfo.name} - ${parsedInfo.color || product.sku}`}
                  className="w-full aspect-[3/4]"
                  roundedClass="rounded-none md:rounded-2xl"
                  imageWidth={800}
                  showThumbnails={true}
                  colorBadge={parsedInfo.color || product.color || null}
                  onBrokenImages={() =>
                    handleHealProductImages({
                      sku: product.sku,
                      article: product.article,
                      barcode: product.barcode,
                    })
                  }
                  isHealing={healingImageKey === (product.article || product.sku)}
                  refreshVersion={imageRefreshVersion}
                />
                {(heroImages.length === 0 || mismatchedOwnerColor) && (
                  <div className="mt-2.5 mx-3 md:mx-0 p-2.5 rounded-xl border border-amber-200 bg-amber-50/95 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] font-bold text-amber-900 whitespace-normal break-words flex-1">
                      {heroImages.length === 0
                        ? `Foto warna ${parsedInfo.color || product.color || "ini"} belum tersedia.`
                        : `Foto tampil milik warna ${mismatchedOwnerColor} (belum sinkron dengan ${parsedInfo.color || product.color}).`}
                    </p>
                    <button
                      type="button"
                      disabled={updatingImages}
                      onClick={() =>
                        handleHealProductImages(
                          { sku: product.sku, article: product.article, barcode: product.barcode },
                          { manual: true, targetColor: parsedInfo.color || product.color }
                        )
                      }
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-extrabold transition-colors disabled:opacity-50 cursor-pointer shrink-0"
                    >
                      {updatingImages ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Camera className="w-3.5 h-3.5" />
                      )}
                      <span>{updatingImages ? "Mencari Foto..." : "Cari & Sinkron Foto"}</span>
                    </button>
                  </div>
                )}
              </div>

              {/* KOLOM KANAN: Detail Inti, Harga/Stok & Rapid Facing Out Matrix Per Warna */}
              <div className="md:col-span-7 p-4 md:p-0 flex flex-col gap-4 min-w-0">

                {/* Judul & Ringkasan + Strip Review Warna Cepat Dekat Foto */}
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-bold bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-full">
                      {productCatLabel}
                    </span>
                    <span className="text-[11px] font-black bg-indigo-600 text-white px-2.5 py-0.5 rounded-full">
                      {parsedInfo.color || "STANDAR"} • {parsedInfo.size || "ALL"}
                    </span>
                    <span className="text-[11px] font-bold text-slate-500 bg-slate-50 border border-slate-200 px-2.5 py-0.5 rounded-full tabular-nums">
                      Total Artikel: {totalArticleStockAllVariants} pcs ({sourceSiblings.length} Varian)
                    </span>
                    {isPromoExpired && (
                      <span className="bg-rose-100 text-rose-700 text-[11px] font-bold px-2.5 py-0.5 rounded-full border border-rose-200">
                        Masa Berlaku Promo Habis
                      </span>
                    )}
                  </div>
                  <h2 className="text-xl sm:text-2xl font-black text-slate-900 leading-snug tracking-tight">
                    {parsedInfo.name}
                  </h2>

                  {reviewColorsSorted.length > 1 && (
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                      <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider shrink-0">
                        🎨 Review Warna ({reviewColorsSorted.length}):
                      </span>
                      {reviewColorsSorted.map((cg) => {
                        const isActivePill = cg.color === activeColorUpper;
                        return (
                          <button
                            key={cg.color}
                            type="button"
                            onClick={() => handleSelectVariant(cg.repSku, true)}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold whitespace-nowrap shrink-0 cursor-pointer transition-all ${
                              isActivePill
                                ? "bg-indigo-600 text-white border-indigo-700 shadow-xs"
                                : "bg-white hover:bg-indigo-50 text-slate-700 border-slate-200"
                            }`}
                          >
                            <span
                              className="w-3 h-3 rounded-full border border-black/15 shrink-0"
                              style={{ backgroundColor: cg.hex || "#cbd5e1" }}
                            />
                            <span>{cg.color}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Box Harga + Sisa Stok EOH + Live Stok + Info Varian Aktif & Cetak Label */}
                <div className="bg-slate-50/90 rounded-2xl p-4 border border-slate-200/80 flex flex-col gap-3.5">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <p className="text-[11px] text-slate-500 uppercase font-bold tracking-wider">
                        {isOnPromo && hasHargaPromo ? "Harga Promo Spesial" : isOnPromo ? "Harga Normal Satuan" : "Harga Normal"}
                      </p>
                      <div className="flex items-baseline gap-2.5 mt-0.5">
                        <p className={`text-3xl sm:text-4xl font-black tabular-nums leading-none ${isOnPromo ? "text-red-600" : "text-slate-900"}`}>
                          {formatRupiah(isOnPromo && product.hargaPromo && product.hargaPromo > 0 ? product.hargaPromo : product.hargaNormal)}
                        </p>
                        {isOnPromo && hasHargaPromo && (
                          <p className="text-sm sm:text-base text-slate-400 line-through font-semibold tabular-nums">
                            {formatRupiah(product.hargaNormal)}
                          </p>
                        )}
                        {isOnPromo && hasHargaPromo && discountPct > 0 && (
                          <span className="bg-red-600 text-white text-[11px] font-black px-2 py-0.5 rounded-md">
                            -{discountPct}%
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleCheckLiveStock}
                        disabled={checkingLiveStock}
                        title="Periksa stok langsung luqman org, lengkapi varian 1 keluarga artikel, & tarik foto studio"
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50 active:scale-95 cursor-pointer border ${
                          !heroImages.length || sourceSiblings.length <= 1
                            ? "bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white border-indigo-700 shadow-sm"
                            : "bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200"
                        }`}
                      >
                        {checkingLiveStock ? (
                          <Loader2 className={`w-3.5 h-3.5 animate-spin ${!heroImages.length || sourceSiblings.length <= 1 ? "text-amber-300" : "text-indigo-600"}`} />
                        ) : (
                          <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                        )}
                        <span className="whitespace-normal break-words">
                          {checkingLiveStock
                            ? "Scrap 1 Artikel & Foto..."
                            : !heroImages.length || sourceSiblings.length <= 1
                            ? "Live Stok & Scrap 1 Artikel + Foto"
                            : "Live Stok"}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          handleHealProductImages(
                            { sku: product.sku, article: product.article, barcode: product.barcode },
                            { manual: true, targetColor: parsedInfo.color || product.color }
                          )
                        }
                        disabled={updatingImages}
                        title="Cari & sinkronkan foto resmi sesuai warna produk aktif + seluruh warna artikel ini dari luqman org"
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50 active:scale-95 cursor-pointer border ${
                          mismatchedOwnerColor || heroImages.length === 0
                            ? "bg-amber-600 hover:bg-amber-700 text-white border-amber-700 shadow-sm"
                            : "bg-white hover:bg-slate-100 text-slate-700 border-slate-200"
                        }`}
                      >
                        {updatingImages ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Camera className={`w-3.5 h-3.5 ${mismatchedOwnerColor || heroImages.length === 0 ? "text-amber-100" : "text-pink-600"}`} />
                        )}
                        <span className="whitespace-normal break-words">
                          {updatingImages ? "Sinkron Foto..." : "Update Gambar"}
                        </span>
                      </button>

                      <div
                        className={`px-3.5 py-1.5 rounded-xl text-center border ${
                          (product.stok ?? 0) > 10
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : (product.stok ?? 0) > 0
                            ? "bg-amber-50 text-amber-700 border-amber-200"
                            : "bg-red-50 text-red-700 border-red-200"
                        }`}
                      >
                        <p className="text-[9px] font-black uppercase opacity-80 leading-tight">
                          {liveStockVerified ? `✓ ${liveStockVerified}` : "Stok EOH"}
                        </p>
                        <p className="text-base font-black tabular-nums leading-tight">
                          {product.stok ?? 0} <span className="text-[10px] font-bold">pcs</span>
                        </p>
                      </div>
                    </div>
                  </div>

                  {isOnPromo && !hasHargaPromo && (
                    <div className="bg-purple-100/90 border border-purple-200 rounded-xl px-3 py-2 flex items-center gap-2 text-purple-950">
                      <Tag className="w-4 h-4 text-purple-700 shrink-0" />
                      <span className="text-xs font-black tracking-wide break-words">
                        {product.discountType || product.diskon || "PROMO SPESIAL KASIR"}
                      </span>
                    </div>
                  )}

                  {/* Ringkasan Varian Aktif + Cetak Label */}
                  <div className="pt-3 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-slate-600">
                      <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700">
                        Varian Aktif: <strong className="text-indigo-700">{parsedInfo.color || "STANDAR"}</strong> • Size <strong className="text-slate-900">{parsedInfo.size || "ALL"}</strong>
                      </span>
                      <span className="px-2 py-1 rounded-lg bg-white border border-slate-200 font-mono text-[10px] text-slate-500">
                        SKU {product.sku}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={handlePrintLabel}
                      className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs active:scale-95 transition-all cursor-pointer shrink-0"
                      title="Cetak Label Harga (PDF)"
                    >
                      <span>🖨️</span>
                      <span>Cetak Label</span>
                    </button>
                  </div>
                </div>

                {/* ════════════════════════════════════════════════════════════════
                    PILIHAN WARNA (AUTO SCROLL FOTO) & UKURAN (AMAN UNTUK REVIEW)
                    ════════════════════════════════════════════════════════════════ */}
                {colorGroupsList.length > 0 && (
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full ${isFacingAction ? "bg-emerald-500" : "bg-indigo-500"}`} />
                          <span>Pilihan Warna &amp; Ukuran ({colorGroupsList.length} Warna • {sourceSiblings.length} Varian)</span>
                        </h3>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Ketuk warna untuk lihat foto di atas • Ketuk kotak size untuk cek detail • Gunakan tombol <strong>+</strong> untuk tambah jumlah
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {hasMixedPromoVariants && (
                          <button
                            type="button"
                            onClick={() => setPromoFocusOnly((v) => !v)}
                            className={`px-3 py-1.5 rounded-xl text-[11px] font-extrabold border transition-colors shrink-0 cursor-pointer shadow-2xs ${
                              promoFocusOnly
                                ? "bg-rose-600 text-white border-rose-700"
                                : "bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200"
                            }`}
                          >
                            {promoFocusOnly
                              ? `🏷️ Hanya SKU Promo (${promoOnlySiblings.length}) • Lihat Semua (${sourceSiblings.length})`
                              : `🏷️ Filter SKU Promo (${promoOnlySiblings.length}/${sourceSiblings.length})`}
                          </button>
                        )}
                        {sourceSiblings.length > 1 && (
                          <button
                            type="button"
                            onClick={(e) => addFullArticleSetQty(e)}
                            className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-[11px] font-extrabold transition-colors shrink-0 cursor-pointer shadow-2xs"
                          >
                            📦 +1 Seluruh Artikel ({sourceSiblings.length} Varian)
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col gap-2.5">
                      {colorGroupsList.map((cg) => {
                        const isActiveColorGroup = cg.color === activeColorUpper;
                        const colorPickedPcs = cg.sizes.reduce((s, item) => s + (multiVariantQty[item.sku] || 0), 0);

                        return (
                          <div
                            key={cg.color}
                            onClick={() => handleSelectVariant(cg.repSku, true)}
                            className={`rounded-2xl border-2 p-3 sm:p-3.5 transition-all cursor-pointer flex flex-col gap-2.5 ${
                              isActiveColorGroup
                                ? "border-indigo-500 bg-indigo-50/20 shadow-xs"
                                : "border-slate-200 bg-white hover:border-slate-300"
                            }`}
                          >
                            {/* Header Kartu Warna */}
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span
                                  className="w-6 h-6 rounded-full border border-black/15 shadow-2xs shrink-0 flex items-center justify-center text-[9px] font-black"
                                  style={cg.hex ? { backgroundColor: cg.hex, color: cg.isDark ? "#fff" : "#0f172a" } : { backgroundColor: "#e2e8f0" }}
                                >
                                  {cg.hex ? "" : cg.color.slice(0, 1)}
                                </span>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-wide">
                                      {cg.color}
                                    </span>
                                    {isActiveColorGroup ? (
                                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-indigo-600 text-white uppercase">
                                        ✓ Foto Tampil di Atas
                                      </span>
                                    ) : (
                                      <span className="text-[10px] font-semibold text-indigo-600">
                                        👁️ Ketuk lihat foto atas
                                      </span>
                                    )}
                                    {colorPickedPcs > 0 && (
                                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-600 text-white tabular-nums">
                                        +{colorPickedPcs} dipilih
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-slate-500 tabular-nums">
                                    Total warna: <strong className="text-slate-700">{cg.totalStock} pcs</strong> • {cg.sizes.length} ukuran
                                  </p>
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={(e) => addFullColorSetQty(cg.sizes, e)}
                                className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 border border-slate-200 hover:border-emerald-300 text-[11px] font-extrabold transition-colors shrink-0 cursor-pointer shadow-2xs"
                              >
                                ⚡ +1 Semua Size ({cg.sizes.length})
                              </button>
                            </div>

                            {/* Kotak Ukuran di dalam Kartu Warna (Review-Safe: Tap Kotak = Review Detail, Tap + = Tambah Keranjang) */}
                            <div
                              className="grid grid-cols-2 sm:grid-cols-4 gap-2"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {cg.sizes.map((item) => {
                                const pickedQty = multiVariantQty[item.sku] || 0;
                                const hasPromoPrice = Boolean(
                                  item.hargaPromo && item.hargaPromo > 0 && item.hargaPromo < item.hargaNormal
                                );
                                return (
                                  <div
                                    key={item.sku}
                                    onClick={() => handleReviewSizeVariant(item.sku)}
                                    className={`rounded-xl p-2.5 bg-white border-2 flex flex-col justify-between gap-1.5 cursor-pointer transition-all select-none ${
                                      pickedQty > 0
                                        ? "border-emerald-500 ring-2 ring-emerald-500/20 shadow-xs"
                                        : item.isCurrent
                                        ? "border-indigo-500 bg-indigo-50/30"
                                        : "border-slate-200 hover:border-indigo-300"
                                    }`}
                                  >
                                    <div className="flex items-center justify-between gap-1">
                                      <span className="text-sm sm:text-base font-black text-slate-900 leading-none">
                                        {item.size}
                                      </span>
                                      {pickedQty > 0 ? (
                                        <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-black tabular-nums">
                                          +{pickedQty}
                                        </span>
                                      ) : item.isCurrent ? (
                                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 uppercase">
                                          Aktif
                                        </span>
                                      ) : (
                                        <span className="text-[10px] font-semibold text-slate-400">
                                          Cek
                                        </span>
                                      )}
                                    </div>

                                    <div className="flex items-center justify-between gap-1 text-[11px] tabular-nums">
                                      <span
                                        className={`font-bold ${
                                          item.stok > 0 ? "text-emerald-600" : "text-slate-400"
                                        }`}
                                      >
                                        Stok {item.stok}
                                      </span>
                                      {item.isOnPromo && (
                                        <span className="text-[9px] font-black px-1 py-0.5 rounded bg-rose-100 text-rose-700">
                                          {hasPromoPrice ? formatRupiah(item.hargaPromo) : "PROMO"}
                                        </span>
                                      )}
                                    </div>

                                    {pickedQty > 0 ? (
                                      <div
                                        className="flex items-center justify-between gap-1 pt-1 border-t border-slate-100"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <button
                                          type="button"
                                          onClick={(e) => adjustVariantQty(item.sku, -1, e)}
                                          className="flex-1 h-7 rounded-md bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-700 font-black text-xs cursor-pointer"
                                        >
                                          −
                                        </button>
                                        <span className="text-[11px] font-black text-emerald-700 px-1.5 tabular-nums">
                                          {pickedQty} pcs
                                        </span>
                                        <button
                                          type="button"
                                          onClick={(e) => adjustVariantQty(item.sku, 1, e)}
                                          className="flex-1 h-7 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs cursor-pointer"
                                        >
                                          +
                                        </button>
                                      </div>
                                    ) : (
                                      <div
                                        className="flex items-center justify-between gap-1 pt-1 border-t border-slate-100"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <span className="text-[10px] font-mono text-slate-400">#{item.sku.slice(-4)}</span>
                                        <button
                                          type="button"
                                          onClick={(e) => adjustVariantQty(item.sku, 1, e)}
                                          className="px-2 py-1 rounded-md bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white border border-emerald-200 hover:border-emerald-600 text-[10px] font-black transition-colors cursor-pointer"
                                        >
                                          + Pilih
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Detail Acara Promo (bila ada) */}
                {isOnPromo && product.acara && (
                  <div
                    className={`border rounded-xl p-3.5 flex flex-col gap-1.5 ${
                      isPromoExpired ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <p
                        className={`text-xs font-bold uppercase tracking-wide ${
                          isPromoExpired ? "text-red-700" : "text-amber-700"
                        }`}
                      >
                        Info Promo
                      </p>
                      {isPromoExpired && (
                        <span className="bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase animate-pulse">
                          Promo Habis
                        </span>
                      )}
                    </div>
                    <p
                      className={`text-sm font-medium leading-snug ${
                        isPromoExpired ? "text-red-800" : "text-amber-800"
                      }`}
                    >
                      {product.acara}
                    </p>
                    {(product.fromDate || product.toDate) && (
                      <div
                        className={`flex items-center gap-1.5 text-xs mt-1 ${
                          isPromoExpired ? "text-red-700" : "text-amber-700"
                        }`}
                      >
                        <CalendarRange className="w-3.5 h-3.5" />
                        <span>
                          {formatDate(product.fromDate)} – {formatDate(product.toDate)}
                        </span>
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

            {/* Curated Sticky Bottom "Add Keranjang" Bar (1 Size / 1 Warna / 1 Artikel Full + 2 Tombol Aksi) */}
            <div className="sticky bottom-2 z-40 mx-2 mb-2 sm:mx-4 sm:mb-4 rounded-2xl bg-slate-900 text-white p-3 sm:p-4 shadow-2xl border border-slate-700 flex flex-col gap-2.5">
              {/* Strip Keranjang Aktif di HP/Desktop agar user bisa langsung Kirim dari bawah */}
              {cart.length > 0 && (
                <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-700/80 text-xs">
                  <span className="font-bold text-emerald-300 whitespace-normal break-words">
                    🛒 Keranjang Aktif: {cart.length} Varian ({totalInCartPcs} Pcs)
                  </span>
                  <button
                    type="button"
                    onClick={submitCart}
                    disabled={submitting}
                    className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-black text-[11px] transition-colors shrink-0 cursor-pointer disabled:opacity-50"
                  >
                    {submitting ? "Mengirim..." : "Kirim ke Gudang 🚀"}
                  </button>
                </div>
              )}

              {/* Row 1: Kurasi Pilihan Cepat (1 Size / 1 Warna / 1 Artikel Full) */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                <button
                  type="button"
                  onClick={() => {
                    const nextVal = effectiveActiveQty > 0 ? effectiveActiveQty : 1;
                    setMultiVariantQty({ [product.sku]: nextVal });
                    setQty(nextVal);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-[11px] font-bold text-slate-200 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                >
                  1 Size Ini ({parsedInfo.color || "STD"} • {parsedInfo.size || "ALL"})
                </button>
                {activeColorGroup && activeColorGroup.sizes.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => addFullColorSetQty(activeColorGroup.sizes, e)}
                    className="px-2.5 py-1 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-600/60 text-[11px] font-bold text-emerald-200 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                  >
                    +1 Warna {activeColorGroup.color} ({activeColorGroup.sizes.length} Size)
                  </button>
                )}
                {sourceSiblings.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => addFullArticleSetQty(e)}
                    className="px-2.5 py-1 rounded-lg bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-500/60 text-[11px] font-bold text-indigo-200 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                  >
                    +1 Artikel Full ({sourceSiblings.length} Varian)
                  </button>
                )}
                {selectedVariantsCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setMultiVariantQty({});
                      setQty(0);
                    }}
                    className="ml-auto px-2.5 py-1 rounded-lg bg-rose-950/80 hover:bg-rose-900 border border-rose-500/50 text-[11px] font-bold text-rose-200 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Hapus (0)
                  </button>
                )}
              </div>

              {/* Row 2: Stepper Jumlah Terpadu + Summary + 2 Tombol Add Keranjang */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex items-center justify-between sm:justify-start gap-3">
                  <div className="inline-flex items-center bg-slate-800 border border-slate-600 rounded-xl overflow-hidden shrink-0">
                    <button
                      type="button"
                      disabled={pendingTotalPcs === 0}
                      onClick={() => {
                        if (selectedVariantEntries.length === 1) {
                          adjustVariantQty(selectedVariantEntries[0][0], -1);
                        } else if (selectedVariantEntries.length > 1) {
                          const targetDecrementSku =
                            (multiVariantQty[product.sku] || 0) > 0
                              ? product.sku
                              : selectedVariantEntries[selectedVariantEntries.length - 1][0];
                          adjustVariantQty(targetDecrementSku, -1);
                        } else {
                          setActiveVariantStepperQty(0);
                        }
                      }}
                      title="Kurangi jumlah (sampai 0 untuk batal/hapus)"
                      className="w-9 h-9 flex items-center justify-center text-white hover:bg-rose-900/70 font-black text-base cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed"
                    >
                      −
                    </button>
                    <span className={`min-w-[3.75rem] px-2 text-center text-xs font-black tabular-nums ${pendingTotalPcs > 0 ? "text-emerald-300" : "text-slate-400"}`}>
                      {pendingTotalPcs} pcs
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedVariantEntries.length === 1) {
                          adjustVariantQty(selectedVariantEntries[0][0], 1);
                        } else {
                          adjustVariantQty(product.sku, 1);
                        }
                      }}
                      className="w-9 h-9 flex items-center justify-center text-white hover:bg-slate-700 font-black text-base cursor-pointer"
                    >
                      +
                    </button>
                  </div>

                  <div className="min-w-0">
                    <p className={`text-xs font-black tabular-nums whitespace-normal break-words ${pendingTotalPcs > 0 ? "text-white" : "text-slate-300"}`}>
                      {pendingTotalPcs > 0
                        ? `${pendingVariantsCount} Varian • ${pendingTotalPcs} Pcs`
                        : "0 Varian • Pilih ukuran"}
                    </p>
                    <label
                      className="inline-flex items-center gap-1.5 cursor-pointer select-none mt-0.5"
                      title="Otomatis buka kamera setelah ditambahkan"
                    >
                      <input
                        type="checkbox"
                        className="w-3 h-3 text-emerald-500 rounded border-slate-500 bg-slate-800 focus:ring-emerald-400"
                        checked={continuousMode}
                        onChange={(e) => setContinuousMode(e.target.checked)}
                      />
                      <span className="text-[10px] font-semibold text-slate-300">Scan Lanjut</span>
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={pendingTotalPcs === 0}
                    onClick={() => handleUnifiedAddToCart(targetCartActionType, true)}
                    className="px-3 py-2.5 rounded-xl border border-slate-500 bg-slate-700 hover:bg-slate-600 text-white font-bold text-xs cursor-pointer transition-all active:scale-95 text-center disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    + Keranjang, Pilih Lagi
                  </button>
                  <button
                    type="button"
                    disabled={pendingTotalPcs === 0}
                    onClick={() => handleUnifiedAddToCart(targetCartActionType, false)}
                    className={`px-3.5 py-2.5 rounded-xl font-black text-xs shadow-md transition-all flex items-center justify-center gap-1.5 ${
                      pendingTotalPcs === 0
                        ? "bg-slate-700 text-slate-400 border border-slate-600 cursor-not-allowed shadow-none"
                        : isFacingAction
                        ? "bg-emerald-500 hover:bg-emerald-400 text-slate-950 cursor-pointer active:scale-95"
                        : "bg-indigo-500 hover:bg-indigo-400 text-white cursor-pointer active:scale-95"
                    }`}
                  >
                    <ShoppingCart className="w-4 h-4 shrink-0" />
                    <span>
                      {pendingTotalPcs === 0
                        ? "Pilih Size Dulu"
                        : isFacingAction
                        ? `+ Keranjang (${pendingTotalPcs} Pcs)`
                        : `+ Tanya Stok (${pendingTotalPcs} Pcs)`}
                    </span>
                  </button>
                </div>
              </div>
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
                Tidak ada artikel untuk kombinasi filter ini
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {[
                  selectedBrandGroup !== "ALL" ? `Toko: ${getBrandGroupMeta(selectedBrandGroup).shortLabel}` : null,
                  selectedSubBrand ? `Merk: ${selectedSubBrand}` : null,
                  selectedCategory !== "ALL" ? `Kategori: ${CATEGORY_LABELS[selectedCategory]}` : null,
                ].filter(Boolean).join(" • ")}
              </p>
            </div>
            <button
              type="button"
              onClick={handleResetTaxonomyFilters}
              className="text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl transition-colors cursor-pointer"
            >
              Reset Filter
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center py-8 px-4 gap-3 text-slate-400">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 border border-slate-200/70 flex items-center justify-center text-slate-400">
              <Search className="w-6 h-6" />
            </div>
            <div className="text-center">
              <p className="text-xs sm:text-sm font-bold text-slate-600">
                Siap mencari produk, jelajah toko (SUKO • Mu+Ku • ZES), atau scan barcode
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {localCacheStats?.ready
                  ? `${localCacheStats.modelCount.toLocaleString('id-ID')} Kode Artikel = ${localCacheStats.skuCount.toLocaleString('id-ID')} SKU (total ukuran/warna) tersimpan instan di HP (~${localCacheStats.sizeMB} MB)`
                  : `Contoh: ketik kode artikel, SKU 13463728, atau pilih filter Toko & Kategori di atas`}
              </p>
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
      {cart.length > 0 && (() => {
        const totalCartPcs = cart.reduce((acc, c) => acc + (c.qty || 1), 0);
        return (
        <div className={`${product ? 'hidden lg:block' : 'fixed'} lg:sticky lg:top-24 bottom-0 left-0 right-0 lg:left-auto lg:right-auto p-4 lg:p-5 bg-white lg:rounded-2xl lg:border border-t shadow-[0_-10px_20px_rgba(0,0,0,0.05)] lg:shadow-xl z-50 animate-in slide-in-from-bottom-full lg:slide-in-from-right-8 duration-300 w-full lg:w-[350px] mx-auto h-fit`}>
          <div className="flex justify-between items-center mb-3">
            <div>
              <p className="text-xs text-slate-500 font-bold uppercase">Daftar Kirim</p>
              <p className="font-extrabold text-blue-700 tabular-nums">{cart.length} Varian • {totalCartPcs} Pcs</p>
            </div>
            <button onClick={() => updateCart([])} className="text-xs text-red-500 font-bold uppercase py-1 px-3 bg-red-50 rounded-lg hover:bg-red-100 transition-colors cursor-pointer">Kosongkan</button>
          </div>
          
          {/* Cart Items Preview (Mobile & Desktop) */}
          <div className="flex flex-col gap-2 mb-3 max-h-40 lg:max-h-[40vh] overflow-y-auto pr-1">
            {cart.map((item, idx) => (
              <div key={`${item.sku}_${item.type}_${idx}`} className="text-xs border rounded-lg p-2.5 flex justify-between items-center gap-2 bg-slate-50">
                <div className="min-w-0 flex-1">
                  <span className="font-bold block whitespace-normal break-words text-slate-800">{item.productName.split(':')[0]}</span>
                  <span className="text-slate-500 font-mono text-[11px]">{item.sku}{item.color ? ` • ${item.color}` : ''}{item.size ? ` • ${item.size}` : ''}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <div className="inline-flex items-center bg-white border border-slate-200 rounded-lg overflow-hidden">
                    <button
                      type="button"
                      onClick={() => adjustCartItemQty(idx, -1)}
                      className="w-6 h-6 flex items-center justify-center text-slate-600 hover:bg-rose-50 hover:text-rose-600 font-black cursor-pointer"
                    >
                      −
                    </button>
                    <span className="px-1.5 text-[11px] font-black text-blue-700 tabular-nums">
                      {item.qty || 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => adjustCartItemQty(idx, 1)}
                      className="w-6 h-6 flex items-center justify-center text-slate-600 hover:bg-emerald-50 hover:text-emerald-600 font-black cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                  <div className="font-bold text-[10px] text-blue-700 uppercase">
                    {item.type === 'STOCK_CHECK' ? 'CEK' : 'FO'}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button onClick={submitCart} disabled={submitting} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-3.5 rounded-xl shadow-lg shadow-blue-200 flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer">
            {submitting ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" /> : `Kirim Semua ke Gudang (${totalCartPcs} Pcs) 🚀`}
          </button>
        </div>
        );
      })()}

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
