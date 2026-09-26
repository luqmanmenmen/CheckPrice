import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    
    const session = await verifyToken(token);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { newPin } = await req.json();

    if (!newPin || newPin.length < 4) {
      return NextResponse.json({ error: "PIN baru minimal 4 angka" }, { status: 400 });
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
