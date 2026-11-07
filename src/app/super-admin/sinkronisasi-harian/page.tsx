"use client";

import { useState, useEffect } from "react";
import { ArrowLeft, RefreshCw, Image, Tag, Play, CheckCircle2, AlertCircle, Loader2, ExternalLink, Zap } from "lucide-react";
import Link from "next/link";

export default function UpdateProdukPage() {
  const [isGhDispatching, setIsGhDispatching] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [ghDispatchResult, setGhDispatchResult] = useState<{ success: boolean; message: string; actionsUrl?: string; help?: string } | null>(null);
  const [currentUserNik, setCurrentUserNik] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me").then(res => res.json()).then(data => {
      if (data.user) setCurrentUserNik(data.user.nik);
    }).catch(() => {});
  }, []);

  // ============================================================
  // DISPATCH ENGINE: Memicu GitHub Actions Cloud Runner
  // Mengalihkan beban berat (MDS BISA, Foto, Promo) ke Cloud (Bebas Limit 10s Vercel)
  // ============================================================
  const handleGitHubDispatch = async (action: 'all' | 'mds-bisa' | 'photos' | 'promo') => {
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
      } else {
        setGhDispatchResult({ success: false, message: data.error || "Gagal memicu GitHub Actions.", help: data.help });
      }
    } catch (err: any) {
      setGhDispatchResult({ success: false, message: err.message || "Kesalahan jaringan." });
    } finally {
      setIsGhDispatching(false);
      setActiveAction(null);
    }
  };

  if (currentUserNik && currentUserNik !== "22054178") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-rose-200 text-center max-w-sm">
          <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-800 mb-2">Akses Ditolak</h2>
          <p className="text-sm text-slate-600 mb-6">Hanya Developer (NIK 22054178) yang diizinkan mengakses halaman sinkronisasi ini.</p>
          <Link href="/super-admin" className="px-6 py-2 bg-slate-800 text-white rounded-lg text-sm font-bold hover:bg-slate-900 transition-colors">
            Kembali ke Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 pb-24 max-w-2xl mx-auto flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2 justify-between">
        <div className="flex items-center gap-3">
          <Link href="/super-admin" className="p-2 rounded-full hover:bg-slate-200 transition-colors">
            <ArrowLeft className="w-5 h-5 text-slate-700" />
          </Link>
          <div>
            <h1 className="font-bold text-xl text-slate-800">Sinkronisasi Ritel</h1>
            <p className="text-xs text-slate-500">Pusat Kendali Otomatis Cloud: MDS BISA, Foto Shopify, & Promo Email</p>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 4 TRIGGER UTAMA (MASING-MASING MANDIRI & BEBAS LIMIT VERCEL) */}
      {/* ============================================================ */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-purple-50">
          <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-indigo-600" />
            Pilihan Sinkronisasi Cloud (GitHub Actions Engine)
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">Pilih sinkronisasi spesifik yang kamu inginkan atau jalankan semua sekaligus</p>
        </div>

        <div className="p-4 flex flex-col gap-3">
          
          {/* Trigger 1: MDS BISA */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3.5 bg-indigo-50 rounded-xl border border-indigo-100 hover:border-indigo-300 transition-colors">
            <div className="flex-1 min-w-0">
              <p className="font-bold text-indigo-900 text-sm flex items-center gap-1.5">
                🏪 Trigger 1 — Sync MDS BISA
              </p>
              <p className="text-xs text-indigo-600 mt-0.5">
                Tarik barcode UPC, style code, stok toko 719, dan harga normal dari portal StoreHub
              </p>
            </div>
            <button
              onClick={() => handleGitHubDispatch('mds-bisa')}
              disabled={isGhDispatching}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-50 shrink-0 shadow-sm"
            >
              {isGhDispatching && activeAction === 'mds-bisa' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {isGhDispatching && activeAction === 'mds-bisa' ? "Menyalakan..." : "Sync MDS Saja"}
            </button>
          </div>

          {/* Trigger 2: Foto Produk */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3.5 bg-purple-50 rounded-xl border border-purple-100 hover:border-purple-300 transition-colors">
            <div className="flex-1 min-w-0">
              <p className="font-bold text-purple-900 text-sm flex items-center gap-1.5">
                🖼️ Trigger 2 — Sync Foto Produk
              </p>
              <p className="text-xs text-purple-600 mt-0.5">
                Ambil foto model resmi dan varian dari katalog Shopify CDN Matahari.com
              </p>
            </div>
            <button
              onClick={() => handleGitHubDispatch('photos')}
              disabled={isGhDispatching}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-50 shrink-0 shadow-sm"
            >
              {isGhDispatching && activeAction === 'photos' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Image className="w-4 h-4" />}
              {isGhDispatching && activeAction === 'photos' ? "Menyalakan..." : "Sync Foto Saja"}
            </button>
          </div>

          {/* Trigger 3: Promo Saja (Python Engine) */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3.5 bg-sky-50 rounded-xl border border-sky-100 hover:border-sky-300 transition-colors">
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sky-900 text-sm flex items-center gap-1.5">
                🏷️ Trigger 3 — Sync Promo (Mesin Python)
              </p>
              <p className="text-xs text-sky-600 mt-0.5">
                Bedah file Excel promo email via Python & Gemini AI (stok & barcode tetap terlindungi)
              </p>
            </div>
            <button
              onClick={() => handleGitHubDispatch('promo')}
              disabled={isGhDispatching}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-50 shrink-0 shadow-sm"
            >
              {isGhDispatching && activeAction === 'promo' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Tag className="w-4 h-4" />}
              {isGhDispatching && activeAction === 'promo' ? "Menyalakan..." : "Sync Promo Saja"}
            </button>
          </div>

          {/* Trigger 4: Full Sync (All) */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-xl shadow-md border border-slate-800 mt-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 text-[10px] font-extrabold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full flex items-center gap-1">
                  <Zap className="w-2.5 h-2.5 text-emerald-400" /> PAKET KOMPLIT
                </span>
                <p className="font-bold text-sm text-slate-100">Trigger 4 — Full Sync (Semua Sekaligus)</p>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Jalankan urutan komplit secara otomatis di cloud: MDS BISA ➔ Foto Katalog ➔ Update Promo.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => handleGitHubDispatch('all')}
                disabled={isGhDispatching}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-400 hover:to-green-400 text-slate-950 text-xs font-black rounded-xl transition-all disabled:opacity-50 shadow-md shadow-emerald-500/20"
              >
                {isGhDispatching && activeAction === 'all' ? <Loader2 className="w-4 h-4 animate-spin text-slate-950" /> : <Play className="w-4 h-4 fill-current" />}
                {isGhDispatching && activeAction === 'all' ? "Menyalakan..." : "Jalankan Full Sync (All)"}
              </button>
              <a
                href="https://github.com/luqmanmenmen/CheckPrice/actions"
                target="_blank"
                rel="noreferrer"
                className="p-2.5 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors border border-slate-700"
                title="Buka tab GitHub Actions"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Result Banner Dispatch */}
          {ghDispatchResult && (
            <div className={`flex items-start gap-2.5 p-3.5 rounded-xl text-xs font-medium border mt-2 animate-in fade-in duration-200 ${
              ghDispatchResult.success
                ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                : "bg-amber-50 border-amber-200 text-amber-900"
            }`}>
              {ghDispatchResult.success
                ? <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" />
                : <AlertCircle className="w-5 h-5 shrink-0 text-amber-600" />
              }
              <div className="flex-1">
                <p className="font-bold text-sm">{ghDispatchResult.message}</p>
                {ghDispatchResult.actionsUrl && (
                  <a
                    href={ghDispatchResult.actionsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-emerald-700 hover:underline font-bold mt-1 text-xs"
                  >
                    Pantau proses live terminal di GitHub Actions <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
                {ghDispatchResult.help && (
                  <p className="text-xs opacity-90 mt-1">{ghDispatchResult.help}</p>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
