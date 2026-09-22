"use client";

import { useState, useEffect } from "react";
import { ArrowLeft, Calendar, DollarSign, Package, AlertTriangle, TrendingUp, Search, Download } from "lucide-react";
import Link from "next/link";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { AlertModal } from "@/components/AlertModal";
import { PinModal } from "@/components/PinModal";

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
  items: SalesItem[];
};

export default function LaporanPenjualanPage() {
  const [data, setData] = useState<SalesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");

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
    doc.text(`Laporan Penjualan (H-1) - ${formatDate(data.targetDate)}`, 14, 20);
    
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
    <div className="min-h-screen bg-slate-50 p-4 pb-24 max-w-5xl mx-auto flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
        <div className="flex items-center gap-3">
          <Link href="/super-admin" className="p-2 rounded-full hover:bg-slate-200 transition-colors bg-white shadow-sm">
            <ArrowLeft className="w-5 h-5 text-slate-700" />
          </Link>
          <div>
            <h1 className="font-black text-2xl text-slate-800 tracking-tight flex items-center gap-2">
              Laporan Penjualan <span className="px-2 py-0.5 rounded text-xs font-bold bg-indigo-100 text-indigo-700 align-middle">H-1</span>
            </h1>
            <p className="text-sm text-slate-500">Estimasi omzet berdasarkan pergerakan EOH Delta Power Query</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2 bg-white p-1.5 rounded-xl border border-slate-200 shadow-sm">
          <div className="pl-3">
            <Calendar className="w-4 h-4 text-slate-400" />
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
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm font-medium text-slate-500 mt-4 animate-pulse">Menghitung omzet...</p>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-indigo-900 to-slate-800 p-5 rounded-2xl shadow-lg relative overflow-hidden group">
              <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/10 rounded-full blur-2xl group-hover:bg-white/20 transition-all"></div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-md">
                  <DollarSign className="w-5 h-5 text-indigo-200" />
                </div>
                <h3 className="font-bold text-indigo-100 text-sm">Total Omzet</h3>
              </div>
              <p className="text-3xl font-black text-white tracking-tight mt-1">
                {formatCurrency(data?.summary.totalRevenue || 0)}
              </p>
              <p className="text-xs text-indigo-300 mt-2 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" /> Berdasarkan data H-1
              </p>
            </div>

            <div className="bg-gradient-to-br from-amber-600 to-amber-500 p-5 rounded-2xl shadow-lg relative overflow-hidden group">
              <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/10 rounded-full blur-2xl group-hover:bg-white/20 transition-all"></div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-md">
                  <DollarSign className="w-5 h-5 text-amber-100" />
                </div>
                <h3 className="font-bold text-amber-50 text-sm">Omzet Promo</h3>
              </div>
              <p className="text-3xl font-black text-white tracking-tight mt-1">
                {formatCurrency(data?.summary.totalPromoRevenue || 0)}
              </p>
              <p className="text-xs text-amber-100 mt-2 flex items-center gap-1 opacity-80">
                Porsi dari total omzet
              </p>
            </div>

            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 relative overflow-hidden">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                  <Package className="w-5 h-5 text-blue-600" />
                </div>
                <h3 className="font-bold text-slate-500 text-sm">Total Barang Terjual</h3>
              </div>
              <p className="text-3xl font-black text-slate-800 tracking-tight mt-1">
                {data?.summary.totalQty.toLocaleString('id-ID') || 0} <span className="text-sm font-bold text-slate-400">Pcs</span>
              </p>
            </div>

            <div className={`p-5 rounded-2xl shadow-sm border relative overflow-hidden transition-all ${
              (data?.summary.anomalyCount || 0) > 0 
                ? "bg-rose-50 border-rose-200" 
                : "bg-white border-slate-200"
            }`}>
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  (data?.summary.anomalyCount || 0) > 0 ? "bg-rose-100" : "bg-slate-50"
                }`}>
                  <AlertTriangle className={`w-5 h-5 ${
                    (data?.summary.anomalyCount || 0) > 0 ? "text-rose-600" : "text-slate-400"
                  }`} />
                </div>
                <h3 className={`font-bold text-sm ${
                  (data?.summary.anomalyCount || 0) > 0 ? "text-rose-700" : "text-slate-500"
                }`}>Butuh Update Harga</h3>
              </div>
              <p className={`text-3xl font-black tracking-tight mt-1 ${
                (data?.summary.anomalyCount || 0) > 0 ? "text-rose-700" : "text-slate-800"
              }`}>
                {data?.summary.anomalyCount || 0} <span className="text-sm font-bold opacity-60">Item</span>
              </p>
              {(data?.summary.anomalyCount || 0) > 0 && (
                <p className="text-[10px] font-bold text-rose-500 uppercase tracking-wider mt-2">
                  Harga = 0. Omzet tidak terhitung.
                </p>
              )}
            </div>
          </div>

          {/* Table Controls */}
          <div className="flex flex-col sm:flex-row justify-between gap-4 mt-2">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Cari SKU atau nama barang..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-sm font-medium focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition-shadow shadow-sm"
              />
            </div>
            
            <button 
              onClick={triggerExport}
              disabled={!data || data.items.length === 0}
              className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 px-5 rounded-xl shadow-sm flex items-center justify-center gap-2 text-sm transition-colors disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              Export PDF
            </button>
          </div>

          {/* Data Table */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mt-2">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 font-bold">
                    <th className="p-4 rounded-tl-2xl">SKU & Barang</th>
                    <th className="p-4">Qty</th>
                    <th className="p-4">Harga Satuan</th>
                    <th className="p-4 text-right rounded-tr-2xl">Total Penjualan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-slate-500 text-sm font-medium">
                        Tidak ada barang yang terjual pada tanggal ini.
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((item) => (
                      <tr key={item.id} className={`hover:bg-slate-50 transition-colors ${item.status === 'NO_PRICE' ? 'bg-rose-50/30' : ''}`}>
                        <td className="p-4">
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-800 text-sm">{item.sku}</span>
                            <span className="text-xs text-slate-500 mt-0.5 line-clamp-1 max-w-[250px]" title={item.description}>{item.description}</span>
                            
                            {item.status === 'NO_PRICE' && (
                              <div className="mt-2 inline-flex items-center gap-1.5 bg-rose-100 text-rose-700 px-2.5 py-1 rounded-md text-[10px] font-bold w-fit border border-rose-200">
                                <AlertTriangle className="w-3 h-3" />
                                Harga Belum Tersedia. Apakah barang ini promo / normal?
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
                              <div className={`mt-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded w-fit ${
                                item.status === 'PROMO' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
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
                            <span className="font-black text-indigo-700 text-base">{formatCurrency(item.itemTotal)}</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
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
