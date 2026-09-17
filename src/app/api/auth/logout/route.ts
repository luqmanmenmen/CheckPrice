import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    if (token) {
      const session = await verifyToken(token);
      if (session) {
        // Find active shift and end it
        const activeShift = await prisma.shift.findFirst({
          where: { userId: session.userId, endTime: null }
        });
        
        if (activeShift) {
          await prisma.shift.update({
            where: { id: activeShift.id },
            data: { endTime: new Date() }
          });
        }
      }
    }

    const response = NextResponse.json({ success: true });
    response.cookies.set("token", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/"
    });

    return response;
  } catch (error) {
    console.error("Logout error:", error);
    const response = NextResponse.json({ error: "Terjadi kesalahan" }, { status: 500 });
    response.cookies.set("token", "", { maxAge: 0, path: "/" });
    return response;
  }
}
