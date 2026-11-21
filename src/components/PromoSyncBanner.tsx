"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { CheckCircle2, Loader2, RefreshCw, Sparkles, AlertTriangle, X } from "lucide-react";

interface PromoSyncStatus {
  success: boolean;
  status: "running" | "completed" | "failed" | "idle";
  syncKey: string;
  promoName: string;
  stageLabel: string;
  latestLogLine: string;
  percent: number;
  stepIndex: number;
  totalSteps: number;
  recordsUpdated: number;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string | null;
  elapsedSeconds: number;
}

const DISMISS_STORAGE_KEY = "suko_dismissed_promo_sync_key";
const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json());

function formatWibDateTime(iso?: string | null): string {
  if (!iso) return "";
  try {
    const dt = new Date(iso);
    if (isNaN(dt.getTime())) return "";
    return dt.toLocaleString("id-ID", {
      timeZone: "Asia/Jakarta",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }) + " WIB";
  } catch {
    return "";
  }
}

function formatElapsed(sec: number): string {
  if (!sec || sec < 1) return "baru mulai";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}d` : `${s}d`;
}

export default function PromoSyncBanner() {
  const [dismissedKey, setDismissedKey] = useState<string>("");
  const [justFinished, setJustFinished] = useState(false);
  const wasRunningRef = useRef(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(DISMISS_STORAGE_KEY) || "";
      setDismissedKey(saved);
    } catch {}
  }, []);

  const { data } = useSWR<PromoSyncStatus>("/api/promo-sync-status", fetcher, {
    refreshInterval: (latestData) => (latestData?.status === "running" ? 5000 : 18000),
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    dedupingInterval: 2500,
  });

  // Deteksi otomatis transisi running -> completed supaya banner 100% langsung muncul meski sebelumnya pernah ditutup
  useEffect(() => {
    if (!data) return;
    if (data.status === "running") {
      wasRunningRef.current = true;
      setJustFinished(false);
    } else if (data.status === "completed" && wasRunningRef.current) {
      wasRunningRef.current = false;
      setJustFinished(true);
      setDismissedKey("");
      try {
        localStorage.removeItem(DISMISS_STORAGE_KEY);
      } catch {}
    }
  }, [data?.status, data?.syncKey]);

  if (!data || !data.success || data.status === "idle") return null;

  // Banner `running` SELALU tampil agar user tahu sistem sedang memperbarui promo
  const isDismissed = data.status !== "running" && dismissedKey === data.syncKey && !justFinished;
  if (isDismissed) return null;

  const handleDismiss = () => {
    setJustFinished(false);
    setDismissedKey(data.syncKey);
    try {
      localStorage.setItem(DISMISS_STORAGE_KEY, data.syncKey);
    } catch {}
  };

  const handleRefreshNow = () => {
    handleDismiss();
    window.location.reload();
  };

  if (data.status === "running") {
    const pct = Math.min(99, Math.max(5, Number(data.percent || 10)));
    const steps = [
      { idx: 1, label: "1. Parse Excel Promo" },
      { idx: 2, label: "2. Susun Katalog & Snapshot" },
      { idx: 3, label: "3. Finalisasi Turso" },
    ];
    return (
      <div className="w-full bg-gradient-to-r from-indigo-600 via-blue-600 to-sky-600 text-white border-b border-blue-500/40 shadow-sm">
        <div className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 py-2.5 flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-start sm:items-center gap-2.5 min-w-0">
              <div className="mt-0.5 sm:mt-0 w-7 h-7 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
                <Loader2 className="w-4 h-4 animate-spin text-white" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-white/20 text-white">
                    <Sparkles className="w-3 h-3" /> Update Promo Berjalan
                  </span>
                  <span className="text-xs sm:text-sm font-bold leading-snug break-words">
                    {data.promoName}
                  </span>
                </div>
                <p className="text-[11px] sm:text-xs text-blue-100 leading-snug mt-0.5 break-words">
                  {data.stageLabel}
                  {data.elapsedSeconds > 0 ? ` • ${formatElapsed(data.elapsedSeconds)}` : ""}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="text-sm sm:text-base font-extrabold tabular-nums bg-white/15 px-2.5 py-0.5 rounded-lg">
                {pct}%
              </span>
            </div>
          </div>

          {/* Progress Bar Real-time */}
          <div className="w-full h-2 rounded-full bg-white/20 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-300 via-emerald-300 to-white transition-all duration-700 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] sm:text-[11px]">
            <div className="flex flex-wrap items-center gap-1.5">
              {steps.map((st) => {
                const active = data.stepIndex === st.idx;
                const done = data.stepIndex > st.idx;
                return (
                  <span
                    key={st.idx}
                    className={`px-2 py-0.5 rounded-md font-semibold transition-colors ${
                      done
                        ? "bg-emerald-400/25 text-emerald-100"
                        : active
                          ? "bg-white text-blue-700 shadow-xs"
                          : "bg-white/10 text-blue-100/80"
                    }`}
                  >
                    {done ? "✓ " : ""}
                    {st.label}
                  </span>
                );
              })}
            </div>
            {data.latestLogLine && (
              <span className="text-blue-100/90 break-words leading-snug">
                {data.latestLogLine}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (data.status === "failed") {
    return (
      <div className="w-full bg-amber-50 border-b border-amber-200 text-amber-900">
        <div className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 py-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-start sm:items-center gap-2 min-w-0">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5 sm:mt-0" />
            <p className="text-xs sm:text-sm font-medium leading-snug break-words">
              <span className="font-bold">Catatan Update Promo ({data.promoName}):</span>{" "}
              {data.stageLabel}
            </p>
          </div>
          <button
            onClick={handleDismiss}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-amber-800 hover:bg-amber-100 transition-colors"
          >
            <X className="w-3.5 h-3.5" /> Tutup
          </button>
        </div>
      </div>
    );
  }

  // status === "completed" (baik promo yang baru saja selesai 100% maupun promo terbaru yang sudah masuk saat user login)
  const completedLabel = formatWibDateTime(data.completedAt);
  return (
    <div className="w-full bg-emerald-50 border-b border-emerald-200/90 text-emerald-950">
      <div className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 py-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-start sm:items-center gap-2.5 min-w-0">
          <div className="mt-0.5 sm:mt-0 w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-emerald-600 text-white">
                {justFinished ? "Promo Baru Selesai 100%" : "Promo Terbaru Aktif"}
              </span>
              <span className="text-xs sm:text-sm font-bold text-emerald-950 leading-snug break-words">
                {data.promoName}
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-emerald-800 leading-snug mt-0.5 break-words">
              {data.recordsUpdated > 0
                ? `${data.recordsUpdated.toLocaleString("id-ID")} SKU promo diperbarui di Turso Cloud`
                : "Seluruh harga promo terbaru sudah aktif di Turso Cloud"}
              {completedLabel ? ` • Masuk ${completedLabel}` : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handleRefreshNow}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs active:scale-95 transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Muat Harga Terbaru
          </button>
          <button
            onClick={handleDismiss}
            aria-label="Tutup notifikasi promo"
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-emerald-800 hover:bg-emerald-100 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
