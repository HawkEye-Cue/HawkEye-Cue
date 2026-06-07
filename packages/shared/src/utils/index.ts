import type { OpportunityStatus } from '../types/index.js';

// --- DynamoDB Key Builders ---

export function buildUserPK(userId: string): string {
  return `USER#${userId}`;
}

export function buildTradePK(tradeId: string): string {
  return `TRADE#${tradeId}`;
}

export function buildContentSK(contentId: string): string {
  return `CONTENT#${contentId}`;
}

export function buildPostSK(postId: string): string {
  return `POST#${postId}`;
}

export function buildKeywordSK(keywordId: string): string {
  return `KEYWORD#${keywordId}`;
}

export function buildOpportunitySK(oppId: string): string {
  return `OPP#${oppId}`;
}

export function buildCueSK(date: string, cueId: string): string {
  return `CUE#${date}#${cueId}`;
}

export function buildDeviceSK(deviceId: string): string {
  return `DEVICE#${deviceId}`;
}

export function buildDefaultKeywordSK(keyword: string): string {
  return `DEFKW#${keyword}`;
}

// --- Deep Link Utilities ---

const DEEP_LINK_SCHEME = 'socialleadgen';

/**
 * Parses a deep link URL of the form `socialleadgen://{screen}/{entityId}`.
 * Returns null for invalid URLs.
 */
export function parseDeepLink(
  url: string,
): { screen: string; entityId: string } | null {
  const regex = new RegExp(`^${DEEP_LINK_SCHEME}://([^/]+)/([^/]+)$`);
  const match = url.match(regex);
  if (!match) {
    return null;
  }
  return { screen: match[1], entityId: match[2] };
}

/**
 * Builds a deep link URL from a screen name and entity ID.
 */
export function buildDeepLink(screen: string, entityId: string): string {
  return `${DEEP_LINK_SCHEME}://${screen}/${entityId}`;
}

// --- Date Utilities ---

/**
 * Checks if an ISO date string falls within the current calendar day (UTC).
 */
export function isToday(dateStr: string): boolean {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    return false;
  }
  const now = new Date();
  return (
    date.getUTCFullYear() === now.getUTCFullYear() &&
    date.getUTCMonth() === now.getUTCMonth() &&
    date.getUTCDate() === now.getUTCDate()
  );
}

/**
 * Checks if an ISO date string is in the future.
 */
export function isFutureDate(dateStr: string): boolean {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    return false;
  }
  return date.getTime() > Date.now();
}

/**
 * Formats an ISO date string to a human-readable format.
 * Example: "Jan 15, 2024 at 2:30 PM"
 */
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    return 'Invalid date';
  }
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

// --- Status Helpers ---

const VALID_STATUS_TRANSITIONS: Record<OpportunityStatus, OpportunityStatus[]> =
  {
    new: ['followed_up', 'dismissed'],
    followed_up: ['converted', 'dismissed'],
    converted: [],
    dismissed: [],
  };

/**
 * Checks if a status transition is valid for an opportunity.
 * Valid transitions:
 * - new → followed_up
 * - new → dismissed
 * - followed_up → converted
 * - followed_up → dismissed
 */
export function isValidStatusTransition(
  from: OpportunityStatus,
  to: OpportunityStatus,
): boolean {
  const allowed = VALID_STATUS_TRANSITIONS[from];
  return allowed !== undefined && allowed.includes(to);
}
