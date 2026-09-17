import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    
    const session = await verifyToken(token);
    if (!session) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

    const activeShift = await prisma.shift.findFirst({
      where: { userId: session.userId, endTime: null }
    });

    if (!activeShift) {
      return NextResponse.json({ summary: null });
    }

    const tickets = await prisma.ticket.findMany({
      where: { shiftId: activeShift.id },
      orderBy: { createdAt: 'desc' }
    });

    const summary = {
      total: tickets.length,
      pending: tickets.filter(t => t.status === 'PENDING').length,
      completed: tickets.filter(t => t.status === 'COMPLETED').length,
      rejected: tickets.filter(t => t.status === 'OOS').length,
      recentTickets: tickets.slice(0, 5) // Send 5 most recent for preview
    };

    return NextResponse.json({ summary });
  } catch (error) {
    console.error("Summary error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
