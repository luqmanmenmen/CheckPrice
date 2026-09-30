import { put } from '@vercel/blob';
import { NextResponse } from 'next/server';

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const folder = formData.get('folder') as String || 'Lainnya';

    if (!file) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 });
    }

    const blob = await put(`${folder}/${file.name}`, file, {
      access: 'public',
    });

    return NextResponse.json(blob);
  } catch (error) {
    console.error("Vercel Blob upload error:", error);
    return NextResponse.json({ error: 'Failed to upload to blob' }, { status: 500 });
  }
}
