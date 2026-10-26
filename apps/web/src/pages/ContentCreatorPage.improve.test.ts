// Regression tests for the "Improve with AI → postType is required" bug.
//
// Root cause: handleImproveWithAI / the ai_draft path called `setPostType('Educational')`
// then immediately `handleGenerate()`. React setState is async, so handleGenerate read the
// OLD empty postType and sent `postType: ''` → backend rejected with "postType is required".
//
// Fix: handleGenerate(overrides?) resolves an effective postType synchronously
// (override → current → 'Educational') and the callers pass it explicitly. The user's
// written text is passed as baseText in the same call (no setState race), and the
// original text (ownContent) is preserved until the user accepts the improvement.
//
// The component is heavy (many contexts), so—matching the repo's established pattern for
// such components—we assert the SOURCE wiring plus a small pure re-implementation of the
// postType resolution that mirrors the component exactly.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, './ContentCreatorPage.tsx'), 'utf8');

// Mirror of the resolution in handleGenerate: each candidate trimmed so whitespace-only
// never counts as present; falls back to the default.
function resolvePostType(override?: string, current?: string): string {
  return (override?.trim() || current?.trim() || 'Educational');
}

describe('ContentCreatorPage — postType resolution (Improve with AI fix)', () => {
  it('resolves a non-empty postType even when none is selected and no override', () => {
    expect(resolvePostType(undefined, '')).toBe('Educational');
    expect(resolvePostType(undefined, undefined)).toBe('Educational');
  });

  it('prefers an explicit override (what the callers now pass synchronously)', () => {
    expect(resolvePostType('Educational', '')).toBe('Educational');
    expect(resolvePostType('Promotional', 'Educational')).toBe('Promotional');
  });

  it('uses the current selection when present and no override', () => {
    expect(resolvePostType(undefined, 'Testimonial')).toBe('Testimonial');
  });

  it('never returns an empty postType (the condition that triggered the backend error)', () => {
    for (const [o, c] of [[undefined, ''], ['', ''], ['   ', ''], [undefined, '   ']] as const) {
      expect(resolvePostType(o as any, c as any).length).toBeGreaterThan(0);
    }
  });
});

describe('ContentCreatorPage — source wiring (no setState race)', () => {
  it('handleGenerate accepts overrides and resolves an effective postType', () => {
    expect(source).toContain('const handleGenerate = async (overrides?: { postType?: string; baseText?: string })');
    expect(source).toContain("(overrides?.postType?.trim() || postType?.trim() || 'Educational')");
    expect(source).toContain('postType: effectivePostType,');
  });

  it('Improve with AI passes a resolved postType AND the user text synchronously', () => {
    const idx = source.indexOf('async function handleImproveWithAI');
    expect(idx).toBeGreaterThan(-1);
    const block = source.slice(idx, idx + 600);
    expect(block).toContain("const improveType = postType || 'Educational';");
    expect(block).toContain('await handleGenerate({ postType: improveType, baseText: text });');
  });

  it('ai_draft path also passes a resolved postType synchronously', () => {
    expect(source).toContain('await handleGenerate({ postType: draftType });');
  });

  it('preserves the user original text (ownContent) rather than overwriting it on improve', () => {
    // handleImproveWithAI reads ownContent but does not clear/replace it before generating.
    const idx = source.indexOf('async function handleImproveWithAI');
    const block = source.slice(idx, idx + 600);
    expect(block).toContain('const text = ownContent.trim();');
    expect(block).not.toContain('setOwnContent(');
  });
});
