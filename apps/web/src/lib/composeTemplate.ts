/**
 * composeTemplate — content-aware template personalization (pure, no AI, no network, no cost).
 *
 * Takes a social-media caption + the user's trade + Brand Kit and rewrites a DesignTemplate's
 * editable TEXT layers so the graphic reflects the ACTUAL post: a real headline pulled from the
 * caption, a supporting subtext, a trade-appropriate CTA, and brand slots filled from the kit.
 *
 * Guarantees:
 *  - Never calls any API or AI model (zero image credits).
 *  - Only OVERRIDES layer `text`; never strips a layer's `data` role tags, so the result stays
 *    fully editable and Brand/Wingman keep working after composition.
 *  - Never invents business facts — brand slots only fill when the kit actually has the value;
 *    otherwise the template's own placeholder copy is kept.
 */

import type { DesignTemplate, DesignLayer } from './designTemplates';
import type { BrandKit } from './brandKit';

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

/** Split into sentence-like clauses (period, !, ?, newline, or em-dash boundaries). */
export function sentences(text: string): string[] {
  return cleanCaption(text)
    .split(/(?<=[.!?])\s+|\n+|\s+[—–-]\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Title-case a short phrase for headline use (keeps ALL-CAPS words, lowercases filler). */
const SMALL_WORDS = new Set(['a', 'an', 'and', 'the', 'or', 'for', 'to', 'of', 'in', 'on', 'at', 'with', 'your']);
export function toHeadline(phrase: string, maxChars = 42): string {
  let p = phrase.replace(/[.!?,;:]+$/, '').trim();
  if (p.length > maxChars) {
    // Cut at a word boundary under the cap.
    const cut = p.slice(0, maxChars);
    p = cut.slice(0, Math.max(cut.lastIndexOf(' '), 1)).trim();
  }
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

/** A short, trade-aware call to action derived from the caption's intent. */
export function deriveCta(caption: string, tradeName?: string): string {
  const l = caption.toLowerCase();
  if (/\b(free|no cost|complimentary)\b/.test(l) && /\b(quote|estimate|inspection|consult)/.test(l)) return 'Get Your Free Quote';
  if (/\b(quote|estimate)\b/.test(l)) return 'Request a Quote';
  if (/\b(inspect|inspection)\b/.test(l)) return 'Book an Inspection';
  if (/\b(call|phone|reach|contact)\b/.test(l)) return 'Call Us Today';
  if (/\b(sale|save|discount|off|deal|special)\b/.test(l)) return 'Save Today';
  if (/\b(listed|listing|open house|showing)\b/.test(l)) return 'Schedule a Showing';
  if (/\b(sold|closed)\b/.test(l)) return 'Thinking of Selling?';
  if (/\b(book|schedule|appointment)\b/.test(l)) return 'Book Now';
  if (/\b(thank|grateful|appreciate)\b/.test(l)) return 'Thank You';
  return 'Learn More';
}

export interface DerivedCopy {
  headline: string;
  subtext: string;
  cta: string;
}

/** Pull a headline + subtext + CTA from the caption. Falls back to template copy when empty. */
export function deriveCopy(opts: { postText: string; tradeName?: string; fallbackHeadline: string; fallbackSubtext: string }): DerivedCopy {
  const parts = sentences(opts.postText);
  const headline = parts[0] ? toHeadline(parts[0]) : opts.fallbackHeadline;
  // Subtext: next 1–2 sentences, trimmed. Keep it human (no title-case).
  const rest = parts.slice(1).join(' ').trim();
  const subtext = rest ? (rest.length > 120 ? rest.slice(0, 117).replace(/\s+\S*$/, '') + '…' : rest) : opts.fallbackSubtext;
  return { headline, subtext, cta: deriveCta(opts.postText, opts.tradeName) };
}

// ─── Text fitting (keeps composed designs polished — no overflow / collisions) ──

/** Average glyph width as a fraction of font size. Bold/black display faces run WIDE, so we
 *  use a conservative estimate to avoid under-counting (which caused headlines to spill an
 *  extra line and collide with the subtext). */
const GLYPH_W = 0.62;
const GLYPH_W_BOLD = 0.72;

function glyphW(layer: DesignLayer): number {
  const wt = String(layer.fontWeight || '');
  const fam = String(layer.fontFamily || '');
  return (wt === '900' || wt === 'bold' || /black/i.test(fam)) ? GLYPH_W_BOLD : GLYPH_W;
}

/** Greedy word-wrap `text` into at most `maxLines` lines that each fit `boxWidth` px at `size`. */
function wrapToLines(text: string, boxWidth: number, size: number, maxLines: number, perGlyph = GLYPH_W): string[] {
  const perLine = Math.max(4, Math.floor(boxWidth / (size * perGlyph)));
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w;
    if (candidate.length <= perLine || !line) line = candidate;
    else { lines.push(line); line = w; }
    if (lines.length >= maxLines) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines.slice(0, maxLines);
}

/**
 * Fit `text` into the space the template allotted for `layer`: keep the original line count
 * (derived from the template's own copy) and shrink the font size if needed so the text never
 * overflows its box or collides with the next layer. Returns the wrapped text + chosen size.
 */
export function fitText(opts: { text: string; layer: DesignLayer; templateWidth: number; maxLines?: number }): { text: string; fontSize: number } {
  const { text, layer, templateWidth } = opts;
  const baseSize = layer.fontSize ?? 40;
  const boxWidth = layer.width ?? (templateWidth - (layer.left ?? 80) * 2);
  // Target line count: what the template's own text used (so we preserve its visual rhythm).
  const templateLines = String(layer.text || '').split('\n').length;
  const maxLines = opts.maxLines ?? Math.max(templateLines, 2);

  const pg = glyphW(layer);
  let size = baseSize;
  // Shrink until the text wraps within maxLines, down to a readable floor (55% of base).
  const floor = Math.max(16, Math.round(baseSize * 0.55));
  for (; size >= floor; size -= Math.max(2, Math.round(baseSize * 0.06))) {
    const lines = wrapToLines(text, boxWidth, size, maxLines + 1, pg);
    if (lines.length <= maxLines) {
      return { text: lines.join('\n'), fontSize: size };
    }
  }
  // At the floor: hard-wrap to maxLines and ellipsize the overflow so nothing collides.
  const lines = wrapToLines(text, boxWidth, floor, maxLines, pg);
  if (lines.length === maxLines) {
    const last = lines[maxLines - 1];
    lines[maxLines - 1] = last.length > 3 ? last.replace(/\s+\S*$/, '') + '…' : last;
  }
  return { text: lines.join('\n'), fontSize: floor };
}

// ─── Layer rewriting ──────────────────────────────────────────────────────────

/**
 * Return a new template whose editable text layers reflect the caption + brand kit.
 * Pure: does not mutate the input template or its layers.
 */
export function composeTemplate(input: ComposeInput): DesignTemplate {
  const { template, postText, tradeName, brandKit } = input;

  const fallbackHeadline = template.layers.find((l) => l.isHeadline)?.text || template.name;
  const fallbackSubtext = template.layers.find((l) => l.isSubtext)?.text || '';
  const { headline, subtext, cta } = deriveCopy({ postText, tradeName, fallbackHeadline, fallbackSubtext });

  const hasCaption = cleanCaption(postText).length > 0;

  const layers: DesignLayer[] = template.layers.map((layer) => {
    // Brand slots: fill ONLY when the kit actually has the value (never invent).
    if (layer.isPhoneSlot) {
      return brandKit.phone ? { ...layer, text: brandKit.phone } : { ...layer };
    }
    if (layer.isBrandSlot && !layer.isPhoneSlot) {
      return brandKit.companyName ? { ...layer, text: brandKit.companyName } : { ...layer };
    }
    if (!hasCaption) return { ...layer };

    // Content slots: rewrite from the caption, AND keep the layout polished by FITTING the
    // new text to the box the template designed for it (so a long caption never overruns or
    // collides with neighbouring layers — the #1 cause of "placeholder-looking" output).
    if (layer.isHeadline) {
      // Cap the headline to the template's OWN line count so it never grows into the subtext.
      const tplLines = Math.max(1, String(layer.text || '').split('\n').length);
      const fitted = fitText({ text: headline, layer, templateWidth: template.width, maxLines: tplLines });
      return { ...layer, text: fitted.text, fontSize: fitted.fontSize };
    }
    if (layer.isSubtext) {
      const fitted = fitText({ text: subtext, layer, templateWidth: template.width, maxLines: 3 });
      return { ...layer, text: fitted.text, fontSize: fitted.fontSize };
    }
    // A short CTA pill/text (not headline/subtext/brand) that looks like a CTA by id.
    if (/cta/i.test(layer.id) && layer.type === 'text') {
      const fitted = fitText({ text: cta.toUpperCase(), layer, templateWidth: template.width, maxLines: 1 });
      return { ...layer, text: fitted.text, fontSize: fitted.fontSize };
    }
    return { ...layer };
  });

  // Apply brand colors to accent elements when the kit defines them (keeps editability).
  const primary = brandKit.primaryColor;
  const colored = layers.map((layer) => {
    if (!primary) return layer;
    // Recolor obvious accent shapes (ids containing accent/bar/cta/tag/divider) + headline fill
    // ONLY when the template's own accent matches its previewColors[1] (i.e. it's the accent).
    if (/accent|bar|divider|tag|cta/i.test(layer.id) && layer.type === 'rect') {
      return { ...layer, backgroundColor: primary };
    }
    return layer;
  });

  return { ...template, layers: colored };
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
