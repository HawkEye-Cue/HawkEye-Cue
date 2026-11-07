/**
 * INSURANCE (same caption) · STYLE 3 of 3: MINIMAL / EDITORIAL.
 * Warm paper, generous whitespace, Playfair Display serif headline, hairline rules and a circle-masked
 * photo placed in the lower right, level with the supporting text so the two read as one block.
 */
import type { DesignInput, DesignSpec } from './spec';
import { MONT, PLAY, brandBlock, headlineLayer, subLayer, kickerLayer, ctaPill, compact } from './kit';

export function insuranceEditorial(inp: DesignInput): DesignSpec {
  const INK = '#1b1a17', A = inp.accent || '#9a3412';
  const hasB = !!(inp.company || inp.phone);
  const R = 150; // photo radius
  const layers = compact([
    { kind: 'rect', id: 'bg', label: 'Paper background', group: 'background', left: 0, top: 0, width: 1080, height: 1080, fill: '#f5efe3' },
    { kind: 'rect', id: 'frame', label: 'Hairline frame', group: 'decoration', left: 44, top: 44, width: 992, height: 992, fill: 'transparent', stroke: 'rgba(27,26,23,0.28)', strokeWidth: 2 },
    kickerLayer(inp, { left: 110, top: 108, width: 640, fill: A, fontSize: 30, charSpacing: 320 }),
    { kind: 'rect', id: 'rule-top', label: 'Rule', group: 'decoration', left: 110, top: 160, width: 120, height: 4, fill: A },
    headlineLayer(inp, { left: 110, top: 196, width: 860, fontSize: 116, fill: INK, fontFamily: PLAY, fontWeight: 700, lineHeight: 1.02 }),
    // photo: lower right, same band as the supporting text; hairline ring in the accent colour
    inp.photoSrc ? { kind: 'photo', id: 'photo', label: 'Photo (replaceable, circle mask)', group: 'photo', src: inp.photoSrc,
      left: 1080 - 110 - R * 2, top: 560, width: R * 2, height: R * 2, mask: 'circle', focus: [0.5, 0.5] } : null,
    inp.photoSrc ? { kind: 'ellipse', id: 'photo-ring', label: 'Photo ring', group: 'decoration', rx: R + 9, ry: R + 9, left: 1080 - 110 - R * 2 - 9, top: 551,
      fill: 'transparent', stroke: A, strokeWidth: 4 } : null,
    subLayer(inp, { left: 110, top: 590, width: inp.photoSrc ? 520 : 860, fontSize: 40, fill: '#2b2823', fontFamily: MONT, fontWeight: 500, lineHeight: 1.36,
      fit: { maxLines: 5, minSize: 36, maxHeight: 290 }, below: { id: 'headline', gap: 36 } }),
    { kind: 'rect', id: 'rule-bottom', label: 'Rule', group: 'decoration', left: 110, top: hasB ? 858 : 880, width: 860, height: 2, fill: 'rgba(27,26,23,0.35)' },
    ...ctaPill(inp, { x: 110, y: hasB ? 884 : 904, w: 420, h: 74, fill: INK, color: '#f5efe3', radius: 4, size: 32 }),
    ...brandBlock(inp, { x: 560, y: hasB ? 884 : 904, w: 410, align: 'right', nameSize: 38, phoneSize: 38, nameColor: INK, phoneColor: A, family: PLAY }),
  ] as any);
  return { id: 'insurance-editorial', title: 'Insurance · minimal editorial', style: 'editorial', trade: 'insurance', width: 1080, height: 1080,
    background: '#f5efe3', layers, caption: inp.caption, imageShowsSummary: !!inp.shortened };
}

