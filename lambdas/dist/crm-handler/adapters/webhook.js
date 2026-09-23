'use strict';
// Generic webhook / Zapier adapter — HTTP POST the mapped fields. No approval needed.

async function postWithTimeout(url, body, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  type: 'webhook',
  supportsUpsert: false,
  requiredFields: [],
  // credentials here is the webhook URL.
  async validate(url) {
    if (!url || !/^https:\/\//i.test(url)) return { ok: false, reason: 'A valid https webhook URL is required' };
    return { ok: true };
  },
  async push(payload, url) {
    let res;
    try {
      res = await postWithTimeout(url, payload, 30000);
    } catch (e) {
      throw { code: e && e.name === 'AbortError' ? 'ABORT_ERR' : 'ECONNRESET', message: 'Webhook request failed' };
    }
    if (!res.ok) throw { status: res.status, message: `Webhook returned ${res.status}` };
    return { recordId: null, raw: null };
  },
};
