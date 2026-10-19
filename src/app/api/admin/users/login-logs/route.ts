import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    
    const session = await verifyToken(token);
    if (!session || session.role !== "SUPERVISOR") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const nik = searchParams.get("nik");
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const skip = (page - 1) * limit;

    const where: any = {};
    if (userId) where.userId = userId;
    if (nik) where.nik = nik;

    const [total, logs] = await Promise.all([
      prisma.loginLog.count({ where }),
      prisma.loginLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip,
        select: {
          id: true,
          userId: true,
          nik: true,
          name: true,
          role: true,
          shift: true,
          jobTitle: true,
          toko: true,
          ipAddress: true,
          userAgent: true,
          createdAt: true
        }
      })
    ]);

    return NextResponse.json({
      success: true,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      logs
    });
  } catch (error) {
    console.error("Fetch login logs error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
