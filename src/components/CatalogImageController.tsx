"use client";

import { useEffect, useRef, useState, ReactNode } from "react";
import {
  buildRetryImageUrl,
  isJunkRetailImageDimensions,
  markRuntimeJunkImageUrl,
  reportJunkImageToServer,
  sanitizeRetailImageUrl,
} from "@/lib/imageController";

interface CatalogImageControllerProps {
  imageUrl?: string | null;
  alt: string;
  sku?: string | null;
  article?: string | null;
  priority?: boolean;
  className?: string;
  onHealRequested?: () => void;
  fallback: ReactNode;
}

const MAX_RETRY_ATTEMPTS = 2;
const RETRY_DELAYS_MS = [450, 1400];

/**
 * CatalogImageController
 * ============================================================================
 * Pengontrol tampilan gambar kartu katalog:
 * 1. Menolak instan logo Matahari abu-abu & URL sampah sebelum dirender.
 * 2. Anti kartu putih polos:
 *    - Tidak pernah mengunci `opacity: 0` secara permanen saat error transient.
 *    - Otomatis memeriksa `imgRef.current.complete` (cache hit langsung tampil).
 *    - Auto-retry bertahap 2× (450ms & 1400ms) dengan cache-buster jika CDN kedip.
 *    - Menampilkan shimmer halus selama loading & fallback elegan jika benar-benar 404.
 * 3. Deteksi runtime `281×363 px` (logo Matahari abu-abu yang menyamar nama produk):
 *    langsung disingkirkan ke fallback & dilaporkan ke server untuk dihapus dari Turso!
 * ============================================================================
 */
export default function CatalogImageController({
  imageUrl,
  alt,
  sku,
  article,
  priority = false,
  className = "w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300",
  onHealRequested,
  fallback,
}: CatalogImageControllerProps) {
  const cleanBaseUrl = sanitizeRetailImageUrl(imageUrl);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<"loading" | "loaded" | "failed">(
    cleanBaseUrl ? "loading" : "failed"
  );
  const imgRef = useRef<HTMLImageElement | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const healTriggeredRef = useRef<string>("");

  // Reset state bersih setiap kali URL foto berubah (mis. setelah auto-heal atau ganti halaman)
  useEffect(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (!cleanBaseUrl) {
      setStatus("failed");
      setAttempt(0);
      return;
    }
    setAttempt(0);
    setStatus("loading");
  }, [cleanBaseUrl]);

  // Tangani gambar yang sudah selesai di-cache browser sebelum React sempat pasang onLoad
  useEffect(() => {
    const img = imgRef.current;
    if (!img || !cleanBaseUrl || status !== "loading") return;
    if (img.complete) {
      if (img.naturalWidth > 0) {
        if (isJunkRetailImageDimensions(img.naturalWidth, img.naturalHeight)) {
          markRuntimeJunkImageUrl(cleanBaseUrl);
          reportJunkImageToServer({
            imageUrl: cleanBaseUrl,
            sku,
            article,
            width: img.naturalWidth,
            height: img.naturalHeight,
          });
          setStatus("failed");
        } else {
          setStatus("loaded");
        }
      }
    }
  }, [cleanBaseUrl, attempt, status, sku, article]);

  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  if (!cleanBaseUrl || status === "failed") {
    return <>{fallback}</>;
  }

  const activeSrc = buildRetryImageUrl(cleanBaseUrl, attempt);

  return (
    <div className="relative w-full h-full bg-slate-50 overflow-hidden">
      {/* Shimmer halus saat gambar masih diunduh — mencegah kesan kotak putih kosong */}
      {status === "loading" && (
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-br from-slate-100 via-slate-50 to-slate-100 animate-pulse"
        />
      )}
      <img
        ref={imgRef}
        key={`${cleanBaseUrl}::${attempt}`}
        src={activeSrc}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        referrerPolicy="no-referrer"
        onLoad={(e) => {
          const el = e.currentTarget;
          if (isJunkRetailImageDimensions(el.naturalWidth, el.naturalHeight)) {
            markRuntimeJunkImageUrl(cleanBaseUrl);
            reportJunkImageToServer({
              imageUrl: cleanBaseUrl,
              sku,
              article,
              width: el.naturalWidth,
              height: el.naturalHeight,
            });
            setStatus("failed");
            return;
          }
          setStatus("loaded");
        }}
        onError={() => {
          if (attempt < MAX_RETRY_ATTEMPTS) {
            const delay = RETRY_DELAYS_MS[attempt] ?? 1200;
            if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
            retryTimerRef.current = setTimeout(() => {
              setAttempt((prev) => prev + 1);
            }, delay);
            return;
          }
          // Gagal setelah 2× retry: tampilkan fallback elegan + minta auto-heal senyap 1×
          setStatus("failed");
          if (onHealRequested && healTriggeredRef.current !== cleanBaseUrl) {
            healTriggeredRef.current = cleanBaseUrl;
            onHealRequested();
          }
        }}
        className={`${className} transition-opacity duration-200 ${
          status === "loaded" ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}
