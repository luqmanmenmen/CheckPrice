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
  AlertCircle,
  RefreshCw,
} from "lucide-react";

export interface DetectedSku {
  text: string;
  bbox?: { x0: number; y0: number; x1: number; y1: number };
  rawText?: string;
}

interface TextScannerProps {
  onScanResult: (result: string, detected?: DetectedSku, snapshot?: string) => void;
}

// FORMAT BARCODE RETAIL LENGKAP (EAN-13, EAN-8, CODE-128, CODE-39, CODE-93, UPC-A, UPC-E, ITF, CODABAR, QR)
const SUPPORTED_FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.CODE_93,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.CODABAR,
  Html5QrcodeSupportedFormats.QR_CODE,
];

/**
 * Validasi Check-Digit Standar GS1 Modulo-10 untuk EAN-13 (13 digit) & UPC-A (12 digit)
 */
function isValidGs1CheckDigit(code: string): boolean {
  if (!/^\d{12,13}$/.test(code)) return false;
  const digits = code.split("").map(Number);
  const checkDigit = digits.pop()!;
  let sum = 0;
  for (let i = digits.length - 1, pos = 1; i >= 0; i--, pos++) {
    sum += digits[i] * (pos % 2 === 1 ? 3 : 1);
  }
  const expected = (10 - (sum % 10)) % 10;
  return checkDigit === expected;
}

/**
 * Validasi Check-Digit 8-Digit SKU Matahari Bobot (1, 2, 1, 2, 1, 2, 1) Modulo-10
 */
function isValidMdsSku8(code: string): boolean {
  if (!/^\d{8}$/.test(code)) return false;
  const weights = [1, 2, 1, 2, 1, 2, 1];
  let sum = 0;
  for (let i = 0; i < 7; i++) {
    sum += Number(code[i]) * weights[i];
  }
  const expected = (10 - (sum % 10)) % 10;
  return Number(code[7]) === expected;
}

export default function TextScanner({ onScanResult }: TextScannerProps) {
  const hiddenSinkId = "retail-barcode-decoder-sink";
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const decoderRef = useRef<Html5Qrcode | null>(null);
  const nativeDetectorRef = useRef<any>(null);

  const isHandlingResult = useRef(false);
  const isDecodingFrame = useRef(false);
  const scanPassCounter = useRef(0);

  // Multi-frame consensus tracker untuk mencegah salah baca 1 frame blur
  const lastCandidateRef = useRef<{ code: string; count: number; ts: number }>({
    code: "",
    count: 0,
    ts: 0,
  });

  const [status, setStatus] = useState("Menyalakan Kamera...");
  const [isReady, setIsReady] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [foundCode, setFoundCode] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [restartTrigger, setRestartTrigger] = useState(0);

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
      osc.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch {}
  }, [soundEnabled]);

  // Haptic feedback getar ponsel
  const triggerHaptic = useCallback(() => {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      try {
        navigator.vibrate(60);
      } catch {}
    }
  }, []);

  const stopHardwareStream = useCallback(() => {
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((track) => {
          try {
            track.stop();
          } catch {}
        });
      } catch {}
      streamRef.current = null;
    }
    if (videoRef.current) {
      try {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
      } catch {}
    }
  }, []);

  const commitValidBarcode = useCallback(
    (finalCode: string) => {
      if (isHandlingResult.current) return;
      isHandlingResult.current = true;
      setFoundCode(finalCode);
      setStatus(`Barcode Terbaca: ${finalCode}`);

      playBeep();
      triggerHaptic();
      stopHardwareStream();

      setTimeout(() => {
        onScanResult(finalCode, { text: finalCode, rawText: finalCode }, undefined);
      }, 120);
    },
    [onScanResult, playBeep, triggerHaptic, stopHardwareStream]
  );

  // Handler cerdas saat kamera mendeteksi kandidat barcode (Anti-Blurry Misread, dukung barcode vendor/strip!)
  const handleBarcodeDetected = useCallback(
    async (decodedText: string) => {
      if (isHandlingResult.current) return;
      const cleanCode = decodedText.trim();
      if (!cleanCode) return;

      const isNumeric12Or13 = /^\d{12,13}$/.test(cleanCode);
      const passesGs1 = !isNumeric12Or13 || isValidGs1CheckDigit(cleanCode);

      // JALUR KILAT DEXIE: Cek kecocokan lokal lebih dulu (menangkap juga Code-128 non-GS1 & kode bertanda hubung)
      try {
        const { findOfflineProductByCode } = await import("@/lib/offlineDb");
        const hit = await findOfflineProductByCode(cleanCode);
        if (hit) {
          commitValidBarcode(cleanCode);
          return;
        }
      } catch {}

      const now = Date.now();
      if (
        lastCandidateRef.current.code === cleanCode &&
        now - lastCandidateRef.current.ts < 1500
      ) {
        lastCandidateRef.current.count += 1;
        lastCandidateRef.current.ts = now;
      } else {
        lastCandidateRef.current = { code: cleanCode, count: 1, ts: now };
      }

      const currentCount = lastCandidateRef.current.count;
      const isStandardMdsEan13 = /^234000\d{7}$/.test(cleanCode) && passesGs1;
      const isStandardMdsSku = isValidMdsSku8(cleanCode);

      // Kode 12-13 digit non-GS1 (bukan dari Dexie) tetap butuh 4 frame identik agar terhindar dari noise EAN blur
      const requiredFrames = !passesGs1 ? 4 : (isStandardMdsEan13 || isStandardMdsSku ? 2 : 3);
      if (currentCount < requiredFrames) {
        setStatus("Memfokuskan lensa ke garis barcode...");
        return;
      }

      commitValidBarcode(cleanCode);
    },
    [commitValidBarcode]
  );

  // Inisialisasi Decoder (Native BarcodeDetector + ZXing Html5QrcodeShim)
  useEffect(() => {
    try {
      if (typeof window !== "undefined" && "BarcodeDetector" in window) {
        const NativeBarcodeDetector = (window as any).BarcodeDetector;
        nativeDetectorRef.current = new NativeBarcodeDetector({
          formats: ["ean_13", "ean_8", "code_128", "code_39", "code_93", "upc_a", "upc_e", "itf", "codabar", "qr_code"],
        });
      }
    } catch {
      nativeDetectorRef.current = null;
    }

    try {
      if (document.getElementById(hiddenSinkId)) {
        decoderRef.current = new Html5Qrcode(hiddenSinkId, {
          formatsToSupport: SUPPORTED_FORMATS,
          verbose: false,
        });
      }
    } catch (e) {
      console.warn("Init ZXing decoder fallback warning:", e);
    }
  }, []);

  // Inisialisasi & Start Kamera Native <video> (4-Tier Fallback Anti-Black-Page!)
  useEffect(() => {
    let isMounted = true;
    let scanIntervalId: ReturnType<typeof setInterval> | null = null;
    let watchdogId: ReturnType<typeof setTimeout> | null = null;

    isHandlingResult.current = false;
    isDecodingFrame.current = false;
    lastCandidateRef.current = { code: "", count: 0, ts: 0 };
    setErrorMessage(null);
    setFoundCode(null);
    setIsReady(false);
    setHasTorch(false);
    setTorchOn(false);
    setStatus(
      facingMode === "environment"
        ? "Menyalakan Kamera Belakang..."
        : "Menyalakan Kamera Depan..."
    );

    const acquireCameraStream = async (): Promise<MediaStream> => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Browser tidak mendukung akses kamera.");
      }

      // TIER 1: Kamera HD dengan facingMode ideal
      try {
        return await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      } catch (err1) {
        console.warn("Tier 1 getUserMedia gagal, mencoba Tier 2:", err1);
      }

      // TIER 2: Tanpa syarat resolusi (cocok untuk HP Android RAM hemat)
      try {
        return await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facingMode },
          audio: false,
        });
      } catch (err2) {
        console.warn("Tier 2 getUserMedia gagal, mencoba Tier 3 (DeviceId):", err2);
      }

      // TIER 3: Cari deviceId kamera belakang secara eksplisit via enumerateDevices()
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter((d) => d.kind === "videoinput");
        if (videoDevices.length > 0) {
          let chosen = videoDevices[0];
          if (facingMode === "environment") {
            const backCam = videoDevices.find((d) =>
              /back|rear|belakang|environment|0/i.test(d.label)
            );
            chosen = backCam || videoDevices[videoDevices.length - 1];
          } else {
            const frontCam = videoDevices.find((d) =>
              /front|user|depan|selfie/i.test(d.label)
            );
            if (frontCam) chosen = frontCam;
          }
          if (chosen.deviceId) {
            return await navigator.mediaDevices.getUserMedia({
              video: { deviceId: { exact: chosen.deviceId } },
              audio: false,
            });
          }
        }
      } catch (err3) {
        console.warn("Tier 3 getUserMedia gagal, mencoba Tier 4:", err3);
      }

      // TIER 4: Fallback universal agar kamera PASTI NYALA di semua perangkat
      return await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });
    };

    const startNativeVideoCamera = async () => {
      stopHardwareStream();
      // Beri jeda 80ms agar hardware kamera Android/iOS melepas lock sebelumnya dengan bersih
      await new Promise((r) => setTimeout(r, 80));
      if (!isMounted) return;

      try {
        const stream = await acquireCameraStream();
        if (!isMounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;

        video.muted = true;
        video.playsInline = true;
        video.setAttribute("playsinline", "true");
        video.setAttribute("webkit-playsinline", "true");
        video.setAttribute("autoplay", "true");
        video.srcObject = stream;

        const ensurePlaying = async () => {
          if (!isMounted || !videoRef.current) return;
          try {
            await videoRef.current.play();
            if (isMounted) {
              setIsReady(true);
              setErrorMessage(null);
              setStatus("Arahkan Garis Barcode ke Dalam Kotak");
            }
          } catch (playErr) {
            console.warn("Autoplay perlu retry:", playErr);
          }
        };

        if (video.readyState >= 1) {
          await ensurePlaying();
        } else {
          video.onloadedmetadata = () => {
            ensurePlaying();
          };
          // Tetap panggil play() langsung untuk memancing stream di Chrome/Safari
          ensurePlaying();
        }

        // Aktifkan Continuous Autofocus & Cek Fitur Senter (Torch)
        const track = stream.getVideoTracks()[0];
        if (track && typeof track.getCapabilities === "function") {
          try {
            const caps = track.getCapabilities() as any;
            if (caps?.torch) {
              setHasTorch(true);
            }
            if (caps?.focusMode && Array.isArray(caps.focusMode) && caps.focusMode.includes("continuous")) {
              track
                .applyConstraints({ advanced: [{ focusMode: "continuous" } as any] })
                .catch(() => {});
            }
          } catch {}
        }

        // Watchdog Anti-Black-Screen: Jika dalam 2 detik video masih paused / dimensi 0, paksa play ulang!
        watchdogId = setTimeout(() => {
          if (!isMounted || !videoRef.current) return;
          if (videoRef.current.paused || videoRef.current.videoWidth === 0) {
            videoRef.current.play().catch(() => {});
          } else {
            setIsReady(true);
          }
        }, 2000);
      } catch (err: any) {
        if (!isMounted) return;
        console.error("Gagal menyalakan kamera:", err);
        setErrorMessage(
          "Kamera tidak dapat diakses. Pastikan izin kamera diizinkan di browser lalu tekan Segarkan Kamera."
        );
        setStatus("Izin Kamera Ditolak / Kamera Sibuk");
      }
    };

    // Loop Dekoder Barcode 16 FPS langsung dari elemen <video>
    const decodeFrameTick = async () => {
      if (
        !isMounted ||
        isHandlingResult.current ||
        isDecodingFrame.current ||
        !videoRef.current ||
        !canvasRef.current
      ) {
        return;
      }

      const video = videoRef.current;
      if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
        return;
      }

      isDecodingFrame.current = true;
      const pass = ++scanPassCounter.current;

      try {
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;

        // Pass ganjil: fokus ke pita horizontal tengah (kotak barcode); Pass genap: area tengah lebih luas
        const cropW = Math.floor(vw * 0.88);
        const cropH = pass % 2 === 1 ? Math.floor(vh * 0.42) : Math.floor(vh * 0.68);
        const sx = Math.floor((vw - cropW) / 2);
        const sy = Math.floor((vh - cropH) / 2);

        const targetW = Math.min(960, cropW);
        const targetH = Math.max(120, Math.floor(cropH * (targetW / cropW)));

        if (canvas.width !== targetW) canvas.width = targetW;
        if (canvas.height !== targetH) canvas.height = targetH;

        ctx.drawImage(video, sx, sy, cropW, cropH, 0, 0, targetW, targetH);

        // 1. Coba Native BarcodeDetector dulu jika tersedia (sangat cepat di GPU HP)
        if (nativeDetectorRef.current) {
          try {
            const barcodes = await nativeDetectorRef.current.detect(canvas);
            if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
              await handleBarcodeDetected(barcodes[0].rawValue);
              if (isHandlingResult.current) return;
            }
          } catch {}
        }

        // 2. Coba ZXing Decoder via Html5QrcodeShim (bekerja di 100% HP Android & iOS Safari)
        const shim = (decoderRef.current as any)?.qrcode;
        if (shim && typeof shim.decodeRobustlyAsync === "function") {
          try {
            const result = await shim.decodeRobustlyAsync(canvas);
            if (result && result.text) {
              await handleBarcodeDetected(result.text);
              return;
            }
          } catch {}
        }
      } finally {
        isDecodingFrame.current = false;
      }
    };

    startNativeVideoCamera();
    scanIntervalId = setInterval(decodeFrameTick, 65);

    // Bangunkan kamera otomatis jika user kembali dari minimize / kunci layar
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && isMounted && !isHandlingResult.current) {
        const tracks = streamRef.current?.getVideoTracks();
        const isAlive = tracks && tracks.length > 0 && tracks[0].readyState === "live";
        if (!isAlive) {
          startNativeVideoCamera();
        } else if (videoRef.current && videoRef.current.paused) {
          videoRef.current.play().catch(() => {});
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isMounted = false;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (scanIntervalId) clearInterval(scanIntervalId);
      if (watchdogId) clearTimeout(watchdogId);
      stopHardwareStream();
    };
  }, [facingMode, restartTrigger, handleBarcodeDetected, stopHardwareStream]);

  // Toggle Senter (Flashlight / Torch)
  const toggleTorch = async () => {
    if (!streamRef.current || !hasTorch) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;
    try {
      const nextState = !torchOn;
      await track.applyConstraints({
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

  // Segarkan Kamera Manual (1-Klik Anti Black Screen)
  const refreshCamera = () => {
    setTorchOn(false);
    setRestartTrigger((prev) => prev + 1);
  };

  return (
    <div className="relative w-full h-full min-h-[360px] flex flex-col items-center justify-center bg-black overflow-hidden select-none rounded-2xl">
      {/* Elemen Sink Tersembunyi untuk ZXing Decoder */}
      <div id={hiddenSinkId} className="hidden" />
      <canvas ref={canvasRef} className="hidden" />

      {/* ELEMEN VIDEO NATIVE LANGSUNG (100% Anti-Black-Page di Semua Android & iPhone) */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        onClick={() => {
          if (videoRef.current && videoRef.current.paused) {
            videoRef.current.play().catch(() => {});
          }
        }}
        className="absolute inset-0 w-full h-full object-cover bg-black z-0"
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
              <span className="text-xs font-semibold tracking-wider uppercase text-emerald-100">
                Barcode Ditemukan
              </span>
              <span className="text-base font-black font-mono tracking-widest">
                {foundCode}
              </span>
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

        {/* Tombol Bantuan Jika Kamera Terkunci / Izin Belum Aktif */}
        {errorMessage && (
          <button
            type="button"
            onClick={refreshCamera}
            className="mt-3 pointer-events-auto px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg flex items-center gap-2 active:scale-95 transition"
          >
            <RefreshCw className="w-4 h-4" />
            Nyalakan Ulang Kamera
          </button>
        )}
      </div>

      {/* HEADER TOP CONTROLS */}
      <div className="absolute top-3 left-3 right-3 flex items-center justify-between z-30 pointer-events-auto">
        <div className="flex items-center gap-2 bg-black/70 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/15 text-white">
          <div className={`w-2 h-2 rounded-full ${isReady ? "bg-emerald-400 animate-ping" : "bg-amber-400 animate-pulse"}`} />
          <span className="text-[11px] font-bold tracking-wide uppercase text-slate-200">
            {facingMode === "environment" ? "Kamera Belakang" : "Kamera Depan"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={refreshCamera}
            className="p-2 rounded-full bg-black/60 backdrop-blur-md border border-white/15 text-white hover:bg-white/20 transition active:scale-95"
            title="Segarkan / Nyalakan Ulang Kamera"
          >
            <RefreshCw className="w-4 h-4 text-emerald-400" />
          </button>

          <button
            type="button"
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-2 rounded-full bg-black/60 backdrop-blur-md border border-white/15 text-white hover:bg-white/20 transition active:scale-95"
            title={soundEnabled ? "Matikan Suara Beep" : "Nyalakan Suara Beep"}
          >
            {soundEnabled ? (
              <Volume2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <VolumeX className="w-4 h-4 text-slate-400" />
            )}
          </button>

          {hasTorch && facingMode === "environment" && (
            <button
              type="button"
              onClick={toggleTorch}
              className={`p-2 rounded-full backdrop-blur-md border transition active:scale-95 ${
                torchOn
                  ? "bg-amber-400 text-slate-950 border-amber-300 shadow-[0_0_15px_rgba(251,191,36,0.5)]"
                  : "bg-black/60 border-white/15 text-white hover:bg-white/20"
              }`}
              title={torchOn ? "Matikan Senter" : "Nyalakan Senter"}
            >
              {torchOn ? (
                <FlashlightOff className="w-4 h-4" />
              ) : (
                <Flashlight className="w-4 h-4" />
              )}
            </button>
          )}

          <button
            type="button"
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

      <style jsx global>{`
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
