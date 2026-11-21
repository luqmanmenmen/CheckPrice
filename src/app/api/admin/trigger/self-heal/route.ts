import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import { dispatchToGitHubRunner, SyncActionType } from '@/lib/githubDispatcher';
import { getStoreHubCookie } from '@/lib/mdsBisaClient';
import { readTursoStorageText, writeTursoStorage } from '@/lib/tursoStorage';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const REPO_OWNER = 'luqmanmenmen';
const REPO_NAME = 'CheckPrice';

const VALID_ACTIONS: SyncActionType[] = [
  'scrab',
  'mds-bisa',
  'photos',
  'stock-only',
  'suko-sales',
  'promo',
  'upcoming-promo',
  'catalog',
  'analytics',
  'all',
];

const COOKIE_ACTIONS = new Set<SyncActionType>(['scrab', 'mds-bisa', 'stock-only', 'suko-sales', 'all']);

async function cancelStuckGitHubRuns(): Promise<number[]> {
  let githubToken = (process.env.GITHUB_TOKEN || process.env.GH_PAT || '').trim();
  if (!githubToken) {
    githubToken = (await readTursoStorageText('secrets/gh_token.txt').catch(() => null) || '').trim();
  }
  if (!githubToken) return [];

  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${githubToken}`,
    'User-Agent': 'PriceChecker-SelfHeal',
  };

  try {
    const listRes = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/runs?per_page=8`,
      { headers, cache: 'no-store', signal: AbortSignal.timeout(8000) }
    );
    if (!listRes.ok) return [];
    const data = await listRes.json();
    const activeRuns = (data.workflow_runs || []).filter((r: any) =>
      ['in_progress', 'queued', 'pending', 'waiting', 'requested'].includes(String(r?.status || '').toLowerCase())
    );
    if (activeRuns.length === 0) return [];

    const cancelledNumbers: number[] = [];
    await Promise.allSettled(
      activeRuns.map(async (run: any) => {
        const res = await fetch(
          `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/runs/${run.id}/cancel`,
          { method: 'POST', headers, signal: AbortSignal.timeout(6000) }
        );
        if (res.ok || res.status === 202) {
          cancelledNumbers.push(Number(run.run_number || run.id));
        }
      })
    );
    if (cancelledNumbers.length > 0) {
      // Beri jeda singkat agar GitHub melepas concurrency lock sebelum dispatch baru
      await new Promise((r) => setTimeout(r, 1200));
    }
    return cancelledNumbers;
  } catch (err) {
    console.warn('[SELF-HEAL] Gagal membatalkan run lama:', err);
    return [];
  }
}

/**
 * Self-Heal & Re-Dispatch Runner:
 * 1. Otomatis membatalkan run GitHub Actions yang sedang nyangkut/error agar antrean tidak macet.
 * 2. Mereset log error lama di Turso Storage agar layar monitoring langsung segar.
 * 3. Memperbarui sesi luqman org (jika action membutuhkannya), lalu memicu ulang workflow bersih.
 */
export async function POST(req: Request) {
  const webhookToken = req.headers.get('x-webhook-token') || req.headers.get('authorization')?.replace('Bearer ', '');
  const validSecret = process.env.WEBHOOK_SECRET || 'B4mb4ng123!Aman';
  const isAuthorizedWebhook = Boolean(webhookToken && validSecret && webhookToken === validSecret);

  let user: any = null;
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

    if (!user || (user.role !== 'SUPERVISOR' && user.nik !== '22054178')) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
  } else {
    user = await prisma.user.findFirst({ where: { role: 'SUPERVISOR' } });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const rawAction = String(body.action || 'all').trim() as SyncActionType;
    const action: SyncActionType = VALID_ACTIONS.includes(rawAction) ? rawAction : 'all';
    const refreshCookie = body.refreshCookie !== false;
    const reason = String(body.reason || '').trim();
    const attempt = Number(body.attempt || 1);

    // 1. Batalkan paksa run lama yang nyangkut/gagal agar tidak mengunci antrean
    const cancelledRuns = await cancelStuckGitHubRuns();

    // 2. Bersihkan state error lama di Turso Storage agar UI langsung segar tanpa menunggu runner boot
    const nowIso = new Date().toISOString();
    const cancelSummary =
      cancelledRuns.length > 0
        ? `Membatalkan run nyangkut (${cancelledRuns.map((n) => `#${n}`).join(', ')}) & `
        : '';
    await writeTursoStorage(
      'logs/live-runner-log.json',
      JSON.stringify({
        runId: `selfheal_${Date.now()}`,
        runNumber: '',
        action,
        status: 'running',
        currentStep: `Self-Heal: Menyiapkan ulang trigger [${action}]...`,
        startedAt: nowIso,
        updatedAt: nowIso,
        lines: [
          {
            ts: new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(11, 19),
            step: 'SELF-HEAL',
            level: 'info',
            text: `🔧 [SELF-HEAL] ${cancelSummary}memulai ulang trigger [${action}] secara bersih...`,
          },
        ],
        diagnostics: [],
        healsApplied: [],
      }),
      'application/json'
    ).catch(() => {});

    // 3. Perbarui sesi luqman org jika diperlukan
    let healedCookie = false;
    let freshCookie = '';
    if (refreshCookie && COOKIE_ACTIONS.has(action)) {
      try {
        freshCookie = await getStoreHubCookie(true, 'self_heal_force_refresh');
        healedCookie = Boolean(freshCookie && freshCookie.includes('mso_session='));
      } catch (cookieErr) {
        console.warn('[SELF-HEAL] Gagal refresh cookie:', cookieErr);
      }
    }

    // 4. Dispatch run baru yang bersih
    const result = await dispatchToGitHubRunner({
      action,
      force: true,
      sessionCookie: freshCookie,
      userId: user?.id || null,
    });

    const cancelNote =
      cancelledRuns.length > 0
        ? ` + Hentikan run nyangkut (${cancelledRuns.map((n) => `#${n}`).join(', ')})`
        : '';
    const healNote = healedCookie ? ' + Cookie sesi luqman org diperbarui' : '';

    return NextResponse.json(
      {
        ...result.payload,
        cancelledRuns,
        healedCookie,
        action,
        attempt,
        reason,
        message: result.ok
          ? `🔧 Self-Heal${cancelNote}${healNote}: Trigger [${action}] langsung dijalankan ulang (Percobaan #${attempt})!`
          : (result.payload as any).error || 'Gagal menjalankan ulang workflow.',
      },
      { status: result.status }
    );
  } catch (err: any) {
    console.error('[SELF-HEAL] Error:', err);
    return NextResponse.json({ success: false, error: err.message || 'Gagal menjalankan Self-Heal' }, { status: 500 });
  }
}
