// Integration test for the Smart Flock Import required-URL fix:
// a URL that the import flow normalizes must (a) be a valid group URL, and (b) be
// accepted by Mass Flock Posting's hasValidLink / partitionGroups so Copy & Open can
// open it. This guards the end-to-end contract between import and the Flocks queue.

import { describe, it, expect } from 'vitest';
import { normalizeFacebookGroupUrl } from '@social-lead-gen/shared';
import { hasValidLink, partitionGroups, type FlockGroup } from './massFlock';

// Mirror the exact persistence shape SmartFlockImport writes for an approved row.
function savedGroupFromImport(name: string, rawLink: string, postingDays: number[]): FlockGroup | null {
  const res = normalizeFacebookGroupUrl(rawLink);
  if (!res.ok || !res.url) return null; // import save is blocked for invalid URLs
  return {
    id: `import-test-${name}`,
    name: name.trim(),
    link: res.url,
    postingDays,
    anyday: postingDays.length === 0,
  };
}

describe('Smart Flock Import — saved group URL persistence & Mass Flock compatibility', () => {
  it('a valid pasted URL yields a saved group openable by Mass Flock / Copy & Open', () => {
    const g = savedGroupFromImport('Springfield Trades', 'facebook.com/groups/123456789', [1, 3, 5]);
    expect(g).not.toBeNull();
    expect(g!.link).toBe('https://www.facebook.com/groups/123456789');
    expect(hasValidLink(g!)).toBe(true);
    const { valid, invalid } = partitionGroups([g!]);
    expect(valid).toHaveLength(1);
    expect(invalid).toHaveLength(0);
  });

  it('a messy but valid URL (mobile host, query, trailing slash) normalizes and persists', () => {
    const g = savedGroupFromImport('Moms of X', 'https://m.facebook.com/groups/mygroup/?ref=share', []);
    expect(g!.link).toBe('https://www.facebook.com/groups/mygroup');
    expect(hasValidLink(g!)).toBe(true);
  });

  it('a missing URL blocks the save (import requires a URL)', () => {
    expect(savedGroupFromImport('No Link Group', '', [2])).toBeNull();
  });

  it('an invalid (non-group) URL blocks the save', () => {
    expect(savedGroupFromImport('Page Not Group', 'https://facebook.com/SomeBusinessPage', [2])).toBeNull();
    expect(savedGroupFromImport('Wrong Host', 'https://example.com/groups/1', [2])).toBeNull();
  });

  it('a saved group with a normalized link is NOT surfaced as invalid in Mass Flock', () => {
    const good = savedGroupFromImport('Good', 'fb.com/groups/999', [6])!;
    const { invalid } = partitionGroups([good]);
    expect(invalid).toHaveLength(0);
  });
});
