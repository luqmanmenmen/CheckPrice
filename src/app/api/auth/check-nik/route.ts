import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const nik = searchParams.get("nik");

    if (!nik || nik.length < 6) {
      return NextResponse.json({ error: "Invalid NIK" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { nik },
      // @ts-ignore - IDE cache workaround
      select: { toko: true, name: true }
    });

    if (!user) {
      return NextResponse.json({ error: "NIK tidak terdaftar" }, { status: 404 });
    }

    // @ts-ignore
    return NextResponse.json({ success: true, toko: user.toko, name: user.name });
  } catch (error) {
    console.error("Check NIK error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
