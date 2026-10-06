"use client";

import { useState, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import { Search, X, ScanBarcode, Tag, XCircle } from "lucide-react";
import { ChipLoader } from "@/components/ChipLoader";

const Scanner = dynamic(() => import("@/components/Scanner"), { ssr: false });

type ProductData = {
  sku: string;
  description: string;
  hargaNormal: number;
  hargaPromo: number | null;
  discountType: string | null;
  brand: string | null;
  toDate: string | null;
};

function formatRupiah(angka: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(angka);
}

function parseDescription(desc: string): { name: string; variants: string[] } {
  const parts = desc.split(":");
  if (parts.length <= 1) return { name: desc, variants: [] };
  const name = parts[0].trim();
  const variants = parts.slice(1).map(p => p.trim()).filter(Boolean);
  return { name, variants };
}

export default function CekHargaPage() {
  const [scanMode, setScanMode] = useState(false);
  const [manualInput, setManualInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [product, setProduct] = useState<ProductData | null>(null);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Timeout for auto-resetting the kiosk
  const idleTimeout = useRef<NodeJS.Timeout | null>(null);

  const resetKiosk = () => {
    setProduct(null);
    setManualInput("");
    setError("");
    setScanMode(false);
    inputRef.current?.focus();
  };

  const startIdleTimer = () => {
    if (idleTimeout.current) clearTimeout(idleTimeout.current);
    idleTimeout.current = setTimeout(() => {
      resetKiosk();
    }, 30000); // Reset after 30 seconds of inactivity
  };

  useEffect(() => {
    window.addEventListener('mousemove', startIdleTimer);
    window.addEventListener('keydown', startIdleTimer);
    window.addEventListener('touchstart', startIdleTimer);
    startIdleTimer();
    return () => {
      window.removeEventListener('mousemove', startIdleTimer);
      window.removeEventListener('keydown', startIdleTimer);
      window.removeEventListener('touchstart', startIdleTimer);
      if (idleTimeout.current) clearTimeout(idleTimeout.current);
    };
  }, []);

  const searchProduct = async (identifier: string) => {
    const trimmed = identifier.trim();
    if (!trimmed) return;

    setLoading(true);
    setError("");
    setProduct(null);
    startIdleTimer();

    try {
      const res = await fetch(`/api/product/${encodeURIComponent(trimmed)}?page=1`, {
        cache: 'no-store'
      });
      
      const data = await res.json();

      if (res.ok) {
        if (Array.isArray(data.data) && data.data.length > 0) {
          setProduct(data.data[0]);
        } else if (data.data) {
          setProduct(data.data);
        } else {
          setError("Produk tidak ditemukan. Pastikan barcode yang discan benar.");
        }
        if (scanMode) setScanMode(false);
      } else {
        setError(data.error || "Produk tidak ditemukan");
      }
    } catch {
      setError("Terjadi kesalahan jaringan.");
    } finally {
      setLoading(false);
      setManualInput(""); // Auto clear input for next scan
    }
  };

  const handleBarcodeSuccess = (result: string) => {
    searchProduct(result);
  };

  // Logic for promo checking
  let isPromoExpired = false;
  if (product && product.toDate) {
    const toDateObj = new Date(product.toDate);
    if (!isNaN(toDateObj.getTime())) {
      toDateObj.setHours(23, 59, 59, 999);
      if (new Date() > toDateObj) {
        isPromoExpired = true;
      }
    }
  }

  const isOnPromo = product && product.hargaPromo && product.hargaPromo > 0 && product.hargaPromo !== product.hargaNormal && !isPromoExpired;
  
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 md:p-8 font-sans selection:bg-black selection:text-white">
      {/* Kiosk Header */}
      <div className="mb-8 md:mb-12 text-center animate-in fade-in slide-in-from-top-8 duration-700">
        <div className="bg-black text-white px-6 py-2 rounded-full inline-block mb-4 font-black tracking-widest text-sm shadow-xl">
          SUKO
        </div>
        <h1 className="text-3xl md:text-5xl font-black text-slate-900 tracking-tight">Cek Harga Produk</h1>
        <p className="text-slate-500 mt-3 font-medium max-w-md mx-auto">Scan barcode di label produk atau ketik kode/nama barang untuk melihat harga terbaru.</p>
      </div>

      <div className="w-full max-w-2xl relative z-10">
        
        {/* Search Bar */}
        <div className="bg-white p-2 rounded-2xl md:rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 flex flex-col md:flex-row gap-2 mb-8 relative z-20">
          <div className="relative flex-1 flex items-center">
            <Search className="absolute left-5 w-6 h-6 text-slate-300" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Ketik SKU / Barcode..."
              className="w-full pl-14 pr-6 py-4 md:py-5 rounded-xl md:rounded-full bg-transparent focus:outline-none text-lg md:text-xl font-medium text-slate-800 placeholder:text-slate-300 transition-all"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchProduct(manualInput)}
              autoFocus
            />
            {manualInput && (
              <button 
                onClick={() => setManualInput("")}
                className="absolute right-5 text-slate-300 hover:text-slate-600 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            )}
          </div>
          
          <div className="flex gap-2 p-1 md:p-0">
            <button
              onClick={() => setScanMode(true)}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-6 py-4 rounded-xl md:rounded-full font-bold transition-all"
            >
              <ScanBarcode className="w-5 h-5" />
              <span className="md:hidden">Scan Kamera</span>
            </button>
            <button
              onClick={() => searchProduct(manualInput)}
              disabled={!manualInput.trim() || loading}
              className="flex-[2] md:flex-none bg-black hover:bg-slate-800 text-white px-8 py-4 rounded-xl md:rounded-full font-bold transition-all disabled:opacity-50 disabled:hover:bg-black"
            >
              Cek Harga
            </button>
          </div>
        </div>

        {/* Results Area */}
        <div className="min-h-[300px]">
          {loading && (
            <div className="flex flex-col items-center justify-center py-20 animate-in fade-in duration-300">
              <ChipLoader />
              <p className="mt-4 text-slate-400 font-medium">Mencari data produk...</p>
            </div>
          )}

          {error && !loading && (
            <div className="bg-red-50/50 backdrop-blur-sm border border-red-100 rounded-3xl p-8 text-center animate-in zoom-in-95 duration-300">
              <XCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-red-900 mb-2">Oops!</h3>
              <p className="text-red-600 font-medium">{error}</p>
              <button 
                onClick={resetKiosk}
                className="mt-6 px-6 py-2.5 bg-red-100 text-red-700 font-bold rounded-full hover:bg-red-200 transition-colors"
              >
                Coba Lagi
              </button>
            </div>
          )}

          {product && !loading && (() => {
            const { name, variants } = parseDescription(product.description);
            return (
              <div className="bg-white rounded-[2rem] shadow-[0_20px_50px_rgb(0,0,0,0.06)] border border-slate-100 overflow-hidden animate-in slide-in-from-bottom-8 duration-500">
                {isOnPromo && (
                  <div className="bg-gradient-to-r from-red-600 to-rose-500 px-8 py-4 flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-3 text-white">
                      <Tag className="w-5 h-5 fill-current" />
                      <span className="font-black tracking-wide uppercase">{product.discountType || "HARGA SPESIAL"}</span>
                    </div>
                  </div>
                )}
                
                <div className="p-8 md:p-12 text-center flex flex-col items-center">
                  <span className="text-sm font-bold tracking-widest uppercase text-slate-400 mb-2">{product.brand || "SUKO"}</span>
                  <h2 className="text-2xl md:text-4xl font-black text-slate-800 leading-tight mb-4">{name}</h2>
                  
                  {variants.length > 0 && (
                    <div className="flex flex-wrap justify-center gap-2 mb-8">
                      {variants.slice(0, 2).map((v, i) => (
                        <span key={i} className="bg-slate-100 text-slate-600 px-4 py-1.5 rounded-full text-sm font-bold tracking-wide">
                          {v}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="w-24 h-1 bg-slate-100 rounded-full mb-8"></div>

                  <div className="flex flex-col items-center">
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-2">HARGA SEKARANG</p>
                    {isOnPromo ? (
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-xl md:text-2xl font-bold text-slate-400 line-through decoration-red-500/50 decoration-2">
                          {formatRupiah(product.hargaNormal)}
                        </span>
                        <span className="text-5xl md:text-7xl font-black text-red-600 tracking-tighter drop-shadow-sm">
                          {formatRupiah(product.hargaPromo!)}
                        </span>
                        <span className="mt-4 bg-red-100 text-red-700 font-bold px-4 py-1.5 rounded-full text-sm">
                          HEMAT {formatRupiah(product.hargaNormal - product.hargaPromo!)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-5xl md:text-7xl font-black text-slate-900 tracking-tighter drop-shadow-sm">
                        {formatRupiah(product.hargaNormal)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="bg-slate-50 border-t border-slate-100 p-6 flex justify-between items-center text-sm font-medium text-slate-400">
                  <span>SKU: {product.sku}</span>
                  <button onClick={resetKiosk} className="text-black font-bold hover:underline">
                    Scan Produk Lain &rarr;
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Full Screen Scanner */}
      {scanMode && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col animate-in fade-in zoom-in-95 duration-300">
          <div className="flex justify-between items-center p-6 bg-gradient-to-b from-black/80 to-transparent absolute top-0 w-full z-10">
            <h3 className="font-bold text-white text-lg drop-shadow-md">Scan Barcode Produk</h3>
            <button onClick={() => setScanMode(false)} className="p-3 bg-white/10 backdrop-blur-md rounded-full hover:bg-white/20 transition-colors">
              <X className="w-6 h-6 text-white" />
            </button>
          </div>
          <div className="flex-1 relative overflow-hidden bg-black flex items-center justify-center">
            <div className="w-full h-full max-w-2xl mx-auto flex flex-col justify-center px-4 relative">
              <Scanner onScanSuccess={handleBarcodeSuccess} />
              <p className="text-center text-sm font-bold text-white/70 mt-6 absolute bottom-12 w-full left-0 drop-shadow-md">
                Posisikan garis barcode di tengah layar
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Decorative Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-blue-100/40 rounded-full blur-3xl"></div>
        <div className="absolute bottom-[10%] -right-[5%] w-[30%] h-[50%] bg-indigo-100/40 rounded-full blur-3xl"></div>
      </div>
    </div>
  );
}
