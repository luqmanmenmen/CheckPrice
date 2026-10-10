"use client";

import { CalendarDays, ArrowRight, Copy, Check } from "lucide-react";
import { useState } from "react";

export default function ClientPromoCard({ item, formatRupiah }: { item: any, formatRupiah: any }) {
  const [copied, setCopied] = useState(false);

  const dateAdded = new Date(item.updatedAt).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short'
  });

  const handleCopy = () => {
    navigator.clipboard.writeText(item.sku);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div 
      onClick={handleCopy}
      className="bg-white rounded-[2rem] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 hover:shadow-xl hover:-translate-y-1 transition-all group flex flex-col justify-between relative overflow-hidden cursor-pointer"
    >
      {/* Badge Tipe Diskon di Pojok Kanan Atas */}
      <div className="absolute top-0 right-0 bg-purple-600 text-white font-black text-xs px-4 py-2 rounded-bl-2xl shadow-sm z-10">
        {item.discountType || 'PROMO'}
      </div>

      <div>
        <div className="flex justify-between items-start mb-4 mt-2">
          <span className="text-xs font-black tracking-widest text-slate-400 bg-slate-100 px-3 py-1 rounded-full uppercase">
            {item.brand || "SUKO"}
          </span>
        </div>
        
        <h3 className="text-xl font-black text-slate-800 leading-tight mb-2 group-hover:text-purple-600 transition-colors line-clamp-2 pr-10">
          {item.description}
        </h3>
        
        <p className="text-sm font-medium text-slate-500 mb-2 flex items-center gap-2">
          SKU: <span className="text-slate-700 font-bold bg-slate-100 px-2 py-0.5 rounded-md">{item.sku}</span>
          {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-slate-300 group-hover:text-purple-500" />}
        </p>
        
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 mb-6 bg-slate-50 inline-flex px-2 py-1 rounded-md">
          <CalendarDays className="w-3.5 h-3.5" />
          Update: {dateAdded}
        </div>
      </div>
      
      <div className="pt-4 border-t border-slate-100 flex items-end justify-between">
        <div>
          <p className="text-xs font-bold text-slate-400 tracking-widest uppercase mb-1">HARGA NORMAL</p>
          <span className="text-2xl font-black text-slate-900">{formatRupiah(item.hargaNormal)}</span>
        </div>
        
        <button className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${copied ? 'bg-emerald-500 text-white' : 'bg-slate-50 text-slate-400 group-hover:bg-purple-600 group-hover:text-white'}`}>
          {copied ? <Check className="w-5 h-5" /> : <ArrowRight className="w-5 h-5" />}
        </button>
      </div>
      
      {/* Tooltip Overlay */}
      <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
        <div className="bg-slate-800 text-white font-bold px-4 py-2 rounded-full shadow-lg flex items-center gap-2 transform translate-y-4 group-hover:translate-y-0 transition-all">
          <Copy className="w-4 h-4" />
          Klik untuk Copy SKU
        </div>
      </div>
    </div>
  );
}
