import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET() {
  try {
    const history = await prisma.syncHistory.findFirst({
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: { name: true, role: true }
        }
      }
    });
    
    return NextResponse.json({ success: true, data: history });
  } catch (error) {
    console.error("Error fetching sync history:", error);
    return NextResponse.json({ error: "Failed to fetch sync history" }, { status: 500 });
  }
}
