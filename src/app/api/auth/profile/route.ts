import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    
    const session = await verifyToken(token);
    if (!session) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

    const { oldPin, newPin } = await req.json();

    if (!oldPin || !newPin) {
      return NextResponse.json({ error: "PIN Lama dan PIN Baru wajib diisi" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId }
    });

    if (!user) {
      return NextResponse.json({ error: "Pengguna tidak ditemukan" }, { status: 404 });
    }

    if (user.pin !== oldPin) {
      return NextResponse.json({ error: "PIN Lama salah" }, { status: 400 });
    }

    if (newPin.length < 4) {
      return NextResponse.json({ error: "PIN Baru minimal 4 karakter" }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: session.userId },
      data: { pin: newPin }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Change PIN error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
