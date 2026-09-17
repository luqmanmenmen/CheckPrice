import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    
    const session = await verifyToken(token);
    if (!session) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

    const { sku, size, qty, type, photoUrl, ocrData } = await req.json();

    // Get user's active shift
    const activeShift = await prisma.shift.findFirst({
      where: { userId: session.userId, endTime: null }
    });

    if (!activeShift) {
      return NextResponse.json({ error: "Anda belum memulai shift" }, { status: 400 });
    }

    const ticket = await prisma.ticket.create({
      data: {
        requesterId: session.userId,
        shiftId: activeShift.id,
        sku,
        size,
        qty: qty ? parseInt(qty) : null,
        type, // 'REQUEST' or 'STOCK_CHECK'
        priority: type === 'REQUEST' ? 'HIGH' : 'LOW',
        photoUrl,
        ocrData
      }
    });

    return NextResponse.json({ success: true, ticket });
  } catch (error) {
    console.error("Ticket error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
