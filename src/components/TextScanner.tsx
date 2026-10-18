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
  const consecutiveTimeouts = useRef(0);

  const [status, setStatus] = useState("Menyiapkan Pemindai Teks SKU...");
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [foundSku, setFoundSku] = useState<string | null>(null);

  // Validasi teks hasil OCR: Tampung semua teks, hiraukan kode strip artikel (605-12218278), lalu ekstrak SKU 8 digit
  const resolveSku = useCallback(async (text: string): Promise<string | null> => {
    if (!text) return null;
    const clean = text.trim();

    // 1. TAMPUNG SEMUA teks, lalu HIRARKAN / BUANG seluruh kode ber-strip
    // (misal: "605-12218278", "605 - 12218278", "77-83", "T-SHIRT", dll.)
    // Dengan membuang seluruh pola yang mengandung tanda hubung (-),
    // angka "12218278" tidak akan pernah ikut terbaca sebagai SKU.
    const textWithoutHyphens = clean
      .replace(/\S*\d+\s*-\s*\d+\S*/g, " ")
      .replace(/\S*-\S*/g, " ");

    // 2. Kumpulkan seluruh kandidat angka 8 digit murni
    const candidates: string[] = [];

    // Pola A: Cari deretan angka 8 digit dengan word boundary
    const regex8 = /\b\d{8}\b/g;
    let match: RegExpExecArray | null;
    while ((match = regex8.exec(textWithoutHyphens)) !== null) {
      const val = match[0];
      if (!candidates.includes(val)) {
        candidates.push(val);
      }
    }

    // Pola B: Token fallback (misal jika ada huruf/tanda baca menempel seperti "S13472861" atau "13472861.")
    const tokens = textWithoutHyphens.split(/\s+/);
    for (const token of tokens) {
      const digits = token.replace(/\D/g, "");
      if (digits.length === 8 && !candidates.includes(digits)) {
        candidates.push(digits);
      }
    }

    if (candidates.length === 0) return null;

    // 3. Cek IndexedDB lokal (<0.05ms) tanpa jeda internet
    for (const cand of candidates) {
      try {
        const product = await db.products.get(cand);
        if (product && product.sku) {
          return product.sku;
        }
      } catch { }
    }

    // 4. Zero-Freeze: Jika hanya ada 1 kandidat 8 digit murni (seperti 13472861), langsung terima!
    // Tidak melakukan fetch network sinkron di loop scanner agar proses pemindaian tidak pernah nge-freeze.
    if (candidates.length === 1) {
      return candidates[0];
    }

    // Jika lebih dari 1 kandidat, ambil yang baris terakhir (karena SKU selalu berada di bawah kode artikel)
    return candidates[candidates.length - 1];
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
    }, 300);
  }, [onScanResult]);

  // Eksekusi OCR Ringan, Cepat, & Presisi (Proyeksi Viewfinder 1:1, PSM SINGLE_BLOCK, GPU Filter)
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

    // Standarisasi lebar 600px -> tinggi font ideal ~35-45px untuk neural net LSTM Tesseract
    const targetW = 600;
    const targetH = Math.max(70, Math.round(targetW * (roiH / roiW)));

    const canvas = canvasRef.current;
    if (canvas.width !== targetW) canvas.width = targetW;
    if (canvas.height !== targetH) canvas.height = targetH;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    // Filter kontras GPU: hitamkan teks di atas label putih tanpa merusak font
    ctx.filter = "contrast(135%) grayscale(100%) brightness(102%)";
    ctx.drawImage(video, startX, startY, roiW, roiH, 0, 0, targetW, targetH);
    ctx.filter = "none";

    try {
      // Safeguard timeout 1000ms: jika web worker OCR macet/tidur saat minimize, lewati agar sistem tidak pernah freeze
      const recognizePromise = workerRef.current.recognize(canvas);
      const timeoutPromise = new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), 1000)
      );

      const result = await Promise.race([recognizePromise, timeoutPromise]);
      if (!result || !result.data || !result.data.text || isHandlingResult.current) {
        if (!result) {
          consecutiveTimeouts.current += 1;
        }
        return;
      }
      consecutiveTimeouts.current = 0;

      const raw = result.data.text;
      const validSku = await resolveSku(raw);

      if (validSku) {
        await handleSuccess(validSku);
      }
    } catch {
      // Abaikan frame drop sesaat
    }
  }, [resolveSku, handleSuccess]);

  // Loop Kamera 60 FPS (Bebas Freeze dengan watchdog recovery)
  const frameLoop = useCallback(() => {
    if (!isLoopRunningRef.current || isHandlingResult.current) return;

    const video = videoRef.current;
    if (!video || video.paused || video.ended || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      if (video && video.paused && document.visibilityState === "visible") {
        video.play().catch(() => {});
      }
      animationFrameIdRef.current = requestAnimationFrame(frameLoop);
      return;
    }

    const now = performance.now();

    // Watchdog anti-freeze: jika pass sebelumnya macet lebih dari 1.2 detik, paksa buka lock pemindai
    if (isOcrRunningRef.current && now - lastOcrTimeRef.current > 1200) {
      isOcrRunningRef.current = false;
    }

    // Jalankan OCR jika tidak ada pass aktif dan sudah lewat 180ms
    if (workerRef.current && !isOcrRunningRef.current && now - lastOcrTimeRef.current >= 180) {
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
            if (isLoopRunningRef.current) {
              if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
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
        if (workerRef.current) {
          try { workerRef.current.terminate(); } catch {}
          workerRef.current = null;
        }
        setStatus("Menyiapkan pemindai SKU...");
        const worker = await Tesseract.createWorker("eng");
        await worker.setParameters({
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

    // Lifecycle Visibility: Bangun instan & pulihkan sistem pemindai saat buka kembali
    const handleVisibilityChange = async () => {
      if (document.visibilityState === "visible") {
        isLoopRunningRef.current = true;
        // Reset mutlak lock pemindai agar tidak nge-freeze akibat minimize
        isOcrRunningRef.current = false;
        lastOcrTimeRef.current = 0;

        // Putar ulang video jika sempat dipause browser saat minimize
        if (videoRef.current) {
          videoRef.current.play().catch(() => { });
        }

        // Cek apakah track kamera masih hidup
        const tracks = streamRef.current?.getVideoTracks();
        const isTrackAlive = tracks && tracks.length > 0 && tracks[0].readyState === "live";

        if (!isTrackAlive) {
          await startCamera();
        }

        // Bangunkan kembali Tesseract worker jika sempat unresponsive
        if (!workerRef.current || consecutiveTimeouts.current >= 2) {
          consecutiveTimeouts.current = 0;
          await initWorker();
        }

        // Restart loop frame kamera & OCR
        if (animationFrameIdRef.current) {
          cancelAnimationFrame(animationFrameIdRef.current);
          animationFrameIdRef.current = null;
        }
        animationFrameIdRef.current = requestAnimationFrame(frameLoop);
      } else {
        // Saat minimize: hentikan loop & lepaskan lock OCR
        isLoopRunningRef.current = false;
        isOcrRunningRef.current = false;
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
            <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-red-500 rounded-tl-lg" />
            <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-red-500 rounded-tr-lg" />
            <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-red-500 rounded-bl-lg" />
            <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-red-500 rounded-br-lg" />

            {/* Garis Merah Laser Animasi dengan Gradient */}
            <div className="w-full h-[3px] bg-gradient-to-r from-transparent via-red-500 to-transparent absolute top-0 shadow-[0_0_15px_rgba(239,68,68,1)] animate-scan z-20" />
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
              <div className="flex items-center gap-2 font-bold mb-0.5 text-blue-600">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Siap Memindai</span>
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
