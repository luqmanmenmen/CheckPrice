"use client";

import { useState, useEffect } from "react";
import { ArrowLeft, Calendar, Search, Download, AlertTriangle, TrendingUp, Package, Box } from "lucide-react";
import Link from "next/link";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { PinModal } from "@/components/PinModal";
import { ChipLoader } from "@/components/ChipLoader";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, Legend } from 'recharts';

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
  qtySold: number;
  hargaNormal: number;
  hargaPromo: number | null;
  unitPrice: number;
  status: "NORMAL" | "PROMO" | "NO_PRICE";
  itemTotal: number;
};

type SalesData = {
  targetDate: string;
  pqUploadTime: string;
  pqFileName: string | null;
  availableDates: string[];
  summary: {
    totalRevenue: number;
    totalPromoRevenue: number;
    totalQty: number;
    anomalyCount: number;
    totalOmzetPOS: number;
    ytd_sales_unit: number;
    ytd_omzet: number;
    mtd_omzet_pos: number;
    nilai_inventori: number;
  };
  categoryBreakdown: Record<string, { omzet: number; qty: number }>;
  trendData: { date: string; fullDate: string; omzet: number; qty: number }[];
  topFast: {
    sku: string;
    description: string;
    sales_qty: number;
    omzet_total: number;
  }[];
  items: SalesItem[];
};

export default function LaporanPenjualanPage() {
  const [data, setData] = useState<SalesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [timeframe, setTimeframe] = useState<"1D" | "1W" | "1M" | "1Y" | "ALL">("1M");

  const [showPinModal, setShowPinModal] = useState(false);
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
      console.error("Failed to fetch sales report:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport(selectedDate, timeframe);
  }, [selectedDate, timeframe]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };
  
  const formatCompactCurrency = (amount: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "";
    if (dateStr.length === 4) {
      return dateStr;
    }
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
      const month = months[d.getMonth()];
      return `${day} ${month}`;
    } catch {
      return dateStr;
    }
  };

  const exportPDF = (pin: string) => {
    if (!data) return;
    if (pin !== "220117") {
      setAlert({ isOpen: true, title: "Akses Ditolak", message: "PIN yang Anda masukkan salah!", type: "error" });
      return;
    }
    setShowPinModal(false);
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`Laporan Penjualan - ${formatDate(data.targetDate)}`, 14, 20);
    doc.setFontSize(10);
    doc.text(`Total Omzet: ${formatCurrency(data.summary.totalRevenue)}`, 14, 30);
    doc.text(`Total Terjual: ${data.summary.totalQty} Pcs`, 14, 35);
    const tableData = filteredItems.map((item, index) => [
      index + 1,
      item.sku,
      item.description,
      item.qtySold.toString(),
      item.status === 'NO_PRICE' ? 'BELUM ADA' : formatCurrency(item.unitPrice),
      item.status === 'NO_PRICE' ? '⚠️ NO PRICE' : item.status,
      item.status === 'NO_PRICE' ? '0' : formatCurrency(item.itemTotal)
    ]);
    autoTable(doc, {
      startY: 45,
      head: [['No', 'SKU', 'Nama Barang', 'Qty', 'Harga', 'Status', 'Total']],
      body: tableData,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [15, 23, 42] }
    });
    doc.save(`Laporan_Penjualan_${data.targetDate}.pdf`);
  };

  const filteredItems = data?.items.filter(item => 
    item.description.toLowerCase().includes(searchQuery.toLowerCase()) || 
    item.sku.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  // Data for Charts
  const piePromoData = data ? [
    { name: 'Normal', value: data.summary.totalRevenue - data.summary.totalPromoRevenue, color: '#3b82f6' }, // Blue
    { name: 'Promo', value: data.summary.totalPromoRevenue, color: '#10b981' } // Green
  ] : [];

  const topDeptData = data ? Object.entries(data.categoryBreakdown)
    .map(([dept, metrics], idx) => {
      const colors = ["#6366f1", "#14b8a6", "#f59e0b", "#ec4899", "#8b5cf6", "#06b6d4"];
      return {
        name: DEPT_MAP[dept] || dept,
        value: metrics.omzet,
        qty: metrics.qty,
        color: colors[idx % colors.length]
      };
    })
    .sort((a,b) => b.value - a.value)
    .slice(0, 5) : [];

  const CustomTooltipArea = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white/95 backdrop-blur-md p-4 rounded-xl shadow-lg border border-slate-200">
          <p className="text-slate-500 font-bold text-xs uppercase mb-1">{formatShortDate(payload[0].payload.fullDate)}</p>
          <p className="text-emerald-600 font-black text-xl mb-1">
            {formatCurrency(payload[0].value)}
          </p>
          {payload[1] && (
            <p className="text-slate-600 font-bold text-sm">
              {payload[1].value} pcs
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 p-4 sm:p-6 pb-24 mx-auto flex flex-col gap-6 font-sans">
      
      {/* Header - Mimicking reference dashboard header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2 bg-white p-4 sm:px-6 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-4">
          <Link href="/super-admin" className="p-2.5 rounded-full hover:bg-slate-100 transition-colors bg-slate-50 border border-slate-200">
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </Link>
          <div>
            <h1 className="font-black text-2xl text-slate-800 tracking-tight">Fitur Dashboard Otomatis</h1>
            <p className="text-sm text-slate-500 font-medium">Laporan Penjualan & Analitik - {data?.pqUploadTime || '-'}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-100 p-1.5 rounded-xl border border-slate-200 shadow-inner">
            <button onClick={() => setTimeframe("1D")} className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-colors ${timeframe === "1D" ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>1 Hari</button>
            <button onClick={() => setTimeframe("1W")} className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-colors ${timeframe === "1W" ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>1 Minggu</button>
            <button onClick={() => setTimeframe("1M")} className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-colors ${timeframe === "1M" ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>1 Bulan</button>
            <button onClick={() => setTimeframe("1Y")} className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-colors ${timeframe === "1Y" ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>1 Tahun</button>
          </div>
          
          <div className="flex items-center gap-2 bg-slate-50 px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
            <Calendar className="w-4 h-4 text-emerald-600" />
            <select 
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent border-none text-sm font-bold text-slate-700 focus:ring-0 cursor-pointer outline-none"
            >
              {data?.availableDates.map(date => (
                <option key={date} value={date}>{formatDate(date)}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-10 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <ChipLoader />
          <p className="text-sm font-bold text-slate-500 mt-2 animate-pulse">Memproses miliaran data...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          
          {/* ================= LEFT PANEL (8 cols) ================= */}
          <div className="xl:col-span-7 flex flex-col gap-6">
            
            {/* Top Cards (Ringkasan Penjualan) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                      <TrendingUp className="w-4 h-4 text-emerald-600" />
                    </div>
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide">Omzet MTD</h3>
                  </div>
                  <div className="text-xs font-bold text-slate-400">Target: 2M</div>
                </div>
                <p className="text-2xl font-black text-slate-800 mb-3">{formatCompactCurrency(data?.summary.mtd_omzet_pos || 0)}</p>
                <div className="w-full bg-slate-100 rounded-full h-2.5 mb-1">
                  <div className="bg-emerald-500 h-2.5 rounded-full" style={{ width: `${Math.min(((data?.summary.mtd_omzet_pos || 0) / 2000000000) * 100, 100)}%` }}></div>
                </div>
                <div className="flex justify-between items-center mt-1">
                  <span className="text-[10px] text-slate-400 font-bold">{formatCompactCurrency(2000000000)}</span>
                  <span className="text-[10px] text-emerald-600 font-bold">{((data?.summary.mtd_omzet_pos || 0) / 2000000000 * 100).toFixed(1)}%</span>
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                    <Package className="w-4 h-4 text-blue-600" />
                  </div>
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide">Qty Terjual</h3>
                </div>
                <p className="text-2xl font-black text-slate-800">{(data?.summary.totalQty || 0).toLocaleString('id-ID')} <span className="text-sm text-slate-500">Pcs</span></p>
                <div className="mt-2 text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded w-fit">
                  Hari Ini
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
                    <Box className="w-4 h-4 text-amber-600" />
                  </div>
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide">Nilai Inventori</h3>
                </div>
                <p className="text-2xl font-black text-slate-800">{formatCompactCurrency(data?.summary.nilai_inventori || 0)}</p>
                <div className="mt-2 text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded w-fit">
                  Estimasi Stok
                </div>
              </div>
            </div>

            {/* Line Chart: Grafik Penjualan Harian */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <h2 className="font-bold text-slate-800 text-lg mb-6 flex items-center gap-2">
                Grafik Penjualan Harian
              </h2>
              <div className="h-[250px] w-full">
                {data?.trendData && data.trendData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.trendData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorGreen" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="fullDate" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={formatShortDate} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(val) => formatCompactCurrency(val)} />
                      <Tooltip content={<CustomTooltipArea />} />
                      <Area type="monotone" dataKey="omzet" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorGreen)" activeDot={{ r: 6, fill: "#10b981", stroke: "#fff", strokeWidth: 2 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm bg-slate-50 rounded-xl">Data tren tidak tersedia</div>
                )}
              </div>
            </div>

            {/* Top Produk & Promo Insights */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h2 className="font-bold text-slate-800 text-base mb-4">
                  Top Produk Terjual ({timeframe === '1D' ? 'Hari Ini' : timeframe === '1W' ? '1 Minggu' : timeframe === '1Y' ? '1 Tahun' : '1 Bulan'})
                </h2>
                <div className="flex flex-col gap-3">
                  {data?.topFast?.slice(0, 5).map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">{idx + 1}</div>
                        <div>
                          <p className="text-sm font-bold text-slate-800 truncate max-w-[150px]">{item.description}</p>
                          <p className="text-xs text-slate-500">{item.sku}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-black text-emerald-600">{formatCompactCurrency(item.omzet_total)}</p>
                        <p className="text-[10px] font-bold text-slate-500">{item.sales_qty} pcs</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center">
                <h2 className="font-bold text-slate-800 text-base mb-2 w-full text-left">Persentase Promo vs Normal</h2>
                <div className="h-[200px] w-full relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={piePromoData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" stroke="none">
                        {piePromoData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(val: any) => formatCurrency(val as number)} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <p className="text-2xl font-black text-slate-800">
                      {data?.summary.totalRevenue ? Math.round((data.summary.totalPromoRevenue / data.summary.totalRevenue) * 100) : 0}%
                    </p>
                    <p className="text-xs text-slate-500 font-bold">PROMO</p>
                  </div>
                </div>
                <div className="flex justify-center gap-6 mt-4 w-full">
                  {piePromoData.map((entry) => (
                    <div key={entry.name} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }}></div>
                      <p className="text-xs font-bold text-slate-600">{entry.name}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ================= RIGHT PANEL (5 cols) ================= */}
          <div className="xl:col-span-5 flex flex-col gap-6">
            
            {/* Bar Chart: Penjualan per Departemen */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <h2 className="font-bold text-slate-800 text-base mb-6">Penjualan per Kategori (Departemen)</h2>
              <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topDeptData} layout="vertical" margin={{ top: 0, right: 20, left: 40, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                    <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={(val) => formatCompactCurrency(val)} />
                    <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#334155', fontWeight: 'bold' }} width={90} />
                    <Tooltip cursor={{ fill: '#f1f5f9' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} formatter={(val: any) => formatCurrency(val as number)} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {topDeptData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* List Departemen (Like the 'Keuangan 2025' table) */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex-1">
              <h2 className="font-bold text-slate-800 text-base mb-4">Detail Laporan Departemen</h2>
              <div className="overflow-x-auto rounded-xl border border-slate-100">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th className="p-3 font-bold text-slate-500 text-xs uppercase">Departemen</th>
                      <th className="p-3 font-bold text-slate-500 text-xs uppercase text-center">Qty</th>
                      <th className="p-3 font-bold text-slate-500 text-xs uppercase text-right">Omzet</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {topDeptData.map((dept, i) => (
                      <tr key={i} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3 font-bold text-slate-700">{dept.name}</td>
                        <td className="p-3 font-medium text-slate-600 text-center">{dept.qty}</td>
                        <td className="p-3 font-black text-emerald-600 text-right">{formatCurrency(dept.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* FULL TABLE DATA */}
      {!loading && data && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm mt-2">
          <div className="flex flex-col sm:flex-row justify-between gap-4 mb-6">
            <h2 className="font-bold text-slate-800 text-lg">Laporan Penjualan Lengkap</h2>
            <div className="flex gap-3">
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Cari SKU / Barang..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-sm font-medium focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              <button 
                onClick={() => setShowPinModal(true)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-4 rounded-lg shadow-sm flex items-center justify-center gap-2 text-sm transition-colors"
              >
                <Download className="w-4 h-4" />
                Export
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 font-bold">
                  <th className="p-4 font-semibold">SKU & Barang</th>
                  <th className="p-4 font-semibold text-center">Qty</th>
                  <th className="p-4 font-semibold text-right">Harga Satuan</th>
                  <th className="p-4 font-semibold text-right">Total Penjualan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.slice(0, 50).map((item) => (
                  <tr key={item.id} className={`hover:bg-slate-50 transition-colors ${item.status === 'NO_PRICE' ? 'bg-rose-50' : ''}`}>
                    <td className="p-4">
                      <div className="flex flex-col gap-1">
                        <span className="font-bold text-slate-800">{item.sku}</span>
                        <span className="text-xs text-slate-500 max-w-[300px] truncate">{item.description}</span>
                        {item.status === 'NO_PRICE' && (
                          <span className="text-[10px] font-bold text-rose-600 bg-rose-100 px-2 py-0.5 rounded w-fit border border-rose-200">⚠️ HARGA KOSONG</span>
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-center font-bold text-slate-700">{item.qtySold}</td>
                    <td className="p-4 text-right">
                      {item.status === 'NO_PRICE' ? '-' : (
                        <div className="flex flex-col items-end gap-1">
                          <span className="font-bold text-slate-800">{formatCurrency(item.unitPrice)}</span>
                          <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded ${item.status === 'PROMO' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                            {item.status}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="p-4 text-right font-black text-emerald-600">
                      {item.status === 'NO_PRICE' ? '-' : formatCurrency(item.itemTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredItems.length > 50 && (
              <div className="p-4 text-center text-sm font-bold text-slate-500 bg-slate-50 border-t border-slate-200">
                Menampilkan 50 data teratas dari {filteredItems.length} hasil pencarian.
              </div>
            )}
          </div>
        </div>
      )}

      <PinModal 
        isOpen={showPinModal}
        onClose={() => setShowPinModal(false)}
        onSubmit={exportPDF}
        title="Otorisasi Developer"
        description="Masukkan PIN (220117) untuk mengekspor laporan penjualan."
      />
    </div>
  )
}
