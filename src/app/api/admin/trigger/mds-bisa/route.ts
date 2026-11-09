/**
 * API Route: POST /api/admin/trigger/mds-bisa
 * DIREKONSTRUKSI TOTAL: 100% Dijalankan di GitHub Actions Python Engine (BUKAN DI VERCEL!)
 * Meneruskan sinyal ke `morning_full_sweep.py` (`--brutal` atau `--stock-only`).
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import { dispatchToGitHubRunner } from '@/lib/githubDispatcher';

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get('token')?.value;
  const legacySessionId = cookieStore.get('sessionId')?.value;

  let user = null;
  if (token) {
    const session = await verifyToken(token);
    if (session?.userId) {
      user = await prisma.user.findUnique({ where: { id: session.userId } });
    }
  } else if (legacySessionId) {
    user = await prisma.user.findFirst({ where: { sessionId: legacySessionId, status: 'ACTIVE' } });
  }

  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized - Silakan login kembali' }, { status: 401 });
  }
  if (user.role !== 'SUPERVISOR' && user.nik !== '22054178') {
    return NextResponse.json({ success: false, error: 'Forbidden - Khusus Supervisor / Developer' }, { status: 403 });
  }

  const url = new URL(req.url);
  const body = await req.json().catch(() => ({}));
  const isStockOnly = url.searchParams.get('mode') === 'stock-only' || body.stockOnly === true;

  const result = await dispatchToGitHubRunner({
    action: isStockOnly ? 'stock-only' : 'mds-bisa',
    force: true,
    userId: user.id,
  });

  return NextResponse.json(result.payload, { status: result.status });
}
