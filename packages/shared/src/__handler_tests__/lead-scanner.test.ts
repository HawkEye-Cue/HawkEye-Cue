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
    // sourceAuthor is derived (maps 'Unknown' sentinel to null — D1, no fabrication).
    expect(fnSlice).toMatch(/sourceAuthor:\s*canonicalAuthor/);
    expect(fnSlice).toMatch(/canonicalAuthor\s*=\s*\(lead\.authorName\s*&&\s*lead\.authorName\s*!==\s*'Unknown'\)/);
  });

  it('does NOT fabricate a sourceUrl (empty string)', () => {
    expect(fnSlice).toMatch(/sourceUrl:\s*''/);
    // Make sure we didn't invent a facebook.com-style default here.
    expect(fnSlice).not.toMatch(/sourceUrl:\s*['"]https?:/);
  });
});
