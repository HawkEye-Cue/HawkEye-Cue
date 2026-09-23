// Edition -> feature/nav visibility mapping — pure logic.
// (Requirements 4.1, 4.2, 5.1, 5.2)

import type { Edition } from '../types/index.js';

// Feature keys that gate navigation & surfaces.
export type FeatureKey =
  | 'discovery'
  | 'flightScore'
  | 'drafting'
  | 'socialOrigin'
  | 'crmPush'
  | 'pipeline'
  | 'followUp'
  | 'scheduling'
  | 'revenue';

// Shared across both editions (the Discover core loop).
const DISCOVER_FEATURES: FeatureKey[] = [
  'discovery',
  'flightScore',
  'drafting',
  'socialOrigin',
  'crmPush',
];

// Grow adds the built-in CRM surfaces.
const GROW_ONLY_FEATURES: FeatureKey[] = [
  'pipeline',
  'followUp',
  'scheduling',
  'revenue',
];

/**
 * The set of visible features for an edition.
 * Grow is a strict superset of Discover.
 */
export function featuresForEdition(edition: Edition): FeatureKey[] {
  return edition === 'grow'
    ? [...DISCOVER_FEATURES, ...GROW_ONLY_FEATURES]
    : [...DISCOVER_FEATURES];
}

/** Whether a given feature is visible in the edition. */
export function isFeatureVisible(edition: Edition, feature: FeatureKey): boolean {
  return featuresForEdition(edition).includes(feature);
}

/**
 * Given a list of nav items keyed by feature, return only those visible in the edition.
 */
export function navForEdition<T extends { feature: FeatureKey }>(
  edition: Edition,
  items: T[],
): T[] {
  const visible = featuresForEdition(edition);
  return items.filter((i) => visible.includes(i.feature));
}
