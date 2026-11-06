/**
 * renderTemplatePreview — produce a REAL finished-looking thumbnail of a DesignTemplate.
 *
 * Two renderers, same layout contract as DesignStudio:
 *   • renderTemplateToDataUrl  — Fabric-rendered (pixel-accurate to the studio), for crisp
 *     previews. Lazy-imports Fabric so it never bloats the entry chunk.
 *   • renderTemplateToSvg      — lightweight SVG string, no Fabric, instant; the mobile /
 *     low-end fallback. Approximates the same layout (rects + text + brand colors).
 *
 * Neither renderer calls any API or AI model — zero image credits.
 *
 * Results are cached by a caller-supplied signature so the same composition is not re-rendered.
 */

import type { DesignTemplate, DesignLayer } from './designTemplates';
import type { BrandKit } from './brandKit';

// ─── Fabric thumbnail (fidelity path) ─────────────────────────────────────────

const dataUrlCache = new Map<string, string>();

function fitLogo(slotW: number, slotH: number, imgW: number, imgH: number) {
  const s = Math.min(slotW / (imgW || slotW), slotH / (imgH || slotH));
  return s;
}

export async function renderTemplateToDataUrl(
  template: DesignTemplate,
  brandKit: BrandKit,
  opts: { cacheKey?: string; thumbWidth?: number } = {},
): Promise<string> {
  const { cacheKey, thumbWidth = 320 } = opts;
  if (cacheKey && dataUrlCache.has(cacheKey)) return dataUrlCache.get(cacheKey)!;

  const { StaticCanvas, Rect, Textbox, FabricImage } = await import('fabric');
  // StaticCanvas = no interaction/event overhead; ideal for off-screen thumbnails.
  const el = document.createElement('canvas');
  const fc = new StaticCanvas(el, {
    width: template.width,
    height: template.height,
    backgroundColor: template.background,
    renderOnAddRemove: false,
  });

  try {
    for (const layer of template.layers) {
      if (layer.type === 'rect') {
        fc.add(new Rect({
          left: layer.left ?? 0, top: layer.top ?? 0,
          width: layer.width ?? template.width, height: layer.height ?? 40,
          fill: layer.backgroundColor ?? layer.fill ?? '#000000',
        } as any));
      } else if (layer.type === 'text') {
        fc.add(new Textbox(layer.text || '', {
          left: layer.left ?? 0, top: layer.top ?? 0,
          width: layer.width ?? template.width - (layer.left ?? 80) * 2,
          fontFamily: layer.fontFamily ?? 'Arial', fontSize: layer.fontSize ?? 40,
          fontWeight: layer.fontWeight ?? 'normal', fill: layer.fill ?? '#ffffff',
          textAlign: layer.textAlign ?? 'left',
        } as any));
      } else if (layer.type === 'image' && layer.src) {
        try {
          const img = await FabricImage.fromURL(layer.src, { crossOrigin: 'anonymous' });
          img.set({ left: layer.left ?? 0, top: layer.top ?? 0, scaleX: layer.scaleX ?? 1, scaleY: layer.scaleY ?? 1 } as any);
          fc.add(img);
        } catch { /* skip broken image */ }
      }
    }
    // Brand logo into the logo slot, when present.
    if (brandKit.logoDataUrl) {
      const slot = template.layers.find((l) => l.isLogoSlot);
      try {
        const img = await FabricImage.fromURL(brandKit.logoDataUrl);
        const tw = slot?.width ?? 180, th = slot?.height ?? 180;
        const s = fitLogo(tw, th, img.width || tw, img.height || th);
        img.set({ left: slot?.left ?? template.width - tw - 40, top: slot?.top ?? template.height - th - 40, scaleX: s, scaleY: s } as any);
        fc.add(img);
      } catch { /* logo optional */ }
    }
    fc.renderAll();
    const multiplier = thumbWidth / template.width;
    const url = fc.toDataURL({ format: 'jpeg', quality: 0.72, multiplier });
    if (cacheKey) dataUrlCache.set(cacheKey, url);
    return url;
  } finally {
    try { fc.dispose(); } catch { /* ignore */ }
  }
}

// ─── SVG preview (instant fallback) ────────────────────────────────────────────

function esc(s: string): string {
  return (s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

/** Render a close-approximation SVG (no Fabric). Good enough for a thumbnail on mobile. */
export function renderTemplateToSvg(template: DesignTemplate, brandKit: BrandKit): string {
  const { width, height, background } = template;
  const parts: string[] = [];
  parts.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="${esc(background)}"/>`);
  for (const layer of template.layers) {
    if (layer.type === 'rect') {
      parts.push(`<rect x="${layer.left ?? 0}" y="${layer.top ?? 0}" width="${layer.width ?? width}" height="${layer.height ?? 40}" fill="${esc(layer.backgroundColor ?? layer.fill ?? '#000')}"/>`);
    } else if (layer.type === 'text') {
      const lines = String(layer.text || '').split('\n');
      const size = layer.fontSize ?? 40;
      const weight = layer.fontWeight ?? 'normal';
      const anchor = layer.textAlign === 'center' ? 'middle' : layer.textAlign === 'right' ? 'end' : 'start';
      const x = anchor === 'middle' ? (layer.left ?? 0) + (layer.width ?? width) / 2 : (layer.left ?? 0);
      lines.forEach((line, i) => {
        parts.push(`<text x="${x}" y="${(layer.top ?? 0) + size + i * size * 1.1}" font-family="${esc(layer.fontFamily ?? 'Arial, sans-serif')}" font-size="${size}" font-weight="${esc(weight)}" fill="${esc(layer.fill ?? '#fff')}" text-anchor="${anchor}">${esc(line)}</text>`);
      });
    } else if (layer.type === 'image' && layer.isLogoSlot && brandKit.logoDataUrl) {
      parts.push(`<image href="${esc(brandKit.logoDataUrl)}" x="${layer.left ?? 0}" y="${layer.top ?? 0}" width="${layer.width ?? 180}" height="${layer.height ?? 180}"/>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(template.name)} preview">${parts.join('')}</svg>`;
}

/** Heuristic: use the SVG fallback on small/low-end viewports to keep rendering snappy. */
export function preferSvgPreview(): boolean {
  if (typeof window === 'undefined') return false;
  const narrow = window.innerWidth < 640;
  const lowCores = typeof navigator !== 'undefined' && (navigator.hardwareConcurrency || 8) <= 4;
  return narrow || lowCores;
}

export function clearPreviewCache(): void {
  dataUrlCache.clear();
}
