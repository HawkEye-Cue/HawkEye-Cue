// Regression tests for Summit automatic workspace activation (access resolution).
//
// "Summit access" decides whether "Summit HQ" appears in the main navigation. It must:
//   • turn ON for a new Summit customer the moment their sub is active/trialing (upgrade),
//   • stay ON for returning Summit customers,
//   • be ON for team MEMBERS (additive team access) even on a free personal tier,
//   • turn OFF when Summit access ends (expired/canceled) AND the user is not on a team,
//     without implying any team-record deletion (this layer is read-only).
//
// Pure logic → unit-tested directly in the node env (no DOM), matching the repo pattern.

import { describe, it, expect } from 'vitest';
import {
  resolveSummitAccess,
  normalizeTierLabel,
  isLiveStatus,
} from './summitAccess';

describe('normalizeTierLabel — canonical mapping', () => {
  it('maps summit/team → team', () => {
    expect(normalizeTierLabel('summit')).toBe('team');
    expect(normalizeTierLabel('team')).toBe('team');
    expect(normalizeTierLabel('TEAM')).toBe('team');
  });
  it('maps soar aliases → soar', () => {
    for (const t of ['soar', 'base', 'growth', 'flight', 'pro']) {
      expect(normalizeTierLabel(t)).toBe('soar');
    }
  });
  it('maps unknown/empty/nest → free', () => {
    expect(normalizeTierLabel('nest')).toBe('free');
    expect(normalizeTierLabel('free')).toBe('free');
    expect(normalizeTierLabel('')).toBe('free');
    expect(normalizeTierLabel(null)).toBe('free');
    expect(normalizeTierLabel(undefined)).toBe('free');
    expect(normalizeTierLabel('mystery')).toBe('free');
  });
});

describe('isLiveStatus — entitlement-active states', () => {
  it('treats active/trial/trialing/past_due/empty as live', () => {
    for (const s of ['active', 'trial', 'trialing', 'past_due', '']) {
      expect(isLiveStatus(s)).toBe(true);
    }
  });
  it('treats expired/canceled as NOT live', () => {
    expect(isLiveStatus('expired')).toBe(false);
    expect(isLiveStatus('canceled')).toBe(false);
    expect(isLiveStatus('cancelled')).toBe(false);
  });
});

describe('resolveSummitAccess', () => {
  it('UPGRADE: new Summit owner (team tier, active) → Summit ON, owner', () => {
    const a = resolveSummitAccess({ subscriptionTier: 'team', subscriptionStatus: 'active' });
    expect(a.isSummit).toBe(true);
    expect(a.isOwner).toBe(true);
    expect(a.hasTeam).toBe(false);
    expect(a.teamRole).toBe(null);
  });

  it('UPGRADE via trial: trialing Summit owner → Summit ON', () => {
    expect(resolveSummitAccess({ subscriptionTier: 'summit', subscriptionStatus: 'trialing' }).isSummit).toBe(true);
    expect(resolveSummitAccess({ subscriptionTier: 'team', subscriptionStatus: 'trial' }).isSummit).toBe(true);
  });

  it('RETURNING: existing Summit customer (team tier, active) → Summit ON', () => {
    const a = resolveSummitAccess({ subscriptionTier: 'team', subscriptionStatus: 'active' });
    expect(a.isSummit).toBe(true);
    expect(a.isOwner).toBe(true);
  });

  it('TEAM MEMBER: free personal tier but member of a team → Summit ON, member, not owner', () => {
    const a = resolveSummitAccess({ subscriptionTier: 'free', subscriptionStatus: 'active', teamRole: 'member' });
    expect(a.isSummit).toBe(true);
    expect(a.hasTeam).toBe(true);
    expect(a.teamRole).toBe('member');
    expect(a.isOwner).toBe(false);
  });

  it('TEAM ADMIN: admin role → Summit ON, hasTeam', () => {
    const a = resolveSummitAccess({ subscriptionTier: 'team', subscriptionStatus: 'active', teamRole: 'admin' });
    expect(a.isSummit).toBe(true);
    expect(a.hasTeam).toBe(true);
    expect(a.teamRole).toBe('admin');
    expect(a.isOwner).toBe(true);
  });

  it('DOWNGRADE: expired Summit owner, no team → Summit OFF', () => {
    const a = resolveSummitAccess({ subscriptionTier: 'team', subscriptionStatus: 'expired' });
    expect(a.isSummit).toBe(false);
    expect(a.isOwner).toBe(false);
    expect(a.hasTeam).toBe(false);
  });

  it('DOWNGRADE but still a member: expired personal sub yet team member → Summit stays ON', () => {
    // Team access is additive and independent of the personal subscription lapsing.
    const a = resolveSummitAccess({ subscriptionTier: 'free', subscriptionStatus: 'expired', teamRole: 'member' });
    expect(a.isSummit).toBe(true);
    expect(a.hasTeam).toBe(true);
    expect(a.isOwner).toBe(false);
  });

  it('NON-SUMMIT: soar tier, no team → Summit OFF', () => {
    const a = resolveSummitAccess({ subscriptionTier: 'soar', subscriptionStatus: 'active' });
    expect(a.isSummit).toBe(false);
  });

  it('NON-SUMMIT: free tier, no team → Summit OFF', () => {
    const a = resolveSummitAccess({ subscriptionTier: 'free', subscriptionStatus: 'active' });
    expect(a.isSummit).toBe(false);
  });

  it('UNKNOWN STATE: no inputs → fail closed (Summit OFF)', () => {
    const a = resolveSummitAccess({});
    expect(a.isSummit).toBe(false);
    expect(a.hasTeam).toBe(false);
    expect(a.isOwner).toBe(false);
  });
});
