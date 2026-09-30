import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET(req: NextRequest) {
  const nik = req.nextUrl.searchParams.get("nik");
  
  if (!nik) {
    return NextResponse.json({ error: "NIK is required" }, { status: 400 });
  }
  
  try {
    const user = await prisma.user.findUnique({
      where: { nik }
    });
    
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    
    return NextResponse.json({ 
      success: true, 
      name: user.name,
      toko: user.toko || "SUKO" 
    });
  } catch (err) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
