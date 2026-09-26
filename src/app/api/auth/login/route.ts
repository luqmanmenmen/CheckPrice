import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { signToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const { nik, pin, shift, jobTitle } = await req.json();

    if (!nik || !pin || !jobTitle) {
      return NextResponse.json({ error: "NIK, PIN, dan Posisi wajib diisi" }, { status: 400 });
    }

    let role = "CREW_STORE";

    const sessionId = crypto.randomUUID();

    // Cek user
    let user = await prisma.user.findUnique({ where: { nik } });
    
    if (!user) {
      if (nik === "22054178" && pin === "220117") {
        // @ts-ignore
        user = await prisma.user.create({ data: { nik: "22054178", pin: "220117", name: "Luqman Arif (Super Admin)", role: "SUPERVISOR", toko: "Server", sessionId } });
      } else {
        return NextResponse.json({ error: "Akun tidak terdaftar. Silakan hubungi Super Admin." }, { status: 404 });
      }
    } else {
      if (user.pin !== pin) {
        return NextResponse.json({ error: "PIN salah" }, { status: 401 });
      }
      
      // Update role if changed (unless they are super admin) and update sessionId
      user = await prisma.user.update({
        where: { id: user.id },
        data: { 
          // @ts-ignore - Ignore stale prisma types in IDE
          ...(user.role !== "SUPERVISOR" && user.role !== role ? { role: role as any } : {}),
          // @ts-ignore
          sessionId
        }
      });
    }

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
