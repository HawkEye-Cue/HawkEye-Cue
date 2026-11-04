/**
 * AI image access — decided by the user's SUBSCRIPTION, never by their UI mode.
 *
 * Bug this fixes: the Create page gated "Create AI Image" on `isPro` from ModeContext, which
 * is the user's chosen UI density (Guided vs Pro) — a display preference, NOT an entitlement.
 * That meant a paying Soar/Summit user in Guided mode was wrongly blocked, and a free Nest
 * user who toggled to Pro mode was wrongly allowed.
 *
 * AI image generation is a paid feature (Soar / Summit). We normalize the tier with the SAME
 * canonical `normalizeTier` the billing Lambdas mirror, so the frontend gate cannot drift from
 * the backend's tier semantics (summit→team, legacy base/growth/pro→soar, unknown→free).
 */
import { normalizeTier } from '@social-lead-gen/shared';

export function canUseAiImageForTier(rawTier: unknown): boolean {
  return normalizeTier(rawTier) !== 'free';
}
