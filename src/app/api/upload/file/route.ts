import { NextResponse } from 'next/server';
import { writeTursoStorage, getTursoPublicUrl } from '@/lib/tursoStorage';

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const folder = formData.get('folder') as string || 'Lainnya';

    if (!file) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const filePath = `${folder}/${file.name}`;

    await writeTursoStorage(
      filePath,
      buffer,
      file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );

    const publicUrl = getTursoPublicUrl(filePath);

    return NextResponse.json({
      url: publicUrl,
      pathname: filePath
    });
  } catch (error: any) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: error.message || 'Failed to upload to storage' }, { status: 500 });
  }
}
