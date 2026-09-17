import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

// Use a single Prisma instance to avoid connection pool issues
let prisma: PrismaClient;

function getPrisma(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ identifier: string }> }
) {
  try {
    const { identifier } = await params;
    const db = getPrisma();

    // Trim and clean the identifier
    const cleaned = identifier.trim();

    // 1. Find by SKU (exact match — SKU is primary key in this system)
    let product = await db.product.findFirst({
      where: { sku: cleaned },
    });

    // 2. Try barcode if SKU not found
    if (!product && cleaned) {
      product = await db.product.findFirst({
        where: { barcode: cleaned },
      });
    }

    // 3. Try article code (exact match)
    if (!product && cleaned) {
      product = await db.product.findFirst({
        where: { article: cleaned },
      });
    }

    if (!product) {
      // Get total count for debugging
      const total = await db.product.count();
      return NextResponse.json(
        {
          error: `Produk tidak ditemukan untuk: "${cleaned}"`,
          hint: `Total produk di database: ${total}. Pastikan SKU sudah benar.`,
        },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: product });
  } catch (error) {
    console.error("Error fetching product:", error);
    return NextResponse.json(
      { error: "Terjadi kesalahan internal: " + String(error) },
      { status: 500 }
    );
  }
}
