'use strict';
// Zoho CRM adapter (Phase 2) — user-supplied OAuth token (self-client) via Zoho API.
// The stored credential is the Zoho access/refresh token string the user provides.

const BASE = 'https://www.zohoapis.com/crm/v3';

async function zoho(method, path, token, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { Authorization: `Zoho-oauthtoken ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    return res;
  } catch (e) {
    throw { code: e && e.name === 'AbortError' ? 'ABORT_ERR' : 'ECONNRESET', message: 'Zoho request failed' };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  type: 'zoho',
  supportsUpsert: true,
  requiredFields: ['Email'],
  async validate(token) {
    const res = await zoho('GET', '/Leads?per_page=1', token);
    if (res.status === 401) return { ok: false, reason: 'Zoho token was rejected' };
    if (!res.ok && res.status !== 204) return { ok: false, reason: `Zoho returned ${res.status}` };
    return { ok: true };
  },
  async push(payload, token) {
    const res = await zoho('POST', '/Leads', token, { data: [payload] });
    if (!res.ok) throw { status: res.status, message: `Zoho create failed (${res.status})` };
    const data = await res.json();
    const id = data && data.data && data.data[0] && data.data[0].details ? String(data.data[0].details.id) : null;
    return { recordId: id, raw: data };
  },
  async upsert(payload, token, recordId) {
    const res = await zoho('PUT', `/Leads/${encodeURIComponent(recordId)}`, token, { data: [payload] });
    if (!res.ok) throw { status: res.status, message: `Zoho update failed (${res.status})` };
    const data = await res.json();
    return { recordId, raw: data };
  },
};
