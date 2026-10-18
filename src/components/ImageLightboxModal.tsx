"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, ZoomIn, ZoomOut, RotateCcw, Maximize2, ChevronLeft, ChevronRight } from "lucide-react";

interface ImageLightboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl?: string;
  images?: string[] | null;
  title: string;
  sku?: string;
  initialIndex?: number;
}

export default function ImageLightboxModal({
  isOpen,
  onClose,
  imageUrl,
  images,
  title,
  sku,
  initialIndex = 0,
}: ImageLightboxModalProps) {
  const [mounted, setMounted] = useState(false);
  
  // Multi-image list
  const cleanImages = React.useMemo(() => {
    if (images && images.length > 0) {
      return images.filter((u): u is string => typeof u === "string" && u.trim().length > 0);
    }
    if (imageUrl && imageUrl.trim().length > 0) {
      return [imageUrl];
    }
    return [];
  }, [images, imageUrl]);

  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isPinching, setIsPinching] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const posStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const initialPinchDistRef = useRef<number | null>(null);
  const initialScaleRef = useRef(1);
  const lastTapRef = useRef<number>(0);
  const swipeStartXRef = useRef<number | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Sync index and reset zoom on open
  useEffect(() => {
    if (!isOpen) return;

    setCurrentIndex(initialIndex || 0);
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setIsDragging(false);
    setIsPinching(false);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (scale === 1 && cleanImages.length > 1) {
        if (e.key === "ArrowLeft") handlePrev();
        if (e.key === "ArrowRight") handleNext();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, initialIndex, cleanImages.length, scale, onClose]);

  const handleResetZoom = useCallback(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  const handlePrev = useCallback(() => {
    handleResetZoom();
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : cleanImages.length - 1));
  }, [cleanImages.length, handleResetZoom]);

  const handleNext = useCallback(() => {
    handleResetZoom();
    setCurrentIndex((prev) => (prev < cleanImages.length - 1 ? prev + 1 : 0));
  }, [cleanImages.length, handleResetZoom]);

  const handleZoomIn = useCallback(() => {
    setScale((prev) => Math.min(prev + 0.5, 5));
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale((prev) => {
      const next = Math.max(prev - 0.5, 1);
      if (next === 1) setPosition({ x: 0, y: 0 });
      return next;
    });
  }, []);

  // Mouse wheel zoom (PC)
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const delta = e.deltaY < 0 ? 0.35 : -0.35;
    setScale((prev) => {
      const next = Math.min(Math.max(prev + delta, 1), 5);
      if (next === 1) setPosition({ x: 0, y: 0 });
      return next;
    });
  };

  // Double tap / double click to toggle zoom
  const handleToggleZoom = () => {
    if (scale > 1.2) {
      handleResetZoom();
    } else {
      setScale(2.5);
    }
  };

  // Touch handlers for mobile pinch-to-zoom, pan, & swipe navigation
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // 2 fingers: Pinch to zoom
      setIsPinching(true);
      setIsDragging(false);
      swipeStartXRef.current = null;
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      initialPinchDistRef.current = dist;
      initialScaleRef.current = scale;
    } else if (e.touches.length === 1) {
      // Check for double tap
      const now = Date.now();
      if (now - lastTapRef.current < 320) {
        handleToggleZoom();
        lastTapRef.current = 0;
        return;
      }
      lastTapRef.current = now;

      if (scale > 1) {
        // 1 finger: pan when zoomed in
        setIsDragging(true);
        dragStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        posStartRef.current = { ...position };
      } else {
        // Track start for horizontal swipe when not zoomed
        swipeStartXRef.current = e.touches[0].clientX;
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && initialPinchDistRef.current) {
      // Pinching
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const factor = dist / initialPinchDistRef.current;
      const newScale = Math.min(Math.max(initialScaleRef.current * factor, 1), 5);
      setScale(newScale);
      if (newScale === 1) setPosition({ x: 0, y: 0 });
    } else if (e.touches.length === 1 && isDragging && scale > 1) {
      // Panning
      const dx = e.touches[0].clientX - dragStartRef.current.x;
      const dy = e.touches[0].clientY - dragStartRef.current.y;
      setPosition({
        x: posStartRef.current.x + dx,
        y: posStartRef.current.y + dy,
      });
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2) {
      setIsPinching(false);
      initialPinchDistRef.current = null;
    }
    if (e.touches.length === 0) {
      setIsDragging(false);
      if (scale <= 1) {
        setPosition({ x: 0, y: 0 });
        // Handle horizontal swipe between images if not zoomed
        if (swipeStartXRef.current !== null && cleanImages.length > 1) {
          const endX = e.changedTouches[0]?.clientX;
          if (endX !== undefined) {
            const diff = swipeStartXRef.current - endX;
            if (Math.abs(diff) > 50) {
              if (diff > 0) handleNext();
              else handlePrev();
            }
          }
        }
      }
      swipeStartXRef.current = null;
    }
  };

  // Mouse handlers for PC pan
  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale > 1 && e.button === 0) {
      setIsDragging(true);
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      posStartRef.current = { ...position };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && scale > 1) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      setPosition({
        x: posStartRef.current.x + dx,
        y: posStartRef.current.y + dy,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  if (!mounted || !isOpen || cleanImages.length === 0) return null;

  const currentSrc = cleanImages[currentIndex] || cleanImages[0];
  const isMulti = cleanImages.length > 1;

  return createPortal(
    <div
      className="fixed inset-0 w-screen h-[100dvh] z-[99999] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 touch-none select-none animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg bg-slate-900 rounded-2xl shadow-2xl border border-slate-800 flex flex-col overflow-hidden max-h-[92dvh] animate-in zoom-in-95 duration-200 my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-3.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-white shrink-0 z-20">
          <div className="min-w-0 pr-3">
            <div className="flex items-center gap-2">
              {sku && (
                <span className="text-[10px] font-black uppercase tracking-wider text-blue-400 bg-blue-950/80 px-2 py-0.5 rounded border border-blue-800">
                  SKU {sku}
                </span>
              )}
              {isMulti && (
                <span className="text-[10px] font-bold text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                  {currentIndex + 1} / {cleanImages.length}
                </span>
              )}
            </div>
            <h3 className="text-sm font-bold truncate text-white mt-1 leading-tight">
              {title}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-colors shrink-0"
            title="Tutup (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Image Canvas with Touch / Wheel / Pan */}
        <div
          ref={containerRef}
          onWheel={handleWheel}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onDoubleClick={() => handleToggleZoom()}
          className={`relative flex-1 bg-black/60 overflow-hidden flex items-center justify-center min-h-[320px] max-h-[62dvh] p-2 ${
            scale > 1
              ? isDragging
                ? "cursor-grabbing"
                : "cursor-grab"
              : "cursor-zoom-in"
          }`}
        >
          <img
            src={currentSrc}
            alt={title}
            draggable={false}
            style={{
              transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${scale})`,
              transition: isDragging || isPinching ? "none" : "transform 0.18s cubic-bezier(0.2, 0, 0, 1)",
              transformOrigin: "center center",
            }}
            className="max-h-[60dvh] w-auto max-w-full object-contain rounded-lg shadow-md pointer-events-none select-none"
          />

          {/* Left / Right Navigation Buttons for Multi Images */}
          {isMulti && scale === 1 && (
            <>
              <button
                type="button"
                onClick={handlePrev}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-slate-900/70 hover:bg-slate-800 text-white flex items-center justify-center backdrop-blur-sm border border-white/10 shadow-lg active:scale-95 transition-all"
                title="Foto Sebelumnya"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={handleNext}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-slate-900/70 hover:bg-slate-800 text-white flex items-center justify-center backdrop-blur-sm border border-white/10 shadow-lg active:scale-95 transition-all"
                title="Foto Selanjutnya"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </>
          )}

          {/* Zoom Level Indicator */}
          <div className="absolute top-2.5 right-2.5 bg-black/70 backdrop-blur-md px-2.5 py-1 rounded-full text-[11px] font-mono font-bold text-white border border-white/10 pointer-events-none flex items-center gap-1">
            <Maximize2 className="w-3 h-3 text-blue-400" />
            {Math.round(scale * 100)}%
          </div>
        </div>

        {/* Multi-image Thumbnail Strip */}
        {isMulti && (
          <div className="bg-slate-900/90 border-t border-slate-800 px-3 py-2 flex items-center justify-center gap-2 overflow-x-auto shrink-0 z-20">
            {cleanImages.map((src, idx) => (
              <button
                key={src + idx}
                type="button"
                onClick={() => {
                  handleResetZoom();
                  setCurrentIndex(idx);
                }}
                className={`w-10 h-12 rounded-lg overflow-hidden border-2 transition-all shrink-0 ${
                  idx === currentIndex
                    ? "border-blue-500 scale-105 shadow-md ring-1 ring-blue-400"
                    : "border-slate-700 opacity-50 hover:opacity-100"
                }`}
              >
                <img src={src} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}

        {/* Footer / Control Toolbar */}
        <div className="p-3 bg-slate-900 border-t border-slate-800 flex flex-col gap-2 shrink-0 z-20">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 bg-slate-800/90 p-1 rounded-xl border border-slate-700">
              <button
                type="button"
                onClick={handleZoomOut}
                disabled={scale <= 1}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
                title="Perkecil (-)"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleResetZoom}
                disabled={scale === 1}
                className="px-2 py-1 text-xs font-bold rounded-lg text-slate-300 hover:text-white hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-transparent flex items-center gap-1 transition-colors"
                title="Reset Zoom (100%)"
              >
                <RotateCcw className="w-3 h-3" />
                Reset
              </button>
              <button
                type="button"
                onClick={handleZoomIn}
                disabled={scale >= 5}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
                title="Perbesar (+)"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={handleToggleZoom}
              className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 flex items-center gap-1.5"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              {scale > 1 ? "1x Normal" : "Mode Zoom 2.5x"}
            </button>
          </div>

          <p className="text-[11px] text-slate-400 text-center leading-relaxed">
            💡 Cubit 2 jari / scroll mouse untuk zoom • Geser untuk keliling • Ketuk 2x untuk toggle zoom
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}
