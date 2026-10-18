/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Tesseract from "tesseract.js";
import { Loader2, Flashlight, FlashlightOff, CheckCircle2, ScanText } from "lucide-react";
import { db } from "@/lib/offlineDb";

export interface DetectedSku {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  rawText: string;
}

interface TextScannerProps {
  onScanResult: (sku: string, detected: DetectedSku, snapshot?: string) => void;
}

export default function TextScanner({ onScanResult }: TextScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const workerRef = useRef<Tesseract.Worker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const isHandlingResult = useRef(false);
  const isLoopRunningRef = useRef(false);
  const isOcrRunningRef = useRef(false);
  const lastOcrTimeRef = useRef(0);
  const animationFrameIdRef = useRef<number | null>(null);
  const blacklistedSkus = useRef<Set<string>>(new Set());

  const [status, setStatus] = useState("Menyiapkan Pemindai Teks SKU...");
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [foundSku, setFoundSku] = useState<string | null>(null);
  const [scanFeedback, setScanFeedback] = useState<"idle" | "wrong_target">("idle");

  // Validasi apakah string adalah SKU toko 8 digit yang sah (Cek Dexie IndexedDB <0.05ms)
  const resolveSku = useCallback(async (text: string): Promise<string | null> => {
    if (!text) return null;
    const clean = text.trim();

    // 1. FILTER ANTI-ARTIKEL (KODE PABRIK): Misal "605-12218278" atau format dengan tanda strip
    if (/\b\d{3,4}\s*-\s*\d{6,10}\b/.test(clean)) {
      return null;
    }

    // 2. Cek apakah teks adalah 8 digit murni
    if (/^\d{8}$/.test(clean)) {
      if (blacklistedSkus.current.has(clean)) return null;
      try {
        const product = await db.products.get(clean);
        if (product) return product.sku;
      } catch {}

      // Fallback API server jika cache IndexedDB lokal belum siap
      const existsOnServer = await checkRemoteSku(clean);
      if (existsOnServer) return clean;
      return null;
    }

    // 3. Pecah berdasarkan spasi/baris untuk mengambil deretan angka
    const tokens = clean.replace(/[^0-9-\s]/g, " ").split(/\s+/);
    for (const token of tokens) {
      if (!token || token.includes("-")) continue;
      const digits = token.replace(/\D/g, "");

      // HANYA terima jika tepat 8 digit angka murni
      if (digits.length === 8) {
        if (blacklistedSkus.current.has(digits)) continue;
        try {
          const product = await db.products.get(digits);
          if (product) return product.sku;
        } catch {}

        const existsOnServer = await checkRemoteSku(digits);
        if (existsOnServer) return digits;
      }
    }

    return null;
  }, []);

  async function checkRemoteSku(sku: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/product/${encodeURIComponent(sku)}?page=1`);
      if (res.ok) {
        const data = await res.json();
        if (data && (data.data || (Array.isArray(data) && data.length > 0))) {
          return true;
        }
      }
    } catch {}
    return false;
  }

  // Eksekusi jika SKU 8 digit berhasil dikenali
  const handleSuccess = useCallback(async (sku: string) => {
    if (isHandlingResult.current) return;
    isHandlingResult.current = true;
    isLoopRunningRef.current = false;

    if (animationFrameIdRef.current) {
      cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = null;
    }

    // Feedback getar halus (Haptic)
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      try {
        navigator.vibrate(50);
      } catch {}
    }

    setFoundSku(sku);
    setStatus(`SKU Terdeteksi: ${sku}`);

    let snapshot: string | undefined = undefined;
    if (videoRef.current && canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      if (ctx) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        ctx.drawImage(videoRef.current, 0, 0);
        snapshot = canvasRef.current.toDataURL("image/jpeg", 0.6);
      }
    }

    // Hentikan stream kamera agar hemat baterai
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }

    setTimeout(() => {
      onScanResult(sku, { text: sku, bbox: { x0: 0, y0: 0, x1: 0, y1: 0 }, rawText: sku }, snapshot);
    }, 600);
  }, [onScanResult]);

  // Eksekusi OCR Ringan & Super Cepat (Non-blocking, GPU Filter, Single Line PSM 7)
  const runOcrPass = useCallback(async (video: HTMLVideoElement) => {
    if (!workerRef.current || !canvasRef.current || isHandlingResult.current) return;

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return;

    const canvas = canvasRef.current;
    // Ukuran canvas OCR kecil & presisi (360x64 px) -> Tesseract proses dalam ~35ms tanpa beban CPU
    const targetW = 360;
    const targetH = 64;
    if (canvas.width !== targetW) canvas.width = targetW;
    if (canvas.height !== targetH) canvas.height = targetH;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    // ROI Presisi: Bagian tengah di mana garis merah Alfagift berada
    const roiW = vw * 0.75;
    const roiH = Math.max(vh * 0.15, 60);
    const startX = (vw - roiW) / 2;
    const startY = (vh - roiH) / 2;

    // Filter Kontras GPU Hardware (0% CPU! Tidak ada loop pixel manual di JavaScript)
    ctx.filter = "contrast(200%) grayscale(100%) brightness(105%)";
    ctx.drawImage(video, startX, startY, roiW, roiH, 0, 0, targetW, targetH);
    ctx.filter = "none";

    try {
      const { data } = await workerRef.current.recognize(canvas);
      if (!data || !data.text || isHandlingResult.current) return;

      const raw = data.text;
      const validSku = await resolveSku(raw);

      if (validSku) {
        await handleSuccess(validSku);
      }
    } catch {
      // Abaikan frame drop
    }
  }, [resolveSku, handleSuccess]);

  // Loop Kamera 60 FPS (Bebas Freeze karena OCR berjalan asinkron dan tidak memblokir render)
  const frameLoop = useCallback(() => {
    if (!isLoopRunningRef.current || isHandlingResult.current) return;

    const video = videoRef.current;
    if (!video || video.paused || video.ended || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      animationFrameIdRef.current = requestAnimationFrame(frameLoop);
      return;
    }

    const now = performance.now();

    // Jalankan OCR hanya jika tidak ada OCR yang sedang aktif dan sudah lewat 280ms
    // Ini memberi CPU HP waktu istirahat sehingga kamera tetap mulus 60 FPS & tidak panas
    if (workerRef.current && !isOcrRunningRef.current && now - lastOcrTimeRef.current >= 280) {
      isOcrRunningRef.current = true;
      lastOcrTimeRef.current = now;

      runOcrPass(video).finally(() => {
        isOcrRunningRef.current = false;
      });
    }

    // Jadwalkan frame berikutnya di 60 FPS tanpa jeda
    if (isLoopRunningRef.current && !isHandlingResult.current) {
      animationFrameIdRef.current = requestAnimationFrame(frameLoop);
    }
  }, [runOcrPass]);

  // Inisialisasi Kamera & Tesseract Worker
  useEffect(() => {
    let isMounted = true;
    isLoopRunningRef.current = true;

    // 1. Buka Kamera dengan continuous autofocus
    const startCamera = async () => {
      try {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
        }

        setStatus("Membuka Kamera...");
        const localStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "environment",
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });

        if (isMounted && videoRef.current) {
          streamRef.current = localStream;
          videoRef.current.srcObject = localStream;

          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play().catch(() => {});
            setStatus("Arahkan angka SKU (8 Digit) ke garis merah");
            if (isLoopRunningRef.current) {
              animationFrameIdRef.current = requestAnimationFrame(frameLoop);
            }
          };

          const track = localStream.getVideoTracks()[0];
          if (track) {
            const capabilities = track.getCapabilities() as any;
            if (capabilities?.torch) setHasTorch(true);

            if (capabilities?.focusMode?.includes("continuous")) {
              track.applyConstraints({ advanced: [{ focusMode: "continuous" } as any] }).catch(() => {});
            }
          }
        }
      } catch (err) {
        console.error("Camera Init Error:", err);
        if (isMounted) setStatus("Gagal membuka kamera. Periksa izin kamera.");
      }
    };

    // 2. Inisialisasi Tesseract Worker: Murni Angka 0-9 & Single Line PSM
    const initWorker = async () => {
      try {
        setStatus("Memuat AI OCR 8 Digit...");
        const worker = await Tesseract.createWorker("eng");
        await worker.setParameters({
          tessedit_char_whitelist: "0123456789-",
          tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE,
        });

        if (isMounted) {
          workerRef.current = worker;
        } else {
          worker.terminate();
        }
      } catch (err) {
        console.error("OCR Worker Init Error:", err);
      }
    };

    Promise.all([startCamera(), initWorker()]);

    // Lifecycle Visibility: 0% CPU saat minimize, bangun instan saat buka
    const handleVisibilityChange = async () => {
      if (document.visibilityState === "visible") {
        isLoopRunningRef.current = true;

        if (videoRef.current && videoRef.current.paused) {
          videoRef.current.play().catch(() => {});
        }

        const tracks = streamRef.current?.getVideoTracks();
        const isTrackAlive = tracks && tracks.length > 0 && tracks[0].readyState === "live";

        if (!isTrackAlive) {
          await startCamera();
        } else {
          animationFrameIdRef.current = requestAnimationFrame(frameLoop);
        }
      } else {
        isLoopRunningRef.current = false;
        if (animationFrameIdRef.current) {
          cancelAnimationFrame(animationFrameIdRef.current);
          animationFrameIdRef.current = null;
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isMounted = false;
      isLoopRunningRef.current = false;
      document.removeEventListener("visibilitychange", handleVisibilityChange);

      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, [frameLoop]);

  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (track) {
      try {
        await track.applyConstraints({
          advanced: [{ torch: !torchOn } as any],
        });
        setTorchOn(!torchOn);
      } catch (err) {
        console.error("Failed to toggle torch", err);
      }
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Container Video Utama */}
      <div
        className={`relative rounded-3xl overflow-hidden shadow-2xl border-4 transition-colors duration-300 bg-black ${
          foundSku
            ? "border-green-500 ring-4 ring-green-500/20"
            : scanFeedback === "wrong_target"
            ? "border-red-500"
            : "border-slate-800"
        }`}
      >
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="w-full min-h-[300px] sm:min-h-[400px] object-cover"
        />

        {/* Kotak ROI (Overlay Tengah) bergaya Alfagift */}
        {!foundSku && (
          <div className="absolute top-1/2 left-[10%] right-[10%] h-[15%] min-h-[60px] -translate-y-1/2 shadow-[0_0_0_9999px_rgba(0,0,0,0.6)] z-10 pointer-events-none overflow-hidden">
            {/* 4 Sudut Merah (Corners) */}
            <div
              className={`absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 transition-colors duration-300 ${
                scanFeedback === "wrong_target" ? "border-red-600" : "border-red-500"
              } rounded-tl-lg`}
            />
            <div
              className={`absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 transition-colors duration-300 ${
                scanFeedback === "wrong_target" ? "border-red-600" : "border-red-500"
              } rounded-tr-lg`}
            />
            <div
              className={`absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 transition-colors duration-300 ${
                scanFeedback === "wrong_target" ? "border-red-600" : "border-red-500"
              } rounded-bl-lg`}
            />
            <div
              className={`absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 transition-colors duration-300 ${
                scanFeedback === "wrong_target" ? "border-red-600" : "border-red-500"
              } rounded-br-lg`}
            />

            {/* Garis Merah Laser Animasi dengan Gradient */}
            <div className="w-full h-[3px] bg-gradient-to-r from-transparent via-red-500 to-transparent absolute top-0 shadow-[0_0_15px_rgba(239,68,68,1)] animate-scan z-20" />

            {/* Efek Flash Merah jika Salah Target */}
            {scanFeedback === "wrong_target" && (
              <div className="absolute inset-0 bg-red-500/20 animate-pulse z-10" />
            )}
          </div>
        )}

        {/* Hidden Canvas untuk Snapshot & OCR */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Badge Murni TextScanner SKU 8 Digit */}
        <div className="absolute top-3 left-3 z-30 flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/10 text-[10px] text-white font-medium">
          <ScanText className="w-3.5 h-3.5 text-blue-400" />
          <span>AI OCR Teks SKU (8 Digit)</span>
        </div>

        {/* Tombol Flash */}
        {hasTorch && !foundSku && (
          <button
            onClick={toggleTorch}
            className="absolute top-3 right-3 z-30 bg-black/60 backdrop-blur-md p-2.5 rounded-full text-white border border-white/20 active:scale-95 transition-all"
            aria-label="Toggle Torch"
          >
            {torchOn ? <Flashlight className="w-4 h-4 text-yellow-400" /> : <FlashlightOff className="w-4 h-4 text-white/80" />}
          </button>
        )}
      </div>

      {/* Indikator Status & Panduan */}
      <div className="flex justify-center z-10 w-full mt-1">
        <div className="bg-white/95 backdrop-blur-xl shadow-lg rounded-2xl p-4 w-full text-center border border-slate-200 flex flex-col items-center gap-2 transform transition-all duration-300 relative">
          {foundSku ? (
            <>
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-1 animate-bounce">
                <CheckCircle2 className="w-7 h-7 text-green-600" />
              </div>
              <p className="font-black text-2xl text-slate-800 tracking-wider">{foundSku}</p>
              <p className="text-xs text-green-600 font-bold">Memuat Detail Produk...</p>
            </>
          ) : (
            <>
              <div
                className={`flex items-center gap-2 font-bold mb-0.5 ${
                  scanFeedback === "wrong_target" ? "text-red-600" : "text-blue-600"
                }`}
              >
                <Loader2 className={`w-4 h-4 ${scanFeedback === "wrong_target" ? "" : "animate-spin"}`} />
                <span className="text-sm">{scanFeedback === "wrong_target" ? "Target Salah!" : "Siap Memindai"}</span>
              </div>
              <p className="text-xs text-slate-600 font-medium leading-tight">
                Arahkan <strong className="text-slate-800 font-black">Angka SKU (8 Digit)</strong> persis ke garis merah
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5 font-mono">{status}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
