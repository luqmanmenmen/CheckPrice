"use client";

import { CalendarDays, ArrowRight, ChevronDown, ChevronUp, Package2 } from "lucide-react";
import { useState } from "react";

function formatRupiah(angka: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(angka);
}

export default function ClientBarangBaruList({ groupedItems }: { groupedItems: any[] }) {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (articleName: string) => {
    setOpenGroups(prev => ({ ...prev, [articleName]: !prev[articleName] }));
  };

  if (groupedItems.length === 0) {
    return (
      <div className="bg-white rounded-3xl border border-slate-100 p-12 text-center shadow-sm">
        <Package2 className="w-16 h-16 text-slate-300 mx-auto mb-4" />
        <h3 className="text-xl font-bold text-slate-800">Belum ada barang baru</h3>
        <p className="text-slate-500">Produk yang baru di-upload akan muncul di sini.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 items-start">
      {groupedItems.map((group) => {
        const isOpen = openGroups[group.articleName];
        const firstItem = group.items[0];
        const isPromo = firstItem.hargaPromo && firstItem.hargaPromo > 0;
        const dateAdded = new Date(firstItem.createdAt).toLocaleDateString('id-ID', {
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        });

        // Kumpulkan warna unik
        const colors = Array.from(new Set(group.items.map((i: any) => i.color).filter(Boolean)));

        return (
          <div key={group.articleName} className="bg-white rounded-[2rem] p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 hover:shadow-xl transition-all group/card flex flex-col relative overflow-hidden">
            
            <div 
              className="cursor-pointer flex flex-col h-full"
              onClick={() => toggleGroup(group.articleName)}
            >
              <div className="flex justify-between items-start mb-3">
                <span className="text-xs font-black tracking-widest text-slate-400 bg-slate-100 px-3 py-1 rounded-full uppercase">
                  {firstItem.brand || "SUKO"}
                </span>
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
                  <CalendarDays className="w-3 h-3" />
                  {dateAdded}
                </div>
              </div>
              
              <h3 className="text-lg font-black text-slate-800 leading-tight mb-2 group-hover/card:text-emerald-600 transition-colors">
                {group.articleName}
              </h3>
              
              <div className="flex items-center gap-2 mb-4 flex-wrap">
                <span className="bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded text-[10px]">
                  {group.items.length} SKU
                </span>
                {colors.length > 0 && (
                  <span className="bg-indigo-50 text-indigo-600 font-bold px-2 py-0.5 rounded text-[10px]">
                    {colors.length} Warna
                  </span>
                )}
              </div>
              
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between mt-auto">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 tracking-widest uppercase mb-0.5">HARGA TERENDAH</p>
                  {isPromo ? (
                    <span className="text-xl font-black text-red-600">{formatRupiah(firstItem.hargaPromo)}</span>
                  ) : (
                    <span className="text-xl font-black text-slate-900">{formatRupiah(firstItem.hargaNormal)}</span>
                  )}
                </div>
                
                <button className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 group-hover/card:bg-emerald-500 group-hover/card:text-white transition-all">
                  {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Dropdown Varian SKU */}
            {isOpen && (
              <div className="mt-4 pt-4 border-t border-slate-100 animate-in slide-in-from-top-2 fade-in duration-200">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Daftar Varian ({group.items.length})</h4>
                <div className="flex flex-col gap-2 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
                  {group.items.map((item: any) => {
                    const hasPromo = item.hargaPromo && item.hargaPromo > 0;
                    return (
                      <div key={item.sku} className="flex justify-between items-center bg-slate-50 p-2.5 rounded-xl">
                        <div>
                          <p className="text-sm font-bold text-slate-700">{item.sku}</p>
                          {(item.color || item.size) && (
                            <p className="text-[10px] font-semibold text-slate-500 uppercase mt-0.5">
                              {item.color} {item.color && item.size ? '•' : ''} {item.size}
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          {hasPromo ? (
                            <p className="text-xs font-black text-red-600">{formatRupiah(item.hargaPromo)}</p>
                          ) : (
                            <p className="text-xs font-black text-slate-800">{formatRupiah(item.hargaNormal)}</p>
                          )}
                          {item.stok > 0 && <p className="text-[9px] text-emerald-600 font-bold mt-0.5">Stok: {item.stok}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
