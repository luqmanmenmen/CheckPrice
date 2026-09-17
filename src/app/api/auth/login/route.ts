import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { signToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const { nik, pin, shift } = await req.json();

    if (!nik || !pin) {
      return NextResponse.json({ error: "NIK dan PIN wajib diisi" }, { status: 400 });
    }

    // Auto-seed for testing (since we don't have registration yet)
    let user = await prisma.user.findUnique({ where: { nik } });
    if (!user) {
      // If NIK is W001 -> create Warehouse user
      // If NIK is S001 -> create SA user
      if (nik === "W001" && pin === "123456") {
        user = await prisma.user.create({ data: { nik: "W001", pin: "123456", name: "Budi Gudang", role: "WAREHOUSE" } });
      } else if (nik === "S001" && pin === "123456") {
        user = await prisma.user.create({ data: { nik: "S001", pin: "123456", name: "Siti Sales", role: "SA" } });
      } else {
        return NextResponse.json({ error: "Kredensial tidak valid" }, { status: 401 });
      }
    } else {
      if (user.pin !== pin) {
        return NextResponse.json({ error: "PIN salah" }, { status: 401 });
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
      nik: user.nik
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
