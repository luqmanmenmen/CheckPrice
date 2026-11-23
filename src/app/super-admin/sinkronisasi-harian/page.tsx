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
  Copy,
  Wrench,
  Search,
  RotateCcw,
  PackagePlus,
} from "lucide-react";
import Link from "next/link";
import { APP_VERSION } from "@/lib/version";
import SkuAuditPivotCard from "@/components/SkuAuditPivotCard";

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
  primaryJobId?: number | null;
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
  newSkusAdded?: number;
  newArticlesAdded?: number;
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

interface ConsoleLogLine {
  ts: string;
  step: string;
  level: "info" | "warn" | "error" | "heal" | "db" | "success";
  text: string;
}

interface DiagnosticItem {
  ts?: string;
  step?: string;
  attempt?: number;
  code: string;
  title: string;
  detail: string;
  retryable?: boolean;
  traceback?: {
    file?: string;
    lineNo?: number;
    exceptionType?: string;
    exceptionMsg?: string;
    snippet?: string;
  } | null;
}

interface HealRecord {
  ts?: string;
  step?: string;
  attempt?: number;
  diagnosisCode: string;
  healed: boolean;
  message: string;
}

interface NewProductSample {
  sku: string;
  article: string | null;
  description: string;
  brand: string | null;
  color: string | null;
  size: string | null;
  stok: number;
}

interface NewProductsSummary {
  newSkusAdded: number;
  newArticlesAdded: number;
  samples?: NewProductSample[];
  sourceFileName?: string;
  sourceTime?: string;
}

interface DbMetrics {
  totalProducts: number;
  totalArticles: number;
}

type TriggerAction = "scrab" | "mds-bisa" | "muku-scrab" | "stock-only" | "suko-stock" | "muku-stock" | "photos" | "promo" | "upcoming-promo" | "catalog" | "analytics" | "all";

const MAX_FRONTEND_AUTO_RETRIES = 3;

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
    consoleSource: "live-guardian" | "github-raw" | "summary";
    consoleLines: ConsoleLogLine[];
    diagnostics: DiagnosticItem[];
    healsApplied: HealRecord[];
    newProductsSummary: NewProductsSummary | null;
    lastAction: TriggerAction;
    dbMetrics: DbMetrics | null;
  }>({
    activeRun: null,
    steps: [],
    recentRuns: [],
    syncHistory: [],
    consoleSource: "summary",
    consoleLines: [],
    diagnostics: [],
    healsApplied: [],
    newProductsSummary: null,
    lastAction: "all",
    dbMetrics: null,
  });
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [showFullTerminal, setShowFullTerminal] = useState(true);
  const [logFilter, setLogFilter] = useState<"all" | "error" | "heal" | "db">("all");
  const [logSearch, setLogSearch] = useState("");
  const [autoScrollLog, setAutoScrollLog] = useState(true);
  const [copiedLog, setCopiedLog] = useState(false);
  const [showSamples, setShowSamples] = useState(false);

  // Bug Diagnosis, Self-Healing & Auto-Retry Loop State
  const [autoRetryEnabled, setAutoRetryEnabled] = useState(true);
  const [autoRetryCount, setAutoRetryCount] = useState(0);
  const [autoRetryCountdown, setAutoRetryCountdown] = useState<number | null>(null);
  const [isSelfHealing, setIsSelfHealing] = useState(false);
  const [lastTriggerUsed, setLastTriggerUsed] = useState<TriggerAction | null>(null);
  // Optimistic Queued State: mencegah tombol balik idle sebelum GitHub Actions selesai membuat run baru (~3-8 detik)
  const [optimisticQueued, setOptimisticQueued] = useState<{
    action: TriggerAction;
    preRunId: number | null;
    startedAt: number;
  } | null>(null);
  const optimisticQueuedRef = useRef<{
    action: TriggerAction;
    preRunId: number | null;
    startedAt: number;
  } | null>(null);
  const postDispatchTimersRef = useRef<NodeJS.Timeout[]>([]);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const logContainerRef = useRef<HTMLDivElement | null>(null);
  const retriedRunIdsRef = useRef<Set<number>>(new Set());

  const clearPostDispatchTimers = () => {
    for (const t of postDispatchTimersRef.current) clearTimeout(t);
    postDispatchTimersRef.current = [];
  };

  const setOptimisticState = (
    next: { action: TriggerAction; preRunId: number | null; startedAt: number } | null
  ) => {
    optimisticQueuedRef.current = next;
    setOptimisticQueued(next);
  };

  useEffect(() => {
    return () => clearPostDispatchTimers();
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const savedAuto = localStorage.getItem("guardian_auto_retry");
        if (savedAuto === "false") setAutoRetryEnabled(false);
        const savedAction = localStorage.getItem("guardian_last_action") as TriggerAction | null;
        if (savedAction) setLastTriggerUsed(savedAction);
      } catch {}
    }
  }, []);

  const toggleAutoRetry = () => {
    setAutoRetryEnabled((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        localStorage.setItem("guardian_auto_retry", String(next));
      }
      if (!next) setAutoRetryCountdown(null);
      return next;
    });
  };

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
          const opt = optimisticQueuedRef.current;
          const incomingRun: ActiveRun | null = data.activeRun || null;
          if (opt) {
            const isNewRun = Boolean(incomingRun && incomingRun.id !== opt.preRunId);
            const isAlreadyActive =
              incomingRun?.status === "queued" || incomingRun?.status === "in_progress";
            const isExpired = Date.now() - opt.startedAt > 22000;
            if (isNewRun || isAlreadyActive || isExpired) {
              clearPostDispatchTimers();
              setOptimisticState(null);
            }
          }
          setCloudStatus({
            activeRun: incomingRun,
            steps: data.steps || [],
            recentRuns: data.recentRuns || [],
            syncHistory: data.syncHistory || [],
            consoleSource: data.consoleSource || "summary",
            consoleLines: data.consoleLines || [],
            diagnostics: data.diagnostics || [],
            healsApplied: data.healsApplied || [],
            newProductsSummary: data.newProductsSummary || null,
            lastAction: data.lastAction || "all",
            dbMetrics: data.dbMetrics || null,
          });
        }
      }
    } catch (e) {
      console.warn("Gagal fetch status cloud:", e);
    } finally {
      if (showLoading) setIsLoadingStatus(false);
    }
  };

  // Jadwalkan polling bertahap (3s, 6.5s, 11s, 16s) setelah dispatch agar run baru GitHub langsung tertangkap di klik ke-1
  const schedulePostDispatchPolls = (action: TriggerAction, preRunId: number | null) => {
    clearPostDispatchTimers();
    setOptimisticState({ action, preRunId, startedAt: Date.now() });
    const delays = [3000, 6500, 11000, 16000];
    for (const ms of delays) {
      const timer = setTimeout(() => {
        if (!optimisticQueuedRef.current) return;
        fetchCloudStatus(false);
      }, ms);
      postDispatchTimersRef.current.push(timer);
    }
    const expireTimer = setTimeout(() => {
      if (optimisticQueuedRef.current) {
        setOptimisticState(null);
        fetchCloudStatus(false);
      }
    }, 22000);
    postDispatchTimersRef.current.push(expireTimer);
  };

  // Smart Adaptive Polling:
  // - Pause total saat tab tidak terlihat (0 query Turso saat background!)
  // - 5 detik saat workflow aktif berjalan atau antrean optimistik, 30 detik saat idle
  const isActiveWorkflowRun =
    cloudStatus.activeRun?.status === "in_progress" ||
    cloudStatus.activeRun?.status === "queued" ||
    Boolean(optimisticQueued);

  useEffect(() => {
    fetchCloudStatus(true);
  }, []);

  useEffect(() => {
    const intervalMs = isActiveWorkflowRun ? 5000 : 30000;
    pollTimerRef.current = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      fetchCloudStatus(false);
    }, intervalMs);

    const handleVis = () => {
      if (typeof document !== "undefined" && !document.hidden) {
        fetchCloudStatus(false);
      }
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVis);
    }

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVis);
      }
    };
  }, [isActiveWorkflowRun]);

  // Auto-scroll console log ke baris paling bawah saat ada baris baru
  useEffect(() => {
    if (autoScrollLog && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [cloudStatus.consoleLines.length, autoScrollLog]);

  // Reset counter retry otomatis bila run sukses penuh
  useEffect(() => {
    if (cloudStatus.activeRun?.status === "completed" && cloudStatus.activeRun.conclusion === "success") {
      setAutoRetryCount(0);
      setAutoRetryCountdown(null);
    }
  }, [cloudStatus.activeRun?.id, cloudStatus.activeRun?.status, cloudStatus.activeRun?.conclusion]);

  // Self-Heal & Re-Dispatch ke GitHub Actions
  const handleSelfHealAndRetry = async (targetAction?: TriggerAction, isAuto: boolean = false) => {
    if (isSelfHealing || isGhDispatching) return;
    const actionToRun = targetAction || lastTriggerUsed || cloudStatus.lastAction || "all";
    const nextAttempt = isAuto ? autoRetryCount + 1 : autoRetryCount + 1;
    setIsSelfHealing(true);
    setAutoRetryCountdown(null);
    setGhDispatchResult(null);

    try {
      const diagSummary = cloudStatus.diagnostics.map((d) => `${d.code}: ${d.title}`).join(" | ");
      const res = await fetch("/api/admin/trigger/self-heal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: actionToRun,
          refreshCookie: true,
          reason: diagSummary || "Auto-Retry setelah kegagalan runner",
          attempt: nextAttempt,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        if (isAuto) setAutoRetryCount(nextAttempt);
        setGhDispatchResult({
          success: true,
          message: data.message,
          actionsUrl: data.actionsUrl,
        });
        schedulePostDispatchPolls(actionToRun, cloudStatus.activeRun?.id ?? null);
      } else {
        setGhDispatchResult({
          success: false,
          message: data.error || data.message || "Gagal menjalankan Self-Heal & Retry.",
        });
      }
    } catch (err: any) {
      setGhDispatchResult({
        success: false,
        message: err.message || "Gagal menghubungi endpoint Self-Heal.",
      });
    } finally {
      setIsSelfHealing(false);
    }
  };

  // Auto-Retry countdown bila workflow gagal dan bukan error toko fisik tutup
  useEffect(() => {
    const run = cloudStatus.activeRun;
    const storeOfflineOnly =
      cloudStatus.diagnostics.length > 0 &&
      cloudStatus.diagnostics.every((d) => d.code === "STORE_OFFLINE" || d.retryable === false);

    if (
      !autoRetryEnabled ||
      !run ||
      run.status !== "completed" ||
      run.conclusion !== "failure" ||
      isGhDispatching ||
      isSelfHealing ||
      storeOfflineOnly ||
      autoRetryCount >= MAX_FRONTEND_AUTO_RETRIES ||
      retriedRunIdsRef.current.has(run.id)
    ) {
      return;
    }

    setAutoRetryCountdown(8);
    const interval = setInterval(() => {
      setAutoRetryCountdown((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          clearInterval(interval);
          if (!retriedRunIdsRef.current.has(run.id)) {
            retriedRunIdsRef.current.add(run.id);
            const resolvedAction = lastTriggerUsed || cloudStatus.lastAction || "all";
            handleSelfHealAndRetry(resolvedAction, true);
          }
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    autoRetryEnabled,
    cloudStatus.activeRun?.id,
    cloudStatus.activeRun?.status,
    cloudStatus.activeRun?.conclusion,
    isGhDispatching,
    isSelfHealing,
    autoRetryCount,
  ]);

  // DISPATCH ENGINE: Memicu GitHub Actions Python Cloud Runner (0% Eksekusi Vercel)
  const handleGitHubDispatch = async (action: TriggerAction) => {
    setIsGhDispatching(true);
    setActiveAction(action);
    setLastTriggerUsed(action);
    setAutoRetryCount(0);
    setAutoRetryCountdown(null);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("guardian_last_action", action);
      } catch {}
    }
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
        schedulePostDispatchPolls(action, cloudStatus.activeRun?.id ?? null);
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
  const isRunning =
    activeRun?.status === "in_progress" ||
    activeRun?.status === "queued" ||
    isGhDispatching ||
    Boolean(optimisticQueued);
  const isSuccess = !optimisticQueued && activeRun?.status === "completed" && activeRun?.conclusion === "success";
  const isFailed =
    !optimisticQueued &&
    (activeRun?.hasError || (activeRun?.status === "completed" && activeRun?.conclusion === "failure"));

  return (
    <div className="min-h-screen bg-slate-50 p-4 pb-24 max-w-3xl mx-auto flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center gap-3 justify-between">
        <div className="flex items-center gap-3">
          <Link href="/super-admin" className="p-2 rounded-full hover:bg-slate-200 transition-colors">
            <ArrowLeft className="w-5 h-5 text-slate-700" />
          </Link>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-bold text-xl text-slate-800">Pusat Trigger 4 Kategori (GitHub Python)</h1>
              <span className="px-2 py-0.5 text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-full">
                Engine &amp; UI v{APP_VERSION}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              100% Dijalankan oleh Mesin Python di GitHub Actions • Satu Sistem &amp; Versi Seragam dengan Portal Kasir
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
      {/* 4 KATEGORI UTAMA MESIN PYTHON TURBO MATRIX (100% TURSO)      */}
      {/* ============================================================ */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-indigo-50 via-purple-50 to-cyan-50 flex items-center justify-between gap-2">
          <div>
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-indigo-600" />
              Pusat Kendali 4 Kategori Mesin Python (100% Turso Cloud)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Mesin Turbo Matrix 60× lebih cepat di GitHub Actions Ubuntu — terisolasi penuh per toko (SUKO &amp; Mu+Ku)
            </p>
          </div>
          <span className="px-2.5 py-1 text-[10px] font-extrabold bg-indigo-100 text-indigo-800 rounded-full border border-indigo-200 shrink-0">
            TURBO MATRIX • 327RB+ SKU
          </span>
        </div>

        <div className="p-4 flex flex-col gap-3.5">
          {/* ------------------------------------------------------------ */}
          {/* TOMBOL UTAMA 1-KLIK: ALL TRIGGER (SUKO + MU+KU KOMPLIT)       */}
          {/* ------------------------------------------------------------ */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-xl shadow-md border border-emerald-500/40">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 rounded-full flex items-center gap-1">
                  <Zap className="w-2.5 h-2.5 text-emerald-300" /> REKOMENDASI 1 KLIK • ALL TRIGGER v{APP_VERSION}
                </span>
                <p className="font-bold text-sm text-white">
                  Jalankan Semua Sekaligus (SUKO + Mu+Ku Komplit)
                </p>
              </div>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                <strong>1 klik langsung beres semua:</strong> Scrab Produk &amp; Barcode + Harga Normal &amp; Promo (Akun SUKO + Mu+Ku) → Foto 7-Jalur → Update Stock Live (SUKO + Mu+Ku) → Promo Email → Catalog &amp; Snapshot Offline.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => handleGitHubDispatch("all")}
                disabled={isGhDispatching || isRunning}
                className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-emerald-400 to-green-500 hover:from-emerald-300 hover:to-green-400 text-slate-950 text-xs font-black rounded-xl transition-all disabled:opacity-50 shadow-md shadow-emerald-500/25 cursor-pointer"
              >
                {isGhDispatching && activeAction === "all" ? (
                  <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                ) : (
                  <Play className="w-4 h-4 fill-current" />
                )}
                {isGhDispatching && activeAction === "all" ? "Menyalakan..." : "Jalankan Semua (SUKO + Mu+Ku)"}
              </button>
            </div>
          </div>

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
                    🔥 Mesin Brutal Scrab (by luqman org &amp; Gambar Produk luqman org)
                  </p>
                </div>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Menjalankan mesin Python Multi-Worker untuk <strong>2 Akun sekaligus (SUKO + Mu+Ku)</strong> (<code className="text-[11px] bg-white px-1 py-0.5 rounded border border-indigo-100">morning_full_sweep.py --brutal</code>) untuk menyerap produk baru, Barcode UPC EAN-13, Artikel, Harga &amp; Stok, serta mesin <strong>7-Jalur Foto Studio Produk Asli</strong> (<code className="text-[11px] bg-white px-1 py-0.5 rounded border border-purple-100">brutal_image_scraper.py</code> — bebas logo/banner). <em>(ZES menyusul setelah akses akun tersedia.)</em>
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
                {isGhDispatching && activeAction === "scrab" ? "Menyalakan..." : "Scrab Komplit (SUKO + Mu+Ku + Foto)"}
              </button>
            </div>

            {/* Sub-tombol untuk menjalankan salah satu mesin Scrab secara terpisah jika diinginkan */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-indigo-100/80">
              <button
                onClick={() => handleGitHubDispatch("mds-bisa")}
                disabled={isGhDispatching || isRunning}
                className="flex items-center justify-center gap-1.5 px-3 py-2 bg-white hover:bg-indigo-50 text-indigo-800 border border-indigo-200 text-xs font-bold rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
              >
                {isGhDispatching && activeAction === "mds-bisa" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Database className="w-3.5 h-3.5 text-indigo-600" />
                )}
                🏪 Scrab Data SUKO Saja
              </button>

              <button
                onClick={() => handleGitHubDispatch("muku-scrab")}
                disabled={isGhDispatching || isRunning}
                className="flex items-center justify-center gap-1.5 px-3 py-2 bg-[#A54F2C]/10 hover:bg-[#A54F2C]/20 text-[#8E3F20] border border-[#A54F2C]/35 text-xs font-extrabold rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
              >
                {isGhDispatching && activeAction === "muku-scrab" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Flame className="w-3.5 h-3.5 text-[#A54F2C]" />
                )}
                🏷️ Scrab Produk Mu+Ku + Foto
              </button>

              <button
                onClick={() => handleGitHubDispatch("photos")}
                disabled={isGhDispatching || isRunning}
                className="flex items-center justify-center gap-1.5 px-3 py-2 bg-white hover:bg-purple-50 text-purple-800 border border-purple-200 text-xs font-bold rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
              >
                {isGhDispatching && activeAction === "photos" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Image className="w-3.5 h-3.5 text-purple-600" />
                )}
                📸 Scrab Foto Produk Saja
              </button>
            </div>
          </div>

          {/* ------------------------------------------------------------ */}
          {/* KATEGORI 2: TURBO MATRIX STOCK (SUKO + MU+KU / PER TOKO)     */}
          {/* ------------------------------------------------------------ */}
          <div className="flex flex-col gap-3 p-4 bg-gradient-to-br from-cyan-50/90 to-white rounded-xl border border-cyan-200 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2 py-0.5 text-[10px] font-black bg-cyan-600 text-white rounded-md uppercase tracking-wider">
                    KATEGORI 2 • TURBO MATRIX STOCK
                  </span>
                  <p className="font-bold text-cyan-950 text-sm flex items-center gap-1.5">
                    ⚡ Update Stock Live Terkini (Mesin Turbo Matrix 1 Request = 1 Artikel Penuh)
                  </p>
                </div>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Memperbarui stok fisik seluruh warna &amp; size secara kilat (<strong>60× lebih cepat</strong> &amp; delta-only hemat Turso writes) memakai akun masing-masing toko secara terisolasi (SUKO ↔ Mu+Ku anti-timpa + Promo Live Mu+Ku).
                </p>
              </div>
              <button
                onClick={() => handleGitHubDispatch("stock-only")}
                disabled={isGhDispatching || isRunning}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-extrabold rounded-xl transition-colors disabled:opacity-50 shrink-0 shadow-sm cursor-pointer"
              >
                {isGhDispatching && activeAction === "stock-only" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Zap className="w-4 h-4" />
                )}
                {isGhDispatching && activeAction === "stock-only" ? "Menyalakan..." : "Update Stock Semua (SUKO + Mu+Ku)"}
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-cyan-100/80">
              <button
                onClick={() => handleGitHubDispatch("suko-stock")}
                disabled={isGhDispatching || isRunning}
                className="flex items-center justify-center gap-1.5 px-3 py-2 bg-white hover:bg-cyan-50 text-cyan-900 border border-cyan-200 text-xs font-bold rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
              >
                {isGhDispatching && activeAction === "suko-stock" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Zap className="w-3.5 h-3.5 text-cyan-600" />
                )}
                🏪 Update Stock SUKO Saja
              </button>
              <button
                onClick={() => handleGitHubDispatch("muku-stock")}
                disabled={isGhDispatching || isRunning}
                className="flex items-center justify-center gap-1.5 px-3 py-2 bg-[#A54F2C]/10 hover:bg-[#A54F2C]/20 text-[#8E3F20] border border-[#A54F2C]/35 text-xs font-extrabold rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
              >
                {isGhDispatching && activeAction === "muku-stock" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Zap className="w-3.5 h-3.5 text-[#A54F2C]" />
                )}
                🏷️ Update Stock Mu+Ku Saja
              </button>
            </div>
          </div>

          {/* ------------------------------------------------------------ */}
          {/* KATEGORI 3: UPDATE PROMO EMAIL (PYTHON PROMO ENGINE v2.7)    */}
          {/* ------------------------------------------------------------ */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 bg-gradient-to-br from-sky-50/90 to-white rounded-xl border border-sky-200 shadow-2xs">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 text-[10px] font-black bg-sky-600 text-white rounded-md uppercase tracking-wider">
                  KATEGORI 3 • UPDATE PROMO
                </span>
                <p className="font-bold text-sky-950 text-sm flex items-center gap-1.5">
                  🏷️ Update Promo Email (Parser v{APP_VERSION} + Gemini 2.5 + Snapshot CDN)
                </p>
              </div>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Membaca folder promo terbaru (<code className="text-[11px] bg-white px-1 py-0.5 rounded border border-sky-100">run_promo_sync.py</code>), membersihkan promo kedaluwarsa, lalu langsung memperbarui <code className="text-[11px]">CatalogArticle</code> &amp; Snapshot Offline agar notif &amp; harga promo kasir langsung berubah.
              </p>
            </div>
            <button
              onClick={() => handleGitHubDispatch("promo")}
              disabled={isGhDispatching || isRunning}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-extrabold rounded-xl transition-colors disabled:opacity-50 shrink-0 shadow-sm cursor-pointer"
            >
              {isGhDispatching && activeAction === "promo" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Tag className="w-4 h-4" />
              )}
              {isGhDispatching && activeAction === "promo" ? "Menyalakan..." : "Update Promo + Snapshot"}
            </button>
          </div>

          {/* ------------------------------------------------------------ */}
          {/* KATEGORI 4: REBUILD CATALOG BRAIN & SNAPSHOT DB OFFLINE      */}
          {/* ------------------------------------------------------------ */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 bg-gradient-to-br from-violet-50/90 to-white rounded-xl border border-violet-200 shadow-2xs">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 text-[10px] font-black bg-violet-600 text-white rounded-md uppercase tracking-wider">
                  KATEGORI 4 • CATALOG &amp; DB OFFLINE
                </span>
                <p className="font-bold text-violet-950 text-sm flex items-center gap-1.5">
                  🧠 Build Catalog Brain &amp; Compressed Snapshot (.json.gz v{APP_VERSION})
                </p>
              </div>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Menyusun ulang <code className="text-[11px] bg-white px-1 py-0.5 rounded border border-violet-100">CatalogArticle</code> (delta-only, urut <strong>Ada Stok &gt; 0 di Page 1</strong>) + mengompres 327rb+ SKU ke 1 file CDN <code className="text-[11px]">.json.gz</code> (~9 MB). Notif <em>Update Sekarang</em> hanya menyala bila ada produk baru atau promo berubah.
              </p>
            </div>
            <button
              onClick={() => handleGitHubDispatch("catalog")}
              disabled={isGhDispatching || isRunning}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-extrabold rounded-xl transition-colors disabled:opacity-50 shrink-0 shadow-sm cursor-pointer"
            >
              {isGhDispatching && activeAction === "catalog" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Database className="w-4 h-4" />
              )}
              {isGhDispatching && activeAction === "catalog" ? "Menyalakan..." : "Build Catalog & Snapshot"}
            </button>
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
                {optimisticQueued && ghDispatchResult.success && (
                  <p className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-700 mt-1">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Menyiapkan antrean GitHub Actions (otomatis memperbarui status dalam beberapa detik, tidak perlu klik ulang)...
                  </p>
                )}
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
      {/* TABEL PIVOT AUDIT KELENGKAPAN SKU (BARCODE • GAMBAR • HARGA) */}
      {/* ============================================================ */}
      <SkuAuditPivotCard
        isBusy={isGhDispatching || isRunning}
        onTriggerFix={(action) => handleGitHubDispatch(action)}
      />

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
              <span className="font-bold text-slate-700 flex items-center gap-1.5 whitespace-normal break-words">
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

          {/* Banner Produk Baru Ter-Add ke Database (Real DB PK id > baseline) */}
          {(cloudStatus.newProductsSummary || cloudStatus.dbMetrics) && (
            <div className="p-3.5 rounded-xl border border-emerald-200 bg-gradient-to-r from-emerald-50 via-teal-50/70 to-white flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                    <PackagePlus className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-extrabold text-emerald-950 whitespace-normal break-words">
                      Audit Produk Baru Ter-Add di Database
                    </p>
                    <p className="text-[11px] text-emerald-700 whitespace-normal break-words">
                      {cloudStatus.newProductsSummary?.sourceFileName
                        ? `Hasil run terakhir: ${cloudStatus.newProductsSummary.sourceFileName}`
                        : "Penghitungan real penambahan SKU & artikel baru di tabel Product PostgreSQL"}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-xs font-black tabular-nums shadow-xs">
                    +{(cloudStatus.newProductsSummary?.newSkusAdded ?? 0).toLocaleString("id-ID")} SKU Baru
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-teal-100 text-teal-900 border border-teal-200 text-xs font-extrabold tabular-nums">
                    +{(cloudStatus.newProductsSummary?.newArticlesAdded ?? 0).toLocaleString("id-ID")} Artikel Baru
                  </span>
                  {cloudStatus.dbMetrics?.totalProducts ? (
                    <span className="px-2.5 py-1 rounded-lg bg-white text-slate-700 border border-slate-200 text-xs font-bold tabular-nums">
                      Total DB: {cloudStatus.dbMetrics.totalProducts.toLocaleString("id-ID")} SKU
                    </span>
                  ) : null}
                </div>
              </div>

              {cloudStatus.newProductsSummary?.samples && cloudStatus.newProductsSummary.samples.length > 0 && (
                <div className="pt-1.5 border-t border-emerald-200/70">
                  <button
                    type="button"
                    onClick={() => setShowSamples((v) => !v)}
                    className="text-[11px] font-bold text-emerald-800 hover:underline flex items-center gap-1"
                  >
                    {showSamples ? "Sembunyikan" : "Lihat"} {cloudStatus.newProductsSummary.samples.length} sampel produk baru yang masuk DB
                    {showSamples ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                  {showSamples && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-2">
                      {cloudStatus.newProductsSummary.samples.map((sp) => (
                        <div
                          key={sp.sku}
                          className="p-2 rounded-lg bg-white border border-emerald-100 text-[11px] text-slate-700 whitespace-normal break-words"
                        >
                          <div className="flex items-center justify-between gap-1 font-bold text-slate-900">
                            <span className="font-mono">{sp.sku}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                              Stok {sp.stok}
                            </span>
                          </div>
                          <p className="text-[10px] font-semibold text-indigo-700">
                            {sp.article || "-"} • {sp.brand || "RETAIL"} ({sp.color || "-"}/{sp.size || "-"})
                          </p>
                          <p className="text-[10px] text-slate-500 whitespace-normal break-words">{sp.description}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Panel Diagnosa Bug, Self-Healing & Auto-Ulang Sampai Sukses */}
          <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/80 flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Wrench className={`w-4 h-4 ${isFailed ? "text-rose-600" : "text-indigo-600"} shrink-0`} />
                <span className="text-xs font-extrabold text-slate-800 whitespace-normal break-words">
                  Guardian Auto-Diagnostik, Self-Heal &amp; Auto-Ulang Trigger
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-600">
                  Target: {lastTriggerUsed || cloudStatus.lastAction || "all"} • Retry {autoRetryCount}/{MAX_FRONTEND_AUTO_RETRIES}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleAutoRetry}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold border transition-colors ${
                    autoRetryEnabled
                      ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                      : "bg-slate-200 text-slate-600 border-slate-300"
                  }`}
                >
                  Auto-Ulang Saat Error: {autoRetryEnabled ? "ON" : "OFF"}
                </button>
                <button
                  type="button"
                  onClick={() => handleSelfHealAndRetry(lastTriggerUsed || cloudStatus.lastAction, false)}
                  disabled={isSelfHealing || isGhDispatching}
                  className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold flex items-center gap-1 disabled:opacity-50"
                >
                  {isSelfHealing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                  {isSelfHealing ? "Membenahi..." : "Benahi & Ulangi"}
                </button>
              </div>
            </div>

            {autoRetryCountdown !== null && (
              <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-300 text-xs text-amber-950 flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold whitespace-normal break-words">
                  ⏳ Error terdeteksi pada trigger [{lastTriggerUsed || cloudStatus.lastAction}] — menjalankan Self-Heal &amp; mengulang otomatis dalam{" "}
                  <strong>{autoRetryCountdown} detik</strong>...
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (cloudStatus.activeRun?.id) retriedRunIdsRef.current.add(cloudStatus.activeRun.id);
                    setAutoRetryCountdown(null);
                  }}
                  className="px-2.5 py-1 rounded bg-white border border-amber-300 text-amber-900 text-[11px] font-bold hover:bg-amber-100"
                >
                  Batalkan
                </button>
              </div>
            )}

            {cloudStatus.healsApplied.length > 0 && (
              <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 space-y-1">
                <p className="font-extrabold text-[11px] uppercase tracking-wider text-emerald-800">
                  🔧 Self-Healing Otomatis Diterapkan oleh Python Guardian ({cloudStatus.healsApplied.length}x):
                </p>
                {cloudStatus.healsApplied.slice(-4).map((h, idx) => (
                  <p key={idx} className="text-[11px] font-mono whitespace-normal break-words">
                    • [{h.diagnosisCode}] {h.message}
                  </p>
                ))}
              </div>
            )}

            {(isFailed || cloudStatus.diagnostics.length > 0) && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex flex-col gap-2 text-xs text-rose-900">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="font-extrabold whitespace-normal break-words">
                      Deteksi Bug / Error Eksekusi ({cloudStatus.diagnostics.length > 0 ? cloudStatus.diagnostics[cloudStatus.diagnostics.length - 1].code : "FAILURE"}):
                    </p>
                    {cloudStatus.diagnostics.length === 0 ? (
                      <p className="font-mono text-[11px] text-rose-700 mt-0.5 whitespace-normal break-words">
                        {activeRun?.errorStep || "Kegagalan pada salah satu step runner cloud."}
                      </p>
                    ) : (
                      <div className="space-y-1.5 mt-1">
                        {cloudStatus.diagnostics.slice(-3).map((d, idx) => (
                          <div key={idx} className="p-2 rounded-lg bg-white/80 border border-rose-200">
                            <p className="font-bold text-rose-950 whitespace-normal break-words">
                              [{d.code}] {d.title} {d.step ? `— (${d.step})` : ""}
                            </p>
                            <p className="text-[11px] text-rose-800 whitespace-normal break-words mt-0.5">{d.detail}</p>
                            {d.traceback?.snippet && (
                              <pre className="mt-1 p-1.5 rounded bg-slate-950 text-rose-300 text-[10px] font-mono whitespace-pre-wrap break-words">
                                {d.traceback.snippet}
                              </pre>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

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
                        <span className="whitespace-normal break-words">{step.name}</span>
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

          {/* Terminal Console Output Real Line-by-Line */}
          <div className="rounded-xl overflow-hidden border border-slate-800 bg-slate-950 shadow-inner">
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-slate-900 border-b border-slate-800 text-[11px] text-slate-300">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="flex items-center gap-1.5 font-mono font-bold">
                  <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                  Console Log Output Asli
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                    cloudStatus.consoleSource === "live-guardian"
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                      : cloudStatus.consoleSource === "github-raw"
                      ? "bg-sky-500/20 text-sky-300 border border-sky-500/30"
                      : "bg-slate-800 text-slate-400"
                  }`}
                >
                  {cloudStatus.consoleSource === "live-guardian"
                    ? `LIVE STREAM (${cloudStatus.consoleLines.length} baris)`
                    : cloudStatus.consoleSource === "github-raw"
                    ? `GITHUB RAW LOG (${cloudStatus.consoleLines.length} baris)`
                    : "SUMMARY"}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setAutoScrollLog((v) => !v)}
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                    autoScrollLog
                      ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/40"
                      : "bg-slate-800 text-slate-400 border-slate-700"
                  }`}
                >
                  Auto-Scroll: {autoScrollLog ? "ON" : "OFF"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const txt = cloudStatus.consoleLines
                      .map((l) => `[${l.ts}] [${l.step}] ${l.text}`)
                      .join("\n");
                    if (txt && typeof navigator !== "undefined" && navigator.clipboard) {
                      navigator.clipboard.writeText(txt).catch(() => {});
                      setCopiedLog(true);
                      setTimeout(() => setCopiedLog(false), 2000);
                    }
                  }}
                  className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-200 border border-slate-700"
                >
                  <Copy className="w-3 h-3" />
                  {copiedLog ? "Tersalin!" : "Salin Log"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowFullTerminal(!showFullTerminal)}
                  className="flex items-center gap-1 text-[10px] text-slate-300 hover:text-white transition-colors"
                >
                  {showFullTerminal ? "Ringkas" : "Perluas"}
                  {showFullTerminal ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              </div>
            </div>

            {/* Filter Tabs & Search Barisi Log */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 bg-slate-900/60 border-b border-slate-800/80">
              <div className="flex items-center gap-1 flex-wrap">
                {(
                  [
                    { key: "all", label: "Semua" },
                    { key: "error", label: "Error / Bug" },
                    { key: "heal", label: "Self-Heal" },
                    { key: "db", label: "DB / Produk Baru" },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setLogFilter(tab.key)}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
                      logFilter === tab.key
                        ? "bg-emerald-500 text-slate-950"
                        : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-700 rounded px-2 py-0.5">
                <Search className="w-3 h-3 text-slate-400" />
                <input
                  type="text"
                  value={logSearch}
                  onChange={(e) => setLogSearch(e.target.value)}
                  placeholder="Cari baris log..."
                  className="bg-transparent text-[11px] text-slate-200 placeholder-slate-500 outline-none w-36 sm:w-44"
                />
              </div>
            </div>

            <div
              ref={logContainerRef}
              className={`p-3 font-mono text-[11px] text-slate-200 overflow-y-auto space-y-1 ${
                showFullTerminal ? "max-h-[420px]" : "max-h-60"
              }`}
            >
              {(() => {
                const q = logSearch.trim().toLowerCase();
                const filteredLines = cloudStatus.consoleLines.filter((l) => {
                  if (logFilter === "error" && l.level !== "error" && l.level !== "warn") return false;
                  if (logFilter === "heal" && l.level !== "heal") return false;
                  if (logFilter === "db" && l.level !== "db") return false;
                  if (q && !l.text.toLowerCase().includes(q) && !l.step.toLowerCase().includes(q)) return false;
                  return true;
                });

                if (filteredLines.length === 0) {
                  return (
                    <div className="space-y-1 text-slate-400">
                      <div className="text-emerald-400">
                        [SYSTEM] Guardian Console siap — jalankan salah satu trigger untuk melihat stream log Python baris per baris secara realtime.
                      </div>
                      {activeRun && (
                        <div>
                          [{new Date(activeRun.createdAt).toLocaleTimeString("id-ID")}] Run #{activeRun.runNumber} • {activeRun.percent}% ({activeRun.currentStep})
                        </div>
                      )}
                    </div>
                  );
                }

                return filteredLines.map((ln, idx) => {
                  const colorCls =
                    ln.level === "error"
                      ? "text-rose-400 font-semibold"
                      : ln.level === "warn"
                      ? "text-amber-300"
                      : ln.level === "heal"
                      ? "text-emerald-300 font-semibold"
                      : ln.level === "db"
                      ? "text-cyan-300"
                      : ln.level === "success"
                      ? "text-emerald-400 font-bold"
                      : "text-slate-200";
                  return (
                    <div key={idx} className={`${colorCls} whitespace-pre-wrap break-words leading-relaxed`}>
                      <span className="text-slate-500">[{ln.ts}]</span>{" "}
                      <span className="text-indigo-300/90">[{ln.step}]</span> {ln.text}
                    </div>
                  );
                });
              })()}
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
                Rekapitulasi data riil yang tersimpan di Turso Cloud dari ketiga kategori mesin
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
              <p className="text-xs font-bold text-slate-800">
                {cloudStatus.dbMetrics?.totalProducts
                  ? `${cloudStatus.dbMetrics.totalProducts.toLocaleString("id-ID")} SKU • Studio Foto`
                  : "310.526+ SKU • Studio Foto"}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5 whitespace-normal break-words">
                {cloudStatus.newProductsSummary && (cloudStatus.newProductsSummary.newSkusAdded > 0 || cloudStatus.newProductsSummary.newArticlesAdded > 0)
                  ? `Terbaru: +${cloudStatus.newProductsSummary.newSkusAdded.toLocaleString("id-ID")} SKU / +${cloudStatus.newProductsSummary.newArticlesAdded.toLocaleString("id-ID")} Artikel`
                  : "by luqman org + Studio luqman org"}
              </p>
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
              <p className="text-[11px] text-slate-500 mt-0.5 whitespace-normal break-words">
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
                  <th className="px-3.5 py-2.5 text-right">Produk Baru (+Add)</th>
                  <th className="px-3.5 py-2.5 text-right">Data Diperbarui</th>
                  <th className="px-3.5 py-2.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cloudStatus.syncHistory.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-4 text-slate-400 text-xs">
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
                              : item.type.includes("MDS") || item.type.includes("LUQMAN") || item.type.includes("SCRAB") || item.type.includes("PHOTO")
                              ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                              : "bg-sky-50 text-sky-700 border border-sky-200"
                          }`}
                        >
                          {item.type.replace(/MDS_BISA/gi, "LUQMAN_ORG").replace(/MDS_SALES/gi, "LUQMAN_ORG_SALES")}
                        </span>
                      </td>
                      <td className="px-3.5 py-2.5 text-slate-600 whitespace-normal break-words max-w-md">
                        {item.fileName
                          ?.replace(/MDS\s*[-]?\s*BISA/gi, "luqman org")
                          .replace(/StoreHub/gi, "luqman org")
                          .replace(/(?:https?:\/\/)?(?:www\.)?matahari\.com/gi, "luqman org")
                          .replace(/\bMatahari\b/gi, "luqman org")}
                      </td>
                      <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
                        {(item.newSkusAdded ?? 0) > 0 || (item.newArticlesAdded ?? 0) > 0 ? (
                          <div className="inline-flex flex-col items-end gap-0.5">
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 font-mono font-black text-[10px]">
                              +{(item.newSkusAdded ?? 0).toLocaleString("id-ID")} SKU Baru
                            </span>
                            {(item.newArticlesAdded ?? 0) > 0 && (
                              <span className="text-[10px] font-bold text-teal-700">
                                +{(item.newArticlesAdded ?? 0).toLocaleString("id-ID")} Artikel
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-300 font-mono text-[11px]">—</span>
                        )}
                      </td>
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
