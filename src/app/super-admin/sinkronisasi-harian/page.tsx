"use client";

import { useState, useRef, useEffect } from "react";
import { ArrowLeft, UploadCloud, FileType, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import Link from "next/link";
import { PinModal } from "@/components/PinModal";
import { AlertModal } from "@/components/AlertModal";
import * as xlsx from "xlsx";

export default function UpdateProdukPage() {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lastSync, setLastSync] = useState<{name: string; date: string} | null>(null);
  const [pinModalState, setPinModalState] = useState<{isOpen: boolean, action: "upload" | "reset" | null}>({isOpen: false, action: null});
  const [historyList, setHistoryList] = useState<any[]>([]);
  const [isResetting, setIsResetting] = useState(false);
  const [alertState, setAlertState] = useState<{isOpen: boolean; title: string; message: string; type: "error" | "success" | "warning"}>({isOpen: false, title: "", message: "", type: "error"});

  const fetchSyncHistory = async () => {
    try {
      const res = await fetch("/api/admin/sync-history?limit=5&type=PQ_HARIAN");
      const data = await res.json();
      if (data.success && data.data && data.data.length > 0) {
        const latest = data.data[0];
        setLastSync({
          name: latest.user?.name || "Sistem",
          date: new Date(latest.createdAt).toLocaleString("id-ID", { dateStyle: 'medium', timeStyle: 'short' })
        });
        setHistoryList(data.data);
      } else if (data.success && data.data) {
        setHistoryList([]);
        setLastSync(null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchSyncHistory();
  }, []);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.name.endsWith('.csv') || droppedFile.name.endsWith('.xlsx')) {
        setFile(droppedFile);
        setStatus("idle");
      } else {
        setAlertState({ isOpen: true, title: "Format Salah", message: "Mohon upload file CSV atau Excel", type: "warning" });
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setStatus("idle");
    }
  };

  const [resultMsg, setResultMsg] = useState("");

  const handleUploadClick = () => {
    if (!file) return;
    setPinModalState({ isOpen: true, action: "upload" });
  };

  const executeUpload = async () => {
    if (!file) return;
    setStatus("uploading");
    setProgress(0);
    setResultMsg("Membaca file Excel...");
    
    try {
      // 1. Baca file di Browser (Mencegah Vercel Timeout)
      const buffer = await file.arrayBuffer();
      const workbook = xlsx.read(buffer, { type: "buffer", cellDates: false });
      
      let allRows: any[] = [];
      for (const sheetName of workbook.SheetNames) {
        const ws = workbook.Sheets[sheetName];
        const rawRows = xlsx.utils.sheet_to_json(ws, { defval: "" });
        const rowsWithSource = rawRows.map((r: any) => ({
          ...r,
          __SOURCE_FILE__: file.name,
          __SOURCE_SHEET__: sheetName
        }));
        allRows = allRows.concat(rowsWithSource);
      }

      if (allRows.length === 0) {
        setStatus("error");
        setResultMsg("File Excel kosong atau tidak terbaca.");
        setAlertState({ isOpen: true, title: "Gagal", message: "File kosong.", type: "error" });
        return;
      }

      // Validasi format nama file
      const fileNameUpper = file.name.toUpperCase();
      const isValidFormat = /^POWER QUERY \d{1,2} [A-Z]+ \d{4}\.(CSV|XLSX)$/.test(fileNameUpper);
      if (!isValidFormat) {
        setStatus("error");
        setResultMsg("Format nama file salah.");
        setAlertState({ isOpen: true, title: "Format Salah", message: "Nama file harus mengikuti format 'POWER QUERY [TGL] [BULAN] [TAHUN]'", type: "error" });
        return;
      }

      // 2. Kirim data per paket kecil (Chunking)
      const CHUNK_SIZE = 500;
      const totalChunks = Math.ceil(allRows.length / CHUNK_SIZE);
      
      let totalCreated = 0;
      let totalUpdated = 0;
      let totalFailed = 0;

      for (let i = 0; i < totalChunks; i++) {
        const chunk = allRows.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        const progressPercentage = Math.round((i / totalChunks) * 100);
        setProgress(progressPercentage);
        setResultMsg(`Analisis Mendalam: Memproses ${i * CHUNK_SIZE} dari ${allRows.length} baris...`);

        // Helper untuk ekstrak tanggal dari nama file
        const extractDate = (filename: string) => {
          const match = filename.toUpperCase().match(/POWER QUERY (\d{1,2}) ([A-Z]+) (\d{4})/);
          if (match) {
            const months: Record<string, number> = {
              "JANUARI": 0, "JANUARY": 0, "JAN": 0, "FEBRUARI": 1, "FEB": 1,
              "MARET": 2, "MARCH": 2, "MAR": 2, "APRIL": 3, "APR": 3,
              "MEI": 4, "MAY": 4, "JUNI": 5, "JUN": 5, "JULI": 6, "JUL": 6,
              "AGUSTUS": 7, "AUG": 7, "SEPTEMBER": 8, "SEP": 8,
              "OKTOBER": 9, "OCT": 9, "NOVEMBER": 10, "NOV": 10, "DESEMBER": 11, "DEC": 11
            };
            const month = months[match[2]] !== undefined ? months[match[2]] : new Date().getMonth();
            return new Date(parseInt(match[3]), month, parseInt(match[1]), 12, 0, 0);
          }
          return new Date();
        };

        const payload = {
          type: "PQ_HARIAN",
          fileName: file.name,
          uploadDate: extractDate(file.name).toISOString(),
          isLastChunk: i === totalChunks - 1,
          totalRecords: allRows.length,
          rows: chunk
        };

        const res = await fetch("/api/upload/chunk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await res.json();
        
        if (!res.ok || !data.success) {
          throw new Error(data.error || "Gagal memproses chunk");
        }
      }

      setProgress(100);
      setStatus("success");
      setResultMsg(`Berhasil menganalisis dan menyimpan ${allRows.length} baris data secara akurat!`);
      fetchSyncHistory();

    } catch (error: any) {
      console.error(error);
      setProgress(100);
      setStatus("error");
      setResultMsg("Terjadi kesalahan saat mengunggah.");
      setAlertState({ isOpen: true, title: "Kesalahan", message: error.message || "Gagal menghubungi server.", type: "error" });
    }
  };

  const handleDeleteHistory = async (id: string, fileName: string) => {
    const pin = window.prompt(`Masukkan PIN Keamanan untuk menghapus log upload "${fileName}":\n(PERHATIAN: Menghapus log ini akan mengizinkan file dengan nama yang sama untuk di-upload kembali.)`);
    if (pin !== "220117") {
      alert("PIN Salah! Operasi dibatalkan.");
      return;
    }
    
    try {
      const res = await fetch("/api/admin/sync-history", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      const data = await res.json();
      if (data.success) {
        alert("Riwayat berhasil dihapus!");
        fetchSyncHistory();
      } else {
        alert("Gagal menghapus riwayat: " + data.error);
      }
    } catch (err) {
      console.error(err);
      alert("Terjadi kesalahan jaringan.");
    }
  };

  const handleResetClick = () => {
    setPinModalState({ isOpen: true, action: "reset" });
  };

  const executeReset = async (pin: string) => {
    setIsResetting(true);
    try {
      const res = await fetch("/api/admin/reset-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setAlertState({ isOpen: true, title: "Berhasil", message: "Semua log berhasil dihapus dan MTD di-reset.", type: "success" });
        fetchSyncHistory();
        setLastSync(null);
      } else {
        setAlertState({ isOpen: true, title: "Gagal", message: data.error || "Gagal mereset.", type: "error" });
      }
    } catch (err) {
      console.error(err);
      setAlertState({ isOpen: true, title: "Kesalahan Jaringan", message: "Terjadi kesalahan jaringan saat mereset data.", type: "error" });
    } finally {
      setIsResetting(false);
    }
  };

  const handlePinSubmit = (pin: string) => {
    const { action } = pinModalState;
    setPinModalState({ isOpen: false, action: null });
    
    if (action === "reset") {
      executeReset(pin);
    } else if (action === "upload") {
      executeUpload();
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 pb-24 max-w-2xl mx-auto flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <Link href="/super-admin" className="p-2 rounded-full hover:bg-slate-200 transition-colors">
          <ArrowLeft className="w-5 h-5 text-slate-700" />
        </Link>
        <div className="flex-1">
          <h1 className="font-bold text-xl text-slate-800">Sinkronisasi Harian</h1>
          <p className="text-xs text-slate-500">Update Produk Baru, Stok Sisa (EOH), dan Analitik Penjualan</p>
        </div>
        <button
          onClick={handleResetClick}
          disabled={isResetting}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100 transition-colors disabled:opacity-50"
          title="Hapus semua riwayat log PQ dan reset data penjualan"
        >
          <AlertCircle className="w-3.5 h-3.5" />
          Reset Semua
        </button>
      </div>

      {/* Info Card */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex gap-3 text-blue-800 shadow-sm">
        <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-bold mb-1">Panduan Import PQ Harian:</p>
          <ul className="list-disc pl-4 space-y-1 opacity-90 text-xs">
            <li>Sistem akan mendeteksi SKU baru dan menambahkannya.</li>
            <li>Sistem akan memperbarui Sisa Stok (<code className="bg-blue-100 px-1 rounded">EOH_UNIT</code>).</li>
            <li>Sistem akan merekam penjualan (<code className="bg-blue-100 px-1 rounded">MTD</code>) untuk label Fast/Slow Move.</li>
          </ul>
        </div>
      </div>

      {lastSync && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex justify-between items-center shadow-sm">
          <div>
            <p className="text-xs text-slate-500 mb-1">Terakhir Diupdate</p>
            <p className="font-bold text-slate-700 text-sm">{lastSync.date}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500 mb-1">Oleh</p>
            <p className="font-bold text-slate-700 text-sm">{lastSync.name}</p>
          </div>
        </div>
      )}

      {/* Upload Zone */}
      <div 
        className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center transition-all ${
          isDragging 
            ? "border-indigo-500 bg-indigo-50" 
            : file 
              ? "border-slate-300 bg-white" 
              : "border-slate-300 bg-white hover:border-indigo-400 hover:bg-slate-50"
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !file && fileInputRef.current?.click()}
        style={{ cursor: file ? 'default' : 'pointer' }}
      >
        <input 
          type="file" 
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" 
          className="hidden" 
        />
        
        {file ? (
          <div className="flex flex-col items-center w-full">
            <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center mb-4 relative">
              <FileType className="w-8 h-8 text-indigo-600" />
              {status === "success" && (
                <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                </div>
              )}
            </div>
            <p className="font-bold text-slate-800 mb-1">{file.name}</p>
            <p className="text-xs text-slate-500 mb-6">
              {(file.size / (1024 * 1024)).toFixed(2)} MB
            </p>

            {status === "idle" && (
              <div className="flex gap-2">
                <button 
                  onClick={(e) => { e.stopPropagation(); setFile(null); }}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Batal
                </button>
                <button 
                  onClick={handleUploadClick}
                  className="px-6 py-2 rounded-lg text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors shadow-md shadow-emerald-200"
                >
                  Mulai Import
                </button>
              </div>
            )}

            {status === "uploading" && (
              <div className="w-full max-w-xs">
                <div className="flex justify-between text-xs font-bold text-slate-600 mb-2">
                  <span className="truncate flex-1 mr-2">{resultMsg || "Menganalisis..."}</span>
                  <span className="w-8 text-right">{progress}%</span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-indigo-600 transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            {status === "success" && (
              <div className="text-center w-full mt-4">
                <div className="bg-green-50 text-green-700 border border-green-200 rounded-lg p-3 text-sm font-medium mb-4">
                  {resultMsg}
                </div>
                <button 
                  onClick={() => { setFile(null); setStatus("idle"); }}
                  className="text-indigo-600 text-sm font-bold hover:underline"
                >
                  Upload file lain
                </button>
              </div>
            )}

          </div>
        ) : (
          <>
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
              <UploadCloud className="w-8 h-8 text-slate-400" />
            </div>
            <p className="font-bold text-slate-700 text-sm mb-1">Tarik & Lepas file CSV disini</p>
            <p className="text-xs text-slate-500 mb-4">atau klik untuk mencari file</p>
            <span className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-600 shadow-sm">
              Pilih File
            </span>
          </>
        )}
      </div>

      {/* Riwayat Upload */}
      {historyList.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <h3 className="font-bold text-slate-800 text-sm">Riwayat Upload Terakhir</h3>
            <span className="text-[10px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded font-bold">Terbaru</span>
          </div>
          <div className="divide-y divide-slate-100">
            {historyList.map((hist, idx) => (
              <div key={hist.id || idx} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50 transition-colors">
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${hist.status === 'SUCCESS' ? 'bg-green-100 text-green-600' : 'bg-rose-100 text-rose-600'}`}>
                    <FileType className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-700 text-sm">{hist.fileName}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5 flex gap-2">
                      <span>{new Date(hist.createdAt).toLocaleString("id-ID")}</span>
                      <span>&bull;</span>
                      <span>{hist.user?.name || 'Sistem'}</span>
                    </p>
                    {hist.status === 'SUCCESS' ? (
                      <p className="text-[10px] text-green-600 font-bold mt-1 inline-block bg-green-50 px-1.5 py-0.5 rounded">{hist.records} baris diproses</p>
                    ) : (
                      <p className="text-[10px] text-rose-600 font-bold mt-1 inline-block bg-rose-50 px-1.5 py-0.5 rounded">Gagal diproses</p>
                    )}
                  </div>
                </div>
                {idx === 0 && (
                  <button 
                    onClick={() => handleDeleteHistory(hist.id, hist.fileName)}
                    className="px-3 py-1.5 text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg border border-rose-200 transition-colors self-start sm:self-center shrink-0"
                  >
                    Hapus Log
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <PinModal 
        isOpen={pinModalState.isOpen} 
        onClose={() => setPinModalState({ isOpen: false, action: null })} 
        onSubmit={handlePinSubmit} 
        title={pinModalState.action === "reset" ? "Otorisasi Reset Data" : "Otorisasi Upload PQ"}
        description={pinModalState.action === "reset" 
          ? "PERINGATAN! Ini akan menghapus log dan sales MTD. Masukkan PIN untuk lanjut." 
          : "Masukkan PIN Keamanan untuk memproses file PQ Harian."}
      />

      <AlertModal
        isOpen={alertState.isOpen}
        onClose={() => setAlertState(prev => ({ ...prev, isOpen: false }))}
        title={alertState.title}
        message={alertState.message}
        type={alertState.type}
      />
    </div>
  );
}
