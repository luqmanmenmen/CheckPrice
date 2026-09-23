"use client";

import { useState, useEffect } from "react";
import { ArrowLeft, Search, TrendingUp, AlertCircle, Package, ChevronRight } from "lucide-react";
import Link from "next/link";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function RekapPergerakanPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("all"); // all, fast, slow
  const [selectedDept, setSelectedDept] = useState<string | null>(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1); // Reset page on new search
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  const handleFilterChange = (newFilter: string) => {
    setFilter(newFilter);
    setPage(1);
    setSelectedDept(null);
    setSearch("");
  };

  const shouldGroup = (filter === "fast" || filter === "slow") && !selectedDept && !debouncedSearch;

  const endpoint = shouldGroup
    ? `/api/admin/reports?type=pergerakan&filter=${filter}&groupBy=dept`
    : `/api/admin/reports?type=pergerakan&filter=${filter}&search=${debouncedSearch}&page=${page}&limit=20${selectedDept ? `&dept=${encodeURIComponent(selectedDept)}` : ''}`;

  const { data, error, isLoading } = useSWR(endpoint, fetcher);

  const formatRupiah = (angka: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(angka);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 pb-24 max-w-2xl mx-auto flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <Link href="/super-admin" className="p-2 rounded-full hover:bg-slate-200 transition-colors">
          <ArrowLeft className="w-5 h-5 text-slate-700" />
        </Link>
        <div>
          <h1 className="font-bold text-xl text-slate-800">Rekap Pergerakan</h1>
          <p className="text-xs text-slate-500">Analisis produk Fast Move vs Slow Move</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white p-1 rounded-xl flex shadow-sm border border-slate-200 overflow-x-auto">
        <button
          onClick={() => handleFilterChange("all")}
          className={`flex-none px-4 py-2 text-sm font-bold rounded-lg transition-colors ${filter === "all" ? "bg-slate-800 text-white" : "text-slate-500 hover:bg-slate-100"}`}
        >
          Semua Data
        </button>
        <button
          onClick={() => handleFilterChange("fast")}
          className={`flex-none px-4 py-2 text-sm font-bold rounded-lg transition-colors ${filter === "fast" ? "bg-rose-500 text-white" : "text-slate-500 hover:bg-slate-100"}`}
        >
          🔥 Fast Move
        </button>
        <button
          onClick={() => handleFilterChange("slow")}
          className={`flex-none px-4 py-2 text-sm font-bold rounded-lg transition-colors ${filter === "slow" ? "bg-blue-500 text-white" : "text-slate-500 hover:bg-slate-100"}`}
        >
          🐢 Slow Move
        </button>
        <button
          onClick={() => handleFilterChange("minus")}
          className={`flex-none px-4 py-2 text-sm font-bold rounded-lg transition-colors ${filter === "minus" ? "bg-amber-500 text-white" : "text-slate-500 hover:bg-slate-100"}`}
        >
          ⚠️ Plus Minus
        </button>
        <button
          onClick={() => handleFilterChange("kritis")}
          className={`flex-none px-4 py-2 text-sm font-bold rounded-lg transition-colors ${filter === "kritis" ? "bg-red-600 text-white" : "text-slate-500 hover:bg-slate-100"}`}
        >
          🚨 Stok Kritis
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
        <input
          type="text"
          placeholder="Cari SKU atau nama barang..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 transition-shadow shadow-sm"
        />
      </div>

      {/* Content */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex-1">
        {isLoading ? (
          <div className="p-12 flex justify-center">
            <div className="w-8 h-8 border-4 border-rose-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-rose-500 flex flex-col items-center gap-2">
            <AlertCircle className="w-8 h-8" />
            <p className="text-sm font-bold">Gagal memuat data</p>
          </div>
        ) : data?.data?.length === 0 ? (
          <div className="p-12 text-center text-slate-500 flex flex-col items-center gap-3">
            <Package className="w-12 h-12 text-slate-300" />
            <p className="text-sm">Tidak ada produk ditemukan.</p>
          </div>
        ) : shouldGroup ? (
          <div className="grid grid-cols-1 p-2 gap-2 bg-slate-50">
            <div className="px-2 py-2 mb-1">
              <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Pilih Departemen</h2>
            </div>
            {data?.data?.map((g: any) => (
              <button 
                key={g.dept}
                onClick={() => setSelectedDept(g.dept)}
                className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:border-blue-400 hover:shadow-md transition-all text-left group"
              >
                <div className="flex flex-col">
                  <span className="font-bold text-slate-800">{g.dept}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="px-3 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold group-hover:bg-blue-50 group-hover:text-blue-700 transition-colors">{g.count} item</span>
                  <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-blue-500 transition-colors" />
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {selectedDept && (
              <div className="p-3 bg-slate-100 border-b border-slate-200 flex items-center justify-between sticky top-0 z-10">
                <div className="flex items-center gap-2">
                  <button onClick={() => { setSelectedDept(null); setPage(1); }} className="p-1.5 bg-white rounded-lg border border-slate-300 hover:bg-slate-50">
                    <ArrowLeft className="w-4 h-4 text-slate-700" />
                  </button>
                  <span className="font-bold text-sm text-slate-800">Dept: {selectedDept}</span>
                </div>
              </div>
            )}
            {filter === "minus" ? (
              Object.entries(data.data.reduce((acc: any, curr: any) => {
                const article = curr.article || 'Tanpa Artikel';
                if (!acc[article]) acc[article] = [];
                acc[article].push(curr);
                return acc;
              }, {})).map(([article, items]: any) => (
                <div key={article} className="p-4 bg-white border-b border-slate-200">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">{article}</h3>
                  <div className="flex flex-col gap-2">
                    {items.map((item: any) => (
                      <div key={item.id} className={`p-3 rounded-lg border ${item.stok < 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200 shadow-sm'}`}>
                         <div className="flex justify-between items-center gap-3">
                           <div className="flex-1">
                             <p className="font-bold text-sm text-slate-800 leading-tight">{item.description}</p>
                             <p className="text-[10px] text-slate-500 font-mono mt-0.5">{item.sku}</p>
                           </div>
                           <div className={`px-3 py-1.5 rounded-lg text-lg font-black tracking-wider whitespace-nowrap ${item.stok < 0 ? 'text-red-700 bg-red-100' : 'text-green-700 bg-green-100'}`}>
                             {item.stok > 0 ? '+' : ''}{item.stok}
                           </div>
                         </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              data.data.map((product: any) => (
                <div key={product.id} className="p-4 hover:bg-slate-50 transition-colors">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="font-bold text-slate-800 text-sm leading-tight">{product.description}</h3>
                      <p className="text-xs text-slate-500 font-mono mt-1">{product.sku}</p>
                    </div>
                    <div className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${
                      product.sales_mtd > 5 ? 'bg-rose-100 text-rose-700' : 
                      product.sales_mtd <= 2 ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
                    }`}>
                      Terjual {product.sales_mtd}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 mt-3 bg-slate-50 p-2 rounded-lg border border-slate-100">
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Sisa Stok</p>
                      <p className={`text-sm font-black ${product.stok <= 0 ? 'text-red-500' : 'text-slate-800'}`}>
                        {product.stok} pcs
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Harga Normal</p>
                      <p className="text-sm font-bold text-slate-800">{formatRupiah(product.hargaNormal)}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Pagination */}
      {data?.pagination && data.pagination.totalPages > 1 && (
        <div className="flex justify-between items-center bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 rounded-lg text-sm font-bold bg-slate-100 text-slate-700 disabled:opacity-50"
          >
            Mundur
          </button>
          <span className="text-xs font-bold text-slate-500">
            Hal {page} dari {data.pagination.totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(data.pagination.totalPages, p + 1))}
            disabled={page === data.pagination.totalPages}
            className="px-4 py-2 rounded-lg text-sm font-bold bg-slate-100 text-slate-700 disabled:opacity-50"
          >
            Lanjut
          </button>
        </div>
      )}
    </div>
  );
}
