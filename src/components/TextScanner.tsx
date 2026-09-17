"use client";

import { useEffect, useRef, useState } from "react";
import Tesseract from "tesseract.js";

interface TextScannerProps {
  onScanSuccess: (text: string) => void;
}

export default function TextScanner({ onScanSuccess }: TextScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [status, setStatus] = useState("Memulai kamera...");

  useEffect(() => {
    let stream: MediaStream | null = null;
    let scanInterval: NodeJS.Timeout;
    
    // Function to start camera
    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setStatus("Mencari teks (Arahkan ke tulisan SKU)...");
        setIsScanning(true);
      } catch (err) {
        console.error("Camera error:", err);
        setStatus("Gagal mengakses kamera. Izinkan akses kamera.");
      }
    };

    startCamera();

    // Worker for OCR
    let worker: Tesseract.Worker | null = null;
    
    const initWorker = async () => {
      try {
        worker = await Tesseract.createWorker("eng");
      } catch (e) {
        console.error("Tesseract Init Error", e);
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

      // Set canvas size to match video to draw image
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      try {
        // Pause scanning while processing frame
        setIsScanning(false);
        const { data: { text } } = await worker.recognize(canvas);
        
        // Clean text (uppercase, replace newlines with spaces)
        const cleanedText = text.replace(/\n/g, " ").toUpperCase();
        
        // Split by spaces and find potential SKUs
        // We will look for words that look like SKUs:
        // Rule: 7 to 15 characters, containing numbers, optionally letters or dashes.
        const words = cleanedText.split(/\s+/);
        const potentialSkus = words.filter(w => {
           // Basic regex: at least one number, length 7-15, only alphanumeric and dashes
           return /[0-9]/.test(w) && /^[A-Z0-9-]{7,15}$/.test(w);
        });

        if (potentialSkus.length > 0) {
           // Sort candidates: prefer 8-digit numbers
           const bestCandidate = potentialSkus.sort((a, b) => {
              const aIs8Digit = /^\d{8}$/.test(a);
              const bIs8Digit = /^\d{8}$/.test(b);
              if (aIs8Digit && !bIs8Digit) return -1;
              if (!aIs8Digit && bIs8Digit) return 1;
              return 0;
           })[0];

           if (bestCandidate) {
             onScanSuccess(bestCandidate);
             // Stop further scanning once success is called
             return; 
           }
        }
        
        // Resume scanning if no match
        setIsScanning(true);
      } catch (err) {
        console.error("OCR Error", err);
        setIsScanning(true);
      }
    };

    // Run scan periodically (every 1 second)
    scanInterval = setInterval(() => {
       if (isScanning) {
         scanFrame();
       }
    }, 1000);

    return () => {
      clearInterval(scanInterval);
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
    <div className="flex flex-col gap-3 relative rounded-2xl overflow-hidden bg-black shadow-inner">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full object-cover min-h-[300px]"
      />
      
      <canvas ref={canvasRef} className="hidden" />

      {/* Scanning Target Overlay */}
      <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-[280px] h-[100px] border-2 border-white/50 rounded-lg relative">
           <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-green-500 rounded-tl-lg -ml-1 -mt-1"></div>
           <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-green-500 rounded-tr-lg -mr-1 -mt-1"></div>
           <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-green-500 rounded-bl-lg -ml-1 -mb-1"></div>
           <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-green-500 rounded-br-lg -mr-1 -mb-1"></div>
        </div>
        <p className="mt-4 bg-black/60 text-white text-xs px-3 py-1.5 rounded-full backdrop-blur-sm animate-pulse">
          {status}
        </p>
      </div>
    </div>
  );
}
