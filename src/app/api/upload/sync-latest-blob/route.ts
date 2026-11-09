/**
 * API Route: POST /api/upload/sync-latest-blob
 * DIREKONSTRUKSI TOTAL: 100% Dijalankan di GitHub Actions Python Engine (BUKAN DI VERCEL!)
 * Ketika Google Apps Script (GAS) menerima email Promo baru dan mengunggah ke Supabase Storage,
 * endpoint ini langsung meneruskan sinyal ke `python-engine/run_promo_sync.py` di GitHub Actions
 * tanpa membedah file Excel di dalam Vercel Serverless Function.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { dispatchToGitHubRunner } from '@/lib/githubDispatcher';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const explicitUrl = String(body.explicitUrl || body.promo_url || '').trim();

    const supervisor = await prisma.user.findFirst({
      where: { OR: [{ nik: '22054178' }, { role: 'SUPERVISOR' }] },
      select: { id: true },
    });

    const result = await dispatchToGitHubRunner({
      action: 'promo',
      force: true,
      promoUrl: explicitUrl.includes(',') ? '' : explicitUrl,
      userId: supervisor?.id || null,
    });

    return NextResponse.json(result.payload, { status: result.status });
  } catch (error: any) {
    console.error('[SYNC-LATEST-BLOB -> GITHUB] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
