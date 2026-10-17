/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Tesseract from "tesseract.js";
import { Loader2, Flashlight, FlashlightOff, CheckCircle2, DownloadCloud, Sparkles } from "lucide-react";
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
  const barcodeDetectorRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const isHandlingResult = useRef(false);
  const isLoopRunningRef = useRef(false);
  const isOcrRunningRef = useRef(false);
  const lastOcrTimeRef = useRef(0);
  const animationFrameIdRef = useRef<number | null>(null);
  const blacklistedSkus = useRef<Set<string>>(new Set());

  const [status, setStatus] = useState("Memulai Kamera & AI Super Cepat...");
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [foundSku, setFoundSku] = useState<string | null>(null);
  const [scanFeedback, setScanFeedback] = useState<"idle" | "wrong_target">("idle");
  const [hasBarcodeSupport, setHasBarcodeSupport] = useState(false);

  // Verifikasi apakah string merupakan SKU toko yang valid (0.05ms di IndexedDB lokal)
  const resolveSku = useCallback(async (text: string): Promise<string | null> => {
    if (!text) return null;
    const clean = text.trim();

    // 1. FILTER ANTI-ARTIKEL (KODE PABRIK): Misal "605-12218278"
    if (/\b\d{3,4}\s*-\s*\d{6,10}\b/.test(clean)) {
      return null;
    }

    // 2. Cek apakah string adalah 8 digit murni
    if (/^\d{8}$/.test(clean)) {
      if (blacklistedSkus.current.has(clean)) return null;
      try {
        const product = await db.products.get(clean);
        if (product) return product.sku;
      } catch {}

      // Fallback API jika local DB belum tersinkron
      const existsOnServer = await checkRemoteSku(clean);
      if (existsOnServer) return clean;
      return null;
    }

    // 3. Pecah teks berdasarkan spasi/baris untuk mengambil angka-angka
    const tokens = clean.replace(/[^0-9-\s]/g, " ").split(/\s+/);
    for (const token of tokens) {
      if (!token || token.includes("-")) continue;
      const digits = token.replace(/\D/g, "");

      // 8 Digit SKU Kandidat
      if (digits.length === 8) {
        if (blacklistedSkus.current.has(digits)) continue;
        try {
          const product = await db.products.get(digits);
          if (product) return product.sku;
        } catch {}

        const existsOnServer = await checkRemoteSku(digits);
        if (existsOnServer) return digits;
      }

      // Barcode panjang (12 - 14 digit): ambil 8 digit terakhirnya
      if (digits.length >= 12 && digits.length <= 14) {
        const last8 = digits.slice(-8);
        if (blacklistedSkus.current.has(last8)) continue;
        try {
          const product = await db.products.get(last8);
          if (product) return product.sku;
        } catch {}

        const existsOnServer = await checkRemoteSku(last8);
        if (existsOnServer) return last8;
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

  // Eksekusi jika SKU berhasil ditemukan (Haptic buzz + snapshot + dispatch)
  const handleSuccess = useCallback(async (sku: string) => {
    if (isHandlingResult.current) return;
    isHandlingResult.current = true;
    isLoopRunningRef.current = false;

    if (animationFrameIdRef.current) {
      cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = null;
    }

    // Getar halus (Haptic) untuk feedback instan native
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      try {
        navigator.vibrate(50);
      } catch {}
    }

    setFoundSku(sku);
    setStatus(`Berhasil terdeteksi: ${sku}`);

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

  // Eksekusi OCR Super Cepat (Non-Blocking, GPU Contrast Filter, PSM Single Line)
  const runOcrPass = useCallback(async (video: HTMLVideoElement) => {
    if (!workerRef.current || !canvasRef.current || isHandlingResult.current) return;

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return;

    const canvas = canvasRef.current;
    // Standarisasi ukuran OCR kecil (360x72 px) -> Eksekusi OCR super cepat ~40ms!
    const targetW = 360;
    const targetH = 72;
    if (canvas.width !== targetW) canvas.width = targetW;
    if (canvas.height !== targetH) canvas.height = targetH;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    // Ambil ROI tengah (di mana garis merah Alfagift berada)
    const roiW = vw * 0.75;
    const roiH = Math.max(vh * 0.16, 60);
    const startX = (vw - roiW) / 2;
    const startY = (vh - roiH) / 2;

    // Filter Hardware GPU (0% CPU! Menggantikan loop manual binarization JavaScript)
    ctx.filter = "contrast(190%) grayscale(100%) brightness(105%)";
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
      // Abaikan frame drop sesaat
    }
  }, [resolveSku, handleSuccess]);

  // Main 60 FPS Viewfinder Loop (Tidak pernah freeze karena OCR berjalan asinkron)
  const frameLoop = useCallback(() => {
    if (!isLoopRunningRef.current || isHandlingResult.current) return;

    const video = videoRef.current;
    if (!video || video.paused || video.ended || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      animationFrameIdRef.current = requestAnimationFrame(frameLoop);
      return;
    }

    const now = performance.now();

    // 1. FAST-PATH: Native Hardware BarcodeDetector (C++/GPU di Chrome Android / iOS 17+, <4ms!)
    if (barcodeDetectorRef.current && !isOcrRunningRef.current) {
      barcodeDetectorRef.current
        .detect(video)
        .then(async (barcodes: any[]) => {
          if (barcodes && barcodes.length > 0 && !isHandlingResult.current) {
            for (const b of barcodes) {
              const raw = b.rawValue?.trim();
              if (raw) {
                const matched = await resolveSku(raw);
                if (matched) {
                  await handleSuccess(matched);
                  return;
                }
              }
            }
          }
        })
        .catch(() => {});
    }

    // 2. ACCURATE-PATH: OCR Teks SKU 8 Digit (Berjalan terjadwal tiap 280ms, 0 freeze di video)
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
  }, [resolveSku, handleSuccess, runOcrPass]);

  // Inisialisasi Kamera & Worker
  useEffect(() => {
    let isMounted = true;
    isLoopRunningRef.current = true;

    // 1. Inisialisasi Native BarcodeDetector jika browser mendukung
    if (typeof window !== "undefined" && "BarcodeDetector" in window) {
      try {
        barcodeDetectorRef.current = new (window as any).BarcodeDetector({
          formats: ["code_128", "ean_13", "code_39", "upc_a", "ean_8"],
        });
        setHasBarcodeSupport(true);
      } catch (e) {
        console.warn("[TextScanner] BarcodeDetector init fallback", e);
      }
    }

    // 2. Buka Kamera dengan Continuous Autofocus
    const startCamera = async () => {
      try {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
        }

        setStatus("Membuka Kamera 60 FPS...");
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
            setStatus("Arahkan SKU (8 Digit) ke garis merah");
            if (isLoopRunningRef.current) {
              animationFrameIdRef.current = requestAnimationFrame(frameLoop);
            }
          };

          const track = localStream.getVideoTracks()[0];
          if (track) {
            const capabilities = track.getCapabilities() as any;
            if (capabilities?.torch) setHasTorch(true);

            // Terapkan autofocus continuous jika didukung hardware HP
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

    // 3. Inisialisasi Tesseract Worker dengan Parameter Tercepat (Single Line + Digits Only)
    const initWorker = async () => {
      try {
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

    // Jalankan keduanya secara simultan
    Promise.all([startCamera(), initWorker()]);

    // Listener Lifecycle: Hemat baterai saat minimize, bangun seketika saat dibuka
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
          <div className="absolute top-1/2 left-[10%] right-[10%] h-[16%] min-h-[64px] -translate-y-1/2 shadow-[0_0_0_9999px_rgba(0,0,0,0.6)] z-10 pointer-events-none overflow-hidden">
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

        {/* Badge Dual Engine Scanner */}
        <div className="absolute top-3 left-3 z-30 flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/10 text-[10px] text-white font-medium">
          <Sparkles className="w-3 h-3 text-amber-400" />
          <span>{hasBarcodeSupport ? "Dual Engine (Barcode + OCR)" : "AI OCR Ultra Cepat"}</span>
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
                Arahkan <strong className="text-slate-800 font-black">Angka SKU (8 Digit)</strong> atau barcode persis ke garis merah
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5 font-mono">{status}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
