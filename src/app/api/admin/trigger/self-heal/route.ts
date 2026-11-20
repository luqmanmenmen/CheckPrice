import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import { dispatchToGitHubRunner, SyncActionType } from '@/lib/githubDispatcher';
import { getStoreHubCookie } from '@/lib/mdsBisaClient';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const VALID_ACTIONS: SyncActionType[] = [
  'scrab',
  'mds-bisa',
  'photos',
  'stock-only',
  'promo',
  'upcoming-promo',
  'catalog',
  'analytics',
  'all',
];

const COOKIE_ACTIONS = new Set<SyncActionType>(['scrab', 'mds-bisa', 'stock-only', 'all']);

/**
 * Self-Heal & Re-Dispatch Runner:
 * Memperbarui sesi StoreHub MDS BISA (jika action membutuhkannya), lalu memicu ulang
 * workflow GitHub Actions secara otomatis hingga sukses.
 */
export async function POST(req: Request) {
  const webhookToken = req.headers.get('x-webhook-token') || req.headers.get('authorization')?.replace('Bearer ', '');
  const validSecret = process.env.WEBHOOK_SECRET || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
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

    let healedCookie = false;
    let freshCookie = '';
    if (refreshCookie && COOKIE_ACTIONS.has(action)) {
      try {
        freshCookie = await getStoreHubCookie(true, 'self_heal_force_refresh');
        healedCookie = Boolean(freshCookie && freshCookie.includes('mso_session='));
      } catch (cookieErr) {
        console.warn('[SELF-HEAL] Gagal refresh cookie StoreHub:', cookieErr);
      }
    }

    const result = await dispatchToGitHubRunner({
      action,
      force: true,
      sessionCookie: freshCookie,
      userId: user?.id || null,
    });

    const healNote = healedCookie ? ' + Cookie sesi luqman org diperbarui otomatis' : '';
    return NextResponse.json(
      {
        ...result.payload,
        healedCookie,
        action,
        attempt,
        reason,
        message: result.ok
          ? `🔧 Self-Heal${healNote}: Trigger [${action}] dijalankan ulang (Percobaan #${attempt})!`
          : (result.payload as any).error || 'Gagal menjalankan ulang workflow.',
      },
      { status: result.status }
    );
  } catch (err: any) {
    console.error('[SELF-HEAL] Error:', err);
    return NextResponse.json({ success: false, error: err.message || 'Gagal menjalankan Self-Heal' }, { status: 500 });
  }
}
