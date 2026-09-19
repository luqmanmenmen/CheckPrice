"use client";

import { useState, useRef } from "react";
import dynamic from "next/dynamic";
import { Search, Camera, X, CalendarRange, Tag, Package2, Layers, MessageSquare, HandHelping, LogOut, UserCircle2, CheckCircle2, XCircle, ScanText } from "lucide-react";
import { DetectedSku } from "@/components/TextScanner";
import { useEffect } from "react";
import AnimatedLogoutButton from "@/components/AnimatedLogoutButton";
import PullToRefresh from "@/components/PullToRefresh";
import useSWR from "swr";
import { Bell } from "lucide-react";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

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
  const [productsList, setProductsList] = useState<ProductData[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const [submitting, setSubmitting] = useState(false);
  const [qty, setQty] = useState(1);
  const [activeTab, setActiveTab] = useState<"REQUEST" | "STOCK_CHECK" | "ORDERS">("REQUEST");
  const [cart, setCart] = useState<any[]>([]);
  const [user, setUser] = useState<{name: string, nik: string, role: string, status?: string, jobTitle?: string} | null>(null);
  const [togglingStatus, setTogglingStatus] = useState(false);

  // Logout Summary States
  const [showSummary, setShowSummary] = useState(false);
  const [shiftSummary, setShiftSummary] = useState<any>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  const previousProcessedIds = useRef<Set<string>>(new Set());

  // Fetch SA's active tickets every 10 seconds to reduce DB load
  const { data: ticketData, mutate: mutateTickets } = useSWR(user && user.role === "SA" ? "/api/tickets" : null, fetcher, { refreshInterval: 10000 });
  const activeTickets = ticketData?.tickets || [];
  
  const pendingCount = activeTickets.filter((t: any) => t.status === "PENDING").length;
  const processedCount = activeTickets.filter((t: any) => ["READY", "OOS"].includes(t.status)).length;

  useEffect(() => {
    if (!activeTickets.length || !user || user.status === "BREAK") return;

    // We only care about tickets that just became READY or OOS
    const currentProcessedIds = new Set<string>(
      activeTickets.filter((t: any) => t.status === "READY" || t.status === "OOS").map((t: any) => t.id)
    );
    
    let hasNewProcessed = false;
    let newProcessedTickets: any[] = [];

    for (const id of currentProcessedIds) {
      if (!previousProcessedIds.current.has(id)) {
        hasNewProcessed = true;
        const ticket = activeTickets.find((t: any) => t.id === id);
        if (ticket) newProcessedTickets.push(ticket);
      }
    }

    if (hasNewProcessed && previousProcessedIds.current.size > 0) {
      playTingTong();
      
      // Show toasts for the newly processed tickets
      newProcessedTickets.forEach(t => {
        if (t.status === "READY") {
          showToast(`Pesanan ${t.sku} sudah READY!`, "success");
        } else if (t.status === "OOS") {
          showToast(`Pesanan ${t.sku} KOSONG!`, "error");
        }
      });
    }

    previousProcessedIds.current = currentProcessedIds;
  }, [activeTickets, user]);

  const playTingTong = () => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContext();
      
      const playTone = (freq: number, startTime: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.5, startTime);
        gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
        osc.start(startTime);
        osc.stop(startTime + duration);
      };

      const now = ctx.currentTime;
      playTone(659.25, now, 0.5); // Ting (E5)
      playTone(523.25, now + 0.4, 0.7); // Tong (C5)
    } catch (e) {
      console.error("Audio playback failed", e);
    }
  };

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

  const markAsCompleted = async (ticketId: string) => {
    try {
      await fetch("/api/tickets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId, status: "COMPLETED" })
      });
      mutateTickets();
    } catch (error) {
      console.error("Failed to mark ticket as completed:", error);
    }
  };

  const searchCounterRef = useRef(0);

  const searchProduct = async (identifier: string, page: number = 1) => {
    const trimmed = identifier.trim();
    if (!trimmed) return;

    const currentSearch = ++searchCounterRef.current;

    setLoading(true);
    setError("");
    if (page === 1) {
      setProduct(null);
      setProductsList([]);
    }

    try {
      const res = await fetch(`/api/product/${encodeURIComponent(trimmed)}?page=${page}`);
      
      // If a newer search was initiated while we were waiting, ignore this response
      if (searchCounterRef.current !== currentSearch) return;

      const data = await res.json();

      if (res.ok) {
        setError(""); // Explicitly clear any stale errors
        if (Array.isArray(data.data)) {
          setProductsList(data.data);
          setCurrentPage(data.meta?.page || 1);
          setTotalPages(data.meta?.totalPages || 1);
        } else {
          setProduct(data.data);
          setProductsList([]);
        }
        if (scanMode !== "none") setScanMode("none");
      } else {
        setError(data.error || "Produk tidak ditemukan");
      }
    } catch {
      if (searchCounterRef.current === currentSearch) {
        setError("Terjadi kesalahan jaringan.");
      }
    } finally {
      if (searchCounterRef.current === currentSearch) {
        setLoading(false);
      }
    }
  };

  const handleBarcodeSuccess = (result: string) => {
    setManualInput(result);
    searchProduct(result);
    setScanMode("none");
  };

  const handleTextScanSuccess = (sku: string) => {
    if (sku) {
      setManualInput(sku);
      searchProduct(sku);
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
    showToast(`Berhasil ditambahkan ke daftar. Total: ${cart.length + 1}`);
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
        showToast(`${cart.length} tiket berhasil dikirim ke Gudang!`);
        setCart([]);
      } else {
        showToast(data.error || "Gagal mengirim tiket", "error");
      }
    } catch (err) {
      showToast("Terjadi kesalahan jaringan", "error");
    } finally {
      setSubmitting(false);
      mutateTickets(); // refresh list after submit
    }
  };

  const handleClear = () => {
    setManualInput("");
    setProduct(null);
    setProductsList([]);
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

  const handleRefresh = async () => {
    window.location.reload();
  };

  return (
    <>
    {/* Toast Notification */}
    {toast && (
      <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-10 duration-300 font-bold text-sm whitespace-nowrap ${
        toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
      }`}>
        {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
        <span>{toast.message}</span>
      </div>
    )}

    <div className="w-full h-full">
      <div className={`flex flex-col lg:flex-row gap-6 max-w-7xl mx-auto w-full ${cart.length > 0 ? 'pb-32' : 'pb-6'}`}>
        <div className="flex-1 flex flex-col w-full">
          {/* User Header */}
          {user && (
            <div className="bg-gradient-to-r from-blue-700 to-indigo-800 lg:rounded-2xl p-5 pt-8 lg:pt-5 pb-6 shadow-md rounded-b-3xl flex justify-between items-start text-white mb-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 mt-1 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm border border-white/30 shrink-0">
                  <UserCircle2 className="w-6 h-6" />
                </div>
                <div className="flex flex-col items-start gap-2.5">
                  <div>
                    <p className="text-xs text-blue-200 font-medium tracking-wide uppercase">{user.jobTitle || 'Sales Area'}</p>
                    <h1 className="font-bold text-lg leading-tight">{user.name} <span className="text-blue-200 font-normal">({user.nik})</span></h1>
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
              <div className="flex flex-col items-end">
                <div className="scale-80 origin-top-right">
                  <AnimatedLogoutButton onLogout={handleLogoutClick} />
                </div>
              </div>
            </div>
          )}

      {/* Main Content Wrapper */}
      <div className="px-4 lg:px-0 flex flex-col gap-5">


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

      {/* Menu / Tabs Selection */}
      <div className="pt-2">
        <h2 className="text-sm font-bold text-slate-500 uppercase mb-2">Pilih Mode Pemindaian</h2>
        <div className="relative flex p-1 bg-slate-200/80 rounded-xl shadow-inner overflow-x-auto gap-1">
          <button
            onClick={() => setActiveTab("REQUEST")}
            className={`relative flex-1 py-3 px-2 rounded-lg flex items-center justify-center gap-2 transition-all duration-300 z-10 ${
              activeTab === "REQUEST" ? "bg-white shadow-sm text-blue-700 font-bold" : "text-slate-500 font-medium hover:text-slate-700"
            }`}
          >
            <HandHelping className="w-4 h-4" />
            <span className="text-xs font-semibold whitespace-nowrap">Request Barang</span>
          </button>
          <button
            onClick={() => setActiveTab("STOCK_CHECK")}
            className={`relative flex-1 py-3 px-2 rounded-lg flex items-center justify-center gap-2 transition-all duration-300 z-10 ${
              activeTab === "STOCK_CHECK" ? "bg-white shadow-sm text-indigo-700 font-bold" : "text-slate-500 font-medium hover:text-slate-700"
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span className="text-xs font-semibold whitespace-nowrap">Tanya Stok</span>
          </button>
          <button
            onClick={() => setActiveTab("ORDERS")}
            className={`relative flex-1 py-3 px-2 rounded-lg flex items-center justify-center gap-2 transition-all duration-300 z-10 ${
              activeTab === "ORDERS" ? "bg-white shadow-sm text-amber-700 font-bold" : "text-slate-500 font-medium hover:text-slate-700"
            }`}
          >
            <div className="relative">
               <Bell className={`w-4 h-4 ${activeTab === 'ORDERS' ? 'text-amber-600' : 'text-slate-400'}`} />
               {(pendingCount > 0 || processedCount > 0) && (
                 <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                   <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${processedCount > 0 ? 'bg-green-400' : 'bg-amber-400'}`}></span>
                   <span className={`relative inline-flex rounded-full h-2.5 w-2.5 border-white border ${processedCount > 0 ? 'bg-green-500' : 'bg-amber-500'}`}></span>
                 </span>
               )}
            </div>
            <span className="text-xs font-semibold whitespace-nowrap">Cek Pesanan</span>
          </button>
        </div>
      </div>

      {activeTab === "ORDERS" ? (
        <div className="pt-2 flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <h2 className="text-sm font-bold text-slate-500 uppercase mb-1">Daftar Pesanan Aktif</h2>
          {activeTickets.length === 0 ? (
            <div className="flex flex-col items-center py-12 opacity-50 bg-slate-50 rounded-2xl border-2 border-dashed">
              <CheckCircle2 className="w-12 h-12 mb-2 text-slate-400" />
              <p className="text-center font-bold text-slate-500">Tidak ada pesanan aktif.</p>
              <p className="text-xs text-center mt-1">Semua pesanan sudah selesai.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {activeTickets.map((t: any) => (
                <div key={t.id} className="bg-white border shadow-sm p-4 rounded-xl flex flex-col gap-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[10px] font-bold uppercase text-slate-400">{t.type === 'REQUEST' ? 'Request' : 'Tanya Stok'}</span>
                      <p className="font-black text-lg text-slate-800">{t.sku}</p>
                      <p className="text-sm font-bold text-slate-600 max-w-[280px] leading-tight">{t.productName}</p>
                      {t.hargaNormal > 0 && (
                        <p className="text-xs font-semibold text-blue-600 mt-0.5">Rp {t.hargaNormal.toLocaleString('id-ID')}</p>
                      )}
                      <p className="text-xs font-medium text-slate-500 mt-0.5">{new Date(t.createdAt).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}</p>
                    </div>
                    <span className={`text-[10px] font-bold px-3 py-1.5 rounded-full border uppercase tracking-wider ${
                      t.status === 'READY' ? 'bg-green-50 text-green-700 border-green-200' :
                      t.status === 'OOS' ? 'bg-red-50 text-red-700 border-red-200' :
                      'bg-amber-50 text-amber-700 border-amber-200'
                    }`}>
                      {t.status === 'READY' ? 'READY (Ada)' : t.status === 'OOS' ? 'KOSONG' : 'MENUNGGU'}
                    </span>
                  </div>
                  
                  {/* Action to clear it from list */}
                  {(t.status === 'READY' || t.status === 'OOS') && (
                    <button 
                      onClick={() => markAsCompleted(t.id)}
                      className="w-full mt-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-lg text-sm transition-colors active:scale-95"
                    >
                      Selesai & Tutup Pesanan
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Search */}
          <div className="pt-2 flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300">
        <h2 className="text-sm font-bold text-slate-500 uppercase mb-2">Cari Info Produk</h2>
        
        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              placeholder="Ketik SKU, Barcode, atau Nama Produk..."
              className="w-full pl-10 pr-20 py-3.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm font-mono"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchProduct(manualInput)}
              autoFocus
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
              {manualInput && (
                <button onClick={handleClear} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              )}
              {!manualInput && (
                <button 
                  onClick={() => setScanMode(scanMode === "text" ? "none" : "text")}
                  className={`text-slate-400 hover:text-indigo-600 transition-colors ${scanMode === "text" ? "text-indigo-600" : ""}`}
                >
                  <ScanText className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
          <button
            onClick={() => searchProduct(manualInput)}
            className="bg-blue-600 text-white px-5 py-3.5 rounded-xl hover:bg-blue-700 transition-colors font-semibold shadow-sm text-sm"
          >
            Cari
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

      {/* Products List Selection */}
      {productsList.length > 0 && !loading && (
        <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden animate-in slide-in-from-bottom-6 duration-400 p-4">
          <h2 className="text-sm font-bold text-slate-500 uppercase mb-3">Pilih Produk:</h2>
          <div className="flex flex-col gap-2">
            {productsList.map((p) => {
              const { name, details } = parseDescription(p.description);
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    setProduct(p);
                    setProductsList([]);
                  }}
                  className="text-left p-3 border rounded-xl hover:bg-blue-50 hover:border-blue-200 transition-colors"
                >
                  <p className="font-bold text-slate-800">{name}</p>
                  {details && <p className="text-xs text-slate-500 truncate">{details}</p>}
                  <div className="flex gap-2 mt-2">
                    <span className="text-[10px] font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-600">SKU: {p.sku}</span>
                    <span className="text-[10px] font-bold text-blue-600">{formatRupiah(p.hargaPromo || p.hargaNormal)}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex justify-between items-center mt-4 pt-4 border-t border-slate-100">
              <button 
                onClick={() => searchProduct(manualInput, currentPage - 1)}
                disabled={currentPage <= 1 || loading}
                className="px-4 py-2 bg-slate-100 text-slate-600 font-bold text-xs rounded-lg disabled:opacity-50 hover:bg-slate-200 transition-colors"
              >
                Sebelumnya
              </button>
              <span className="text-xs font-bold text-slate-500">
                Hal {currentPage} dari {totalPages}
              </span>
              <button 
                onClick={() => searchProduct(manualInput, currentPage + 1)}
                disabled={currentPage >= totalPages || loading}
                className="px-4 py-2 bg-blue-100 text-blue-700 font-bold text-xs rounded-lg disabled:opacity-50 hover:bg-blue-200 transition-colors"
              >
                Selanjutnya
              </button>
            </div>
          )}
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
                  {activeTab === "REQUEST" && (
                    <button onClick={() => addToCart("REQUEST", 1, "")} className="w-full bg-blue-100 text-blue-700 font-bold py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-blue-200 active:scale-95 transition-all">
                      <HandHelping className="w-4 h-4" /> Request Barang Ini
                    </button>
                  )}
                  {activeTab === "STOCK_CHECK" && (
                    <button onClick={() => addToCart("STOCK_CHECK", 1, "")} className="w-full bg-indigo-100 text-indigo-700 font-bold py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-indigo-200 active:scale-95 transition-all">
                      <MessageSquare className="w-4 h-4" /> Tanya Stok Barang Ini
                    </button>
                  )}
                </div>
              </div>

              {/* Promo Info - hanya tampil jika ada harga promo aktif */}
              {isOnPromo && product.acara && (
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
      {!product && productsList.length === 0 && !loading && !error && (
        <div className="flex flex-col items-center py-12 gap-3 text-slate-400">
          <Search className="w-14 h-14 opacity-30" />
          <p className="text-sm">Masukkan SKU, Barcode, atau Nama Produk</p>
          <p className="text-xs opacity-70 text-center">Contoh: 13463728 atau "Kemeja"</p>
        </div>
      )}
      </>
      )}

      </div> {/* End Main Content Wrapper */}
      
      </div> {/* End left column */}

      {/* Cart FAB (Mobile) / Sidebar (Desktop) */}
      {cart.length > 0 && (
        <div className="fixed lg:sticky lg:top-24 bottom-0 left-0 right-0 lg:left-auto lg:right-auto p-4 lg:p-5 bg-white lg:rounded-2xl lg:border border-t shadow-[0_-10px_20px_rgba(0,0,0,0.05)] lg:shadow-xl z-50 animate-in slide-in-from-bottom-full lg:slide-in-from-right-8 duration-300 w-full lg:w-[350px] mx-auto h-fit">
          <div className="flex justify-between items-center mb-3">
            <div>
              <p className="text-xs text-slate-500 font-bold uppercase">Daftar Kirim</p>
              <p className="font-extrabold text-blue-700">{cart.length} Barang</p>
            </div>
            <button onClick={() => setCart([])} className="text-xs text-red-500 font-bold uppercase py-1 px-3 bg-red-50 rounded-lg hover:bg-red-100 transition-colors">Kosongkan</button>
          </div>
          
          {/* Desktop Cart Items Preview */}
          <div className="hidden lg:flex flex-col gap-2 mb-4 max-h-[40vh] overflow-y-auto pr-1">
            {cart.map((item, idx) => (
              <div key={idx} className="text-xs border rounded p-2 flex justify-between items-center bg-slate-50">
                <div className="truncate pr-2">
                  <span className="font-bold block truncate">{item.productName.split(':')[0]}</span>
                  <span className="text-slate-500">{item.sku}</span>
                </div>
                <div className="font-bold text-blue-700">{item.type === 'REQUEST' ? 'REQ' : 'CEK'}</div>
              </div>
            ))}
          </div>

          <button onClick={submitCart} disabled={submitting} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-xl shadow-lg shadow-blue-200 flex items-center justify-center gap-2 active:scale-95 transition-all">
            {submitting ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" /> : "Kirim Semua ke Gudang 🚀"}
          </button>
        </div>
      )}

      </div>
    </div>
    </>
  );
}
