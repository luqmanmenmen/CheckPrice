/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { 
  Loader2, 
  Flashlight, 
  FlashlightOff, 
  CheckCircle2, 
  Barcode, 
  FlipHorizontal, 
  Camera, 
  Volume2,
  VolumeX,
  AlertCircle
} from "lucide-react";

export interface DetectedSku {
  text: string;
  bbox?: { x0: number; y0: number; x1: number; y1: number };
  rawText?: string;
}

interface TextScannerProps {
  onScanResult: (result: string, detected?: DetectedSku, snapshot?: string) => void;
}

// FORMAT BARCODE RETAIL 1D & 2D YANG DIDUKUNG
const SUPPORTED_FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.QR_CODE,
];

export default function TextScanner({ onScanResult }: TextScannerProps) {
  const scannerContainerId = "retail-barcode-scanner-view";
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isHandlingResult = useRef(false);
  const isStartingRef = useRef(false);

  const [status, setStatus] = useState("Menghubungkan ke Kamera...");
  const [isReady, setIsReady] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [foundCode, setFoundCode] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Default prioritaskan kamera belakang (environment)
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");

  // Audio feedback nada beep kasir (1.8 kHz, 100ms)
  const playBeep = useCallback(() => {
    if (!soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(1800, ctx.currentTime);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch {
      // AudioContext diblokir oleh browser sebelum user interaction
    }
  }, [soundEnabled]);

  // Haptic feedback getar ponsel
  const triggerHaptic = useCallback(() => {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      try {
        navigator.vibrate(60);
      } catch {}
    }
  }, []);

  // Handler sukses saat barcode terbaca
  const handleBarcodeDetected = useCallback((decodedText: string) => {
    if (isHandlingResult.current) return;
    const cleanCode = decodedText.trim();
    if (!cleanCode) return;

    isHandlingResult.current = true;
    setFoundCode(cleanCode);
    setStatus(`Barcode Terbaca: ${cleanCode}`);

    playBeep();
    triggerHaptic();

    // Hentikan scanner segera agar tidak membebani baterai & CPU HP kasir
    if (scannerRef.current && scannerRef.current.isScanning) {
      scannerRef.current.stop().catch(() => {});
    }

    // Teruskan barcode ke halaman pemanggil (page.tsx atau cek-harga/page.tsx)
    setTimeout(() => {
      onScanResult(
        cleanCode,
        { text: cleanCode, rawText: cleanCode },
        undefined
      );
    }, 250);
  }, [onScanResult, playBeep, triggerHaptic]);

  // Inisialisasi & Start Kamera Pemindai (Anti-Race Condition & Anti-Black Screen)
  useEffect(() => {
    let isCancelled = false;
    isHandlingResult.current = false;
    setErrorMessage(null);
    setFoundCode(null);
    setIsReady(false);
    setStatus(facingMode === "environment" ? "Membuka Kamera Belakang..." : "Membuka Kamera Depan...");

    const startCamera = async () => {
      if (isStartingRef.current) return;
      isStartingRef.current = true;

      // Hentikan scanner sebelumnya jika masih aktif
      if (scannerRef.current) {
        try {
          if (scannerRef.current.isScanning) {
            await scannerRef.current.stop();
          }
          await scannerRef.current.clear();
        } catch (e) {
          console.warn("Cleanup scanner error:", e);
        }
      }

      if (isCancelled) {
        isStartingRef.current = false;
        return;
      }

      // Buat instance baru
      const html5Qr = new Html5Qrcode(scannerContainerId, {
        formatsToSupport: SUPPORTED_FORMATS,
        verbose: false,
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true, // Native C++ BarcodeDetector pada Android Chrome (5ms!)
        },
      });

      scannerRef.current = html5Qr;

      // Konfigurasi area bidik horizontal proporsional untuk barcode pakaian ritel
      const qrboxConfig = (viewfinderWidth: number, viewfinderHeight: number) => {
        const width = Math.floor(Math.min(viewfinderWidth * 0.88, 380));
        const height = Math.floor(Math.min(viewfinderHeight * 0.40, 170));
        return { width, height };
      };

      // Konfigurasi pemindai: HAPUS aspectRatio 1.0 agar tidak black screen di kamera belakang HP Android
      const config = {
        fps: 15,
        qrbox: qrboxConfig,
        disableFlip: false,
      };

      try {
        // Coba start dengan facingMode yang dipilih
        await html5Qr.start(
          { facingMode: facingMode },
          config,
          (decodedText) => {
            handleBarcodeDetected(decodedText);
          },
          () => {
            // Callback frame scanning normal saat belum ada barcode di kamera
          }
        );

        if (isCancelled) {
          html5Qr.stop().catch(() => {});
          isStartingRef.current = false;
          return;
        }

        setIsReady(true);
        setStatus("Arahkan Garis Barcode ke Dalam Kotak");

        // Cek dukungan senter (flashlight / torch)
        try {
          const capabilities = html5Qr.getRunningTrackCameraCapabilities();
          if (capabilities && typeof (capabilities as any).torchFeature === "function") {
            const torchFeature = (capabilities as any).torchFeature();
            setHasTorch(torchFeature.isSupported());
          }
        } catch {
          setHasTorch(false);
        }
      } catch (err: any) {
        if (isCancelled) return;
        console.warn(`Gagal start kamera dengan facingMode ${facingMode}:`, err);

        // Fallback: jika exact/facingMode gagal, ambil camera ID pertama yang tersedia
        try {
          const cameras = await Html5Qrcode.getCameras();
          if (cameras && cameras.length > 0) {
            // Jika ingin kamera belakang, pilih yang bukan front/depan
            let targetCam = cameras[0];
            if (facingMode === "environment") {
              const backCam = cameras.find((c) =>
                c.label.toLowerCase().includes("back") ||
                c.label.toLowerCase().includes("belakang") ||
                c.label.toLowerCase().includes("rear") ||
                c.label.toLowerCase().includes("environment")
              );
              if (backCam) targetCam = backCam;
              else if (cameras.length > 1) targetCam = cameras[cameras.length - 1]; // Kamera terakhir biasanya kamera belakang di Android
            }

            await html5Qr.start(
              targetCam.id,
              config,
              (decodedText) => handleBarcodeDetected(decodedText),
              () => {}
            );

            if (!isCancelled) {
              setIsReady(true);
              setStatus("Arahkan Garis Barcode ke Dalam Kotak");
            }
          } else {
            throw new Error("Tidak ada perangkat kamera yang terdeteksi");
          }
        } catch (fallbackErr: any) {
          if (!isCancelled) {
            console.error("Gagal semua upaya start kamera:", fallbackErr);
            setErrorMessage("Kamera tidak dapat diakses. Pastikan izin kamera aktif di browser.");
            setStatus("Izin Kamera Ditolak / Kamera Sibuk");
          }
        }
      } finally {
        isStartingRef.current = false;
      }
    };

    startCamera();

    return () => {
      isCancelled = true;
      if (scannerRef.current) {
        try {
          if (scannerRef.current.isScanning) {
            scannerRef.current.stop().catch(() => {});
          }
        } catch {}
      }
    };
  }, [facingMode, handleBarcodeDetected]);

  // Toggle Senter (Flashlight / Torch)
  const toggleTorch = async () => {
    if (!scannerRef.current || !hasTorch) return;
    try {
      const nextState = !torchOn;
      await scannerRef.current.applyVideoConstraints({
        advanced: [{ torch: nextState } as any],
      });
      setTorchOn(nextState);
    } catch (err) {
      console.warn("Gagal mengatur lampu senter:", err);
    }
  };

  // Toggle Switch Kamera (Belakang <-> Depan)
  const switchCamera = () => {
    setTorchOn(false);
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
  };

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center bg-black overflow-hidden select-none">
      {/* Container Video HTML5 QR Code */}
      <div 
        id={scannerContainerId} 
        className="w-full h-full flex items-center justify-center relative overflow-hidden"
        style={{ minHeight: "320px", maxHeight: "100%" }}
      />

      {/* OVERLAY VIEWFINDER KASIR MODERN */}
      <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-4 z-10">
        {/* Kotak Bidik Barcode (Horizontal Rectangular Viewfinder) */}
        <div className="relative w-[88%] max-w-[360px] h-36 sm:h-40 border-2 border-emerald-400/80 rounded-2xl shadow-[0_0_30px_rgba(16,185,129,0.3)] flex items-center justify-center overflow-hidden backdrop-brightness-105">
          {/* Garis Laser Horizontal Bergerak Naik-Turun */}
          <div className="absolute w-full h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_12px_#34d399] animate-laser" />

          {/* Siku Sudut Kotak Bidik (Corner Accents) */}
          <div className="absolute top-0 left-0 w-5 h-5 border-t-4 border-l-4 border-emerald-400 rounded-tl-xl" />
          <div className="absolute top-0 right-0 w-5 h-5 border-t-4 border-r-4 border-emerald-400 rounded-tr-xl" />
          <div className="absolute bottom-0 left-0 w-5 h-5 border-b-4 border-l-4 border-emerald-400 rounded-bl-xl" />
          <div className="absolute bottom-0 right-0 w-5 h-5 border-b-4 border-r-4 border-emerald-400 rounded-br-xl" />

          {/* Ikon Barcode Halus di Background Bidik */}
          <Barcode className="w-16 h-16 text-emerald-400/20" />

          {/* Animasi Berhasil Terbaca */}
          {foundCode && (
            <div className="absolute inset-0 bg-emerald-600/90 flex flex-col items-center justify-center text-white animate-in zoom-in-95 duration-200 z-20">
              <CheckCircle2 className="w-10 h-10 text-white mb-1 animate-bounce" />
              <span className="text-xs font-semibold tracking-wider uppercase text-emerald-100">Barcode Ditemukan</span>
              <span className="text-base font-black font-mono tracking-widest">{foundCode}</span>
            </div>
          )}
        </div>

        {/* Petunjuk Arah Garis Barcode */}
        <div className="mt-4 px-3.5 py-1.5 bg-black/70 backdrop-blur-md rounded-full border border-white/10 text-center shadow-lg">
          <p className="text-xs font-medium text-emerald-300 flex items-center gap-1.5">
            <Barcode className="w-3.5 h-3.5 animate-pulse" />
            <span>Posisikan garis barcode di dalam kotak</span>
          </p>
        </div>
      </div>

      {/* HEADER TOP CONTROLS */}
      <div className="absolute top-3 left-3 right-3 flex items-center justify-between z-30 pointer-events-auto">
        {/* Badge Status & Engine Mode */}
        <div className="flex items-center gap-2 bg-black/70 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/15 text-white">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          <span className="text-[11px] font-bold tracking-wide uppercase text-slate-200">
            {facingMode === "environment" ? "Kamera Belakang (1D)" : "Kamera Depan (1D)"}
          </span>
        </div>

        {/* Action Controls: Sound & Torch & Switch Camera */}
        <div className="flex items-center gap-2">
          {/* Suara Beep */}
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-2 rounded-full bg-black/60 backdrop-blur-md border border-white/15 text-white hover:bg-white/20 transition active:scale-95"
            title={soundEnabled ? "Matikan Suara Beep" : "Nyalakan Suara Beep"}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
          </button>

          {/* Lampu Senter / Flashlight (Hanya ada di kamera belakang) */}
          {hasTorch && facingMode === "environment" && (
            <button
              onClick={toggleTorch}
              className={`p-2 rounded-full backdrop-blur-md border transition active:scale-95 ${
                torchOn 
                  ? "bg-amber-400 text-slate-950 border-amber-300 shadow-[0_0_15px_rgba(251,191,36,0.5)]" 
                  : "bg-black/60 border-white/15 text-white hover:bg-white/20"
              }`}
              title={torchOn ? "Matikan Senter" : "Nyalakan Senter"}
            >
              {torchOn ? <FlashlightOff className="w-4 h-4" /> : <Flashlight className="w-4 h-4" />}
            </button>
          )}

          {/* Switch Kamera Belakang <-> Depan */}
          <button
            onClick={switchCamera}
            className="p-2 rounded-full bg-black/60 backdrop-blur-md border border-white/15 text-white hover:bg-white/20 transition active:scale-95 flex items-center gap-1"
            title="Ganti Kamera Belakang / Depan"
          >
            <FlipHorizontal className="w-4 h-4 text-slate-200" />
          </button>
        </div>
      </div>

      {/* FOOTER BOTTOM STATUS */}
      <div className="absolute bottom-4 left-4 right-4 flex flex-col items-center justify-center z-30 pointer-events-auto">
        <div className="w-full max-w-sm bg-slate-900/95 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-slate-700/80 shadow-2xl flex items-center justify-between">
          <div className="flex items-center gap-2.5 overflow-hidden">
            {!isReady && !errorMessage ? (
              <Loader2 className="w-4 h-4 text-emerald-400 animate-spin shrink-0" />
            ) : errorMessage ? (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            ) : (
              <Camera className="w-4 h-4 text-emerald-400 shrink-0" />
            )}
            <span className="text-xs font-medium text-slate-200 truncate">
              {errorMessage || status}
            </span>
          </div>

          <div className="shrink-0 flex items-center gap-1.5 ml-2">
            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/80 border border-emerald-800/80 px-2 py-0.5 rounded-full font-bold">
              EAN-13
            </span>
          </div>
        </div>
      </div>

      {/* CSS untuk memastikan elemen video kamera memenuhi layar dan tidak blank */}
      <style jsx global>{`
        #retail-barcode-scanner-view {
          width: 100% !important;
          height: 100% !important;
          background: #000 !important;
        }
        #retail-barcode-scanner-view video {
          width: 100% !important;
          height: 100% !important;
          object-fit: cover !important;
          background: #000 !important;
        }
        @keyframes laserMove {
          0% {
            top: 5%;
            opacity: 0.2;
          }
          50% {
            opacity: 1;
          }
          100% {
            top: 95%;
            opacity: 0.2;
          }
        }
        .animate-laser {
          animation: laserMove 2s ease-in-out infinite alternate;
        }
      `}</style>
    </div>
  );
}
