/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable @typescript-eslint/no-explicit-any */
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
  const [scanFeedback, setScanFeedback] = useState<"idle" | "wrong_target">("idle");

  async function scanFrameForText() {
    if (isHandlingResult.current || !workerRef.current || !canvasRef.current || !scannerRef.current) return;
    
    // Pastikan scanner sedang jalan
    if (scannerRef.current.getState() !== Html5QrcodeScannerState.SCANNING) return;

    // Ambil elemen video yang dibuat oleh html5-qrcode
    const video = document.querySelector("#reader video") as HTMLVideoElement;
    if (!video || video.readyState !== video.HAVE_ENOUGH_DATA) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 1. CROP ke Kotak Scan (300x150) agar tidak membaca barcode di luar kotak & 10x lebih cepat!
    const cropWidth = 300;
    const cropHeight = 150;
    const startX = (video.videoWidth - cropWidth) / 2;
    const startY = (video.videoHeight - cropHeight) / 2;

    canvas.width = cropWidth;
    canvas.height = cropHeight;

    // Filter kontras tinggi untuk membantu OCR baca teks
    ctx.filter = 'grayscale(100%) contrast(300%) brightness(120%)';
    ctx.drawImage(video, startX, startY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
    ctx.filter = 'none';

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result: any = await workerRef.current.recognize(canvas);
      const text = result.data.text.toUpperCase();
      
      // LOGIKA CERDAS V3: Analisis Baris per Baris (Anti-Barcode & Anti-Artikel)
      const lines = text.split('\n');
      const valid8Digits: string[] = [];
      let detectedWrong = false;
      
      for (const line of lines) {
          // FILTER ANTI-ARTIKEL (KODE PABRIK): Misal "605-12218278" atau "605 12218278"
          // Jika ada pola 3 angka + spasi/dash + 8 angka, kita buang langsung agar 12218278 tidak disangka SKU!
          if (/\b\d{3}\s*[-]?\s*\d{8}\b/.test(line)) {
              detectedWrong = true;
              continue; 
          }

          // 1. Buang semua huruf/simbol, ambil murni angkanya saja dalam baris ini
          const digits = line.replace(/\D/g, '');
          
          // 2. FILTER ANTI-BARCODE: 
          if (digits.length >= 12 && digits.length <= 14) {
              detectedWrong = true;
              continue;
          }
          
          // 3. FILTER ANTI-HARGA:
          if (line.includes('RP') || digits === '129900') continue;
          
          // 4. TANGKAP SKU:
          if (digits.length === 8) {
              valid8Digits.push(digits);
          } else if (digits.length > 8 && digits.length <= 22) {
              valid8Digits.push(digits.slice(-8));
          }
      }
      
      // 5. Eksekusi SKU Terakhir
      if (valid8Digits.length > 0) {
          const finalSku = valid8Digits[valid8Digits.length - 1];
          handleSuccess(finalSku, "OCR (Smart Line Filter)");
          return;
      }
      
      // Jika salah fokus, berikan feedback merah
      if (detectedWrong) {
          setScanFeedback("wrong_target");
          setTimeout(() => setScanFeedback("idle"), 800);
      }
    } catch (err) {
      console.error("OCR Check Error", err);
    }
  }

  function handleSuccess(sku: string, source: string) {
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
  }

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
            // Permintaan USER: Abaikan barcode (batang), fokus murni ke SKU via OCR!
            // Barcode retail biasanya 13 digit (EAN-13), kita abaikan saja.
            // Jika kebetulan barcodenya EAN-8 (tepat 8 digit), mungkin itu SKU, jadi kita izinkan.
            if (decodedText.length === 8) {
                handleSuccess(decodedText, "BARCODE");
            } else {
                // Beri tahu UI bahwa kamera sedang nyasar ke barcode batang!
                setScanFeedback("wrong_target");
                setTimeout(() => setScanFeedback("idle"), 800);
            }
            // Selain 8 digit, hiraukan sama sekali!
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
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



  return (
    <div className="flex flex-col gap-3">
      {/* Kotak Scanner Utama */}
      <div className={`relative rounded-3xl overflow-hidden shadow-2xl border-4 transition-colors duration-300 ${
         foundSku ? "border-green-500 bg-green-900" :
         scanFeedback === "wrong_target" ? "border-red-500 bg-red-900" :
         "border-slate-800 bg-slate-900"
      }`}>
        
        {/* Kontainer html5-qrcode */}
        <div id="reader" className="w-full min-h-[300px] sm:min-h-[400px] bg-black"></div>

        {/* Overlay Animasi Scan Grid */}
        {!foundSku && (
          <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden flex flex-col justify-start">
            <div className={`w-full h-[25%] border-b-[3px] animate-scan-grid relative transition-colors duration-300 ${
               scanFeedback === "wrong_target" 
                 ? "bg-gradient-to-b from-transparent to-red-500/30 border-red-500 shadow-[0_10px_20px_rgba(239,68,68,0.4)]"
                 : "bg-gradient-to-b from-transparent to-indigo-500/30 border-indigo-500 shadow-[0_10px_20px_rgba(99,102,241,0.4)]"
             }`}>
               <div className="absolute inset-0 opacity-40 transition-colors duration-300" style={{
                 backgroundImage: scanFeedback === "wrong_target" 
                   ? 'linear-gradient(rgba(239,68,68,1) 1px, transparent 1px), linear-gradient(90deg, rgba(239,68,68,1) 1px, transparent 1px)'
                   : 'linear-gradient(rgba(99,102,241,1) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,1) 1px, transparent 1px)',
                 backgroundSize: '15px 15px'
               }}></div>
            </div>
          </div>
        )}

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

      </div>
      
      {/* Indikator Status Bawah (dipindah ke luar kamera agar tidak menutupi area scan) */}
      <div className="flex justify-center z-10 w-full mt-2">
        <div className="bg-white/95 backdrop-blur-xl shadow-lg rounded-2xl p-4 w-full text-center border border-slate-200 flex flex-col items-center gap-2 transform transition-all duration-300">
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
      
      {/* CSS untuk memoles UI bawaan html5-qrcode */}
      <style dangerouslySetInnerHTML={{__html: `
        #reader { border: none !important; }
        #reader video { object-fit: cover !important; }
        #reader__dashboard_section_csr { display: none !important; }
        #reader__dashboard_section_swaplink { display: none !important; }
        #reader__scan_region { background: black !important; }

        @keyframes scan-grid {
          0% { transform: translateY(-100%); }
          50% { transform: translateY(400%); }
          100% { transform: translateY(-100%); }
        }
        .animate-scan-grid {
          animation: scan-grid 2.5s ease-in-out infinite;
        }
      `}} />
    </div>
  );
}
