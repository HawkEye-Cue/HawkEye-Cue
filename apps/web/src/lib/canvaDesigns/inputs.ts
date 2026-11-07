/**
 * DEV PROTOTYPE inputs. Captions are realistic user posts. Headline / supporting lines / CTA are
 * derived from the caption by the app's REAL helpers (composeTemplate.ts), nothing is invented.
 *
 * Brand Kits below are TEST DATA used only in this development gallery. Production designs read the
 * signed-in user's actual Brand Kit; with an empty kit the business/phone layers are simply omitted.
 */
import { cleanCaption, sentences, splitHeadline, deriveCta } from '../composeTemplate';
import type { DesignInput } from './spec';

export interface BrandKitLite { company: string; phone: string; accent?: string }
export const EMPTY_KIT: BrandKitLite = { company: '', phone: '' };
export const TEST_KIT: BrandKitLite = { company: 'Sample Business Name', phone: '(000) 000-0000' };

export const CAPTIONS = {
  insurance: 'Is your home really covered? Most families are underinsured and do not know it until they file a claim. Call me for a free quote.',
  roofing: 'Hail storm damage season is here. Book your free roof inspection before the next big one hits town.',
  realestate: 'Just listed! Beautiful 4 bedroom home near downtown with a huge backyard. Schedule a showing this weekend.',
} as const;

/** Break a headline into balanced display lines of at most `maxChars` characters. */
export function breakLines(text: string, maxChars: number, maxLines = 4): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = []; let cur = '';
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + ' ' + w).length <= maxChars) cur += ' ' + w;
    else { out.push(cur); cur = w; }
  }
  if (cur) out.push(cur);
  while (out.length > maxLines) { const last = out.pop()!; out[out.length - 1] += ' ' + last; }
  return out;
}

/**
 * Shorten supporting copy for the IMAGE only (the customer's complete caption is never changed).
 * Prefers whole sentences; if the first sentence is itself too long it is cut at the last clause
 * boundary (comma / semicolon / dash) inside the budget, and only then at a word. A shortened summary
 * always ends with an ellipsis so it is never mistaken for the full text.
 */
export function summarize(text: string, budgetChars: number): { text: string; shortened: boolean } {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= budgetChars) return { text: clean, shortened: false };
  const sents = clean.split(/(?<=[.!?])\s+/);
  let acc = '';
  for (const s of sents) { if ((acc ? acc + ' ' + s : s).length <= budgetChars) acc = acc ? acc + ' ' + s : s; else break; }
  if (acc) return { text: acc, shortened: acc.length < clean.length };
  const head = clean.slice(0, budgetChars);
  const clause = Math.max(head.lastIndexOf(', '), head.lastIndexOf('; '), head.lastIndexOf(' \u2014 '));
  const cut = clause > budgetChars * 0.45 ? head.slice(0, clause) : head.slice(0, Math.max(head.lastIndexOf(' '), 1));
  return { text: cut.replace(/[\s.,;:!?-]+$/, '') + '\u2026', shortened: true };
}

/** Wrap supporting copy into short lines. */
export function wrapExcerpt(text: string, maxChars: number, maxLines: number): { lines: string[]; shortened: boolean } {
  const budget = Math.floor(maxChars * maxLines * 0.92);
  const s = summarize(text, budget);
  const lines = breakLines(s.text, maxChars, 99);
  if (lines.length <= maxLines) return { lines, shortened: s.shortened };
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = kept[maxLines - 1].replace(/[\s.,;:!?-]+$/, '') + '\u2026';
  return { lines: kept, shortened: true };
}

/** Feature chips: only noun-phrases that literally appear in the caption (e.g. "4 bedroom"). */
export function chipsFromCaption(caption: string): string[] {
  const out: string[] = [];
  const m1 = /(\d+)\s*(bed(?:room)?s?)\b/i.exec(caption); if (m1) out.push(`${m1[1]} ${/room/i.test(m1[2]) ? 'bedrooms' : 'beds'}`);
  const m2 = /\b(huge|large|big|spacious)\s+(backyard|yard|garage|kitchen)\b/i.exec(caption); if (m2) out.push(`${m2[1]} ${m2[2]}`);
  const m3 = /\bnear\s+([a-z ]{3,20}?)(?=\s+with|\.|,|$)/i.exec(caption); if (m3) out.push(`near ${m3[1].trim()}`);
  return out;
}

export function makeInput(caption: string, trade: string | undefined, kit: BrandKitLite, opts: { photoSrc?: string; headlineChars?: number; subChars?: number; subLines?: number } = {}): DesignInput {
  const parts = sentences(caption);
  const first = parts[0] || '';
  const sp = splitHeadline(first, 30, 44);
  const restParts = [sp.rest, ...parts.slice(1)].filter(Boolean);
  const cta = deriveCta(caption, trade);
  // the CTA sentence ("Call me for a free quote.") is shown as the button, not repeated as body copy
  const body = restParts.filter((s) => !/^(call|book|schedule|contact|dm|message)\b/i.test(s) || !deriveCta(s, trade).match(/quote|call|inspection|showing|book/i)).join(' ');
  const subWrap = body ? wrapExcerpt(body, opts.subChars ?? 34, opts.subLines ?? 3) : { lines: [] as string[], shortened: false };
  return {
    caption,
    headline: breakLines(sp.headline, opts.headlineChars ?? 14, 5),
    sub: subWrap.lines,
    // true when the picture shows a shorter version than the caption (headline split or summary cut)
    shortened: subWrap.shortened || !!sp.rest,
    chips: chipsFromCaption(caption),
    cta: cta !== 'Learn More' ? cta : undefined,
    tradeLabel: trade,
    company: kit.company, phone: kit.phone, accent: kit.accent,
    photoSrc: opts.photoSrc,
  };
}
export { cleanCaption };
