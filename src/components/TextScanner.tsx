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

  // Cache SKU yang sudah pernah diperiksa agar tidak query berulang-ulang
  const blacklistedSkus = useRef<Set<string>>(new Set());
  const invalidSkus = useRef<Set<string>>(new Set());
  const pendingChecks = useRef<Set<string>>(new Set());
  const lastWrongFeedbackTime = useRef(0);

  const [status, setStatus] = useState("Menyiapkan Pemindai Teks SKU...");
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [foundSku, setFoundSku] = useState<string | null>(null);
  const [scanFeedback, setScanFeedback] = useState<"idle" | "wrong_target">("idle");

  // Helper cek SKU ke server endpoint Next.js jika belum ada di Dexie lokal
  async function checkRemoteSku(sku: string): Promise<"FOUND" | "NOT_FOUND" | "NETWORK_ERROR"> {
    try {
      const res = await fetch(`/api/product/${encodeURIComponent(sku)}?page=1`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        if (data && (data.data || (Array.isArray(data) && data.length > 0))) {
          return "FOUND";
        }
        return "NOT_FOUND";
      }
      if (res.status === 404) {
        return "NOT_FOUND";
      }
    } catch {
      return "NETWORK_ERROR";
    }
    return "NOT_FOUND";
  }

  // Validasi teks hasil OCR: Ekstrak SKU 8 digit tanpa terblokir kode pabrik ber-strip
  const resolveSku = useCallback(async (text: string): Promise<{ sku: string | null; isWrongTarget: boolean }> => {
    if (!text) return { sku: null, isWrongTarget: false };
    const clean = text.trim();

    // 1. Deteksi tanda strip atau kode artikel pabrik (misal "602-12156403", "605-12218278")
    const hasHyphen = /\b\d+\s*-\s*\d+\b/.test(clean) || clean.includes("-");

    // Bersihkan semua kode ber-strip agar deretan angka SKU 8 digit asli dapat terbaca dengan sempurna
    const textWithoutHyphens = clean.replace(/\b[A-Za-z0-9]*-[A-Za-z0-9]*\b/g, " ").replace(/-/g, " ");

    // 2. Kumpulkan seluruh kandidat angka 8 digit murni (TANPA tanda hubung)
    const candidates: string[] = [];
    const tokens = textWithoutHyphens.replace(/[^0-9\s]/g, " ").split(/\s+/);
    for (const token of tokens) {
      if (
        token.length === 8 &&
        /^\d{8}$/.test(token) &&
        !candidates.includes(token) &&
        !blacklistedSkus.current.has(token) &&
        !invalidSkus.current.has(token)
      ) {
        candidates.push(token);
      }
    }

    // 3. Verifikasi kandidat: Cek IndexedDB lokal (<0.05ms) terlebih dahulu untuk respon instan
    for (const cand of candidates) {
      try {
        const product = await db.products.get(cand);
        if (product && product.sku) {
          return { sku: product.sku, isWrongTarget: false };
        }
      } catch { }
    }

    // 4. Jika belum ada di cache Dexie lokal, cek ke Server API
    for (const cand of candidates) {
      if (pendingChecks.current.has(cand)) continue;
      pendingChecks.current.add(cand);

      try {
        const checkResult = await checkRemoteSku(cand);
        pendingChecks.current.delete(cand);

        if (checkResult === "FOUND") {
          return { sku: cand, isWrongTarget: false };
        } else if (checkResult === "NOT_FOUND") {
          invalidSkus.current.add(cand);
        } else if (checkResult === "NETWORK_ERROR" && candidates.length === 1) {
          // Jika offline atau jaringan terputus dan hanya ada 1 kandidat 8 digit murni, terima langsung
          return { sku: cand, isWrongTarget: false };
        }
      } catch {
        pendingChecks.current.delete(cand);
      }
    }

    // 5. Jika tidak ada SKU valid, cek apakah kamera mendeteksi kode non-SKU untuk feedback merah
    const cleanRaw = clean.replace(/\s+/g, "");
    const isWrongTarget =
      hasHyphen ||
      /\b\d{4,}\b/.test(clean) ||
      (cleanRaw.length >= 4 && !/^\d{8}$/.test(cleanRaw));

    return { sku: null, isWrongTarget };
  }, []);

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
      } catch { }
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
    }, 400);
  }, [onScanResult]);

  // Eksekusi OCR Super Cepat & Presisi (Proyeksi Viewfinder 1:1, Canvas 400px, GPU Filter)
  const runOcrPass = useCallback(async (video: HTMLVideoElement) => {
    if (!workerRef.current || !canvasRef.current || isHandlingResult.current) return;

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const cw = video.clientWidth;
    const ch = video.clientHeight;
    if (!vw || !vh || !cw || !ch) return;

    // Hitung proyeksi koordinat viewfinder UI ke buffer video kamera (akurat untuk CSS object-cover)
    const scale = Math.max(cw / vw, ch / vh);
    const renderedW = vw * scale;
    const renderedH = vh * scale;
    const offsetX = (cw - renderedW) / 2;
    const offsetY = (ch - renderedH) / 2;

    // Posisi kotak merah di layar: lebar 84%, tinggi 20% (min 80px), vertikal di tengah
    const overlayW = cw * 0.84;
    const overlayH = Math.max(ch * 0.20, 80);
    const overlayX = (cw - overlayW) / 2;
    const overlayY = (ch - overlayH) / 2;

    // Konversi ke koordinat video asli dengan margin ekstra 10-15% agar teks di dekat sudut tetap tertangkap
    const rawX = (overlayX - offsetX) / scale;
    const rawY = (overlayY - offsetY) / scale;
    const rawW = overlayW / scale;
    const rawH = overlayH / scale;

    const padX = rawW * 0.08;
    const padY = rawH * 0.15;

    const startX = Math.max(0, rawX - padX);
    const startY = Math.max(0, rawY - padY);
    const roiW = Math.min(vw - startX, rawW + padX * 2);
    const roiH = Math.min(vh - startY, rawH + padY * 2);
    if (roiW <= 0 || roiH <= 0) return;

    // Ukuran target canvas kompak (400px) -> Pembacaan super cepat ~40ms tanpa distorsi
    const targetW = 400;
    const targetH = Math.max(64, Math.round(targetW * (roiH / roiW)));

    const canvas = canvasRef.current;
    if (canvas.width !== targetW) canvas.width = targetW;
    if (canvas.height !== targetH) canvas.height = targetH;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    // Filter kontras GPU yang tajam: teks hitam kontras tinggi di atas latar label putih
    ctx.filter = "contrast(160%) grayscale(100%) brightness(105%)";
    ctx.drawImage(video, startX, startY, roiW, roiH, 0, 0, targetW, targetH);
    ctx.filter = "none";

    try {
      const { data } = await workerRef.current.recognize(canvas);
      if (!data || !data.text || isHandlingResult.current) return;

      const raw = data.text;
      const { sku: validSku, isWrongTarget } = await resolveSku(raw);

      if (validSku) {
        await handleSuccess(validSku);
      } else if (isWrongTarget) {
        const now = Date.now();
        if (now - lastWrongFeedbackTime.current > 1000 && scanFeedback === "idle") {
          lastWrongFeedbackTime.current = now;
          setScanFeedback("wrong_target");
          setStatus("Bukan SKU! Arahkan ke 8 digit SKU hangtag");
          setTimeout(() => {
            setScanFeedback("idle");
            if (!isHandlingResult.current) {
              setStatus("Arahkan angka SKU (8 Digit) ke garis merah");
            }
          }, 800);
        }
      }
    } catch {
      // Abaikan frame drop sesaat
    }
  }, [resolveSku, handleSuccess, scanFeedback]);

  // Loop Kamera 60 FPS (Super responsif ~8 pass/detik tanpa memblokir rendering UI)
  const frameLoop = useCallback(() => {
    if (!isLoopRunningRef.current || isHandlingResult.current) return;

    const video = videoRef.current;
    if (!video || video.paused || video.ended || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      animationFrameIdRef.current = requestAnimationFrame(frameLoop);
      return;
    }

    const now = performance.now();

    // Jalankan OCR jika tidak ada pass aktif dan sudah lewat 120ms (kecepatan maksimal)
    if (workerRef.current && !isOcrRunningRef.current && now - lastOcrTimeRef.current >= 120) {
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

          const startPlayback = () => {
            videoRef.current?.play().catch(() => { });
            setStatus("Arahkan angka SKU (8 Digit) ke garis merah");
            if (isLoopRunningRef.current && !animationFrameIdRef.current) {
              animationFrameIdRef.current = requestAnimationFrame(frameLoop);
            }
          };

          if (videoRef.current.readyState >= HTMLMediaElement.HAVE_METADATA) {
            startPlayback();
          } else {
            videoRef.current.onloadedmetadata = startPlayback;
          }

          const track = localStream.getVideoTracks()[0];
          if (track) {
            const capabilities = track.getCapabilities() as any;
            if (capabilities?.torch) setHasTorch(true);

            if (capabilities?.focusMode?.includes("continuous")) {
              track.applyConstraints({ advanced: [{ focusMode: "continuous" } as any] }).catch(() => { });
            }
          }
        }
      } catch (err) {
        console.error("Camera Init Error:", err);
        if (isMounted) setStatus("Gagal membuka kamera. Periksa izin kamera.");
      }
    };

    // 2. Inisialisasi Tesseract Worker: SINGLE_BLOCK untuk multi-baris pada label harga
    const initWorker = async () => {
      try {
        setStatus("Menyiapkan pemindai SKU...");
        const worker = await Tesseract.createWorker("eng");
        await worker.setParameters({
          tessedit_char_whitelist: "0123456789-",
          tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
        });

        if (isMounted) {
          workerRef.current = worker;
          setStatus("Arahkan angka SKU (8 Digit) ke garis merah");
        } else {
          worker.terminate();
        }
      } catch (err) {
        console.error("OCR Worker Init Error:", err);
      }
    };

    Promise.all([startCamera(), initWorker()]);

    // Lifecycle Visibility: 0% CPU saat minimize, bangun instan saat buka kembali
    const handleVisibilityChange = async () => {
      if (document.visibilityState === "visible") {
        isLoopRunningRef.current = true;

        if (videoRef.current && videoRef.current.paused) {
          videoRef.current.play().catch(() => { });
        }

        const tracks = streamRef.current?.getVideoTracks();
        const isTrackAlive = tracks && tracks.length > 0 && tracks[0].readyState === "live";

        if (!isTrackAlive) {
          await startCamera();
        } else if (!animationFrameIdRef.current) {
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
        className={`relative rounded-3xl overflow-hidden shadow-2xl border-4 transition-colors duration-300 bg-black ${foundSku
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
          className="w-full min-h-[320px] sm:min-h-[420px] object-cover"
        />

        {/* Kotak ROI (Viewfinder Tengah) Presisi */}
        {!foundSku && (
          <div className="absolute top-1/2 left-[8%] right-[8%] h-[20%] min-h-[80px] -translate-y-1/2 shadow-[0_0_0_9999px_rgba(0,0,0,0.6)] z-10 pointer-events-none overflow-hidden">
            {/* 4 Sudut Merah (Corners) */}
            <div
              className={`absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 transition-colors duration-300 ${scanFeedback === "wrong_target" ? "border-red-600" : "border-red-500"
                } rounded-tl-lg`}
            />
            <div
              className={`absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 transition-colors duration-300 ${scanFeedback === "wrong_target" ? "border-red-600" : "border-red-500"
                } rounded-tr-lg`}
            />
            <div
              className={`absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 transition-colors duration-300 ${scanFeedback === "wrong_target" ? "border-red-600" : "border-red-500"
                } rounded-bl-lg`}
            />
            <div
              className={`absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 transition-colors duration-300 ${scanFeedback === "wrong_target" ? "border-red-600" : "border-red-500"
                } rounded-br-lg`}
            />

            {/* Garis Merah Laser Animasi dengan Gradient */}
            <div className="w-full h-[3px] bg-gradient-to-r from-transparent via-red-500 to-transparent absolute top-0 shadow-[0_0_15px_rgba(239,68,68,1)] animate-scan z-20" />

            {/* Efek Flash Merah jika Salah Target */}
            {scanFeedback === "wrong_target" && (
              <div className="absolute inset-0 bg-red-600/25 animate-pulse z-10 flex items-center justify-center">
                <span className="bg-red-600 text-white text-[10px] font-black tracking-widest px-2.5 py-0.5 rounded-full shadow-lg border border-white/20 uppercase">
                  Bukan SKU
                </span>
              </div>
            )}
          </div>
        )}

        {/* Hidden Canvas untuk Snapshot & OCR */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Badge Murni TextScanner SKU 8 Digit */}
        <div className="absolute top-3 left-3 z-30 flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/10 text-[10px] text-white font-medium">
          <ScanText className="w-3.5 h-3.5 text-blue-400" />
          <span>Pemindai SKU (8 Digit)</span>
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
                className={`flex items-center gap-2 font-bold mb-0.5 ${scanFeedback === "wrong_target" ? "text-red-600" : "text-blue-600"
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
