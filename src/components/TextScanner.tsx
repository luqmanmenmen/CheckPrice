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
  ImagePlus,
  ZoomIn,
  Aperture,
} from "lucide-react";
import {
  applyPixelContrastBoost,
  decodeBarcodeFromCanvas,
  decodeBarcodeFromFile,
  decodeEan13SoftEdgeFromCanvas,
  enableZxingTryHarder,
  isValidGs1CheckDigit,
  isValidMdsSku8,
} from "@/lib/barcodeImageDecoder";

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

const ZOOM_STEPS = [1, 1.5, 2] as const;

function isAppleMobileBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

async function tryApplyHardwareZoom(
  track: MediaStreamTrack | undefined,
  targetZoom: number
): Promise<boolean> {
  if (!track || typeof track.getCapabilities !== "function") return false;
  try {
    const caps = track.getCapabilities() as any;
    const zCap = caps?.zoom;
    if (!zCap || typeof zCap.max !== "number") return false;
    const minZ = typeof zCap.min === "number" ? zCap.min : 1;
    if (targetZoom < minZ || targetZoom > zCap.max) return false;

    await track.applyConstraints({
      advanced: [{ zoom: targetZoom } as any],
    });
    const settings = typeof track.getSettings === "function" ? (track.getSettings() as any) : null;
    if (typeof settings?.zoom === "number") {
      return Math.abs(settings.zoom - targetZoom) <= 0.35;
    }
    return true;
  } catch {
    return false;
  }
}

export default function TextScanner({ onScanResult }: TextScannerProps) {
  const hiddenSinkId = "retail-barcode-decoder-sink";
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const decoderRef = useRef<Html5Qrcode | null>(null);
  const nativeDetectorRef = useRef<any>(null);

  const isHandlingResult = useRef(false);
  const isDecodingFrame = useRef(false);
  const isDecodingImageRef = useRef(false);
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
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const [isDecodingImage, setIsDecodingImage] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [restartTrigger, setRestartTrigger] = useState(0);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [hwZoomActive, setHwZoomActive] = useState(false);

  const zoomRatioRef = useRef<number>(1);
  const hwZoomActiveRef = useRef<boolean>(false);

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
      const hasNative = Boolean(nativeDetectorRef.current);

      // Di browser tanpa Native BarcodeDetector (mis. iOS Safari), validasi checksum GS1 / SKU 8-digit langsung eksekusi 1 frame
      const requiredFrames = !passesGs1
        ? 4
        : !hasNative && (isStandardMdsEan13 || isStandardMdsSku || isNumeric12Or13)
          ? 1
          : isStandardMdsEan13 || isStandardMdsSku
            ? 2
            : 3;
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
          useBarCodeDetectorIfSupported: false,
          verbose: false,
        });
        enableZxingTryHarder(decoderRef.current);
      }
    } catch (e) {
      console.warn("Init ZXing decoder fallback warning:", e);
    }
  }, []);

  // Inisialisasi & Start Kamera Native <video> (4-Tier Fallback Anti-Black-Page + 60 FPS Smooth Preview!)
  useEffect(() => {
    let isMounted = true;
    let scanTimerId: ReturnType<typeof setTimeout> | null = null;
    let watchdogId: ReturnType<typeof setTimeout> | null = null;

    isHandlingResult.current = false;
    isDecodingFrame.current = false;
    lastCandidateRef.current = { code: "", count: 0, ts: 0 };

    const acquireCameraStream = async (): Promise<MediaStream> => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Browser tidak mendukung akses kamera.");
      }

      // TIER 1: Kamera HD 720p @ 60fps ideal (preview super mulus 60 FPS & tajam untuk barcode, jauh lebih ringan dari 1080p)
      try {
        return await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 60, min: 30 },
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

        // Aktifkan Continuous Autofocus, Zoom iPhone, & Cek Fitur Senter (Torch)
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

        // Pada kamera belakang iPhone Safari (lensa 1x jarak fokus minimum ~18-20cm), preset 1.5x zoom membantu agar tag baju terbaca tajam
        const initialZoom = facingMode === "environment" && isAppleMobileBrowser() ? 1.5 : 1;
        zoomRatioRef.current = initialZoom;
        setZoomLevel(initialZoom);
        if (initialZoom > 1) {
          const hwOk = await tryApplyHardwareZoom(track, initialZoom);
          if (isMounted) {
            hwZoomActiveRef.current = hwOk;
            setHwZoomActive(hwOk);
          }
        } else {
          hwZoomActiveRef.current = false;
          setHwZoomActive(false);
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

    // Adaptive Non-Blocking Decoder Loop (bebas main-thread stutter, animasi laser & preview 60 FPS mulus!)
    const scheduleNextTick = (delayMs: number) => {
      if (!isMounted || isHandlingResult.current) return;
      scanTimerId = setTimeout(() => {
        void decodeFrameTick();
      }, delayMs);
    };

    const decodeFrameTick = async () => {
      if (!isMounted || isHandlingResult.current) return;
      if (isDecodingFrame.current || isDecodingImageRef.current || !videoRef.current || !canvasRef.current) {
        scheduleNextTick(120);
        return;
      }

      const video = videoRef.current;
      if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
        scheduleNextTick(150);
        return;
      }

      isDecodingFrame.current = true;
      const tickStart = typeof performance !== "undefined" ? performance.now() : Date.now();
      const pass = ++scanPassCounter.current;
      const hasNative = Boolean(nativeDetectorRef.current);

      try {
        // JALUR KILAT GPU HARDWARE (0 drawImage, 0 copy piksel CPU!):
        // Bila HP mendukung Native BarcodeDetector, langsung deteksi dari elemen <video> di GPU!
        if (hasNative && !(!hwZoomActiveRef.current && zoomRatioRef.current > 1)) {
          try {
            const directCodes = await nativeDetectorRef.current.detect(video);
            if (directCodes && directCodes.length > 0 && directCodes[0].rawValue) {
              await handleBarcodeDetected(directCodes[0].rawValue);
              if (isHandlingResult.current) return;
            }
          } catch {}
          // Jika Native GPU aktif, cukup jalankan fallback canvas CPU hanya 1x setiap 4 tick agar HP tetap dingin & 60 FPS!
          if (pass % 4 !== 0) {
            return;
          }
        }

        const vw = video.videoWidth;
        const vh = video.videoHeight;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;

        // Jika zoom digital aktif (hardware zoom tidak didukung browser/iOS lama), persempit area crop agar sesuai kotak bidik
        const digitalZoom = hwZoomActiveRef.current ? 1 : Math.max(1, zoomRatioRef.current);
        const passMode = pass % 4;

        if (passMode === 3) {
          // Pass 3: Rotasi 90 derajat untuk barcode vertikal / miring di hangtag (kanvas ringan maks 640px)
          const cropW = Math.max(120, Math.floor((vw * 0.56) / digitalZoom));
          const cropH = Math.max(120, Math.floor((vh * 0.72) / digitalZoom));
          const sx = Math.floor((vw - cropW) / 2);
          const sy = Math.floor((vh - cropH) / 2);

          const drawW = Math.min(640, cropW);
          const drawH = Math.max(120, Math.floor(cropH * (drawW / cropW)));
          if (canvas.width !== drawH) canvas.width = drawH;
          if (canvas.height !== drawW) canvas.height = drawW;

          ctx.save();
          ctx.translate(drawH / 2, drawW / 2);
          ctx.rotate(Math.PI / 2);
          ctx.drawImage(video, sx, sy, cropW, cropH, -drawW / 2, -drawH / 2, drawW, drawH);
          ctx.restore();

          const softRotated = decodeEan13SoftEdgeFromCanvas(canvas, 2);
          if (softRotated) {
            await handleBarcodeDetected(softRotated);
            if (isHandlingResult.current) return;
          }
          applyPixelContrastBoost(ctx, drawH, drawW);
        } else {
          // Pass 0 & 1: fokus pita horizontal tengah; Pass 2: area tengah lebih luas (maks 720px = 2.4x lebih ringan dari 1120px!)
          const cropW = Math.max(160, Math.floor((vw * 0.88) / digitalZoom));
          const cropH = Math.max(
            120,
            Math.floor((vh * (passMode === 2 ? 0.64 : 0.4)) / digitalZoom)
          );
          const sx = Math.floor((vw - cropW) / 2);
          const sy = Math.floor((vh - cropH) / 2);

          const targetW = Math.min(720, cropW);
          const targetH = Math.max(120, Math.floor(cropH * (targetW / cropW)));

          if (canvas.width !== targetW) canvas.width = targetW;
          if (canvas.height !== targetH) canvas.height = targetH;

          ctx.drawImage(video, sx, sy, cropW, cropH, 0, 0, targetW, targetH);

          // Dekoder Sub-Pixel Soft-Edge EAN-13 (~2ms di 720px) sebelum hard-contrast boost
          const softEan = decodeEan13SoftEdgeFromCanvas(canvas, 2);
          if (softEan) {
            await handleBarcodeDetected(softEan);
            if (isHandlingResult.current) return;
          }

          // Hanya jalankan contrast boost pada Pass 2 agar main thread tidak pernah tersedak
          if (passMode === 2) {
            applyPixelContrastBoost(ctx, targetW, targetH);
          }
        }

        // 1. Coba Native BarcodeDetector pada area crop/zoom jika tersedia
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
        const elapsed = (typeof performance !== "undefined" ? performance.now() : Date.now()) - tickStart;
        // Beri ruang napas adaptif agar main thread UI & kamera selalu 60 FPS mulus!
        const nextDelay = hasNative ? Math.max(90, 120 - elapsed) : Math.max(110, Math.min(220, elapsed + 95));
        scheduleNextTick(nextDelay);
      }
    };

    startNativeVideoCamera();
    scheduleNextTick(180);

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
      if (scanTimerId) clearTimeout(scanTimerId);
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

  // Siklus Zoom Kamera 1x -> 1.5x -> 2x (otomatis hardware zoom atau crop digital presisi di iPhone)
  const cycleZoomLevel = async () => {
    const idx = ZOOM_STEPS.indexOf(zoomLevel as (typeof ZOOM_STEPS)[number]);
    const nextZoom = ZOOM_STEPS[(idx + 1) % ZOOM_STEPS.length];
    zoomRatioRef.current = nextZoom;
    setZoomLevel(nextZoom);

    const track = streamRef.current?.getVideoTracks()?.[0];
    const hwOk = await tryApplyHardwareZoom(track, nextZoom);
    hwZoomActiveRef.current = hwOk;
    setHwZoomActive(hwOk);
  };

  // Jepret 1 frame resolusi penuh & jalankan 8 variasi dekoder (rotasi/kontras/quiet-zone) untuk kasus membandel
  const captureAndDecodeFrame = useCallback(async () => {
    if (isHandlingResult.current || isDecodingImageRef.current) return;
    const video = videoRef.current;
    if (!video || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
      setUploadNotice("Kamera belum siap. Tunggu gambar tampil lalu tekan Jepret & Scan.");
      return;
    }

    isDecodingImageRef.current = true;
    setIsDecodingImage(true);
    setUploadNotice(null);
    setStatus("Menganalisa foto frame kamera...");

    const snapCanvas = document.createElement("canvas");
    try {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const digitalZoom = hwZoomActiveRef.current ? 1 : Math.max(1, zoomRatioRef.current);
      const cropW = Math.max(200, Math.floor((vw * 0.92) / digitalZoom));
      const cropH = Math.max(200, Math.floor((vh * 0.8) / digitalZoom));
      const sx = Math.floor((vw - cropW) / 2);
      const sy = Math.floor((vh - cropH) / 2);

      snapCanvas.width = cropW;
      snapCanvas.height = cropH;
      const ctx = snapCanvas.getContext("2d", { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(video, sx, sy, cropW, cropH, 0, 0, cropW, cropH);
        const decodedCode = await decodeBarcodeFromCanvas(snapCanvas, {
          nativeDetector: nativeDetectorRef.current,
          zxingShim: (decoderRef.current as any)?.qrcode,
        });
        if (decodedCode) {
          commitValidBarcode(decodedCode);
          return;
        }
      }

      setUploadNotice(
        "Barcode belum terbaca. Coba ketuk 1.5x/2x zoom & jauhkan HP ~18cm agar fokus, atau upload foto."
      );
      setStatus("Coba 1.5x/2x Zoom atau Jauhkan Sedikit Agar Fokus");
    } catch {
      setUploadNotice("Gagal memproses jepretan kamera. Coba lagi.");
      setStatus("Gagal Memproses Frame");
    } finally {
      snapCanvas.width = 0;
      snapCanvas.height = 0;
      isDecodingImageRef.current = false;
      setIsDecodingImage(false);
    }
  }, [commitValidBarcode]);

  const resetCameraUi = (nextFacing: "environment" | "user") => {
    setErrorMessage(null);
    setFoundCode(null);
    setIsReady(false);
    setHasTorch(false);
    setTorchOn(false);
    hwZoomActiveRef.current = false;
    setHwZoomActive(false);
    zoomRatioRef.current = 1;
    setZoomLevel(1);
    setStatus(
      nextFacing === "environment"
        ? "Menyalakan Kamera Belakang..."
        : "Menyalakan Kamera Depan..."
    );
  };

  // Toggle Switch Kamera (Belakang <-> Depan)
  const switchCamera = () => {
    const nextFacing = facingMode === "environment" ? "user" : "environment";
    resetCameraUi(nextFacing);
    setFacingMode(nextFacing);
  };

  // Segarkan Kamera Manual (1-Klik Anti Black Screen)
  const refreshCamera = () => {
    resetCameraUi(facingMode);
    setRestartTrigger((prev) => prev + 1);
  };

  // Dekode barcode otomatis dari file gambar galeri / screenshot / clipboard (gaya QRIS)
  const processImageFile = useCallback(
    async (file: File) => {
      if (isHandlingResult.current || isDecodingImageRef.current) return;
      if (!file.type.startsWith("image/") && !/\.(png|jpe?g|webp|gif|bmp|heic|heif)$/i.test(file.name)) {
        setUploadNotice("Pilih file gambar (JPG, PNG, WEBP, HEIC) yang berisi barcode.");
        return;
      }

      isDecodingImageRef.current = true;
      setIsDecodingImage(true);
      setUploadNotice(null);
      setStatus("Membaca barcode dari gambar...");

      try {
        const decodedCode = await decodeBarcodeFromFile(file, {
          nativeDetector: nativeDetectorRef.current,
          zxingShim: (decoderRef.current as any)?.qrcode,
          html5Qrcode: decoderRef.current,
        });

        if (decodedCode) {
          commitValidBarcode(decodedCode);
          return;
        }

        setUploadNotice("Barcode tidak terbaca di gambar. Coba gambar lebih dekat / terang.");
        setStatus("Arahkan Garis Barcode atau Upload Gambar Lain");
      } catch {
        setUploadNotice("Gagal memproses gambar. Coba pilih file gambar lain.");
        setStatus("Gagal Memproses Gambar");
      } finally {
        isDecodingImageRef.current = false;
        setIsDecodingImage(false);
      }
    },
    [commitValidBarcode]
  );

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) {
      void processImageFile(file);
    }
  };

  // Dukungan Paste Screenshot (Ctrl+V) langsung di layar scanner
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (isHandlingResult.current) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith("image/")) {
          const pastedFile = items[i].getAsFile();
          if (pastedFile) {
            e.preventDefault();
            void processImageFile(pastedFile);
            return;
          }
        }
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [processImageFile]);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!isDraggingFile) setIsDraggingFile(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setIsDraggingFile(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDraggingFile(false);
        const droppedFile = e.dataTransfer?.files?.[0];
        if (droppedFile) void processImageFile(droppedFile);
      }}
      className={`relative w-full h-full min-h-[360px] flex flex-col items-center justify-center bg-black overflow-hidden select-none rounded-2xl transition ${
        isDraggingFile ? "ring-4 ring-emerald-400/80" : ""
      }`}
    >
      {/* Input File Tersembunyi untuk Upload Gambar Barcode (Galeri / Screenshot) */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileInputChange}
        className="hidden"
      />

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
        style={{
          transform: !hwZoomActive && zoomLevel > 1 ? `scale(${zoomLevel}) translateZ(0)` : "translateZ(0)",
          transformOrigin: "center center",
          willChange: "transform",
        }}
        className="absolute inset-0 w-full h-full object-cover bg-black z-0 transition-transform duration-200"
      />

      {/* OVERLAY VIEWFINDER KASIR MODERN (100% GPU Composited 60 FPS — Tanpa backdrop-filter berat di atas video!) */}
      <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-4 z-10">
        {/* Kotak Bidik Barcode (Horizontal Rectangular Viewfinder) */}
        <div className="relative w-[88%] max-w-[360px] h-36 sm:h-40 border-2 border-emerald-400/85 rounded-2xl shadow-[0_0_24px_rgba(16,185,129,0.28)] flex items-center justify-center overflow-hidden">
          {/* Garis Laser Horizontal 60 FPS Murni GPU (`transform: translate3d`) */}
          <div className="absolute inset-x-0 top-2 bottom-2 pointer-events-none overflow-hidden">
            <div className="w-full h-full animate-laser-gpu">
              <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_12px_#34d399]" />
            </div>
          </div>

          {/* Siku Sudut Kotak Bidik (Corner Accents) */}
          <div className="absolute top-0 left-0 w-5 h-5 border-t-4 border-l-4 border-emerald-400 rounded-tl-xl" />
          <div className="absolute top-0 right-0 w-5 h-5 border-t-4 border-r-4 border-emerald-400 rounded-tr-xl" />
          <div className="absolute bottom-0 left-0 w-5 h-5 border-b-4 border-l-4 border-emerald-400 rounded-bl-xl" />
          <div className="absolute bottom-0 right-0 w-5 h-5 border-b-4 border-r-4 border-emerald-400 rounded-br-xl" />

          {/* Ikon Barcode Halus di Background Bidik */}
          <Barcode className="w-16 h-16 text-emerald-400/20" />

          {/* Overlay Saat Memproses Gambar Upload */}
          {isDecodingImage && !foundCode && (
            <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-xs flex flex-col items-center justify-center text-white z-20 gap-2">
              <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
              <span className="text-xs font-bold text-emerald-200 tracking-wide">
                Membaca Barcode dari Gambar...
              </span>
            </div>
          )}

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
            <span>
              {isDraggingFile
                ? "Lepaskan gambar untuk langsung scan barcode"
                : "Posisikan barcode di kotak atau upload gambar di bawah"}
            </span>
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

        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={cycleZoomLevel}
            className={`px-2.5 py-1.5 rounded-full backdrop-blur-md border text-[11px] font-black tracking-tight transition active:scale-95 flex items-center gap-1 ${
              zoomLevel > 1
                ? "bg-emerald-500/90 border-emerald-300 text-slate-950 shadow-[0_0_12px_rgba(16,185,129,0.45)]"
                : "bg-black/60 border-white/15 text-white hover:bg-white/20"
            }`}
            title="Atur Zoom Kamera (1x / 1.5x / 2x agar fokus barcode lebih tajam di iPhone)"
          >
            <ZoomIn className="w-3.5 h-3.5" />
            <span>{zoomLevel}x</span>
          </button>

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

      {/* FOOTER BOTTOM CONTROLS (GAYA QRIS: UPLOAD GAMBAR + STATUS) */}
      <div className="absolute bottom-4 left-4 right-4 flex flex-col items-center justify-center gap-2 z-30 pointer-events-auto">
        {uploadNotice && (
          <button
            type="button"
            onClick={() => setUploadNotice(null)}
            className="w-full max-w-sm bg-amber-950/95 border border-amber-500/50 text-amber-200 px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 shadow-xl text-left"
          >
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="flex-1">{uploadNotice}</span>
          </button>
        )}

        <div className="w-full max-w-sm grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={captureAndDecodeFrame}
            disabled={isDecodingImage || !isReady}
            className="py-2.5 px-3 rounded-2xl bg-sky-500 hover:bg-sky-400 active:scale-[0.98] disabled:opacity-55 text-slate-950 font-extrabold text-xs shadow-[0_6px_20px_rgba(14,165,233,0.35)] flex items-center justify-center gap-1.5 transition cursor-pointer"
          >
            {isDecodingImage ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                <span>Analisa...</span>
              </>
            ) : (
              <>
                <Aperture className="w-4 h-4 shrink-0" />
                <span>Jepret & Scan</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isDecodingImage}
            className="py-2.5 px-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] disabled:opacity-60 text-slate-950 font-extrabold text-xs shadow-[0_6px_24px_rgba(16,185,129,0.4)] flex items-center justify-center gap-1.5 transition cursor-pointer"
          >
            <ImagePlus className="w-4 h-4 shrink-0" />
            <span>Upload Foto</span>
          </button>
        </div>

        <div className="w-full max-w-sm bg-slate-900/95 backdrop-blur-md px-4 py-2 rounded-2xl border border-slate-700/80 shadow-2xl flex items-center justify-between">
          <div className="flex items-center gap-2.5 overflow-hidden">
            {!isReady && !errorMessage ? (
              <Loader2 className="w-4 h-4 text-emerald-400 animate-spin shrink-0" />
            ) : errorMessage ? (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            ) : (
              <Camera className="w-4 h-4 text-emerald-400 shrink-0" />
            )}
            <span className="text-xs font-medium text-slate-200 whitespace-normal break-words">
              {errorMessage || status}
            </span>
          </div>

          <div className="shrink-0 flex items-center gap-1.5 ml-2">
            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/80 border border-emerald-800/80 px-2 py-0.5 rounded-full font-bold">
              EAN / QR
            </span>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes laserMoveGpu {
          0% {
            transform: translate3d(0, 0%, 0);
            opacity: 0.35;
          }
          50% {
            opacity: 1;
          }
          100% {
            transform: translate3d(0, 97%, 0);
            opacity: 0.35;
          }
        }
        .animate-laser-gpu {
          will-change: transform, opacity;
          backface-visibility: hidden;
          animation: laserMoveGpu 1.65s ease-in-out infinite alternate;
        }
      `}</style>
    </div>
  );
}
