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
  const [isFullResyncing, setIsFullResyncing] = useState(false);
  const [fullResyncMsg, setFullResyncMsg] = useState("");
  const [historyList, setHistoryList] = useState<any[]>([]);
  const [currentUserNik, setCurrentUserNik] = useState<string | null>(null);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

  const fetchSyncHistory = async () => {
    try {
      const res = await fetch("/api/admin/sync-history?limit=10&type=UPDATE_PROMO");
      const data = await res.json();
      if (data.success && data.data && data.data.length > 0) {
        const latest = data.data[0];
        const userName = latest.user ? `${latest.user.nik} - ${latest.user.name}` : "Sistem";
        setLastSync({
          name: userName,
          date: latest.fileName ? `${latest.fileName.split(" | ").length} File` : new Date(latest.createdAt).toLocaleString("id-ID", { dateStyle: 'medium', timeStyle: 'short' })
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
    fetch("/api/auth/me").then(res => res.json()).then(data => {
      if (data.user) setCurrentUserNik(data.user.nik);
    }).catch(() => {});
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
          const rowsWithSource = rawRows.map((r: any) => ({
            ...r,
            __SOURCE_FILE__: file.name,
            __SOURCE_SHEET__: sheetName
          }));
          allRows = allRows.concat(rowsWithSource);
        }
      }

      if (allRows.length === 0) {
        setStatus("error");
        setResultMsg("Semua file kosong atau tidak terbaca.");
        setAlertState({ isOpen: true, title: "Gagal", message: "File kosong.", type: "error" });
        return;
      }

      // 1.5 Upload fisik file ke Vercel Blob
      let uploadedBlobUrl = null;
      try {
        setResultMsg("Menghapus file promo lama di Cloud...");
        await fetch("/api/upload/clean-folder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folder: "PROMO" })
        });

        setResultMsg("Menyimpan fisik file promo ke Cloud Storage...");
        const blobUrls = await Promise.all(
          files.map(async (f) => {
            const formData = new FormData();
            formData.append("file", f);
            formData.append("folder", "PROMO");
            const res = await fetch("/api/upload/file", { method: "POST", body: formData });
            if (res.ok) {
              const data = await res.json();
              return data.url;
            }
            return null;
          })
        );
        const validUrls = blobUrls.filter(Boolean);
        if (validUrls.length > 0) {
          uploadedBlobUrl = validUrls.join(",");
        }
      } catch (err) {
        console.error("Gagal upload promo ke Blob", err);
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
          fileName: files.map(f => f.name).join(" | "),
          fileUrl: uploadedBlobUrl,
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

  const handleFullResync = async () => {
    if (!confirm("Sinkronisasi promo dari semua file di folder PROMO Blob? File-file ini akan digabung dan diproses sekaligus.")) return;
    setIsFullResyncing(true);
    setFullResyncMsg("Mengambil daftar file Promo dari server...");
    
    try {
      const listRes = await fetch("/api/upload/blob-files?folder=PROMO");
      const listData = await listRes.json();
      
      if (!listRes.ok || !listData.success) {
        throw new Error(listData.error || "Gagal mengambil list file blob");
      }
      
      const blobs = listData.blobs; // sorted oldest to newest
      if (blobs.length === 0) {
        setAlertState({ isOpen: true, title: "Kosong", message: "Tidak ada file Promo di Blob", type: "warning" });
        setIsFullResyncing(false);
        return;
      }

      // ============================================================
      // PROMO: Gabungkan SEMUA file sekaligus dalam 1 batch
      // Karena folder PROMO selalu bersih (lama dihapus, baru diupload),
      // semua file di folder = 1 periode promo yang sama → harus digabung.
      // Jangan loop satu-satu (nanti saling menimpa!).
      // ============================================================
      let successCount = 0;
      for (let i = 0; i < blobs.length; i++) {
        const b = blobs[i];
        setFullResyncMsg(`Mendownload file ${i+1}/${blobs.length}: ${b.filename}`);
        
        try {
          // Download blob langsung dari client
          const fileRes = await fetch(b.url);
          if (!fileRes.ok) throw new Error("Gagal download blob");
          const ab = await fileRes.arrayBuffer();
          const workbook = xlsx.read(ab, { type: "buffer", cellDates: false });

          setFullResyncMsg(`Menganalisis file ${i+1}/${blobs.length}: ${b.filename}`);

          const findHeaderRowIndex = (ws: any): number => {
            const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: "" }) as any[][];
            for (let j = 0; j < Math.min(20, rows.length); j++) {
              const row = rows[j];
              if (!row) continue;
              const hasSKU = row.some(cell => {
                if (typeof cell !== 'string') return false;
                const c = cell.toUpperCase().trim();
                return c === "SKU" || c === "KODE PRODUK" || c === "KODE" || c === "ARTICLE" || c === "BARCODE";
              });
              if (hasSKU) return j;
            }
            return 0;
          };

          let allRows: any[] = [];
          for (const sheetName of workbook.SheetNames) {
            const ws = workbook.Sheets[sheetName];
            const headerRowIndex = findHeaderRowIndex(ws);
            const rawRows = xlsx.utils.sheet_to_json(ws, { range: headerRowIndex, defval: "" });
            const rowsWithSource = rawRows.map((r: any) => ({
              ...r,
              __SOURCE_FILE__: b.filename,
              __SOURCE_SHEET__: sheetName
            }));
            allRows = allRows.concat(rowsWithSource);
          }

          if (allRows.length > 0) {
            const CHUNK_SIZE = 500;
            const totalChunks = Math.ceil(allRows.length / CHUNK_SIZE);
            
            for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
              const chunk = allRows.slice(chunkIdx * CHUNK_SIZE, (chunkIdx + 1) * CHUNK_SIZE);
              setFullResyncMsg(`Menyimpan ${b.filename} (${chunkIdx + 1}/${totalChunks})`);
              
              const payload = {
                type: "UPDATE_PROMO",
                fileName: b.filename,
                fileUrl: b.url,
                uploadDate: new Date().toISOString(),
                isLastChunk: chunkIdx === totalChunks - 1,
                totalRecords: allRows.length,
                rows: chunk
              };

              const chunkRes = await fetch("/api/upload/chunk", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
              });

              if (!chunkRes.ok) {
                throw new Error("Gagal mengirim chunk");
              }
            }
          }
          successCount++;
        } catch (fileErr: any) {
          console.error(`Gagal memproses file ${b.filename}:`, fileErr);
        }
      }
      
      setAlertState({ isOpen: true, title: "✅ Berhasil!", message: `Berhasil memproses ${successCount}/${blobs.length} file promo dari Blob.`, type: "success" });
      fetchSyncHistory();
    } catch (err: any) {
      setAlertState({ isOpen: true, title: "Error Sync Promo", message: err.message || "Terjadi kesalahan", type: "error" });
    } finally {
      setIsFullResyncing(false);
      setFullResyncMsg("");
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
        
        <div className="flex gap-2 items-center">
          <button
            onClick={handleFullResync}
            disabled={isFullResyncing || isResetting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors disabled:opacity-50"
            title="Baca semua file promo dari folder PROMO di Blob, gabung jadi 1 batch, dan sinkronisasi"
          >
            {isFullResyncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />}
            {isFullResyncing ? "Menyinkronisasi..." : "Sync dari Blob"}
          </button>
          <button
            onClick={handleResetClick}
            disabled={isResetting || isFullResyncing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100 transition-colors disabled:opacity-50"
            title="Hapus semua riwayat log promo"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            Reset Log
          </button>
        </div>
      </div>

      {isFullResyncing && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex gap-3 text-emerald-800 shadow-sm">
          <Loader2 className="w-5 h-5 shrink-0 mt-0.5 animate-spin text-emerald-600" />
          <div className="text-sm">
            <p className="font-bold mb-1">Sedang Sync Promo dari Blob...</p>
            <p className="opacity-90 text-xs">{fullResyncMsg}</p>
          </div>
        </div>
      )}

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
            <p className="text-xs text-slate-500 mb-1">Nama File Terakhir</p>
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

      {/* Riwayat Upload (Hanya untuk 22054178) */}
      {currentUserNik === "22054178" && historyList.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mt-6">
          <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <h3 className="font-bold text-slate-800 text-sm">Riwayat Upload Promo</h3>
            <span className="text-[10px] bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded font-bold">{historyList.length} Folder</span>
          </div>
          <div className="divide-y divide-slate-100">
            {historyList.map((hist, idx) => {
              const fileNames = hist.fileName ? hist.fileName.split(" | ") : ["File"];
              const fileCount = fileNames.length;
              const isExpanded = expandedHistoryId === hist.id;
              
              return (
                <div key={hist.id || idx} className="flex flex-col hover:bg-slate-50 transition-colors">
                  <div 
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer"
                    onClick={() => setExpandedHistoryId(isExpanded ? null : hist.id)}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${hist.status === 'SUCCESS' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                        <FileType className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="font-bold text-slate-700 text-sm">Update Promo {new Date(hist.createdAt).toLocaleDateString("id-ID")}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5 flex gap-2">
                          <span>{new Date(hist.createdAt).toLocaleTimeString("id-ID", { hour: '2-digit', minute: '2-digit' })}</span>
                          <span>&bull;</span>
                          <span>{hist.user ? `${hist.user.nik} - ${hist.user.name}` : 'Sistem'}</span>
                        </p>
                        <div className="flex gap-2 mt-1">
                          <p className="text-[10px] text-emerald-600 font-bold inline-block bg-emerald-50 px-1.5 py-0.5 rounded">{fileCount} File Didalamnya</p>
                          {hist.status === 'SUCCESS' ? (
                            <p className="text-[10px] text-emerald-600 font-bold inline-block bg-emerald-50 px-1.5 py-0.5 rounded">{hist.records} baris diproses</p>
                          ) : (
                            <p className="text-[10px] text-rose-600 font-bold inline-block bg-rose-50 px-1.5 py-0.5 rounded">Gagal diproses</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-1 bg-slate-50/50">
                      <div className="pl-11 border-l-2 border-slate-200 ml-5 py-2">
                        <p className="text-xs font-bold text-slate-600 mb-2">Daftar File:</p>
                        <ul className="space-y-1.5">
                          {fileNames.map((name: string, i: number) => (
                            <li key={i} className="text-xs text-slate-500 flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                              {name}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

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
