import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    
    const session = await verifyToken(token);
    if (!session) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

    const { status } = await req.json(); // "ACTIVE" or "BREAK"
    
    if (status !== "ACTIVE" && status !== "BREAK") {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const updatedUser = await prisma.user.update({
      where: { id: session.userId },
      data: { status }
    });

    return NextResponse.json({ success: true, status: updatedUser.status });
  } catch (error) {
    console.error("Status error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
