/**
 * src/lib/githubDispatcher.ts
 * ============================================================================
 * Pusat Dispatch ke GitHub Actions Python Runner (0% Eksekusi Berat di Vercel)
 * Mengirim sinyal `workflow_dispatch` ke `.github/workflows/retail-sync-engine.yml`
 * untuk 3 Kategori Utama:
 * 1. KATEGORI 1 — SCRAB (`scrab` | `mds-bisa` | `photos`)
 * 2. KATEGORI 2 — UPDATE STOCK LIVE (`stock-only` via Jalur Mapping 84.763 SKU)
 * 3. KATEGORI 3 — UPDATE PROMO EMAIL (`promo` via Python Promo Parser)
 * ============================================================================
 */

import { prisma } from '@/lib/prisma';

const REPO_OWNER = 'luqmanmenmen';
const REPO_NAME = 'CheckPrice';
const WORKFLOW_ID = 'retail-sync-engine.yml';

export type SyncActionType = 'scrab' | 'mds-bisa' | 'photos' | 'stock-only' | 'promo' | 'all';

export async function dispatchToGitHubRunner(params: {
  action: SyncActionType;
  force?: boolean;
  promoUrl?: string;
  sessionCookie?: string;
  userId?: string | null;
}) {
  const { action, force = true, promoUrl = '', sessionCookie = '', userId = null } = params;

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
      console.warn('[GITHUB-DISPATCH] Gagal membaca fallback token dari Storage:', e);
    }
  }

  if (!githubToken) {
    return {
      ok: false,
      status: 400,
      payload: {
        success: false,
        error: 'GITHUB_TOKEN belum dikonfigurasi di Environment Variable (Vercel).',
        manualUrl: `https://github.com/${REPO_OWNER}/${REPO_NAME}/actions/workflows/${WORKFLOW_ID}`,
        help: 'Anda dapat menjalankan sync langsung dari tab Actions di GitHub atau tambahkan GITHUB_TOKEN di Vercel Settings.',
      },
    };
  }

  // Ambil MDS session cookie dari storage jika ada
  let mdsCookie = sessionCookie;
  if (!mdsCookie && (action === 'scrab' || action === 'mds-bisa' || action === 'stock-only' || action === 'all')) {
    try {
      const { supabase } = await import('@/lib/supabaseClient');
      const { data, error } = await supabase.storage.from('excel-uploads').download('secrets/mds_cookie.txt');
      if (data && !error) {
        mdsCookie = (await data.text()).trim();
      }
    } catch (e) {
      console.warn('[GITHUB-DISPATCH] Gagal membaca fallback mds_cookie dari Storage:', e);
    }
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
        promo_url: promoUrl,
        force: String(force),
        session_cookie: mdsCookie,
      },
    }),
  });

  if (!ghRes.ok) {
    const errText = await ghRes.text();
    return {
      ok: false,
      status: ghRes.status,
      payload: {
        success: false,
        error: `GitHub API menolak request (${ghRes.status}): ${errText}`,
      },
    };
  }

  const typeMap: Record<SyncActionType, string> = {
    'scrab': 'SCRAB_BRUTAL_TRIGGER',
    'mds-bisa': 'MDS_BISA_SYNC_TRIGGER',
    'photos': 'PHOTO_SYNC_TRIGGER',
    'stock-only': 'STOCK_SYNC_TRIGGER',
    'promo': 'PROMO_SYNC_TRIGGER',
    'all': 'FULL_SYNC_TRIGGER',
  };

  const labelMap: Record<SyncActionType, string> = {
    'scrab': 'KATEGORI 1: Brutal Scrab (by luqman org + Foto Matahari.com)',
    'mds-bisa': 'KATEGORI 1A: Brutal Scrab by luqman org (16-Worker Python)',
    'photos': 'KATEGORI 1B: Brutal Scrab Foto Produk Matahari.com',
    'stock-only': 'KATEGORI 2: Update Stock Live (Jalur Mapping 84.763 SKU)',
    'promo': 'KATEGORI 3: Update Promo Email (Python Promo Engine)',
    'all': 'PAKET KOMPLIT: Scrab + Update Stock + Update Promo Email',
  };

  if (userId) {
    try {
      await prisma.syncHistory.create({
        data: {
          userId,
          type: typeMap[action] || 'MDS_BISA_SYNC_TRIGGER',
          fileName: `GitHub Python Runner — ${labelMap[action] || action}`,
          status: 'SUCCESS',
          records: 84763,
        },
      });
    } catch (e) {
      console.warn('[GITHUB-DISPATCH] Gagal mencatat SyncHistory trigger:', e);
    }
  }

  return {
    ok: true,
    status: 200,
    payload: {
      success: true,
      action,
      message: `🚀 Mesin Python di GitHub Actions [${labelMap[action] || action.toUpperCase()}] berhasil dinyalakan! (0% Beban Vercel)`,
      actionsUrl: `https://github.com/${REPO_OWNER}/${REPO_NAME}/actions`,
    },
  };
}
