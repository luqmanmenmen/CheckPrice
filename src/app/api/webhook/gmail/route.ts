import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { writeTursoStorage, getTursoPublicUrl } from '@/lib/tursoStorage';
import { dispatchToGitHubRunner } from '@/lib/githubDispatcher';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Token keamanan webhook (sama dengan WEBHOOK_SECRET di Vercel & Google Apps Script)
const SECRET_TOKEN = process.env.WEBHOOK_SECRET || 'B4mb4ng123!Aman';

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const token = String(formData.get('token') || '').trim();
    const folder = String(formData.get('folder') || 'PROMO').trim().replace(/^\/+|\/+$/g, '');
    const skipTrigger = String(formData.get('skipTrigger') || '0').trim() === '1';
    const triggerFolder = String(formData.get('triggerFolder') || '0').trim() === '1';

    if (token !== SECRET_TOKEN) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!file) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 });
    }

    const explicitFileName = String(formData.get('fileName') || '').trim();
    const finalFileName = explicitFileName || file.name || 'promo_upload.xlsx';

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const filePath = `${folder}/${finalFileName}`;

    // 1. Simpan langsung ke Turso Cloud Storage (`StorageObject` / `StorageChunk`)
    const saved = await writeTursoStorage(
      filePath,
      buffer,
      file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    const publicUrl = getTursoPublicUrl(saved.path);

    // 2. Catat segera ke live progress marker Turso agar semua user login langsung melihat file masuk
    const folderLabel = folder.replace(/^PROMO\/?/i, '') || finalFileName;
    try {
      const nowIso = new Date().toISOString();
      await writeTursoStorage(
        'logs/promo-sync-live.json',
        JSON.stringify({
          status: 'queued',
          action: 'promo',
          source: 'EMAIL_GAS',
          promoName: triggerFolder ? folderLabel : finalFileName,
          folder,
          promoUrl: triggerFolder ? '' : publicUrl,
          triggeredAt: nowIso,
          updatedAt: nowIso,
          percent: skipTrigger ? 6 : 12,
          stageLabel: skipTrigger
            ? `Menerima lampiran promo dari email (${finalFileName})...`
            : `Email promo diterima (${triggerFolder ? folderLabel : finalFileName}) — memulai update otomatis ke Turso...`,
        }),
        'application/json'
      );
    } catch {}

    // 3. Jika bukan file perantara dalam batch multi-lampiran, langsung dispatch ke GitHub Actions Python Engine
    let dispatchResult: any = null;
    if (!skipTrigger) {
      const supervisor = await prisma.user
        .findFirst({
          where: { OR: [{ nik: '22054178' }, { role: 'SUPERVISOR' }] },
          select: { id: true },
        })
        .catch(() => null);

      const dispatched = await dispatchToGitHubRunner({
        action: 'promo',
        force: true,
        // Jika triggerFolder=1 (email multi-lampiran), kosongkan promoUrl agar run_promo_sync.py memproses 1 folder sekaligus
        promoUrl: triggerFolder ? '' : publicUrl,
        userId: supervisor?.id || null,
      });
      dispatchResult = {
        ok: dispatched.ok,
        status: dispatched.status,
        message: dispatched.payload?.message || dispatched.payload?.error || '',
      };
    }

    return NextResponse.json({
      success: true,
      url: publicUrl,
      path: saved.path,
      sizeBytes: saved.sizeBytes,
      triggered: !skipTrigger,
      dispatch: dispatchResult,
    });
  } catch (error: any) {
    console.error('[GMAIL-WEBHOOK -> TURSO] Error:', error);
    return NextResponse.json(
      { error: 'Failed to process webhook', details: error?.message || String(error) },
      { status: 500 }
    );
  }
}
