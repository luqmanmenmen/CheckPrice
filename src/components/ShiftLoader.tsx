import React from 'react';
import { Clock } from 'lucide-react';
import type { SyncProgressDetails } from '@/lib/offlineDb';

export function formatEtaText(etaSeconds?: number | null, percent?: number): string {
  if (typeof percent === 'number' && percent >= 100) {
    return 'Selesai • Menyegarkan data...';
  }
  if (typeof etaSeconds !== 'number' || !isFinite(etaSeconds) || etaSeconds <= 0) {
    return 'Menghitung estimasi waktu...';
  }
  if (etaSeconds >= 60) {
    const mins = Math.floor(etaSeconds / 60);
    const secs = etaSeconds % 60;
    return secs > 0
      ? `Estimasi sisa ~${mins} menit ${secs} detik`
      : `Estimasi sisa ~${mins} menit`;
  }
  return `Estimasi sisa ~${etaSeconds} detik`;
}

export function SyncProgressModal({
  progress,
  details,
}: {
  progress?: number;
  details?: SyncProgressDetails | null;
}) {
  const pct = Math.min(100, Math.max(0, Math.round(details?.percent ?? progress ?? 0)));
  const downloaded = details?.downloadedSkus ?? 0;
  const total = details?.totalSkus ?? 0;
  const etaLabel = formatEtaText(details?.etaSeconds, pct);
  const subtitle =
    details?.statusText ||
    (downloaded > 0 && total > 0
      ? `Mengunduh ${downloaded.toLocaleString('id-ID')} / ${total.toLocaleString('id-ID')} SKU...`
      : 'Mengunduh data harga, promo & foto terbaru...');

  return (
    <div className="fixed inset-0 z-[99999] bg-slate-950/75 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-in fade-in duration-300 select-none">
      <div className="bg-white/95 backdrop-blur-xl border border-white/50 rounded-3xl p-7 sm:p-9 shadow-2xl flex flex-col items-center max-w-xs w-full text-center">
        <ShiftLoader progress={pct} />

        <div className="mt-7 w-full flex flex-col items-center gap-2">
          <div className="flex items-center justify-between w-full">
            <h3 className="text-sm sm:text-base font-black text-slate-800 tracking-wide">
              MENYINKRONKAN DATA
            </h3>
            <span className="text-sm font-black tabular-nums text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-lg">
              {pct}%
            </span>
          </div>

          {/* Horizontal Real Progress Bar */}
          <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200/70">
            <div
              className="h-full bg-gradient-to-r from-red-500 via-rose-500 to-indigo-600 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>

          <p className="text-[11px] text-slate-600 font-semibold leading-snug mt-0.5">
            {subtitle}
          </p>

          <div className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-500 bg-slate-50 border border-slate-200/80 px-2.5 py-1 rounded-full tabular-nums mt-0.5">
            <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>{etaLabel}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ShiftLoader({ progress }: { progress?: number }) {
  const isProgressMode = typeof progress === 'number' && !isNaN(progress);
  const clamped = isProgressMode ? Math.min(100, Math.max(0, progress!)) : 0;
  // stroke-dasharray is 400. 0% means 400 offset, 100% means 0 offset.
  const dashOffset = isProgressMode ? 400 - (400 * clamped) / 100 : 400;

  return (
    <div className="relative flex items-center justify-center">
      <style>{`
        .animate-border-trace {
          stroke-dasharray: 400;
          stroke-dashoffset: 400;
          animation: border-trace 1.5s linear infinite;
        }
        .progress-border-trace {
          stroke-dasharray: 400;
          transition: stroke-dashoffset 0.3s ease-out;
        }
        @keyframes border-trace {
          0% {
            stroke-dashoffset: 400;
          }
          100% {
            stroke-dashoffset: 0;
          }
        }
      `}</style>

      {/* 3D Shadow under the logo */}
      <div className="absolute -bottom-6 w-24 h-4 bg-black/15 blur-md rounded-[100%]"></div>
      
      {/* Container Kotak untuk Logo */}
      <div className="relative w-32 h-32 md:w-40 md:h-40 bg-white flex items-center justify-center z-10 p-6 shadow-sm">
        <img src="/suko-logo.png" alt="SUKO" className="w-full h-full object-contain" />
        
        {/* SVG Border Trace Tipis Merah */}
        <svg 
          className="absolute inset-0 w-full h-full pointer-events-none" 
          viewBox="0 0 100 100" 
          preserveAspectRatio="none"
        >
          {/* Garis background */}
          <rect x="0" y="0" width="100" height="100" fill="none" stroke="#f1f5f9" strokeWidth="2" />
          
          {/* Garis Merah Progress / Indeterminate */}
          <rect
            x="0"
            y="0"
            width="100"
            height="100"
            fill="none"
            stroke="#ef4444" 
            strokeWidth="4"
            className={isProgressMode ? "progress-border-trace" : "animate-border-trace"}
            style={isProgressMode ? { strokeDashoffset: dashOffset } : {}}
          />
        </svg>
      </div>
    </div>
  );
}
