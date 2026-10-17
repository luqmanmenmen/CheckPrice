"use client";

import { useState, useRef, useEffect, TouchEvent } from "react";
import { ChevronLeft, ChevronRight, Maximize2, X, Image as ImageIcon } from "lucide-react";

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

      {/* Modal Lightbox Zoom (Bisa Geser Fullscreen) */}
      {isZoomed && (
        <div
          className="fixed inset-0 z-[300] bg-black/95 backdrop-blur-xl flex flex-col items-center justify-between p-4 sm:p-6 animate-in fade-in duration-200 select-none"
          onClick={() => setIsZoomed(false)}
        >
          {/* Header Zoom Modal */}
          <div className="w-full max-w-2xl flex items-center justify-between text-white py-2 z-10" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Detail Foto Produk</span>
              <span className="text-sm font-black truncate max-w-[240px] sm:max-w-md">{alt}</span>
            </div>
            <div className="flex items-center gap-3">
              {isMulti && (
                <span className="text-xs font-bold bg-white/10 px-3 py-1 rounded-full">
                  {currentIndex + 1} / {cleanImages.length}
                </span>
              )}
              <button
                type="button"
                onClick={() => setIsZoomed(false)}
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
                aria-label="Tutup"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Area Foto Zoom Fullscreen */}
          <div
            className="flex-1 w-full max-w-2xl flex items-center justify-center relative overflow-hidden py-4"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          >
            <img
              src={currentSrc}
              alt={`${alt} Fullscreen`}
              referrerPolicy="no-referrer"
              className="max-w-full max-h-[75vh] object-contain rounded-2xl shadow-2xl transition-all duration-300"
            />

            {isMulti && (
              <>
                <button
                  type="button"
                  onClick={handlePrev}
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-md text-white flex items-center justify-center shadow-lg"
                  aria-label="Sebelumnya"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-md text-white flex items-center justify-center shadow-lg"
                  aria-label="Selanjutnya"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              </>
            )}
          </div>

          {/* Thumbnail Bar di Bagian Bawah Modal */}
          {isMulti && (
            <div
              className="w-full max-w-md flex items-center justify-center gap-2 overflow-x-auto py-2 px-4 z-10"
              onClick={(e) => e.stopPropagation()}
            >
              {cleanImages.map((src, idx) => (
                <button
                  key={src + idx}
                  type="button"
                  onClick={() => setCurrentIndex(idx)}
                  className={`relative w-12 h-16 rounded-lg overflow-hidden border-2 transition-all shrink-0 ${
                    idx === currentIndex
                      ? "border-amber-400 scale-105 shadow-md"
                      : "border-transparent opacity-60 hover:opacity-100"
                  }`}
                >
                  <img
                    src={src}
                    alt={`Thumb ${idx + 1}`}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover object-top"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
