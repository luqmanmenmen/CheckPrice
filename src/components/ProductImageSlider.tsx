"use client";

import { useState, useRef, useEffect, TouchEvent } from "react";
import { ChevronLeft, ChevronRight, Maximize2, X, Image as ImageIcon } from "lucide-react";
import ImageLightboxModal from "@/components/ImageLightboxModal";

interface ProductImageSliderProps {
  images?: string[] | null;
  alt: string;
  className?: string;
  aspectRatio?: string;
  allowZoom?: boolean;
}

export default function ProductImageSlider({
  images,
  alt,
  className = "w-40 h-52 sm:w-48 sm:h-60",
  aspectRatio = "aspect-[3/4]",
  allowZoom = true,
}: ProductImageSliderProps) {
  const cleanImages = (images || []).filter((u): u is string => typeof u === "string" && u.trim().length > 0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isZoomed, setIsZoomed] = useState(false);
  const [hasError, setHasError] = useState<Record<number, boolean>>({});

  // Reset index when image list changes (e.g. when changing variant color)
  useEffect(() => {
    setCurrentIndex(0);
  }, [cleanImages[0]]);

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
        // Swipe left -> Next
        handleNext();
      } else {
        // Swipe right -> Prev
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
      <div className={`relative ${className} rounded-2xl bg-slate-100 flex flex-col items-center justify-center border border-slate-200 text-slate-400 p-4`}>
        <ImageIcon className="w-8 h-8 opacity-40 mb-1" />
        <span className="text-[10px] font-bold uppercase tracking-wider opacity-60">Foto Belum Tersedia</span>
      </div>
    );
  }

  const currentSrc = cleanImages[currentIndex] || cleanImages[0];
  const isMulti = cleanImages.length > 1;

  return (
    <>
      <div
        className={`relative ${className} rounded-2xl overflow-hidden bg-slate-100 shadow-md border border-slate-200/90 select-none group touch-pan-y`}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* Gambar Utama dengan Animasi Geser Halus */}
        <div className="w-full h-full relative overflow-hidden bg-slate-100">
          {cleanImages.map((src, idx) => (
            <div
              key={src + idx}
              className={`absolute inset-0 transition-opacity duration-300 ease-out ${
                idx === currentIndex ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"
              }`}
            >
              {hasError[idx] ? (
                <div className="w-full h-full flex flex-col items-center justify-center bg-slate-100 text-slate-400 p-2">
                  <ImageIcon className="w-8 h-8 opacity-40 mb-1" />
                  <span className="text-[10px] font-bold">Gagal memuat</span>
                </div>
              ) : (
                <img
                  src={src}
                  alt={`${alt} - Foto ${idx + 1}`}
                  loading={idx === 0 ? "eager" : "lazy"}
                  referrerPolicy="no-referrer"
                  draggable={false}
                  onError={() => setHasError((prev) => ({ ...prev, [idx]: true }))}
                  className="w-full h-full object-cover object-top transition-transform duration-300 group-hover:scale-105 cursor-pointer"
                  onClick={() => allowZoom && setIsZoomed(true)}
                />
              )}
            </div>
          ))}
        </div>

        {/* Badge Counter Gambar (misal: 1 / 5) */}
        {isMulti && (
          <div className="absolute top-2.5 right-2.5 z-20 bg-slate-950/70 backdrop-blur-md text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-sm tracking-wider">
            {currentIndex + 1} / {cleanImages.length}
          </div>
        )}

        {/* Tombol Zoom Icon */}
        {allowZoom && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsZoomed(true);
            }}
            className="absolute top-2.5 left-2.5 z-20 w-6 h-6 rounded-full bg-slate-950/50 backdrop-blur-md text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-slate-950/80"
            title="Perbesar Foto"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Tombol Navigasi Kiri / Kanan */}
        {isMulti && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handlePrev();
              }}
              className="absolute left-1.5 top-1/2 -translate-y-1/2 z-20 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-950/40 hover:bg-slate-950/80 backdrop-blur-md text-white flex items-center justify-center shadow-md transition-all active:scale-95"
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
              className="absolute right-1.5 top-1/2 -translate-y-1/2 z-20 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-950/40 hover:bg-slate-950/80 backdrop-blur-md text-white flex items-center justify-center shadow-md transition-all active:scale-95"
              aria-label="Foto Selanjutnya"
            >
              <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>

            {/* Indikator Titik (Dots) di Bagian Bawah */}
            <div className="absolute bottom-2 inset-x-0 z-20 flex justify-center items-center gap-1.5 px-3">
              {cleanImages.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrentIndex(idx);
                  }}
                  className={`transition-all duration-300 rounded-full ${
                    idx === currentIndex
                      ? "w-4 h-1.5 bg-white shadow-md"
                      : "w-1.5 h-1.5 bg-white/50 hover:bg-white/80"
                  }`}
                  aria-label={`Ke foto ${idx + 1}`}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Modal Lightbox Zoom with centered portal, pinch-to-zoom & mouse wheel */}
      <ImageLightboxModal 
        isOpen={isZoomed}
        onClose={() => setIsZoomed(false)}
        images={cleanImages}
        initialIndex={currentIndex}
        title={alt}
      />
    </>
  );
}
