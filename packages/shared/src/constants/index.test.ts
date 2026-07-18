import { describe, it, expect } from 'vitest';
import { TRADES, TIER_LIMITS, SOCIAL_PLATFORMS } from './index.js';

describe('TRADES', () => {
  it('contains exactly 57 trades', () => {
    expect(TRADES).toHaveLength(57);
  });

  it('each trade has required fields', () => {
    for (const trade of TRADES) {
      expect(trade.id).toBeTruthy();
      expect(trade.name).toBeTruthy();
      expect(trade.defaultKeywords.length).toBeGreaterThan(0);
      expect(trade.postTypes.length).toBeGreaterThan(0);
    }
  });

  it('includes all required trade names', () => {
    const names = TRADES.map((t) => t.name);
    expect(names).toContain('Roofing');
    expect(names).toContain('General Contractor');
    expect(names).toContain('Insurance Agent');
    expect(names).toContain('Real Estate Agent');
    expect(names).toContain('HVAC Technician');
    expect(names).toContain('Electrician');
    expect(names).toContain('Plumber');
    expect(names).toContain('Landscaper');
    expect(names).toContain('Junk Removal');
    expect(names).toContain('Mortgage Lender');
    expect(names).toContain('Pool Service');
    expect(names).toContain('Auto Repair Shop');
    expect(names).toContain('Auto Broker');
    expect(names).toContain('Cosmetologist');
    expect(names).toContain('Esthetician');
  });

  it('has unique trade IDs', () => {
    const ids = TRADES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('TIER_LIMITS', () => {
  it('free tier has correct limits', () => {
    expect(TIER_LIMITS.free).toEqual({
      aiGenerations: 5,
      keywords: 5,
      scheduledPosts: 10,
    });
  });

  it('growth tier has correct limits', () => {
    expect(TIER_LIMITS.growth).toEqual({
      aiGenerations: 200,
      keywords: 50,
      scheduledPosts: Infinity,
    });
  });

  it('soar tier has correct limits', () => {
    expect(TIER_LIMITS.soar).toEqual({
      aiGenerations: 300,
      keywords: Infinity,
      scheduledPosts: Infinity,
    });
  });

  it('team tier has correct limits', () => {
    expect(TIER_LIMITS.team).toEqual({
      aiGenerations: 500,
      keywords: Infinity,
      scheduledPosts: Infinity,
    });
  });
});

describe('SOCIAL_PLATFORMS', () => {
  it('contains all 5 platforms', () => {
    expect(SOCIAL_PLATFORMS).toEqual([
      'facebook',
      'instagram',
      'linkedin',
      'tiktok',
      'nextdoor',
    ]);
  });
});
