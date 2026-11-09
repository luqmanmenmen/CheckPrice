"use client";

import { useState, useEffect, useRef } from "react";
import {
  ArrowLeft,
  RefreshCw,
  Image,
  Tag,
  Play,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink,
  Zap,
  Terminal,
  Clock,
  Check,
  X,
  Activity,
  Database,
  ChevronDown,
  ChevronUp,
  Flame,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";

interface StepItem {
  number: number;
  name: string;
  status: string;
  conclusion: string | null;
  duration?: string;
  isCompleted: boolean;
  isFailed: boolean;
  isRunning: boolean;
  isSkipped: boolean;
}

interface ActiveRun {
  id: number;
  runNumber: number;
  status: "queued" | "in_progress" | "completed";
  conclusion: "success" | "failure" | "cancelled" | null;
  percent: number;
  currentStep: string;
  totalDuration: string;
  hasError: boolean;
  errorStep: string | null;
  createdAt: string;
  updatedAt: string;
  htmlUrl: string;
  event: string;
}

interface SyncHistoryItem {
  id: string;
  type: string;
  fileName: string;
  status: string;
  records: number;
  createdAt: string;
}

interface RecentRun {
  id: number;
  runNumber: number;
  status: string;
  conclusion: string | null;
  duration: string;
  createdAt: string;
  htmlUrl: string;
}

type TriggerAction = "scrab" | "mds-bisa" | "photos" | "stock-only" | "promo" | "all";

export default function UpdateProdukPage() {
  const [isGhDispatching, setIsGhDispatching] = useState(false);
  const [activeAction, setActiveAction] = useState<TriggerAction | null>(null);
  const [ghDispatchResult, setGhDispatchResult] = useState<{
    success: boolean;
    message: string;
    actionsUrl?: string;
    help?: string;
  } | null>(null);
  const [currentUserNik, setCurrentUserNik] = useState<string | null>(null);

  // Real-time Cloud Monitor State
  const [cloudStatus, setCloudStatus] = useState<{
    activeRun: ActiveRun | null;
    steps: StepItem[];
    recentRuns: RecentRun[];
    syncHistory: SyncHistoryItem[];
  }>({
    activeRun: null,
    steps: [],
    recentRuns: [],
    syncHistory: [],
  });
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [showFullTerminal, setShowFullTerminal] = useState(false);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Ambil NIK User
  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.user) setCurrentUserNik(data.user.nik);
      })
      .catch(() => {});
  }, []);

  // Fetch Status Cloud & Runs
  const fetchCloudStatus = async (showLoading = false) => {
    if (showLoading) setIsLoadingStatus(true);
    try {
      const res = await fetch("/api/admin/trigger/github-status", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.hasRuns) {
          setCloudStatus({
            activeRun: data.activeRun,
            steps: data.steps || [],
            recentRuns: data.recentRuns || [],
            syncHistory: data.syncHistory || [],
          });
        }
      }
    } catch (e) {
      console.warn("Gagal fetch status cloud:", e);
    } finally {
      if (showLoading) setIsLoadingStatus(false);
    }
  };

  // Polling otomatis setiap 3.5 detik
  useEffect(() => {
    fetchCloudStatus(true);
    pollTimerRef.current = setInterval(() => {
      fetchCloudStatus(false);
    }, 3500);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  // DISPATCH ENGINE: Memicu GitHub Actions Python Cloud Runner (0% Eksekusi Vercel)
  const handleGitHubDispatch = async (action: TriggerAction) => {
    setIsGhDispatching(true);
    setActiveAction(action);
    setGhDispatchResult(null);

    try {
      const res = await fetch("/api/admin/trigger/github-dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, force: true }),
      });

      const text = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch {
        data = { success: false, error: text || "Server tidak merespons JSON valid" };
      }

      if (res.ok && data.success) {
        setGhDispatchResult({ success: true, message: data.message, actionsUrl: data.actionsUrl });
        setTimeout(() => fetchCloudStatus(false), 1200);
      } else {
        setGhDispatchResult({
          success: false,
          message: data.error || "Gagal memicu GitHub Actions.",
          help: data.help,
        });
      }
    } catch (err: any) {
      setGhDispatchResult({ success: false, message: err.message || "Kesalahan jaringan." });
    } finally {
      setIsGhDispatching(false);
      setActiveAction(null);
    }
  };

  const isAllowed = !currentUserNik || currentUserNik === "22054178";
  if (!isAllowed) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-rose-200 text-center max-w-sm">
          <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-800 mb-2">Akses Ditolak</h2>
          <p className="text-sm text-slate-600 mb-6">
            Hanya Developer (NIK 22054178) yang diizinkan mengakses halaman sinkronisasi ini.
          </p>
          <Link
            href="/super-admin"
            className="px-6 py-2 bg-slate-800 text-white rounded-lg text-sm font-bold hover:bg-slate-900 transition-colors"
          >
            Kembali ke Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const activeRun = cloudStatus.activeRun;
  const isRunning = activeRun?.status === "in_progress" || activeRun?.status === "queued" || isGhDispatching;
  const isSuccess = activeRun?.status === "completed" && activeRun?.conclusion === "success";
  const isFailed = activeRun?.hasError || (activeRun?.status === "completed" && activeRun?.conclusion === "failure");

  return (
    <div className="min-h-screen bg-slate-50 p-4 pb-24 max-w-2xl mx-auto flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center gap-3 justify-between">
        <div className="flex items-center gap-3">
          <Link href="/super-admin" className="p-2 rounded-full hover:bg-slate-200 transition-colors">
            <ArrowLeft className="w-5 h-5 text-slate-700" />
          </Link>
          <div>
            <h1 className="font-bold text-xl text-slate-800">Pusat Trigger 3 Kategori (GitHub Python)</h1>
            <p className="text-xs text-slate-500">
              100% Dijalankan oleh Mesin Python di GitHub Actions • 0% Beban Komputasi Vercel
            </p>
          </div>
        </div>

        {/* Tombol Refresh Status Realtime */}
        <button
          onClick={() => fetchCloudStatus(true)}
          disabled={isLoadingStatus}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:border-slate-300 rounded-xl text-xs font-semibold text-slate-700 shadow-xs transition-all disabled:opacity-50"
          title="Segarkan status proses"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoadingStatus ? "animate-spin text-indigo-600" : "text-slate-500"}`} />
          <span className="hidden sm:inline">Segarkan</span>
        </button>
      </div>

      {/* ============================================================ */}
      {/* 3 KATEGORI UTAMA MESIN PYTHON DI GITHUB ACTIONS              */}
      {/* ============================================================ */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-indigo-50 via-purple-50 to-cyan-50 flex items-center justify-between gap-2">
          <div>
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-indigo-600" />
              Rekonstruksi 3 Kategori Trigger (GitHub Actions Python Engine)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Seluruh mesin berjalan di server Ubuntu GitHub Actions dengan brankas mapping 84.763 SKU
            </p>
          </div>
          <span className="px-2.5 py-1 text-[10px] font-extrabold bg-indigo-100 text-indigo-800 rounded-full border border-indigo-200 shrink-0">
            84.763 JALUR SKU AKTIF
          </span>
        </div>

        <div className="p-4 flex flex-col gap-3.5">
          {/* ------------------------------------------------------------ */}
          {/* KATEGORI 1: SCRAB BRUTAL (MDS BISA + GAMBAR MATAHARI.COM)    */}
          {/* ------------------------------------------------------------ */}
          <div className="flex flex-col gap-3 p-4 bg-gradient-to-br from-indigo-50/90 via-purple-50/60 to-white rounded-xl border border-indigo-200 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2 py-0.5 text-[10px] font-black bg-indigo-600 text-white rounded-md uppercase tracking-wider">
                    KATEGORI 1 • SCRAB
                  </span>
                  <p className="font-bold text-indigo-950 text-sm flex items-center gap-1.5">
                    🔥 Mesin Brutal Scrab (MDS BISA & Gambar Produk Matahari.com)
                  </p>
                </div>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Menjalankan mesin Python 16-Worker (<code className="text-[11px] bg-white px-1 py-0.5 rounded border border-indigo-100">morning_full_sweep.py --brutal</code>) untuk menyerap produk baru, Barcode UPC EAN-13, Artikel, Harga & Stok, serta mesin 4-Jalur Foto Studio Produk Asli (<code className="text-[11px] bg-white px-1 py-0.5 rounded border border-purple-100">brutal_image_scraper.py</code> — bebas logo/banner).
                </p>
              </div>
              <button
                onClick={() => handleGitHubDispatch("scrab")}
                disabled={isGhDispatching || isRunning}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold rounded-xl transition-colors disabled:opacity-50 shrink-0 shadow-sm"
              >
                {isGhDispatching && activeAction === "scrab" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Flame className="w-4 h-4" />
                )}
                {isGhDispatching && activeAction === "scrab" ? "Menyalakan..." : "Scrab Komplit (MDS + Foto)"}
              </button>
            </div>

            {/* Sub-tombol untuk menjalankan salah satu mesin Scrab secara terpisah jika diinginkan */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-indigo-100/80">
              <button
                onClick={() => handleGitHubDispatch("mds-bisa")}
                disabled={isGhDispatching || isRunning}
                className="flex items-center justify-center gap-1.5 px-3 py-2 bg-white hover:bg-indigo-50 text-indigo-800 border border-indigo-200 text-xs font-bold rounded-lg transition-colors disabled:opacity-50"
              >
                {isGhDispatching && activeAction === "mds-bisa" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Database className="w-3.5 h-3.5 text-indigo-600" />
                )}
                🏪 Scrab Data MDS BISA Saja (16 Workers)
              </button>

              <button
                onClick={() => handleGitHubDispatch("photos")}
                disabled={isGhDispatching || isRunning}
                className="flex items-center justify-center gap-1.5 px-3 py-2 bg-white hover:bg-purple-50 text-purple-800 border border-purple-200 text-xs font-bold rounded-lg transition-colors disabled:opacity-50"
              >
                {isGhDispatching && activeAction === "photos" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Image className="w-3.5 h-3.5 text-purple-600" />
                )}
                📸 Scrab Foto Produk Matahari.com Saja
              </button>
            </div>
          </div>

          {/* ------------------------------------------------------------ */}
          {/* KATEGORI 2: UPDATE STOCK LIVE (JALUR MAPPING 84.763 SKU)     */}
          {/* ------------------------------------------------------------ */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 bg-gradient-to-br from-cyan-50/90 to-white rounded-xl border border-cyan-200 shadow-2xs">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 text-[10px] font-black bg-cyan-600 text-white rounded-md uppercase tracking-wider">
                  KATEGORI 2 • UPDATE STOCK
                </span>
                <p className="font-bold text-cyan-950 text-sm flex items-center gap-1.5">
                  ⚡ Update Stock Live Terkini (Jalur Mapping 84.763 SKU & Artikel)
                </p>
              </div>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Memanfaatkan seluruh <strong>84.763 jalur mapping SKU, Barcode & Artikel</strong> yang sudah tersimpan di <code className="text-[11px] bg-white px-1 py-0.5 rounded border border-cyan-100">mapped_sku_paths.json.gz</code> untuk memperbarui stok fisik terkini (<code className="text-[11px]">stok</code> & <code className="text-[11px]">relatedStock</code> multi-warna/size) dengan 16 Worker Python tanpa membuang jalur SKU sedikit pun.
              </p>
            </div>
            <button
              onClick={() => handleGitHubDispatch("stock-only")}
              disabled={isGhDispatching || isRunning}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-extrabold rounded-xl transition-colors disabled:opacity-50 shrink-0 shadow-sm"
            >
              {isGhDispatching && activeAction === "stock-only" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Zap className="w-4 h-4" />
              )}
              {isGhDispatching && activeAction === "stock-only" ? "Menyalakan..." : "Update Stock Live"}
            </button>
          </div>

          {/* ------------------------------------------------------------ */}
          {/* KATEGORI 3: UPDATE PROMO EMAIL (PYTHON PROMO ENGINE)         */}
          {/* ------------------------------------------------------------ */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 bg-gradient-to-br from-sky-50/90 to-white rounded-xl border border-sky-200 shadow-2xs">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 text-[10px] font-black bg-sky-600 text-white rounded-md uppercase tracking-wider">
                  KATEGORI 3 • UPDATE PROMO
                </span>
                <p className="font-bold text-sky-950 text-sm flex items-center gap-1.5">
                  🏷️ Update Promo Email (Mesin Python & Gemini AI)
                </p>
              </div>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Membedah seluruh file Excel promo terbaru dari email (<code className="text-[11px] bg-white px-1 py-0.5 rounded border border-sky-100">run_promo_sync.py</code> di GitHub Actions) untuk memperbarui Harga Promo, Diskon, dan Periode Acara. Stok fisik, Barcode UPC, dan Foto Studio tetap 100% terlindungi.
              </p>
            </div>
            <button
              onClick={() => handleGitHubDispatch("promo")}
              disabled={isGhDispatching || isRunning}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-extrabold rounded-xl transition-colors disabled:opacity-50 shrink-0 shadow-sm"
            >
              {isGhDispatching && activeAction === "promo" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Tag className="w-4 h-4" />
              )}
              {isGhDispatching && activeAction === "promo" ? "Menyalakan..." : "Update Promo Email"}
            </button>
          </div>

          {/* ------------------------------------------------------------ */}
          {/* TOMBOL KOMPLIT: JALANKAN 3 KATEGORI SEKALIGUS                */}
          {/* ------------------------------------------------------------ */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-xl shadow-md border border-slate-800 mt-0.5">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 text-[10px] font-extrabold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full flex items-center gap-1">
                  <Zap className="w-2.5 h-2.5 text-emerald-400" /> ALL-IN-ONE CLOUD
                </span>
                <p className="font-bold text-sm text-slate-100">
                  Jalankan 3 Kategori Sekaligus (Scrab + Update Stock + Promo Email)
                </p>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Dieksekusi berurutan 100% di GitHub Actions Python Runner tanpa membebani Vercel.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => handleGitHubDispatch("all")}
                disabled={isGhDispatching || isRunning}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-400 hover:to-green-400 text-slate-950 text-xs font-black rounded-xl transition-all disabled:opacity-50 shadow-md shadow-emerald-500/20"
              >
                {isGhDispatching && activeAction === "all" ? (
                  <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                ) : (
                  <Play className="w-4 h-4 fill-current" />
                )}
                {isGhDispatching && activeAction === "all" ? "Menyalakan..." : "Jalankan Semua (3 Kategori)"}
              </button>
            </div>
          </div>

          {/* Result Banner Dispatch Feedback */}
          {ghDispatchResult && (
            <div
              className={`flex items-start gap-2.5 p-3.5 rounded-xl text-xs font-medium border mt-1 animate-in fade-in duration-200 ${
                ghDispatchResult.success
                  ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                  : "bg-amber-50 border-amber-200 text-amber-900"
              }`}
            >
              {ghDispatchResult.success ? (
                <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" />
              ) : (
                <AlertCircle className="w-5 h-5 shrink-0 text-amber-600" />
              )}
              <div className="flex-1">
                <p className="font-bold text-sm">{ghDispatchResult.message}</p>
                {ghDispatchResult.actionsUrl && (
                  <a
                    href={ghDispatchResult.actionsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-emerald-700 hover:underline font-bold mt-1 text-xs"
                  >
                    Buka antrean di GitHub Actions <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
                {ghDispatchResult.help && <p className="text-xs opacity-90 mt-1">{ghDispatchResult.help}</p>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/* MONITOR LIVE & LOG PROSES SINKRONISASI (REALTIME CLOUD LOG)  */}
      {/* ============================================================ */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        {/* Header Monitor */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center shrink-0">
              <Activity
                className={`w-4 h-4 ${
                  isRunning ? "text-amber-400 animate-pulse" : isFailed ? "text-rose-400" : "text-emerald-400"
                }`}
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-slate-100">Live Monitor & Log Eksekusi Cloud (GitHub Actions)</h3>
                {activeRun && (
                  <span className="px-2 py-0.5 text-[10px] font-mono bg-slate-800 text-slate-300 rounded-md border border-slate-700">
                    Run #{activeRun.runNumber}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400">
                Status proses Python Engine, persentase progres, dan deteksi error runner GitHub
              </p>
            </div>
          </div>

          {/* Status Badge */}
          <div className="shrink-0 flex items-center gap-2">
            {isRunning && (
              <span className="flex items-center gap-1.5 px-3 py-1 text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full animate-pulse">
                <Loader2 className="w-3 h-3 animate-spin" /> Sedang Berjalan ({activeRun?.percent || 15}%)
              </span>
            )}
            {isSuccess && (
              <span className="flex items-center gap-1 px-3 py-1 text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full">
                <Check className="w-3.5 h-3.5 text-emerald-400" /> Selesai 100%
              </span>
            )}
            {isFailed && (
              <span className="flex items-center gap-1 px-3 py-1 text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-full">
                <X className="w-3.5 h-3.5 text-rose-400" /> Error / Gagal
              </span>
            )}
            {!activeRun && (
              <span className="px-3 py-1 text-xs font-semibold bg-slate-800 text-slate-400 rounded-full">Siap</span>
            )}
          </div>
        </div>

        {/* Content Monitor */}
        <div className="p-4 flex flex-col gap-4">
          {/* Progress Bar & Durasi */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-bold text-slate-700 flex items-center gap-1.5 truncate">
                {isRunning ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500 shrink-0" />
                    <span>Langkah: {activeRun?.currentStep || "Menyiapkan cloud runner..."}</span>
                  </>
                ) : isFailed ? (
                  <span className="text-rose-600 font-bold">
                    Terjadi kegagalan: {activeRun?.errorStep || activeRun?.currentStep}
                  </span>
                ) : (
                  <span className="text-slate-600">
                    Terakhir: {activeRun?.currentStep || "Workflow siap dijalankan"}
                  </span>
                )}
              </span>
              <span className="font-black font-mono text-sm shrink-0 ml-2 text-indigo-600">
                {activeRun?.percent || 0}%
              </span>
            </div>

            {/* Visual Bar */}
            <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden p-0.5 border border-slate-200">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isFailed
                    ? "bg-rose-500"
                    : isSuccess
                    ? "bg-emerald-500"
                    : "bg-gradient-to-r from-indigo-500 via-sky-500 to-emerald-400"
                } ${isRunning ? "animate-pulse" : ""}`}
                style={{ width: `${Math.max(5, activeRun?.percent || 0)}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" /> Durasi: {activeRun?.totalDuration || "0s"}
              </span>
              {activeRun?.updatedAt && (
                <span>
                  Update:{" "}
                  {new Date(activeRun.updatedAt).toLocaleTimeString("id-ID", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}{" "}
                  WIB
                </span>
              )}
            </div>
          </div>

          {/* Alert Error Box Jika Terjadi Kegagalan */}
          {isFailed && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-900 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-bold">Langkah Terhenti Karena Error:</p>
                <p className="font-mono text-[11px] text-rose-700 mt-0.5">
                  {activeRun?.errorStep || "Kegagalan pada salah satu step runner cloud."}
                </p>
                <p className="text-[11px] text-rose-600 mt-1">
                  Silakan periksa log terminal di bawah atau buka tautan GitHub untuk meninjau detail error
                  selengkapnya.
                </p>
              </div>
            </div>
          )}

          {/* Checklist Langkah-Langkah Eksekusi Cloud */}
          {cloudStatus.steps.length > 0 && (
            <div className="border border-slate-100 rounded-xl overflow-hidden bg-slate-50/60 p-3">
              <p className="text-xs font-bold text-slate-700 mb-2 flex items-center justify-between">
                <span>Rincian Langkah Eksekusi (Checklist Cloud)</span>
                <span className="text-[10px] text-slate-400 font-normal">
                  {cloudStatus.steps.filter((s) => s.isCompleted && !s.isSkipped).length} dari{" "}
                  {cloudStatus.steps.filter((s) => !s.isSkipped).length} selesai
                </span>
              </p>

              <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto pr-1">
                {cloudStatus.steps
                  .filter(
                    (step) =>
                      !step.name.startsWith("Post ") && step.name !== "Set up job" && step.name !== "Complete job"
                  )
                  .map((step) => (
                    <div
                      key={step.number}
                      className={`flex items-center justify-between p-2 rounded-lg text-xs border transition-colors ${
                        step.isFailed
                          ? "bg-rose-50/90 border-rose-200 text-rose-900"
                          : step.isRunning
                          ? "bg-amber-50 border-amber-200 text-amber-900 font-semibold shadow-xs"
                          : step.isCompleted && !step.isSkipped
                          ? "bg-white border-slate-200 text-slate-800"
                          : "bg-slate-100/70 border-slate-100 text-slate-400 opacity-70"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {step.isFailed ? (
                          <div className="w-4 h-4 rounded-full bg-rose-600 text-white flex items-center justify-center shrink-0">
                            <X className="w-2.5 h-2.5" />
                          </div>
                        ) : step.isRunning ? (
                          <Loader2 className="w-4 h-4 text-amber-600 animate-spin shrink-0" />
                        ) : step.isCompleted && !step.isSkipped ? (
                          <div className="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
                            <Check className="w-2.5 h-2.5" />
                          </div>
                        ) : (
                          <span className="w-4 h-4 rounded-full bg-slate-300 text-slate-600 text-[9px] flex items-center justify-center shrink-0 font-mono">
                            -
                          </span>
                        )}
                        <span className="truncate">{step.name}</span>
                      </div>

                      <div className="shrink-0 flex items-center gap-2 text-[11px]">
                        {step.duration && <span className="text-slate-400 font-mono">{step.duration}</span>}
                        {step.isFailed && <span className="font-bold text-rose-600">ERROR</span>}
                        {step.isRunning && <span className="font-bold text-amber-600 animate-pulse">BERJALAN</span>}
                        {step.isSkipped && <span className="text-slate-400">LEWATI</span>}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Terminal Console Output */}
          <div className="rounded-xl overflow-hidden border border-slate-800 bg-slate-950 shadow-inner">
            <div className="flex items-center justify-between px-3 py-2 bg-slate-900 border-b border-slate-800 text-[11px] text-slate-300">
              <span className="flex items-center gap-1.5 font-mono">
                <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                Console Log Output
              </span>
              <button
                onClick={() => setShowFullTerminal(!showFullTerminal)}
                className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-white transition-colors"
              >
                {showFullTerminal ? "Ringkas" : "Perluas"}
                {showFullTerminal ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            </div>

            <div
              className={`p-3 font-mono text-xs text-slate-200 overflow-y-auto space-y-1 ${
                showFullTerminal ? "max-h-80" : "max-h-36"
              }`}
            >
              <div className="text-emerald-400">
                [SYSTEM] Mesin Python 3 Kategori (Scrab • Update Stock • Promo Email) siap di GitHub Actions.
              </div>
              {activeRun && (
                <>
                  <div className="text-indigo-300">
                    [{new Date(activeRun.createdAt).toLocaleTimeString("id-ID")}] 🚀 Run #{activeRun.runNumber} aktif
                    (Trigger: {activeRun.event})
                  </div>
                  <div className="text-slate-400">
                    [PROGRES] Progres saat ini: {activeRun.percent}% ({activeRun.currentStep})
                  </div>
                  {activeRun.hasError && (
                    <div className="text-rose-400 font-bold">
                      [ERROR] 💥 Terjadi kendala pada: {activeRun.errorStep || activeRun.currentStep}
                    </div>
                  )}
                  {activeRun.conclusion === "success" && (
                    <div className="text-emerald-300 font-bold">
                      [SUKSES] 🎉 Seluruh tahapan sinkronisasi selesai ({activeRun.totalDuration}) tanpa error!
                    </div>
                  )}
                </>
              )}

              {/* Data Sinkronisasi Tersimpan di Supabase */}
              {cloudStatus.syncHistory.length > 0 && (
                <div className="pt-2 border-t border-slate-800 mt-2">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                    <Database className="w-3 h-3 text-cyan-400" /> Riwayat Data Masuk ke Database Supabase:
                  </div>
                  {cloudStatus.syncHistory.slice(0, 3).map((item) => (
                    <div key={item.id} className="text-cyan-300 text-[11px] truncate">
                      • {item.type}: {item.fileName} ➔ {item.records.toLocaleString("id-ID")} produk ({item.status})
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Footer Action & Link ke GitHub */}
          {activeRun?.htmlUrl && (
            <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
              <span>Buka log mentah jika ingin inspeksi baris per baris:</span>
              <a
                href={activeRun.htmlUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-bold text-indigo-600 hover:text-indigo-800 hover:underline"
              >
                Log GitHub #{activeRun.runNumber} <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}
        </div>

        {/* CARD RIWAYAT UPDATE TERAKHIR (3 KATEGORI UTAMA) */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
                <h3 className="font-bold text-slate-800 text-sm sm:text-base">
                  Status & Riwayat 3 Kategori Mesin Python
                </h3>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Rekapitulasi data riil yang tersimpan di Supabase dari ketiga kategori mesin
              </p>
            </div>
            <button
              onClick={() => fetchCloudStatus(true)}
              className="self-start sm:self-auto px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingStatus ? "animate-spin" : ""}`} />
              Segarkan Riwayat
            </button>
          </div>

          {/* 3 Status Kategori Terakhir */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Kategori 1: Scrab (MDS BISA & Foto) */}
            <div className="p-3.5 rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50/70 to-white">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 flex items-center gap-1">
                  <Flame className="w-3.5 h-3.5 text-indigo-600" /> 1. Scrab Brutal
                </span>
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                  AKTIF
                </span>
              </div>
              <p className="text-xs font-bold text-slate-800">84.763 SKU • 35.293 Foto</p>
              <p className="text-[11px] text-slate-500 mt-0.5">MDS BISA + Studio Matahari.com</p>
            </div>

            {/* Kategori 2: Update Stock Live */}
            <div className="p-3.5 rounded-xl border border-cyan-100 bg-gradient-to-br from-cyan-50/70 to-white">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-700 flex items-center gap-1">
                  <Zap className="w-3.5 h-3.5 text-cyan-600" /> 2. Update Stock
                </span>
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                  TERPETAKAN
                </span>
              </div>
              <p className="text-xs font-bold text-slate-800">
                {cloudStatus.syncHistory.find((h) => h.type === "STOCK_SYNC" || h.type === "MDS_BISA_SYNC")
                  ? `${cloudStatus.syncHistory
                      .find((h) => h.type === "STOCK_SYNC" || h.type === "MDS_BISA_SYNC")
                      ?.records.toLocaleString("id-ID")} Jalur SKU`
                  : "84.763 Jalur SKU"}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">Mapping SKU & Multi-Varian Artikel</p>
            </div>

            {/* Kategori 3: Update Promo Email */}
            <div className="p-3.5 rounded-xl border border-sky-100 bg-gradient-to-br from-sky-50/70 to-white">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-sky-700 flex items-center gap-1">
                  <Tag className="w-3.5 h-3.5 text-sky-600" /> 3. Promo Email
                </span>
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                  SIAP
                </span>
              </div>
              <p className="text-xs font-bold text-slate-800">
                {cloudStatus.syncHistory.find((h) => h.type === "UPDATE_PROMO")
                  ? `${cloudStatus.syncHistory.find((h) => h.type === "UPDATE_PROMO")?.records.toLocaleString("id-ID")} SKU Promo`
                  : "Python Promo Parser"}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                {cloudStatus.syncHistory.find((h) => h.type === "UPDATE_PROMO")
                  ? new Date(cloudStatus.syncHistory.find((h) => h.type === "UPDATE_PROMO")!.createdAt).toLocaleString(
                      "id-ID",
                      { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }
                    ) + " WIB"
                  : "Otomatis dari Folder PROMO/"}
              </p>
            </div>
          </div>

          {/* Tabel Riwayat Eksekusi */}
          <div className="overflow-x-auto border border-slate-100 rounded-xl">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 border-b border-slate-100">
                <tr>
                  <th className="px-3.5 py-2.5">Waktu Eksekusi</th>
                  <th className="px-3.5 py-2.5">Kategori Mesin</th>
                  <th className="px-3.5 py-2.5">Deskripsi / Target</th>
                  <th className="px-3.5 py-2.5 text-right">Data Diperbarui</th>
                  <th className="px-3.5 py-2.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cloudStatus.syncHistory.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-4 text-slate-400 text-xs">
                      Belum ada riwayat sync di database
                    </td>
                  </tr>
                ) : (
                  cloudStatus.syncHistory.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-3.5 py-2.5 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                        {new Date(item.createdAt).toLocaleString("id-ID", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}{" "}
                        WIB
                      </td>
                      <td className="px-3.5 py-2.5 font-bold text-slate-800 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] ${
                            item.type.includes("STOCK")
                              ? "bg-cyan-50 text-cyan-700 border border-cyan-200"
                              : item.type.includes("MDS") || item.type.includes("SCRAB") || item.type.includes("PHOTO")
                              ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                              : "bg-sky-50 text-sky-700 border border-sky-200"
                          }`}
                        >
                          {item.type}
                        </span>
                      </td>
                      <td className="px-3.5 py-2.5 text-slate-600 truncate max-w-xs">{item.fileName}</td>
                      <td className="px-3.5 py-2.5 text-right font-mono font-bold text-slate-700 whitespace-nowrap">
                        {item.records.toLocaleString("id-ID")} item
                      </td>
                      <td className="px-3.5 py-2.5 text-center whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            item.status === "SUCCESS"
                              ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                              : "bg-rose-100 text-rose-800 border border-rose-200"
                          }`}
                        >
                          {item.status === "SUCCESS" ? "SUKSES" : "GAGAL"}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
