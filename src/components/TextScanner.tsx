"use client";

import { useEffect, useRef, useState } from "react";
import Tesseract from "tesseract.js";

interface TextScannerProps {
  onScanSuccess: (text: string) => void;
}

interface BoundingBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface DetectedSku {
  text: string;
  bbox: BoundingBox;
}

export default function TextScanner({ onScanSuccess }: TextScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isScanning, setIsScanning] = useState(false);
  const [status, setStatus] = useState("Memulai AI Google Lens...");
  const [detectedSkus, setDetectedSkus] = useState<DetectedSku[]>([]);
  const [scale, setScale] = useState({ x: 1, y: 1 });

  useEffect(() => {
    let stream: MediaStream | null = null;
    let scanInterval: NodeJS.Timeout;
    let worker: Tesseract.Worker | null = null;

    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
             // Calculate scale when video metadata loads
             updateScale();
          };
        }
        setStatus("Mencari angka/huruf SKU di layar...");
        setIsScanning(true);
      } catch (err) {
        console.error("Camera error:", err);
        setStatus("Gagal mengakses kamera. Izinkan akses kamera.");
      }
    };

    const updateScale = () => {
       if (videoRef.current) {
         const v = videoRef.current;
         if (v.videoWidth > 0 && v.videoHeight > 0) {
            setScale({
               x: v.clientWidth / v.videoWidth,
               y: v.clientHeight / v.videoHeight
            });
         }
       }
    };

    window.addEventListener("resize", updateScale);

    const initWorker = async () => {
      try {
        worker = await Tesseract.createWorker("eng");
        startCamera();
      } catch (e) {
        console.error("Tesseract Init Error", e);
        setStatus("Gagal memuat AI Pembaca Teks.");
      }
    };
    initWorker();

    const scanFrame = async () => {
      if (!isScanning || !videoRef.current || !canvasRef.current || !worker) return;
      if (videoRef.current.readyState !== videoRef.current.HAVE_ENOUGH_DATA) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");

      if (!ctx) return;

      // Ensure canvas size matches actual video resolution
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      // Draw frame
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // --- Pre-processing for Excel Screens (Grayscale & Contrast) ---
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;
      for (let i = 0; i < data.length; i += 4) {
         const r = data[i];
         const g = data[i + 1];
         const b = data[i + 2];
         // Luma grayscale
         const gray = 0.299 * r + 0.587 * g + 0.114 * b;
         // Increase contrast (thresholding to make black text on white background pop)
         const threshold = gray > 140 ? 255 : 0; 
         data[i] = data[i + 1] = data[i + 2] = threshold;
      }
      ctx.putImageData(imgData, 0, 0);

      try {
        setIsScanning(false);
        const result: any = await worker.recognize(canvas);
        const words: any[] = result.data.words || [];
        
        updateScale(); // Ensure scale is fresh

        const found: DetectedSku[] = [];
        
        words.forEach((word: any) => {
           const cleanedText = word.text.replace(/\n/g, "").trim().toUpperCase();
           // Strict check: SKU is usually numeric (at least 7 chars) or alphanumeric (8+ chars)
           const isLikelySku = /[0-9]/.test(cleanedText) && /^[A-Z0-9-]{7,15}$/.test(cleanedText);
           
           if (isLikelySku) {
              found.push({
                 text: cleanedText,
                 bbox: word.bbox
              });
           }
        });

        // Deduplicate by text (keep the one with best confidence or just first)
        const uniqueFound = found.filter((v, i, a) => a.findIndex(t => (t.text === v.text)) === i);
        
        setDetectedSkus(uniqueFound);
        setIsScanning(true);
      } catch (err) {
        console.error("OCR Error", err);
        setIsScanning(true);
      }
    };

    scanInterval = setInterval(() => {
       if (isScanning) {
         scanFrame();
       }
    }, 1500);

    return () => {
      clearInterval(scanInterval);
      window.removeEventListener("resize", updateScale);
      setIsScanning(false);
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      if (worker) {
        worker.terminate();
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col gap-3">
      {/* Viewport Kamera */}
      <div 
        ref={containerRef}
        className="relative rounded-2xl overflow-hidden bg-black shadow-inner"
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-auto min-h-[300px]"
        />
        
        <canvas ref={canvasRef} className="hidden" />

        {/* Kotak-kotak biru ala Google Lens */}
        {detectedSkus.map((sku, idx) => (
          <button
            key={idx}
            onClick={() => onScanSuccess(sku.text)}
            className="absolute border-2 border-blue-500 bg-blue-500/20 rounded-md cursor-pointer hover:bg-blue-500/40 transition-colors group flex items-end justify-center"
            style={{
              left: `${sku.bbox.x0 * scale.x}px`,
              top: `${sku.bbox.y0 * scale.y}px`,
              width: `${(sku.bbox.x1 - sku.bbox.x0) * scale.x}px`,
              height: `${(sku.bbox.y1 - sku.bbox.y0) * scale.y}px`,
            }}
          >
            {/* Tooltip teks */}
            <span className="absolute -bottom-8 bg-blue-700 text-white text-xs font-bold px-2 py-1 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
              {sku.text} (Pilih)
            </span>
          </button>
        ))}

        <div className="absolute top-4 left-0 right-0 flex justify-center pointer-events-none">
          <p className="bg-black/60 text-white text-xs px-4 py-2 rounded-full backdrop-blur-sm animate-pulse shadow-md">
            {status}
          </p>
        </div>
      </div>

      {/* Daftar Hasil Scan */}
      {detectedSkus.length > 0 && (
        <div className="bg-white border rounded-xl p-4 shadow-sm">
          <p className="text-sm font-bold text-slate-700 mb-2">Terdeteksi {detectedSkus.length} SKU:</p>
          <div className="flex flex-wrap gap-2">
            {detectedSkus.map((sku, idx) => (
              <button
                key={idx}
                onClick={() => onScanSuccess(sku.text)}
                className="bg-indigo-50 border border-indigo-200 text-indigo-700 px-3 py-1.5 rounded-lg text-sm font-mono font-bold hover:bg-indigo-100 transition-colors"
              >
                {sku.text}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-2 italic">Ketuk pada nomor SKU di atas untuk mencari.</p>
        </div>
      )}
    </div>
  );
}
