/**
 * Prepare a photo for AI editing in the browser.
 *
 * Phone photos are often 3–12 MB and 4000px+. The server (and OpenAI's edits endpoint) cap
 * input at 4 MB, and the request travels as base64 JSON through API Gateway (10 MB limit;
 * base64 adds ~33%). So we downscale to a max edge and re-encode before sending. This also
 * makes edits faster and cheaper (fewer image input tokens).
 */

/** The model works at 1024px, so larger inputs only add cost/latency without benefit. */
export const EDIT_MAX_EDGE = 1536;
/** Stay comfortably under the server's 4 MB cap. */
export const EDIT_MAX_BYTES = 3.5 * 1024 * 1024;

/** Pure: compute the downscaled dimensions that fit within `maxEdge`, preserving aspect. */
export function fitWithin(width: number, height: number, maxEdge = EDIT_MAX_EDGE): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** Pure: approximate decoded byte size of a base64 data URL. */
export function dataUrlBytes(dataUrl: string): number {
  const i = dataUrl.indexOf(',');
  const b64 = i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

/**
 * Browser-only: load an image source (data URL / object URL), downscale, and re-encode as
 * PNG (preferred, lossless) — falling back to JPEG at decreasing quality if still too large.
 */
export async function prepareImageForEdit(src: string): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = 'anonymous';
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Could not read that photo.'));
    el.src = src;
  });

  const { width, height } = fitWithin(img.naturalWidth, img.naturalHeight);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Your browser could not process this photo.');
  ctx.drawImage(img, 0, 0, width, height);

  let out = canvas.toDataURL('image/png');
  if (dataUrlBytes(out) <= EDIT_MAX_BYTES) return out;

  for (const q of [0.92, 0.85, 0.75, 0.6]) {
    out = canvas.toDataURL('image/jpeg', q);
    if (dataUrlBytes(out) <= EDIT_MAX_BYTES) return out;
  }
  throw new Error('That photo is too large to edit. Try a smaller one.');
}
