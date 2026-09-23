"use client";
import { useState } from "react";
import { ArrowLeft, RefreshCw, Download, FileSpreadsheet, Calculator } from "lucide-react";
import Link from "next/link";
import useSWR from "swr";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { AlertModal } from "@/components/AlertModal";
import { PinModal } from "@/components/PinModal";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function LaporanPOPage() {
  const [minMtd, setMinMtd] = useState(5);
  const [page, setPage] = useState(1);
  const [isExporting, setIsExporting] = useState(false);

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

  const { data, error, isLoading, mutate } = useSWR(
    `/api/admin/po?minMtd=${minMtd}&page=${page}&limit=50`,
    fetcher
  );

  const triggerExport = () => {
    setShowPinModal(true);
  };

  const handleExportPDF = async (pin: string) => {
    if (pin !== "220117") {
      showAlert("Akses Ditolak", "PIN yang Anda masukkan salah!", "error");
      return;
    }

    setIsExporting(true);
    setShowPinModal(false);
    try {
      const res = await fetch(`/api/admin/po?minMtd=${minMtd}&page=1&limit=5000`);
      const exportData = await res.json();

      if (!exportData.success || !exportData.data || exportData.data.length === 0) {
        showAlert("Kosong", "Tidak ada data untuk diexport!", "warning");
        return;
      }

      // Format data untuk PDF
      const tableData = exportData.data.map((item: any, index: number) => [
        index + 1,
        item.sku,
        item.description,
        item.stok,
        item.sales_wtd,
        item.sales_mtd,
        item.spd,
        item.minStock,
        item.maxStock,
        item.saranPo > 0 ? item.saranPo : "-"
      ]);

      const doc = new jsPDF("landscape", "pt", "a4");

      // Menambahkan judul
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text("Laporan Pengajuan PO (Fast Move)", 40, 40);
      
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`Dicetak pada: ${new Date().toLocaleString('id-ID')} | Parameter: Laku >= ${minMtd} Pcs (MTD)`, 40, 55);

      // Menambahkan tabel
      autoTable(doc, {
        startY: 70,
        head: [['No', 'SKU', 'Nama Barang', 'Sisa Stok', 'WTD', 'MTD', 'SPD', 'Titik Min', 'Titik Max', 'Saran PO']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [44, 62, 80], textColor: 255, fontStyle: 'bold', halign: 'center' },
        columnStyles: {
          0: { halign: 'center', cellWidth: 30 },
          1: { cellWidth: 60 },
          2: { cellWidth: 'auto' }, // Nama Barang
          3: { halign: 'center', cellWidth: 50 },
          4: { halign: 'center', cellWidth: 40 },
          5: { halign: 'center', cellWidth: 40 },
          6: { halign: 'center', cellWidth: 40 },
          7: { halign: 'center', cellWidth: 60 },
          8: { halign: 'center', cellWidth: 60 },
          9: { halign: 'center', cellWidth: 60, fontStyle: 'bold', textColor: [220, 38, 38] }
        },
        styles: { fontSize: 8, cellPadding: 4 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        didDrawPage: function (data) {
          // Menambahkan Watermark Transparan "CONFIDENTIAL" melintang
          doc.setTextColor(200, 200, 200);
          doc.setFontSize(60);
          doc.setFont("helvetica", "bold");
          const watermarkText = "CONFIDENTIAL - PROPERTY OF SUKO";
          
          // Posisi di tengah halaman
          const pageWidth = doc.internal.pageSize.width;
          const pageHeight = doc.internal.pageSize.height;
          
          // @ts-ignore
          doc.text(watermarkText, pageWidth / 2, pageHeight / 2, {
            align: "center",
            angle: 45
          });
        }
      });

      // Simpan PDF
      doc.save(`Laporan_PO_Confidential_${new Date().toISOString().split('T')[0]}.pdf`);

    } catch (err) {
      console.error(err);
      showAlert("Error", "Gagal melakukan export PDF.", "error");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 pb-24 max-w-7xl mx-auto flex flex-col gap-6 relative">
      {/* Header */}
      <div className="flex items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200 sticky top-4 z-10">
        <Link href="/super-admin" className="p-2 bg-slate-100 rounded-full hover:bg-slate-200 transition-colors">
          <ArrowLeft className="w-5 h-5 text-slate-700" />
        </Link>
        <div className="flex-1">
          <h1 className="font-bold text-xl text-slate-800 flex items-center gap-2">
            <FileSpreadsheet className="w-6 h-6 text-indigo-600" />
            Pivot Pengajuan PO
          </h1>
          <p className="text-xs text-slate-500">Laporan Logistik Fast Move & Kalkulasi Pengadaan</p>
        </div>
        <button 
          onClick={() => mutate()} 
          className="p-2 text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          <span className="text-sm font-bold hidden sm:inline">Refresh Data</span>
        </button>
      </div>

      {/* Kontrol & Filter */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-rose-50 rounded-lg border border-rose-100">
              <Calculator className="w-5 h-5 text-rose-600" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase">Parameter Kurasi</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm font-medium">Batas Minimum MTD:</span>
                <select 
                  className="bg-slate-50 border border-slate-200 rounded px-2 py-1 text-sm font-bold outline-none focus:border-indigo-500"
                  value={minMtd}
                  onChange={(e) => {
                    setMinMtd(Number(e.target.value));
                    setPage(1);
                  }}
                >
                  <option value="1">Laku &gt;= 1 Pcs</option>
                  <option value="5">Laku &gt;= 5 Pcs (Fast)</option>
                  <option value="15">Laku &gt;= 15 Pcs (Super Fast)</option>
                  <option value="50">Laku &gt;= 50 Pcs (Hero)</option>
                </select>
              </div>
            </div>
          </div>
          <button 
            onClick={triggerExport}
            disabled={isExporting || isLoading}
            className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 px-5 rounded-xl shadow-sm flex items-center justify-center gap-2 text-sm transition-colors disabled:opacity-50"
          >
            {isExporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {isExporting ? "Memproses..." : "Export PDF"}
          </button>
        </div>
      </div>

      {/* Data Table / Pivot */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-800 text-white text-xs uppercase font-bold">
              <tr>
                <th className="px-4 py-3 whitespace-nowrap">SKU / Nama Barang</th>
                <th className="px-4 py-3 text-center border-l border-slate-600">Sisa Stok<br/><span className="text-[9px] text-slate-300 font-normal">(EOH)</span></th>
                <th className="px-4 py-3 text-center border-l border-slate-600">Terjual<br/><span className="text-[9px] text-slate-300 font-normal">(WTD)</span></th>
                <th className="px-4 py-3 text-center border-l border-slate-600 bg-slate-700">Terjual<br/><span className="text-[9px] text-slate-300 font-normal">(MTD)</span></th>
                <th className="px-4 py-3 text-center border-l border-slate-600 bg-slate-900 text-indigo-300">SPD<br/><span className="text-[9px] font-normal opacity-70">Sales/Day</span></th>
                <th className="px-4 py-3 text-center border-l border-slate-600">Titik Min<br/><span className="text-[9px] text-slate-300 font-normal">(21 Hari)</span></th>
                <th className="px-4 py-3 text-center border-l border-slate-600">Titik Max<br/><span className="text-[9px] text-slate-300 font-normal">(45 Hari)</span></th>
                <th className="px-4 py-3 text-center border-l border-slate-600 bg-rose-900 text-rose-200">Saran PO<br/><span className="text-[9px] font-normal opacity-70">Diajukan</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500" />
                    Mengkalkulasi data logistik...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-red-500 bg-red-50">
                    Gagal memuat data.
                  </td>
                </tr>
              ) : !data?.data || data.data.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    Tidak ada barang yang memenuhi kriteria Fast Move.
                  </td>
                </tr>
              ) : (
                data.data.map((item: any, idx: number) => (
                  <tr key={item.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    <td className="px-4 py-3 min-w-[250px]">
                      <div className="font-bold text-slate-800">{item.sku}</div>
                      <div className="text-xs text-slate-500 truncate max-w-[300px] mb-1">{item.description}</div>
                      {item.trend === "NAIK" && <span className="inline-block text-[9px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-200 mb-1 mr-1">📈 TREN NAIK</span>}
                      {item.trend === "TURUN" && <span className="inline-block text-[9px] font-bold bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded border border-rose-200 mb-1 mr-1">📉 DROP / MATI</span>}
                      {item.trend === "STABIL" && <span className="inline-block text-[9px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded border border-blue-200 mb-1 mr-1">➖ STABIL</span>}
                      
                      {item.dailySales && item.dailySales.length > 0 && (
                        <div className="mt-1 flex items-center gap-1 flex-wrap">
                          {item.dailySales.map((ds: any, i: number) => (
                            <span key={i} className="text-[8px] px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded border border-indigo-200">
                              {new Date(ds.date).toLocaleDateString('id-ID', {day:'numeric', month:'short'})}: {ds.qty} pcs
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center font-bold border-l border-slate-100 text-slate-700">{item.stok}</td>
                    <td className="px-4 py-3 text-center font-bold border-l border-slate-100 text-emerald-600">{item.sales_wtd}</td>
                    <td className="px-4 py-3 text-center font-bold border-l border-slate-100 bg-slate-50 text-indigo-700">{item.sales_mtd}</td>
                    <td className="px-4 py-3 text-center font-black border-l border-slate-100 bg-indigo-50 text-indigo-900">{item.spd}</td>
                    <td className="px-4 py-3 text-center border-l border-slate-100 text-slate-600">{item.minStock}</td>
                    <td className="px-4 py-3 text-center border-l border-slate-100 text-slate-600">{item.maxStock}</td>
                    <td className={`px-4 py-3 text-center font-black border-l border-slate-100 text-lg ${item.saranPo > 0 ? 'bg-rose-50 text-rose-600' : 'bg-slate-50 text-slate-400'}`}>
                      {item.saranPo > 0 ? item.saranPo : '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        {data?.meta && data.meta.totalPages > 1 && (
          <div className="p-4 border-t border-slate-200 flex items-center justify-between bg-slate-50">
            <span className="text-xs text-slate-500">
              Halaman <span className="font-bold">{data.meta.page}</span> dari <span className="font-bold">{data.meta.totalPages}</span> 
              <span className="hidden sm:inline"> (Total {data.meta.total} Produk)</span>
            </span>
            <div className="flex gap-2">
              <button 
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                className="px-3 py-1 rounded border border-slate-300 bg-white text-sm font-medium hover:bg-slate-100 disabled:opacity-50"
              >
                Prev
              </button>
              <button
                disabled={!data || page >= data.meta.totalPages}
                onClick={() => setPage(page + 1)}
                className="px-3 py-1 rounded border border-slate-300 bg-white text-sm font-medium hover:bg-slate-100 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      <PinModal 
        isOpen={showPinModal}
        onClose={() => setShowPinModal(false)}
        onSubmit={handleExportPDF}
        title="Otorisasi Super Admin"
        description="Masukkan PIN (220117) untuk mengunduh laporan berstatus Confidential."
      />

      <AlertModal 
        isOpen={alert.isOpen}
        title={alert.title}
        message={alert.message}
        type={alert.type}
        onClose={() => setAlert(prev => ({ ...prev, isOpen: false }))}
      />
      
      {/* Rumus Info */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mt-2">
        <h3 className="font-bold text-sm text-blue-800 mb-2">Panduan Kalkulasi Logistik (Pivot)</h3>
        <ul className="text-xs text-blue-700 space-y-1 list-disc list-inside">
          <li><strong>SPD (Sales Per Day):</strong> Dihitung dari Rata-rata Terjual Sebulan Terakhir (MTD / 30 Hari).</li>
          <li><strong>Titik Min:</strong> Lead Time (14 hari) + Safety Stock (7 hari) = 21 x SPD. Jika sisa stok berada di bawah ini, wajib PO.</li>
          <li><strong>Titik Max:</strong> Kapasitas rak / Gudang untuk barang tersebut = 45 x SPD.</li>
          <li><strong>Saran PO:</strong> Pengajuan QTY agar stok kembali penuh ke Titik Max.</li>
          <li><strong>Terjual Harian:</strong> Muncul di bawah nama barang jika data PQ harian diunggah secara konsisten. Data ditarik berdasarkan kolom DAY_SALES_UNIT.</li>
        </ul>
      </div>
    </div>
  );
}
