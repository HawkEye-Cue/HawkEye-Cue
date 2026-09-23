// Retry/backoff runner, error classification, and push status machine — pure logic.
// (Requirements 11.1–11.6, 12.5, 12.6)

import type { PushStatus } from '../types/index.js';

export type ErrorClass = 'transient' | 'non_transient';

export interface PushError {
  status?: number; // HTTP status if available
  code?: string; // e.g. 'ETIMEDOUT', 'ECONNRESET', 'ABORT_ERR'
  message?: string;
}

export interface PushAdapter {
  supportsUpsert: boolean;
  push(payload: Record<string, string>, credentials: string): Promise<{ recordId?: string | null; raw?: any }>;
  upsert?(payload: Record<string, string>, credentials: string, recordId: string): Promise<{ recordId?: string | null; raw?: any }>;
}

export const BACKOFF_DELAYS_MS = [1000, 2000, 4000] as const;

/**
 * Classify an error as transient (retryable) or non-transient (fail fast).
 * - transient: network timeout/abort/reset, HTTP 429, HTTP 5xx
 * - non-transient: other HTTP 4xx (invalid data, auth), field incompatibility
 * (Requirements 11.4, 11.5, 12.5, 12.6)
 */
export function classifyError(err: PushError): ErrorClass {
  const transientCodes = ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN', 'ABORT_ERR', 'TIMEOUT'];
  if (err.code && transientCodes.includes(err.code.toUpperCase())) return 'transient';
  if (typeof err.status === 'number') {
    if (err.status === 429) return 'transient';
    if (err.status >= 500) return 'transient';
    if (err.status >= 400) return 'non_transient';
  }
  // Unknown network-level failure with no status => treat as transient.
  if (err.status == null && err.code == null) return 'transient';
  return 'non_transient';
}

export interface RunPushOptions {
  existingRecordId?: string | null;
  sleep?: (ms: number) => Promise<void>;
  delays?: readonly number[];
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Run a push with retry/backoff.
 * - Uses upsert when a record id is present and the adapter supports it.
 * - Retries transient errors up to 3 times with delays [1s, 2s, 4s].
 * - Non-transient errors fail immediately (no retry).
 * Returns the adapter result on success; throws the last error on failure.
 * (Requirements 11.4, 11.5, 11.6)
 */
export async function runPush(
  adapter: PushAdapter,
  payload: Record<string, string>,
  credentials: string,
  opts: RunPushOptions = {},
): Promise<{ recordId?: string | null; raw?: any }> {
  const delays = opts.delays ?? BACKOFF_DELAYS_MS;
  const sleep = opts.sleep ?? defaultSleep;
  const recordId = opts.existingRecordId;

  let attempt = 0;
  let lastErr: any;
  while (attempt <= delays.length) {
    try {
      if (recordId && adapter.supportsUpsert && adapter.upsert) {
        return await adapter.upsert(payload, credentials, recordId);
      }
      return await adapter.push(payload, credentials);
    } catch (err) {
      lastErr = err;
      if (classifyError(err as PushError) !== 'transient') throw err; // fail fast
      if (attempt === delays.length) throw err; // retries exhausted
      await sleep(delays[attempt]);
      attempt++;
    }
  }
  throw lastErr;
}

// --- Push status machine ---

/** Valid statuses. */
export const PUSH_STATUSES: readonly PushStatus[] = ['not_pushed', 'pending', 'pushed', 'failed'];

/** The status when a lead is first created. */
export function initialStatus(): PushStatus {
  return 'not_pushed';
}

/** Status when an attempt begins. */
export function beginStatus(): PushStatus {
  return 'pending';
}

/** Terminal status for an attempt outcome. */
export function terminalStatus(success: boolean): PushStatus {
  return success ? 'pushed' : 'failed';
}
