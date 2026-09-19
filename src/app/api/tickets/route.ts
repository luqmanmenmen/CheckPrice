import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

export const dynamic = 'force-dynamic';

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

    const skus = [...new Set(tickets.map((t: any) => t.sku))];
    const products = await prisma.product.findMany({
      where: { sku: { in: skus } },
      select: { sku: true, description: true, hargaNormal: true }
    });
    
    // Parse description to just get the name (before colon)
    const productMap = Object.fromEntries(
      products.map(p => [p.sku, { name: p.description.split(":")[0].trim(), hargaNormal: p.hargaNormal }])
    );

    const ticketsWithProduct = tickets.map((t: any) => ({
      ...t,
      productName: productMap[t.sku]?.name || "Produk Tidak Diketahui",
      hargaNormal: productMap[t.sku]?.hargaNormal || 0
    }));

    return NextResponse.json({ success: true, tickets: ticketsWithProduct });
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

    const { items, sku, size, qty, type, photoUrl, ocrData } = await req.json();

    // Get user's active shift
    const activeShift = await prisma.shift.findFirst({
      where: { userId: session.userId, endTime: null }
    });

    if (!activeShift) {
      return NextResponse.json({ error: "Anda belum memulai shift" }, { status: 400 });
    }

    if (items && Array.isArray(items)) {
      // Bulk insert
      const ticketsData = items.map(item => ({
        requesterId: session.userId,
        shiftId: activeShift.id,
        sku: item.sku,
        size: item.size || null,
        qty: item.qty ? parseInt(item.qty) : 1,
        type: item.type, // 'REQUEST' or 'STOCK_CHECK'
        priority: (item.type === 'REQUEST' ? 'HIGH' : 'LOW') as any,
        photoUrl: item.photoUrl || null,
        ocrData: item.ocrData || null,
      }));

      await prisma.ticket.createMany({
        data: ticketsData
      });

      return NextResponse.json({ success: true, message: `${ticketsData.length} tiket dikirim` });
    } else {
      // Single insert (backward compatibility)
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
    }
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

    const body = await req.json();

    // Handle batch update
    if (body.updates && Array.isArray(body.updates)) {
      const results = [];
      for (const update of body.updates) {
        if (!update.ticketId || !update.status) continue;
        
        if (session.role === "WAREHOUSE" && !["READY", "OOS"].includes(update.status)) continue;
        if (session.role === "SA" && update.status !== "COMPLETED") continue;
        
        const updatedTicket = await prisma.ticket.update({
          where: { id: update.ticketId },
          data: { status: update.status, reason: update.reason }
        });
        results.push(updatedTicket);
      }
      return NextResponse.json({ success: true, count: results.length });
    }

    // Handle single update (backward compatibility)
    const { ticketId, status, reason } = body;

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
