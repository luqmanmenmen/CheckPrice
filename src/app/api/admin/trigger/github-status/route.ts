import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';

const REPO_OWNER = 'luqmanmenmen';
const REPO_NAME = 'CheckPrice';
const WORKFLOW_ID = 'retail-sync-engine.yml';

export async function GET(req: Request) {
  // Verifikasi Supervisor atau Webhook
  const webhookToken = req.headers.get('x-webhook-token') || req.headers.get('authorization')?.replace('Bearer ', '');
  const validSecret = process.env.WEBHOOK_SECRET || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
  const isAuthorizedWebhook = Boolean(webhookToken && validSecret && webhookToken === validSecret);

  if (!isAuthorizedWebhook) {
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

    if (!user || user.role !== 'SUPERVISOR') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    let githubToken = process.env.GITHUB_TOKEN || process.env.GH_PAT;

    // Fallback: Ambil token dari Supabase Storage jika belum di-set di Vercel env
    if (!githubToken) {
      try {
        const { supabase } = await import('@/lib/supabaseClient');
        const { data, error } = await supabase.storage.from('excel-uploads').download('secrets/gh_token.txt');
        if (data && !error) {
          githubToken = (await data.text()).trim();
        }
      } catch (e) {
        console.warn('[GITHUB-STATUS] Gagal membaca fallback token:', e);
      }
    }

    if (!githubToken) {
      return NextResponse.json({
        success: false,
        error: 'GITHUB_TOKEN belum dikonfigurasi.',
      }, { status: 400 });
    }

    // 1. Ambil 5 workflow runs terbaru
    const runsUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/${WORKFLOW_ID}/runs?per_page=5`;
    const runsRes = await fetch(runsUrl, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `Bearer ${githubToken}`,
        'User-Agent': 'PriceChecker-Supervisor-Engine',
      },
      next: { revalidate: 0 },
      cache: 'no-store',
    });

    if (!runsRes.ok) {
      const errText = await runsRes.text();
      return NextResponse.json({
        success: false,
        error: `GitHub API error (${runsRes.status}): ${errText}`,
      }, { status: runsRes.status });
    }

    const runsData = await runsRes.json();
    const rawRuns = runsData.workflow_runs || [];

    if (rawRuns.length === 0) {
      return NextResponse.json({
        success: true,
        hasRuns: false,
        activeRun: null,
        recentRuns: [],
        syncHistory: [],
      });
    }

    // Cari jika ada run yang sedang berjalan (in_progress / queued)
    const activeRunRaw = rawRuns.find((r: any) => r.status === 'in_progress' || r.status === 'queued') || rawRuns[0];

    // 2. Ambil detail jobs dan steps dari active/latest run
    let steps: any[] = [];
    let currentStepName = 'Menunggu runner cloud...';
    let percent = 0;
    let hasError = false;
    let errorStepName = null;

    try {
      const jobsRes = await fetch(activeRunRaw.jobs_url, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'Authorization': `Bearer ${githubToken}`,
          'User-Agent': 'PriceChecker-Supervisor-Engine',
        },
        cache: 'no-store',
      });

      if (jobsRes.ok) {
        const jobsData = await jobsRes.json();
        const primaryJob = (jobsData.jobs || [])[0];

        if (primaryJob && Array.isArray(primaryJob.steps)) {
          steps = primaryJob.steps.map((s: any) => {
            const isCompleted = s.status === 'completed';
            const isFailed = s.conclusion === 'failure';
            const isRunning = s.status === 'in_progress';
            const isSkipped = s.conclusion === 'skipped';

            let duration = '';
            if (s.started_at && s.completed_at) {
              const diffMs = new Date(s.completed_at).getTime() - new Date(s.started_at).getTime();
              duration = diffMs < 1000 ? '<1s' : `${Math.round(diffMs / 1000)}s`;
            }

            if (isFailed) {
              hasError = true;
              errorStepName = s.name;
            }

            return {
              number: s.number,
              name: s.name,
              status: s.status,
              conclusion: s.conclusion,
              duration,
              isCompleted,
              isFailed,
              isRunning,
              isSkipped,
            };
          });

          // Cari langkah yang sedang berjalan atau langkah terakhir yang selesai
          const runningStep = steps.find(s => s.isRunning);
          const failedStep = steps.find(s => s.isFailed);
          const completedSteps = steps.filter(s => s.isCompleted && !s.isSkipped);
          const totalActiveSteps = steps.filter(s => !s.isSkipped).length || 10;

          if (failedStep) {
            currentStepName = `Gagal pada: ${failedStep.name}`;
            hasError = true;
            errorStepName = failedStep.name;
          } else if (runningStep) {
            currentStepName = runningStep.name;
          } else if (activeRunRaw.status === 'completed') {
            currentStepName = activeRunRaw.conclusion === 'success' ? 'Semua langkah selesai sukses' : 'Workflow selesai dengan catatan';
          }

          // Hitung persentase
          if (activeRunRaw.status === 'completed') {
            percent = 100;
          } else if (activeRunRaw.status === 'queued') {
            percent = 5;
          } else {
            // in_progress
            const stepScore = Math.round((completedSteps.length / totalActiveSteps) * 90);
            percent = Math.min(95, Math.max(15, stepScore));
          }
        }
      }
    } catch (jobErr) {
      console.warn('[GITHUB-STATUS] Gagal mengambil detail jobs:', jobErr);
    }

    // Hitung durasi total run
    let totalDuration = '';
    if (activeRunRaw.created_at) {
      const endTime = activeRunRaw.updated_at ? new Date(activeRunRaw.updated_at).getTime() : Date.now();
      const startTime = new Date(activeRunRaw.created_at).getTime();
      const diffSec = Math.max(1, Math.round((endTime - startTime) / 1000));
      const mins = Math.floor(diffSec / 60);
      const secs = diffSec % 60;
      totalDuration = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    }

    // 3. Format data active run
    const formattedActiveRun = {
      id: activeRunRaw.id,
      runNumber: activeRunRaw.run_number,
      status: activeRunRaw.status, // "queued" | "in_progress" | "completed"
      conclusion: activeRunRaw.conclusion, // "success" | "failure" | "cancelled" | null
      percent,
      currentStep: currentStepName,
      totalDuration,
      hasError: hasError || activeRunRaw.conclusion === 'failure',
      errorStep: errorStepName,
      createdAt: activeRunRaw.created_at,
      updatedAt: activeRunRaw.updated_at,
      htmlUrl: activeRunRaw.html_url,
      event: activeRunRaw.event,
    };

    // 4. Format 5 run terakhir
    const recentRuns = rawRuns.map((r: any) => {
      let dur = '';
      if (r.created_at && r.updated_at) {
        const diff = Math.max(1, Math.round((new Date(r.updated_at).getTime() - new Date(r.created_at).getTime()) / 1000));
        dur = diff >= 60 ? `${Math.floor(diff / 60)}m ${diff % 60}s` : `${diff}s`;
      }
      return {
        id: r.id,
        runNumber: r.run_number,
        status: r.status,
        conclusion: r.conclusion,
        duration: dur,
        createdAt: r.created_at,
        htmlUrl: r.html_url,
      };
    });

    // 5. Ambil 10 riwayat SyncHistory dari Database Supabase
    let dbSyncHistory: any[] = [];
    try {
      dbSyncHistory = await prisma.syncHistory.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          type: true,
          fileName: true,
          status: true,
          records: true,
          createdAt: true,
        },
      });
    } catch (dbErr) {
      console.warn('[GITHUB-STATUS] Gagal query SyncHistory DB:', dbErr);
    }

    return NextResponse.json({
      success: true,
      hasRuns: true,
      activeRun: formattedActiveRun,
      steps,
      recentRuns,
      syncHistory: dbSyncHistory,
    });

  } catch (err: any) {
    console.error('[GITHUB-STATUS] Error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
