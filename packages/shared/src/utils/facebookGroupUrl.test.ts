import { describe, it, expect } from 'vitest';
import { normalizeFacebookGroupUrl, isValidFacebookGroupUrl } from './facebookGroupUrl.js';

describe('normalizeFacebookGroupUrl — missing / empty', () => {
  it('rejects empty string', () => {
    const r = normalizeFacebookGroupUrl('');
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
  });
  it('rejects whitespace-only', () => {
    expect(normalizeFacebookGroupUrl('   ').ok).toBe(false);
  });
  it('rejects null/undefined-ish input safely', () => {
    expect(normalizeFacebookGroupUrl(undefined as unknown as string).ok).toBe(false);
  });
});

describe('normalizeFacebookGroupUrl — valid forms normalize to canonical', () => {
  const canonical = 'https://www.facebook.com/groups/123456789';
  it('bare host + numeric id', () => {
    expect(normalizeFacebookGroupUrl('facebook.com/groups/123456789').url).toBe(canonical);
  });
  it('https + www', () => {
    expect(normalizeFacebookGroupUrl('https://www.facebook.com/groups/123456789').url).toBe(canonical);
  });
  it('http + m. mobile host', () => {
    expect(normalizeFacebookGroupUrl('http://m.facebook.com/groups/123456789').url).toBe(canonical);
  });
  it('mbasic host', () => {
    expect(normalizeFacebookGroupUrl('https://mbasic.facebook.com/groups/123456789').url).toBe(canonical);
  });
  it('trailing slash', () => {
    expect(normalizeFacebookGroupUrl('https://facebook.com/groups/123456789/').url).toBe(canonical);
  });
  it('strips query and fragment', () => {
    expect(normalizeFacebookGroupUrl('https://facebook.com/groups/123456789/?ref=share#top').url).toBe(canonical);
  });
  it('fb.com shorthand', () => {
    expect(normalizeFacebookGroupUrl('fb.com/groups/123456789').url).toBe(canonical);
  });
  it('slug (named) group', () => {
    expect(normalizeFacebookGroupUrl('facebook.com/groups/springfield.trades').url)
      .toBe('https://www.facebook.com/groups/springfield.trades');
  });
  it('isValidFacebookGroupUrl convenience returns true', () => {
    expect(isValidFacebookGroupUrl('facebook.com/groups/123')).toBe(true);
  });
});

describe('normalizeFacebookGroupUrl — invalid forms', () => {
  it('rejects a non-facebook host', () => {
    const r = normalizeFacebookGroupUrl('https://example.com/groups/123');
    expect(r.ok).toBe(false);
  });
  it('rejects a facebook page (not a group)', () => {
    const r = normalizeFacebookGroupUrl('https://facebook.com/SomeBusinessPage');
    expect(r.ok).toBe(false);
  });
  it('rejects a /groups/ link with no identifier', () => {
    const r = normalizeFacebookGroupUrl('https://facebook.com/groups/');
    expect(r.ok).toBe(false);
  });
  it('rejects garbage text', () => {
    expect(normalizeFacebookGroupUrl('not a url at all').ok).toBe(false);
  });
  it('isValidFacebookGroupUrl convenience returns false for non-group', () => {
    expect(isValidFacebookGroupUrl('https://facebook.com/SomePage')).toBe(false);
  });
});
