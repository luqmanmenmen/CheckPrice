"use client";

import { useEffect, useRef, useState } from "react";
import Tesseract from "tesseract.js";

interface TextScannerProps {
  onScanResult: (sku: string, detected: DetectedSku, snapshot?: string) => void;
}

export interface BoundingBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface DetectedSku {
  text: string;
  bbox: BoundingBox;
  size?: string;
  rawText?: string;
}

export default function TextScanner({ onScanResult }: TextScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

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

      try {
        setIsScanning(false);
        const result: any = await worker.recognize(canvas);
        const words: any[] = result.data.words || [];
        
        updateScale(); // Ensure scale is fresh

        const found: DetectedSku[] = [];
        let fullTextStr = "";
        
        words.forEach((word: any) => {
           const text = word.text.toUpperCase();
           fullTextStr += text + " ";
           
           // Cari pola SKU: 7-15 karakter gabungan angka/huruf/strip, yang punya minimal 1 angka
           const match = text.match(/[A-Z0-9-]{7,15}/);
           
           if (match) {
              const candidate = match[0];
              // Pastikan mengandung angka
              if (/[0-9]/.test(candidate)) {
                 found.push({
                    text: candidate,
                    bbox: word.bbox
                 });
              }
           }
        });

        // Ekstrak ukuran jika ada (S, M, L, XL, XXL) dari full text
        const sizeMatch = fullTextStr.match(/\b(XS|S|M|L|XL|XXL|XXXL|3XL|4XL)\b/);
        const extractedSize = sizeMatch ? sizeMatch[1] : undefined;

        setDetectedSkus(found);

        // Jika menemukan setidaknya 1 SKU, hentikan kamera dan trigger onScanResult
        if (found.length > 0) {
           // Ambil snapshot base64
           const snapshot = canvas.toDataURL("image/jpeg", 0.8);
           
           // Ambil SKU pertama yang paling valid
           const bestSku = found[0];
           bestSku.size = extractedSize;
           bestSku.rawText = fullTextStr;
           
           onScanResult(bestSku.text, bestSku, snapshot);
           
           if (intervalRef.current) {
              clearInterval(intervalRef.current);
           }
           setIsScanning(false);
           return; // Stop further processing
        }

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
    intervalRef.current = scanInterval;

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
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
            onClick={() => onScanResult(sku.text, sku)}
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

        {/* Ganti multi-SKU list dengan indikator fokus karena SA akan diarahkan ke Review Screen otomatis */}
        <div className="absolute bottom-4 left-0 right-0 p-4">
          <div className="bg-white/90 backdrop-blur shadow-lg rounded-xl p-4 text-center">
            <p className="text-sm text-gray-600">
              Arahkan kamera ke layar/label harga.<br/>
              Kamera akan <span className="font-bold text-blue-600">otomatis memfoto</span> jika SKU berhasil dibaca.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
