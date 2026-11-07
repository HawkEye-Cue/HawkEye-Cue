/** DEV PROTOTYPE: small helpers shared by the design generators. */
import type { DesignInput, LayerSpec, TextSpec } from './spec';

export const MONT = 'Montserrat';
export const PLAY = 'Playfair Display';

/** Brand slots: filled ONLY from the Brand Kit. Empty -> no layer at all (never a placeholder). */
export function brandBlock(
  inp: DesignInput,
  o: { x: number; y: number; w: number; align?: 'left' | 'center' | 'right'; nameSize?: number; phoneSize?: number;
       nameColor: string; phoneColor: string; family?: string; gap?: number; stack?: boolean; phoneX?: number; phoneW?: number },
): LayerSpec[] {
  const out: LayerSpec[] = [];
  const align = o.align ?? 'left';
  const nameSize = o.nameSize ?? 44, phoneSize = o.phoneSize ?? 42;
  if (inp.company) {
    // Side-by-side footers (stack:false) give the name only the room left of the phone; the name then
    // shrinks (measured, never below 24px) or wraps to a second line instead of colliding.
    const side = o.stack === false && !!inp.phone;
    const nameW = side && o.phoneX != null ? Math.max(200, o.phoneX - o.x - 24) : o.w;
    out.push({ kind: 'text', id: 'brand', label: 'Business name', group: 'branding', text: inp.company, left: o.x, top: o.y, width: nameW,
      fontFamily: o.family ?? MONT, fontSize: nameSize, fontWeight: 800, fill: o.nameColor, textAlign: align, role: { isBrandSlot: true },
      fit: { maxLines: 2, minSize: 32, maxHeight: nameSize * 2.5, oneLineFirst: true } });
  }
  if (inp.phone) {
    const py = o.stack === false ? o.y : o.y + (inp.company ? nameSize * 1.35 + (o.gap ?? 6) : 0);
    // stacked: the phone flows below the MEASURED bottom of the business name (whatever size it fitted to)
    const flow = o.stack !== false && inp.company ? { below: { id: 'brand', gap: o.gap ?? 6 } } : {};
    out.push({ kind: 'text', id: 'phone', label: 'Phone', group: 'branding', text: inp.phone, left: o.phoneX ?? o.x, top: py, width: o.phoneW ?? o.w, ...flow,
      fontFamily: MONT, fontSize: phoneSize, fontWeight: 700, fill: o.phoneColor, textAlign: o.stack === false ? 'right' : align,
      role: { isBrandSlot: true, isPhoneSlot: true } });
  }
  return out;
}

export const hasBrand = (i: DesignInput) => !!(i.company || i.phone);

/** Join display lines the way Fabric will wrap them (explicit newlines). */
export const lines = (a: string[]) => a.join('\n');

export function headlineLayer(inp: DesignInput, p: Partial<TextSpec> & { left: number; top: number; width: number; fontSize: number; fill: string }): TextSpec {
  return { kind: 'text', id: 'headline', label: 'Headline', group: 'text', text: lines(inp.headline), fontFamily: MONT, fontWeight: 900,
    lineHeight: 1.04, role: { isHeadline: true }, ...p } as TextSpec;
}
export function subLayer(inp: DesignInput, p: Partial<TextSpec> & { left: number; top: number; width: number; fontSize: number; fill: string }): TextSpec | null {
  if (!inp.sub.length) return null;
  return { kind: 'text', id: 'sub', label: 'Supporting text', group: 'text', text: lines(inp.sub), fontFamily: MONT, fontWeight: 500,
    lineHeight: 1.3, role: { isSubtext: true }, ...p } as TextSpec;
}
export function kickerLayer(inp: DesignInput, p: Partial<TextSpec> & { left: number; top: number; width: number; fill: string }): TextSpec | null {
  if (!inp.tradeLabel) return null;
  return { kind: 'text', id: 'kicker', label: 'Trade label', group: 'text', text: inp.tradeLabel.toUpperCase(), fontFamily: MONT, fontSize: 32,
    fontWeight: 800, charSpacing: 280, role: { isKicker: true }, ...p } as TextSpec;
}
export function ctaPill(inp: DesignInput, o: { x: number; y: number; w: number; h: number; fill: string; color: string; radius?: number; size?: number;
  /** flow the button a measured gap below another layer instead of using a fixed y (maxTop clamps it) */
  below?: { id: string; gap: number; maxTop?: number } }): LayerSpec[] {
  if (!inp.cta) return [];
  return [
    { kind: 'rect', id: 'cta', label: 'Button', group: 'decoration', left: o.x, top: o.y, width: o.w, height: o.h, radius: o.radius ?? o.h / 2, fill: o.fill,
      ...(o.below ? { below: o.below } : {}) },
    // the label is centred inside its button by MEASURED text height (works for any font size)
    { kind: 'text', id: 'cta-text', label: 'Button text', group: 'text', text: inp.cta.toUpperCase(), left: o.x, top: o.y,
      width: o.w, textAlign: 'center', fontFamily: MONT, fontSize: o.size ?? 38, fontWeight: 800, charSpacing: 60, fill: o.color, role: { isCta: true },
      centerIn: 'cta' },
  ];
}
export const compact = (a: (LayerSpec | null | undefined)[]): LayerSpec[] => a.filter(Boolean) as LayerSpec[];

