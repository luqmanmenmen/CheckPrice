import { PrismaClient } from '@prisma/client';
import { Gift, CalendarDays, ArrowRight, Tag } from 'lucide-react';
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
export const revalidate = 60;

export default async function PromoUnikPage() {
  // Ambil promo unik: BXGY atau PERCENTAGE
  const promoUnik = await prisma.product.findMany({
    where: {
      AND: [
        { discountType: { not: null } },
        { 
          OR: [
            { discountType: { contains: 'B' } },
            { discountType: { contains: 'G' } },
            { discountType: { contains: '%' } },
            { discountType: { contains: 'X' } },
            { discountType: { contains: 'PERCENTAGE' } }
          ]
        },
        { discountType: { not: 'AMOUNT' } },
        { discountType: { not: '0' } },
        { discountType: { not: 'SPECIAL PRICE' } }
      ]
    },
    orderBy: {
      updatedAt: 'desc',
    },
    take: 100, // Batasi 100 barang agar tidak terlalu berat
  });

  return (
    <div className="min-h-screen bg-slate-50 font-sans p-4 md:p-8">
      
      {/* HEADER */}
      <div className="max-w-6xl mx-auto mb-10 mt-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="inline-flex items-center gap-2 bg-purple-100 text-purple-700 px-3 py-1.5 rounded-full text-xs font-black tracking-widest mb-3 uppercase">
              <Gift className="w-4 h-4" />
              Promo Spesial
            </div>
            <h1 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight">Promo Unik & BOGO</h1>
            <p className="text-slate-500 mt-2 font-medium">Daftar produk dengan diskon khusus seperti Beli 1 Gratis 1 (BXGY) dan Diskon Persen.</p>
          </div>
          
          <Link 
            href="/"
            className="bg-white hover:bg-slate-100 text-slate-800 border border-slate-200 px-6 py-3 rounded-full font-bold transition-all text-sm flex items-center gap-2 shadow-sm"
          >
            Kembali ke Dashboard
          </Link>
        </div>
      </div>

      {/* GRID PRODUK PROMO UNIK */}
      <div className="max-w-6xl mx-auto">
        {promoUnik.length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-100 p-12 text-center shadow-sm">
            <Tag className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-slate-800">Tidak ada Promo Unik saat ini</h3>
            <p className="text-slate-500">Produk BOGO atau diskon spesial akan muncul di sini.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {promoUnik.map((item) => {
              const dateAdded = new Date(item.updatedAt).toLocaleDateString('id-ID', {
                day: 'numeric',
                month: 'short'
              });

              return (
                <div key={item.id} className="bg-white rounded-[2rem] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 hover:shadow-xl hover:-translate-y-1 transition-all group flex flex-col justify-between relative overflow-hidden">
                  
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
                    
                    <p className="text-sm font-medium text-slate-500 mb-2">SKU: <span className="text-slate-700">{item.sku}</span></p>
                    
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
                    
                    <button className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-purple-600 group-hover:text-white transition-all">
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
