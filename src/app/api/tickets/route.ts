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

    const isWarehouseUser = session.jobTitle === "Gudang Stock" || session.role === "SUPERVISOR";

    // Hitung awal hari ini dalam zona waktu WIB (UTC+7)
    const now = new Date();
    const wibNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const startOfTodayWib = new Date(Date.UTC(wibNow.getUTCFullYear(), wibNow.getUTCMonth(), wibNow.getUTCDate(), 0, 0, 0, 0));
    const startOfTodayUtc = new Date(startOfTodayWib.getTime() - 7 * 60 * 60 * 1000);

    // Auto-close tiket lama yang terbit sebelum hari ini agar tidak menumpuk dan rancu
    prisma.ticket.updateMany({
      where: {
        status: { in: ["PENDING", "READY"] },
        createdAt: { lt: startOfTodayUtc }
      },
      data: {
        status: "COMPLETED",
        reason: "Auto-close (Hari Kemarin / Shift Berakhir)"
      }
    }).catch(err => console.error("Auto-close old tickets error:", err));

    if (isWarehouseUser) {
      // Gudang HANYA melihat tiket aktif HARI INI dari shift SA yang masih aktif
      tickets = await prisma.ticket.findMany({
        where: {
          status: { in: ["PENDING", "READY"] },
          createdAt: { gte: startOfTodayUtc },
          shift: { endTime: null } // HANYA dari shift yang belum di-logout/selesai
        },
        include: {
          requester: { select: { name: true, nik: true } }
        },
        orderBy: {
          createdAt: "desc"
        }
      });
    } else {
      // SA melihat tiket miliknya hari ini
      tickets = await prisma.ticket.findMany({
        where: {
          requesterId: session.userId,
          status: { not: "COMPLETED" },
          createdAt: { gte: startOfTodayUtc }
        },
        include: {
          requester: { select: { name: true, nik: true } }
        },
        orderBy: {
          createdAt: "desc"
        }
      });
    }

    const skus = [...new Set(tickets.map((t: any) => t.sku))];
    const products = await prisma.product.findMany({
      where: { sku: { in: skus } },
      select: { sku: true, description: true, hargaNormal: true, color: true, size: true, imageUrl: true }
    });
    
    const productMap = Object.fromEntries(
      products.map(p => [p.sku, { 
        name: p.description, 
        hargaNormal: p.hargaNormal,
        color: p.color,
        productSize: p.size,
        imageUrl: p.imageUrl
      }])
    );

    const ticketsWithProduct = tickets.map((t: any) => ({
      ...t,
      productName: productMap[t.sku]?.name || "Produk Tidak Diketahui",
      hargaNormal: productMap[t.sku]?.hargaNormal || 0,
      color: productMap[t.sku]?.color || null,
      productSize: productMap[t.sku]?.productSize || null,
      imageUrl: productMap[t.sku]?.imageUrl || null
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

    // Handle batch update (Paralel / Bulk untuk kecepatan tinggi)
    if (body.updates && Array.isArray(body.updates)) {
      const isWarehouseUser = session.jobTitle === "Gudang Stock" || session.role === "SUPERVISOR";
      const validUpdates = body.updates.filter((u: any) => {
        if (!u.ticketId || !u.status) return false;
        if (isWarehouseUser && !["READY", "OOS"].includes(u.status)) return false;
        if (!isWarehouseUser && u.status !== "COMPLETED") return false;
        return true;
      });

      // Optimasi: update tiket status READY dalam 1 kali query bulk updateMany
      const readyIds = validUpdates.filter((u: any) => u.status === "READY").map((u: any) => u.ticketId);
      const otherUpdates = validUpdates.filter((u: any) => u.status !== "READY");

      const promises: Promise<any>[] = [];

      if (readyIds.length > 0) {
        promises.push(
          prisma.ticket.updateMany({
            where: { id: { in: readyIds } },
            data: { status: "READY" }
          })
        );
      }

      for (const update of otherUpdates) {
        promises.push(
          prisma.ticket.update({
            where: { id: update.ticketId },
            data: { status: update.status, reason: update.reason },
            select: { id: true, status: true }
          })
        );
      }

      await Promise.all(promises);
      return NextResponse.json({ success: true, count: validUpdates.length });
    }

    // Handle single update (Ultra fast)
    const { ticketId, status, reason } = body;

    if (!ticketId || !status) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const isWarehouseUser = session.jobTitle === "Gudang Stock" || session.role === "SUPERVISOR";

    // Role check: Only WAREHOUSE can set READY/OOS. SA can set COMPLETED.
    if (isWarehouseUser && !["READY", "OOS"].includes(status)) {
      return NextResponse.json({ error: "Forbidden status update for WAREHOUSE" }, { status: 403 });
    }

    if (!isWarehouseUser && status !== "COMPLETED") {
      return NextResponse.json({ error: "Forbidden status update for SA" }, { status: 403 });
    }

    const updatedTicket = await prisma.ticket.update({
      where: { id: ticketId },
      data: { status, reason },
      select: { id: true, status: true }
    });

    return NextResponse.json({ success: true, ticket: updatedTicket });
  } catch (error) {
    console.error("Update ticket error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// DELETE: Gudang / Supervisor dapat membersihkan semua tiket aktif dengan 1 klik
export async function DELETE(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    
    const session = await verifyToken(token);
    if (!session) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

    const isWarehouseUser = session.jobTitle === "Gudang Stock" || session.role === "SUPERVISOR";
    if (!isWarehouseUser) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const result = await prisma.ticket.updateMany({
      where: {
        status: { in: ["PENDING", "READY"] }
      },
      data: {
        status: "COMPLETED",
        reason: "Dibersihkan manual oleh Gudang"
      }
    });

    return NextResponse.json({ success: true, count: result.count, message: `Berhasil membersihkan ${result.count} tiket aktif.` });
  } catch (error) {
    console.error("Clear tickets error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
