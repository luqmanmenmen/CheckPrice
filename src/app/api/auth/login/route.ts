import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { signToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const { nik, pin, shift, jobTitle } = await req.json();

    if (!nik || !pin || !jobTitle) {
      return NextResponse.json({ error: "NIK, PIN, dan Posisi wajib diisi" }, { status: 400 });
    }

    let role = "SA";
    if (jobTitle === "Gudang Stock") role = "WAREHOUSE";

    // Auto-seed for testing
    let user = await prisma.user.findUnique({ where: { nik } });
    if (!user) {
      if (nik === "220117" && pin === "123456") {
        user = await prisma.user.create({ data: { nik: "220117", pin: "123456", name: "Super Admin", role: "SUPER_ADMIN" } });
      } else {
        // Create user with selected role and a default name
        user = await prisma.user.create({ data: { nik, pin, name: `Karyawan ${nik}`, role: role as any } });
      }
    } else {
      if (user.pin !== pin) {
        return NextResponse.json({ error: "PIN salah" }, { status: 401 });
      }
      
      // Update role if changed (unless they are super admin)
      if (user.role !== "SUPER_ADMIN" && user.role !== role) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { role: role as any }
        });
      }
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
      jobTitle: jobTitle
    });

    const response = NextResponse.json({ success: true, role: user.role });
    response.cookies.set("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 // 1 day
    });

    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
