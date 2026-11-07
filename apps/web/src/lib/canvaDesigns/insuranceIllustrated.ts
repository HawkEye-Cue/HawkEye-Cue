/**
 * INSURANCE (same caption) · STYLE 2 of 3: ILLUSTRATED.
 * Original HawkEye-Cue vector art: layered soft backdrop, a shield holding a house, and a
 * "covered" check badge. Every piece is a separate named object (Layers panel).
 */
import type { DesignInput, DesignSpec, LayerSpec } from './spec';
import { MONT, brandBlock, headlineLayer, subLayer, kickerLayer, ctaPill, compact } from './kit';

/** The illustration, anchored at (ox, oy). All pieces are individual, editable, named objects. */
export function shieldHouse(ox: number, oy: number, s = 1, accent = '#22c55e'): LayerSpec[] {
  const P = (id: string, label: string, d: string, fill: any, extra: object = {}): LayerSpec =>
    ({ kind: 'path', id, label, group: 'illustration', d, fill, left: ox, top: oy, ...extra } as LayerSpec);
  const k = (n: number) => Math.round(n * s);
  return [
    { kind: 'ellipse', id: 'ill-shadow', label: 'Illustration · ground shadow', group: 'illustration', rx: k(210), ry: k(24),
      left: ox + k(20), top: oy + k(560), fill: 'rgba(23,37,84,0.18)' },
    P('ill-shield', 'Illustration · shield',
      `M ${k(230)} 0 L ${k(440)} ${k(70)} V ${k(290)} C ${k(440)} ${k(420)} ${k(360)} ${k(520)} ${k(230)} ${k(580)} C ${k(100)} ${k(520)} ${k(20)} ${k(420)} ${k(20)} ${k(290)} V ${k(70)} Z`,
      { from: '#3b82f6', to: '#1e3a8a', angle: 90 }),
    P('ill-shield-inner', 'Illustration · shield highlight',
      `M ${k(230)} ${k(40)} L ${k(405)} ${k(98)} V ${k(290)} C ${k(405)} ${k(398)} ${k(340)} ${k(480)} ${k(230)} ${k(534)} C ${k(120)} ${k(480)} ${k(55)} ${k(398)} ${k(55)} ${k(290)} V ${k(98)} Z`,
      'rgba(255,255,255,0.14)'),
    P('ill-roof', 'Illustration · roof', `M ${k(230)} ${k(150)} L ${k(380)} ${k(268)} H ${k(80)} Z`, { from: '#ffffff', to: '#cfe0ff', angle: 0 }),
    P('ill-chimney', 'Illustration · chimney', `M ${k(300)} ${k(178)} h ${k(34)} v ${k(60)} h ${k(-34)} Z`, '#dbe8ff'),
    P('ill-walls', 'Illustration · house', `M ${k(110)} ${k(268)} H ${k(350)} V ${k(410)} H ${k(110)} Z`, '#ffffff'),
    P('ill-door', 'Illustration · door', `M ${k(205)} ${k(318)} h ${k(50)} v ${k(92)} h ${k(-50)} Z`, '#2563eb'),
    P('ill-window-l', 'Illustration · window left', `M ${k(130)} ${k(300)} h ${k(48)} v ${k(48)} h ${k(-48)} Z`, '#bfd7fb'),
    P('ill-window-r', 'Illustration · window right', `M ${k(282)} ${k(300)} h ${k(48)} v ${k(48)} h ${k(-48)} Z`, '#bfd7fb'),
    { kind: 'ellipse', id: 'ill-badge', label: 'Illustration · check badge', group: 'illustration', rx: k(72), ry: k(72),
      left: ox + k(380), top: oy + k(430), fill: accent, stroke: '#ffffff', strokeWidth: k(12) },
    P('ill-check', 'Illustration · check mark', `M ${k(410)} ${k(500)} L ${k(437)} ${k(528)} L ${k(486)} ${k(468)}`, 'transparent',
      { stroke: '#ffffff', strokeWidth: k(17) }),
  ];
}

export function insuranceIllustrated(inp: DesignInput): DesignSpec {
  const A = inp.accent || '#2563eb';
  const hasB = !!(inp.company || inp.phone);
  const layers = compact([
    { kind: 'rect', id: 'bg', label: 'Background gradient', group: 'background', left: 0, top: 0, width: 1080, height: 1080,
      fill: { from: '#f3f8ff', to: '#c9defc', angle: 55 } },
    { kind: 'ellipse', id: 'blob-1', label: 'Backdrop circle · top', group: 'decoration', rx: 250, ry: 250, left: 700, top: -120, fill: 'rgba(255,255,255,0.65)' },
    { kind: 'ellipse', id: 'blob-2', label: 'Backdrop circle · bottom', group: 'decoration', rx: 300, ry: 300, left: -170, top: 640, fill: 'rgba(147,197,253,0.30)' },
    { kind: 'ellipse', id: 'blob-3', label: 'Backdrop dot', group: 'decoration', rx: 62, ry: 62, left: 560, top: 820, fill: 'rgba(37,99,235,0.14)' },
    ...shieldHouse(560, 150, 1.0),
    { kind: 'rect', id: 'accent-bar', label: 'Accent bar', group: 'decoration', left: 80, top: 100, width: 84, height: 9, radius: 4, fill: A },
    kickerLayer(inp, { left: 80, top: 126, width: 470, fill: A }),
    headlineLayer(inp, { left: 80, top: 184, width: 500, fontSize: 88, fill: '#0f2557' }),
    subLayer(inp, { left: 80, top: 600, width: 470, fontSize: 40, fill: '#1e3a8a', lineHeight: 1.3, fit: { maxLines: 4, minSize: 36, maxHeight: 230 }, below: { id: 'headline', gap: 28 } }),
    // CTA flows below the text but is clamped so its bottom stays well clear of the footer band
    // (footer at y=944; pill is 92 tall, so maxTop=812 leaves a 40px gap above the footer).
    ...ctaPill(inp, { x: 80, y: 790, w: 470, h: 92, fill: '#0f2557', color: '#ffffff', size: 34, below: inp.sub.length ? { id: 'sub', gap: 36, maxTop: 812 } : { id: 'headline', gap: 44, maxTop: 812 } }),
    ...(hasB ? [
      { kind: 'rect', id: 'footer', label: 'Footer band', group: 'decoration', left: 0, top: 944, width: 1080, height: 136, fill: '#0f2557' } as LayerSpec,
      { kind: 'rect', id: 'footer-accent', label: 'Footer accent', group: 'decoration', left: 0, top: 944, width: 1080, height: 8, fill: '#3b82f6' } as LayerSpec,
    ] : []),
    ...brandBlock(inp, { x: 80, y: 992, w: 560, nameSize: 42, phoneSize: 40, nameColor: '#ffffff', phoneColor: '#fbbf24', stack: false, phoneX: 620, phoneW: 380 }),
  ] as any);
  return { id: 'insurance-illustrated', title: 'Insurance · illustrated', style: 'illustrated', trade: 'insurance', width: 1080, height: 1080,
    background: '#e6f0ff', layers, caption: inp.caption, imageShowsSummary: !!inp.shortened };
}


