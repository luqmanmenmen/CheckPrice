"use client";

import { useEffect, useRef, useState } from "react";
import Tesseract from "tesseract.js";
import { Html5Qrcode, Html5QrcodeSupportedFormats, Html5QrcodeScannerState } from "html5-qrcode";
import { Loader2, Flashlight, FlashlightOff, Maximize, CheckCircle2 } from "lucide-react";

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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const workerRef = useRef<Tesseract.Worker | null>(null);
  const isHandlingResult = useRef(false);

  const [status, setStatus] = useState("Memulai Kamera & AI...");
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [foundSku, setFoundSku] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const initAll = async () => {
      try {
        // 1. Init Tesseract (OCR)
        setStatus("Memuat Engine Teks (OCR)...");
        const worker = await Tesseract.createWorker("eng");
        await worker.setParameters({
          tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789- '
        });
        if (isMounted) workerRef.current = worker;

        // 2. Init Barcode Scanner
        setStatus("Memulai Kamera...");
        const html5QrCode = new Html5Qrcode("reader", {
          verbose: false,
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
          ]
        });
        scannerRef.current = html5QrCode;

        await html5QrCode.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 300, height: 150 },
            aspectRatio: 1.0,
          },
          (decodedText) => {
            // Barcode Callback
            handleSuccess(decodedText, "BARCODE");
          },
          () => {
            // Error Callback (ignore, happens every frame)
          }
        );

        if (!isMounted) return;

        setStatus("Mencari Barcode & Angka 8-Digit...");

        // Check if torch is supported
        setTimeout(() => {
          if (scannerRef.current?.getState() === Html5QrcodeScannerState.SCANNING) {
            const track = scannerRef.current.getRunningTrackCameraCapabilities();
            if (track && (track as any).torchFeature()?.isSupported()) {
              setHasTorch(true);
            }
          }
        }, 1000);

        // 3. Start OCR Interval (Fallback)
        intervalRef.current = setInterval(scanFrameForText, 1500);

      } catch (err) {
        console.error("Init Error:", err);
        if (isMounted) setStatus("Gagal memuat kamera/AI. Pastikan izin kamera diberikan.");
      }
    };

    initAll();

    return () => {
      isMounted = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (workerRef.current) workerRef.current.terminate();
      if (scannerRef.current && scannerRef.current.getState() !== Html5QrcodeScannerState.NOT_STARTED) {
        scannerRef.current.stop().catch(console.error);
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleTorch = async () => {
    if (!scannerRef.current || scannerRef.current.getState() !== Html5QrcodeScannerState.SCANNING) return;
    try {
      await scannerRef.current.applyVideoConstraints({
        advanced: [{ torch: !torchOn } as any]
      });
      setTorchOn(!torchOn);
    } catch (err) {
      console.error("Failed to toggle torch", err);
    }
  };

  const scanFrameForText = async () => {
    if (isHandlingResult.current || !workerRef.current || !canvasRef.current || !scannerRef.current) return;
    
    // Pastikan scanner sedang jalan
    if (scannerRef.current.getState() !== Html5QrcodeScannerState.SCANNING) return;

    // Ambil elemen video yang dibuat oleh html5-qrcode
    const video = document.querySelector("#reader video") as HTMLVideoElement;
    if (!video || video.readyState !== video.HAVE_ENOUGH_DATA) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set ukuran canvas
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Filter kontras tinggi untuk membantu OCR baca teks
    ctx.filter = 'grayscale(100%) contrast(300%) brightness(120%)';
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.filter = 'none';

    try {
      const result: any = await workerRef.current.recognize(canvas);
      const text = result.data.text.toUpperCase();
      
      // LOGIKA CERDAS: Incar tepat 8 angka berjejer (contoh: 13472861)
      const sku8DigitMatch = text.match(/\b\d{8}\b/);
      
      if (sku8DigitMatch) {
         handleSuccess(sku8DigitMatch[0], "OCR (Angka 8-Digit)");
         return;
      }

      // Fallback: Kode artikel (Kombinasi Huruf & Angka, 6-15 char)
      const articleMatch = text.match(/[A-Z0-9-]{6,15}/g);
      if (articleMatch) {
         for (const candidate of articleMatch) {
            // Pastikan mengandung angka dan valid
            if (/[0-9]/.test(candidate) && candidate.length > 5 && !/^\d{13}$/.test(candidate)) { // hindari salah tangkap EAN13 sebagai teks
               // handleSuccess(candidate, "OCR (Kode Artikel)");
               // Kita tahan dulu yang ini agar tidak false positive, prioritas ke 8 digit.
               // Tapi bisa diaktifkan jika diperlukan.
            }
         }
      }
    } catch (err) {
      console.error("OCR Check Error", err);
    }
  };

  const handleSuccess = (sku: string, source: string) => {
    if (isHandlingResult.current) return;
    isHandlingResult.current = true;
    
    setFoundSku(sku);
    setStatus(`Berhasil ditemukan: ${sku} via ${source}`);
    
    // Ambil snapshot
    let snapshot = undefined;
    if (canvasRef.current) {
        // Gambar video terkini ke kanvas (tanpa filter) untuk snapshot bersih
        const video = document.querySelector("#reader video") as HTMLVideoElement;
        if (video) {
           const ctx = canvasRef.current.getContext("2d");
           if (ctx) {
              canvasRef.current.width = video.videoWidth;
              canvasRef.current.height = video.videoHeight;
              ctx.drawImage(video, 0, 0, canvasRef.current.width, canvasRef.current.height);
              snapshot = canvasRef.current.toDataURL("image/jpeg", 0.6);
           }
        }
    }

    const dummyBbox = { x0: 0, y0: 0, x1: 0, y1: 0 };
    
    // Hentikan proses
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (scannerRef.current && scannerRef.current.getState() === Html5QrcodeScannerState.SCANNING) {
       scannerRef.current.stop().catch(console.error);
    }

    // Jeda sedikit agar UI terlihat berubah menjadi centang hijau
    setTimeout(() => {
       onScanResult(sku, { text: sku, bbox: dummyBbox, rawText: source }, snapshot);
    }, 800);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Kotak Scanner Utama */}
      <div className="relative rounded-3xl overflow-hidden bg-slate-900 shadow-2xl border-4 border-slate-800">
        
        {/* Kontainer html5-qrcode */}
        <div id="reader" className="w-full min-h-[300px] sm:min-h-[400px] bg-black"></div>

        {/* Hidden Canvas untuk OCR */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Tombol Flash (Bila didukung) */}
        {hasTorch && !foundSku && (
           <button 
             onClick={toggleTorch}
             className="absolute top-4 right-4 z-50 bg-black/50 backdrop-blur-md p-3 rounded-full text-white border border-white/20 active:scale-95 transition-all"
           >
              {torchOn ? <Flashlight className="w-5 h-5 text-yellow-400" /> : <FlashlightOff className="w-5 h-5" />}
           </button>
        )}

        {/* Indikator Status Bawah */}
        <div className="absolute bottom-6 left-0 right-0 px-6 flex justify-center pointer-events-none z-50">
          <div className="bg-white/95 backdrop-blur-xl shadow-2xl rounded-2xl p-4 w-full text-center border border-white/40 flex flex-col items-center gap-2 transform transition-all duration-300">
            {foundSku ? (
              <>
                 <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-1">
                    <CheckCircle2 className="w-7 h-7 text-green-600" />
                 </div>
                 <p className="font-black text-xl text-slate-800">{foundSku}</p>
                 <p className="text-xs text-green-600 font-bold">Memproses...</p>
              </>
            ) : (
              <>
                 <div className="flex items-center gap-2 text-blue-600 font-bold mb-1">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Menganalisis...</span>
                 </div>
                 <p className="text-xs text-slate-600 font-medium">
                   Arahkan ke <strong className="text-slate-800">Garis Barcode</strong> atau <strong className="text-slate-800">Angka SKU (8 Digit)</strong>
                 </p>
                 <p className="text-[10px] text-slate-400 mt-1">{status}</p>
              </>
            )}
          </div>
        </div>
      </div>
      
      {/* CSS untuk memoles UI bawaan html5-qrcode */}
      <style dangerouslySetInnerHTML={{__html: `
        #reader { border: none !important; }
        #reader video { object-fit: cover !important; }
        #reader__dashboard_section_csr { display: none !important; }
        #reader__dashboard_section_swaplink { display: none !important; }
        #reader__scan_region { background: black !important; }
      `}} />
    </div>
  );
}
