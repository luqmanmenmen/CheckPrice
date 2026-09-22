import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * POST /api/admin/reset-sync
 * 
 * Hapus semua riwayat upload PQ (SyncHistory) + DailySales + reset sales_mtd.
 * Harga normal, harga promo, dan stok saat ini TIDAK terpengaruh.
 * Dilindungi PIN khusus Super Admin.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { pin } = body;

    if (pin !== "220117") {
      return NextResponse.json({ error: "PIN salah" }, { status: 403 });
    }

    // 1. Hapus semua DailySales
    const deletedSales = await prisma.dailySales.deleteMany({});

    // 2. Reset sales_mtd dan sales_wtd semua produk ke 0
    await prisma.product.updateMany({
      data: {
        sales_mtd: 0,
        sales_wtd: 0,
      }
    });

    // 3. Hapus semua SyncHistory bertipe PQ_HARIAN
    const deletedHistory = await prisma.syncHistory.deleteMany({
      where: { type: "PQ_HARIAN" }
    });

    return NextResponse.json({
      success: true,
      message: `Reset berhasil! ${deletedSales.count} data penjualan dihapus, ${deletedHistory.count} riwayat upload dibersihkan. Semua MTD direset ke 0. Siap upload PQ bersih.`
    });
  } catch (error) {
    console.error("Reset error:", error);
    return NextResponse.json({ error: "Gagal melakukan reset" }, { status: 500 });
  }
}
