"use client";

import React, { useEffect, useState } from "react";
import { RefreshCw, CheckCircle2, AlertTriangle, ImageOff, Barcode, Tag, Layers } from "lucide-react";

interface StorePivotRow {
  brandGroup: string;
  totalSkus: number;
  activeSkus: number;
  completeSkus: number;
  completePct: number;
  activeCompleteSkus: number;
  activeCompletePct: number;
  missingBarcode: number;
  activeMissingBarcode: number;
  missingImage: number;
  activeMissingImage: number;
  missingPrice: number;
  activeMissingPrice: number;
  missingBothBcImg: number;
}

interface AuditSampleItem {
  sku: string;
  barcode: string;
  article: string;
  brand: string;
  brandGroup: string;
  description: string;
  color: string;
  size: string;
  stok: number;
  hargaNormal: number;
  hasImage: boolean;
}

interface SkuAuditData {
  ready: boolean;
  generatedAt?: string;
  message?: string;
  totals?: {
    totalSkus: number;
    activeSkus: number;
    completeSkus: number;
    completePct: number;
    activeCompleteSkus: number;
    activeCompletePct: number;
    missingBarcode: number;
    activeMissingBarcode: number;
    missingImage: number;
    activeMissingImage: number;
    missingPrice: number;
    activeMissingPrice: number;
    missingBothBcImg: number;
    barcodeAliasCount: number;
  };
  byStore?: StorePivotRow[];
  samples?: {
    missingImage: AuditSampleItem[];
    missingBarcode: AuditSampleItem[];
    missingPrice: AuditSampleItem[];
  };
}

export default function SkuAuditPivotCard({
  onTriggerFix,
  isBusy,
}: {
  onTriggerFix?: (action: "scrab" | "photos" | "muku-scrab") => void;
  isBusy?: boolean;
}) {
  const [data, setData] = useState<SkuAuditData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"missingImage" | "missingBarcode" | "missingPrice">("missingImage");
  const [storeFilter, setStoreFilter] = useState<"ALL" | "SUKO" | "MUKU" | "ZES">("ALL");
  const [showList, setShowList] = useState(false);

  const loadAudit = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/sku-audit", { cache: "no-store" });
      const json = await res.json();
      if (res.ok && json.success) {
        setData(json);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAudit();
  }, []);

  const fmt = (n?: number) => (typeof n === "number" ? n.toLocaleString("id-ID") : "0");
  const listRaw = data?.samples?.[activeTab] || [];
  const filteredSamples =
    storeFilter === "ALL" ? listRaw : listRaw.filter((item) => item.brandGroup === storeFilter);

  const storeLabel = (bg: string) => (bg === "MUKU" ? "Mu+Ku" : bg);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Layers className="w-4 h-4 text-emerald-400 shrink-0" />
            <h3 className="font-extrabold text-sm">
              📊 Pivot Audit Kelengkapan SKU (SUKO • Mu+Ku • ZES)
            </h3>
          </div>
          <p className="text-[11px] text-slate-300 mt-0.5 whitespace-normal break-words">
            Memantau mana SKU yang sudah komplit vs belum ada Barcode, Gambar, atau Harga — 100% dari cache CDN Turso (1 row read, 0 beban kuota!).
          </p>
        </div>
        <button
          type="button"
          onClick={loadAudit}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition cursor-pointer disabled:opacity-50 shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Muat Ulang</span>
        </button>
      </div>

      <div className="p-4 space-y-4">
        {loading && !data ? (
          <div className="py-8 text-center text-xs text-slate-500">Memuat tabel pivot audit SKU...</div>
        ) : !data?.ready || !data.byStore ? (
          <div className="py-6 text-center text-xs text-slate-500">
            {data?.message || "Data pivot audit belum tersedia. Klik Jalankan Semua agar Python menyusun tabel pivot."}
          </div>
        ) : (
          <>
            {/* Ringkasan Cepat 4 Kartu */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                <div className="text-[10px] font-extrabold text-emerald-700 uppercase flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> SKU Aktif Komplit
                </div>
                <div className="text-lg font-black text-emerald-950 mt-0.5 tabular-nums">
                  {data.totals?.activeCompletePct ?? 0}%
                </div>
                <div className="text-[11px] text-emerald-800 tabular-nums">
                  {fmt(data.totals?.activeCompleteSkus)} / {fmt(data.totals?.activeSkus)} stok &gt; 0
                </div>
              </div>

              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                <div className="text-[10px] font-extrabold text-amber-800 uppercase flex items-center gap-1">
                  <Barcode className="w-3.5 h-3.5" /> Belum Ada Barcode
                </div>
                <div className="text-lg font-black text-amber-950 mt-0.5 tabular-nums">
                  {fmt(data.totals?.missingBarcode)}
                </div>
                <div className="text-[11px] text-amber-800 tabular-nums">
                  Aktif: {fmt(data.totals?.activeMissingBarcode)} • Alias: {fmt(data.totals?.barcodeAliasCount)}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200">
                <div className="text-[10px] font-extrabold text-rose-700 uppercase flex items-center gap-1">
                  <ImageOff className="w-3.5 h-3.5" /> Belum Ada Gambar
                </div>
                <div className="text-lg font-black text-rose-950 mt-0.5 tabular-nums">
                  {fmt(data.totals?.missingImage)}
                </div>
                <div className="text-[11px] text-rose-800 tabular-nums">
                  Stok &gt; 0 tanpa foto: <strong>{fmt(data.totals?.activeMissingImage)}</strong>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-[10px] font-extrabold text-slate-700 uppercase flex items-center gap-1">
                  <Tag className="w-3.5 h-3.5" /> Harga Normal Rp 0
                </div>
                <div className="text-lg font-black text-slate-900 mt-0.5 tabular-nums">
                  {fmt(data.totals?.missingPrice)}
                </div>
                <div className="text-[11px] text-slate-600 tabular-nums">
                  Aktif Rp 0: {fmt(data.totals?.activeMissingPrice)}
                </div>
              </div>
            </div>

            {/* TABEL PIVOT PER TOKO */}
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-100 text-slate-700 font-extrabold uppercase text-[10px]">
                  <tr>
                    <th className="px-3 py-2.5">Toko</th>
                    <th className="px-3 py-2.5 text-right">Total SKU</th>
                    <th className="px-3 py-2.5 text-right">Stok &gt; 0</th>
                    <th className="px-3 py-2.5 text-right">Komplit (All)</th>
                    <th className="px-3 py-2.5 text-right">No Barcode</th>
                    <th className="px-3 py-2.5 text-right">No Gambar (Aktif)</th>
                    <th className="px-3 py-2.5 text-right">No Harga</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.byStore.map((row) => (
                    <tr key={row.brandGroup} className="hover:bg-slate-50/80">
                      <td className="px-3 py-2.5 font-black text-slate-900">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-black ${
                            row.brandGroup === "SUKO"
                              ? "bg-indigo-100 text-indigo-800"
                              : row.brandGroup === "MUKU"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-slate-200 text-slate-800"
                          }`}
                        >
                          {storeLabel(row.brandGroup)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold tabular-nums text-slate-800">
                        {fmt(row.totalSkus)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold tabular-nums text-emerald-700">
                        {fmt(row.activeSkus)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        <span className="font-bold text-slate-900">{fmt(row.completeSkus)}</span>
                        <span className="ml-1 text-[10px] font-bold text-emerald-700">({row.completePct}%)</span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        <span className={row.missingBarcode > 0 ? "font-bold text-amber-700" : "text-emerald-600 font-bold"}>
                          {fmt(row.missingBarcode)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        <span className={row.missingImage > 0 ? "font-bold text-rose-700" : "text-emerald-600 font-bold"}>
                          {fmt(row.missingImage)}
                        </span>
                        {row.activeMissingImage > 0 && (
                          <span className="ml-1 text-[10px] font-extrabold text-rose-600">
                            ({fmt(row.activeMissingImage)} aktif)
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-700">
                        {fmt(row.missingPrice)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Aksi Cepat + Toggle Drill-Down Sampel SKU Bolong */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowList((v) => !v)}
                className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-extrabold cursor-pointer transition"
              >
                {showList ? "▲ Sembunyikan Daftar SKU Bolong" : "▼ Lihat Daftar SKU Belum Komplit (SUKO & Mu+Ku)"}
              </button>

              {onTriggerFix && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => onTriggerFix("photos")}
                    className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-extrabold cursor-pointer disabled:opacity-50"
                  >
                    📸 Tambal Foto Bolong (7-Jalur)
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => onTriggerFix("scrab")}
                    className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-extrabold cursor-pointer disabled:opacity-50"
                  >
                    🔍 Tambal Barcode &amp; Stok (SUKO + Mu+Ku)
                  </button>
                </div>
              )}
            </div>

            {/* Daftar Drill-Down SKU yang Masih Bolong */}
            {showList && (
              <div className="space-y-2.5 pt-2 border-t border-slate-100">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    {(
                      [
                        { id: "missingImage", label: "🖼️ Tanpa Gambar" },
                        { id: "missingBarcode", label: "🏷️ Tanpa Barcode" },
                        { id: "missingPrice", label: "💰 Tanpa Harga" },
                      ] as const
                    ).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setActiveTab(t.id)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold cursor-pointer transition ${
                          activeTab === t.id
                            ? "bg-slate-900 text-white"
                            : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-1">
                    {(["ALL", "SUKO", "MUKU", "ZES"] as const).map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setStoreFilter(st)}
                        className={`px-2 py-1 rounded-md text-[10px] font-extrabold cursor-pointer ${
                          storeFilter === st ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {st === "ALL" ? "Semua" : storeLabel(st)}
                      </button>
                    ))}
                  </div>
                </div>

                {filteredSamples.length === 0 ? (
                  <div className="p-4 text-center text-xs text-emerald-700 bg-emerald-50 rounded-xl font-bold">
                    ✅ Tidak ada SKU bolong untuk filter ini!
                  </div>
                ) : (
                  <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
                    {filteredSamples.map((it) => (
                      <div key={it.sku} className="p-2.5 flex flex-wrap items-center justify-between gap-2 text-xs hover:bg-slate-50">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="px-1.5 py-0.5 rounded bg-slate-900 text-white font-mono text-[10px] font-bold">
                              {it.sku}
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-800 text-[10px] font-extrabold">
                              {storeLabel(it.brandGroup)}
                            </span>
                            {it.article && (
                              <span className="font-mono text-[10px] text-slate-600 font-bold">
                                Art: {it.article}
                              </span>
                            )}
                            <span className="text-[10px] font-bold text-emerald-700">
                              Stok: {it.stok} pcs
                            </span>
                          </div>
                          <div className="text-[11px] font-semibold text-slate-800 mt-0.5 whitespace-normal break-words">
                            {it.description || "-"}
                            {it.color || it.size ? ` (${[it.color, it.size].filter(Boolean).join(" / ")})` : ""}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 text-[10px] font-bold">
                          {!it.barcode && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 flex items-center gap-0.5">
                              <AlertTriangle className="w-3 h-3" /> No BC
                            </span>
                          )}
                          {!it.hasImage && (
                            <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-800">No Foto</span>
                          )}
                          {it.hargaNormal <= 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-800">Rp 0</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {data.generatedAt && (
              <div className="text-[10px] text-slate-400 text-right">
                Terakhir diaudit:{" "}
                {new Date(data.generatedAt).toLocaleString("id-ID", {
                  timeZone: "Asia/Jakarta",
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                WIB
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
