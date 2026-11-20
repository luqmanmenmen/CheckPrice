import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { signToken, verifyToken } from "@/lib/auth";
import {
  getJakartaHour,
  isWithinStoreOperatingHours,
  resolveAutoShiftType,
  verifyStoreGeofence,
} from "@/lib/storeGeofence";

export async function POST(req: NextRequest) {
  try {
    let { nik, pin, shift, jobTitle, location } = await req.json();

    if (!nik || !pin || !jobTitle) {
      return NextResponse.json({ error: "NIK, PIN, dan Posisi wajib diisi" }, { status: 400 });
    }
    
    nik = nik.trim();
    pin = pin.trim();

    let role = "CREW_STORE";

    const sessionId = crypto.randomUUID();

    const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
    const userAgent = req.headers.get("user-agent") || null;
    const hourWib = getJakartaHour();
    const parsedShift = shift ? parseInt(shift, 10) : resolveAutoShiftType(hourWib);
    let verifiedMallLabel = "";

    // Cek user
    let user = await prisma.user.findUnique({ where: { nik } });
    
    if (!user) {
      if (nik === "22054178" && pin === "220117") {
        user = await prisma.user.create({ 
          data: { 
            nik: "22054178", 
            pin: "220117", 
            name: "Luqman Arif (Developer)", 
            role: "SUPERVISOR", 
            toko: "Server", 
            sessionId,
            loginCount: 1,
            lastLogin: new Date(),
            lastActive: new Date()
          } 
        });
      } else {
        return NextResponse.json({ error: "Akun tidak terdaftar. Silakan hubungi Developer." }, { status: 404 });
      }
    } else {
      if (user.pin !== pin) {
        return NextResponse.json({ error: "PIN salah" }, { status: 401 });
      }

      // Verifikasi Geofencing GPS Lokasi Mall & Jam Operasional untuk CREW_STORE
      // Pengecualian mutlak: SUPERVISOR & Developer (22054178) bebas login dari mana saja & kapan saja.
      const isSuperOrDev = user.role === "SUPERVISOR" || user.nik === "22054178";
      if (!isSuperOrDev) {
        if (!isWithinStoreOperatingHours(hourWib)) {
          return NextResponse.json(
            {
              error: "Kamu sedang tidak bekerja",
              outsideWorkArea: true,
              reason: "outside_hours",
            },
            { status: 403 }
          );
        }

        const lat = typeof location?.lat === "number" ? location.lat : Number(location?.lat);
        const lng = typeof location?.lng === "number" ? location.lng : Number(location?.lng);
        const accuracy =
          location?.accuracy !== undefined && location?.accuracy !== null
            ? Number(location.accuracy)
            : null;

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          return NextResponse.json(
            {
              error: "Aktifkan izin lokasi (GPS) di HP Anda terlebih dahulu agar sistem dapat memverifikasi bahwa Anda sedang bekerja.",
              locationRequired: true,
            },
            { status: 403 }
          );
        }

        const geo = verifyStoreGeofence(lat, lng, accuracy);
        if (!geo || !geo.allowed) {
          return NextResponse.json(
            {
              error: "Kamu sedang tidak bekerja",
              outsideWorkArea: true,
              reason: "outside_geofence",
            },
            { status: 403 }
          );
        }

        verifiedMallLabel = geo.nearestZone.shortName;
      }

      // Cek apakah karyawan ini diarahkan ke Portal MDS BISA
      // @ts-ignore
      if (user.redirectMds && user.nik !== "22054178") {
        await prisma.loginLog.create({
          data: {
            userId: user.id,
            nik: user.nik,
            name: user.name,
            role: user.role,
            shift: parsedShift,
            jobTitle: jobTitle ? `${jobTitle} (Redirect by luqman org)` : "Redirect by luqman org",
            toko: user.toko,
            ipAddress,
            userAgent
          }
        }).catch(err => console.error("Failed to save LoginLog redirect:", err));

        return NextResponse.json({
          success: true,
          redirectMds: true,
          redirectUrl: "https://storehub.mdsretailing.id/login?next=%2F",
          message: "Mengarahkan ke Portal Login by luqman org..."
        });
      }
      
      // ATURAN KETAT 1 AKUN = 1 DEVICE (Berlaku untuk SEMUA role termasuk SUPERVISOR & Developer 22054178)
      // Tanpa bypass/force login: perangkat baru ditolak (HTTP 409) sampai perangkat lama logout / sesi kedaluwarsa.
      if (user.sessionId && user.status !== "OFFLINE") {
        const existingCookieToken = req.cookies.get("token")?.value;
        let isSameDevice = false;
        if (existingCookieToken) {
          const existingSession = await verifyToken(existingCookieToken);
          if (
            existingSession &&
            existingSession.userId === user.id &&
            existingSession.sessionId === user.sessionId
          ) {
            isSameDevice = true;
          }
        }

        const lastSeen = user.lastActive || user.lastLogin;
        const sessionAgeMs = lastSeen ? Date.now() - new Date(lastSeen).getTime() : Infinity;
        const isExpiredByAge = sessionAgeMs >= 24 * 60 * 60 * 1000;
        let isExpiredByShift = false;

        if (!isSuperOrDev && !isSameDevice && !isExpiredByAge) {
          const activeShift = await prisma.shift.findFirst({
            where: { userId: user.id, endTime: null },
            orderBy: { startTime: "desc" },
          });
          if (activeShift) {
            const now = new Date();
            const jakartaStr = now.toLocaleString("en-US", { timeZone: "Asia/Jakarta", hour12: false });
            const hourMatch = jakartaStr.match(/ (24|\d+):/);
            let hour = hourMatch ? parseInt(hourMatch[1], 10) : now.getUTCHours() + 7;
            if (hour === 24) hour = 0;

            const shiftAgeHours = (now.getTime() - new Date(activeShift.startTime).getTime()) / (1000 * 60 * 60);
            if (shiftAgeHours > 12 || !isWithinStoreOperatingHours(hour)) {
              await prisma.shift.updateMany({
                where: { userId: user.id, endTime: null },
                data: { endTime: now },
              });
              isExpiredByShift = true;
            }
          }
        }

        if (!isSameDevice && !isExpiredByAge && !isExpiredByShift) {
          return NextResponse.json(
            {
              error:
                "Akun ini masih aktif (login) di perangkat lain. Silakan logout terlebih dahulu di perangkat sebelumnya agar bisa login di perangkat ini (aturan 1 Akun = 1 Perangkat).",
              isAlreadyLoggedIn: true,
              strictLocked: true,
              lastActive: user.lastActive || user.lastLogin || null,
              canDeveloperLogoutAll: user.nik === "22054178",
            },
            { status: 409 }
          );
        }
      }
      
      // Update role if changed (unless they are super admin) and update sessionId & login timestamps
      user = await prisma.user.update({
        where: { id: user.id },
        data: { 
          ...(user.role !== "SUPERVISOR" && user.role !== role ? { role: role as any } : {}),
          sessionId,
          status: "ACTIVE",
          lastLogin: new Date(),
          lastActive: new Date(),
          loginCount: { increment: 1 }
        }
      });
    }

    // Catat riwayat login ke tabel LoginLog
    const loggedJobTitle = verifiedMallLabel
      ? `${jobTitle || "Sales Area"} (${verifiedMallLabel})`
      : jobTitle || (user.role === "SUPERVISOR" ? "Supervisor" : "Sales Area");

    await prisma.loginLog.create({
      data: {
        userId: user.id,
        nik: user.nik,
        name: user.name,
        role: user.role,
        shift: parsedShift,
        jobTitle: loggedJobTitle,
        toko: user.toko,
        ipAddress,
        userAgent
      }
    }).catch(err => console.error("Failed to save LoginLog:", err));

    // Create active shift otomatis (1 = Pagi / 2 = Siang mengikuti jam WIB)
    if (parsedShift) {
      let activeShift = await prisma.shift.findFirst({
        where: { userId: user.id, endTime: null }
      });
      if (!activeShift) {
        activeShift = await prisma.shift.create({
          data: {
            userId: user.id,
            type: parsedShift
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
      // @ts-ignore
      toko: user.toko,
      jobTitle,
      sessionId,
      shiftType: parsedShift
    });

    const response = NextResponse.json({ success: true, role: user.role });
    response.cookies.set("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24, // 1 day
      path: "/",
    });

    return response;
  } catch (error: any) {
    console.error("Login error:", error);
    return NextResponse.json({ error: "Internal Server Error: " + (error?.message || String(error)) }, { status: 500 });
  }
}

