/**
 * API Route: POST /api/admin/trigger/github-dispatch
 * Pusat Kendali 3 Kategori Mesin Python di GitHub Actions (0% Komputasi Vercel):
 * 1. KATEGORI 1 — SCRAB (`scrab` / `mds-bisa` / `photos`)
 * 2. KATEGORI 2 — UPDATE STOCK LIVE (`stock-only` via Jalur Mapping 84.763 SKU)
 * 3. KATEGORI 3 — UPDATE PROMO EMAIL (`promo` via Python Promo Parser)
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import { dispatchToGitHubRunner, SyncActionType } from '@/lib/githubDispatcher';

export async function POST(req: Request) {
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
    const isSuperOrDev = user.role === 'SUPERVISOR' || user.nik === '22054178';
    if (!isSuperOrDev) {
      return NextResponse.json({ success: false, error: 'Forbidden - Khusus Supervisor / Developer' }, { status: 403 });
    }
  } else {
    user = await prisma.user.findFirst({ where: { role: 'SUPERVISOR' } });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const rawAction = String(body.action || 'all').trim() as SyncActionType;
    const validActions: SyncActionType[] = ['scrab', 'mds-bisa', 'photos', 'stock-only', 'promo', 'all'];
    const action: SyncActionType = validActions.includes(rawAction) ? rawAction : 'all';

    const result = await dispatchToGitHubRunner({
      action,
      force: body.force !== false,
      promoUrl: body.promo_url || body.explicitUrl || '',
      sessionCookie: body.session_cookie || '',
      userId: user?.id || null,
    });

    return NextResponse.json(result.payload, { status: result.status });
  } catch (err: any) {
    console.error('[GITHUB-DISPATCH] Error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
