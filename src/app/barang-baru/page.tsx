import { PrismaClient } from '@prisma/client';
import { Package, CalendarDays, ArrowRight, Sparkles } from 'lucide-react';
import Link from 'next/link';

const prisma = new PrismaClient();

function formatRupiah(angka: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(angka);
}

// Enable ISR revalidation for this page
export const revalidate = 60; // revalidate every 60 seconds at most, or on demand

export default async function BarangBaruPage() {
  // Ambil 50 barang terbaru berdasarkan createdAt
  const newItems = await prisma.product.findMany({
    orderBy: {
      createdAt: 'desc',
    },
    take: 50,
  });

  return (
    <div className="min-h-screen bg-slate-50 font-sans p-4 md:p-8">
      
      {/* HEADER */}
      <div className="max-w-6xl mx-auto mb-10 mt-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-700 px-3 py-1.5 rounded-full text-xs font-black tracking-widest mb-3 uppercase">
              <Sparkles className="w-4 h-4" />
              New Arrivals
            </div>
            <h1 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight">Barang Baru</h1>
            <p className="text-slate-500 mt-2 font-medium">Daftar produk terbaru yang baru terdaftar di sistem. Segera display di area!</p>
          </div>
          
          <Link 
            href="/"
            className="bg-white hover:bg-slate-100 text-slate-800 border border-slate-200 px-6 py-3 rounded-full font-bold transition-all text-sm flex items-center gap-2 shadow-sm"
          >
            Kembali ke Dashboard
          </Link>
        </div>
      </div>

      {/* GRID PRODUK BARU */}
      <div className="max-w-6xl mx-auto">
        {newItems.length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-100 p-12 text-center shadow-sm">
            <Package className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-slate-800">Belum ada barang baru</h3>
            <p className="text-slate-500">Produk yang baru di-upload akan muncul di sini.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {newItems.map((item) => {
              const dateAdded = new Date(item.createdAt).toLocaleDateString('id-ID', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
              });

              const isPromo = item.hargaPromo && item.hargaPromo > 0;

              return (
                <div key={item.id} className="bg-white rounded-[2rem] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 hover:shadow-xl hover:-translate-y-1 transition-all group flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start mb-4">
                      <span className="text-xs font-black tracking-widest text-slate-400 bg-slate-100 px-3 py-1 rounded-full uppercase">
                        {item.brand || "SUKO"}
                      </span>
                      <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">
                        <CalendarDays className="w-3.5 h-3.5" />
                        {dateAdded}
                      </div>
                    </div>
                    
                    <h3 className="text-xl font-black text-slate-800 leading-tight mb-2 group-hover:text-blue-600 transition-colors line-clamp-2">
                      {item.description}
                    </h3>
                    
                    <p className="text-sm font-medium text-slate-500 mb-6">SKU: <span className="text-slate-700">{item.sku}</span></p>
                  </div>
                  
                  <div className="pt-4 border-t border-slate-100 flex items-end justify-between">
                    <div>
                      <p className="text-xs font-bold text-slate-400 tracking-widest uppercase mb-1">HARGA</p>
                      {isPromo ? (
                        <div className="flex items-center gap-2">
                          <span className="text-2xl font-black text-red-600">{formatRupiah(item.hargaPromo!)}</span>
                        </div>
                      ) : (
                        <span className="text-2xl font-black text-slate-900">{formatRupiah(item.hargaNormal)}</span>
                      )}
                    </div>
                    
                    <button className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-blue-600 group-hover:text-white transition-all">
                      <ArrowRight className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
