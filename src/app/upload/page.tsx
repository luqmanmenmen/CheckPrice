"use client";

import { useState } from "react";
import {
  UploadCloud, FileSpreadsheet, CheckCircle2, AlertCircle,
  FolderOpen, RefreshCw, ChevronDown, ChevronUp, Info
} from "lucide-react";

export default function UploadPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; skipped?: string[]; files?: string[] } | null>(null);
  const [showSkipped, setShowSkipped] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFiles(Array.from(e.target.files));
      setResult(null);
    }
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    setLoading(true);
    setResult(null);

    const formData = new FormData();
    for (const f of files) formData.append("file", f);

    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      setResult({ success: res.ok, message: data.message || data.error, skipped: data.skipped, files: data.files });
      if (res.ok) setFiles([]);
    } catch {
      setResult({ success: false, message: "Terjadi kesalahan saat mengunggah file." });
    } finally {
      setLoading(false);
    }
  };

  const handleImportSuko = async () => {
    setImporting(true);
    setResult(null);
    try {
      const res = await fetch("/api/upload");
      const data = await res.json();
      setResult({ success: res.ok, message: data.message || data.error, skipped: data.skipped, files: data.files });
    } catch {
      setResult({ success: false, message: "Terjadi kesalahan saat import dari folder SUKO." });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="text-center pt-4 pb-2">
        <h1 className="text-2xl font-bold text-slate-800">Update Data Harga</h1>
        <p className="text-slate-500 mt-1 text-sm">Import otomatis dari folder SUKO, atau unggah file Excel.</p>
      </div>

      {/* ========== IMPORT OTOMATIS dari folder ========== */}
      <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-5 text-white shadow-lg">
        <div className="flex items-center gap-3 mb-3">
          <div className="bg-white/20 p-2.5 rounded-xl">
            <FolderOpen className="w-6 h-6" />
          </div>
          <div>
            <p className="font-bold text-lg leading-tight">Import Otomatis SUKO</p>
            <p className="text-blue-100 text-xs">Dari folder: D:\Website\SUKO</p>
          </div>
        </div>
        <p className="text-sm text-blue-100 mb-4">
          Klik tombol di bawah untuk membaca semua file Excel dari folder SUKO sekaligus — semua sheet di setiap file akan diproses otomatis.
        </p>
        <button
          onClick={handleImportSuko}
          disabled={importing}
          className="w-full bg-white text-blue-700 font-bold py-3 rounded-xl hover:bg-blue-50 transition-colors flex items-center justify-center gap-2 text-sm disabled:opacity-60"
        >
          {importing ? (
            <><RefreshCw className="w-4 h-4 animate-spin" /> Sedang Membaca Semua File...</>
          ) : (
            <><RefreshCw className="w-4 h-4" /> Mulai Import Sekarang</>
          )}
        </button>
      </div>

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="flex-1 border-t border-slate-200" />
        <span className="text-slate-400 text-xs font-medium">atau upload manual</span>
        <div className="flex-1 border-t border-slate-200" />
      </div>

      {/* ========== Upload Manual ========== */}
      <label
        htmlFor="file-upload"
        className={`flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed rounded-2xl cursor-pointer transition-colors text-center ${
          files.length > 0 ? "border-blue-400 bg-blue-50" : "border-slate-300 bg-white hover:bg-slate-50"
        }`}
      >
        {files.length > 0 ? (
          <>
            <FileSpreadsheet className="w-10 h-10 text-blue-600" />
            <div>
              <p className="font-semibold text-slate-800">{files.length} file dipilih</p>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                {files.slice(0, 3).map(f => f.name).join(", ")}
                {files.length > 3 ? ` + ${files.length - 3} lainnya` : ""}
              </p>
            </div>
          </>
        ) : (
          <>
            <UploadCloud className="w-10 h-10 text-slate-400" />
            <div>
              <p className="font-medium text-slate-600">Klik untuk memilih file Excel</p>
              <p className="text-xs text-slate-400 mt-1">Bisa pilih beberapa file (.xlsx) sekaligus</p>
            </div>
          </>
        )}
        <input
          type="file"
          id="file-upload"
          accept=".xlsx,.xls"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
      </label>

      <button
        onClick={handleUpload}
        disabled={files.length === 0 || loading}
        className={`w-full py-3.5 rounded-xl font-bold text-base text-white shadow-md transition-all ${
          files.length === 0 || loading
            ? "bg-slate-300 cursor-not-allowed"
            : "bg-blue-600 hover:bg-blue-700 active:scale-[0.98]"
        }`}
      >
        {loading ? "Memproses..." : `Upload ${files.length > 0 ? files.length + " File" : ""}`}
      </button>

      {/* Result */}
      {result && (
        <div className={`p-4 rounded-xl flex flex-col gap-2 animate-in zoom-in duration-300 ${
          result.success ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200"
        }`}>
          <div className="flex items-start gap-2">
            {result.success ? <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" /> : <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />}
            <p className="font-semibold text-sm">{result.message}</p>
          </div>
          {result.files && result.files.length > 0 && (
            <p className="text-xs opacity-70 pl-7">{result.files.length} file diproses</p>
          )}
          {result.skipped && result.skipped.length > 0 && (
            <div>
              <button
                onClick={() => setShowSkipped(!showSkipped)}
                className="flex items-center gap-1 text-xs opacity-70 hover:opacity-100 pl-7"
              >
                <Info className="w-3 h-3" />
                {result.skipped.length} sheet dilewati
                {showSkipped ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
              {showSkipped && (
                <ul className="mt-1 pl-7 text-xs opacity-60 list-disc list-inside">
                  {result.skipped.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {/* Guide */}
      <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl">
        <p className="text-sm font-bold text-amber-800 mb-2">Format Kolom Excel yang Didukung</p>
        <p className="text-xs text-amber-700 mb-2">Kolom-kolom berikut akan otomatis terbaca dari setiap sheet:</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-amber-700">
          {["ACARA","FROM DATE","TO DATE","SKU","ARTICLE","DESCRIPTION","HARGA NORMAL","DISKON","HARGA PROMO","DISCOUNT TYPE","BRAND","DEPT"].map(c => (
            <span key={c} className="font-mono bg-amber-100 px-1.5 py-0.5 rounded">{c}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
