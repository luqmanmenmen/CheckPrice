/**
 * API Route: POST /api/admin/trigger/github-dispatch
 * Memicu eksekusi GitHub Actions Workflow (retail-sync-engine.yml)
 * Menggunakan GitHub REST API: workflow_dispatch
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';

const REPO_OWNER = 'luqmanmenmen';
const REPO_NAME = 'CheckPrice';
const WORKFLOW_ID = 'retail-sync-engine.yml';

export async function POST(req: Request) {
  // Verifikasi Supervisor atau Webhook Token Otomatis (GAS)
  const webhookToken = req.headers.get('x-webhook-token') || req.headers.get('authorization')?.replace('Bearer ', '');
  const validSecret = process.env.WEBHOOK_SECRET || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
  const isAuthorizedWebhook = Boolean(webhookToken && validSecret && webhookToken === validSecret);

  let user = null;
  if (!isAuthorizedWebhook) {
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;
    const legacySessionId = cookieStore.get('sessionId')?.value;

    if (token) {
      const session = await verifyToken(token);
      if (session?.userId) {
        user = await prisma.user.findUnique({ where: { id: session.userId } });
      }
    } else if (legacySessionId) {
      user = await prisma.user.findFirst({ where: { sessionId: legacySessionId, status: 'ACTIVE' } });
    }

    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized - Silakan login kembali' }, { status: 401 });
    if (user.role !== 'SUPERVISOR') {
      return NextResponse.json({ success: false, error: 'Forbidden - Khusus Supervisor' }, { status: 403 });
    }
  } else {
    // Ambil default akun supervisor untuk log history
    user = await prisma.user.findFirst({ where: { role: 'SUPERVISOR' } });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || 'all'; // 'all' | 'mds-bisa' | 'photos'
    const force = body.force === true;

    let githubToken = process.env.GITHUB_TOKEN || process.env.GH_PAT;

    // Fallback: Ambil token dari Supabase Storage yang aman jika belum di-set di Vercel
    if (!githubToken) {
      try {
        const { supabase } = await import('@/lib/supabaseClient');
        const { data, error } = await supabase.storage.from('excel-uploads').download('secrets/gh_token.txt');
        if (data && !error) {
          githubToken = (await data.text()).trim();
        }
      } catch (e) {
        console.warn('[GITHUB-DISPATCH] Gagal membaca fallback token dari Storage:', e);
      }
    }

    if (!githubToken) {
      return NextResponse.json({
        success: false,
        error: 'GITHUB_TOKEN belum dikonfigurasi di Environment Variable (Vercel).',
        manualUrl: `https://github.com/${REPO_OWNER}/${REPO_NAME}/actions/workflows/${WORKFLOW_ID}`,
        help: 'Anda dapat menjalankan sync langsung dari tab Actions di GitHub atau tambahkan GITHUB_TOKEN di Vercel Settings.',
      }, { status: 400 });
    }

    const dispatchUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/${WORKFLOW_ID}/dispatches`;

    const ghRes = await fetch(dispatchUrl, {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `Bearer ${githubToken}`,
        'User-Agent': 'PriceChecker-Supervisor-Engine',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ref: 'main',
        inputs: {
          action,
          force: String(force),
        },
      }),
    });

    if (!ghRes.ok) {
      const errText = await ghRes.text();
      return NextResponse.json({
        success: false,
        error: `GitHub API menolak request (${ghRes.status}): ${errText}`,
      }, { status: ghRes.status });
    }

    // Catat ke SyncHistory bahwa workflow sudah dipicu jika ada user ID
    if (user?.id) {
      await prisma.syncHistory.create({
        data: {
          userId: user.id,
          type: action === 'photos' ? 'PHOTO_SYNC_TRIGGER' : (action === 'promo' ? 'PROMO_SYNC_TRIGGER' : 'MDS_BISA_SYNC_TRIGGER'),
          fileName: `github-actions-${action}-${new Date().toISOString().slice(0, 10)}`,
          status: 'SUCCESS',
          records: 0,
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: `Mesin GitHub Actions (${action.toUpperCase()}) berhasil dinyalakan di cloud!`,
      actionsUrl: `https://github.com/${REPO_OWNER}/${REPO_NAME}/actions`,
    });

  } catch (err: any) {
    console.error('[GITHUB-DISPATCH] Error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

