"use client";

import { useState, useRef, useEffect } from "react";
import { ArrowLeft, UploadCloud, FileType, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import Link from "next/link";
import { PinModal } from "@/components/PinModal";
import { AlertModal } from "@/components/AlertModal";
import * as xlsx from "xlsx";

export default function UpdateHargaPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lastSync, setLastSync] = useState<{name: string; date: string} | null>(null);
  const [showPinModal, setShowPinModal] = useState<{isOpen: boolean, action: "upload" | "reset" | null}>({isOpen: false, action: null});
  const [alertState, setAlertState] = useState<{isOpen: boolean; title: string; message: string; type: "error" | "success" | "warning"}>({isOpen: false, title: "", message: "", type: "error"});
  const [isResetting, setIsResetting] = useState(false);

  const fetchSyncHistory = async () => {
    try {
      const res = await fetch("/api/admin/sync-history");
      const data = await res.json();
      if (data.success && data.data) {
        setLastSync({
          name: data.data.user?.name || "Sistem",
          date: new Date(data.data.createdAt).toLocaleString("id-ID", { dateStyle: 'medium', timeStyle: 'short' })
        });
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
      setFiles(Array.from(e.dataTransfer.files));
      setStatus("idle");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFiles(Array.from(e.target.files));
      setStatus("idle");
    }
  };

  const [resultMsg, setResultMsg] = useState("");

  const handleUploadClick = () => {
    if (files.length === 0) return;
    setShowPinModal({ isOpen: true, action: "upload" });
  };

  const handleResetClick = () => {
    setShowPinModal({ isOpen: true, action: "reset" });
  };

  const executeReset = async (pin: string) => {
    setIsResetting(true);
    try {
      const res = await fetch("/api/admin/reset-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "UPDATE_PROMO", pin })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setAlertState({ isOpen: true, title: "Berhasil", message: "Semua riwayat upload Promo berhasil dihapus.", type: "success" });
        setLastSync(null);
      } else {
        setAlertState({ isOpen: true, title: "Gagal", message: data.error || "Gagal mereset data.", type: "error" });
      }
    } catch (err) {
      console.error(err);
      setAlertState({ isOpen: true, title: "Kesalahan Jaringan", message: "Terjadi kesalahan saat mereset data.", type: "error" });
    } finally {
      setIsResetting(false);
    }
  };

  const executeUpload = async () => {
    if (files.length === 0) return;
    setStatus("uploading");
    setProgress(0);
    setResultMsg("Membaca file Excel...");

    try {
      let allRows: any[] = [];
      let mainFileName = files[0].name;

      for (const file of files) {
        const buffer = await file.arrayBuffer();
        const workbook = xlsx.read(buffer, { type: "buffer", cellDates: false });
        for (const sheetName of workbook.SheetNames) {
          const ws = workbook.Sheets[sheetName];
          const rawRows = xlsx.utils.sheet_to_json(ws, { defval: "" });
          allRows = allRows.concat(rawRows);
        }
      }

      if (allRows.length === 0) {
        setStatus("error");
        setResultMsg("Semua file kosong atau tidak terbaca.");
        setAlertState({ isOpen: true, title: "Gagal", message: "File kosong.", type: "error" });
        return;
      }

      const CHUNK_SIZE = 500;
      const totalChunks = Math.ceil(allRows.length / CHUNK_SIZE);
      
      for (let i = 0; i < totalChunks; i++) {
        const chunk = allRows.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        const progressPercentage = Math.round((i / totalChunks) * 100);
        setProgress(progressPercentage);
        setResultMsg(`Analisis Mendalam: Memproses ${i * CHUNK_SIZE} dari ${allRows.length} baris...`);

        const payload = {
          type: "UPDATE_PROMO",
          fileName: mainFileName,
          uploadDate: new Date().toISOString(),
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
          throw new Error(data.error || "Gagal memproses chunk promo");
        }
      }

      setProgress(100);
      setStatus("success");
      setResultMsg(`Berhasil memproses dan mengunci ${allRows.length} data promo!`);
      fetchSyncHistory();
    } catch (error: any) {
      console.error(error);
      setProgress(100);
      setStatus("error");
      setResultMsg("Terjadi kesalahan saat mengunggah.");
      setAlertState({ isOpen: true, title: "Kesalahan", message: error.message || "Terjadi kesalahan jaringan atau server.", type: "error" });
    }
  };

  const handlePinSubmit = (pin: string) => {
    const action = showPinModal.action;
    setShowPinModal({ isOpen: false, action: null });
    if (action === "reset") {
      executeReset(pin);
    } else if (action === "upload") {
      executeUpload();
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 pb-24 max-w-2xl mx-auto flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2 justify-between">
        <div className="flex items-center gap-3">
          <Link href="/super-admin" className="p-2 rounded-full hover:bg-slate-200 transition-colors">
            <ArrowLeft className="w-5 h-5 text-slate-700" />
          </Link>
          <div>
            <h1 className="font-bold text-xl text-slate-800">Update Harga & Promo</h1>
            <p className="text-xs text-slate-500">Sinkronisasi harga mingguan (Rabu Malam)</p>
          </div>
        </div>
        
        <button
          onClick={handleResetClick}
          disabled={isResetting}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100 transition-colors disabled:opacity-50"
          title="Hapus semua riwayat log promo"
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          {isResetting ? "Mereset..." : "Reset Log"}
        </button>
      </div>

      {/* Warning Card */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 text-amber-800 shadow-sm">
        <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-600" />
        <div className="text-sm">
          <p className="font-bold mb-1">Peringatan Penting!</p>
          <p className="opacity-90 text-xs leading-relaxed">
            Data ini akan langsung menimpa (overwrite) harga yang ada di sistem kasir. Gunakan HANYA file master harga promo mingguan dari pusat.
          </p>
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
            ? "border-emerald-500 bg-emerald-50" 
            : files.length > 0
              ? "border-slate-300 bg-white" 
              : "border-slate-300 bg-white hover:border-emerald-400 hover:bg-slate-50"
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => files.length === 0 && fileInputRef.current?.click()}
        style={{ cursor: files.length > 0 ? 'default' : 'pointer' }}
      >
        <input 
          type="file" 
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".csv, .xlsx" 
          multiple
          className="hidden" 
        />
        
        {files.length > 0 ? (
          <div className="flex flex-col items-center w-full">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-4 relative">
              <FileType className="w-8 h-8 text-emerald-600" />
              {status === "success" && (
                <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                </div>
              )}
            </div>
            <p className="font-bold text-slate-800 mb-1">{files.length} File Terpilih</p>
            <div className="flex flex-wrap gap-2 justify-center max-w-md mb-6 mt-2">
              {files.map((f, i) => (
                <span key={i} className="px-2 py-1 bg-slate-100 text-slate-600 text-[10px] rounded border border-slate-200 truncate max-w-[150px]">
                  {f.name}
                </span>
              ))}
            </div>

            {status === "idle" && (
              <div className="flex gap-2">
                <button 
                  onClick={(e) => { e.stopPropagation(); setFiles([]); }}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Batal
                </button>
                <button 
                  onClick={handleUploadClick}
                  className="px-6 py-2 rounded-lg text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors shadow-md shadow-emerald-200"
                >
                  Proses Update Harga
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
                    className="h-full bg-emerald-500 transition-all duration-300"
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
                  onClick={() => { setFiles([]); setStatus("idle"); }}
                  className="text-emerald-600 text-sm font-bold hover:underline"
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
            <p className="font-bold text-slate-700 text-sm mb-1">Tarik & Lepas file Excel/CSV</p>
            <p className="text-xs text-slate-500 mb-4">Pastikan kolom sku, harga, dan stok tersedia</p>
            <span className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-600 shadow-sm">
              Pilih File
            </span>
          </>
        )}
      </div>

      <PinModal 
        isOpen={showPinModal.isOpen} 
        onClose={() => setShowPinModal({ isOpen: false, action: null })} 
        onSubmit={handlePinSubmit} 
        title={showPinModal.action === "reset" ? "Otorisasi Reset Log" : "Otorisasi Update Promo"}
        description={showPinModal.action === "reset" ? "Peringatan! Log riwayat upload Promo akan dihapus. Lanjutkan?" : "Masukkan PIN Keamanan untuk memulai proses sinkronisasi harga."}
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
