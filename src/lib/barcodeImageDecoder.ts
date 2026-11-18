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
}

const IMAGE_DECODE_VARIANTS: DecodeVariant[] = [
  { angleDeg: 0, maxDim: 1600, cropRatio: 1.0, boostContrast: false },
  { angleDeg: 90, maxDim: 1600, cropRatio: 1.0, boostContrast: false },
  { angleDeg: 270, maxDim: 1600, cropRatio: 1.0, boostContrast: false },
  { angleDeg: 0, maxDim: 1600, cropRatio: 1.0, boostContrast: true },
  { angleDeg: 90, maxDim: 1600, cropRatio: 1.0, boostContrast: true },
  { angleDeg: 180, maxDim: 1600, cropRatio: 1.0, boostContrast: false },
  { angleDeg: 0, maxDim: 1400, cropRatio: 0.62, boostContrast: false },
  { angleDeg: 90, maxDim: 1400, cropRatio: 0.62, boostContrast: false },
];

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
      reject(new Error("File bukan gambar yang valid."));
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
  const cropH = Math.max(1, Math.floor(srcH * variant.cropRatio));
  const sx = Math.floor((srcW - cropW) / 2);
  const sy = Math.floor((srcH - cropH) / 2);

  const scale = Math.min(1, variant.maxDim / Math.max(cropW, cropH));
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

