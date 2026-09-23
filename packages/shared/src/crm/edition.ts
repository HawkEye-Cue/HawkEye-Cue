// Edition resolution & validation — pure logic.
// Edition is orthogonal to subscription tier; it controls feature visibility only.

import type { Edition } from '../types/index.js';

export const DEFAULT_EDITION: Edition = 'grow';
const VALID: readonly Edition[] = ['discover', 'grow'];

/**
 * Resolve the effective edition from a stored value.
 * Returns the value when it is exactly 'discover' or 'grow', otherwise 'grow'.
 * (Requirements 1.4, 2.7)
 */
export function resolveEdition(stored: unknown): Edition {
  if (stored === 'discover' || stored === 'grow') return stored;
  return DEFAULT_EDITION;
}

/**
 * True only when the value is a valid edition. Used to reject invalid writes.
 * (Requirements 2.1, 2.6)
 */
export function validateEdition(value: unknown): value is Edition {
  return typeof value === 'string' && (VALID as readonly string[]).includes(value);
}
