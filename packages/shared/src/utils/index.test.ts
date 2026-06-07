import { describe, it, expect } from 'vitest';
import {
  buildUserPK,
  buildTradePK,
  buildContentSK,
  buildPostSK,
  buildKeywordSK,
  buildOpportunitySK,
  buildCueSK,
  buildDeviceSK,
  buildDefaultKeywordSK,
  parseDeepLink,
  buildDeepLink,
  isToday,
  isFutureDate,
  formatDate,
  isValidStatusTransition,
} from './index.js';

describe('DynamoDB Key Builders', () => {
  it('buildUserPK returns USER#{userId}', () => {
    expect(buildUserPK('abc123')).toBe('USER#abc123');
  });

  it('buildTradePK returns TRADE#{tradeId}', () => {
    expect(buildTradePK('roofing')).toBe('TRADE#roofing');
  });

  it('buildContentSK returns CONTENT#{contentId}', () => {
    expect(buildContentSK('cnt-001')).toBe('CONTENT#cnt-001');
  });

  it('buildPostSK returns POST#{postId}', () => {
    expect(buildPostSK('post-uuid')).toBe('POST#post-uuid');
  });

  it('buildKeywordSK returns KEYWORD#{keywordId}', () => {
    expect(buildKeywordSK('kw-001')).toBe('KEYWORD#kw-001');
  });

  it('buildOpportunitySK returns OPP#{oppId}', () => {
    expect(buildOpportunitySK('opp-uuid')).toBe('OPP#opp-uuid');
  });

  it('buildCueSK returns CUE#{date}#{cueId}', () => {
    expect(buildCueSK('2024-01-15', 'cue-001')).toBe('CUE#2024-01-15#cue-001');
  });

  it('buildDeviceSK returns DEVICE#{deviceId}', () => {
    expect(buildDeviceSK('dev-001')).toBe('DEVICE#dev-001');
  });

  it('buildDefaultKeywordSK returns DEFKW#{keyword}', () => {
    expect(buildDefaultKeywordSK('roof leak')).toBe('DEFKW#roof leak');
  });
});

describe('Deep Link Utilities', () => {
  describe('parseDeepLink', () => {
    it('parses a valid deep link URL', () => {
      const result = parseDeepLink('socialleadgen://opportunities/opp-uuid');
      expect(result).toEqual({ screen: 'opportunities', entityId: 'opp-uuid' });
    });

    it('parses deep link with different screen', () => {
      const result = parseDeepLink('socialleadgen://content/cnt-123');
      expect(result).toEqual({ screen: 'content', entityId: 'cnt-123' });
    });

    it('returns null for invalid scheme', () => {
      expect(parseDeepLink('https://opportunities/opp-uuid')).toBeNull();
    });

    it('returns null for missing entityId', () => {
      expect(parseDeepLink('socialleadgen://opportunities')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(parseDeepLink('')).toBeNull();
    });

    it('returns null for extra path segments', () => {
      expect(parseDeepLink('socialleadgen://a/b/c')).toBeNull();
    });
  });

  describe('buildDeepLink', () => {
    it('builds a valid deep link URL', () => {
      expect(buildDeepLink('opportunities', 'opp-uuid')).toBe(
        'socialleadgen://opportunities/opp-uuid',
      );
    });

    it('round-trips with parseDeepLink', () => {
      const url = buildDeepLink('calendar', 'post-123');
      const parsed = parseDeepLink(url);
      expect(parsed).toEqual({ screen: 'calendar', entityId: 'post-123' });
    });
  });
});

describe('Date Utilities', () => {
  describe('isToday', () => {
    it('returns true for current date', () => {
      expect(isToday(new Date().toISOString())).toBe(true);
    });

    it('returns false for yesterday', () => {
      const yesterday = new Date();
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      expect(isToday(yesterday.toISOString())).toBe(false);
    });

    it('returns false for invalid date', () => {
      expect(isToday('not-a-date')).toBe(false);
    });
  });

  describe('isFutureDate', () => {
    it('returns true for a date in the future', () => {
      const future = new Date(Date.now() + 86400000); // +1 day
      expect(isFutureDate(future.toISOString())).toBe(true);
    });

    it('returns false for a date in the past', () => {
      const past = new Date(Date.now() - 86400000); // -1 day
      expect(isFutureDate(past.toISOString())).toBe(false);
    });

    it('returns false for invalid date', () => {
      expect(isFutureDate('invalid')).toBe(false);
    });
  });

  describe('formatDate', () => {
    it('formats a valid ISO date string', () => {
      const result = formatDate('2024-01-15T14:30:00Z');
      expect(result).toContain('Jan');
      expect(result).toContain('15');
      expect(result).toContain('2024');
    });

    it('returns "Invalid date" for invalid input', () => {
      expect(formatDate('not-a-date')).toBe('Invalid date');
    });
  });
});

describe('Status Helpers', () => {
  describe('isValidStatusTransition', () => {
    it('allows new → followed_up', () => {
      expect(isValidStatusTransition('new', 'followed_up')).toBe(true);
    });

    it('allows new → dismissed', () => {
      expect(isValidStatusTransition('new', 'dismissed')).toBe(true);
    });

    it('allows followed_up → converted', () => {
      expect(isValidStatusTransition('followed_up', 'converted')).toBe(true);
    });

    it('allows followed_up → dismissed', () => {
      expect(isValidStatusTransition('followed_up', 'dismissed')).toBe(true);
    });

    it('disallows new → converted', () => {
      expect(isValidStatusTransition('new', 'converted')).toBe(false);
    });

    it('disallows converted → any', () => {
      expect(isValidStatusTransition('converted', 'new')).toBe(false);
      expect(isValidStatusTransition('converted', 'followed_up')).toBe(false);
      expect(isValidStatusTransition('converted', 'dismissed')).toBe(false);
    });

    it('disallows dismissed → any', () => {
      expect(isValidStatusTransition('dismissed', 'new')).toBe(false);
      expect(isValidStatusTransition('dismissed', 'followed_up')).toBe(false);
      expect(isValidStatusTransition('dismissed', 'converted')).toBe(false);
    });

    it('disallows same-status transition', () => {
      expect(isValidStatusTransition('new', 'new')).toBe(false);
    });
  });
});
