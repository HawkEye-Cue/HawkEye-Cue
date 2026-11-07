/**
 * Canva-style automatic designs — PHASE 1: insurance only.
 *
 * Create calls `canvaDesignsForTrade(tradeId)` to decide whether this trade has the new designs
 * (insurance does; the other 56 keep their existing templates). When it does, Create builds three
 * genuinely different styles (photo / illustrated / editorial) from the user's caption + Brand Kit,
 * renders previews, and opens any of them in the existing Design Studio as fully editable layers.
 *
 * Guarantees: no network, no AI, no image credits; business name/phone/logo/colour come only from
 * the user's real Brand Kit (never invented); the complete caption is preserved (the picture shows
 * only a shortened version, flagged so the UI can say so).
 */
import type { BrandKit } from '../brandKit';
import type { DesignSpec } from './spec';
import { makeInput, type BrandKitLite } from './inputs';
import { insurancePhoto } from './insurancePhoto';
import { insuranceIllustrated } from './insuranceIllustrated';
import { insuranceEditorial } from './insuranceEditorial';
import neighborhoodPhoto from './assets/photos/neighborhood-aerial.jpg?url';

export type { DesignSpec } from './spec';
export { composeSpecToDocument } from './document';

/** Trades that use the new Canva-style designs in this phase. */
const CANVA_TRADES = new Set(['insurance-agent', 'health-insurance-agent', 'insurance-producer']);

export function tradeHasCanvaDesigns(tradeId: string | undefined): boolean {
  return !!tradeId && CANVA_TRADES.has(tradeId);
}

function toLite(kit: BrandKit): BrandKitLite {
  // A customised Brand Kit colour becomes the accent; the default orange is treated as "not chosen".
  const DEFAULT = '#f97316';
  const accent = kit.primaryColor && kit.primaryColor.toLowerCase() !== DEFAULT ? kit.primaryColor : undefined;
  return { company: (kit.companyName || '').trim(), phone: (kit.phone || '').trim(), accent };
}

/**
 * The three insurance design specs for this caption + Brand Kit, newest-style first.
 * `photoSrc` for the photo/editorial styles is a production-safe, licensed, generic neighbourhood
 * image (no identifiable property, no people) — a starting point the user can replace with their own.
 */
export function buildInsuranceSpecs(caption: string, tradeName: string | undefined, kit: BrandKit): DesignSpec[] {
  const lite = toLite(kit);
  const photoInput = makeInput(caption, tradeName, lite, { photoSrc: neighborhoodPhoto, headlineChars: 13 });
  const illoInput = makeInput(caption, tradeName, lite, { headlineChars: 9, subChars: 26, subLines: 4 });
  const edInput = makeInput(caption, tradeName, lite, { photoSrc: neighborhoodPhoto, headlineChars: 17, subChars: 32 });
  return [insurancePhoto(photoInput), insuranceIllustrated(illoInput), insuranceEditorial(edInput)];
}

/** Build the design specs for a trade, or null if this trade uses the existing templates. */
export function buildCanvaSpecs(tradeId: string | undefined, caption: string, tradeName: string | undefined, kit: BrandKit): DesignSpec[] | null {
  if (!tradeHasCanvaDesigns(tradeId)) return null;
  if (!caption.trim()) return null;
  return buildInsuranceSpecs(caption, tradeName, kit);
}
