/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useRef, useState } from "react";
import Tesseract from "tesseract.js";
import { Loader2, Flashlight, FlashlightOff, CheckCircle2, DownloadCloud } from "lucide-react";
import Dexie from "dexie";

// --- Setup Dexie Database ---
class SukoDatabase extends Dexie {
  products!: Dexie.Table<{
    sku: string;
    name: string;
    color: string;
    size: string;
    hargaNormal: number;
    hargaPromo: number | null;
    toDate: string | null;
  }, string>;

  constructor() {
    super("SukoScannerDB");
    this.version(2).stores({
      products: 'sku, name, color, size, hargaNormal, hargaPromo, toDate' 
    });
  }
}

const db = new SukoDatabase();

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

  // Background Sync Data (Smart Version Check)
  useEffect(() => {
    async function syncData() {
      try {
        const count = await db.products.count();
        const localVersion = localStorage.getItem("suko_server_version");
        
        // Cek ke server apakah ada update PQ/Promo terbaru (Sangat cepat < 50ms)
        const checkRes = await fetch('/api/check-update');
        const checkData = await checkRes.json();
        
        if (checkData.success) {
          const serverVersion = checkData.lastUpdate.toString();
          
          // Jika versi server lebih baru dari versi HP, atau DB di HP kosong, wajib download "makanan matang"
          if (localVersion !== serverVersion || count < 1000) {
            
            // Tampilkan indikator loading jika ini adalah download pertama kali (kosong)
            if (count < 1000) setIsSyncing(true);
            
            const res = await fetch('/api/export-products');
            const result = await res.json();
            
            if (result.success && result.data) {
              await db.products.clear();
              await db.products.bulkPut(result.data);
              localStorage.setItem("suko_server_version", serverVersion);
              console.log("Offline Database Updated to version:", serverVersion);
            }
          }
        }
      } catch (e) {
        console.error("Failed to sync offline DB", e);
      } finally {
        setIsSyncing(false);
      }
    }
    
    syncData();
  }, []);

  // Main Processing Loop
  async function processFrame() {
    if (isHandlingResult.current || !workerRef.current || !videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    if (video.paused || video.ended || video.readyState !== video.HAVE_ENOUGH_DATA) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    // Ukuran Video aktual
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    
    // ROI Box (Tengah)
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
      const result = await workerRef.current.recognize(canvas);
      const lines = result.data.text.split('\n').map(l => l.replace(/\s+/g, '').trim()).filter(Boolean);
      
      let validSku = null;
      let detectedWrong = false;

      for (const text of lines) {
          if (text.length >= 12 && text.length <= 14) {
             detectedWrong = true; continue; // It's probably a barcode!
          }
          if (text.length === 8 && /^\d{8}$/.test(text)) {
              if (blacklistedSkus.current.has(text)) {
                 detectedWrong = true;
              } else {
                 validSku = text;
                 break;
              }
          }
      }

      if (validSku) {
          handleSuccess(validSku);
          return;
      }

      if (detectedWrong) {
          setScanFeedback("wrong_target");
          setTimeout(() => setScanFeedback("idle"), 800);
      }
    } catch (err) {
      console.error("OCR Check Error", err);
    }

    // Continue loop
    setTimeout(() => {
        if (!isHandlingResult.current) {
            requestAnimationFrame(processFrame);
        }
    }, 100);
  }

  async function handleSuccess(sku: string) {
    if (isHandlingResult.current) return;
    isHandlingResult.current = true;
    
    setStatus(`Memverifikasi SKU ${sku}...`);

    try {
      // 100% Offline check via IndexedDB (0.01 detik!)
      const product = await db.products.get(sku);
      
      if (!product) {
        blacklistedSkus.current.add(sku);
        setScanFeedback("wrong_target");
        setStatus(`SKU ${sku} tidak ada, mencari lagi...`);
        setTimeout(() => setScanFeedback("idle"), 800);
        isHandlingResult.current = false;
        setTimeout(() => requestAnimationFrame(processFrame), 100);
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
    let localStream: MediaStream | null = null;

    const initAll = async () => {
      try {
        setStatus("Memuat AI Scanner Tercepat...");
        const worker = await Tesseract.createWorker("eng");
        await worker.setParameters({
          tessedit_char_whitelist: '0123456789',
          tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE,
        });
        if (isMounted) workerRef.current = worker;

        setStatus("Membuka Kamera...");
        localStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }
        });
        
        if (isMounted && videoRef.current) {
            streamRef.current = localStream;
            videoRef.current.srcObject = localStream;
            videoRef.current.onloadedmetadata = () => {
                videoRef.current?.play();
                setStatus("Arahkan SKU ke garis merah");
                requestAnimationFrame(processFrame);
            };

            // Check Torch
            const track = localStream.getVideoTracks()[0];
            if (track) {
                const capabilities = track.getCapabilities() as any;
                if (capabilities.torch) setHasTorch(true);
            }
        }
      } catch (err) {
        console.error("Init Error:", err);
        if (isMounted) setStatus("Gagal memuat kamera. Pastikan izin kamera diberikan.");
      }
    };

    initAll();

    return () => {
      isMounted = false;
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

        {/* Kotak ROI (Overlay Tengah) */}
        {!foundSku && (
          <div className="absolute top-1/2 left-[10%] right-[10%] h-[15%] min-h-[60px] -translate-y-1/2 border-2 border-indigo-500 shadow-[0_0_0_9999px_rgba(0,0,0,0.6)] z-10 flex flex-col items-center justify-center pointer-events-none">
             {/* Garis Merah Laser */}
             <div className="w-full h-[1px] bg-red-500/80 absolute top-1/2 -translate-y-1/2 shadow-[0_0_10px_rgba(239,68,68,0.8)]"></div>
             {scanFeedback === "wrong_target" && (
                 <div className="absolute inset-0 bg-red-500/30 animate-pulse"></div>
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
