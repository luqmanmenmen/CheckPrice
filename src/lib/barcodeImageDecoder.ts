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

function renderVariantToCanvas(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  variant: DecodeVariant
): boolean {
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
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
  if (variant.boostContrast && "filter" in ctx) {
    ctx.filter = "grayscale(100%) contrast(175%) brightness(105%)";
  }
  ctx.drawImage(img, sx, sy, cropW, cropH, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.restore();
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

