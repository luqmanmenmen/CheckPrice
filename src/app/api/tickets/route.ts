import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    
    const session = await verifyToken(token);
    if (!session) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

    let tickets;

    if (session.role === "WAREHOUSE") {
      // Gudang sees all PENDING and READY tickets
      tickets = await prisma.ticket.findMany({
        where: {
          status: { in: ["PENDING", "READY"] }
        },
        include: {
          requester: { select: { name: true, nik: true } }
        },
        orderBy: {
          createdAt: "desc"
        }
      });
    } else {
      // SA sees their own active tickets
      tickets = await prisma.ticket.findMany({
        where: {
          requesterId: session.userId,
          status: { not: "COMPLETED" }
        },
        orderBy: {
          createdAt: "desc"
        }
      });
    }

    return NextResponse.json({ success: true, tickets });
  } catch (error) {
    console.error("Fetch tickets error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

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

export async function PATCH(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    
    const session = await verifyToken(token);
    if (!session) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

    const { ticketId, status, reason } = await req.json();

    if (!ticketId || !status) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Role check: Only WAREHOUSE can set READY/OOS. SA can set COMPLETED.
    if (session.role === "WAREHOUSE" && !["READY", "OOS"].includes(status)) {
      return NextResponse.json({ error: "Forbidden status update for WAREHOUSE" }, { status: 403 });
    }

    if (session.role === "SA" && status !== "COMPLETED") {
      return NextResponse.json({ error: "Forbidden status update for SA" }, { status: 403 });
    }

    const updatedTicket = await prisma.ticket.update({
      where: { id: ticketId },
      data: { status, reason }
    });

    return NextResponse.json({ success: true, ticket: updatedTicket });
  } catch (error) {
    console.error("Update ticket error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
