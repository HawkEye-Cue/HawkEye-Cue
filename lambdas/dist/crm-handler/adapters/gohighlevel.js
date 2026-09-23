'use strict';
// GoHighLevel adapter (Phase 2) — user-supplied private integration token (Location API key).

const BASE = 'https://services.leadconnectorhq.com';

async function ghl(method, path, token, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Version: '2021-07-28',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    return res;
  } catch (e) {
    throw { code: e && e.name === 'AbortError' ? 'ABORT_ERR' : 'ECONNRESET', message: 'GoHighLevel request failed' };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  type: 'gohighlevel',
  supportsUpsert: true,
  requiredFields: ['email'],
  async validate(token) {
    // A lightweight authenticated call; contacts search requires a locationId in practice,
    // so we validate the token shape by hitting the contacts endpoint and treating 401 as invalid.
    const res = await ghl('GET', '/contacts/', token);
    if (res.status === 401) return { ok: false, reason: 'GoHighLevel token was rejected' };
    if (res.status >= 500) return { ok: false, reason: `GoHighLevel returned ${res.status}` };
    return { ok: true };
  },
  async push(payload, token) {
    const res = await ghl('POST', '/contacts/', token, payload);
    if (!res.ok) throw { status: res.status, message: `GoHighLevel create failed (${res.status})` };
    const data = await res.json();
    const id = data && data.contact && data.contact.id ? String(data.contact.id) : (data && data.id ? String(data.id) : null);
    return { recordId: id, raw: data };
  },
  async upsert(payload, token, recordId) {
    const res = await ghl('PUT', `/contacts/${encodeURIComponent(recordId)}`, token, payload);
    if (!res.ok) throw { status: res.status, message: `GoHighLevel update failed (${res.status})` };
    const data = await res.json();
    return { recordId, raw: data };
  },
};
