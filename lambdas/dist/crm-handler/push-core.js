'use strict';
// Retry/backoff runner, error classification, dedup, status machine.
// Mirror of packages/shared/src/crm/{push-core,dedup}.ts

const BACKOFF_DELAYS_MS = [1000, 2000, 4000];

function classifyError(err) {
  const transientCodes = ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN', 'ABORT_ERR', 'TIMEOUT'];
  if (err && err.code && transientCodes.includes(String(err.code).toUpperCase())) return 'transient';
  if (err && typeof err.status === 'number') {
    if (err.status === 429) return 'transient';
    if (err.status >= 500) return 'transient';
    if (err.status >= 400) return 'non_transient';
  }
  if (err && err.status == null && err.code == null) return 'transient';
  return 'non_transient';
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Run a push with retry/backoff. Uses upsert when a record id + support exist.
async function runPush(adapter, payload, credentials, opts) {
  opts = opts || {};
  const delays = opts.delays || BACKOFF_DELAYS_MS;
  const doSleep = opts.sleep || sleep;
  const recordId = opts.existingRecordId;

  let attempt = 0;
  let lastErr;
  while (attempt <= delays.length) {
    try {
      if (recordId && adapter.supportsUpsert && adapter.upsert) {
        return await adapter.upsert(payload, credentials, recordId);
      }
      return await adapter.push(payload, credentials);
    } catch (err) {
      lastErr = err;
      if (classifyError(err) !== 'transient') throw err;
      if (attempt === delays.length) throw err;
      await doSleep(delays[attempt]);
      attempt++;
    }
  }
  throw lastErr;
}

// --- Dedup decisions ---
function pushDecision(lead, supportsUpsert) {
  const hasId = lead.crmRecordId != null && String(lead.crmRecordId).trim() !== '';
  if (!hasId) return 'create';
  return supportsUpsert ? 'upsert' : 'confirm_duplicate';
}

function norm(v) { return (v == null ? '' : String(v)).trim().toLowerCase(); }

function detectDuplicate(candidate, alreadyPushed) {
  const email = norm(candidate.contactEmail);
  const phone = norm(candidate.contactPhone);
  if (!email && !phone) return null;
  for (const other of alreadyPushed || []) {
    if (email && norm(other.contactEmail) === email) return other;
    if (phone && norm(other.contactPhone) === phone) return other;
  }
  return null;
}

module.exports = { BACKOFF_DELAYS_MS, classifyError, runPush, pushDecision, detectDuplicate };
