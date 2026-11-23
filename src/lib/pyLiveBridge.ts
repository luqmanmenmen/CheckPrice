/**
 * src/lib/pyLiveBridge.ts
 * =============================================================================
 * Jembatan tipis (< 70 baris) yang meneruskan seluruh permintaan live StoreHub
 * (Auto-Scan barang baru, Turbo Matrix Live Stock, Image Healer, Refresh Cookie)
 * langsung ke Vercel Python Function (`api/py_live.py` -> `python-engine/storehub_live_engine.py`).
 *
 * 100% 1 Otak Python — menggantikan `mdsBisaClient.ts` (3.013 baris) agar 0% double system!
 * =============================================================================
 */

export type FastLiveVariantInput = {
  sku: string;
  color?: string | null;
  size?: string | null;
  stok?: number;
};

/** Hitung check digit GS1 EAN-13 (helper murni 6 baris untuk pencocokan lokal DB) */
export function calculateEan13CheckDigit(digits12: string): string {
  if (!/^\d{12}$/.test(digits12)) return '';
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(digits12[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return String((10 - (sum % 10)) % 10);
}

function resolvePyLiveEndpoint(requestUrl?: string): string {
  if (requestUrl) {
    try {
      const u = new URL(requestUrl);
      if (u.origin && !u.origin.includes('localhost') && !u.origin.includes('127.0.0.1')) {
        return `${u.origin}/api/py_live`;
      }
    } catch {}
  }
  const prodDomain = (process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/+$/, '');
  if (prodDomain && prodDomain.startsWith('http')) {
    return `${prodDomain}/api/py_live`;
  }
  const vercelUrl = (process.env.VERCEL_URL || '').trim();
  if (vercelUrl) {
    return `https://${vercelUrl.replace(/^https?:\/\//, '')}/api/py_live`;
  }
  return 'https://luqmanganteng.my.id/api/py_live';
}

export async function invokePythonLiveEngine<T = any>(
  payload: Record<string, any>,
  options: { requestUrl?: string; timeoutMs?: number } = {}
): Promise<T> {
  const endpoint = resolvePyLiveEndpoint(options.requestUrl);
  const timeoutMs = options.timeoutMs ?? 9000;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs),
  });

  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    return {
      success: false,
      error: `Python Live Engine HTTP ${res.status}`,
      raw: text.slice(0, 180),
    } as T;
  }
}
