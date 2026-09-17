"use client";

import { useEffect, useRef } from "react";
import { Html5Qrcode } from "html5-qrcode";

interface ScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onScanError?: (errorMessage: string) => void;
}

export default function Scanner({ onScanSuccess, onScanError }: ScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    scannerRef.current = new Html5Qrcode("reader");
    
    const config = { fps: 10, qrbox: { width: 250, height: 250 } };

    scannerRef.current.start(
      { facingMode: "environment" },
      config,
      (decodedText) => {
        onScanSuccess(decodedText);
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
