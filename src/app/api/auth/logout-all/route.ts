import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

type LogoutAllScope = "self" | "user" | "all" | "developer_recovery";

function clearAuthCookies(res: NextResponse): NextResponse {
  const opts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 0,
    path: "/",
  };
  res.cookies.set("token", "", opts);
  res.cookies.set("sessionId", "", opts);
  return res;
}

async function recordAuditLog(params: {
  userId: string;
  nik: string;
  name: string;
  role: string;
  toko: string | null;
  actionLabel: string;
  ipAddress: string | null;
  userAgent: string | null;
}) {
  await prisma.loginLog
    .create({
      data: {
        userId: params.userId,
        nik: params.nik,
        name: params.name,
        role: params.role,
        shift: null,
        jobTitle: params.actionLabel,
        toko: params.toko,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      },
    })
    .catch((err) => console.error("[LOGOUT_ALL] Failed to save audit log:", err));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const scope = (body?.scope || "self") as LogoutAllScope;
    const targetUserId = typeof body?.targetUserId === "string" ? body.targetUserId.trim() : "";
    const nik = typeof body?.nik === "string" ? body.nik.trim() : "";
    const pin = typeof body?.pin === "string" ? body.pin.trim() : "";

    const ipAddress =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      null;
    const userAgent = req.headers.get("user-agent") || null;
    const now = new Date();

    // 1. Recovery darurat KHUSUS akun Developer (22054178) apabila terkunci saat perangkat lama hilang / cache terhapus
    if (scope === "developer_recovery") {
      if (nik !== "22054178") {
        return NextResponse.json(
          { error: "Fitur recovery ini hanya tersedia untuk akun Developer." },
          { status: 403 }
        );
      }
      if (!pin) {
        return NextResponse.json({ error: "PIN wajib diisi untuk verifikasi Developer." }, { status: 400 });
      }

      const devUser = await prisma.user.findUnique({ where: { nik: "22054178" } });
      if (!devUser || devUser.pin !== pin) {
        return NextResponse.json({ error: "PIN Developer tidak valid." }, { status: 401 });
      }

      await prisma.shift.updateMany({
        where: { userId: devUser.id, endTime: null },
        data: { endTime: now },
      });

      await prisma.user.update({
        where: { id: devUser.id },
        data: { sessionId: null, status: "OFFLINE" },
      });

      await recordAuditLog({
        userId: devUser.id,
        nik: devUser.nik,
        name: devUser.name,
        role: devUser.role,
        toko: devUser.toko,
        actionLabel: "Logout All Devices (Developer Recovery)",
        ipAddress,
        userAgent,
      });

      return clearAuthCookies(
        NextResponse.json({
          success: true,
          scope: "developer_recovery",
          message: "Semua sesi akun Developer berhasil di-logout. Silakan login kembali.",
        })
      );
    }

    // 2. Validasi JWT + sessionId aktif untuk scope self / user / all
    const token = req.cookies.get("token")?.value;
    if (!token) {
      return clearAuthCookies(
        NextResponse.json({ error: "Sesi Anda tidak valid atau sudah di-logout." }, { status: 401 })
      );
    }

    const session = await verifyToken(token);
    if (!session || !session.userId) {
      return clearAuthCookies(
        NextResponse.json({ error: "Sesi Anda tidak valid atau sudah kedaluwarsa." }, { status: 401 })
      );
    }

    const dbCaller = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, nik: true, name: true, role: true, toko: true, status: true, sessionId: true },
    });

    if (
      !dbCaller ||
      !dbCaller.sessionId ||
      dbCaller.status === "OFFLINE" ||
      dbCaller.sessionId !== session.sessionId
    ) {
      return clearAuthCookies(
        NextResponse.json({ error: "Sesi Anda tidak valid atau sudah di-logout." }, { status: 401 })
      );
    }

    const isSupervisorOrDev = dbCaller.role === "SUPERVISOR" || dbCaller.nik === "22054178";

    if (scope === "self") {
      await prisma.shift.updateMany({
        where: { userId: dbCaller.id, endTime: null },
        data: { endTime: now },
      });

      await prisma.user.update({
        where: { id: dbCaller.id },
        data: { sessionId: null, status: "OFFLINE" },
      });

      await recordAuditLog({
        userId: dbCaller.id,
        nik: dbCaller.nik,
        name: dbCaller.name,
        role: dbCaller.role,
        toko: dbCaller.toko,
        actionLabel: "Logout All Devices (Akun Sendiri)",
        ipAddress,
        userAgent,
      });

      return clearAuthCookies(
        NextResponse.json({
          success: true,
          scope: "self",
          loggedOutSelf: true,
        })
      );
    }

    if (scope === "user") {
      if (!isSupervisorOrDev) {
        return NextResponse.json(
          { error: "Hanya Supervisor atau Developer yang dapat memaksa logout akun lain." },
          { status: 403 }
        );
      }

      if (!targetUserId) {
        return NextResponse.json({ error: "targetUserId wajib diisi." }, { status: 400 });
      }

      const targetUser = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: { id: true, nik: true, name: true, role: true, toko: true },
      });

      if (!targetUser) {
        return NextResponse.json({ error: "Pengguna target tidak ditemukan." }, { status: 404 });
      }

      await prisma.shift.updateMany({
        where: { userId: targetUser.id, endTime: null },
        data: { endTime: now },
      });

      await prisma.user.update({
        where: { id: targetUser.id },
        data: { sessionId: null, status: "OFFLINE" },
      });

      await recordAuditLog({
        userId: targetUser.id,
        nik: targetUser.nik,
        name: targetUser.name,
        role: targetUser.role,
        toko: targetUser.toko,
        actionLabel: `Paksa Logout Sesi oleh ${dbCaller.name}`,
        ipAddress,
        userAgent,
      });

      const loggedOutSelf = targetUser.id === dbCaller.id;
      const response = NextResponse.json({
        success: true,
        scope: "user",
        targetName: targetUser.name,
        loggedOutSelf,
      });

      return loggedOutSelf ? clearAuthCookies(response) : response;
    }

    if (scope === "all") {
      if (!isSupervisorOrDev) {
        return NextResponse.json(
          { error: "Hanya Supervisor atau Developer yang dapat mengeksekusi Logout All Device." },
          { status: 403 }
        );
      }

      const closedShifts = await prisma.shift.updateMany({
        where: { endTime: null },
        data: { endTime: now },
      });

      // Tanpa pengecualian: seluruh user TERMASUK Developer (22054178) dan Supervisor wajib keluar
      const updatedUsers = await prisma.user.updateMany({
        data: { sessionId: null, status: "OFFLINE" },
      });

      await recordAuditLog({
        userId: dbCaller.id,
        nik: dbCaller.nik,
        name: dbCaller.name,
        role: dbCaller.role,
        toko: dbCaller.toko,
        actionLabel: "Logout All Devices (Semua Akun + Developer)",
        ipAddress,
        userAgent,
      });

      return clearAuthCookies(
        NextResponse.json({
          success: true,
          scope: "all",
          affectedUsers: updatedUsers.count,
          closedShifts: closedShifts.count,
          loggedOutSelf: true,
        })
      );
    }

    return NextResponse.json({ error: "Scope logout-all tidak dikenal." }, { status: 400 });
  } catch (error: any) {
    console.error("[LOGOUT_ALL] Error:", error);
    return NextResponse.json(
      { error: "Terjadi kesalahan saat memproses Logout All Device: " + (error?.message || String(error)) },
      { status: 500 }
    );
  }
}
