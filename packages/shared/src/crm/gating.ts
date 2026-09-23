// Access gating + edition/tier/mode orthogonality — pure logic.
// (Requirements 13.1–13.6)

import type { Edition } from '../types/index.js';
import type { FeatureKey } from './visibility.js';
import { isFeatureVisible } from './visibility.js';

export type SubscriptionTier = 'free' | 'nest' | 'soar' | 'summit' | 'team';

// Which tiers entitle each gated feature. Features not listed are entitled by all tiers.
const TIER_ENTITLEMENTS: Partial<Record<FeatureKey, SubscriptionTier[]>> = {
  pipeline: ['soar', 'summit', 'team'],
  followUp: ['soar', 'summit', 'team'],
  scheduling: ['soar', 'summit', 'team'],
  revenue: ['soar', 'summit', 'team'],
  crmPush: ['soar', 'summit', 'team'],
};

/** Whether the subscription tier entitles a feature. */
export function tierEntitles(tier: SubscriptionTier, feature: FeatureKey): boolean {
  const allowed = TIER_ENTITLEMENTS[feature];
  if (!allowed) return true; // ungated feature
  return allowed.includes(tier);
}

/**
 * Access is granted iff the edition exposes the feature AND the tier entitles it.
 * (Requirements 13.3, 13.5, 13.6)
 */
export function hasAccess(edition: Edition, tier: SubscriptionTier, feature: FeatureKey): boolean {
  return isFeatureVisible(edition, feature) && tierEntitles(tier, feature);
}

// --- Orthogonal dimension holder ---
// Changing one dimension must never mutate the others. (Requirements 13.1, 13.2, 13.4)

export interface Dimensions {
  edition: Edition;
  tier: SubscriptionTier;
  mode: 'guided' | 'pro';
}

export function setEdition(d: Dimensions, edition: Edition): Dimensions {
  return { ...d, edition };
}
export function setTier(d: Dimensions, tier: SubscriptionTier): Dimensions {
  return { ...d, tier };
}
export function setMode(d: Dimensions, mode: 'guided' | 'pro'): Dimensions {
  return { ...d, mode };
}
