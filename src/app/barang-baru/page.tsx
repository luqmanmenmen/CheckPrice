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

// Client component for accordion list
import ClientBarangBaruList from './ClientBarangBaruList';

export default async function BarangBaruPage() {
  // Ambil 150 barang terbaru berdasarkan createdAt
  const newItems = await prisma.product.findMany({
    orderBy: {
      createdAt: 'desc',
    },
    take: 150,
  });

  // Group by parsed description
  const groupedData: Record<string, any[]> = {};
  newItems.forEach(item => {
    // Parse name and variants to group properly
    const parts = item.description.split(":");
    
    // Always use the descriptive name from the description field rather than the raw article code
    // Example: "SWEATER KNIT WEAR SKSW01" is better than just "SKSW01"
    const baseName = parts[0].trim();
    
    // Add color/size for the UI if not available
    let color = item.color || (parts.length > 1 ? parts[1].trim() : "");
    let size = item.size || (parts.length > 2 ? parts[2].trim() : "");
    if (color.toUpperCase() === "F" || color.toUpperCase() === "M") color = "";
    if (size.toUpperCase() === "SOLID") size = "";

    const enrichedItem = { ...item, color, size };

    if (!groupedData[baseName]) {
      groupedData[baseName] = [];
    }
    groupedData[baseName].push(enrichedItem);
  });

  // Convert to array
  const groupedItems = Object.keys(groupedData).map(key => ({
    articleName: key,
    items: groupedData[key],
  }));

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
            <p className="text-slate-500 mt-2 font-medium">Daftar produk terbaru yang sudah dikelompokkan per artikel.</p>
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
        <ClientBarangBaruList groupedItems={groupedItems} />
      </div>

    </div>
  );
}
