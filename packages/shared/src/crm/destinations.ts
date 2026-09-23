// CRM destination availability registry — single source of truth.
// (Requirements 6.1, 6.5, 6.6, 6.7, 14.4)

import type { CrmDestinationInfo } from '../types/index.js';

export const DESTINATIONS: CrmDestinationInfo[] = [
  { type: 'csv', label: 'CSV Export', method: 'none', availability: 'available', supportsUpsert: false, requiredFields: [] },
  { type: 'webhook', label: 'Webhook / Zapier', method: 'url', availability: 'available', supportsUpsert: false, requiredFields: [] },
  { type: 'hubspot', label: 'HubSpot', method: 'api_key', availability: 'available', supportsUpsert: true, requiredFields: ['email'] },
  // Phase 2 — user-supplied API keys
  { type: 'zoho', label: 'Zoho CRM', method: 'api_key', availability: 'available', supportsUpsert: true, requiredFields: ['email'] },
  { type: 'gohighlevel', label: 'GoHighLevel', method: 'api_key', availability: 'available', supportsUpsert: true, requiredFields: ['email'] },
  // Phase 3 — blocked on published-OAuth-app review (placeholders only)
  { type: 'salesforce', label: 'Salesforce', method: 'oauth', availability: 'requires_approval', reason: 'requires approval — not yet available' },
  { type: 'ghl_marketplace', label: 'GoHighLevel (Marketplace OAuth)', method: 'oauth', availability: 'requires_approval', reason: 'requires approval — not yet available' },
];

/** Look up a destination by type. */
export function getDestination(type: string): CrmDestinationInfo | undefined {
  return DESTINATIONS.find((d) => d.type === type);
}

/** True when a destination exists and is connectable today. */
export function isConnectable(type: string): boolean {
  const d = getDestination(type);
  return !!d && d.availability === 'available';
}

/**
 * Validate that a connection may be created for a destination.
 * Rejects unknown or requires_approval destinations with a reason.
 * (Requirement 6.7)
 */
export function assertConnectable(type: string): { ok: boolean; reason?: string } {
  const d = getDestination(type);
  if (!d) return { ok: false, reason: `Unknown destination: ${type}` };
  if (d.availability !== 'available') {
    return { ok: false, reason: d.reason || 'requires approval — not yet available' };
  }
  return { ok: true };
}
