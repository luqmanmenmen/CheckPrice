import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    if (!token) {
      console.log("[AUTH ME] No token found in cookies!");
      return NextResponse.json({ user: null, reason: "unauthenticated" });
    }
    
    const session = await verifyToken(token);
    if (!session) {
      console.log("[AUTH ME] verifyToken returned null! Token might be invalid.");
      return NextResponse.json({ user: null, reason: "unauthenticated" });
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { status: true, sessionId: true, name: true, role: true, lastActive: true }
    });

    if (!dbUser) {
      return NextResponse.json({ user: null, reason: "unauthenticated" });
    }

    // Khusus Developer (22054178) atau SUPERVISOR: izinkan akses multi-device (HP & Laptop bersamaan) tanpa kick/wipe session
    const isSuperOrDev = dbUser.role === "SUPERVISOR" || session.nik === "22054178";
    if (!isSuperOrDev && dbUser.sessionId != session.sessionId) {
      console.log("[AUTH ME] Session ID mismatch! DB:", dbUser.sessionId, "JWT:", session.sessionId);
      const response = NextResponse.json({ user: null, kickedOut: true, reason: "device_switched" });
      response.cookies.set("token", "", { maxAge: 0, path: "/" });
      return response;
    }

    // Perbarui lastActive jika sudah lebih dari 60 detik yang lalu (throttled agar hemat database)
    const now = new Date();
    if (!dbUser.lastActive || now.getTime() - new Date(dbUser.lastActive).getTime() > 60000) {
      prisma.user.update({
        where: { id: session.userId },
        data: { lastActive: now }
      }).catch((err) => console.error("[AUTH ME] Gagal update lastActive:", err));
    }

    return NextResponse.json({ 
      user: { 
        ...session, 
        status: dbUser?.status || "ACTIVE",
        name: dbUser?.name || session.name,
        role: dbUser?.role || session.role,
        jobTitle: session.jobTitle
      } 
    });
  } catch (error) {
    console.error("[AUTH ME] Error:", error);
    return NextResponse.json({ user: null });
  }
}
