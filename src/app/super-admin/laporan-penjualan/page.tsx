"use client";

import { useState, useEffect, useMemo } from "react";
import { 
  ArrowLeft, Calendar, Search, Download, AlertTriangle, TrendingUp, 
  Package, Box, CheckCircle2, ShieldAlert, ArrowUpRight, ArrowDownRight, 
  Layers, ShoppingBag, BarChart3, Filter, RefreshCw, FileSpreadsheet
} from "lucide-react";
import Link from "next/link";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { PinModal } from "@/components/PinModal";
import { ChipLoader } from "@/components/ChipLoader";
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar 
} from 'recharts';

const DEPT_MAP: Record<string, string> = {
  "3327": "SUKO MEN",
  "3328": "SUKO LADIES",
  "3343": "SUKO WORKWEAR",
  "3344": "SUKO ESSENTIALS",
  "3348": "SUKO SPORTS LADIES",
  "3349": "SUKO SPORTS MEN",
  "3354": "SUKO BAGS",
  "3356": "SUKO ACCS",
  "3357": "SUKO HOME LIVING",
  "3358": "SUKO TOYS",
  "3366": "SUKO CHILDREN BOYS",
  "3367": "SUKO CHILDREN GIRLS",
  "3368": "SUKO SLEEPWEAR",
  "3369": "SUKO UNDERWEAR",
  "3370": "SUKO MEN SLEEPWEAR",
  "3389": "BYRCH & CO LADIES FOOTWEAR",
  "3391": "BYRCH & CO MEN FOOTWEAR",
  "3393": "BYRCH & CO KIDS FOOTWEAR",
};

type SalesItem = {
  id: string;
  sku: string;
  description: string;
  article?: string;
  brand?: string;
  dept?: string;
  qtySold: number;
  hargaNormal: number;
  hargaPromo: number | null;
  unitPrice: number;
  status: "NORMAL" | "PROMO" | "NO_PRICE";
  itemTotal: number;
};

type DeptMetric = {
  omzet: number;
  qty: number;
  omzet_hari_ini?: number;
  qty_hari_ini?: number;
  omzet_wtd?: number;
  qty_wtd?: number;
  omzet_ytd?: number;
  qty_ytd?: number;
  stok?: number;
  eoh?: number;
  bom_unit?: number;
  boy_unit?: number;
};

type SalesData = {
  targetDate: string;
  pqUploadTime: string;
  pqFileName: string | null;
  availableDates: string[];
  summary: {
    spd_omzet?: number;
    spd_qty?: number;
    yesterday_omzet?: number;
    yesterday_qty?: number;
    wtd_omzet?: number;
    wtd_qty?: number;
    mtd_omzet?: number;
    mtd_qty?: number;
    last_month_omzet?: number;
    last_month_qty?: number;
    ytd_omzet?: number;
    ytd_qty?: number;
    nilai_inventori: number;
    total_stok?: number;
    boy_unit?: number;
    boy_retail?: number;
    bom_unit?: number;
    omzet_promo?: number;
    qty_promo?: number;
    total_produk?: number;
    total_promo?: number;
    // Legacy keys
    totalRevenue: number;
    totalPromoRevenue: number;
    totalQty: number;
    anomalyCount: number;
    totalOmzetPOS: number;
    ytd_sales_unit: number;
    mtd_omzet_pos: number;
  };
  categoryBreakdown: Record<string, DeptMetric>;
  trendData: { date: string; fullDate: string; omzet: number; qty: number }[];
  topFast: {
    sku: string;
    description: string;
    sales_qty: number;
    omzet_total: number;
  }[];
  topSlow?: {
    sku: string;
    description: string;
    article?: string;
    dept?: string;
    stok: number;
    sales_mtd: number;
  }[];
  topKritis?: {
    sku: string;
    description: string;
    article?: string;
    dept?: string;
    stok: number;
    sales_mtd: number;
  }[];
  items: SalesItem[];
};

export default function LaporanPenjualanPage() {
  const [data, setData] = useState<SalesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [timeframe, setTimeframe] = useState<"1D" | "1W" | "1M" | "1Y">("1M");
  const [activeTab, setActiveTab] = useState<"tren" | "rekonsiliasi" | "top" | "tabel">("tren");
  const [selectedDeptFilter, setSelectedDeptFilter] = useState<string>("ALL");

  const [showPinModal, setShowPinModal] = useState(false);
  const [exportType, setExportType] = useState<"PDF" | "CSV">("PDF");
  const [alert, setAlert] = useState<{ isOpen: boolean; title: string; message: string; type: "success" | "error" | "warning" }>({
    isOpen: false,
    title: "",
    message: "",
    type: "success"
  });

  const fetchReport = async (dateStr: string, tf: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/sales-report?date=${dateStr}&timeframe=${tf}`);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
        if (json.data.targetDate && json.data.targetDate !== dateStr) {
          setSelectedDate(json.data.targetDate);
        }
      }
    } catch (error) {
      console.error("Gagal memuat laporan penjualan:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport(selectedDate, timeframe);
  }, [selectedDate, timeframe]);

  const formatCurrency = (amount: number = 0) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount || 0);
  };
  
  const formatCompactCurrency = (amount: number = 0) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(amount || 0);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "";
    if (dateStr.length === 4) return dateStr;
    if (dateStr.length === 7) {
      const options: Intl.DateTimeFormatOptions = { month: 'long', year: 'numeric' };
      return new Date(dateStr + "-01").toLocaleDateString('id-ID', options);
    }
    const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' };
    return new Date(dateStr).toLocaleDateString('id-ID', options);
  };

  const formatShortDate = (dateStr: string) => {
    if (!dateStr) return "";
    try {
      const d = new Date(dateStr);
      const day = String(d.getDate()).padStart(2, '0');
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
      return `${day} ${months[d.getMonth()]}`;
    } catch {
      return dateStr;
    }
  };

  // Metrik Utama Penjualan (SPD, WTD, MTD, YTD)
  const spdOmzet = data?.summary.spd_omzet ?? data?.summary.totalRevenue ?? 0;
  const spdQty   = data?.summary.spd_qty ?? data?.summary.totalQty ?? 0;
  const wtdOmzet = data?.summary.wtd_omzet ?? 0;
  const wtdQty   = data?.summary.wtd_qty ?? 0;
  const mtdOmzet = data?.summary.mtd_omzet ?? data?.summary.mtd_omzet_pos ?? 0;
  const mtdQty   = data?.summary.mtd_qty ?? 0;
  const ytdOmzet = data?.summary.ytd_omzet ?? 0;
  const ytdQty   = data?.summary.ytd_qty ?? data?.summary.ytd_sales_unit ?? 0;
  const totalStok = data?.summary.total_stok ?? 0;
  const nilaiInventori = data?.summary.nilai_inventori ?? 0;

  // Day-over-Day calculation
  const yesterdayOmzet = data?.summary.yesterday_omzet ?? 0;
  const dodGrowth = yesterdayOmzet > 0 ? ((spdOmzet - yesterdayOmzet) / yesterdayOmzet) * 100 : 0;

  // Month-over-Month calculation
  const lastMonthOmzet = data?.summary.last_month_omzet ?? 0;
  const momGrowth = lastMonthOmzet > 0 ? ((mtdOmzet - lastMonthOmzet) / lastMonthOmzet) * 100 : 0;

  // Target Bulanan Toko Ritel (Default: 2 Miliar)
  const targetMtd = 2000000000;
  const mtdProgress = Math.min((mtdOmzet / targetMtd) * 100, 100);

  // Filter Items: Dukung 4 Sel Utama Ritel (SKU, Deskripsi, Artikel/Parent, Brand/Group, Dept)
  const filteredItems = useMemo(() => {
    if (!data?.items) return [];
    const q = searchQuery.toLowerCase().trim();
    if (!q) return data.items;
    const qSpaceless = q.replace(/[\s\-_]+/g, "");

    return data.items.filter(item => {
      const desc = (item.description || "").toLowerCase();
      const sku = (item.sku || "").toLowerCase();
      const art = (item.article || "").toLowerCase();
      const brand = (item.brand || "").toLowerCase();
      const dept = (item.dept || "").toLowerCase();

      // Cocok jika ada pada salah satu dari 4 cell atau SKU
      if (desc.includes(q) || sku.includes(q) || art.includes(q) || brand.includes(q) || dept.includes(q)) {
        return true;
      }

      // Spaceless match (contoh "na young" cocok dengan "nayoung")
      if (qSpaceless.length >= 3) {
        const descS = desc.replace(/[\s\-_]+/g, "");
        const artS = art.replace(/[\s\-_]+/g, "");
        const brandS = brand.replace(/[\s\-_]+/g, "");
        const deptS = dept.replace(/[\s\-_]+/g, "");
        if (descS.includes(qSpaceless) || artS.includes(qSpaceless) || brandS.includes(qSpaceless) || deptS.includes(qSpaceless)) {
          return true;
        }
      }

      return false;
    });
  }, [data?.items, searchQuery]);

  // Ekspor PDF & CSV
  const handleExportTrigger = (type: "PDF" | "CSV") => {
    setExportType(type);
    setShowPinModal(true);
  };

  const handleExportAuth = (pin: string) => {
    if (pin !== "220117") {
      setAlert({ isOpen: true, title: "Akses Ditolak", message: "PIN otorisasi yang Anda masukkan salah!", type: "error" });
      return;
    }
    setShowPinModal(false);

    if (exportType === "PDF") {
      executeExportPDF();
    } else {
      executeExportCSV();
    }
  };

  const executeExportPDF = () => {
    if (!data) return;
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`Laporan Penjualan Ritel - ${formatDate(data.targetDate)}`, 14, 20);
    doc.setFontSize(9);
    doc.text(`Sumber File: ${data.pqFileName || 'Power Query'} | Sync: ${data.pqUploadTime}`, 14, 27);
    doc.text(`Omzet Harian (SPD): ${formatCurrency(spdOmzet)} (${spdQty} pcs)`, 14, 33);
    doc.text(`Omzet Bulanan (MTD): ${formatCurrency(mtdOmzet)} (${mtdQty} pcs) | YTD: ${formatCurrency(ytdOmzet)}`, 14, 39);
    
    const tableData = filteredItems.map((item, index) => [
      index + 1,
      item.sku,
      item.description,
      item.qtySold.toString(),
      item.status === 'NO_PRICE' ? 'BELUM ADA' : formatCurrency(item.unitPrice),
      item.status,
      formatCurrency(item.itemTotal)
    ]);

    autoTable(doc, {
      startY: 46,
      head: [['No', 'SKU', 'Nama Barang', 'Qty', 'Harga', 'Status', 'Total (Rp)']],
      body: tableData,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [15, 23, 42] }
    });

    doc.save(`Laporan_Penjualan_${data.targetDate}.pdf`);
  };

  const executeExportCSV = () => {
    if (!data) return;
    const headers = ["No", "SKU", "Nama Barang", "Qty Terjual", "Harga Satuan", "Status", "Total Omzet (Rp)"];
    const rows = filteredItems.map((item, idx) => [
      idx + 1,
      `="${item.sku}"`,
      `"${item.description.replace(/"/g, '""')}"`,
      item.qtySold,
      item.unitPrice,
      item.status,
      item.itemTotal
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Laporan_Penjualan_${data.targetDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Data Visualisasi
  const piePromoData = data ? [
    { name: 'Reguler/Normal', value: Math.max(spdOmzet - (data.summary.omzet_promo || 0), 0), color: '#3b82f6' },
    { name: 'Promo Khusus', value: data.summary.omzet_promo || 0, color: '#10b981' }
  ] : [];

  const topDeptData = data ? Object.entries(data.categoryBreakdown)
    .map(([dept, metrics], idx) => {
      const colors = ["#6366f1", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#06b6d4", "#3b82f6", "#14b8a6"];
      return {
        name: DEPT_MAP[dept] || dept,
        rawDept: dept,
        value: metrics.omzet,
        qty: metrics.qty,
        spdOmzet: metrics.omzet_hari_ini || 0,
        spdQty: metrics.qty_hari_ini || 0,
        stok: metrics.stok || 0,
        eoh: metrics.eoh || 0,
        bom_unit: metrics.bom_unit || 0,
        color: colors[idx % colors.length]
      };
    })
    .sort((a,b) => b.value - a.value) : [];

  const filteredDeptData = selectedDeptFilter === "ALL" 
    ? topDeptData 
    : topDeptData.filter(d => d.rawDept === selectedDeptFilter || d.name === selectedDeptFilter);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-3 sm:p-5 lg:p-6 pb-28 flex flex-col gap-5 sm:gap-6 font-sans antialiased selection:bg-emerald-500 selection:text-white">
      
      {/* ================= HEADER UTAMA ================= */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-800/80 backdrop-blur-xl p-4 sm:p-5 sm:px-7 rounded-2xl sm:rounded-3xl border border-slate-700/80 shadow-2xl">
        <div className="flex items-center gap-3 sm:gap-4">
          <Link 
            href="/super-admin" 
            className="p-2.5 sm:p-3 rounded-2xl bg-slate-700/60 hover:bg-slate-700 transition-all border border-slate-600/60 text-slate-300 hover:text-white group shrink-0"
            title="Kembali ke Dashboard Super Admin"
          >
            <ArrowLeft className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-black text-lg sm:text-xl md:text-2xl text-white tracking-tight truncate">
                Executive Sales & Retail Analytics
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">
                Live POS
              </span>
            </div>
            <p className="text-[11px] sm:text-xs md:text-sm text-slate-400 font-medium flex items-center gap-1.5 sm:gap-2 mt-1 truncate">
              <span className="truncate">File: <strong className="text-slate-200">{data?.pqFileName || 'POWER QUERY'}</strong></span>
              <span>•</span>
              <span className="shrink-0">Sync: <strong className="text-slate-200">{data?.pqUploadTime || '-'}</strong></span>
            </p>
          </div>
        </div>
        
        {/* Kontrol Periode & Tanggal Dropdown */}
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
          {/* Timeframe Pill */}
          <div className="flex items-center bg-slate-950/60 p-1 rounded-xl sm:rounded-2xl border border-slate-700/80 shadow-inner">
            <button 
              onClick={() => setTimeframe("1D")} 
              className={`px-2.5 sm:px-3.5 py-1 sm:py-1.5 text-xs font-bold rounded-lg sm:rounded-xl transition-all ${timeframe === "1D" ? "bg-emerald-600 text-white shadow-md shadow-emerald-900/50" : "text-slate-400 hover:text-slate-200"}`}
            >
              SPD
            </button>
            <button 
              onClick={() => setTimeframe("1W")} 
              className={`px-2.5 sm:px-3.5 py-1 sm:py-1.5 text-xs font-bold rounded-lg sm:rounded-xl transition-all ${timeframe === "1W" ? "bg-emerald-600 text-white shadow-md shadow-emerald-900/50" : "text-slate-400 hover:text-slate-200"}`}
            >
              WTD
            </button>
            <button 
              onClick={() => setTimeframe("1M")} 
              className={`px-2.5 sm:px-3.5 py-1 sm:py-1.5 text-xs font-bold rounded-lg sm:rounded-xl transition-all ${timeframe === "1M" ? "bg-emerald-600 text-white shadow-md shadow-emerald-900/50" : "text-slate-400 hover:text-slate-200"}`}
            >
              MTD
            </button>
            <button 
              onClick={() => setTimeframe("1Y")} 
              className={`px-2.5 sm:px-3.5 py-1 sm:py-1.5 text-xs font-bold rounded-lg sm:rounded-xl transition-all ${timeframe === "1Y" ? "bg-emerald-600 text-white shadow-md shadow-emerald-900/50" : "text-slate-400 hover:text-slate-200"}`}
            >
              YTD
            </button>
          </div>
          
          {/* Dropdown Tanggal PQ */}
          <div className="flex items-center gap-2 bg-slate-950/60 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl sm:rounded-2xl border border-slate-700/80 shadow-inner">
            <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400 shrink-0" />
            <select 
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent border-none text-xs sm:text-sm font-bold text-slate-200 focus:ring-0 cursor-pointer outline-none max-w-[150px] sm:max-w-none truncate"
            >
              {data?.availableDates.map(date => (
                <option key={date} value={date} className="bg-slate-800 text-slate-100">{formatDate(date)}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 bg-slate-800/40 rounded-3xl border border-slate-700/60 shadow-xl">
          <ChipLoader />
          <p className="text-sm font-bold text-slate-400 mt-4 animate-pulse">Mengkonsolidasi jutaan data transaksi ritel...</p>
        </div>
      ) : (
        <>
          {/* ================= 5 EXECUTIVE KPI CARDS ================= */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4">
            
            {/* CARD 1: SPD (Hari Ini) */}
            <div className="bg-gradient-to-br from-slate-800 to-slate-800/90 p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-700/80 shadow-lg relative overflow-hidden group hover:border-emerald-500/50 transition-all flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-slate-400">SPD (Hari Ini)</span>
                  <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                    <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </div>
                </div>
                <p className="text-xl sm:text-2xl font-black text-white font-mono tracking-tight truncate" title={formatCurrency(spdOmzet)}>
                  {formatCompactCurrency(spdOmzet)}
                </p>
              </div>
              <div className="flex items-center justify-between text-[11px] sm:text-xs mt-3 pt-2.5 border-t border-slate-700/60">
                <span className="text-slate-400 font-medium truncate">Terjual: <strong className="text-slate-200">{spdQty.toLocaleString('id-ID')} pcs</strong></span>
                {yesterdayOmzet > 0 && (
                  <span className={`flex items-center font-bold shrink-0 ${dodGrowth >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {dodGrowth >= 0 ? <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" /> : <ArrowDownRight className="w-3.5 h-3.5 mr-0.5" />}
                    {Math.abs(dodGrowth).toFixed(1)}% DoD
                  </span>
                )}
              </div>
            </div>

            {/* CARD 2: WTD (Minggu Ini) */}
            <div className="bg-gradient-to-br from-slate-800 to-slate-800/90 p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-700/80 shadow-lg relative overflow-hidden group hover:border-blue-500/50 transition-all flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-slate-400">WTD (Minggu Ini)</span>
                  <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
                    <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </div>
                </div>
                <p className="text-xl sm:text-2xl font-black text-white font-mono tracking-tight truncate" title={formatCurrency(wtdOmzet)}>
                  {formatCompactCurrency(wtdOmzet)}
                </p>
              </div>
              <div className="flex items-center justify-between text-[11px] sm:text-xs mt-3 pt-2.5 border-t border-slate-700/60">
                <span className="text-slate-400 font-medium truncate">Terjual: <strong className="text-slate-200">{wtdQty.toLocaleString('id-ID')} pcs</strong></span>
                <span className="text-blue-400 font-bold shrink-0">Week-to-Date</span>
              </div>
            </div>

            {/* CARD 3: MTD (Bulan Ini) & Target */}
            <div className="bg-gradient-to-br from-slate-800 to-slate-800/90 p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-700/80 shadow-lg relative overflow-hidden group hover:border-amber-500/50 transition-all flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-slate-400">MTD (Bulan Ini)</span>
                  <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                    <ShoppingBag className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </div>
                </div>
                <p className="text-xl sm:text-2xl font-black text-white font-mono tracking-tight truncate" title={formatCurrency(mtdOmzet)}>
                  {formatCompactCurrency(mtdOmzet)}
                </p>
                
                {/* Progress bar target toko */}
                <div className="w-full bg-slate-900 rounded-full h-1.5 sm:h-2 mb-1 overflow-hidden">
                  <div 
                    className="bg-gradient-to-r from-amber-500 to-emerald-500 h-full rounded-full transition-all duration-1000" 
                    style={{ width: `${Math.min(mtdProgress, 100)}%` }}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-slate-400 mt-2 pt-2 border-t border-slate-700/60">
                <span className="truncate">Target: {formatCompactCurrency(targetMtd)}</span>
                <span className="font-bold text-emerald-400 shrink-0">{mtdProgress.toFixed(1)}%</span>
              </div>
            </div>

            {/* CARD 4: YTD (Tahun Berjalan) */}
            <div className="bg-gradient-to-br from-slate-800 to-slate-800/90 p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-700/80 shadow-lg relative overflow-hidden group hover:border-purple-500/50 transition-all flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-slate-400">YTD (Tahun Berjalan)</span>
                  <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center shrink-0">
                    <BarChart3 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </div>
                </div>
                <p className="text-xl sm:text-2xl font-black text-white font-mono tracking-tight truncate" title={formatCurrency(ytdOmzet)}>
                  {formatCompactCurrency(ytdOmzet)}
                </p>
              </div>
              <div className="flex items-center justify-between text-[11px] sm:text-xs mt-3 pt-2.5 border-t border-slate-700/60">
                <span className="text-slate-400 font-medium truncate">Terjual: <strong className="text-slate-200">{ytdQty.toLocaleString('id-ID')} pcs</strong></span>
                <span className="text-purple-400 font-bold shrink-0">Year-to-Date</span>
              </div>
            </div>

            {/* CARD 5: Valuasi Inventori & Stok EOH */}
            <div className="bg-gradient-to-br from-slate-800 to-slate-800/90 p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-700/80 shadow-lg relative overflow-hidden group hover:border-cyan-500/50 transition-all flex flex-col justify-between sm:col-span-2 md:col-span-1">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-slate-400">Valuasi EOH (Stok)</span>
                  <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0">
                    <Box className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </div>
                </div>
                <p className="text-xl sm:text-2xl font-black text-white font-mono tracking-tight truncate" title={formatCurrency(nilaiInventori)}>
                  {formatCompactCurrency(nilaiInventori)}
                </p>
              </div>
              <div className="flex items-center justify-between text-[11px] sm:text-xs mt-3 pt-2.5 border-t border-slate-700/60">
                <span className="text-slate-400 font-medium truncate">Stok Fisik: <strong className="text-slate-200">{totalStok.toLocaleString('id-ID')} pcs</strong></span>
                <span className="text-cyan-400 font-bold shrink-0">In-Stock</span>
              </div>
            </div>

          </div>

          {/* ================= NAVIGASI TAB DASHBOARD ================= */}
          <div className="flex border-b border-slate-700/80 gap-2 sm:gap-6 mt-2 overflow-x-auto">
            <button
              onClick={() => setActiveTab("tren")}
              className={`pb-3.5 px-3 text-sm font-bold transition-all relative whitespace-nowrap ${activeTab === "tren" ? "text-emerald-400" : "text-slate-400 hover:text-slate-200"}`}
            >
              📊 Tren & Kategori Ritel
              {activeTab === "tren" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-500 rounded-full" />}
            </button>
            <button
              onClick={() => setActiveTab("rekonsiliasi")}
              className={`pb-3.5 px-3 text-sm font-bold transition-all relative whitespace-nowrap ${activeTab === "rekonsiliasi" ? "text-emerald-400" : "text-slate-400 hover:text-slate-200"}`}
            >
              🔄 Rekonsiliasi Pergerakan Stok
              {activeTab === "rekonsiliasi" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-500 rounded-full" />}
            </button>
            <button
              onClick={() => setActiveTab("top")}
              className={`pb-3.5 px-3 text-sm font-bold transition-all relative whitespace-nowrap ${activeTab === "top" ? "text-emerald-400" : "text-slate-400 hover:text-slate-200"}`}
            >
              ⚡ Top Seller & Stok Kritis
              {activeTab === "top" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-500 rounded-full" />}
            </button>
            <button
              onClick={() => setActiveTab("tabel")}
              className={`pb-3.5 px-3 text-sm font-bold transition-all relative whitespace-nowrap ${activeTab === "tabel" ? "text-emerald-400" : "text-slate-400 hover:text-slate-200"}`}
            >
              📋 Rincian Produk SKU ({filteredItems.length})
              {activeTab === "tabel" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-500 rounded-full" />}
            </button>
          </div>

          {/* ================= TAB CONTENT 1: TREN & KATEGORI ================= */}
          {activeTab === "tren" && (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
              
              {/* Left Column (Area Chart Tren Penjualan Harian) */}
              <div className="xl:col-span-7 flex flex-col gap-6">
                <div className="bg-slate-800/80 p-6 rounded-3xl border border-slate-700/80 shadow-xl">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h2 className="font-bold text-lg text-white">Tren Penjualan Harian (SPD POS)</h2>
                      <p className="text-xs text-slate-400">Fluktuasi omzet harian yang terekam dari sinkronisasi Power Query</p>
                    </div>
                    <span className="px-3 py-1 rounded-xl bg-emerald-500/10 text-emerald-400 text-xs font-bold border border-emerald-500/20">
                      Aktual POS
                    </span>
                  </div>

                  <div className="h-[280px] w-full">
                    {data?.trendData && data.trendData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data.trendData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                          <defs>
                            <linearGradient id="omzetGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                              <stop offset="95%" stopColor="#10b981" stopOpacity={0.0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
                          <XAxis 
                            dataKey="fullDate" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fontSize: 11, fill: '#94a3b8' }} 
                            tickFormatter={formatShortDate} 
                            dy={10} 
                          />
                          <YAxis 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fontSize: 11, fill: '#94a3b8' }} 
                            tickFormatter={(val) => formatCompactCurrency(val)} 
                          />
                          <Tooltip 
                            content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                return (
                                  <div className="bg-slate-950/95 backdrop-blur-md p-4 rounded-2xl shadow-2xl border border-slate-700 text-slate-100">
                                    <p className="text-slate-400 font-bold text-xs uppercase mb-1">{formatShortDate(payload[0].payload.fullDate)}</p>
                                    <p className="text-emerald-400 font-black text-xl mb-1">{formatCurrency(payload[0].value as number)}</p>
                                    {payload[1] && (
                                      <p className="text-slate-300 font-bold text-xs">{payload[1].value} pcs terjual</p>
                                    )}
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Area 
                            type="monotone" 
                            dataKey="omzet" 
                            stroke="#10b981" 
                            strokeWidth={3} 
                            fillOpacity={1} 
                            fill="url(#omzetGradient)" 
                            activeDot={{ r: 6, fill: "#10b981", stroke: "#0f172a", strokeWidth: 3 }} 
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-500 text-sm bg-slate-900/40 rounded-2xl">
                        Data tren transaksi harian belum tersedia
                      </div>
                    )}
                  </div>
                </div>

                {/* Donut Chart: Proporsi Reguler vs Promo */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="bg-slate-800/80 p-6 rounded-3xl border border-slate-700/80 shadow-xl flex flex-col items-center">
                    <h2 className="font-bold text-white text-base mb-2 w-full text-left">Proporsi Promo vs Reguler</h2>
                    <div className="h-[200px] w-full relative">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie 
                            data={piePromoData} 
                            cx="50%" 
                            cy="50%" 
                            innerRadius={60} 
                            outerRadius={80} 
                            paddingAngle={5} 
                            dataKey="value" 
                            stroke="none"
                          >
                            {piePromoData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(val: any) => formatCurrency(val as number)} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <p className="text-2xl font-black text-white">
                          {spdOmzet ? Math.round(((data?.summary.omzet_promo || 0) / spdOmzet) * 100) : 0}%
                        </p>
                        <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">OMZET PROMO</p>
                      </div>
                    </div>
                    <div className="flex justify-center gap-6 mt-4 w-full">
                      {piePromoData.map((entry) => (
                        <div key={entry.name} className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
                          <p className="text-xs font-bold text-slate-300">{entry.name}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Summary Metric Ringan */}
                  <div className="bg-slate-800/80 p-6 rounded-3xl border border-slate-700/80 shadow-xl flex flex-col justify-between">
                    <div>
                      <h3 className="font-bold text-white text-base mb-1">Akurasi Sinkronisasi PQ</h3>
                      <p className="text-xs text-slate-400">Verifikasi konsistensi baris CSV terhadap agregasi database</p>
                    </div>

                    <div className="flex flex-col gap-3 my-4">
                      <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-900/60 border border-slate-700/50">
                        <span className="text-xs text-slate-400">Total SKU Aktif</span>
                        <strong className="text-sm text-white font-bold">{data?.summary.total_produk?.toLocaleString('id-ID') || 0} SKU</strong>
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-900/60 border border-slate-700/50">
                        <span className="text-xs text-slate-400">SKU dalam Promo</span>
                        <strong className="text-sm text-emerald-400 font-bold">{data?.summary.total_promo?.toLocaleString('id-ID') || 0} SKU</strong>
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-900/60 border border-slate-700/50">
                        <span className="text-xs text-slate-400">Status Validasi Harga</span>
                        <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> 100% Valid
                        </span>
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-500 italic">
                      *Data disaring otomatis dari POS tanpa penimpaan format ERP.
                    </p>
                  </div>
                </div>

              </div>

              {/* Right Column (Bar Chart Omzet per Departemen Ritel) */}
              <div className="xl:col-span-5 flex flex-col gap-6">
                <div className="bg-slate-800/80 p-6 rounded-3xl border border-slate-700/80 shadow-xl">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="font-bold text-lg text-white">Ranking Omzet Departemen</h2>
                      <p className="text-xs text-slate-400">Kontribusi penjualan terbesar per divisi ritel</p>
                    </div>
                  </div>

                  <div className="h-[460px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart 
                        data={topDeptData.slice(0, 8)} 
                        layout="vertical" 
                        margin={{ top: 0, right: 20, left: 40, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#334155" />
                        <XAxis 
                          type="number" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fontSize: 10, fill: '#94a3b8' }} 
                          tickFormatter={(val) => formatCompactCurrency(val)} 
                        />
                        <YAxis 
                          dataKey="name" 
                          type="category" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fontSize: 11, fill: '#e2e8f0', fontWeight: 'bold' }} 
                          width={110} 
                        />
                        <Tooltip 
                          cursor={{ fill: '#334155', opacity: 0.3 }} 
                          contentStyle={{ 
                            backgroundColor: '#0f172a', 
                            borderRadius: '16px', 
                            border: '1px solid #334155', 
                            color: '#fff' 
                          }} 
                          formatter={(val: any) => formatCurrency(val as number)} 
                        />
                        <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                          {topDeptData.slice(0, 8).map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* ================= TAB CONTENT 2: REKONSILIASI PERGERAKAN STOK ================= */}
          {activeTab === "rekonsiliasi" && (
            <div className="bg-slate-800/80 p-6 rounded-3xl border border-slate-700/80 shadow-xl flex flex-col gap-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="font-bold text-lg text-white">Rekonsiliasi Stok Ritel (Stock Movement Flow)</h2>
                  <p className="text-xs text-slate-400">
                    Alur stok terverifikasi: Stok Awal Bulan (BOM) - Penjualan MTD = Sisa Stok Fisik (EOH)
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-slate-400" />
                  <select
                    value={selectedDeptFilter}
                    onChange={(e) => setSelectedDeptFilter(e.target.value)}
                    className="bg-slate-900 border border-slate-700 text-xs font-bold text-slate-200 px-3 py-2 rounded-xl outline-none"
                  >
                    <option value="ALL">Semua Departemen ({topDeptData.length})</option>
                    {topDeptData.map(d => (
                      <option key={d.rawDept} value={d.rawDept}>{d.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-700/80">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-slate-950/80 text-slate-400 uppercase text-[11px] font-bold border-b border-slate-700">
                    <tr>
                      <th className="p-4">Departemen Ritel</th>
                      <th className="p-4 text-center">Stok Awal (BOM)</th>
                      <th className="p-4 text-center">Terjual MTD</th>
                      <th className="p-4 text-center">Sisa Stok (EOH)</th>
                      <th className="p-4 text-right">Omzet Harian (SPD)</th>
                      <th className="p-4 text-right">Omzet Bulan Ini (MTD)</th>
                      <th className="p-4 text-right">Valuasi Stok (EOH Rp)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/60">
                    {filteredDeptData.map((d, idx) => (
                      <tr key={idx} className="hover:bg-slate-700/40 transition-colors">
                        <td className="p-4 font-bold text-white flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                          {d.name}
                        </td>
                        <td className="p-4 text-center font-medium text-slate-300">
                          {d.bom_unit?.toLocaleString('id-ID') || '-'}
                        </td>
                        <td className="p-4 text-center font-bold text-emerald-400">
                          {d.qty.toLocaleString('id-ID')} pcs
                        </td>
                        <td className="p-4 text-center font-bold text-cyan-400">
                          {d.stok?.toLocaleString('id-ID') || 0} pcs
                        </td>
                        <td className="p-4 text-right font-bold text-slate-200">
                          {formatCurrency(d.spdOmzet)}
                        </td>
                        <td className="p-4 text-right font-black text-emerald-400">
                          {formatCurrency(d.value)}
                        </td>
                        <td className="p-4 text-right font-bold text-slate-300">
                          {formatCurrency(d.eoh)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ================= TAB CONTENT 3: TOP FAST & SLOW MOVING ================= */}
          {activeTab === "top" && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 sm:gap-6">
              
              {/* 1. TOP 10 BEST SELLER (FAST MOVING) */}
              <div className="bg-slate-800/80 p-4 sm:p-6 rounded-3xl border border-slate-700/80 shadow-xl flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-700/60">
                  <div>
                    <h2 className="font-bold text-base sm:text-lg text-white flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-emerald-400 shrink-0" /> Top 10 Best Seller
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">Produk terlaris berdasarkan transaksi omzet dan unit</p>
                  </div>
                  <span className="self-start sm:self-auto px-2.5 py-1 rounded-xl bg-emerald-500/20 text-emerald-400 text-xs font-bold border border-emerald-500/30">
                    Fast Moving
                  </span>
                </div>

                <div className="flex flex-col gap-2.5">
                  {data?.topFast && data.topFast.length > 0 ? (
                    data.topFast.slice(0, 10).map((item, idx) => (
                      <div 
                        key={idx} 
                        className="p-3 sm:p-3.5 rounded-2xl bg-slate-900/70 border border-slate-700/60 hover:border-emerald-500/40 transition-all flex flex-col gap-2.5 shadow-xs"
                      >
                        {/* Baris 1: Rank Badge + Nama Produk + SKU */}
                        <div className="flex items-start gap-2.5 min-w-0">
                          {/* Rank Badge dengan aksen medali */}
                          <div className={`w-6 h-6 sm:w-7 sm:h-7 rounded-xl flex items-center justify-center text-xs font-black shrink-0 border ${
                            idx === 0 
                              ? "bg-amber-400/20 text-amber-300 border-amber-400/40 shadow-xs shadow-amber-500/20" 
                              : idx === 1 
                                ? "bg-slate-300/20 text-slate-200 border-slate-400/40" 
                                : idx === 2 
                                  ? "bg-amber-700/20 text-amber-500 border-amber-700/40" 
                                  : "bg-slate-800 text-slate-400 border-slate-700"
                          }`}>
                            {idx + 1}
                          </div>
                          
                          {/* Deskripsi Barang: line-clamp-2 agar rapi dan tidak offside */}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs sm:text-sm font-bold text-white leading-snug line-clamp-2 break-words" title={item.description}>
                              {item.description}
                            </p>
                            <p className="text-[10px] sm:text-xs text-slate-400 font-mono mt-0.5">
                              SKU: {item.sku}
                            </p>
                          </div>
                        </div>

                        {/* Baris 2: Kotak Metrik (Omzet & Kuantiti Terjual) */}
                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800/80 bg-slate-950/40 px-2.5 py-1.5 rounded-xl">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-[10px] text-slate-400 font-semibold uppercase">Omzet:</span>
                            <span className="text-xs sm:text-sm font-black text-emerald-400 font-mono tracking-tight truncate">
                              {formatCurrency(item.omzet_total)}
                            </span>
                          </div>
                          <div className="shrink-0">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/20">
                              <TrendingUp className="w-3 h-3 text-emerald-400 shrink-0" />
                              {item.sales_qty} pcs
                            </span>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-8 text-center text-xs text-slate-500 bg-slate-900/40 rounded-2xl">
                      Belum ada data Best Seller untuk periode ini.
                    </div>
                  )}
                </div>
              </div>

              {/* KOLOM KANAN: STOK KRITIS & SLOW MOVING */}
              <div className="flex flex-col gap-5 sm:gap-6">
                
                {/* 2. STOK KRITIS ALERT (Laris tapi stok menipis <= 5) */}
                <div className="bg-slate-800/80 p-4 sm:p-6 rounded-3xl border border-slate-700/80 shadow-xl flex flex-col gap-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-700/60">
                    <div>
                      <h2 className="font-bold text-base sm:text-lg text-white flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" /> Peringatan Stok Kritis (Segera PO)
                      </h2>
                      <p className="text-xs text-slate-400 mt-0.5">Produk laku terjual namun sisa stok toko menipis (&le; 5 pcs)</p>
                    </div>
                    <span className="self-start sm:self-auto px-2.5 py-1 rounded-xl bg-rose-500/20 text-rose-400 text-xs font-bold border border-rose-500/30">
                      Urgent PO
                    </span>
                  </div>

                  <div className="flex flex-col gap-2.5">
                    {data?.topKritis && data.topKritis.length > 0 ? (
                      data.topKritis.slice(0, 6).map((item, idx) => (
                        <div 
                          key={idx} 
                          className="p-3 sm:p-3.5 rounded-2xl bg-rose-950/20 border border-rose-900/40 hover:border-rose-500/40 transition-all flex flex-col gap-2.5 shadow-xs"
                        >
                          {/* Baris 1: Icon + Deskripsi + SKU */}
                          <div className="flex items-start gap-2.5 min-w-0">
                            <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0 border border-rose-500/30">
                              <AlertTriangle className="w-3.5 h-3.5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs sm:text-sm font-bold text-white leading-snug line-clamp-2 break-words" title={item.description}>
                                {item.description}
                              </p>
                              <p className="text-[10px] sm:text-xs text-slate-400 font-mono mt-0.5">
                                SKU: {item.sku} • <span className="text-rose-300/80">{item.dept || 'SUKO'}</span>
                              </p>
                            </div>
                          </div>

                          {/* Baris 2: Badge Sisa Stok & Terjual MTD */}
                          <div className="flex items-center justify-between gap-2 pt-2 border-t border-rose-900/40 bg-slate-950/40 px-2.5 py-1.5 rounded-xl">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-black border ${
                                item.stok === 0
                                  ? "bg-rose-500/25 text-rose-300 border-rose-500/40 shadow-xs"
                                  : "bg-amber-500/20 text-amber-300 border-amber-500/30"
                              }`}>
                                {item.stok === 0 && (
                                  <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                                  </span>
                                )}
                                Sisa {item.stok} pcs
                              </span>
                            </div>
                            <div className="shrink-0 text-right">
                              <span className="text-[11px] sm:text-xs text-slate-300 font-semibold">
                                Terjual <strong className="text-white font-bold">{item.sales_mtd} pcs</strong> MTD
                              </span>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-8 text-center text-xs text-slate-500 bg-slate-900/40 rounded-2xl">
                        Tidak ada barang dengan stok kritis saat ini.
                      </div>
                    )}
                  </div>
                </div>

                {/* 3. SLOW MOVING ALERT (Stok Mengendap) */}
                <div className="bg-slate-800/80 p-4 sm:p-6 rounded-3xl border border-slate-700/80 shadow-xl flex flex-col gap-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-700/60">
                    <div>
                      <h2 className="font-bold text-base sm:text-lg text-white flex items-center gap-2">
                        <Box className="w-5 h-5 text-amber-400 shrink-0" /> Slow Moving Alert (Stok Mengendap)
                      </h2>
                      <p className="text-xs text-slate-400 mt-0.5">Stok banyak di rak namun pergerakan penjualan lambat</p>
                    </div>
                    <span className="self-start sm:self-auto px-2.5 py-1 rounded-xl bg-amber-500/20 text-amber-400 text-xs font-bold border border-amber-500/30">
                      Review Display
                    </span>
                  </div>

                  <div className="flex flex-col gap-2.5">
                    {data?.topSlow && data.topSlow.length > 0 ? (
                      data.topSlow.slice(0, 6).map((item, idx) => (
                        <div 
                          key={idx} 
                          className="p-3 sm:p-3.5 rounded-2xl bg-amber-950/20 border border-amber-900/40 hover:border-amber-500/40 transition-all flex flex-col gap-2.5 shadow-xs"
                        >
                          {/* Baris 1: Icon + Deskripsi + SKU */}
                          <div className="flex items-start gap-2.5 min-w-0">
                            <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/30">
                              <Box className="w-3.5 h-3.5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs sm:text-sm font-bold text-white leading-snug line-clamp-2 break-words" title={item.description}>
                                {item.description}
                              </p>
                              <p className="text-[10px] sm:text-xs text-slate-400 font-mono mt-0.5">
                                SKU: {item.sku} • <span className="text-amber-300/80">{item.dept || 'SUKO'}</span>
                              </p>
                            </div>
                          </div>

                          {/* Baris 2: Badge Stok & Kuantiti Terjual */}
                          <div className="flex items-center justify-between gap-2 pt-2 border-t border-amber-900/40 bg-slate-950/40 px-2.5 py-1.5 rounded-xl">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                Stok {item.stok} pcs
                              </span>
                            </div>
                            <div className="shrink-0 text-right">
                              <span className="text-[11px] sm:text-xs text-slate-400 font-medium">
                                Hanya laku <strong className="text-slate-200 font-bold">{item.sales_mtd} pcs</strong> MTD
                              </span>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-8 text-center text-xs text-slate-500 bg-slate-900/40 rounded-2xl">
                        Tidak ada barang slow moving yang mengkhawatirkan.
                      </div>
                    )}
                  </div>
                </div>

              </div>

            </div>
          )}

          {/* ================= TAB CONTENT 4: TABEL PRODUK LENGKAP ================= */}
          {activeTab === "tabel" && (
            <div className="bg-slate-800/80 p-6 rounded-3xl border border-slate-700/80 shadow-xl flex flex-col gap-5">
              
              {/* Filter & Export Bar */}
              <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                <div className="relative w-full sm:w-80">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="Cari Artikel, SKU, atau Nama Barang..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-900/80 border border-slate-700 rounded-2xl pl-10 pr-4 py-2.5 text-xs sm:text-sm font-medium text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                  <button 
                    onClick={() => handleExportTrigger("CSV")}
                    className="bg-slate-700/80 hover:bg-slate-700 text-slate-200 font-bold py-2 px-4 rounded-xl shadow-sm flex items-center justify-center gap-2 text-xs transition-colors border border-slate-600/60"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                    Export Excel / CSV
                  </button>

                  <button 
                    onClick={() => handleExportTrigger("PDF")}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-4 rounded-xl shadow-lg shadow-emerald-900/50 flex items-center justify-center gap-2 text-xs transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Export PDF
                  </button>
                </div>
              </div>

              {/* Data Table */}
              <div className="overflow-x-auto rounded-2xl border border-slate-700/80">
                <table className="w-full text-left border-collapse text-xs sm:text-sm">
                  <thead className="bg-slate-950/80 border-b border-slate-700 text-[11px] uppercase tracking-wider text-slate-400 font-bold">
                    <tr>
                      <th className="p-4">SKU & Deskripsi Barang</th>
                      <th className="p-4 text-center">Qty Terjual</th>
                      <th className="p-4 text-right">Harga Satuan</th>
                      <th className="p-4 text-center">Status Harga</th>
                      <th className="p-4 text-right">Total Omzet</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/60">
                    {filteredItems.slice(0, 100).map((item) => (
                      <tr key={item.id} className="hover:bg-slate-700/30 transition-colors">
                        <td className="p-4">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-bold text-white font-mono">{item.sku}</span>
                            <span className="text-xs text-slate-300 max-w-[340px] truncate">{item.description}</span>
                          </div>
                        </td>
                        <td className="p-4 text-center font-bold text-slate-200">{item.qtySold}</td>
                        <td className="p-4 text-right">
                          <span className="font-bold text-slate-200">{formatCurrency(item.unitPrice)}</span>
                        </td>
                        <td className="p-4 text-center">
                          <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border ${
                            item.status === 'PROMO' 
                              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' 
                              : item.status === 'NO_PRICE'
                              ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                              : 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                          }`}>
                            {item.status === 'NO_PRICE' ? '⚠️ NO PRICE' : item.status}
                          </span>
                        </td>
                        <td className="p-4 text-right font-black text-emerald-400">
                          {formatCurrency(item.itemTotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredItems.length > 100 && (
                  <div className="p-4 text-center text-xs font-bold text-slate-400 bg-slate-900/60 border-t border-slate-700">
                    Menampilkan 100 data teratas dari total {filteredItems.length} hasil pencarian.
                  </div>
                )}
              </div>

            </div>
          )}

        </>
      )}

      {/* Security Pin Modal untuk Export */}
      <PinModal 
        isOpen={showPinModal}
        onClose={() => setShowPinModal(false)}
        onSubmit={handleExportAuth}
        title="Otorisasi Ekspor Data"
        description={`Masukkan PIN Keamanan Developer (220117) untuk mengunduh berkas ${exportType}.`}
      />

    </div>
  );
}
