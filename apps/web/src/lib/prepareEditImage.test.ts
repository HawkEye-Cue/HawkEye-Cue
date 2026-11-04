// Tests for the pure sizing helpers used to prepare photos for AI editing.
import { describe, it, expect } from 'vitest';
import { fitWithin, dataUrlBytes, EDIT_MAX_EDGE } from './prepareEditImage';

describe('fitWithin — downscale phone photos, preserve aspect ratio', () => {
  it('leaves small images untouched', () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
  it('downscales a 12MP landscape phone photo to the max edge', () => {
    const r = fitWithin(4032, 3024);
    expect(r.width).toBe(EDIT_MAX_EDGE);
    expect(r.height).toBe(Math.round(3024 * (EDIT_MAX_EDGE / 4032)));
  });
  it('downscales a portrait photo by its long (height) edge', () => {
    const r = fitWithin(3024, 4032);
    expect(r.height).toBe(EDIT_MAX_EDGE);
    expect(r.width).toBeLessThan(EDIT_MAX_EDGE);
  });
  it('preserves aspect ratio within rounding', () => {
    const r = fitWithin(4000, 2000);
    expect(r.width / r.height).toBeCloseTo(2, 2);
  });
  it('never upscales', () => {
    expect(fitWithin(100, 50, 1536)).toEqual({ width: 100, height: 50 });
  });
  it('handles degenerate input safely', () => {
    expect(fitWithin(0, 0)).toEqual({ width: 0, height: 0 });
  });
});

describe('dataUrlBytes — decoded size estimate', () => {
  it('computes bytes for a base64 payload with no padding', () => {
    // "abc" = "YWJj" → 3 bytes
    expect(dataUrlBytes('data:image/png;base64,YWJj')).toBe(3);
  });
  it('accounts for one padding char', () => {
    // "ab" = "YWI=" → 2 bytes
    expect(dataUrlBytes('data:image/png;base64,YWI=')).toBe(2);
  });
  it('accounts for two padding chars', () => {
    // "a" = "YQ==" → 1 byte
    expect(dataUrlBytes('data:image/png;base64,YQ==')).toBe(1);
  });
});
