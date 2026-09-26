import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    if (!token) return NextResponse.json({ user: null });
    
    const session = await verifyToken(token);
    if (!session) return NextResponse.json({ user: null });

    const dbUser = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { status: true, sessionId: true }
    });

    if (dbUser?.sessionId !== session.sessionId) {
      const response = NextResponse.json({ user: null });
      response.cookies.set("token", "", { maxAge: 0, path: "/" });
      return response;
    }

    return NextResponse.json({ user: { ...session, status: dbUser?.status || "ACTIVE" } });
  } catch (error) {
    return NextResponse.json({ user: null });
  }
}
