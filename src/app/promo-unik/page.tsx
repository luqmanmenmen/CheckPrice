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

// Client component for the card so we can use onClick
import ClientPromoCard from './ClientPromoCard';

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
    take: 200, 
  });

  // Grouping data berdasarkan Departemen (dept)
  const groupedPromos = promoUnik.reduce((acc, item) => {
    const dept = item.dept || 'DEPARTEMEN LAINNYA';
    if (!acc[dept]) acc[dept] = [];
    acc[dept].push(item);
    return acc;
  }, {} as Record<string, typeof promoUnik>);

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
            <h1 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight">Katalog Promo Unik</h1>
            <p className="text-slate-500 mt-2 font-medium">BOGO = Buy One Get One. BXGY = Beli X Gratis Y.</p>
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
          <div className="flex flex-col gap-10">
            {Object.entries(groupedPromos).map(([type, items]) => (
              <div key={type}>
                {/* Judul Grup */}
                <div className="flex items-center gap-3 mb-4 border-b border-slate-200 pb-2">
                  <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">{type}</h2>
                  <span className="bg-purple-100 text-purple-700 font-bold px-2 py-0.5 rounded-full text-xs">
                    {items.length} Item
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                  {items.map((item) => (
                    <ClientPromoCard key={item.id} item={item} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
