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
import { APP_VERSION } from '@/lib/version';

const REPO_OWNER = 'luqmanmenmen';
const REPO_NAME = 'CheckPrice';
const WORKFLOW_ID = 'retail-sync-engine.yml';

export type SyncActionType = 'scrab' | 'mds-bisa' | 'photos' | 'stock-only' | 'suko-sales' | 'promo' | 'upcoming-promo' | 'catalog' | 'analytics' | 'all';

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
  if (!mdsCookie && (action === 'scrab' || action === 'mds-bisa' || action === 'stock-only' || action === 'suko-sales' || action === 'all')) {
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
    'suko-sales': 'MDS_SALES_SYNC_TRIGGER',
    'promo': 'PROMO_SYNC_TRIGGER',
    'upcoming-promo': 'UPCOMING_POP_DRAFT_TRIGGER',
    'catalog': 'CATALOG_BUNDLE_TRIGGER',
    'analytics': 'ANALYTICS_PRECOMPUTE_TRIGGER',
    'all': 'FULL_SYNC_TRIGGER',
  };

  const labelMap: Record<SyncActionType, string> = {
    'scrab': `KATEGORI 1: Brutal Scrab (by luqman org + Foto luqman org) [v${APP_VERSION}]`,
    'mds-bisa': `KATEGORI 1A: Brutal Scrab by luqman org [v${APP_VERSION}]`,
    'photos': `KATEGORI 1B: Brutal Scrab Foto & Pulihkan URL 404 [v${APP_VERSION}]`,
    'stock-only': `KATEGORI 2: Update Stock Live (Mapping 84.763 SKU + Sales) [v${APP_VERSION}]`,
    'suko-sales': `KATEGORI 2B: Tarik Sales & Stok Cepat SUKO (0 RAM Supabase) [v${APP_VERSION}]`,
    'promo': `KATEGORI 3: Update Promo Email (Parser v2 + Gemini 2.5) [v${APP_VERSION}]`,
    'upcoming-promo': `KATEGORI 6: Persiapan POP H-2/H-1 (Aman, Tidak Ubah Promo Berjalan) [v${APP_VERSION}]`,
    'catalog': `KATEGORI 4: Catalog Brain & Offline Snapshot (.json.gz) [v${APP_VERSION}]`,
    'analytics': `KATEGORI 5: Python Admin Analytics, Clean Promo, & Saran PO [v${APP_VERSION}]`,
    'all': `ALL TRIGGER (Kategori 1 + 2 + 3 + 4 Terpadu) [v${APP_VERSION}]`,
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
      engineVersion: APP_VERSION,
      message: `🚀 Engine Python v${APP_VERSION} di GitHub Actions [${labelMap[action] || action.toUpperCase()}] berhasil dinyalakan!`,
      actionsUrl: `https://github.com/${REPO_OWNER}/${REPO_NAME}/actions`,
    },
  };
}
