/**
 * AI image balance — read-only lookup used by the confirmation shown before EVERY paid AI image
 * request (text-to-image and AI photo edit). The server (GET /content/image-credits) applies the
 * same tier rules and monthly limits as the generation endpoints; it never reserves or deducts.
 */
import type { ApiClient } from '@social-lead-gen/shared';

export interface ImageCredits {
  costPerImage: number;
  limit: number;
  used: number;
  remaining: number;
  tier: string;
}

export async function fetchImageCredits(client: Pick<ApiClient, 'request'>): Promise<ImageCredits> {
  const r = await client.request<Partial<ImageCredits>>('GET', '/content/image-credits');
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);
  const credits = {
    costPerImage: num(r.costPerImage), limit: num(r.limit), used: num(r.used), remaining: num(r.remaining), tier: String(r.tier ?? ''),
  };
  if ([credits.costPerImage, credits.limit, credits.used, credits.remaining].some(Number.isNaN)) {
    throw new Error('Unexpected balance response');
  }
  return credits;
}

/** Can the user afford one more paid image right now? */
export function canAfford(c: ImageCredits | null): boolean {
  return !!c && c.remaining >= c.costPerImage && c.costPerImage > 0;
}
