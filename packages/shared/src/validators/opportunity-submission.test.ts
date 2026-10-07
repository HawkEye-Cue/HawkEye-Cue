import { describe, it, expect } from 'vitest';
import { opportunitySubmissionSchema } from './index.js';

// D1 — Take Flight privacy/data-minimization.
// The opportunity submission schema must:
//  - Accept Enriched records (author + content) unchanged.
//  - Accept Minimal records (no author, no content) anchored by a usable URL + keyword.
//  - Reject meaningless/empty records (no URL / no keyword).
//  - Cap content length when present.
//  - Carry an optional explicit promoteToLead flag.

describe('opportunitySubmissionSchema (D1)', () => {
  it('accepts an Enriched record (author + content) — backward compatible', () => {
    const r = opportunitySubmissionSchema.safeParse({
      keywordId: 'kw1',
      sourceContent: 'Need a roofer in Denver',
      sourcePlatform: 'facebook',
      sourceUrl: 'https://facebook.com/post/123',
      sourceAuthor: 'John D.',
    });
    expect(r.success).toBe(true);
  });

  it('accepts a Minimal record: URL + keyword + platform, no author/content', () => {
    const r = opportunitySubmissionSchema.safeParse({
      keywordId: 'kw1',
      sourcePlatform: 'facebook',
      sourceUrl: 'https://facebook.com/post/123',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.sourceAuthor).toBeUndefined();
      expect(r.data.sourceContent).toBeUndefined();
    }
  });

  it('accepts an optional explicit promoteToLead flag', () => {
    const r = opportunitySubmissionSchema.safeParse({
      keywordId: 'kw1',
      sourcePlatform: 'facebook',
      sourceUrl: 'https://facebook.com/post/123',
      promoteToLead: true,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.promoteToLead).toBe(true);
  });

  it('rejects a record with no usable URL (meaningless/empty)', () => {
    const r = opportunitySubmissionSchema.safeParse({
      keywordId: 'kw1',
      sourcePlatform: 'facebook',
      sourceUrl: '',
    });
    expect(r.success).toBe(false);
  });

  it('rejects a record missing the keyword', () => {
    const r = opportunitySubmissionSchema.safeParse({
      sourcePlatform: 'facebook',
      sourceUrl: 'https://facebook.com/post/123',
    });
    expect(r.success).toBe(false);
  });

  it('rejects content longer than 5000 characters', () => {
    const r = opportunitySubmissionSchema.safeParse({
      keywordId: 'kw1',
      sourcePlatform: 'facebook',
      sourceUrl: 'https://facebook.com/post/123',
      sourceContent: 'x'.repeat(5001),
    });
    expect(r.success).toBe(false);
  });
});
