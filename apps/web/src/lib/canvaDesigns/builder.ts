/**
 * DEV PROTOTYPE builder: DesignSpec -> real Fabric objects (one object per layer, no flattening).
 * Uses the same Fabric (6.7) and the same `data` role tags as the production Design Studio.
 */
import type { DesignSpec, LayerSpec, Grad } from './spec';
import { placeInFrame, type PhotoFrame } from '../photoFrame';

type F = typeof import('fabric');

function paint(f: F, fill: string | Grad | undefined, w: number, h: number): any {
  if (!fill) return 'transparent';
  if (typeof fill === 'string') return fill;
  const a = ((fill.angle ?? 90) * Math.PI) / 180; // 90 = top -> bottom
  const dx = Math.cos(a), dy = Math.sin(a);
  const stops = fill.stops ?? [[0, fill.from], [1, fill.to]];
  return new f.Gradient({
    type: 'linear', gradientUnits: 'pixels',
    coords: { x1: w / 2 - (dx * w) / 2, y1: h / 2 - (dy * h) / 2, x2: w / 2 + (dx * w) / 2, y2: h / 2 + (dy * h) / 2 },
    colorStops: stops.map(([offset, color]) => ({ offset, color })),
  });
}
const shadowOf = (f: F, s?: string) => (s ? new f.Shadow(s as any) : undefined);

const bottomOf = (o: any) => (o.top ?? 0) + (o.height ?? 0) * (o.scaleY ?? 1);

export async function buildObjects(f: F, spec: DesignSpec): Promise<any[]> {
  const built: { l: LayerSpec; o: any }[] = [];
  for (const l of spec.layers) { const o = await buildOne(f, l); if (o) built.push({ l, o }); }
  const byId = new Map(built.map(({ l, o }) => [l.id, o]));
  // Layout helpers run in spec order, so a layer may reference any layer that comes before it.
  for (const { l, o } of built) {
    if (l.below) { const t = byId.get(l.below.id); if (t) { let top = bottomOf(t) + l.below.gap; if (l.below.maxTop != null) top = Math.min(top, l.below.maxTop); o.set({ top }); o.setCoords(); } }
    if (l.wrap) {
      // (the wrapped layer may be declared AFTER the wrapper so the wrapper sits below it in z-order)
      const t = byId.get(l.wrap.id);
      if (t) {
        const p = l.wrap.pad, h = Math.max((t.height ?? 0) * (t.scaleY ?? 1) + p * 2, l.wrap.minH ?? 0);
        o.set({ left: (t.left ?? 0) - p, top: (t.top ?? 0) - p, width: (t.width ?? 0) + p * 2, height: h });
        o.setCoords();
      }
    }
    if (l.centerIn) {
      const t = byId.get(l.centerIn);
      if (t) { o.set({ top: (t.top ?? 0) + (((t.height ?? 0) * (t.scaleY ?? 1)) - (o.height ?? 0) * (o.scaleY ?? 1)) / 2 }); o.setCoords(); }
    }
  }
  // Keep the customer's COMPLETE caption with the design (the image only ever shows a short version of it).
  const head = built.find(({ l }) => l.kind === 'text' && l.role?.isHeadline)?.o;
  if (head) head.data = { ...head.data, fullCaption: spec.caption, imageShowsSummary: !!spec.imageShowsSummary };
  return built.map((b) => b.o);
}

async function buildOne(f: F, l: LayerSpec): Promise<any> {
  const data: Record<string, unknown> = { id: l.id, label: l.label || l.id, group: l.group };
  const common = { left: l.left ?? 0, top: l.top ?? 0, opacity: l.opacity ?? 1 };
  switch (l.kind) {
    case 'rect': {
      Object.assign(data, l.role || {});
      return new f.Rect({ ...common, width: l.width, height: l.height, rx: l.radius ?? 0, ry: l.radius ?? 0,
        fill: paint(f, l.fill, l.width, l.height), stroke: l.stroke, strokeWidth: l.strokeWidth ?? 0, angle: l.angle ?? 0,
        shadow: shadowOf(f, l.shadow), objectCaching: false, data } as any);
    }
    case 'ellipse':
      return new f.Ellipse({ ...common, rx: l.rx, ry: l.ry, fill: paint(f, l.fill, l.rx * 2, l.ry * 2),
        stroke: l.stroke, strokeWidth: l.strokeWidth ?? 0, shadow: shadowOf(f, l.shadow), objectCaching: false, data } as any);
    case 'path': {
      // A path keeps the position it was DRAWN at, offset by (left, top) as an origin: the path's own
      // bounding box (pathOffset) is used so e.g. a window drawn at (130,300) lands at origin+(130,300).
      // (Treating left/top as the path's top-left stacked every piece of an illustration in one corner.)
      const p: any = new f.Path(l.d, { fill: 'transparent', stroke: l.stroke, strokeWidth: l.strokeWidth ?? 0, objectCaching: false } as any);
      const w = p.width || 1, h = p.height || 1;
      const drawnLeft = (p.pathOffset?.x ?? 0) - w / 2, drawnTop = (p.pathOffset?.y ?? 0) - h / 2;
      p.set({ opacity: common.opacity, left: (l.left ?? 0) + drawnLeft, top: (l.top ?? 0) + drawnTop,
        fill: paint(f, l.fill, w, h), shadow: shadowOf(f, l.shadow), data });
      return p;
    }
    case 'photo': {
      const img: any = await f.FabricImage.fromURL(l.src, { crossOrigin: 'anonymous' });
      const frame: PhotoFrame = { left: l.left ?? 0, top: l.top ?? 0, w: l.width, h: l.height, mask: l.mask || 'rect', radius: l.radius, focus: l.focus || [0.5, 0.5] };
      // `data.frame` is what lets the Design Studio re-apply this exact crop + mask on replacement.
      Object.assign(data, { isPhoto: true, mask: frame.mask, frame });
      placeInFrame(f, img, frame);
      img.set({ opacity: common.opacity, data, objectCaching: false });
      return img;
    }
    case 'text': {
      Object.assign(data, l.role || {});
      const tb: any = new f.Textbox(l.text, { ...common, width: l.width, fontFamily: l.fontFamily, fontSize: l.fontSize,
        fontWeight: l.fontWeight ?? 400, fill: l.fill ?? '#ffffff', textAlign: l.textAlign ?? 'left',
        charSpacing: l.charSpacing ?? 0, lineHeight: l.lineHeight ?? 1.1, fontStyle: l.fontStyle ?? 'normal',
        shadow: shadowOf(f, l.shadow), splitByGrapheme: false, objectCaching: false, data } as any);
      if (l.fit) fitTextbox(tb, l);
      if (l.zone) {
        const h = tb.height || 0;
        tb.set({ top: l.zone.top + (l.zone.valign === 'top' ? 0 : Math.max(0, (l.zone.height - h) / 2)) });
        tb.setCoords();
      }
      return tb;
    }
  }
}

/** Measured fit using Fabric's own layout (real font metrics), not a character-width guess. */
function fitTextbox(tb: any, l: Extract<LayerSpec, { kind: 'text' }>) {
  const fit = l.fit!;
  const full = String(tb.text);
  const lineCount = () => (tb.textLines ? tb.textLines.length : String(tb.text).split('\n').length);
  const fits = () => { tb.initDimensions(); return lineCount() <= fit.maxLines && (fit.maxHeight == null || tb.height <= fit.maxHeight); };
  let size = l.fontSize;
  const flat = full.replace(/\s*\n\s*/g, ' ');
  tb.set({ text: flat });                       // let Fabric wrap by width instead of fixed breaks
  if (fit.oneLineFirst) {
    // Names/phones read best on ONE line: shrink toward the floor first, wrap only if even the floor is too wide.
    let s1 = size;
    tb.set({ fontSize: s1 }); tb.initDimensions();
    while (lineCount() > 1 && s1 > fit.minSize) { s1 -= 2; tb.set({ fontSize: s1 }); tb.initDimensions(); }
    if (lineCount() <= 1) { tb.initDimensions(); return; }
    tb.set({ fontSize: size });
  }
  while (!fits() && size > fit.minSize) { size -= 2; tb.set({ fontSize: size }); }
  if (!fits()) {
    // still too long at the minimum size: cut at a word boundary and end with an ellipsis
    const words = flat.split(' ');
    while (words.length > 1 && !fits()) { words.pop(); tb.set({ text: words.join(' ').replace(/[\s.,;:!?-]+$/, '') + '\u2026' }); }
    tb.data = { ...tb.data, excerpt: true, fullText: full };
  }
  tb.initDimensions();
}

