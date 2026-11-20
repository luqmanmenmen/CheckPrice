import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import { SyncActionType } from '@/lib/githubDispatcher';

const REPO_OWNER = 'luqmanmenmen';
const REPO_NAME = 'CheckPrice';
const WORKFLOW_ID = 'retail-sync-engine.yml';

interface ConsoleLogLine {
  ts: string;
  step: string;
  level: 'info' | 'warn' | 'error' | 'heal' | 'db' | 'success';
  text: string;
}

interface DiagnosticItem {
  ts?: string;
  step?: string;
  code: string;
  title: string;
  detail: string;
  retryable?: boolean;
  traceback?: {
    file?: string;
    lineNo?: number;
    exceptionType?: string;
    exceptionMsg?: string;
    snippet?: string;
  } | null;
}

const rawJobLogCache = new Map<number, { fetchedAt: number; lines: ConsoleLogLine[]; diagnostics: DiagnosticItem[] }>();
const RAW_LOG_CACHE_TTL_MS = 5 * 60 * 1000;

const NOISY_RUNNER_TOKENS = [
  '[command]/usr/bin/git',
  'git submodule foreach',
  'adding repository directory to the temporary git',
  'temporarily overriding home=',
  'fetching the repository',
  'setting up auth',
  'removing auth',
  'cleaning up orphan processes',
  'node.js 20 is deprecated',
  '##[group]',
  '##[endgroup]',
];

function classifyRawLineLevel(text: string): ConsoleLogLine['level'] {
  const low = text.toLowerCase();
  if (low.includes('traceback') || low.includes('[error]') || low.includes('error:') || text.includes('❌') || low.includes('exception')) {
    return 'error';
  }
  if (low.includes('[heal]') || low.includes('[self-heal]') || low.includes('[guardian]')) {
    return 'heal';
  }
  if (low.includes('[db') || low.includes('artikel baru:') || low.includes('sku baru:') || low.includes('baru: +')) {
    return 'db';
  }
  if (low.includes('[warn') || text.includes('⚠️') || low.includes('##[warning]')) {
    return 'warn';
  }
  if (text.includes('🎉') || text.includes('✅') || low.includes('[sukses]')) {
    return 'success';
  }
  return 'info';
}

function maskSensitiveTokens(raw: string): string {
  return raw
    .replace(/mso_session=[^\s;"']+/g, 'mso_session=***MASKED***')
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, 'postgresql://***MASKED***')
    .replace(/\b(?:ghp|github_pat)_[A-Za-z0-9_]+/g, '***TOKEN***')
    .replace(/\bAIza[A-Za-z0-9_-]{16,}/g, 'AIza***MASKED***');
}

function parseRawGitHubJobLog(rawText: string): { lines: ConsoleLogLine[]; diagnostics: DiagnosticItem[] } {
  const parsedLines: ConsoleLogLine[] = [];
  const rawLines = rawText.split(/\r?\n/);

  for (const raw of rawLines) {
    const m = raw.match(/^(\d{4}-\d{2}-\d{2}T(\d{2}:\d{2}:\d{2})\.\d+Z)\s+(.*)$/);
    const timeStr = m ? m[2] : '';
    const msg = maskSensitiveTokens((m ? m[3] : raw).trimEnd());
    if (!msg) continue;
    const low = msg.toLowerCase();
    if (NOISY_RUNNER_TOKENS.some((tok) => low.includes(tok))) continue;
    if (msg.startsWith('##[debug]') || msg.startsWith('::')) continue;

    parsedLines.push({
      ts: timeStr ? `${timeStr}` : '-',
      step: 'GitHub Log',
      level: classifyRawLineLevel(msg),
      text: msg,
    });
  }

  const trimmed = parsedLines.slice(-260);
  const diagnostics = extractDiagnosticsFromRawLines(trimmed);
  return { lines: trimmed, diagnostics };
}

function extractDiagnosticsFromRawLines(lines: ConsoleLogLine[]): DiagnosticItem[] {
  const joined = lines.map((l) => l.text).join('\n');
  const low = joined.toLowerCase();
  const out: DiagnosticItem[] = [];

  const tbIdx = joined.lastIndexOf('Traceback (most recent call last):');
  let tbInfo: DiagnosticItem['traceback'] = null;
  if (tbIdx !== -1) {
    const tbTail = joined.slice(tbIdx).split('\n').slice(0, 14).join('\n');
    const fileMatches = [...tbTail.matchAll(/File "([^"]+)", line (\d+)/g)];
    const lastFile = fileMatches[fileMatches.length - 1];
    const nonEmpty = tbTail.split('\n').map((s) => s.trim()).filter(Boolean);
    const lastLine = nonEmpty[nonEmpty.length - 1] || '';
    const colon = lastLine.indexOf(':');
    tbInfo = {
      file: lastFile?.[1],
      lineNo: lastFile?.[2] ? Number(lastFile[2]) : undefined,
      exceptionType: colon > 0 ? lastLine.slice(0, colon).trim() : 'PythonError',
      exceptionMsg: colon > 0 ? lastLine.slice(colon + 1).trim() : lastLine,
      snippet: tbTail.slice(0, 450),
    };
  }

  if (low.includes('cookie login storehub tidak ditemukan') || low.includes('cookie login luqman org tidak ditemukan') || low.includes('mso_session tidak ditemukan') || low.includes('username dan password wajib diisi')) {
    out.push({
      code: 'AUTH_EXPIRED',
      title: 'Sesi Cookie luqman org Kedaluwarsa',
      detail: 'Server luqman org meminta login ulang (`mso_session`). Gunakan tombol Self-Heal untuk auto-login ulang.',
      retryable: true,
      traceback: tbInfo,
    });
  } else if (low.includes('toko 719 sedang tutup') || low.includes('no route to host')) {
    out.push({
      code: 'STORE_OFFLINE',
      title: 'Server Toko Fisik Sedang Offline (Malam Hari)',
      detail: 'Server toko fisik tutup di luar jam ~09:00–21:30 WIB.',
      retryable: false,
      traceback: tbInfo,
    });
  } else if (tbInfo) {
    out.push({
      code: 'CODE_EXCEPTION',
      title: `Error Python: ${tbInfo.exceptionType || 'Exception'}`,
      detail: `${tbInfo.file ? `${tbInfo.file}:${tbInfo.lineNo || 0} — ` : ''}${tbInfo.exceptionMsg || 'Terjadi error eksekusi.'}`,
      retryable: true,
      traceback: tbInfo,
    });
  }

  return out;
}

function parseNewProductStatsFromFileName(fileName: string | null): { newSkusAdded: number; newArticlesAdded: number } {
  if (!fileName) return { newSkusAdded: 0, newArticlesAdded: 0 };
  const s = String(fileName);
  const mBoth = s.match(/Baru:\s*\+?([\d.,]+)\s*Artikel\s*\/\s*\+?([\d.,]+)\s*SKU/i);
  if (mBoth) {
    return {
      newArticlesAdded: parseInt(mBoth[1].replace(/[^\d]/g, ''), 10) || 0,
      newSkusAdded: parseInt(mBoth[2].replace(/[^\d]/g, ''), 10) || 0,
    };
  }
  const mSku = s.match(/\+?([\d.,]+)\s*SKU\s*Baru/i);
  const mArt = s.match(/\+?([\d.,]+)\s*Artikel\s*Baru/i);
  return {
    newSkusAdded: mSku ? parseInt(mSku[1].replace(/[^\d]/g, ''), 10) || 0 : 0,
    newArticlesAdded: mArt ? parseInt(mArt[1].replace(/[^\d]/g, ''), 10) || 0 : 0,
  };
}

function inferActionFromHistory(syncHistory: Array<{ type: string }>): SyncActionType {
  const triggerMap: Record<string, SyncActionType> = {
    SCRAB_BRUTAL_TRIGGER: 'scrab',
    MDS_BISA_SYNC_TRIGGER: 'mds-bisa',
    PHOTO_SYNC_TRIGGER: 'photos',
    STOCK_SYNC_TRIGGER: 'stock-only',
    PROMO_SYNC_TRIGGER: 'promo',
    UPCOMING_POP_DRAFT_TRIGGER: 'upcoming-promo',
    CATALOG_BUNDLE_TRIGGER: 'catalog',
    ANALYTICS_PRECOMPUTE_TRIGGER: 'analytics',
    FULL_SYNC_TRIGGER: 'all',
    MDS_BISA_SYNC: 'scrab',
    PHOTO_SYNC: 'photos',
    STOCK_SYNC: 'stock-only',
    UPDATE_PROMO: 'promo',
    CATALOG_BUNDLE: 'catalog',
  };
  for (const row of syncHistory) {
    if (row?.type && triggerMap[row.type]) {
      return triggerMap[row.type];
    }
  }
  return 'all';
}

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

    if (!user || (user.role !== 'SUPERVISOR' && user.nik !== '22054178')) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    let githubToken = process.env.GITHUB_TOKEN || process.env.GH_PAT;

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

    const activeRunRaw = rawRuns.find((r: any) => r.status === 'in_progress' || r.status === 'queued') || rawRuns[0];

    // 2. Ambil detail jobs & steps
    let steps: any[] = [];
    let primaryJobId: number | null = null;
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
        if (primaryJob?.id) primaryJobId = Number(primaryJob.id);

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

            const cleanStepName = String(s.name || '')
              .replace(/MDS\s*[-]?\s*BISA/gi, 'luqman org')
              .replace(/StoreHub/gi, 'luqman org')
              .replace(/(?:https?:\/\/)?(?:www\.)?matahari\.com/gi, 'luqman org')
              .replace(/\bMatahari\b/gi, 'luqman org');
            if (isFailed) {
              hasError = true;
              errorStepName = cleanStepName;
            }

            return {
              number: s.number,
              name: cleanStepName,
              status: s.status,
              conclusion: s.conclusion,
              duration,
              isCompleted,
              isFailed,
              isRunning,
              isSkipped,
            };
          });

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

          if (activeRunRaw.status === 'completed') {
            percent = 100;
          } else if (activeRunRaw.status === 'queued') {
            percent = 5;
          } else {
            const stepScore = Math.round((completedSteps.length / totalActiveSteps) * 90);
            percent = Math.min(95, Math.max(15, stepScore));
          }
        }
      }
    } catch (jobErr) {
      console.warn('[GITHUB-STATUS] Gagal mengambil detail jobs:', jobErr);
    }

    // 3. Jalankan DB queries ringan (SyncHistory + O(1) pg_class count) + unduh live-runner-log.json secara paralel
    const [dbSyncHistory, dbMetrics, liveLogRaw] = await Promise.all([
      prisma.syncHistory
        .findMany({
          take: 10,
          orderBy: { createdAt: 'desc' },
          select: { id: true, type: true, fileName: true, status: true, records: true, createdAt: true },
        })
        .catch(() => [] as any[]),
      prisma
        .$queryRawUnsafe<Array<{ relname: string; cnt: bigint }>>(
          `SELECT relname, GREATEST(reltuples::bigint, 0)::bigint AS cnt FROM pg_class WHERE relname IN ('Product', 'CatalogArticle')`
        )
        .then((rows) => {
          const productRow = rows.find((r) => r.relname === 'Product');
          const catRow = rows.find((r) => r.relname === 'CatalogArticle');
          return {
            totalProducts: Number(productRow?.cnt || 0),
            totalArticles: Number(catRow?.cnt || 0),
          };
        })
        .catch(() => ({ totalProducts: 0, totalArticles: 0 })),
      (async () => {
        try {
          const { supabase } = await import('@/lib/supabaseClient');
          const { data, error } = await supabase.storage.from('excel-uploads').download('logs/live-runner-log.json');
          if (data && !error) {
            return JSON.parse(await data.text());
          }
        } catch {}
        return null;
      })(),
    ]);

    const maskSourceBranding = (raw: string): string =>
      raw
        .replace(/https?:\/\/storehub\.mdsretailing\.id[^\s"']*/gi, 'https://luqman.org')
        .replace(/storehub\.mdsretailing\.id/gi, 'luqman.org')
        .replace(/(?:https?:\/\/)?(?:www\.)?matahari\.com/gi, 'luqman org')
        .replace(/MDS\s*[-]?\s*BISA/gi, 'luqman org')
        .replace(/StoreHub/gi, 'luqman org')
        .replace(/\bMatahari\b/gi, 'luqman org');

    const cleanSyncHistory = dbSyncHistory.map((h) => {
      const cleanName = h.fileName ? maskSourceBranding(String(h.fileName)) : h.fileName;
      const newStats = parseNewProductStatsFromFileName(cleanName);
      return {
        ...h,
        fileName: cleanName,
        newSkusAdded: newStats.newSkusAdded,
        newArticlesAdded: newStats.newArticlesAdded,
      };
    });

    // 4. Resolusi Console Log Output (Live Guardian Stream vs Raw GitHub Job Log)
    let consoleSource: 'live-guardian' | 'github-raw' | 'summary' = 'summary';
    let consoleLines: ConsoleLogLine[] = [];
    let diagnostics: DiagnosticItem[] = [];
    let healsApplied: any[] = [];
    let newProductsSummary: any = null;
    let stepReports: any[] = [];
    let lastAction: SyncActionType = inferActionFromHistory(cleanSyncHistory);

    const liveMatchesActive = Boolean(
      liveLogRaw &&
        (String(liveLogRaw.runId || '') === String(activeRunRaw.id) ||
          String(liveLogRaw.runNumber || '') === String(activeRunRaw.run_number))
    );

    if (liveMatchesActive && liveLogRaw) {
      consoleSource = 'live-guardian';
      consoleLines = Array.isArray(liveLogRaw.lines) ? liveLogRaw.lines : [];
      diagnostics = Array.isArray(liveLogRaw.diagnostics) ? liveLogRaw.diagnostics : [];
      healsApplied = Array.isArray(liveLogRaw.healsApplied) ? liveLogRaw.healsApplied : [];
      newProductsSummary = liveLogRaw.newProductsSummary || null;
      stepReports = Array.isArray(liveLogRaw.stepReports) ? liveLogRaw.stepReports : [];
      if (liveLogRaw.action) lastAction = liveLogRaw.action as SyncActionType;
    } else if (primaryJobId && activeRunRaw.status === 'completed') {
      const cached = rawJobLogCache.get(primaryJobId);
      if (cached && Date.now() - cached.fetchedAt < RAW_LOG_CACHE_TTL_MS) {
        consoleSource = 'github-raw';
        consoleLines = cached.lines;
        diagnostics = cached.diagnostics;
      } else {
        try {
          const logRes = await fetch(
            `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/jobs/${primaryJobId}/logs`,
            {
              headers: {
                'Authorization': `Bearer ${githubToken}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'PriceChecker-Supervisor-Engine',
              },
              redirect: 'follow',
              signal: AbortSignal.timeout(5500),
            }
          );
          if (logRes.ok) {
            const rawText = await logRes.text();
            const parsed = parseRawGitHubJobLog(rawText);
            consoleSource = 'github-raw';
            consoleLines = parsed.lines;
            diagnostics = parsed.diagnostics;
            rawJobLogCache.set(primaryJobId, {
              fetchedAt: Date.now(),
              lines: parsed.lines,
              diagnostics: parsed.diagnostics,
            });
          }
        } catch (logErr) {
          console.warn('[GITHUB-STATUS] Gagal fetch raw job logs:', logErr);
        }
      }
    }

    // Fallback ringkasan produk baru terakhir bila run sebelumnya belum memakai live-guardian
    if (!newProductsSummary) {
      const lastScrabHist = cleanSyncHistory.find(
        (h) => h.type === 'MDS_BISA_SYNC' && (h.newSkusAdded > 0 || h.newArticlesAdded > 0)
      );
      if (lastScrabHist) {
        newProductsSummary = {
          newSkusAdded: lastScrabHist.newSkusAdded,
          newArticlesAdded: lastScrabHist.newArticlesAdded,
          samples: [],
          sourceHistoryId: lastScrabHist.id,
          sourceFileName: lastScrabHist.fileName,
          sourceTime: lastScrabHist.createdAt,
        };
      }
    }

    let totalDuration = '';
    if (activeRunRaw.created_at) {
      const endTime = activeRunRaw.updated_at ? new Date(activeRunRaw.updated_at).getTime() : Date.now();
      const startTime = new Date(activeRunRaw.created_at).getTime();
      const diffSec = Math.max(1, Math.round((endTime - startTime) / 1000));
      const mins = Math.floor(diffSec / 60);
      const secs = diffSec % 60;
      totalDuration = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    }

    const formattedActiveRun = {
      id: activeRunRaw.id,
      runNumber: activeRunRaw.run_number,
      primaryJobId,
      status: activeRunRaw.status,
      conclusion: activeRunRaw.conclusion,
      percent,
      currentStep: currentStepName,
      totalDuration,
      hasError: hasError || activeRunRaw.conclusion === 'failure' || diagnostics.length > 0,
      errorStep: errorStepName || diagnostics[diagnostics.length - 1]?.title || null,
      createdAt: activeRunRaw.created_at,
      updatedAt: activeRunRaw.updated_at,
      htmlUrl: activeRunRaw.html_url,
      event: activeRunRaw.event,
    };

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

    const maskedConsoleLines = consoleLines.map((ln) => ({
      ...ln,
      text: maskSourceBranding(String(ln.text || '')),
    }));
    const maskedDiagnostics = diagnostics.map((d) => ({
      ...d,
      title: maskSourceBranding(String(d.title || '')),
      detail: maskSourceBranding(String(d.detail || '')),
    }));
    const maskedHeals = healsApplied.map((h: any) =>
      typeof h === 'string'
        ? maskSourceBranding(h)
        : h && typeof h === 'object'
        ? { ...h, message: h.message ? maskSourceBranding(String(h.message)) : h.message }
        : h
    );

    return NextResponse.json({
      success: true,
      hasRuns: true,
      activeRun: formattedActiveRun,
      steps,
      recentRuns,
      syncHistory: cleanSyncHistory,
      consoleSource,
      consoleLines: maskedConsoleLines,
      diagnostics: maskedDiagnostics,
      healsApplied: maskedHeals,
      newProductsSummary,
      stepReports,
      lastAction,
      dbMetrics,
    });
  } catch (err: any) {
    console.error('[GITHUB-STATUS] Error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
