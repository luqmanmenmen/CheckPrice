"use client";

import { useEffect, useRef } from "react";
import { Html5Qrcode } from "html5-qrcode";

interface ScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onScanError?: (errorMessage: string) => void;
}

export default function Scanner({ onScanSuccess, onScanError }: ScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isHandlingResult = useRef(false);
  const blacklistedSkus = useRef<Set<string>>(new Set());

  useEffect(() => {
    scannerRef.current = new Html5Qrcode("reader");
    
    const config = {
      fps: 15,
      qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
        const width = Math.min(viewfinderWidth * 0.88, 320);
        const height = Math.min(viewfinderHeight * 0.6, 200);
        return { width: Math.max(width, 240), height: Math.max(height, 120) };
      },
    };

    scannerRef.current.start(
      { facingMode: "environment" },
      config,
      async (decodedText) => {
        const cleanText = decodedText.trim();
        if (!cleanText || isHandlingResult.current || blacklistedSkus.current.has(cleanText)) return;
        isHandlingResult.current = true;
        
        try {
          // 1. Cek database lokal IndexedDB
          const { db } = await import("@/lib/offlineDb");
          let exists = await db.products.where('sku').equals(cleanText).first();
          
          // 2. Fallback cek ke API server jika belum ada di database lokal
          if (!exists) {
            const res = await fetch(`/api/product/${encodeURIComponent(cleanText)}?page=1`);
            if (res.ok) {
              const data = await res.json();
              if (data && (data.data || (Array.isArray(data) && data.length > 0))) {
                exists = data.data || data[0];
              }
            }
          }

          if (!exists) {
            blacklistedSkus.current.add(cleanText);
            // Hapus blacklist setelah 2 detik agar tidak terkunci permanen
            setTimeout(() => blacklistedSkus.current.delete(cleanText), 2000);
            isHandlingResult.current = false;
            return;
          }
        } catch {
          // Lanjutkan jika offline/kesalahan jaringan
        }

        onScanSuccess(cleanText);
      },
      (errorMessage) => {
        if (onScanError) onScanError(errorMessage);
      }
    ).catch(err => {
      console.error("Error starting scanner", err);
    });

    return () => {
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop().catch(console.error);
      }
    };
  }, [onScanSuccess, onScanError]);

  return (
    <div className="w-full max-w-sm mx-auto overflow-hidden rounded-xl shadow-inner border bg-black">
      <div id="reader" className="w-full h-full min-h-[300px]"></div>
    </div>
  );
}
