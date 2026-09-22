import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 1;
    const typeParam = searchParams.get('type');

    const whereClause = typeParam ? { type: typeParam } : {};

    if (limit === 1) {
      const history = await prisma.syncHistory.findFirst({
        where: whereClause,
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: { name: true, role: true }
          }
        }
      });
      return NextResponse.json({ success: true, data: history });
    }

    const histories = await prisma.syncHistory.findMany({
      where: whereClause,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: { name: true, role: true }
        }
      }
    });
    
    return NextResponse.json({ success: true, data: histories });
  } catch (error) {
    console.error("Error fetching sync history:", error);
    return NextResponse.json({ error: "Failed to fetch sync history" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { id } = body;

    const history = await prisma.syncHistory.findUnique({
      where: { id: String(id) }
    });

    if (!history) {
      return NextResponse.json({ error: "Riwayat tidak ditemukan" }, { status: 404 });
    }

    // Jika yang dihapus adalah PQ_HARIAN, pastikan itu adalah upload terakhir
    if (history.type === "PQ_HARIAN") {
      const latestPqHistory = await prisma.syncHistory.findFirst({
        where: { type: "PQ_HARIAN" },
        orderBy: { createdAt: "desc" }
      });

      if (latestPqHistory && latestPqHistory.id !== history.id) {
        return NextResponse.json({ 
          error: "Akses ditolak! Anda hanya diizinkan menghapus data PQ_HARIAN yang paling terakhir diunggah untuk mencegah kerusakan data." 
        }, { status: 403 });
      }

      const startOfDay = new Date(history.createdAt);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(history.createdAt);
      endOfDay.setHours(23, 59, 59, 999);

      // Cari semua DailySales yang terjadi pada hari upload tersebut
      const salesToDelete = await prisma.dailySales.findMany({
        where: {
          date: { gte: startOfDay, lte: endOfDay }
        }
      });

      // Kembalikan (decrement) sales_mtd di Product
      // Kita pakai loop transaksi agar aman
      if (salesToDelete.length > 0) {
        const revertPromises = salesToDelete.map(sale => 
          prisma.product.update({
            where: { id: sale.productId },
            data: { sales_mtd: { decrement: sale.qtySold } }
          })
        );
        
        await prisma.$transaction(revertPromises);

        // Hapus DailySales nya
        await prisma.dailySales.deleteMany({
          where: {
            date: { gte: startOfDay, lte: endOfDay }
          }
        });
      }
    }

    await prisma.syncHistory.delete({
      where: { id: String(id) }
    });

    return NextResponse.json({ success: true, message: "Riwayat upload dan data penjualan terkait berhasil dihapus/di-revert." });
  } catch (error) {
    console.error("Error deleting sync history:", error);
    return NextResponse.json({ error: "Gagal menghapus riwayat" }, { status: 500 });
  }
}
