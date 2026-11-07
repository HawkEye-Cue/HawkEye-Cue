/**
 * INSURANCE (same caption) · STYLE 1 of 3: PHOTO-BASED.
 * Full-bleed photograph + legibility gradient, accent bar, big Montserrat headline, a frosted panel that
 * HUGS the supporting text, a pill CTA placed a measured gap below it, and a brand footer.
 * The photo is one replaceable object; it must be RELEVANT to the caption (here: a home, for a
 * "is your home covered" post). The panel/CTA positions are flowed from measured text heights.
 */
import type { DesignInput, DesignSpec } from './spec';
import { brandBlock, headlineLayer, subLayer, kickerLayer, ctaPill, compact } from './kit';

export function insurancePhoto(inp: DesignInput): DesignSpec {
  const A = inp.accent || '#f5b301';
  const hasB = !!(inp.company || inp.phone);
  const hasSub = inp.sub.length > 0;
  const layers = compact([
    { kind: 'rect', id: 'bg', label: 'Background colour', group: 'background', left: 0, top: 0, width: 1080, height: 1080, fill: '#0b1b33' },
    inp.photoSrc ? { kind: 'photo', id: 'photo', label: 'Photo (replaceable)', group: 'photo', src: inp.photoSrc, left: 0, top: 0, width: 1080, height: 1080, focus: [0.5, 0.35] } : null,
    { kind: 'rect', id: 'scrim', label: 'Legibility gradient', group: 'decoration', left: 0, top: 0, width: 1080, height: 1080,
      fill: { from: '#06101f', to: '#06101f', angle: 90, stops: [[0, 'rgba(6,16,31,0.86)'], [0.22, 'rgba(6,16,31,0.74)'], [0.5, 'rgba(6,16,31,0.70)'], [1, 'rgba(6,16,31,0.95)']] } },
    { kind: 'rect', id: 'accent-bar', label: 'Accent bar', group: 'decoration', left: 80, top: 92, width: 84, height: 9, radius: 4, fill: A },
    kickerLayer(inp, { left: 80, top: 120, width: 800, fill: A }),
    headlineLayer(inp, { left: 80, top: 184, width: 920, fontSize: 112, fill: '#ffffff', shadow: 'rgba(0,0,0,0.35) 0px 6px 24px' }),
    // supporting text first, then a panel that wraps it (panel sits BELOW the text in z-order but is sized from it)
    hasSub ? { kind: 'rect', id: 'panel', label: 'Info panel', group: 'decoration', left: 80, top: 650, width: 920, height: 120, radius: 28,
      fill: 'rgba(255,255,255,0.15)', stroke: 'rgba(255,255,255,0.30)', strokeWidth: 2, wrap: { id: 'sub', pad: 34, minH: 120 } } : null,
    subLayer(inp, { left: 116, top: 680, width: 850, fontSize: 44, fill: '#ffffff', lineHeight: 1.28, fit: { maxLines: 3, minSize: 40, maxHeight: 200 } }),
    ...ctaPill(inp, { x: 80, y: hasB ? 852 : 884, w: 520, h: 94, fill: A, color: '#0b1b33', size: 36, below: hasSub ? { id: 'panel', gap: 36 } : undefined }),
    ...(hasB ? [{ kind: 'rect', id: 'footer-rule', label: 'Divider', group: 'decoration', left: 80, top: 972, width: 920, height: 2, fill: 'rgba(255,255,255,0.35)' } as const] : []),
    ...brandBlock(inp, { x: 80, y: 996, w: 600, nameSize: 40, phoneSize: 40, nameColor: '#ffffff', phoneColor: A, stack: false, phoneX: 640, phoneW: 360 }),
  ] as any);
  return { id: 'insurance-photo', title: 'Insurance · photo-based', style: 'photo', trade: 'insurance', width: 1080, height: 1080,
    background: '#0b1b33', layers, caption: inp.caption, imageShowsSummary: !!inp.shortened };
}

