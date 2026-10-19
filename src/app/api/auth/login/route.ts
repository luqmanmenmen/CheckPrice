import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { signToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    let { nik, pin, shift, jobTitle, force } = await req.json();

    if (!nik || !pin || !jobTitle) {
      return NextResponse.json({ error: "NIK, PIN, dan Posisi wajib diisi" }, { status: 400 });
    }
    
    nik = nik.trim();
    pin = pin.trim();

    let role = "CREW_STORE";

    const sessionId = crypto.randomUUID();

    const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
    const userAgent = req.headers.get("user-agent") || null;
    const parsedShift = shift ? parseInt(shift, 10) : null;

    // Cek user
    let user = await prisma.user.findUnique({ where: { nik } });
    
    if (!user) {
      if (nik === "22054178" && pin === "220117") {
        user = await prisma.user.create({ 
          data: { 
            nik: "22054178", 
            pin: "220117", 
            name: "Luqman Arif (Developer)", 
            role: "SUPERVISOR", 
            toko: "Server", 
            sessionId,
            loginCount: 1,
            lastLogin: new Date(),
            lastActive: new Date()
          } 
        });
      } else {
        return NextResponse.json({ error: "Akun tidak terdaftar. Silakan hubungi Developer." }, { status: 404 });
      }
    } else {
      if (user.pin !== pin) {
        return NextResponse.json({ error: "PIN salah" }, { status: 401 });
      }
      
      // Jika user sudah punya sessionId dan force belum true, kembalikan status conflict (409)
      if (user.sessionId && !force) {
        return NextResponse.json({ 
          error: "Sesi Aktif Ditemukan", 
          isAlreadyLoggedIn: true 
        }, { status: 409 });
      }
      
      // Update role if changed (unless they are super admin) and update sessionId & login timestamps
      user = await prisma.user.update({
        where: { id: user.id },
        data: { 
          ...(user.role !== "SUPERVISOR" && user.role !== role ? { role: role as any } : {}),
          sessionId,
          status: "ACTIVE",
          lastLogin: new Date(),
          lastActive: new Date(),
          loginCount: { increment: 1 }
        }
      });
    }

    // Catat riwayat login ke tabel LoginLog
    await prisma.loginLog.create({
      data: {
        userId: user.id,
        nik: user.nik,
        name: user.name,
        role: user.role,
        shift: parsedShift,
        jobTitle: jobTitle || (user.role === "SUPERVISOR" ? "Supervisor" : "Sales Area"),
        toko: user.toko,
        ipAddress,
        userAgent
      }
    }).catch(err => console.error("Failed to save LoginLog:", err));

    // Create active shift if requested
    if (shift) {
      // Find if already has active shift (endTime is null)
      let activeShift = await prisma.shift.findFirst({
        where: { userId: user.id, endTime: null }
      });
      if (!activeShift) {
        activeShift = await prisma.shift.create({
          data: {
            userId: user.id,
            type: parseInt(shift, 10)
          }
        });
      }
    }

    // Create JWT
    const token = await signToken({
      userId: user.id,
      role: user.role,
      name: user.name,
      nik: user.nik,
      // @ts-ignore
      toko: user.toko,
      jobTitle,
      sessionId,
      shiftType: shift ? parseInt(shift, 10) : undefined
    });

    const response = NextResponse.json({ success: true, role: user.role });
    response.cookies.set("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 // 1 day
    });

    return response;
  } catch (error: any) {
    console.error("Login error:", error);
    return NextResponse.json({ error: "Internal Server Error: " + (error?.message || String(error)) }, { status: 500 });
  }
}

