"use client";

import { useState, useEffect } from "react";
import { ArrowLeft, Calendar, DollarSign, Package, AlertTriangle, TrendingUp, Search, Download, BarChart3, List } from "lucide-react";
import Link from "next/link";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { AlertModal } from "@/components/AlertModal";
import { PinModal } from "@/components/PinModal";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

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
  availableDates: string[];
  summary: {
    totalRevenue: number;
    totalPromoRevenue: number;
    totalQty: number;
    anomalyCount: number;
  };
  categoryBreakdown: Record<string, { omzet: number; qty: number }>;
  trendData: { date: string; fullDate: string; omzet: number; qty: number }[];
  items: SalesItem[];
};

export default function LaporanPenjualanPage() {
  const [data, setData] = useState<SalesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"SUMMARY" | "DETAILS">("SUMMARY");

  // Modal State
  const [showPinModal, setShowPinModal] = useState(false);
  const [alert, setAlert] = useState<{ isOpen: boolean; title: string; message: string; type: "success" | "error" | "warning" }>({
    isOpen: false,
    title: "",
    message: "",
    type: "success"
  });

  const showAlert = (title: string, message: string, type: "success" | "error" | "warning") => {
    setAlert({ isOpen: true, title, message, type });
  };

  const fetchReport = async (dateStr: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/sales-report${dateStr ? `?date=${dateStr}` : ""}`);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
        if (!selectedDate) {
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
    fetchReport(selectedDate);
  }, [selectedDate]);

  const handleDateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedDate(e.target.value);
  };

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
    const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' };
    return new Date(dateStr).toLocaleDateString('id-ID', options);
  };

  const triggerExport = () => {
    setShowPinModal(true);
  };

  const exportPDF = (pin: string) => {
    if (!data) return;
    
    if (pin !== "220117") {
      showAlert("Akses Ditolak", "PIN yang Anda masukkan salah!", "error");
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

  return (
    <div className="min-h-screen bg-slate-50 p-4 pb-24 max-w-6xl mx-auto flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
        <div className="flex items-center gap-3">
          <Link href="/super-admin" className="p-2.5 rounded-xl hover:bg-slate-200 transition-colors bg-white shadow-sm border border-slate-200">
            <ArrowLeft className="w-5 h-5 text-slate-700" />
          </Link>
          <div>
            <h1 className="font-black text-2xl text-slate-800 tracking-tight flex items-center gap-2">
              Dashboard Penjualan
            </h1>
            <p className="text-sm text-slate-500">Estimasi omzet harian & analitik berdasarkan Power Query</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2 bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
          <div className="pl-2">
            <Calendar className="w-5 h-5 text-indigo-500" />
          </div>
          <select 
            value={selectedDate}
            onChange={handleDateChange}
            className="bg-transparent border-none text-sm font-bold text-slate-700 focus:ring-0 cursor-pointer pr-8"
          >
            {data?.availableDates.map(date => (
              <option key={date} value={date}>Data PQ: {formatDate(date)}</option>
            ))}
            {!data?.availableDates.includes(selectedDate) && selectedDate && (
              <option value={selectedDate}>Data PQ: {formatDate(selectedDate)}</option>
            )}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm font-medium text-slate-500 mt-4 animate-pulse">Memproses miliaran data...</p>
        </div>
      ) : (
        <>
          {/* Executive Metric Cards - Redesigned for Large Numbers */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-6 rounded-3xl shadow-xl shadow-slate-200 relative overflow-hidden group col-span-1 md:col-span-2 flex flex-col justify-center">
              <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/5 rounded-full blur-3xl group-hover:bg-white/10 transition-all"></div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center backdrop-blur-md">
                  <DollarSign className="w-6 h-6 text-emerald-400" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-300 text-sm tracking-wide uppercase">Total Omzet</h3>
                  <p className="text-xs text-slate-400">Keseluruhan pendapatan pada tanggal ini</p>
                </div>
              </div>
              <p className="text-4xl sm:text-5xl lg:text-6xl font-black text-white tracking-tighter mt-2 truncate" title={formatCurrency(data?.summary.totalRevenue || 0)}>
                {formatCurrency(data?.summary.totalRevenue || 0)}
              </p>
            </div>

            <div className="flex flex-col gap-4">
              <div className="bg-gradient-to-br from-amber-500 to-amber-600 p-5 rounded-3xl shadow-lg relative overflow-hidden flex-1">
                <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-white/20 rounded-full blur-2xl"></div>
                <h3 className="font-bold text-amber-50 text-xs tracking-wide uppercase mb-1">Omzet Promo</h3>
                <p className="text-2xl font-black text-white tracking-tight truncate" title={formatCurrency(data?.summary.totalPromoRevenue || 0)}>
                  {formatCurrency(data?.summary.totalPromoRevenue || 0)}
                </p>
              </div>
              <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-200 flex-1 flex justify-between items-center">
                <div>
                  <h3 className="font-bold text-slate-400 text-xs tracking-wide uppercase mb-1">Barang Terjual</h3>
                  <p className="text-2xl font-black text-slate-800 tracking-tight">
                    {data?.summary.totalQty.toLocaleString('id-ID') || 0} <span className="text-sm text-slate-500 font-bold">pcs</span>
                  </p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center">
                  <Package className="w-6 h-6 text-blue-500" />
                </div>
              </div>
            </div>
          </div>

          {/* Anomaly Alert */}
          {(data?.summary.anomalyCount || 0) > 0 && (
            <div className="bg-rose-50 border border-rose-200 p-4 rounded-2xl flex items-start gap-3 shadow-sm">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-bold text-rose-800">Perhatian: Ada {data?.summary.anomalyCount} barang tanpa harga (Harga = 0)</h3>
                <p className="text-sm text-rose-600 mt-1">Barang ini tercatat laku namun harga normalnya belum diperbarui di database. Total omzet mungkin kurang dari yang sebenarnya.</p>
              </div>
            </div>
          )}

          {/* Tabs Navigation */}
          <div className="flex items-center gap-2 border-b border-slate-200 pb-px">
            <button
              onClick={() => setActiveTab("SUMMARY")}
              className={`px-5 py-3 font-bold text-sm rounded-t-xl transition-colors flex items-center gap-2 ${
                activeTab === "SUMMARY" ? "bg-white text-indigo-600 border-t border-l border-r border-slate-200 border-b-white translate-y-px" : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              Ringkasan Eksekutif
            </button>
            <button
              onClick={() => setActiveTab("DETAILS")}
              className={`px-5 py-3 font-bold text-sm rounded-t-xl transition-colors flex items-center gap-2 ${
                activeTab === "DETAILS" ? "bg-white text-indigo-600 border-t border-l border-r border-slate-200 border-b-white translate-y-px" : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
              }`}
            >
              <List className="w-4 h-4" />
              Rincian Produk
            </button>
          </div>

          {/* Tab Content */}
          <div className="bg-white rounded-b-2xl rounded-tr-2xl shadow-sm border border-slate-200 p-6 -mt-px relative z-10">
            {activeTab === "SUMMARY" ? (
              <div className="flex flex-col lg:flex-row gap-8">
                {/* Trend Chart Section */}
                <div className="flex-1">
                  <h2 className="font-bold text-slate-800 text-lg flex items-center gap-2 mb-2">
                    <TrendingUp className="w-5 h-5 text-indigo-500" />
                    Tren Penjualan (1 Bulan Terakhir)
                  </h2>
                  <p className="text-xs text-slate-500 mb-6">💡 Klik pada titik grafik untuk melihat rincian produk di hari tersebut.</p>
                  <div className="h-[300px] w-full cursor-pointer">
                    {data?.trendData && data.trendData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart 
                          data={data.trendData} 
                          margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                          onClick={(e: any) => {
                            if (e && e.activePayload && e.activePayload.length > 0) {
                              const clickedDate = e.activePayload[0].payload.fullDate;
                              if (clickedDate) {
                                setSelectedDate(clickedDate);
                                // Opsional: Beralih ke tab rincian otomatis
                                setActiveTab("DETAILS");
                              }
                            }
                          }}
                        >
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                          <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
                          <YAxis 
                            yAxisId="left" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fontSize: 12, fill: '#64748b' }} 
                            tickFormatter={(value) => formatCompactCurrency(value)}
                          />
                          <Tooltip 
                            formatter={(value: any, name: any) => [name === 'omzet' ? formatCurrency(Number(value)) : `${value} pcs`, name === 'omzet' ? 'Omzet' : 'Qty']}
                            labelStyle={{ fontWeight: 'bold', color: '#1e293b', marginBottom: '8px' }}
                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                          />
                          <Legend verticalAlign="top" height={36} iconType="circle" />
                          <Line yAxisId="left" type="monotone" dataKey="omzet" name="omzet" stroke="#4f46e5" strokeWidth={4} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm bg-slate-50 rounded-xl border border-dashed border-slate-200">
                        Data tren belum tersedia.
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Category Breakdown Section */}
                <div className="w-full lg:w-[350px]">
                  <h2 className="font-bold text-slate-800 text-lg mb-6">Sumbangsih per Departemen</h2>
                  <div className="flex flex-col gap-3">
                    {data?.categoryBreakdown && Object.entries(data.categoryBreakdown).length > 0 ? (
                      Object.entries(data.categoryBreakdown)
                        .sort(([, a], [, b]) => b.omzet - a.omzet)
                        .map(([dept, metrics], idx) => {
                          const percentage = data.summary.totalRevenue > 0 
                            ? ((metrics.omzet / data.summary.totalRevenue) * 100).toFixed(1) 
                            : "0";
                          
                          // Auto generate nice colors based on index
                          const colors = ["bg-indigo-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500", "bg-cyan-500", "bg-fuchsia-500"];
                          const barColor = colors[idx % colors.length];

                          return (
                            <div key={dept} className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                              <div className="flex justify-between items-end mb-2">
                                <div>
                                  <h3 className="font-bold text-slate-700 text-xs uppercase tracking-wide">{dept}</h3>
                                  <p className="text-sm font-black text-slate-900 mt-1">{formatCurrency(metrics.omzet)}</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-xs font-bold text-slate-500">{metrics.qty} pcs</p>
                                  <p className="text-[10px] font-bold text-slate-400">{percentage}%</p>
                                </div>
                              </div>
                              <div className="w-full bg-slate-200 rounded-full h-1.5 mt-2 overflow-hidden">
                                <div className={`${barColor} h-1.5 rounded-full`} style={{ width: `${percentage}%` }}></div>
                              </div>
                            </div>
                          );
                        })
                    ) : (
                      <div className="text-sm text-slate-500 text-center py-8">
                        Tidak ada data kategori hari ini.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div>
                {/* Table Controls */}
                <div className="flex flex-col sm:flex-row justify-between gap-4 mb-4">
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                    <input
                      type="text"
                      placeholder="Cari SKU atau nama barang..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-sm font-medium focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition-shadow shadow-sm"
                    />
                  </div>
                  
                  <button 
                    onClick={triggerExport}
                    disabled={!data || data.items.length === 0}
                    className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 px-5 rounded-xl shadow-sm flex items-center justify-center gap-2 text-sm transition-colors disabled:opacity-50"
                  >
                    <Download className="w-4 h-4" />
                    Export PDF Laporan
                  </button>
                </div>

                {/* Data Table */}
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 font-bold">
                        <th className="p-4 rounded-tl-xl">SKU & Barang</th>
                        <th className="p-4">Qty</th>
                        <th className="p-4">Harga Satuan</th>
                        <th className="p-4 text-right rounded-tr-xl">Total Penjualan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredItems.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-8 text-center text-slate-500 text-sm font-medium">
                            Tidak ada barang yang terjual pada pencarian ini.
                          </td>
                        </tr>
                      ) : (
                        filteredItems.map((item) => {
                          // Extract category from description randomly if not in table data natively, wait we have dept in product but reportItems didn't send dept.
                          // Let's send dept in reportItems as well, or just show description.
                          // Actually, we didn't add dept to SalesItem type. Let's just omit Kategori column or use a placeholder if we don't have it.
                          // For now, omit Kategori column to be safe. Wait, I added it in TH. Let's remove Kategori TH and TD.
                          return (
                          <tr key={item.id} className={`hover:bg-slate-50 transition-colors ${item.status === 'NO_PRICE' ? 'bg-rose-50/30' : ''}`}>
                            <td className="p-4">
                              <div className="flex flex-col">
                                <span className="font-bold text-slate-800 text-sm">{item.sku}</span>
                                <span className="text-xs text-slate-500 mt-0.5 max-w-[280px]" title={item.description}>{item.description}</span>
                                
                                {item.status === 'NO_PRICE' && (
                                  <div className="mt-2 inline-flex items-center gap-1.5 bg-rose-100 text-rose-700 px-2.5 py-1 rounded-md text-[10px] font-bold w-fit border border-rose-200">
                                    <AlertTriangle className="w-3 h-3" />
                                    Harga 0. Mohon update di master data!
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="p-4 align-top">
                              <span className="font-black text-slate-700 text-sm">{item.qtySold}</span>
                            </td>
                            <td className="p-4 align-top">
                              {item.status === 'NO_PRICE' ? (
                                <span className="text-xs font-bold text-rose-500">-</span>
                              ) : (
                                <div className="flex flex-col">
                                  <span className="font-bold text-slate-800 text-sm">{formatCurrency(item.unitPrice)}</span>
                                  <div className={`mt-1 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded w-fit ${
                                    item.status === 'PROMO' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
                                  }`}>
                                    {item.status}
                                  </div>
                                </div>
                              )}
                            </td>
                            <td className="p-4 align-top text-right">
                               {item.status === 'NO_PRICE' ? (
                                <span className="text-sm font-bold text-rose-500">-</span>
                              ) : (
                                <span className="font-black text-slate-800 text-base">{formatCurrency(item.itemTotal)}</span>
                              )}
                            </td>
                          </tr>
                        )})
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <PinModal 
        isOpen={showPinModal}
        onClose={() => setShowPinModal(false)}
        onSubmit={exportPDF}
        title="Otorisasi Super Admin"
        description="Masukkan PIN (220117) untuk mengekspor laporan penjualan."
      />

      <AlertModal 
        isOpen={alert.isOpen}
        title={alert.title}
        message={alert.message}
        type={alert.type}
        onClose={() => setAlert(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
