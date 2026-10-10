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
import ClientPromoUnikList from './ClientPromoUnikList';
import { ArrowLeft } from 'lucide-react';

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
        { discountType: { not: 'SPECIAL PRICE' } },
        { discountType: { not: { contains: 'HARGA SPESIAL' } } }
      ]
    },
    orderBy: {
      updatedAt: 'desc',
    },
    take: 400, 
  });

  // Grouping data berdasarkan Departemen (dept)
  const groupedPromos = promoUnik.reduce((acc, item) => {
    const dept = item.dept || 'DEPARTEMEN LAINNYA';
    if (!acc[dept]) acc[dept] = [];
    acc[dept].push(item);
    return acc;
  }, {} as Record<string, typeof promoUnik>);

  // Untuk setiap dept, lakukan grouping berdasarkan Tipe Promo
  const groupedByDeptAndPromo: Record<string, any[]> = {};
  
  Object.keys(groupedPromos).forEach(dept => {
    const itemsInDept = groupedPromos[dept];
    const groupedByPromo: Record<string, any[]> = {};
    
    itemsInDept.forEach(item => {
      const type = item.discountType || 'PROMO LAINNYA';
      
      const parts = item.description.split(":");
      const baseName = parts[0].trim();
      let color = item.color || (parts.length > 1 ? parts[1].trim() : "");
      let size = item.size || (parts.length > 2 ? parts[2].trim() : "");
      if (color.toUpperCase() === "F" || color.toUpperCase() === "M") color = "";
      if (size.toUpperCase() === "SOLID") size = "";

      const enrichedItem = { ...item, color, size, baseName };
      
      if (!groupedByPromo[type]) {
        groupedByPromo[type] = [];
      }
      groupedByPromo[type].push(enrichedItem);
    });
    
    // Ubah ke array format
    groupedByDeptAndPromo[dept] = Object.keys(groupedByPromo).map(key => ({
      promoName: key,
      items: groupedByPromo[key]
    }));
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
            <h1 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight">Katalog Promo Unik</h1>
            <p className="text-slate-500 mt-2 font-medium">BOGO = Buy One Get One. BXGY = Beli X Gratis Y.</p>
          </div>
          
          <Link 
            href="/"
            className="bg-white hover:bg-slate-100 text-slate-800 border border-slate-200 px-6 py-3 rounded-full font-bold transition-all text-sm flex items-center gap-2 shadow-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Kembali ke Dashboard
          </Link>
        </div>
      </div>

      {/* DAFTAR PROMO DI-GROUP PER DEPT */}
      <div className="max-w-6xl mx-auto space-y-12">
        {Object.keys(groupedByDeptAndPromo).length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-100 p-12 text-center shadow-sm">
            <Tag className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-slate-800 mb-2">Belum ada Promo BOGO / Unik</h3>
            <p className="text-slate-500">Jika ada barang dengan diskon Beli 1 Gratis 1 atau persentase, akan muncul di sini.</p>
          </div>
        ) : (
          Object.entries(groupedByDeptAndPromo).map(([dept, promoGroups]) => {
            const totalSkuCount = promoGroups.reduce((sum, group) => sum + group.items.length, 0);
            return (
              <div key={dept} className="bg-white/50 rounded-[2rem] p-6 md:p-8 border border-slate-200/60 shadow-sm backdrop-blur-sm">
                
                {/* Judul Grup */}
                <div className="flex items-center gap-4 mb-6 border-b border-slate-200 pb-4">
                  <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">{dept}</h2>
                  <span className="bg-purple-100 text-purple-700 font-bold px-3 py-1 rounded-full text-xs">
                    {totalSkuCount} SKU
                  </span>
                </div>
                
                <ClientPromoUnikList groupedItems={promoGroups} />
              </div>
            );
          })
        )}
      </div>

    </div>
  );
}
