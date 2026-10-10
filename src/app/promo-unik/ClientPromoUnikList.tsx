"use client";

import { CalendarDays, Copy, Check, ChevronDown, ChevronUp, Tag } from "lucide-react";
import { useState } from "react";

function formatRupiah(angka: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(angka);
}

export default function ClientPromoUnikList({ groupedItems }: { groupedItems: any[] }) {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [copiedSku, setCopiedSku] = useState<string | null>(null);

  const toggleGroup = (promoName: string) => {
    setOpenGroups(prev => ({ ...prev, [promoName]: !prev[promoName] }));
  };

  const copyToClipboard = (e: React.MouseEvent, sku: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(sku);
    setCopiedSku(sku);
    setTimeout(() => setCopiedSku(null), 2000);
  };

  if (groupedItems.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 items-start">
      {groupedItems.map((group) => {
        const isOpen = openGroups[group.promoName];
        const firstItem = group.items[0];
        
        const dateAdded = new Date(firstItem.updatedAt).toLocaleDateString('id-ID', {
          day: 'numeric',
          month: 'short'
        });

        return (
          <div key={group.promoName} className="bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-xl transition-all border border-slate-100 group flex flex-col">
            
            <div 
              className="cursor-pointer flex flex-col h-full relative"
              onClick={() => toggleGroup(group.promoName)}
            >
              {/* Badge Promo (Hanya Teks Singkat) */}
              <div className="absolute top-0 right-0 bg-purple-600 text-white px-4 py-1.5 rounded-bl-xl text-xs font-black tracking-wider uppercase shadow-sm">
                PROMO
              </div>

              <div className="p-5 pt-8 flex flex-col h-full">
                <div className="flex justify-between items-start mb-3">
                  <span className="text-[10px] font-black tracking-widest text-slate-400 bg-slate-100 px-3 py-1 rounded-full uppercase">
                    PENAWARAN SPESIAL
                  </span>
                </div>
                
                <h3 className="text-xl font-black text-purple-700 leading-tight mb-2 group-hover:text-purple-500 transition-colors">
                  {group.promoName}
                </h3>
                
                <div className="flex items-center gap-2 mb-4 flex-wrap">
                  <span className="bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded text-[10px]">
                    {group.items.length} SKU / Barang
                  </span>
                  <span className="flex items-center gap-1 bg-slate-50 text-slate-400 font-medium px-2 py-0.5 rounded text-[10px]">
                    <CalendarDays className="w-3 h-3" />
                    Update: {dateAdded}
                  </span>
                </div>
                
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between mt-auto">
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 tracking-widest uppercase mb-0.5">LIHAT DAFTAR BARANG</p>
                  </div>
                  
                  <button className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-purple-500 group-hover:text-white transition-all">
                    {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Dropdown Varian SKU */}
            {isOpen && (
              <div className="p-4 pt-0 border-t border-slate-100 animate-in slide-in-from-top-2 fade-in duration-200 bg-slate-50">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 mt-3">Daftar Barang BOGO ({group.items.length})</h4>
                <div className="flex flex-col gap-2 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
                  {group.items.map((item: any) => {
                    const isCopied = copiedSku === item.sku;
                    return (
                      <div key={item.sku} className="flex justify-between items-center bg-white p-2.5 rounded-xl border border-slate-100 hover:border-purple-200 transition-colors">
                        <div>
                          <p className="text-sm font-bold text-slate-700">{item.baseName}</p>
                          <p className="text-xs font-mono font-medium text-slate-500 mt-1">SKU: {item.sku}</p>
                          {(item.color || item.size) && (
                            <p className="text-[10px] font-semibold text-slate-500 uppercase mt-0.5">
                              {item.color} {item.color && item.size ? '•' : ''} {item.size}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-2 shrink-0">
                          <p className="text-sm font-black text-slate-900">{formatRupiah(item.hargaNormal)}</p>
                          <button 
                            onClick={(e) => copyToClipboard(e, item.sku)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                              isCopied ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                            {isCopied ? 'Dicopy!' : 'Copy'}
                          </button>
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
