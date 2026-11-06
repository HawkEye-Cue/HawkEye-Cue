/**
 * composeTemplate — content-aware template personalization (pure, no AI, no network, no cost).
 *
 * Takes a social-media caption + the user's trade + Brand Kit and rewrites a DesignTemplate's
 * editable TEXT layers so the graphic reflects the ACTUAL post: a real headline pulled from the
 * caption, a supporting subtext, a trade-appropriate CTA, and brand slots filled from the kit.
 *
 * Guarantees:
 *  - Never calls any API or AI model (zero image credits).
 *  - Only OVERRIDES layer text / size / position; never strips a layer's role flags, so the
 *    result stays fully editable and Brand/Wingman keep working after composition.
 *  - Never invents business facts — brand slots only fill when the kit actually has the value.
 *  - Layout stays clean: every rewritten text is fitted to the WIDTH and the VERTICAL ROOM the
 *    template leaves before the next element (CTA pill, phone, etc.), so copy never overlaps.
 *  - Brand colors are applied only when the user actually chose one AND it is readable on the
 *    template's background.
 */

import type { DesignTemplate, DesignLayer } from './designTemplates';
import { BRAND_KIT_DEFAULTS, type BrandKit } from './brandKit';

export interface ComposeInput {
  template: DesignTemplate;
  postText: string;
  tradeName?: string;
  brandKit: BrandKit;
}

// ─── Caption parsing ────────────────────────────────────────────────────────────

const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/gu;

/** Strip hashtags, @mentions, URLs, and emoji; collapse whitespace. */
export function cleanCaption(raw: string): string {
  return (raw || '')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[#@]\w+/g, ' ')
    .replace(EMOJI_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Split into sentence-like clauses (period, !, ?, newline, or dash boundaries). */
export function sentences(text: string): string[] {
  return cleanCaption(text)
    .split(/(?<=[.!?])\s+|\n+|\s+[—–-]\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const SMALL_WORDS = new Set(['a', 'an', 'and', 'the', 'or', 'for', 'to', 'of', 'in', 'on', 'at', 'with']);

function titleCase(p: string): string {
  return p
    .split(/\s+/)
    .map((w, i) => {
      if (w === w.toUpperCase() && w.length > 1) return w; // keep acronyms / intentional caps
      const lower = w.toLowerCase();
      if (i !== 0 && SMALL_WORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

/** Words a headline must never END on (a dangling connector reads as a cut-off sentence). */
const DANGLING = new Set([...SMALL_WORDS, 'just', 'is', 'are', 'who', 'that', 'our', 'we', 'while', 'when']);

const capFirst = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/**
 * Split a sentence into a punchy headline and the leftover words. A sentence up to softMax
 * chars stays WHOLE (the fitter wraps/shrinks it) so we don't amputate a short sentence; longer
 * ones are cut at a word boundary at maxChars, never ending on a dangling connector.
 */
export function splitHeadline(sentence: string, maxChars = 34, softMax = 48): { headline: string; rest: string } {
  const p = sentence.replace(/[.!?,;:]+$/, '').trim();
  if (p.length <= Math.max(maxChars, softMax)) return { headline: titleCase(p), rest: '' };
  const cut = p.slice(0, maxChars);
  const atBoundary = p.charAt(maxChars) === ' ';
  const words = (atBoundary ? cut : cut.slice(0, Math.max(cut.lastIndexOf(' '), 1))).trim().split(/\s+/);
  while (words.length > 2 && DANGLING.has(words[words.length - 1].toLowerCase())) words.pop();
  const headline = words.join(' ');
  return { headline: titleCase(headline), rest: capFirst(p.slice(headline.length).trim()) };
}

/** Title-case a short phrase for headline use (keeps ALL-CAPS words, lowercases filler). */
export function toHeadline(phrase: string, maxChars = 34): string {
  return splitHeadline(phrase, maxChars, maxChars).headline;
}

/** A short, trade-aware call to action derived from the caption's intent. */
export function deriveCta(caption: string, _tradeName?: string): string {
  const l = caption.toLowerCase();
  if (/\b(free|no cost|complimentary)\b/.test(l) && /\b(quote|estimate)/.test(l)) return 'Get a Free Quote';
  if (/\b(free|no cost|complimentary)\b/.test(l) && /\b(inspection|consult)/.test(l)) return 'Free Inspection';
  if (/\b(quote|estimate)\b/.test(l)) return 'Request a Quote';
  if (/\b(inspect|inspection)\b/.test(l)) return 'Book Inspection';
  if (/\b(call|phone|reach|contact)\b/.test(l)) return 'Call Us Today';
  if (/\b(sale|save|discount|off|deal|special)\b/.test(l)) return 'Save Today';
  if (/\b(listed|listing|open house|showing)\b/.test(l)) return 'Schedule a Showing';
  if (/\b(sold|closed)\b/.test(l)) return 'Thinking of Selling?';
  if (/\b(book|schedule|appointment)\b/.test(l)) return 'Book Now';
  return 'Learn More';
}

export interface DerivedCopy {
  headline: string;
  subtext: string;
  cta: string;
  /** true when the CTA came from a real intent in the caption (not the generic default) */
  ctaFromIntent: boolean;
}

/** Pull a headline + subtext + CTA from the caption. Falls back to template copy when empty. */
export function deriveCopy(opts: { postText: string; tradeName?: string; fallbackHeadline: string; fallbackSubtext: string }): DerivedCopy {
  const parts = sentences(opts.postText);
  let headline = opts.fallbackHeadline;
  let leftover = '';
  if (parts[0]) {
    const sp = splitHeadline(parts[0]);
    headline = sp.headline;
    leftover = sp.rest; // words of a long first sentence that did not fit the headline
  }
  const lead = leftover && parts.length > 1 && !/[.!?]$/.test(leftover) ? leftover + '.' : leftover;
  const rest = [lead, ...parts.slice(1)].filter(Boolean).join(' ').trim();
  const subtext = rest ? (rest.length > 120 ? rest.slice(0, 117).replace(/\s+\S*$/, '') + '…' : rest) : opts.fallbackSubtext;
  const cta = deriveCta(opts.postText, opts.tradeName);
  return { headline, subtext, cta, ctaFromIntent: cta !== 'Learn More' };
}

// ─── Text fitting (keeps composed designs polished — no overflow / collisions) ──

const GLYPH_W = 0.62;        // average glyph width / font size for regular faces
const GLYPH_W_BOLD = 0.72;   // bold / black display faces run wide
export const LINE_H = 1.32;         // Fabric's REAL line pitch: lineHeight 1.16 x internal font-size multiplier 1.13

function glyphW(layer: DesignLayer): number {
  const wt = String(layer.fontWeight || '');
  const fam = String(layer.fontFamily || '');
  return (wt === '900' || wt === 'bold' || /black/i.test(fam)) ? GLYPH_W_BOLD : GLYPH_W;
}

function wrapToLines(text: string, boxWidth: number, size: number, maxLines: number, perGlyph: number): { lines: string[]; truncated: boolean } {
  const perLine = Math.max(4, Math.floor(boxWidth / (size * perGlyph)));
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const candidate = line ? `${line} ${w}` : w;
    if (candidate.length <= perLine || !line) { line = candidate; continue; }
    lines.push(line);
    line = w;
    if (lines.length >= maxLines) return { lines, truncated: true };
  }
  if (line) lines.push(line);
  return { lines: lines.slice(0, maxLines), truncated: lines.length > maxLines };
}

/**
 * Fit `text` into the box a template allotted for `layer`: at most `maxLines` lines, inside
 * `boxWidth`, and (when given) within `maxHeight`. Shrinks the font (down to 55% of the
 * template's size) before it ever truncates; as a last resort it ends with an ellipsis.
 */
export function fitText(opts: {
  text: string; layer: DesignLayer; templateWidth: number; maxLines?: number; maxHeight?: number; boxWidth?: number;
}): { text: string; fontSize: number } {
  const { text, layer, templateWidth } = opts;
  const baseSize = layer.fontSize ?? 40;
  const boxWidth = opts.boxWidth ?? layer.width ?? (templateWidth - (layer.left ?? 80) * 2);
  const templateLines = String(layer.text || '').split('\n').length;
  const maxLines = opts.maxLines ?? Math.max(templateLines, 2);
  const maxHeight = opts.maxHeight ?? Infinity;
  const pg = glyphW(layer);
  // Smallest size we will shrink to: never below 26px on the 1080 grid (legible), but a huge
  // display size (e.g. 148) may shrink to 35% so a whole short sentence fits instead of truncating.
  const floor = Math.min(baseSize, Math.max(26, Math.round(baseSize * 0.35)));
  const step = Math.max(2, Math.round(baseSize * 0.04));

  for (let size = baseSize; size >= floor; size -= step) {
    const { lines, truncated } = wrapToLines(text, boxWidth, size, maxLines, pg);
    if (!truncated && lines.length * size * LINE_H <= maxHeight) return { text: lines.join('\n'), fontSize: size };
  }
  // Last resort at the floor size: as many lines as the vertical room allows, ellipsized.
  const allowed = Math.max(1, Math.min(maxLines, Math.floor(maxHeight / (floor * LINE_H))));
  const { lines, truncated } = wrapToLines(text, boxWidth, floor, allowed, pg);
  if (truncated && lines.length) {
    const last = lines[lines.length - 1].replace(/[\s.,;:!?-]+$/, '');
    lines[lines.length - 1] = last.replace(/\s+\S*$/, '') ? last.replace(/\s+\S*$/, '') + '…' : last + '…';
  }
  return { text: lines.join('\n'), fontSize: floor };
}

// ─── Geometry helpers ──────────────────────────────────────────────────────────

const isBackdrop = (l: DesignLayer, t: DesignTemplate) =>
  l.id === 'bg' || ((l.width ?? 0) >= t.width * 0.9 && (l.height ?? 0) >= t.height * 0.9);

const layerWidth = (l: DesignLayer, t: DesignTemplate) =>
  l.width ?? (l.type === 'text' ? t.width - (l.left ?? 0) * 2 : t.width);

/** Vertical room (px) a text layer has before the next element that overlaps it horizontally. */
export function verticalRoom(layer: DesignLayer, all: DesignLayer[], t: DesignTemplate): number {
  const x0 = layer.left ?? 0;
  const x1 = x0 + layerWidth(layer, t);
  const top = layer.top ?? 0;
  let limit = t.height - 40; // bottom safe margin
  for (const o of all) {
    if (o === layer || isBackdrop(o, t)) continue;
    const ot = o.top ?? 0;
    if (ot <= top + 4) continue;
    const ox0 = o.left ?? 0;
    const ox1 = ox0 + layerWidth(o, t);
    if (ox1 <= x0 + 4 || ox0 >= x1 - 4) continue;
    limit = Math.min(limit, ot);
  }
  return Math.max(24, limit - top - 14);
}

/** The pill / badge shape a text layer sits inside (e.g. a CTA button), if any. */
function containingShape(layer: DesignLayer, all: DesignLayer[], t: DesignTemplate): DesignLayer | undefined {
  const lx = layer.left ?? 0, ly = layer.top ?? 0;
  return all.find((o) =>
    o !== layer && o.type === 'rect' && !isBackdrop(o, t) && !o.isPlaceholder &&
    lx >= (o.left ?? 0) - 2 && lx <= (o.left ?? 0) + (o.width ?? 0) &&
    ly >= (o.top ?? 0) - 2 && ly <= (o.top ?? 0) + (o.height ?? 0));
}

// ─── Color helpers ─────────────────────────────────────────────────────────────

function luminance(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a), lb = luminance(b);
  if (la == null || lb == null) return 21; // unknown format — do not block
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
const readableOn = (bg: string) => ((luminance(bg) ?? 0) > 0.45 ? '#000000' : '#ffffff');

/** The accent color each template is designed around (what a Brand Kit color should replace). */
const TEMPLATE_ACCENT: Record<string, string> = {
  // (a design may use a second, darker shade of its accent � see EXTRA_ACCENT)
  'roof-storm-1': '#f97316', 'roof-inspect-1': '#fbbf24', 'ins-rate-drop-1': '#22c55e',
  'ins-free-quote-1': '#818cf8', 're-just-listed-1': '#f97316', 're-just-sold-1': '#4ade80',
  'hvac-seasonal-1': '#38bdf8', 'before-after-1': '#f97316', 'testimonial-1': '#fbbf24',
  'appreciation-1': '#c084fc', 'branded-1': '#f97316', 'u-hero-bold': '#f97316',
  'u-banner-center': '#f97316', 'u-badge-promo': '#fde68a',
};

// ─── Composition ───────────────────────────────────────────────────────────────

/** Additional shades of a design's accent that should follow the Brand Kit color too. */
const EXTRA_ACCENT: Record<string, string[]> = { 'appreciation-1': ['#7c3aed'] };

/**
 * Return a new template whose editable text layers reflect the caption + brand kit.
 * Pure: does not mutate the input template or its layers.
 *
 * Generic layouts (no template-specific copy) never show placeholder text: a supporting-line
 * slot with nothing real to say is filled from the Brand Kit tagline or removed, and a CTA with
 * no intent in the caption is removed. Specific designs keep their meaningful default copy.
 */
export function composeTemplate(input: ComposeInput): DesignTemplate {
  const { template, postText, tradeName, brandKit } = input;
  const generic = template.keywords.length === 0;
  const hasCaption = cleanCaption(postText).length > 0;

  const fallbackHeadline = template.layers.find((l) => l.isHeadline)?.text || template.name;
  // A generic design's own placeholder sentence is never shown: use the tagline or nothing.
  const fallbackSubtext = generic ? (brandKit.tagline || '') : (template.layers.find((l) => l.isSubtext)?.text || '');
  const { headline, subtext, cta, ctaFromIntent } = deriveCopy({ postText, tradeName, fallbackHeadline, fallbackSubtext });

  // Layers to drop entirely (generic designs only, and only when there IS a caption to compose).
  const drop = new Set<string>();
  if (hasCaption && generic) {
    for (const l of template.layers) {
      if (l.isSubtext && !subtext) drop.add(l.id);
      if (l.type === 'text' && /cta/i.test(l.id) && !ctaFromIntent && !containingShape(l, template.layers, template)) drop.add(l.id);
    }
  }
  const src = template.layers.filter((l) => !drop.has(l.id));

  // Brand color: only when the user actually customized it and it is readable on this design.
  const primary = brandKit.primaryColor;
  const customized = !!primary && primary.toLowerCase() !== BRAND_KIT_DEFAULTS.primaryColor.toLowerCase();
  const accent = TEMPLATE_ACCENT[template.id];
  const recolor = customized && !!accent && contrastRatio(primary, template.background) >= 3;
  const accents = [accent, ...(EXTRA_ACCENT[template.id] || [])].filter(Boolean).map((a) => a.toLowerCase());
  const swap = (c0?: string) => (recolor && c0 && accents.includes(c0.toLowerCase()) ? primary : c0);

  const layers: DesignLayer[] = src.map((layer) => {
    let out: DesignLayer = { ...layer };

    // Brand slots: fill ONLY when the kit has the value (never invent) and FIT it to its box.
    if (layer.isPhoneSlot || layer.isBrandSlot) {
      const value = layer.isPhoneSlot ? brandKit.phone : brandKit.companyName;
      if (value) {
        const f = fitText({ text: value, layer, templateWidth: template.width, maxLines: 1 });
        out = { ...out, text: f.text, fontSize: f.fontSize };
      }
    } else if (hasCaption && layer.type === 'text') {
      if (layer.keepText) {
        // fixed focal word (e.g. SOLD!) — the caption never overwrites it
      } else if (layer.isHeadline) {
        // Up to 3 lines: the fitter picks the LARGEST font that fits the width AND the vertical room.
        const f = fitText({ text: headline, layer, templateWidth: template.width, maxLines: 3, maxHeight: verticalRoom(layer, src, template) });
        out = { ...out, text: f.text, fontSize: f.fontSize };
      } else if (layer.isSubtext && subtext) {
        const f = fitText({ text: subtext, layer, templateWidth: template.width, maxLines: 3, maxHeight: verticalRoom(layer, src, template) });
        out = { ...out, text: f.text, fontSize: f.fontSize };
      } else if (/cta/i.test(layer.id) && ctaFromIntent) {
        // CTA copy lives INSIDE a button / badge shape: fit it to that shape and centre it.
        const shape = containingShape(layer, src, template);
        const round = !!shape && (shape.radius ?? 0) >= Math.min(shape.width ?? 0, shape.height ?? 0) / 2 - 1;
        const boxW = shape ? Math.round((shape.width ?? 400) * (round ? 0.68 : 1) - (round ? 0 : 48)) : (layer.width ?? 460);
        const tplLines = Math.max(1, String(layer.text || '').split('\n').length);
        const f = fitText({ text: cta.toUpperCase(), layer, templateWidth: template.width, maxLines: tplLines, boxWidth: boxW,
          maxHeight: shape ? (shape.height ?? 80) - 12 : undefined });
        const lines = f.text.split('\n').length;
        out = { ...out, text: f.text, fontSize: f.fontSize, textAlign: 'center', width: boxW };
        if (shape) {
          out.left = Math.round((shape.left ?? 0) + ((shape.width ?? boxW) - boxW) / 2);
          out.top = Math.round((shape.top ?? 0) + ((shape.height ?? 80) - lines * f.fontSize * LINE_H) / 2);
        }
      }
    }

    // Brand color on this design's accent (shapes AND accent-colored text).
    if (recolor) {
      if (out.backgroundColor) out.backgroundColor = swap(out.backgroundColor);
      if (out.fill) out.fill = swap(out.fill);
    }
    return out;
  });

  // Text sitting on a recolored button must stay readable (black or white by luminance).
  const finalLayers = recolor
    ? layers.map((l) => {
        if (l.type !== 'text') return l;
        const shape = containingShape(l, layers, template);
        if (shape && shape.backgroundColor && shape.backgroundColor.toLowerCase() === primary.toLowerCase()) return { ...l, fill: readableOn(primary) };
        return l;
      })
    : layers;

  return { ...template, layers: finalLayers };
}

/**
 * A stable signature of the composition inputs. Suggestions only recompute when this changes
 * meaningfully — not on every keystroke. Uses normalized caption keywords + length bucket +
 * trade + brand identity so trivial edits (trailing spaces, single chars) don't thrash.
 */
export function compositionSignature(opts: { postText: string; tradeId: string; brandKit: BrandKit }): string {
  const clean = cleanCaption(opts.postText).toLowerCase();
  const words = clean.split(/\s+/).filter((w) => w.length > 3).slice(0, 12).sort().join(',');
  const lenBucket = Math.floor(clean.length / 40); // changes every ~40 chars
  const brand = `${opts.brandKit.companyName}|${opts.brandKit.phone}|${opts.brandKit.primaryColor}|${opts.brandKit.logoDataUrl ? 'logo' : 'nologo'}`;
  return `${opts.tradeId}::${lenBucket}::${words}::${brand}`;
}
