import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

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

    let dbUser: { status: string; sessionId: string | null; name: string; role: string; lastActive: Date | null } | null = null;
    try {
      dbUser = await prisma.user.findUnique({
        where: { id: session.userId },
        select: { status: true, sessionId: true, name: true, role: true, lastActive: true }
      });
    } catch (dbErr) {
      // Jangan tendang user ke /login -> /spv-gateway hanya karena DB/pooler sedang sibuk!
      console.warn("[AUTH ME] Transient DB warning, using verified JWT fallback:", dbErr);
      return NextResponse.json({
        user: {
          ...session,
          status: "ACTIVE",
          name: session.name,
          role: session.role,
          jobTitle: session.jobTitle,
          transientFallback: true,
        }
      });
    }

    if (!dbUser) {
      return NextResponse.json({ user: null, reason: "unauthenticated" });
    }

    // ATURAN KETAT 1 AKUN = 1 DEVICE untuk SEMUA user (termasuk SUPERVISOR & Developer 22054178)
    // Jika sesi di DB sudah dihapus (Logout All Device / Paksa Logout) atau tidak cocok dengan JWT -> tendang keluar.
    if (!dbUser.sessionId || dbUser.status === "OFFLINE" || dbUser.sessionId !== session.sessionId) {
      const reason = !dbUser.sessionId || dbUser.status === "OFFLINE" ? "logged_out_all" : "device_switched";
      console.log("[AUTH ME] Session invalidated! DB:", dbUser.sessionId, "Status:", dbUser.status, "JWT:", session.sessionId);
      const response = NextResponse.json({ user: null, kickedOut: true, reason });
      response.cookies.set("token", "", { maxAge: 0, path: "/" });
      response.cookies.set("sessionId", "", { maxAge: 0, path: "/" });
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
