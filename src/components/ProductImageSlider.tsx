"use client";

import { useState, useRef, useEffect, TouchEvent } from "react";
import { ChevronLeft, ChevronRight, Maximize2, Image as ImageIcon } from "lucide-react";
import ImageLightboxModal from "@/components/ImageLightboxModal";
import {
  buildRetryImageUrl,
  isJunkRetailImageDimensions,
  optimizeRetailImageUrl,
  reportJunkImageToServer,
  sanitizeRetailImageList,
  sanitizeRetailImageUrl,
} from "@/lib/imageController";

export { optimizeRetailImageUrl };

const preloadedUrls = new Set<string>();

/**
 * Preload daftar URL gambar ke RAM browser di background agar saat diklik/discan langsung muncul 0ms
 * (dibatasi maks 12 URL sekaligus & melewati gambar sampah/logo abu-abu agar tidak membombardir CDN)
 */
export function preloadProductImages(urls: (string | null | undefined)[], width: number = 400) {
  if (typeof window === "undefined") return;
  let queued = 0;
  for (const raw of urls) {
    if (!raw || queued >= 12) break;
    const opt = sanitizeRetailImageUrl(raw);
    if (!opt || preloadedUrls.has(opt)) continue;
    preloadedUrls.add(opt);
    queued++;
    const img = new window.Image();
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    img.src = optimizeRetailImageUrl(opt, width);
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
  onBrokenImages?: () => Promise<boolean | void> | void;
  isHealing?: boolean;
  refreshVersion?: number;
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
  onBrokenImages,
  isHealing = false,
  refreshVersion = 0,
}: ProductImageSliderProps) {
  const cleanImages = sanitizeRetailImageList(images);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isZoomed, setIsZoomed] = useState(false);
  const [retryAttempts, setRetryAttempts] = useState<Record<number, number>>({});
  const [thumbRetryAttempts, setThumbRetryAttempts] = useState<Record<number, number>>({});
  const [hasError, setHasError] = useState<Record<number, boolean>>({});
  const [thumbError, setThumbError] = useState<Record<number, boolean>>({});
  const healTriggeredKeyRef = useRef<string>("");
  const retryTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Reset state ketika daftar gambar berganti ATAU setelah manual Update Gambar (refreshVersion naik)
  const imagesKey = cleanImages.join("|");
  useEffect(() => {
    retryTimersRef.current.forEach((t) => clearTimeout(t));
    retryTimersRef.current = [];
    setCurrentIndex(0);
    setRetryAttempts({});
    setThumbRetryAttempts({});
    setHasError({});
    setThumbError({});
    healTriggeredKeyRef.current = "";
    // Preload slide ke-2 dst di background setelah gambar utama
    if (cleanImages.length > 1) {
      preloadProductImages(cleanImages.slice(1), imageWidth);
    }
    return () => {
      retryTimersRef.current.forEach((t) => clearTimeout(t));
      retryTimersRef.current = [];
    };
  }, [imagesKey, imageWidth, refreshVersion]);

  const triggerBrokenHeal = () => {
    if (!onBrokenImages) return;
    if (healTriggeredKeyRef.current === imagesKey) return;
    healTriggeredKeyRef.current = imagesKey;
    Promise.resolve(onBrokenImages()).catch(() => {});
  };

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
        className={`relative ${className} ${roundedClass} bg-gradient-to-br from-slate-100 via-slate-200/70 to-slate-100 flex flex-col items-center justify-center border border-slate-200/90 text-slate-400 p-5 text-center`}
      >
        <div className="w-16 h-16 rounded-2xl bg-slate-200/80 border border-slate-300/60 flex items-center justify-center mb-2.5 shadow-inner">
          <ImageIcon className="w-8 h-8 text-slate-400" />
        </div>
        <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
          {colorBadge ? `Foto Warna ${colorBadge}` : "Foto Produk"}
        </span>
        <span className="text-[11px] font-semibold text-slate-400 mt-0.5">
          Belum Tersedia
        </span>
      </div>
    );
  }

  const safeIndex = currentIndex < cleanImages.length ? currentIndex : 0;
  const rawCurrentSrc = cleanImages[safeIndex] || cleanImages[0];
  const baseSrc = optimizeRetailImageUrl(rawCurrentSrc, imageWidth);
  const activeAttempt = retryAttempts[safeIndex] || 0;
  const displaySrc = activeAttempt > 0 ? buildRetryImageUrl(baseSrc, activeAttempt) : baseSrc;
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
            <div className="w-full h-full flex flex-col items-center justify-center bg-slate-100 text-slate-400 p-3 text-center">
              {isHealing ? (
                <>
                  <div className="w-6 h-6 rounded-full border-2 border-blue-500 border-t-transparent animate-spin mb-2" />
                  <span className="text-[11px] font-bold text-blue-600">Memperbarui foto dari server...</span>
                </>
              ) : (
                <>
                  <ImageIcon className="w-8 h-8 opacity-40 mb-1" />
                  <span className="text-[10px] font-bold">Foto tidak tersedia</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setHasError((prev) => ({ ...prev, [safeIndex]: false }));
                      setRetryAttempts((prev) => ({ ...prev, [safeIndex]: (prev[safeIndex] || 0) + 1 }));
                      healTriggeredKeyRef.current = "";
                      triggerBrokenHeal();
                    }}
                    className="mt-2 px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-extrabold shadow-xs cursor-pointer"
                  >
                    Muat Ulang / Sinkron Foto
                  </button>
                </>
              )}
            </div>
          ) : (
            <img
              key={`${safeIndex}-${refreshVersion}-${displaySrc}`}
              src={displaySrc}
              alt={`${alt} - Foto ${safeIndex + 1}`}
              loading="eager"
              decoding="sync"
              fetchPriority="high"
              referrerPolicy="no-referrer"
              draggable={false}
              onLoad={(e) => {
                const el = e.currentTarget;
                if (isJunkRetailImageDimensions(el.naturalWidth, el.naturalHeight)) {
                  reportJunkImageToServer({
                    imageUrl: rawCurrentSrc,
                    width: el.naturalWidth,
                    height: el.naturalHeight,
                  });
                  setHasError((prev) => ({ ...prev, [safeIndex]: true }));
                  triggerBrokenHeal();
                }
              }}
              onError={() => {
                const curTry = retryAttempts[safeIndex] || 0;
                if (curTry < 2) {
                  const delayMs = curTry === 0 ? 500 : 1400;
                  const t = setTimeout(() => {
                    setRetryAttempts((prev) => ({ ...prev, [safeIndex]: curTry + 1 }));
                  }, delayMs);
                  retryTimersRef.current.push(t);
                } else {
                  setHasError((prev) => ({ ...prev, [safeIndex]: true }));
                  triggerBrokenHeal();
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
            <span className="px-2.5 py-1 rounded-full bg-slate-950/75 backdrop-blur-md text-white text-[11px] font-black uppercase tracking-wide shadow-sm whitespace-normal break-words max-w-[65%]">
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
            const baseThumbSrc = optimizeRetailImageUrl(imgUrl, 160);
            const tAttempt = thumbRetryAttempts[idx] || 0;
            const thumbSrc = tAttempt > 0 ? buildRetryImageUrl(baseThumbSrc, tAttempt) : baseThumbSrc;
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
                {thumbError[idx] ? (
                  <div className="w-full h-full flex items-center justify-center bg-slate-100 text-slate-300">
                    <ImageIcon className="w-4 h-4" />
                  </div>
                ) : (
                  <img
                    key={`${idx}-${refreshVersion}-${thumbSrc}`}
                    src={thumbSrc}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onLoad={(e) => {
                      const el = e.currentTarget;
                      if (isJunkRetailImageDimensions(el.naturalWidth, el.naturalHeight)) {
                        reportJunkImageToServer({
                          imageUrl: imgUrl,
                          width: el.naturalWidth,
                          height: el.naturalHeight,
                        });
                        setThumbError((prev) => ({ ...prev, [idx]: true }));
                      }
                    }}
                    onError={() => {
                      const curTry = thumbRetryAttempts[idx] || 0;
                      if (curTry < 2) {
                        const t = setTimeout(() => {
                          setThumbRetryAttempts((prev) => ({ ...prev, [idx]: curTry + 1 }));
                        }, curTry === 0 ? 600 : 1500);
                        retryTimersRef.current.push(t);
                      } else {
                        setThumbError((prev) => ({ ...prev, [idx]: true }));
                        triggerBrokenHeal();
                      }
                    }}
                    className="w-full h-full object-cover object-top"
                  />
                )}
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
