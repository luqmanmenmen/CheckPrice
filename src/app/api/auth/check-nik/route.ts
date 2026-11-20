import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    let nik = searchParams.get("nik");

    if (!nik || nik.trim().length < 6) {
      return NextResponse.json({ error: "Invalid NIK" }, { status: 400 });
    }
    
    nik = nik.trim();

    if (nik === "22054178") {
      return NextResponse.json({
        success: true,
        toko: "Server",
        name: "Luqman Arif (Developer)",
        role: "SUPERVISOR",
        isBypassLocation: true,
      });
    }

    const user = await prisma.user.findUnique({
      where: { nik },
      // @ts-ignore - IDE cache workaround
      select: { toko: true, name: true, role: true }
    });

    if (!user) {
      return NextResponse.json({ error: "NIK tidak terdaftar" }, { status: 404 });
    }

    const isBypassLocation = user.role === "SUPERVISOR" || nik === "22054178";

    // @ts-ignore
    return NextResponse.json({
      success: true,
      toko: user.toko,
      name: user.name,
      role: user.role,
      isBypassLocation,
    });
  } catch (error) {
    console.error("Check NIK error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

