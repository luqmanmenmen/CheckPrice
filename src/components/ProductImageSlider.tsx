"use client";

import { useState, useRef, useEffect, TouchEvent } from "react";
import { ChevronLeft, ChevronRight, Maximize2, Image as ImageIcon } from "lucide-react";
import ImageLightboxModal from "@/components/ImageLightboxModal";

const preloadedUrls = new Set<string>();

/**
 * Mengoptimalkan URL gambar CDN Shopify / Matahari.com agar berukuran ringan (~12–18 KB vs 1.2 MB)
 * sehingga langsung tampil 0ms tanpa loading lama saat di-scan atau dicari!
 */
export function optimizeRetailImageUrl(rawUrl?: string | null, width: number = 400): string {
  if (!rawUrl || typeof rawUrl !== "string") return "";
  const trimmed = rawUrl.trim();
  if (!trimmed) return "";

  if (trimmed.includes("cdn.shopify.com") || trimmed.includes("matahari.com/cdn/shop")) {
    try {
      const u = new URL(trimmed);
      u.searchParams.set("width", String(width));
      return u.toString();
    } catch {
      const sep = trimmed.includes("?") ? "&" : "?";
      return `${trimmed}${sep}width=${width}`;
    }
  }
  return trimmed;
}

/**
 * Preload daftar URL gambar ke RAM browser di background agar saat diklik/discan langsung muncul 0ms
 */
export function preloadProductImages(urls: (string | null | undefined)[], width: number = 400) {
  if (typeof window === "undefined") return;
  for (const raw of urls) {
    if (!raw) continue;
    const opt = optimizeRetailImageUrl(raw, width);
    if (!opt || preloadedUrls.has(opt)) continue;
    preloadedUrls.add(opt);
    const img = new window.Image();
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    img.src = opt;
  }
}

interface ProductImageSliderProps {
  images?: string[] | null;
  alt: string;
  className?: string;
  roundedClass?: string;
  aspectRatio?: string;
  allowZoom?: boolean;
  imageWidth?: number;
  showThumbnails?: boolean;
  colorBadge?: string | null;
}

export default function ProductImageSlider({
  images,
  alt,
  className = "w-full aspect-[3/4]",
  roundedClass = "rounded-2xl",
  allowZoom = true,
  imageWidth = 400,
  showThumbnails = false,
  colorBadge = null,
}: ProductImageSliderProps) {
  const cleanImages = (images || []).filter(
    (u): u is string => typeof u === "string" && u.trim().length > 0
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isZoomed, setIsZoomed] = useState(false);
  const [useRawFallback, setUseRawFallback] = useState<Record<number, boolean>>({});
  const [hasError, setHasError] = useState<Record<number, boolean>>({});

  // Reset index ketika gambar utama berganti (misal ganti produk / warna)
  const firstImageKey = cleanImages[0] || "";
  useEffect(() => {
    setCurrentIndex(0);
    setUseRawFallback({});
    setHasError({});
    // Preload slide ke-2 dst di background setelah gambar utama
    if (cleanImages.length > 1) {
      preloadProductImages(cleanImages.slice(1), imageWidth);
    }
  }, [firstImageKey, imageWidth]);

  // Touch Swipe Handling
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);
  const minSwipeDistance = 35; // px

  const onTouchStart = (e: TouchEvent) => {
    touchEndX.current = null;
    touchStartX.current = e.targetTouches[0].clientX;
  };

  const onTouchMove = (e: TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX;
  };

  const onTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return;
    const distance = touchStartX.current - touchEndX.current;
    if (Math.abs(distance) > minSwipeDistance) {
      if (distance > 0) {
        handleNext();
      } else {
        handlePrev();
      }
    }
    touchStartX.current = null;
    touchEndX.current = null;
  };

  const handleNext = () => {
    if (cleanImages.length <= 1) return;
    setCurrentIndex((prev) => (prev + 1) % cleanImages.length);
  };

  const handlePrev = () => {
    if (cleanImages.length <= 1) return;
    setCurrentIndex((prev) => (prev - 1 + cleanImages.length) % cleanImages.length);
  };

  if (cleanImages.length === 0) {
    return (
      <div
        className={`relative ${className} ${roundedClass} bg-gradient-to-br from-slate-100 to-slate-200/70 flex flex-col items-center justify-center border border-slate-200 text-slate-400 p-4`}
      >
        <ImageIcon className="w-10 h-10 opacity-40 mb-1.5" />
        <span className="text-[11px] font-bold uppercase tracking-wider opacity-70">
          Foto Belum Tersedia
        </span>
      </div>
    );
  }

  const safeIndex = currentIndex < cleanImages.length ? currentIndex : 0;
  const rawCurrentSrc = cleanImages[safeIndex] || cleanImages[0];
  const displaySrc = useRawFallback[safeIndex]
    ? rawCurrentSrc
    : optimizeRetailImageUrl(rawCurrentSrc, imageWidth);
  const isMulti = cleanImages.length > 1;

  // Untuk Lightbox Zoom gunakan resolusi HD (width=1000)
  const hdZoomImages = cleanImages.map((u) => optimizeRetailImageUrl(u, 1000));

  return (
    <div className="flex flex-col gap-2.5 w-full">
      <div
        className={`relative ${className} ${roundedClass} overflow-hidden bg-slate-100 shadow-sm border border-slate-200/90 select-none group touch-pan-y`}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* Render langsung gambar aktif tanpa delay animasi fade agar muncul 0ms */}
        <div className="w-full h-full relative overflow-hidden bg-slate-100">
          {hasError[safeIndex] ? (
            <div className="w-full h-full flex flex-col items-center justify-center bg-slate-100 text-slate-400 p-2">
              <ImageIcon className="w-8 h-8 opacity-40 mb-1" />
              <span className="text-[10px] font-bold">Gagal memuat</span>
            </div>
          ) : (
            <img
              key={displaySrc}
              src={displaySrc}
              alt={`${alt} - Foto ${safeIndex + 1}`}
              loading="eager"
              decoding="sync"
              fetchPriority="high"
              referrerPolicy="no-referrer"
              draggable={false}
              onError={() => {
                if (!useRawFallback[safeIndex] && displaySrc !== rawCurrentSrc) {
                  setUseRawFallback((prev) => ({ ...prev, [safeIndex]: true }));
                } else {
                  setHasError((prev) => ({ ...prev, [safeIndex]: true }));
                }
              }}
              className="w-full h-full object-cover object-top cursor-zoom-in transition-transform duration-300 group-hover:scale-[1.02]"
              onClick={() => allowZoom && setIsZoomed(true)}
            />
          )}
        </div>

        {/* Tombol Navigasi Kiri / Kanan */}
        {isMulti && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handlePrev();
              }}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 z-20 w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white/85 hover:bg-white text-slate-900 border border-black/10 shadow-md flex items-center justify-center transition-all active:scale-95 sm:opacity-0 sm:group-hover:opacity-100 cursor-pointer"
              aria-label="Foto Sebelumnya"
            >
              <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleNext();
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 z-20 w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white/85 hover:bg-white text-slate-900 border border-black/10 shadow-md flex items-center justify-center transition-all active:scale-95 sm:opacity-0 sm:group-hover:opacity-100 cursor-pointer"
              aria-label="Foto Selanjutnya"
            >
              <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </>
        )}

        {/* Bar Badge Bawah Gambar (Warna, Counter 1/6, & Tombol Layar Penuh) */}
        <div className="absolute bottom-2.5 inset-x-2.5 z-20 flex items-center justify-between gap-2 pointer-events-none">
          {colorBadge ? (
            <span className="px-2.5 py-1 rounded-full bg-slate-950/75 backdrop-blur-md text-white text-[11px] font-black uppercase tracking-wide shadow-sm truncate max-w-[55%]">
              Warna: {colorBadge}
            </span>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-1.5 pointer-events-auto">
            {isMulti && (
              <span className="px-2.5 py-1 rounded-full bg-slate-950/75 backdrop-blur-md text-white text-[11px] font-mono font-bold tabular-nums shadow-sm">
                {safeIndex + 1}/{cleanImages.length}
              </span>
            )}
            {allowZoom && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsZoomed(true);
                }}
                className="px-2.5 py-1 rounded-full bg-slate-950/75 hover:bg-slate-950 backdrop-blur-md text-white text-[11px] font-bold flex items-center gap-1 shadow-sm cursor-pointer transition-colors"
                title="Perbesar Foto Layar Penuh"
              >
                <Maximize2 className="w-3 h-3" />
                <span className="hidden sm:inline">Layar Penuh</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Strip Thumbnail Klik-Cepat di bawah Gambar Utama */}
      {showThumbnails && isMulti && (
        <div className="flex items-center gap-1.5 overflow-x-auto px-3 sm:px-0 pb-0.5">
          {cleanImages.map((imgUrl, idx) => {
            const thumbSrc = optimizeRetailImageUrl(imgUrl, 160);
            const active = idx === safeIndex;
            return (
              <button
                key={`${imgUrl}-${idx}`}
                type="button"
                onClick={() => setCurrentIndex(idx)}
                className={`relative shrink-0 w-13 sm:w-14 aspect-[3/4] rounded-xl overflow-hidden border-2 transition-all cursor-pointer bg-slate-100 ${
                  active
                    ? "border-slate-900 ring-2 ring-slate-900/15 shadow-xs"
                    : "border-slate-200 opacity-70 hover:opacity-100"
                }`}
                aria-label={`Lihat sudut foto ${idx + 1}`}
              >
                <img
                  src={thumbSrc}
                  alt={`${alt} thumbnail ${idx + 1}`}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover object-top"
                />
                <span className="absolute bottom-0.5 right-0.5 px-1 rounded bg-black/65 text-white text-[9px] font-mono font-bold">
                  {idx + 1}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Modal Lightbox Zoom */}
      <ImageLightboxModal
        isOpen={isZoomed}
        onClose={() => setIsZoomed(false)}
        images={hdZoomImages}
        initialIndex={safeIndex}
        title={alt}
      />
    </div>
  );
}
