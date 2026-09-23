'use strict';
// HubSpot adapter — uses the user's own private-app token (no HawkEye marketplace app).

const BASE = 'https://api.hubapi.com';

async function hs(method, path, token, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    return res;
  } catch (e) {
    throw { code: e && e.name === 'AbortError' ? 'ABORT_ERR' : 'ECONNRESET', message: 'HubSpot request failed' };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  type: 'hubspot',
  supportsUpsert: true,
  requiredFields: ['email'],
  async validate(token) {
    const res = await hs('GET', '/crm/v3/objects/contacts?limit=1', token);
    if (res.status === 401 || res.status === 403) return { ok: false, reason: 'HubSpot token was rejected' };
    if (!res.ok) return { ok: false, reason: `HubSpot returned ${res.status}` };
    return { ok: true };
  },
  async push(payload, token) {
    const res = await hs('POST', '/crm/v3/objects/contacts', token, { properties: payload });
    if (!res.ok) throw { status: res.status, message: `HubSpot create failed (${res.status})` };
    const data = await res.json();
    return { recordId: data && data.id ? String(data.id) : null, raw: data };
  },
  async upsert(payload, token, recordId) {
    const res = await hs('PATCH', `/crm/v3/objects/contacts/${encodeURIComponent(recordId)}`, token, { properties: payload });
    if (!res.ok) throw { status: res.status, message: `HubSpot update failed (${res.status})` };
    const data = await res.json();
    return { recordId: data && data.id ? String(data.id) : recordId, raw: data };
  },
};
