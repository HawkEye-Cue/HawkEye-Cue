/**
 * DEV PROTOTYPE: a design is a plain list of layer specs. `buildDesign` (builder.ts) turns each spec
 * into ONE real Fabric object, tagged with the `data` role tags the existing Design Studio already
 * understands (isHeadline / isSubtext / isBrandSlot / isPhoneSlot / isPlaceholder / isLogoSlot ...),
 * so the unmodified Studio can open, edit, save and re-open it.
 *
 * Copy rule: every word comes from the caption or the Brand Kit. Nothing is invented.
 */
export type Grad = { from: string; to: string; angle?: number; stops?: [number, string][] };

interface Base {
  id: string;
  /** human-readable layer name shown in the Studio Layers panel */
  label?: string;
  /** which editable group this belongs to (for the report): illustration | photo | background | text | branding | decoration */
  group: 'illustration' | 'photo' | 'background' | 'text' | 'branding' | 'decoration';
  left?: number; top?: number; opacity?: number;
  /** FLOW: place this layer `gap` px below the (measured) bottom of layer `id` (so spacing is guaranteed, not hand-tuned).
   *  `maxTop` clamps the result so the layer never drifts into a fixed element below it (e.g. a footer). */
  below?: { id: string; gap: number; maxTop?: number };
  /** vertically centre this layer inside layer `id` (e.g. button label inside its pill) */
  centerIn?: string;
  /** size this rect to HUG layer `id` (+pad), e.g. a panel behind supporting text */
  wrap?: { id: string; pad: number; minH?: number };
}
export interface RectSpec extends Base {
  kind: 'rect'; width: number; height: number; radius?: number; fill?: string | Grad;
  stroke?: string; strokeWidth?: number; angle?: number; shadow?: string; role?: Record<string, boolean>;
}
export interface EllipseSpec extends Base {
  kind: 'ellipse'; rx: number; ry: number; fill?: string | Grad; stroke?: string; strokeWidth?: number; shadow?: string;
}
export interface PathSpec extends Base {
  kind: 'path'; d: string; fill?: string | Grad; stroke?: string; strokeWidth?: number; shadow?: string;
}
export interface PhotoSpec extends Base {
  kind: 'photo'; src: string; width: number; height: number;
  /** clip shape: rect (default), rounded, arch, circle */
  mask?: 'rect' | 'rounded' | 'arch' | 'circle'; radius?: number;
  /** focal point 0..1 used by cover-fit (so a replacement photo can be re-centred) */
  focus?: [number, number];
}
export interface TextSpec extends Base {
  kind: 'text'; text: string; width: number; fontFamily: string; fontSize: number; fontWeight?: number | string;
  fill?: string; textAlign?: 'left' | 'center' | 'right'; charSpacing?: number; lineHeight?: number;
  fontStyle?: 'normal' | 'italic'; shadow?: string;
  /** Measured fit: shrink (never below minSize) until the wrapped text fits maxLines / the zone height.
   *  If it still does not fit, the text ends with an ellipsis and `data.excerpt` is set (full text kept in `data.fullText`). */
  fit?: { maxLines: number; minSize: number; maxHeight?: number; oneLineFirst?: boolean };
  /** Fixed box the text lives in. After fitting, the text is placed inside it (default: vertically centred). */
  zone?: { top: number; height: number; valign?: 'top' | 'center' };
  role?: { isHeadline?: boolean; isSubtext?: boolean; isBrandSlot?: boolean; isPhoneSlot?: boolean; isKicker?: boolean; isCta?: boolean };
}
export type LayerSpec = RectSpec | EllipseSpec | PathSpec | PhotoSpec | TextSpec;

export interface DesignSpec {
  id: string; title: string; style: 'photo' | 'illustrated' | 'editorial'; trade: string;
  width: number; height: number; background: string;
  layers: LayerSpec[];
  /** the caption the design was composed from (kept verbatim; the design shows only an excerpt) */
  caption: string;
  /** a specific listing without the customer's own property photo: the UI must prompt for it */
  needsPropertyPhoto?: boolean;
  /** the image shows a shorter version of the caption: the UI should say so (the full caption is untouched) */
  imageShowsSummary?: boolean;
}

/** Everything a design needs from the user. Empty strings mean "not provided": the layer is omitted. */
export interface DesignInput {
  caption: string;
  headline: string[];     // headline split into display lines
  sub: string[];          // supporting lines (from the caption)
  shortened?: boolean;    // the image shows a shorter version of the caption (the full caption is still kept)
  chips?: string[];       // short feature phrases taken from the caption
  cta?: string;           // only when the caption expresses an intent (e.g. "free quote")
  tradeLabel?: string;    // the user's trade name
  company: string; phone: string;
  accent?: string;        // customised Brand Kit colour, if the user chose one
  photoSrc?: string;      // the user's own / curated photo
}

