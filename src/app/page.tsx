"use client";

import { useState, useRef } from "react";
import dynamic from "next/dynamic";
import { Search, Camera, X, CalendarRange, Tag, Package2, Layers, MessageSquare, HandHelping, LogOut, UserCircle2 } from "lucide-react";
import { DetectedSku } from "@/components/TextScanner";
import { useEffect } from "react";
import AnimatedLogoutButton from "@/components/AnimatedLogoutButton";

const Scanner = dynamic(() => import("@/components/Scanner"), { ssr: false });
const TextScanner = dynamic(() => import("@/components/TextScanner"), { ssr: false });

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
  const [scanMode, setScanMode] = useState<"none" | "barcode" | "text">("none");
  const [manualInput, setManualInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [product, setProduct] = useState<ProductData | null>(null);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const [submitting, setSubmitting] = useState(false);
  const [qty, setQty] = useState(1);
  const [activeTicketType, setActiveTicketType] = useState<"REQUEST" | "STOCK_CHECK" | null>(null);
  const [cart, setCart] = useState<any[]>([]);
  const [user, setUser] = useState<{name: string, nik: string, role: string, status?: string, jobTitle?: string} | null>(null);
  const [togglingStatus, setTogglingStatus] = useState(false);

  // Logout Summary States
  const [showSummary, setShowSummary] = useState(false);
  const [shiftSummary, setShiftSummary] = useState<any>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then(res => res.json())
      .then(data => {
        if (data.user) setUser(data.user);
      })
      .catch(console.error);
  }, []);

  const toggleStatus = async () => {
    if (!user || togglingStatus) return;
    setTogglingStatus(true);
    const newStatus = user.status === "ACTIVE" ? "BREAK" : "ACTIVE";
    try {
      const res = await fetch("/api/auth/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus })
      });
      const data = await res.json();
      if (res.ok) {
        setUser({ ...user, status: data.status });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setTogglingStatus(false);
    }
  };

  const handleLogoutClick = async () => {
    setLoadingSummary(true);
    setShowSummary(true);
    try {
      const res = await fetch("/api/auth/shift-summary");
      const data = await res.json();
      setShiftSummary(data.summary || { total: 0, pending: 0, completed: 0, rejected: 0, recentTickets: [] });
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingSummary(false);
    }
  };

  const confirmLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.href = "/login";
    } catch (error) {
      console.error("Failed to logout:", error);
    }
  };

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
        if (scanMode !== "none") setScanMode("none");
      } else {
        setError(data.error || "Produk tidak ditemukan");
      }
    } catch {
      setError("Terjadi kesalahan jaringan.");
    } finally {
      setLoading(false);
    }
  };

  const handleBarcodeSuccess = (result: string) => {
    setManualInput(result);
    searchProduct(result);
    setScanMode("none");
  };

  const handleTextScanSuccess = (result: any) => {
    if (result.sku) {
      setManualInput(result.sku);
      searchProduct(result.sku);
    }
    setScanMode("none");
  };

  const addToCart = (type: string, qty: number, size: string) => {
    if (!product) return;
    setCart([...cart, {
      sku: product.sku,
      productName: product.description,
      type,
      qty,
      size,
      photoUrl: null,
      ocrData: null
    }]);
    setProduct(null);
    setManualInput("");
    alert(`Berhasil ditambahkan ke daftar. Total: ${cart.length + 1}`);
  };

  const submitCart = async () => {
    if (cart.length === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: cart })
      });
      const data = await res.json();
      if (res.ok) {
        alert(`${cart.length} tiket berhasil dikirim ke Gudang!`);
        setCart([]);
      } else {
        alert(data.error || "Gagal mengirim tiket");
      }
    } catch (err) {
      alert("Terjadi kesalahan jaringan");
    } finally {
      setSubmitting(false);
    }
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

  // Cek apakah promo sudah habis berdasarkan toDate
  let isPromoExpired = false;
  if (product && product.toDate) {
    const toDateObj = new Date(product.toDate);
    if (!isNaN(toDateObj.getTime())) {
      // Set to end of the day to ensure promo is valid during that entire day
      toDateObj.setHours(23, 59, 59, 999);
      if (new Date() > toDateObj) {
        isPromoExpired = true;
      }
    }
  }

  return (
    <div className="flex flex-col gap-5 pb-32">

      {/* User Header */}
      {user && (
        <div className="bg-gradient-to-r from-blue-700 to-indigo-800 -mx-5 -mt-5 p-5 pt-8 pb-6 shadow-md rounded-b-3xl flex justify-between items-center text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm border border-white/30">
              <UserCircle2 className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs text-blue-200 font-medium tracking-wide uppercase">{user.jobTitle || 'Sales Area'}</p>
              <h1 className="font-bold text-lg leading-tight">{user.name} <span className="text-blue-200 font-normal">({user.nik})</span></h1>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="scale-75 origin-right">
              <AnimatedLogoutButton onLogout={handleLogoutClick} />
            </div>
            <div 
              className={`relative flex p-0.5 rounded-full shadow-inner w-32 h-7 cursor-pointer border transition-colors ${togglingStatus ? 'opacity-50 pointer-events-none' : ''} ${user.status === 'ACTIVE' ? 'bg-slate-800/20 border-slate-700/30' : 'bg-slate-800/40 border-slate-700/50'}`} 
              onClick={toggleStatus}
            >
              {/* Animated Pill Background */}
              <div 
                className={`absolute top-0.5 bottom-0.5 w-[calc(50%-2px)] rounded-full shadow-sm transition-all duration-300 ease-in-out ${user.status === 'ACTIVE' ? 'bg-green-500 left-0.5' : 'bg-amber-500 left-[50%]'}`}
              />
              <div className={`relative flex-1 flex items-center justify-center text-[10px] font-bold z-10 transition-colors duration-300 ${user.status === 'ACTIVE' ? 'text-white' : 'text-slate-500'}`}>
                AKTIF
              </div>
              <div className={`relative flex-1 flex items-center justify-center text-[10px] font-bold z-10 transition-colors duration-300 ${user.status === 'BREAK' ? 'text-white' : 'text-slate-500'}`}>
                REHAT
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Logout Summary Modal */}
      {showSummary && (
        <div className="fixed inset-0 bg-black/80 z-50 p-4 flex flex-col justify-center items-center">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="bg-gradient-to-r from-slate-800 to-slate-900 p-5 text-white text-center">
              <h2 className="text-xl font-bold">Rekapan Shift Anda</h2>
              <p className="text-slate-300 text-sm mt-1">Aktivitas (Daily Activity) Hari Ini</p>
            </div>
            
            <div className="p-6 bg-slate-50">
              {loadingSummary ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-800" />
                </div>
              ) : shiftSummary ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white border p-3 rounded-xl shadow-sm text-center">
                      <p className="text-xs text-slate-500 font-bold uppercase mb-1">Total Tiket</p>
                      <p className="text-2xl font-black text-slate-800">{shiftSummary.total}</p>
                    </div>
                    <div className="bg-green-50 border border-green-100 p-3 rounded-xl shadow-sm text-center">
                      <p className="text-xs text-green-600 font-bold uppercase mb-1">Diambil/Selesai</p>
                      <p className="text-2xl font-black text-green-700">{shiftSummary.completed}</p>
                    </div>
                    <div className="bg-red-50 border border-red-100 p-3 rounded-xl shadow-sm text-center">
                      <p className="text-xs text-red-600 font-bold uppercase mb-1">OOS / Habis</p>
                      <p className="text-2xl font-black text-red-700">{shiftSummary.rejected}</p>
                    </div>
                    <div className="bg-amber-50 border border-amber-100 p-3 rounded-xl shadow-sm text-center">
                      <p className="text-xs text-amber-600 font-bold uppercase mb-1">Menunggu</p>
                      <p className="text-2xl font-black text-amber-700">{shiftSummary.pending}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-center text-slate-500">Gagal memuat rekap data.</p>
              )}
            </div>

            <div className="p-4 border-t flex flex-col gap-3 bg-white">
              <button 
                onClick={confirmLogout}
                className="w-full bg-red-600 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-red-200 hover:bg-red-700"
              >
                Konfirmasi Akhiri Shift
              </button>
              <button 
                onClick={() => setShowSummary(false)}
                className="w-full bg-slate-100 text-slate-700 font-bold py-3.5 rounded-xl hover:bg-slate-200"
              >
                Batal (Lanjut Shift)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Warehouse Ticket Section */}
      <div className="pt-2">
        <h2 className="text-sm font-bold text-slate-500 uppercase mb-2">Pilih Mode Pemindaian</h2>
        <div className="relative flex p-1 bg-slate-200 rounded-xl shadow-inner">
          {/* Animated Background Pill */}
          <div 
            className="absolute top-1 bottom-1 w-[calc(50%-4px)] bg-white rounded-lg shadow-sm transition-all duration-300 ease-in-out"
            style={{ 
              left: activeTicketType === 'REQUEST' ? '4px' : activeTicketType === 'STOCK_CHECK' ? 'calc(50%)' : '4px',
              opacity: activeTicketType ? 1 : 0
            }}
          />
          <button
            onClick={() => setActiveTicketType(activeTicketType === "REQUEST" ? null : "REQUEST")}
            className={`relative flex-1 py-3 px-2 rounded-lg flex items-center justify-center gap-2 transition-colors duration-300 z-10 ${
              activeTicketType === "REQUEST" ? "text-blue-700 font-bold" : "text-slate-500 font-medium hover:text-slate-700"
            }`}
          >
            <HandHelping className="w-5 h-5" />
            <span className="text-sm">Request Barang</span>
          </button>
          <button
            onClick={() => setActiveTicketType(activeTicketType === "STOCK_CHECK" ? null : "STOCK_CHECK")}
            className={`relative flex-1 py-3 px-2 rounded-lg flex items-center justify-center gap-2 transition-colors duration-300 z-10 ${
              activeTicketType === "STOCK_CHECK" ? "text-indigo-700 font-bold" : "text-slate-500 font-medium hover:text-slate-700"
            }`}
          >
            <MessageSquare className="w-5 h-5" />
            <span className="text-sm">Tanya Stok</span>
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="pt-2 flex flex-col gap-3">
        <h2 className="text-sm font-bold text-slate-500 uppercase mb-2">Cari Info Produk</h2>
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

        <div className="flex gap-2">
          <button
            onClick={() => setScanMode(scanMode === "barcode" ? "none" : "barcode")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 transition-all font-semibold text-sm ${
              scanMode === "barcode"
                ? "border-red-100 text-red-600 bg-red-50 hover:bg-red-100"
                : "border-blue-100 text-blue-600 bg-blue-50 hover:bg-blue-100"
            }`}
          >
            {scanMode === "barcode" ? (
              <><X className="w-4 h-4" /> Tutup</>
            ) : (
              <><Camera className="w-4 h-4" /> Barcode</>
            )}
          </button>
          <button
            onClick={() => {
              setScanMode(scanMode === "text" ? "none" : "text");
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 transition-all font-semibold text-sm ${
              scanMode === "text"
                ? "border-red-100 text-red-600 bg-red-50 hover:bg-red-100"
                : "border-indigo-100 text-indigo-600 bg-indigo-50 hover:bg-indigo-100"
            }`}
          >
            {scanMode === "text" ? (
              <><X className="w-4 h-4" /> Tutup</>
            ) : (
              <><Search className="w-4 h-4" /> OCR Teks</>
            )}
          </button>
        </div>
      </div>

      {/* Scanner Views */}
      {scanMode === "barcode" && (
        <div className="animate-in slide-in-from-top-4 duration-300">
          <Scanner onScanSuccess={handleBarcodeSuccess} />
          <p className="text-center text-xs text-slate-500 mt-2">Arahkan kamera ke barcode garis</p>
        </div>
      )}
      
      {scanMode === "text" && (
        <div className="animate-in slide-in-from-top-4 duration-300">
          <TextScanner onScanResult={handleTextScanSuccess} />
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

              {/* Aksi Gudang */}
              <div className="flex flex-col gap-2 mt-2">
                <p className="text-xs font-bold text-slate-500 uppercase">Masukkan ke Keranjang</p>
                <div className="flex gap-2">
                  {(!activeTicketType || activeTicketType === "REQUEST") && (
                    <button onClick={() => addToCart("REQUEST", 1, "")} className="flex-1 bg-blue-100 text-blue-700 font-bold py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-blue-200 active:scale-95 transition-all">
                      <HandHelping className="w-4 h-4" /> Request
                    </button>
                  )}
                  {(!activeTicketType || activeTicketType === "STOCK_CHECK") && (
                    <button onClick={() => addToCart("STOCK_CHECK", 1, "")} className="flex-1 bg-indigo-100 text-indigo-700 font-bold py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-indigo-200 active:scale-95 transition-all">
                      <MessageSquare className="w-4 h-4" /> Tanya Stok
                    </button>
                  )}
                </div>
              </div>

              {/* Promo Info */}
              {product.acara && (
                <div className={`border rounded-xl p-3.5 flex flex-col gap-1.5 ${isPromoExpired ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
                  <div className="flex justify-between items-start">
                    <p className={`text-xs font-bold uppercase tracking-wide ${isPromoExpired ? 'text-red-700' : 'text-amber-700'}`}>
                      Info Promo
                    </p>
                    {isPromoExpired && (
                      <span className="bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase animate-pulse">
                        Promo Habis
                      </span>
                    )}
                  </div>
                  <p className={`text-sm font-medium leading-snug ${isPromoExpired ? 'text-red-800' : 'text-amber-800'}`}>
                    {product.acara}
                  </p>
                  {(product.fromDate || product.toDate) && (
                    <div className={`flex items-center gap-1.5 text-xs mt-1 ${isPromoExpired ? 'text-red-700' : 'text-amber-700'}`}>
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

      {/* Cart FAB */}
      {cart.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t shadow-[0_-10px_20px_rgba(0,0,0,0.05)] z-50 animate-in slide-in-from-bottom-full duration-300 max-w-md mx-auto">
          <div className="flex justify-between items-center mb-3">
            <div>
              <p className="text-xs text-slate-500 font-bold uppercase">Daftar Kirim</p>
              <p className="font-extrabold text-blue-700">{cart.length} Barang</p>
            </div>
            <button onClick={() => setCart([])} className="text-xs text-red-500 font-bold uppercase py-1 px-3 bg-red-50 rounded-lg">Kosongkan</button>
          </div>
          <button onClick={submitCart} disabled={submitting} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-xl shadow-lg shadow-blue-200 flex items-center justify-center gap-2 active:scale-95 transition-all">
            {submitting ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" /> : "Kirim Semua ke Gudang 🚀"}
          </button>
        </div>
      )}
    </div>
  );
}
