"use client";

import { useState, useEffect } from "react";
import { ArrowLeft, TrendingUp, AlertCircle, Tag, Search } from "lucide-react";
import Link from "next/link";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function PromoAnalysisPage() {
  const [search, setSearch] = useState("");
  const { data, error, isLoading } = useSWR("/api/admin/promo-analysis", fetcher);

  const formatRupiah = (angka: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(angka);
  };

  const filteredData = data?.data?.filter((item: any) => 
    item.description.toLowerCase().includes(search.toLowerCase()) || 
    item.sku.includes(search)
  ) || [];

  return (
    <div className="min-h-screen bg-slate-50 p-4 pb-24 max-w-2xl mx-auto flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <Link href="/super-admin" className="p-2 rounded-full hover:bg-slate-200 transition-colors">
          <ArrowLeft className="w-5 h-5 text-slate-700" />
        </Link>
        <div>
          <h1 className="font-bold text-xl text-slate-800">Analisis Promo</h1>
          <p className="text-xs text-slate-500">Efektivitas promo terhadap penjualan</p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
        <input
          type="text"
          placeholder="Cari SKU atau nama barang..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500 transition-shadow shadow-sm"
        />
      </div>

      {/* Content */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex-1">
        {isLoading ? (
          <div className="p-12 flex justify-center">
            <div className="w-8 h-8 border-4 border-fuchsia-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-rose-500 flex flex-col items-center gap-2">
            <AlertCircle className="w-8 h-8" />
            <p className="text-sm font-bold">Gagal memuat data</p>
          </div>
        ) : filteredData.length === 0 ? (
          <div className="p-12 text-center text-slate-500 flex flex-col items-center gap-3">
            <Tag className="w-12 h-12 text-slate-300" />
            <p className="text-sm">Tidak ada data promo yang bisa dianalisis.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredData.map((item: any) => (
              <div key={item.id} className="p-4 hover:bg-slate-50 transition-colors">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-bold text-slate-800 text-sm leading-tight">{item.description}</h3>
                    <p className="text-xs text-slate-500 font-mono mt-1">{item.sku}</p>
                  </div>
                  <div className={`px-2 py-1 rounded text-[10px] font-bold tracking-wider ${
                    item.percentage > 0 ? 'bg-green-100 text-green-700' : 
                    item.percentage < 0 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {item.percentage > 0 ? '🔥 +' : item.percentage < 0 ? '🧊 ' : ''}{item.percentage.toFixed(1)}%
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-2 mt-3 bg-slate-50 p-2 rounded-lg border border-slate-100">
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Sebelum Promo</p>
                    <p className="text-sm font-bold text-slate-800">
                      {item.avgBefore.toFixed(1)} <span className="text-[10px] font-normal">pcs/hari</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Saat Promo</p>
                    <p className="text-sm font-bold text-slate-800">
                      {item.avgDuring.toFixed(1)} <span className="text-[10px] font-normal">pcs/hari</span>
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
