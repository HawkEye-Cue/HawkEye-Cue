'use strict';
// CRM destination availability registry — mirror of packages/shared/src/crm/destinations.ts

const DESTINATIONS = [
  { type: 'csv', label: 'CSV Export', method: 'none', availability: 'available', supportsUpsert: false, requiredFields: [] },
  { type: 'webhook', label: 'Webhook / Zapier', method: 'url', availability: 'available', supportsUpsert: false, requiredFields: [] },
  { type: 'hubspot', label: 'HubSpot', method: 'api_key', availability: 'available', supportsUpsert: true, requiredFields: ['email'] },
  { type: 'zoho', label: 'Zoho CRM', method: 'api_key', availability: 'available', supportsUpsert: true, requiredFields: ['email'] },
  { type: 'gohighlevel', label: 'GoHighLevel', method: 'api_key', availability: 'available', supportsUpsert: true, requiredFields: ['email'] },
  { type: 'salesforce', label: 'Salesforce', method: 'oauth', availability: 'requires_approval', reason: 'requires approval — not yet available' },
  { type: 'ghl_marketplace', label: 'GoHighLevel (Marketplace OAuth)', method: 'oauth', availability: 'requires_approval', reason: 'requires approval — not yet available' },
];

function getDestination(type) {
  return DESTINATIONS.find((d) => d.type === type);
}

function assertConnectable(type) {
  const d = getDestination(type);
  if (!d) return { ok: false, reason: `Unknown destination: ${type}` };
  if (d.availability !== 'available') return { ok: false, reason: d.reason || 'requires approval — not yet available' };
  return { ok: true };
}

module.exports = { DESTINATIONS, getDestination, assertConnectable };
