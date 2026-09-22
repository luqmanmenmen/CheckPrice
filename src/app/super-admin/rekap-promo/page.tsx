"use client";

import { useState, useEffect } from "react";
import { ArrowLeft, Search, Tag, AlertCircle, Package } from "lucide-react";
import Link from "next/link";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function RekapPromoPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, error, isLoading } = useSWR(
    `/api/admin/reports?type=promo&search=${debouncedSearch}&page=${page}&limit=20`,
    fetcher
  );

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
          <h1 className="font-bold text-xl text-slate-800">Rekap Promo Aktif</h1>
          <p className="text-xs text-slate-500">Daftar semua barang yang sedang diskon</p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
        <input
          type="text"
          placeholder="Cari SKU atau nama barang promo..."
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
          <div className="p-8 text-center text-fuchsia-500 flex flex-col items-center gap-2">
            <AlertCircle className="w-8 h-8" />
            <p className="text-sm font-bold">Gagal memuat data</p>
          </div>
        ) : data?.data?.length === 0 ? (
          <div className="p-12 text-center text-slate-500 flex flex-col items-center gap-3">
            <Tag className="w-12 h-12 text-slate-300" />
            <p className="text-sm">Tidak ada barang diskon saat ini.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {data.data.map((product: any) => (
              <div key={product.id} className="p-4 hover:bg-slate-50 transition-colors">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-bold text-slate-800 text-sm leading-tight">{product.description}</h3>
                    <p className="text-xs text-slate-500 font-mono mt-1">{product.sku}</p>
                  </div>
                  {product.diskon && (
                    <div className="px-2 py-1 rounded bg-red-100 text-red-700 text-[10px] font-black tracking-wider">
                      {product.diskon}
                    </div>
                  )}
                </div>
                
                <div className="grid grid-cols-2 gap-2 mt-3 bg-fuchsia-50/50 p-3 rounded-lg border border-fuchsia-100">
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Harga Normal</p>
                    <p className="text-xs font-bold text-slate-400 line-through decoration-red-500/50">
                      {formatRupiah(product.hargaNormal)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-fuchsia-600 uppercase font-black tracking-wider mb-1">Harga Promo</p>
                    <p className="text-lg font-black text-fuchsia-700 leading-none">
                      {formatRupiah(product.hargaPromo)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
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
