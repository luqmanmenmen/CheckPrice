"use client";

import { useState, useRef } from "react";
import dynamic from "next/dynamic";
import { Search, Camera, X, CalendarRange, Tag, Package2, Layers } from "lucide-react";

const Scanner = dynamic(() => import("@/components/Scanner"), { ssr: false });

type ProductData = {
  id: number;
  sku: string;
  barcode: string | null;
  article: string | null;
  description: string;
  acara: string | null;
  fromDate: string | null;
  toDate: string | null;
  hargaNormal: number;
  hargaPromo: number | null;
  diskon: string | null;
  discountType: string | null;
  brand: string | null;
  dept: string | null;
};

// Parse the description to get a clean product name
function parseDescription(desc: string): { name: string; details: string } {
  const parts = desc.split(":");
  if (parts.length <= 1) return { name: desc, details: "" };
  // First part before colon (or first two parts) = name, rest = details
  const name = parts[0].trim();
  const details = parts.slice(1).join(" | ").trim();
  return { name, details };
}

function formatRupiah(angka: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(angka);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

export default function Home() {
  const [showScanner, setShowScanner] = useState(false);
  const [manualInput, setManualInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [product, setProduct] = useState<ProductData | null>(null);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const searchProduct = async (identifier: string) => {
    const trimmed = identifier.trim();
    if (!trimmed) return;

    setLoading(true);
    setError("");
    setProduct(null);

    try {
      const res = await fetch(`/api/product/${encodeURIComponent(trimmed)}`);
      const data = await res.json();

      if (res.ok) {
        setProduct(data.data);
        if (showScanner) setShowScanner(false);
      } else {
        setError(data.error || "Produk tidak ditemukan");
      }
    } catch {
      setError("Terjadi kesalahan jaringan.");
    } finally {
      setLoading(false);
    }
  };

  const handleScanSuccess = (decodedText: string) => {
    setManualInput(decodedText);
    searchProduct(decodedText);
  };

  const handleClear = () => {
    setManualInput("");
    setProduct(null);
    setError("");
    inputRef.current?.focus();
  };

  const isOnPromo = product && product.hargaPromo && product.hargaPromo > 0 && product.hargaPromo !== product.hargaNormal;
  const discountPct = isOnPromo && product
    ? Math.round(((product.hargaNormal - product.hargaPromo!) / product.hargaNormal) * 100)
    : 0;

  return (
    <div className="flex flex-col gap-5">

      {/* Search */}
      <div className="pt-2 flex flex-col gap-3">
        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              placeholder="Ketik SKU / Scan Barcode..."
              className="w-full pl-10 pr-10 py-3.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm font-mono"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchProduct(manualInput)}
              autoFocus
            />
            {manualInput && (
              <button onClick={handleClear} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            onClick={() => searchProduct(manualInput)}
            className="bg-blue-600 text-white px-5 py-3.5 rounded-xl hover:bg-blue-700 transition-colors font-semibold shadow-sm text-sm"
          >
            Cari
          </button>
        </div>

        <button
          onClick={() => setShowScanner(!showScanner)}
          className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border-2 transition-all font-semibold text-sm ${
            showScanner
              ? "border-red-100 text-red-600 bg-red-50 hover:bg-red-100"
              : "border-blue-100 text-blue-600 bg-blue-50 hover:bg-blue-100"
          }`}
        >
          {showScanner ? (
            <><X className="w-4 h-4" /> Tutup Kamera</>
          ) : (
            <><Camera className="w-4 h-4" /> Scan Barcode via Kamera</>
          )}
        </button>
      </div>

      {/* Scanner View */}
      {showScanner && (
        <div className="animate-in slide-in-from-top-4 duration-300">
          <Scanner onScanSuccess={handleScanSuccess} />
          <p className="text-center text-xs text-slate-500 mt-2">Arahkan kamera ke barcode pada price tag</p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-10">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="bg-red-50 text-red-700 p-4 rounded-xl text-center border border-red-200 text-sm font-medium animate-in zoom-in duration-200">
          {error}
        </div>
      )}

      {/* Product Card */}
      {product && !loading && (() => {
        const { name, details } = parseDescription(product.description);
        return (
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden animate-in slide-in-from-bottom-6 duration-400">

            {/* Discount Badge Header */}
            {isOnPromo && (
              <div className="bg-gradient-to-r from-red-500 to-orange-500 px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-white font-bold text-sm">
                  <Tag className="w-4 h-4" />
                  <span>{product.discountType || "SPECIAL PRICE"}</span>
                </div>
                <span className="bg-white text-red-600 font-extrabold text-sm px-3 py-1 rounded-full">
                  HEMAT {discountPct}%
                </span>
              </div>
            )}

            <div className="p-5 flex flex-col gap-4">

              {/* Product Name */}
              <div>
                <h2 className="text-xl font-bold text-slate-800 leading-snug">{name}</h2>
                {details && (
                  <p className="text-sm text-slate-500 mt-1">{details}</p>
                )}
              </div>

              {/* Meta badges */}
              <div className="flex flex-wrap gap-2">
                <span className="flex items-center gap-1 bg-slate-100 text-slate-600 text-xs font-mono px-2.5 py-1.5 rounded-lg">
                  <Package2 className="w-3.5 h-3.5" />
                  SKU: {product.sku}
                </span>
                {product.article && (
                  <span className="flex items-center gap-1 bg-blue-50 text-blue-700 text-xs font-mono px-2.5 py-1.5 rounded-lg">
                    <Layers className="w-3.5 h-3.5" />
                    {product.article}
                  </span>
                )}
                {product.brand && (
                  <span className="bg-slate-800 text-white text-xs font-bold px-2.5 py-1.5 rounded-lg uppercase tracking-wide">
                    {product.brand}
                  </span>
                )}
              </div>

              {/* Harga */}
              <div className="bg-slate-50 rounded-xl p-4 border">
                {isOnPromo ? (
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="text-xs text-slate-500 uppercase font-medium mb-1">Harga Promo</p>
                      <p className="text-4xl font-extrabold text-red-600 leading-none">
                        {formatRupiah(product.hargaPromo!)}
                      </p>
                      <p className="text-base text-slate-400 line-through mt-1">
                        {formatRupiah(product.hargaNormal)}
                      </p>
                    </div>
                    <div className="bg-red-100 text-red-700 rounded-xl px-4 py-2 text-center shrink-0">
                      <p className="text-2xl font-black leading-none">{discountPct}%</p>
                      <p className="text-xs font-medium">OFF</p>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="text-xs text-slate-500 uppercase font-medium mb-1">Harga Normal</p>
                    <p className="text-4xl font-extrabold text-slate-800 leading-none">
                      {formatRupiah(product.hargaNormal)}
                    </p>
                  </div>
                )}
              </div>

              {/* Promo Info */}
              {product.acara && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex flex-col gap-1.5">
                  <p className="text-xs font-bold text-amber-700 uppercase tracking-wide">Info Promo</p>
                  <p className="text-sm text-amber-800 font-medium leading-snug">{product.acara}</p>
                  {(product.fromDate || product.toDate) && (
                    <div className="flex items-center gap-1.5 text-xs text-amber-700 mt-1">
                      <CalendarRange className="w-3.5 h-3.5" />
                      <span>{formatDate(product.fromDate)} – {formatDate(product.toDate)}</span>
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>
        );
      })()}

      {/* Empty state */}
      {!product && !loading && !error && (
        <div className="flex flex-col items-center py-12 gap-3 text-slate-400">
          <Search className="w-14 h-14 opacity-30" />
          <p className="text-sm">Masukkan nomor SKU lalu tekan Enter</p>
          <p className="text-xs opacity-70 text-center">Contoh SKU: 13463728 &nbsp;|&nbsp; Atau tekan Scan untuk kamera</p>
        </div>
      )}

    </div>
  );
}
