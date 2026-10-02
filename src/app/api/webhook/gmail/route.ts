import { put } from '@vercel/blob';
import { NextResponse } from 'next/server';

// Ganti secret token ini atau letakkan di .env sebagai WEBHOOK_SECRET
const SECRET_TOKEN = process.env.WEBHOOK_SECRET || "B4mb4ng123!Aman";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const token = formData.get('token') as string;
    const folder = "PQ"; // Otomatis simpan ke folder PQ

    // Validasi token keamanan
    if (token !== SECRET_TOKEN) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!file) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 });
    }

    console.log("Menerima file dari Webhook Gmail:", file.name);

    // Langsung unggah ke Vercel Blob di dalam folder PQ
    const blob = await put(`${folder}/${file.name}`, file, {
      access: 'public',
      addRandomSuffix: false // Pertahankan nama aslinya
    });

    console.log("Berhasil unggah ke Vercel Blob:", blob.url);

    return NextResponse.json({ success: true, url: blob.url });
  } catch (error) {
    console.error("Gmail Webhook error:", error);
    return NextResponse.json({ error: 'Failed to process webhook' }, { status: 500 });
  }
}
