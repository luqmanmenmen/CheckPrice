import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'ID is required' }, { status: 400 });
    }

    await prisma.poSuggestion.update({
      where: { id },
      data: { status: 'CLOSED' }
    });

    return NextResponse.json({
      success: true,
      message: 'Saran PO berhasil ditutup.'
    });

  } catch (error) {
    console.error('Error closing PO suggestion:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
