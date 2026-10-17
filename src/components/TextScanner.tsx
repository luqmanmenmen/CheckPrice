/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useRef, useState } from "react";
import Tesseract from "tesseract.js";
import { Loader2, Flashlight, FlashlightOff, CheckCircle2, DownloadCloud } from "lucide-react";
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
  const debugCanvasRef = useRef<HTMLCanvasElement>(null);
  const workerRef = useRef<Tesseract.Worker | null>(null);
  const isHandlingResult = useRef(false);
  const blacklistedSkus = useRef<Set<string>>(new Set());
  const streamRef = useRef<MediaStream | null>(null);

  const [status, setStatus] = useState("Memulai Kamera & AI...");
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [foundSku, setFoundSku] = useState<string | null>(null);
  const [scanFeedback, setScanFeedback] = useState<"idle" | "wrong_target">("idle");
  const [isSyncing, setIsSyncing] = useState(false);



  // Status Lifecycle & Hemat Baterai (Zero-Drain saat Minimize, Instan saat Buka)
  const isTabActiveRef = useRef(true);
  const isProcessingFrameRef = useRef(false);
  const loopTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  function scheduleNextFrame(delayMs = 100) {
    if (!isTabActiveRef.current || isHandlingResult.current) return;
    if (loopTimeoutRef.current) {
      clearTimeout(loopTimeoutRef.current);
    }
    loopTimeoutRef.current = setTimeout(() => {
      requestAnimationFrame(processFrame);
    }, delayMs);
  }

  // Main Processing Loop
  async function processFrame() {
    if (!isTabActiveRef.current || isHandlingResult.current || !workerRef.current || !videoRef.current || !canvasRef.current) return;
    if (isProcessingFrameRef.current) return;

    const video = videoRef.current;
    if (video.paused || video.ended || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      if (video.paused && isTabActiveRef.current) {
        video.play().catch(() => {});
      }
      scheduleNextFrame(200);
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      scheduleNextFrame(200);
      return;
    }

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (vw === 0 || vh === 0) {
      scheduleNextFrame(200);
      return;
    }

    isProcessingFrameRef.current = true;
    const frameStartTime = Date.now();

    // ROI Box (Tengah) — Hanya 15% dari tinggi video (hemat CPU & baterai)
    const roiWidth = vw * 0.8;
    const roiHeight = Math.max(vh * 0.15, 60); // min 60px height
    const startX = (vw - roiWidth) / 2;
    const startY = (vh - roiHeight) / 2;

    canvas.width = roiWidth;
    canvas.height = roiHeight;

    // Draw frame ROI to canvas
    ctx.drawImage(video, startX, startY, roiWidth, roiHeight, 0, 0, roiWidth, roiHeight);

    // Binarization (Hitam Putih Murni) berdasarkan rata-rata cahaya (Luminance)
    const imageData = ctx.getImageData(0, 0, roiWidth, roiHeight);
    const data = imageData.data;
    let totalLuminance = 0;

    for (let i = 0; i < data.length; i += 4) {
        const lum = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2]; 
        totalLuminance += lum;
    }
    const avgLuminance = totalLuminance / (roiWidth * roiHeight);
    const threshold = avgLuminance * 0.85; // Sedikit lebih gelap dari rata-rata agar tinta hitam terpisah jelas

    for (let i = 0; i < data.length; i += 4) {
        const lum = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
        const value = lum < threshold ? 0 : 255; 
        data[i] = data[i+1] = data[i+2] = value;
    }
    ctx.putImageData(imageData, 0, 0);

    // Optional debug view
    if (debugCanvasRef.current) {
        const dctx = debugCanvasRef.current.getContext("2d");
        if (dctx) {
            debugCanvasRef.current.width = roiWidth;
            debugCanvasRef.current.height = roiHeight;
            dctx.putImageData(imageData, 0, 0);
        }
    }

    try {
      // Cek apakah tab diminimize saat binarisasi
      if (!isTabActiveRef.current) return;

      // Timeout safeguard 1200ms: jika OCR macet/phone lag saat minimize, buang frame lama
      const recognizePromise = workerRef.current.recognize(canvas);
      const timeoutPromise = new Promise<{ isTimeout: true }>((resolve) =>
        setTimeout(() => resolve({ isTimeout: true }), 1200)
      );

      const result = await Promise.race([recognizePromise, timeoutPromise]);

      // Jika tab sudah diminimize atau frame kadaluwarsa (> 1.5 detik), buang hasil frame ini
      if (!isTabActiveRef.current || (Date.now() - frameStartTime > 1500) || ("isTimeout" in (result as any))) {
        return;
      }

      const recognizeResult = result as Tesseract.RecognizeResult;
      const text = recognizeResult.data.text.toUpperCase();
      
      // LOGIKA CERDAS V3: Analisis Baris per Baris (Anti-Barcode & Anti-Artikel)
      // Pecah teks berdasarkan newline atau spasi yang terlalu lebar (karena kadang nyambung jadi satu baris)
      const lines = text.replace(/\s{2,}/g, '\n').split('\n');
      const valid8Digits: string[] = [];
      let detectedWrong = false;
      
      for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          
          // FILTER ANTI-ARTIKEL (KODE PABRIK): Misal "605-12218278" atau "605 12218278"
          if (/\b\d{3}\s*[-]?\s*\d{8}\b/.test(trimmed)) {
              detectedWrong = true;
              continue; 
          }

          // 1. Buang semua huruf/simbol, ambil murni angkanya saja dalam baris ini
          const digits = trimmed.replace(/\D/g, '');
          
          // 2. FILTER ANTI-BARCODE: 
          if (digits.length >= 12 && digits.length <= 14) {
              detectedWrong = true;
              continue;
          }
          
          // 3. FILTER ANTI-HARGA:
          if (trimmed.includes('RP') || digits === '129900') continue;
          
          // 4. TANGKAP SKU:
          if (digits.length === 8) {
              valid8Digits.push(digits);
          } else if (digits.length > 8 && digits.length <= 22) {
              valid8Digits.push(digits.slice(-8));
          }
      }

      // 5. Eksekusi SKU Terakhir yang Valid
      let validSku = null;
      if (valid8Digits.length > 0) {
          const finalSku = valid8Digits[valid8Digits.length - 1];
          if (blacklistedSkus.current.has(finalSku)) {
              detectedWrong = true;
          } else {
              validSku = finalSku;
          }
      }

      if (validSku) {
          handleSuccess(validSku);
          return;
      }

      // Jika membaca *sesuatu* tapi bukan SKU, beri feedback merah
      if (detectedWrong || lines.length > 0) {
          setScanFeedback("wrong_target");
          setTimeout(() => setScanFeedback("idle"), 800);
      }
    } catch (err) {
      console.error("OCR Check Error", err);
    } finally {
      isProcessingFrameRef.current = false;
      if (isTabActiveRef.current && !isHandlingResult.current) {
        scheduleNextFrame(100);
      }
    }
  }

  async function handleSuccess(sku: string) {
    if (isHandlingResult.current) return;
    isHandlingResult.current = true;
    
    setStatus(`Memverifikasi SKU ${sku}...`);

    try {
      // 100% Offline check via IndexedDB (0.01 detik!)
      let product = await db.products.get(sku);
      
      // Fallback: Jika belum ada di IndexedDB lokal (misal di browser kiosk public),
      // cek via API server agar tidak salah memblokir SKU yang valid
      if (!product) {
        try {
          const res = await fetch(`/api/product/${encodeURIComponent(sku)}?page=1`);
          if (res.ok) {
            const data = await res.json();
            if (data && (data.data || (Array.isArray(data) && data.length > 0))) {
              product = data.data || data[0];
            }
          }
        } catch {
          // Abaikan kesalahan koneksi
        }
      }

      if (!product) {
        blacklistedSkus.current.add(sku);
        setTimeout(() => blacklistedSkus.current.delete(sku), 2500);
        setScanFeedback("wrong_target");
        setStatus(`SKU ${sku} tidak ada, mencari lagi...`);
        setTimeout(() => setScanFeedback("idle"), 800);
        isHandlingResult.current = false;
        scheduleNextFrame(100);
        return;
      }
    } catch (e) {
      console.error("DB Check error", e);
    }
    
    setFoundSku(sku);
    setStatus(`Berhasil ditemukan: ${sku}`);
    
    let snapshot = undefined;
    if (videoRef.current && canvasRef.current) {
        const ctx = canvasRef.current.getContext("2d");
        if (ctx) {
            canvasRef.current.width = videoRef.current.videoWidth;
            canvasRef.current.height = videoRef.current.videoHeight;
            ctx.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
            snapshot = canvasRef.current.toDataURL("image/jpeg", 0.6);
        }
    }

    // Hentikan proses & kamera
    if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
    }

    setTimeout(() => {
       onScanResult(sku, { text: sku, bbox: {x0:0,y0:0,x1:0,y1:0}, rawText: sku }, snapshot);
    }, 800);
  }

  useEffect(() => {
    let isMounted = true;

    const startCamera = async () => {
      try {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
        }
        setStatus("Membuka Kamera...");
        const localStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }
        });

        if (isMounted && videoRef.current) {
          streamRef.current = localStream;
          videoRef.current.srcObject = localStream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play().catch(() => {});
            setStatus("Arahkan SKU ke garis merah");
            scheduleNextFrame(100);
          };

          const track = localStream.getVideoTracks()[0];
          if (track) {
            const capabilities = track.getCapabilities() as any;
            if (capabilities?.torch) setHasTorch(true);
          }
        }
      } catch (err) {
        console.error("Camera Init Error:", err);
        if (isMounted) setStatus("Gagal memuat kamera. Pastikan izin kamera diberikan.");
      }
    };

    const initAll = async () => {
      try {
        setStatus("Memuat AI Scanner Tercepat...");
        const worker = await Tesseract.createWorker("eng");
        await worker.setParameters({
          tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789- '
        });
        if (isMounted) workerRef.current = worker;

        await startCamera();
      } catch (err) {
        console.error("Init Error:", err);
        if (isMounted) setStatus("Gagal inisialisasi AI Scanner.");
      }
    };

    initAll();

    // Listener Visibility Change: Bangun seketika saat dibuka, Hemat Baterai (0% CPU) saat minimize
    const handleVisibilityChange = async () => {
      if (document.visibilityState === "visible") {
        isTabActiveRef.current = true;

        // 1. Pastikan video langsung diputar kembali
        if (videoRef.current && videoRef.current.paused) {
          videoRef.current.play().catch(() => {});
        }

        // 2. Periksa apakah track kamera dihentikan oleh OS HP saat minimize
        const tracks = streamRef.current?.getVideoTracks();
        const isTrackAlive = tracks && tracks.length > 0 && tracks[0].readyState === "live";

        if (!isTrackAlive) {
          console.log("[TextScanner] Camera track ended by mobile OS, restarting camera stream...");
          await startCamera();
        } else {
          // 3. Bangunkan loop pemrosesan seketika tanpa refresh
          if (!isProcessingFrameRef.current && !isHandlingResult.current) {
            scheduleNextFrame(50);
          }
        }
      } else {
        // Tab minimize / screen off: tidurkan pemrosesan sepenuhnya (Zero Battery Drain)
        isTabActiveRef.current = false;
        if (loopTimeoutRef.current) {
          clearTimeout(loopTimeoutRef.current);
          loopTimeoutRef.current = null;
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isMounted = false;
      isTabActiveRef.current = false;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (loopTimeoutRef.current) {
        clearTimeout(loopTimeoutRef.current);
        loopTimeoutRef.current = null;
      }
      if (workerRef.current) workerRef.current.terminate();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (track) {
        try {
            await track.applyConstraints({
                advanced: [{ torch: !torchOn } as any]
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
      <div className={`relative rounded-3xl overflow-hidden shadow-2xl border-4 transition-colors duration-300 bg-black ${
         foundSku ? "border-green-500" :
         scanFeedback === "wrong_target" ? "border-red-500" :
         "border-slate-800"
      }`}>
        
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
             <div className={`absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 transition-colors duration-300 ${scanFeedback === 'wrong_target' ? 'border-red-600' : 'border-red-500'} rounded-tl-lg`}></div>
             <div className={`absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 transition-colors duration-300 ${scanFeedback === 'wrong_target' ? 'border-red-600' : 'border-red-500'} rounded-tr-lg`}></div>
             <div className={`absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 transition-colors duration-300 ${scanFeedback === 'wrong_target' ? 'border-red-600' : 'border-red-500'} rounded-bl-lg`}></div>
             <div className={`absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 transition-colors duration-300 ${scanFeedback === 'wrong_target' ? 'border-red-600' : 'border-red-500'} rounded-br-lg`}></div>

             {/* Garis Merah Laser Animasi dengan Gradient (Kaya Scanner Beneran) */}
             <div className="w-full h-[4px] bg-gradient-to-b from-transparent via-red-500 to-transparent absolute top-0 shadow-[0_0_15px_rgba(239,68,68,1)] animate-scan z-20"></div>
             
             {/* Efek Flash Merah saat Gagal Deteksi */}
             {scanFeedback === "wrong_target" && (
                 <div className="absolute inset-0 bg-red-500/20 animate-pulse z-10"></div>
             )}
          </div>
        )}

        {/* Hidden Canvas OCR & Debug */}
        <canvas ref={canvasRef} className="hidden" />
        <canvas ref={debugCanvasRef} className="absolute bottom-2 right-2 w-24 h-8 border border-white/30 rounded object-contain bg-black z-20 hidden" />

        {/* Tombol Flash */}
        {hasTorch && !foundSku && (
           <button 
             onClick={toggleTorch}
             className="absolute top-4 right-4 z-50 bg-black/50 backdrop-blur-md p-3 rounded-full text-white border border-white/20 active:scale-95 transition-all"
           >
              {torchOn ? <Flashlight className="w-5 h-5 text-yellow-400" /> : <FlashlightOff className="w-5 h-5" />}
           </button>
        )}
      </div>
      
      {/* Indikator Status */}
      <div className="flex justify-center z-10 w-full mt-2">
        <div className="bg-white/95 backdrop-blur-xl shadow-lg rounded-2xl p-4 w-full text-center border border-slate-200 flex flex-col items-center gap-2 transform transition-all duration-300 relative">
          
          {isSyncing && (
             <div className="absolute -top-3 right-4 bg-indigo-100 text-indigo-700 text-[9px] font-bold px-2 py-0.5 rounded-full border border-indigo-200 flex items-center gap-1 shadow-sm">
                <DownloadCloud className="w-3 h-3 animate-pulse" /> Sync Database
             </div>
          )}

          {foundSku ? (
            <>
               <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-1">
                  <CheckCircle2 className="w-7 h-7 text-green-600" />
               </div>
               <p className="font-black text-xl text-slate-800">{foundSku}</p>
               <p className="text-xs text-green-600 font-bold">Memuat Detail...</p>
            </>
          ) : (
            <>
               <div className={`flex items-center gap-2 font-bold mb-1 ${scanFeedback === 'wrong_target' ? 'text-red-600' : 'text-blue-600'}`}>
                  <Loader2 className={`w-4 h-4 ${scanFeedback === 'wrong_target' ? '' : 'animate-spin'}`} />
                  <span>{scanFeedback === 'wrong_target' ? 'Salah Fokus!' : 'Memindai SKU...'}</span>
               </div>
               <p className="text-xs text-slate-600 font-medium leading-tight">
                 Arahkan <strong className="text-slate-800">Angka SKU (8 Digit)</strong> persis ke garis merah
               </p>
               <p className="text-[10px] text-slate-400 mt-1">{status}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
