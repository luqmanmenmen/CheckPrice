import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const revalidate = 300; // Cache for 5 minutes

export async function GET() {
  try {
    const lastUpdatedProduct = await prisma.product.findFirst({
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true }
    });

    return NextResponse.json({
      lastUpdate: lastUpdatedProduct ? lastUpdatedProduct.updatedAt : null
    });
  } catch (error) {
    console.error('Error fetching last update:', error);
    return NextResponse.json({ lastUpdate: null }, { status: 500 });
  }
}
