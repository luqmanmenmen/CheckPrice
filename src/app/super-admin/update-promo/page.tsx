"use client";

import { useState, useRef, useEffect } from "react";
import { ArrowLeft, UploadCloud, FileType, CheckCircle2, AlertTriangle } from "lucide-react";
import Link from "next/link";

export default function UpdateHargaPage() {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lastSync, setLastSync] = useState<{name: string; date: string} | null>(null);

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
      setFile(e.dataTransfer.files[0]);
      setStatus("idle");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setStatus("idle");
    }
  };

  const [resultMsg, setResultMsg] = useState("");

  const handleUpload = async () => {
    if (!file) return;
    setStatus("uploading");
    setProgress(30);
    
    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", "UPDATE_PROMO");

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      setProgress(100);

      if (res.ok && data.success) {
        setStatus("success");
        setResultMsg(data.message || "Harga berhasil diperbarui!");
        fetchSyncHistory();
      } else {
        setStatus("error");
        setResultMsg(data.error || "Gagal memproses file.");
        alert(data.error || "Gagal memproses file.");
      }
    } catch (error) {
      console.error(error);
      setProgress(100);
      setStatus("error");
      setResultMsg("Terjadi kesalahan saat mengunggah.");
      alert("Terjadi kesalahan saat mengunggah.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 pb-24 max-w-2xl mx-auto flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <Link href="/super-admin" className="p-2 rounded-full hover:bg-slate-200 transition-colors">
          <ArrowLeft className="w-5 h-5 text-slate-700" />
        </Link>
        <div>
          <h1 className="font-bold text-xl text-slate-800">Update Harga & Promo</h1>
          <p className="text-xs text-slate-500">Sinkronisasi harga mingguan (Rabu Malam)</p>
        </div>
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
            : file 
              ? "border-slate-300 bg-white" 
              : "border-slate-300 bg-white hover:border-emerald-400 hover:bg-slate-50"
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
          accept=".csv, .xlsx" 
          className="hidden" 
        />
        
        {file ? (
          <div className="flex flex-col items-center w-full">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-4 relative">
              <FileType className="w-8 h-8 text-emerald-600" />
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
                  onClick={handleUpload}
                  className="px-6 py-2 rounded-lg text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors shadow-md shadow-emerald-200"
                >
                  Proses Update Harga
                </button>
              </div>
            )}

            {status === "uploading" && (
              <div className="w-full max-w-xs">
                <div className="flex justify-between text-xs font-bold text-slate-600 mb-2">
                  <span>Sinkronisasi data harga...</span>
                  <span>{progress}%</span>
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
                  onClick={() => { setFile(null); setStatus("idle"); }}
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
    </div>
  );
}
