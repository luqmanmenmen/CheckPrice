"use client";

import { useState } from "react";
import { ArrowLeft, TrendingUp, AlertCircle, Tag, Search, BarChart3, Layers, Box } from "lucide-react";
import Link from "next/link";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function PromoAnalysisPage() {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"EVENT" | "DEPT" | "ITEM">("EVENT");
  
  const { data, error, isLoading } = useSWR("/api/admin/promo-analysis", fetcher);

  const renderPercentageBadge = (percentage: number) => {
    if (percentage > 0) {
      return (
        <div className="px-2 py-1 rounded text-[10px] font-bold tracking-wider bg-green-100 text-green-700 whitespace-nowrap">
          🔥 +{percentage.toFixed(1)}%
        </div>
      );
    } else if (percentage < 0) {
      return (
        <div className="px-2 py-1 rounded text-[10px] font-bold tracking-wider bg-red-100 text-red-700 whitespace-nowrap">
          🧊 {percentage.toFixed(1)}%
        </div>
      );
    }
    return (
      <div className="px-2 py-1 rounded text-[10px] font-bold tracking-wider bg-slate-100 text-slate-600 whitespace-nowrap">
        0.0%
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 pb-24 max-w-7xl mx-auto flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200 sticky top-4 z-10">
        <Link href="/super-admin" className="p-2 bg-slate-100 rounded-full hover:bg-slate-200 transition-colors">
          <ArrowLeft className="w-5 h-5 text-slate-700" />
        </Link>
        <div className="flex-1">
          <h1 className="font-bold text-xl text-slate-800 flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-fuchsia-600" />
            Dashboard Analisis Promo
          </h1>
          <p className="text-xs text-slate-500">Agregasi performa dan efektivitas event promosi</p>
        </div>
      </div>

      {isLoading ? (
        <div className="p-12 flex justify-center bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="w-8 h-8 border-4 border-fuchsia-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : error ? (
        <div className="p-8 text-center text-rose-500 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col items-center gap-2">
          <AlertCircle className="w-8 h-8" />
          <p className="text-sm font-bold">Gagal memuat data analisis.</p>
        </div>
      ) : !data?.overallSummary ? (
        <div className="p-12 text-center text-slate-500 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col items-center gap-3">
          <Tag className="w-12 h-12 text-slate-300" />
          <p className="text-sm">Belum ada data history promo yang cukup untuk dianalisis.</p>
        </div>
      ) : (
        <>
          {/* Executive Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex flex-col">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Total SKU Promo</p>
              <div className="flex items-end gap-2 mt-auto">
                <span className="text-3xl font-black text-slate-800">{data.overallSummary.totalItems}</span>
                <span className="text-sm font-medium text-slate-500 mb-1">Item Aktif</span>
              </div>
            </div>
            
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-5 rounded-xl shadow-sm border border-slate-700 text-white flex flex-col">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">Sales Sebelum Promo</p>
              <div className="flex items-end gap-2 mt-auto">
                <span className="text-3xl font-black">{data.overallSummary.totalAvgBefore.toFixed(1)}</span>
                <span className="text-sm font-medium text-slate-400 mb-1">Pcs/Hari</span>
              </div>
            </div>
            
            <div className="bg-gradient-to-br from-fuchsia-600 to-purple-600 p-5 rounded-xl shadow-sm border border-fuchsia-500 text-white flex flex-col relative overflow-hidden">
              <div className="absolute right-[-10px] top-[-10px] opacity-20">
                <TrendingUp className="w-24 h-24" />
              </div>
              <p className="text-xs font-bold text-fuchsia-200 uppercase tracking-wide mb-1 relative z-10">Sales Saat Promo</p>
              <div className="flex items-end gap-2 mt-auto relative z-10">
                <span className="text-3xl font-black">{data.overallSummary.totalAvgDuring.toFixed(1)}</span>
                <span className="text-sm font-medium text-fuchsia-200 mb-1">Pcs/Hari</span>
              </div>
              <div className="mt-2 text-sm font-bold bg-white/20 inline-block px-2 py-1 rounded w-max backdrop-blur-sm relative z-10">
                Efektivitas Global: {data.overallSummary.overallPercentage > 0 ? '+' : ''}{data.overallSummary.overallPercentage.toFixed(1)}%
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex flex-col sm:flex-row gap-2 bg-white p-1.5 rounded-xl shadow-sm border border-slate-200">
            <button
              onClick={() => setActiveTab("EVENT")}
              className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                activeTab === "EVENT" ? "bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-200" : "text-slate-600 hover:bg-slate-50 border border-transparent"
              }`}
            >
              <Tag className="w-4 h-4" />
              Grup Acara / Event
            </button>
            <button
              onClick={() => setActiveTab("DEPT")}
              className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                activeTab === "DEPT" ? "bg-indigo-50 text-indigo-700 border border-indigo-200" : "text-slate-600 hover:bg-slate-50 border border-transparent"
              }`}
            >
              <Layers className="w-4 h-4" />
              Grup Departemen
            </button>
            <button
              onClick={() => setActiveTab("ITEM")}
              className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                activeTab === "ITEM" ? "bg-slate-800 text-white border border-slate-700" : "text-slate-600 hover:bg-slate-50 border border-transparent"
              }`}
            >
              <Box className="w-4 h-4" />
              Rincian Per SKU
            </button>
          </div>

          {/* Tab Content */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            {/* GROUP BY EVENT */}
            {activeTab === "EVENT" && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-600 text-xs uppercase font-bold border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-4">Nama Acara / Event Promo</th>
                      <th className="px-4 py-4 text-center">SKU Terlibat</th>
                      <th className="px-4 py-4 text-center">Avg Sblm Promo (Pcs/Hari)</th>
                      <th className="px-4 py-4 text-center">Avg Saat Promo (Pcs/Hari)</th>
                      <th className="px-4 py-4 text-center">Efektivitas Kenaikan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.groupedByEvent.length === 0 ? (
                      <tr><td colSpan={5} className="p-8 text-center text-slate-500">Tidak ada data</td></tr>
                    ) : (
                      data.groupedByEvent.map((ev: any, idx: number) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="px-4 py-4 font-bold text-slate-800">{ev.acara}</td>
                          <td className="px-4 py-4 text-center font-bold">{ev.itemCount}</td>
                          <td className="px-4 py-4 text-center text-slate-600">{ev.totalAvgBefore.toFixed(1)}</td>
                          <td className="px-4 py-4 text-center font-bold text-fuchsia-700">{ev.totalAvgDuring.toFixed(1)}</td>
                          <td className="px-4 py-4 flex justify-center">{renderPercentageBadge(ev.percentage)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* GROUP BY DEPT */}
            {activeTab === "DEPT" && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-600 text-xs uppercase font-bold border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-4">Departemen / Kategori</th>
                      <th className="px-4 py-4 text-center">SKU Terlibat</th>
                      <th className="px-4 py-4 text-center">Avg Sblm Promo (Pcs/Hari)</th>
                      <th className="px-4 py-4 text-center">Avg Saat Promo (Pcs/Hari)</th>
                      <th className="px-4 py-4 text-center">Efektivitas Kenaikan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.groupedByDept.length === 0 ? (
                      <tr><td colSpan={5} className="p-8 text-center text-slate-500">Tidak ada data</td></tr>
                    ) : (
                      data.groupedByDept.map((dp: any, idx: number) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="px-4 py-4 font-bold text-slate-800">{dp.dept}</td>
                          <td className="px-4 py-4 text-center font-bold">{dp.itemCount}</td>
                          <td className="px-4 py-4 text-center text-slate-600">{dp.totalAvgBefore.toFixed(1)}</td>
                          <td className="px-4 py-4 text-center font-bold text-indigo-700">{dp.totalAvgDuring.toFixed(1)}</td>
                          <td className="px-4 py-4 flex justify-center">{renderPercentageBadge(dp.percentage)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* ITEM LEVEL */}
            {activeTab === "ITEM" && (
              <>
                <div className="p-4 border-b border-slate-200 bg-slate-50">
                  <div className="relative max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                    <input
                      type="text"
                      placeholder="Cari SKU atau nama..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-fuchsia-500"
                    />
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-800 text-slate-300 text-xs uppercase font-bold">
                      <tr>
                        <th className="px-4 py-3">Barang & Acara</th>
                        <th className="px-4 py-3 text-center border-l border-slate-700">Harga<br/><span className="text-[9px] font-normal">Sblm & Sesudah</span></th>
                        <th className="px-4 py-3 text-center border-l border-slate-700">Terjual<br/><span className="text-[9px] font-normal">Sblm Promo (Avg)</span></th>
                        <th className="px-4 py-3 text-center border-l border-slate-700 bg-slate-700 text-white">Terjual<br/><span className="text-[9px] font-normal">Saat Promo (Avg)</span></th>
                        <th className="px-4 py-3 text-center border-l border-slate-700">Efektivitas</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {data.itemLevel.filter((i: any) => i.sku.includes(search) || i.description.toLowerCase().includes(search.toLowerCase())).map((item: any, idx: number) => (
                        <tr key={item.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                          <td className="px-4 py-3 min-w-[250px]">
                            <div className="font-bold text-slate-800 line-clamp-2 leading-tight">{item.description}</div>
                            <div className="text-[10px] text-slate-500 font-mono mt-1 mb-1">{item.sku}</div>
                            <span className="text-[9px] px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded uppercase font-bold">{item.acara}</span>
                          </td>
                          <td className="px-4 py-3 border-l border-slate-100 text-center">
                            <div className="text-xs text-slate-400 line-through">Rp {item.hargaNormal.toLocaleString('id-ID')}</div>
                            <div className="text-sm font-bold text-slate-800">Rp {item.hargaPromo.toLocaleString('id-ID')}</div>
                          </td>
                          <td className="px-4 py-3 border-l border-slate-100 text-center text-slate-600 font-medium">
                            {item.avgBefore.toFixed(1)}
                          </td>
                          <td className="px-4 py-3 border-l border-slate-100 text-center font-black bg-slate-50 text-fuchsia-700">
                            {item.avgDuring.toFixed(1)}
                          </td>
                          <td className="px-4 py-3 border-l border-slate-100">
                            <div className="flex justify-center">
                              {renderPercentageBadge(item.percentage)}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
