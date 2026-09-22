import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 1;

    if (limit === 1) {
      const history = await prisma.syncHistory.findFirst({
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

    if (!id) {
      return NextResponse.json({ error: "Missing ID" }, { status: 400 });
    }

    await prisma.syncHistory.delete({
      where: { id: String(id) }
    });

    return NextResponse.json({ success: true, message: "Riwayat upload berhasil dihapus." });
  } catch (error) {
    console.error("Error deleting sync history:", error);
    return NextResponse.json({ error: "Gagal menghapus riwayat" }, { status: 500 });
  }
}
