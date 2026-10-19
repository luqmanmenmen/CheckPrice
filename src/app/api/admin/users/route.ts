import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    
    const session = await verifyToken(token);
    if (!session || session.role !== "SUPERVISOR") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const rawUsers = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        nik: true,
        name: true,
        role: true,
        status: true,
        pin: true,
        toko: true,
        sessionId: true,
        loginCount: true,
        lastLogin: true,
        lastActive: true,
        createdAt: true,
        shifts: {
          where: { endTime: null },
          take: 1,
          select: { id: true, type: true, startTime: true }
        }
      }
    });

    const now = new Date();
    const jakartaStr = now.toLocaleString("en-US", { timeZone: "Asia/Jakarta", hour12: false });
    const hourMatch = jakartaStr.match(/ (24|\d+):/);
    let hour = hourMatch ? parseInt(hourMatch[1], 10) : now.getUTCHours() + 7;
    if (hour === 24) hour = 0;

    const users = await Promise.all(rawUsers.map(async (u: any) => {
      const activeShift = u.shifts?.[0];
      let shiftClosed = false;

      // Auto-close shift jika sudah kedaluwarsa
      if (activeShift) {
        let isExpired = false;
        const shiftAgeHours = (now.getTime() - new Date(activeShift.startTime).getTime()) / (1000 * 60 * 60);

        // Shift lebih dari 14 jam selalu expired (berlaku untuk semua role termasuk SUPERVISOR)
        if (shiftAgeHours > 14) {
          isExpired = true;
        } else if (u.role !== "SUPERVISOR" && activeShift.type) {
          if (activeShift.type === 1 && (hour >= 17 || hour < 8)) isExpired = true;
          if (activeShift.type === 2 && (hour >= 23 || hour < 14)) isExpired = true;
          if (shiftAgeHours > 10) isExpired = true;
        }

        if (isExpired) {
          shiftClosed = true;
          await prisma.shift.update({
            where: { id: activeShift.id },
            data: { endTime: new Date() }
          }).catch(console.error);
        }
      }

      // Hitung apakah user benar-benar aktif / online saat ini
      // Kriteria Online: memiliki sessionId DAN lastActive dalam 5 menit terakhir
      const lastActiveMs = u.lastActive ? now.getTime() - new Date(u.lastActive).getTime() : Infinity;
      const isRecentlyActive = lastActiveMs <= 5 * 60 * 1000; // 5 menit
      const isOnline = !!u.sessionId && isRecentlyActive;

      // Bersihkan session yang sudah ditinggalkan (idle > 12 jam atau shift kedaluwarsa)
      if (u.sessionId && (lastActiveMs > 12 * 60 * 60 * 1000 || (shiftClosed && lastActiveMs > 60 * 60 * 1000))) {
        await prisma.user.update({
          where: { id: u.id },
          data: { status: "OFFLINE", sessionId: null }
        }).catch(console.error);
        u.sessionId = null;
      }

      // Tentukan status nyata yang akurat
      let computedStatus: "ACTIVE" | "BREAK" | "OFFLINE" = "OFFLINE";
      if (isOnline) {
        computedStatus = u.status === "BREAK" ? "BREAK" : "ACTIVE";
      } else if (u.status === "BREAK" && lastActiveMs <= 30 * 60 * 1000) {
        computedStatus = "BREAK";
      } else {
        computedStatus = "OFFLINE";
      }

      return {
        ...u,
        status: computedStatus,
        isOnline,
        activeShift: shiftClosed ? null : activeShift || null
      };
    }));

    return NextResponse.json({ success: true, users });
  } catch (error) {
    console.error("Fetch users error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    
    const session = await verifyToken(token);
    if (!session || session.role !== "SUPERVISOR") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { nik, name, pin, toko, role } = await req.json();

    if (!nik || !name || !pin) {
      return NextResponse.json({ error: "NIK, Nama, dan PIN wajib diisi" }, { status: 400 });
    }

    // Check if user already exists
    const existing = await prisma.user.findUnique({ where: { nik } });
    if (existing) {
      return NextResponse.json({ error: "Karyawan dengan NIK tersebut sudah ada" }, { status: 400 });
    }

    const user = await prisma.user.create({
      data: {
        nik,
        name,
        pin,
        // @ts-ignore
        toko: toko || null,
        role: role || "CREW_STORE", // Default to SA (Sales Area)
      }
    });

    return NextResponse.json({ success: true, user });
  } catch (error) {
    console.error("Create user error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    
    const session = await verifyToken(token);
    if (!session || session.role !== "SUPERVISOR") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: "ID Karyawan wajib diisi" }, { status: 400 });
    }

    await prisma.user.delete({
      where: { id }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete user error:", error);
    return NextResponse.json({ error: "Gagal menghapus pengguna, mungkin memiliki data relasi (Shift/Tiket)" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    
    const session = await verifyToken(token);
    if (!session || session.role !== "SUPERVISOR") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id, name, pin, toko, role } = await req.json();

    if (!id || !name || !pin) {
      return NextResponse.json({ error: "ID, Nama, dan PIN wajib diisi" }, { status: 400 });
    }

    const user = await prisma.user.update({
      where: { id },
      data: {
        name,
        pin,
        // @ts-ignore
        toko: toko || null,
        role: role || "CREW_STORE",
      }
    });

    return NextResponse.json({ success: true, user });
  } catch (error) {
    console.error("Edit user error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
