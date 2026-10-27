// Phase 1B (P0-1) — lead-scanner canonical Opportunity schema.
//
// The lead-scanner is an EventBridge-triggered Lambda (exports.handler takes no args and
// drives the whole Bundle.social scan pipeline), so invoking it end-to-end would require
// mocking secrets + external social APIs. The behavior we must PROVE for this change is
// narrow and deterministic:
//   1. The dedupe Query (FilterExpression on sourceCommentId) and its early `return false`
//      are unchanged — a duplicate comment is NOT re-saved.
//   2. The OPP# SK pattern is unchanged.
//   3. The saved Item retains the compatibility fields (sourceCommentId, platform,
//      authorName, postContent, matchedKeywords, source:'background-scan').
//   4. The saved Item now ALSO writes the canonical fields (keywordId, sourcePlatform,
//      sourceAuthor, sourceContent, sourceUrl, leadSource).
//   5. D1: no fabricated sourceUrl (empty string literal), and sourceAuthor is derived
//      so the 'Unknown' sentinel maps to null.
//
// We assert these as structural invariants over the compiled dist source. This is a
// deterministic guard that the write schema change did not disturb deduplication.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const scannerPath = resolve(here, '../../../../lambdas/dist/lead-scanner/index.js');
const src = readFileSync(scannerPath, 'utf8');

// Isolate the saveLeadAndNotify function body for scoped assertions.
const fnStart = src.indexOf('async function saveLeadAndNotify');
const fnSlice = fnStart >= 0 ? src.slice(fnStart, src.indexOf('\nasync function ', fnStart + 1)) : '';

describe('lead-scanner — canonical schema + preserved dedupe (P0-1)', () => {
  it('saveLeadAndNotify exists', () => {
    expect(fnStart).toBeGreaterThan(-1);
    expect(fnSlice.length).toBeGreaterThan(0);
  });

  it('deduplicates on sourceCommentId with an early return false (unchanged)', () => {
    // The dedupe Query filters by sourceCommentId...
    expect(fnSlice).toMatch(/FilterExpression:\s*'sourceCommentId = :cid'/);
    expect(fnSlice).toMatch(/':cid':\s*lead\.commentId/);
    // ...and bails out without writing when a match already exists.
    expect(fnSlice).toMatch(/length\s*>\s*0\)\s*\{[\s\S]*?return false/);
  });

  it('keeps the OPP# SK pattern unchanged', () => {
    expect(fnSlice).toMatch(/SK:\s*`OPP#\$\{now\}#\$\{id\}`/);
  });

  it('retains scanner compatibility fields', () => {
    expect(fnSlice).toMatch(/sourceCommentId:\s*lead\.commentId/);
    expect(fnSlice).toMatch(/platform:\s*lead\.platform\.toLowerCase\(\)/);
    expect(fnSlice).toMatch(/authorName:\s*lead\.authorName/);
    expect(fnSlice).toMatch(/postContent:\s*lead\.text/);
    expect(fnSlice).toMatch(/matchedKeywords:\s*lead\.matchedKeywords/);
    expect(fnSlice).toMatch(/source:\s*'background-scan'/);
  });

  it('writes canonical Opportunity fields', () => {
    expect(fnSlice).toMatch(/keywordId:\s*'extension-detected'/);
    expect(fnSlice).toMatch(/sourcePlatform:\s*lead\.platform\.toLowerCase\(\)/);
    expect(fnSlice).toMatch(/sourceContent:\s*lead\.text/);
    expect(fnSlice).toMatch(/leadSource:\s*'extension-detected'/);
    // sourceAuthor is derived via the shared author-quality rule (junk UI labels / URLs
    // → null; no fabrication). Keep in lockstep with opportunity-intake.isUsableAuthor.
    expect(fnSlice).toMatch(/sourceAuthor:\s*canonicalAuthor/);
    expect(fnSlice).toMatch(/canonicalAuthor\s*=\s*isUsableAuthor\(lead\.authorName\)/);
  });

  it('auto-detected background-scan leads enter the review-first Inbox (status inbox)', () => {
    // Both automatic write paths must land in the Opportunity Inbox, not the pipeline.
    expect(fnSlice).toMatch(/status:\s*'inbox'/);
    expect(fnSlice).not.toMatch(/status:\s*'new'/);
  });

  it('applies author-quality rejection (shared isUsableAuthor is defined + used)', () => {
    expect(src).toMatch(/function isUsableAuthor/);
    expect(src).toContain('INTAKE_URL_OR_DOMAIN');
  });

  it('still dedupes on the stable sourceCommentId (server-side, unchanged)', () => {
    expect(fnSlice).toMatch(/FilterExpression:\s*'sourceCommentId = :cid'/);
    expect(fnSlice).toMatch(/length\s*>\s*0\)\s*\{[\s\S]*?return false/);
  });

  it('does NOT fabricate a sourceUrl (empty string)', () => {
    expect(fnSlice).toMatch(/sourceUrl:\s*''/);
    // Make sure we didn't invent a facebook.com-style default here.
    expect(fnSlice).not.toMatch(/sourceUrl:\s*['"]https?:/);
  });
});

// ─── Cross-path + concurrency dedupe (shares the OPPDEDUPE# namespace) ───────────
// The scanner now writes the OPP item + the SAME per-user OPPDEDUPE# sentinel the
// opportunities-handler uses, in ONE atomic TransactWriteCommand with the identical key
// logic. This closes the cross-path gap: a post captured by the extension cannot be
// re-saved by the background scan (and vice-versa), and concurrent attempts serialize.
describe('lead-scanner — cross-path + concurrency dedupe', () => {
  it('defines the shared dedupe-key helper identical to the handler', () => {
    expect(src).toMatch(/function intakeDedupeKey/);
    expect(src).toMatch(/function intakeCanonicalizePostUrl/);
    // comment id → 'id:' key (the scanner's stable per-post id).
    expect(src).toMatch(/return 'id:' \+ id\.toLowerCase\(\)/);
    // author+content fallback matches the handler's 80-char slice.
    expect(src).toMatch(/slice\(0, 80\)/);
  });

  it('writes OPP + the shared OPPDEDUPE# sentinel in ONE atomic transaction', () => {
    expect(fnSlice).toMatch(/new TransactWriteCommand\(/);
    expect(fnSlice).toMatch(/SK:\s*`OPPDEDUPE#\$\{dedupeKey\}`/);
    expect(fnSlice).toMatch(/ConditionExpression:\s*'attribute_not_exists\(SK\)'/);
    // both the sentinel and the OPP item are in the same TransactItems array.
    expect(fnSlice).toMatch(/TransactItems:\s*\[[\s\S]*Item:\s*oppItem/);
  });

  it('keys off the comment id so it matches the extension/handler key for the same post', () => {
    expect(fnSlice).toMatch(/intakeDedupeKey\(\{[\s\S]*postId:\s*lead\.commentId/);
  });

  it('treats a cancelled transaction (sentinel already reserved) as an already-saved duplicate', () => {
    expect(fnSlice).toMatch(/TransactionCanceledException'\s*\|\|\s*name === 'ConditionalCheckFailedException'/);
    // On a dedupe cancel it returns false (skip) — not a thrown error.
    expect(fnSlice).toMatch(/if \(name === 'TransactionCanceledException'[\s\S]*?return false/);
  });

  it('a non-dedupe transaction failure still propagates (not swallowed)', () => {
    expect(fnSlice).toMatch(/throw e;/);
  });

  it('TransactWriteCommand is imported', () => {
    expect(src).toMatch(/TransactWriteCommand/);
  });
});
