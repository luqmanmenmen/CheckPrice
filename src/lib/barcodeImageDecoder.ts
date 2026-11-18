/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Html5Qrcode } from "html5-qrcode";

/**
 * Validasi Check-Digit Standar GS1 Modulo-10 untuk EAN-13 (13 digit) & UPC-A (12 digit).
 */
export function isValidGs1CheckDigit(code: string): boolean {
  if (!/^\d{12,13}$/.test(code)) return false;
  const digits = code.split("").map(Number);
  const checkDigit = digits.pop()!;
  let sum = 0;
  for (let i = digits.length - 1, pos = 1; i >= 0; i--, pos++) {
    sum += digits[i] * (pos % 2 === 1 ? 3 : 1);
  }
  const expected = (10 - (sum % 10)) % 10;
  return checkDigit === expected;
}

/**
 * Validasi Check-Digit 8-Digit SKU Matahari Bobot (1, 2, 1, 2, 1, 2, 1) Modulo-10.
 */
export function isValidMdsSku8(code: string): boolean {
  if (!/^\d{8}$/.test(code)) return false;
  const weights = [1, 2, 1, 2, 1, 2, 1];
  let sum = 0;
  for (let i = 0; i < 7; i++) {
    sum += Number(code[i]) * weights[i];
  }
  const expected = (10 - (sum % 10)) % 10;
  return Number(code[7]) === expected;
}

interface DecodeVariant {
  angleDeg: number;
  maxDim: number;
  cropRatio: number;
  boostContrast: boolean;
  yCenterRatio?: number;
  ySpanRatio?: number;
  upscaleSmall?: boolean;
}

const IMAGE_DECODE_VARIANTS: DecodeVariant[] = [
  { angleDeg: 0, maxDim: 1600, cropRatio: 1.0, boostContrast: false, upscaleSmall: true },
  { angleDeg: 0, maxDim: 1500, cropRatio: 0.92, yCenterRatio: 0.72, ySpanRatio: 0.45, boostContrast: false, upscaleSmall: true },
  { angleDeg: 0, maxDim: 1500, cropRatio: 0.92, yCenterRatio: 0.30, ySpanRatio: 0.45, boostContrast: false, upscaleSmall: true },
  { angleDeg: 90, maxDim: 1600, cropRatio: 1.0, boostContrast: false, upscaleSmall: true },
  { angleDeg: 270, maxDim: 1600, cropRatio: 1.0, boostContrast: false, upscaleSmall: true },
  { angleDeg: 0, maxDim: 1600, cropRatio: 1.0, boostContrast: true, upscaleSmall: true },
  { angleDeg: 0, maxDim: 1400, cropRatio: 0.62, boostContrast: false, upscaleSmall: true },
  { angleDeg: 90, maxDim: 1400, cropRatio: 0.62, boostContrast: false, upscaleSmall: true },
  { angleDeg: -7, maxDim: 1500, cropRatio: 0.95, boostContrast: false },
  { angleDeg: 7, maxDim: 1500, cropRatio: 0.95, boostContrast: false },
  { angleDeg: 180, maxDim: 1600, cropRatio: 1.0, boostContrast: false },
];

// Tabel Standar EAN-13 untuk Dekoder Sub-Pixel Soft-Edge (Anti-Blur & Anti-Kompresi WA/Safari)
const EAN_L_CODES = [
  [3, 2, 1, 1],
  [2, 2, 2, 1],
  [2, 1, 2, 2],
  [1, 4, 1, 1],
  [1, 1, 3, 2],
  [1, 2, 3, 1],
  [1, 1, 1, 4],
  [1, 3, 1, 2],
  [1, 2, 1, 3],
  [3, 1, 1, 2],
];
const EAN_G_CODES = EAN_L_CODES.map((c) => [...c].reverse());
const EAN_FIRST_DIGIT_PARITIES = [
  "LLLLLL",
  "LLGLGG",
  "LLGGLG",
  "LLGGGL",
  "LGLLGG",
  "LGGLLG",
  "LGGGLL",
  "LGLGLG",
  "LGLGGL",
  "LGGLGL",
];

function matchEanDigitRuns(
  r0: number,
  r1: number,
  r2: number,
  r3: number,
  table: number[][]
): { digit: number; err: number } {
  const total = r0 + r1 + r2 + r3;
  if (total <= 0) return { digit: -1, err: 999 };
  let bestDigit = -1;
  let bestErr = 999;
  for (let d = 0; d < 10; d++) {
    const pat = table[d];
    const e0 = Math.abs((r0 / total) * 7 - pat[0]);
    const e1 = Math.abs((r1 / total) * 7 - pat[1]);
    const e2 = Math.abs((r2 / total) * 7 - pat[2]);
    const e3 = Math.abs((r3 / total) * 7 - pat[3]);
    const maxSingle = Math.max(e0, e1, e2, e3);
    const err = e0 + e1 + e2 + e3;
    if (maxSingle < 0.72 && err < bestErr) {
      bestErr = err;
      bestDigit = d;
    }
  }
  return { digit: bestDigit, err: bestErr };
}

function decodeEan13Scanline(rowLum: Float32Array, w: number): string | null {
  const win = Math.max(7, Math.min(16, Math.round(w / 70)));
  const thresh = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    let mn = 255;
    let mx = 0;
    const x0 = x - win > 0 ? x - win : 0;
    const x1 = x + win < w ? x + win : w - 1;
    for (let j = x0; j <= x1; j++) {
      const v = rowLum[j];
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    // Bias +4% ke arah putih mengompensasi pelebaran tinta/kompresi pada celah putih tipis
    thresh[x] = mx - mn > 22 ? mn + (mx - mn) * 0.54 : 128;
  }

  const posList: number[] = [];
  const runBlack: number[] = [];
  let curBlack = rowLum[0] < thresh[0];
  for (let x = 1; x < w; x++) {
    const d0 = rowLum[x - 1] - thresh[x - 1];
    const d1 = rowLum[x] - thresh[x];
    const nb = d1 < 0;
    if (nb !== curBlack) {
      const denom = d0 - d1;
      const frac = Math.abs(denom) > 0.001 ? d0 / denom : 0.5;
      posList.push(x - 1 + Math.max(0, Math.min(1, frac)));
      runBlack.push(nb ? 1 : 0);
      curBlack = nb;
    }
  }

  const numRuns = posList.length - 1;
  if (numRuns < 59) return null;

  const runs = new Float32Array(numRuns);
  for (let i = 0; i < numRuns; i++) {
    runs[i] = posList[i + 1] - posList[i];
  }

  for (let s = 0; s <= numRuns - 59; s++) {
    // Left Guard 1:1:1 (Bar, Space, Bar)
    if (!runBlack[s] || runBlack[s + 1] || !runBlack[s + 2]) continue;
    const gL = (runs[s] + runs[s + 1] + runs[s + 2]) / 3;
    if (gL < 0.72) continue;
    if (
      Math.abs(runs[s] / gL - 1) > 0.65 ||
      Math.abs(runs[s + 1] / gL - 1) > 0.65 ||
      Math.abs(runs[s + 2] / gL - 1) > 0.65
    ) {
      continue;
    }
    // Center Guard (S B S B S) & Right Guard (B S B)
    if (runBlack[s + 27] || !runBlack[s + 28] || runBlack[s + 29] || !runBlack[s + 30] || runBlack[s + 31]) continue;
    if (!runBlack[s + 56] || runBlack[s + 57] || !runBlack[s + 58]) continue;

    let parityStr = "";
    const digits: number[] = [];
    let ok = true;

    for (let i = 0; i < 6; i++) {
      const idx = s + 3 + i * 4;
      const mL = matchEanDigitRuns(runs[idx], runs[idx + 1], runs[idx + 2], runs[idx + 3], EAN_L_CODES);
      const mG = matchEanDigitRuns(runs[idx], runs[idx + 1], runs[idx + 2], runs[idx + 3], EAN_G_CODES);
      if (mL.digit < 0 && mG.digit < 0) {
        ok = false;
        break;
      }
      if (mL.err <= mG.err) {
        digits.push(mL.digit);
        parityStr += "L";
      } else {
        digits.push(mG.digit);
        parityStr += "G";
      }
    }
    if (!ok) continue;

    const firstDigit = EAN_FIRST_DIGIT_PARITIES.indexOf(parityStr);
    if (firstDigit < 0) continue;

    for (let i = 0; i < 6; i++) {
      const idx = s + 32 + i * 4;
      const mR = matchEanDigitRuns(runs[idx], runs[idx + 1], runs[idx + 2], runs[idx + 3], EAN_L_CODES);
      if (mR.digit < 0) {
        ok = false;
        break;
      }
      digits.push(mR.digit);
    }
    if (!ok) continue;

    const candidate = `${firstDigit}${digits.join("")}`;
    if (isValidGs1CheckDigit(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Dekoder EAN-13 Sub-Pixel Soft-Edge: sangat toleran pada foto WhatsApp terkompresi,
 * pantulan cahaya, maupun buram kamera iPhone Safari yang sering gagal di ZXing standar.
 */
export function decodeEan13SoftEdgeFromCanvas(
  canvas: HTMLCanvasElement,
  minMajorityHits = 2
): string | null {
  const w = canvas.width;
  const h = canvas.height;
  if (w < 95 || h < 8) return null;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  try {
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;
    const avgLum = new Float32Array(w);
    const stepY = Math.max(2, Math.floor(h / 160));
    const hits = new Map<string, number>();

    for (let y = 3; y < h - 3; y += stepY) {
      const rPrev = (y - 2) * w;
      const rMid = y * w;
      const rNext = (y + 2) * w;
      for (let x = 0; x < w; x++) {
        const i0 = (rPrev + x) * 4;
        const i1 = (rMid + x) * 4;
        const i2 = (rNext + x) * 4;
        const l0 = (77 * data[i0] + 150 * data[i0 + 1] + 29 * data[i0 + 2]) >> 8;
        const l1 = (77 * data[i1] + 150 * data[i1 + 1] + 29 * data[i1 + 2]) >> 8;
        const l2 = (77 * data[i2] + 150 * data[i2 + 1] + 29 * data[i2 + 2]) >> 8;
        avgLum[x] = (l0 + l1 + l2) / 3;
      }
      const found = decodeEan13Scanline(avgLum, w);
      if (found) {
        const nextCount = (hits.get(found) || 0) + 1;
        hits.set(found, nextCount);
        // Mayoritas cukup kuat langsung kembalikan tanpa membuang CPU ekstra
        if (nextCount >= Math.max(4, minMajorityHits * 2)) {
          return found;
        }
      }
    }

    let bestCode: string | null = null;
    let bestCount = 0;
    for (const [code, cnt] of hits.entries()) {
      if (cnt > bestCount) {
        bestCode = code;
        bestCount = cnt;
      }
    }
    return bestCount >= minMajorityHits ? bestCode : null;
  } catch {
    return null;
  }
}

async function pickBestDecodedCandidate(rawCandidates: string[]): Promise<string | null> {
  const unique = Array.from(
    new Set(rawCandidates.map((c) => c.trim()).filter(Boolean))
  );
  if (unique.length === 0) return null;
  if (unique.length === 1) return unique[0];

  try {
    const { findOfflineProductByCode } = await import("@/lib/offlineDb");
    for (const candidate of unique) {
      const hit = await findOfflineProductByCode(candidate);
      if (hit) return candidate;
    }
  } catch {}

  const validRetail = unique.find(
    (c) => isValidGs1CheckDigit(c) || isValidMdsSku8(c)
  );
  return validRetail || unique[0];
}

function loadImageFromFile(file: File): Promise<{ img: HTMLImageElement; cleanup: () => void }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, cleanup: () => URL.revokeObjectURL(objectUrl) });
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      // Fallback DataURL bila Blob URL gagal dibaca oleh WebKit galeri HP tertentu
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = typeof reader.result === "string" ? reader.result : "";
        if (!dataUrl) {
          reject(new Error("File bukan gambar yang valid."));
          return;
        }
        const img2 = new Image();
        img2.onload = () => resolve({ img: img2, cleanup: () => {} });
        img2.onerror = () => reject(new Error("File bukan gambar yang valid."));
        img2.src = dataUrl;
      };
      reader.onerror = () => reject(new Error("Gagal membaca file gambar."));
      reader.readAsDataURL(file);
    };
    img.src = objectUrl;
  });
}

/**
 * Mengaktifkan DecodeHintType.TRY_HARDER (enum key = 3) pada semua instance
 * decoder ZXing di dalam Html5QrcodeShim agar iOS Safari (tanpa native
 * BarcodeDetector) melakukan scan multi-baris & retry lebih teliti pada 1D EAN/Code128.
 */
export function enableZxingTryHarder(decoderInstance: any): void {
  const shim = decoderInstance?.qrcode;
  if (!shim) return;
  const subDecoders = [shim.primaryDecoder, shim.secondaryDecoder];
  for (const dec of subDecoders) {
    const hints = dec?.hints;
    if (hints && typeof hints.set === "function") {
      try {
        hints.set(3, true); // DecodeHintType.TRY_HARDER === 3
      } catch {}
    }
  }
}

/**
 * Kontras pixel-buffer (aman 100% di Safari iOS yang mengabaikan ctx.filter).
 * Mengubah frame kamera/foto menjadi grayscale berkontras tinggi adaptif
 * sehingga batang barcode tipis tetap tajam meski agak blur/kurang cahaya.
 */
export function applyPixelContrastBoost(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number
): void {
  if (w <= 0 || h <= 0) return;
  try {
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;
    const totalPixels = w * h;

    // Pass 1: Sampling cepat rentang luminansi agar tahan bayangan & glare
    let minY = 255;
    let maxY = 0;
    const step = Math.max(1, Math.floor(totalPixels / 8000));
    for (let p = 0; p < totalPixels; p += step) {
      const idx = p * 4;
      const y = (77 * data[idx] + 150 * data[idx + 1] + 29 * data[idx + 2]) >> 8;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }

    const spread = Math.max(36, maxY - minY);
    const low = minY + Math.floor(spread * 0.08);
    const high = maxY - Math.floor(spread * 0.08);
    const effRange = Math.max(24, high - low);
    const factor = 255 / effRange;

    // Pass 2: Grayscale + adaptive stretch (menjaga gradien anti-aliased batang tipis)
    for (let i = 0; i < data.length; i += 4) {
      const y = (77 * data[i] + 150 * data[i + 1] + 29 * data[i + 2]) >> 8;
      let stretched = (y - low) * factor;
      if (stretched < 0) stretched = 0;
      else if (stretched > 255) stretched = 255;
      // Dorong S-curve ringan untuk mempertegas hitam batang vs putih kertas tag
      const val =
        stretched < 128
          ? Math.max(0, Math.round(stretched * 0.78))
          : Math.min(255, Math.round(128 + (stretched - 128) * 1.35));
      data[i] = val;
      data[i + 1] = val;
      data[i + 2] = val;
    }

    ctx.putImageData(imgData, 0, 0);
  } catch {}
}

type CanvasImageInput = HTMLImageElement | HTMLCanvasElement;

function getSourceDimensions(src: CanvasImageInput): { w: number; h: number } {
  if (typeof HTMLImageElement !== "undefined" && src instanceof HTMLImageElement) {
    return { w: src.naturalWidth || src.width, h: src.naturalHeight || src.height };
  }
  return { w: src.width, h: src.height };
}

function renderVariantToCanvas(
  canvas: HTMLCanvasElement,
  src: CanvasImageInput,
  variant: DecodeVariant
): boolean {
  const { w: srcW, h: srcH } = getSourceDimensions(src);
  if (!srcW || !srcH) return false;

  const cropW = Math.max(1, Math.floor(srcW * variant.cropRatio));
  const cropH = Math.max(
    1,
    Math.floor(srcH * (variant.ySpanRatio ?? variant.cropRatio))
  );
  const sx = Math.floor((srcW - cropW) / 2);
  const rawSy =
    variant.yCenterRatio !== undefined
      ? Math.floor(srcH * variant.yCenterRatio - cropH / 2)
      : Math.floor((srcH - cropH) / 2);
  const sy = Math.max(0, Math.min(srcH - cropH, rawSy));

  const maxUpscale = variant.upscaleSmall ? 2 : 1;
  const scale = Math.min(maxUpscale, variant.maxDim / Math.max(cropW, cropH));
  const drawW = Math.max(1, Math.round(cropW * scale));
  const drawH = Math.max(1, Math.round(cropH * scale));

  const swapAxes = variant.angleDeg === 90 || variant.angleDeg === 270;
  // Quiet-zone putih di sekeliling gambar membantu pembacaan barcode yang terpotong mepet tepi
  const quietPad = 24;
  const outW = (swapAxes ? drawH : drawW) + quietPad * 2;
  const outH = (swapAxes ? drawW : drawH) + quietPad * 2;

  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return false;

  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, outW, outH);
  ctx.translate(outW / 2, outH / 2);
  if (variant.angleDeg !== 0) {
    ctx.rotate((variant.angleDeg * Math.PI) / 180);
  }
  ctx.drawImage(src, sx, sy, cropW, cropH, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.restore();

  if (variant.boostContrast) {
    applyPixelContrastBoost(ctx, outW, outH);
  }
  return true;
}

async function decodeCanvasWithEngines(
  canvas: HTMLCanvasElement,
  nativeDetector: any,
  zxingShim: any
): Promise<string | null> {
  // 1. Sub-Pixel Soft-Edge EAN-13 Reader (~15ms): menembus foto WhatsApp/iPhone yang terlalu rapat/blur bagi ZXing
  const softEan = decodeEan13SoftEdgeFromCanvas(canvas, 2);
  if (softEan) return softEan;

  // 2. Native BarcodeDetector jika tersedia di browser
  if (nativeDetector && typeof nativeDetector.detect === "function") {
    try {
      const detected = await nativeDetector.detect(canvas);
      if (Array.isArray(detected) && detected.length > 0) {
        const picked = await pickBestDecodedCandidate(
          detected.map((d: any) => String(d?.rawValue || ""))
        );
        if (picked) return picked;
      }
    } catch {}
  }

  // 3. ZXing MultiFormatReader (Code-128, QR, Code-39, EAN-8, ITF, dll)
  if (zxingShim && typeof zxingShim.decodeRobustlyAsync === "function") {
    try {
      const result = await zxingShim.decodeRobustlyAsync(canvas);
      const text = String(result?.text || "").trim();
      if (text) return text;
    } catch {}
  }

  return null;
}

/**
 * Multi-pass rotasi, quiet-zone, dan contrast boost pada source canvas
 * (dipakai oleh tombol "Jepret Frame" di kamera live Safari / HP tanpa native detector).
 */
export async function decodeBarcodeFromCanvas(
  sourceCanvas: HTMLCanvasElement,
  engines: {
    nativeDetector?: any;
    zxingShim?: any;
  }
): Promise<string | null> {
  const { nativeDetector, zxingShim } = engines;
  const workCanvas = document.createElement("canvas");

  try {
    for (const variant of IMAGE_DECODE_VARIANTS) {
      if (!renderVariantToCanvas(workCanvas, sourceCanvas, variant)) continue;
      const hit = await decodeCanvasWithEngines(workCanvas, nativeDetector, zxingShim);
      if (hit) return hit;
    }
    return null;
  } finally {
    workCanvas.width = 0;
    workCanvas.height = 0;
  }
}

/**
 * Membaca barcode (EAN-13, UPC, Code-128, QR, dll) secara otomatis dari file gambar/foto galeri
 * dengan multi-pass rotasi, quiet-zone padding, peningkatan kontras, dan crop area tengah.
 */
export async function decodeBarcodeFromFile(
  file: File,
  engines: {
    nativeDetector?: any;
    zxingShim?: any;
    html5Qrcode?: Html5Qrcode | null;
  }
): Promise<string | null> {
  const { nativeDetector, zxingShim, html5Qrcode } = engines;
  const { img, cleanup } = await loadImageFromFile(file);
  const workCanvas = document.createElement("canvas");

  try {
    for (const variant of IMAGE_DECODE_VARIANTS) {
      if (!renderVariantToCanvas(workCanvas, img, variant)) continue;
      const hit = await decodeCanvasWithEngines(workCanvas, nativeDetector, zxingShim);
      if (hit) return hit;
    }

    if (html5Qrcode && typeof html5Qrcode.scanFileV2 === "function") {
      try {
        const fileRes = await html5Qrcode.scanFileV2(file, false);
        const text = String(fileRes?.decodedText || "").trim();
        if (text) return text;
      } catch {}
    }

    return null;
  } finally {
    cleanup();
    workCanvas.width = 0;
    workCanvas.height = 0;
  }
}

