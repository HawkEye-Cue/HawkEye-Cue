// Focused integration test for the Mass Flock posting-day REVIEW GATE (Option A).
//
// This exercises the exact gate logic MassFlockPosting uses — `evaluateGroupRules`
// (shared) composed with the component's `needsReviewGate` rule — against the QA
// fictional group "HawkEye QA TEST - Saturday Only". It uses NO Facebook URL and
// publishes nothing; the group object is evaluated directly (bypassing the valid-link
// queue filter), so production URL validation is untouched and no saved group is used.
//
// Gate under test (mirrors MassFlockPosting.tsx):
//   needsReviewGate = curRules.needsReview && cur && reviewedGroupId !== cur.id
//   Mark Posted button: disabled={acting || !cur || needsReviewGate}

import { describe, it, expect } from 'vitest';
import { evaluateGroupRules, type RuleEvalInput } from '@social-lead-gen/shared';

// Fictional QA group — Saturday (6) only, no URL needed for rule evaluation.
const QA_GROUP = { id: 'qa-sat-only', name: 'HawkEye QA TEST - Saturday Only', postingDays: [6], anyday: false };

const MON = 1;
const SAT = 6;

// Mirror the component's gate composition exactly.
function needsReviewGate(curRules: { needsReview: boolean }, cur: { id: string } | null, reviewedGroupId: string | null): boolean {
  return !!(curRules?.needsReview && cur && reviewedGroupId !== cur.id);
}
// Mirror the Mark Posted disabled rule (acting=false in these tests).
function markPostedDisabled(cur: { id: string } | null, gate: boolean, acting = false): boolean {
  return acting || !cur || gate;
}

function evalOn(today: number, over: Partial<RuleEvalInput['group']> = {}, history: RuleEvalInput['history'] = []): ReturnType<typeof evaluateGroupRules> {
  // RuleEvalInput.group has no `id`; pass only the fields the evaluator reads.
  const group: RuleEvalInput['group'] = {
    name: QA_GROUP.name,
    postingDays: QA_GROUP.postingDays,
    anyday: QA_GROUP.anyday,
    ...over,
  };
  return evaluateGroupRules({ group, today, history, now: Date.now() });
}

describe('Mass Flock review gate — Saturday-only group', () => {
  it('on MONDAY: day is not-allowed, needsReview true, Mark Posted blocked until acknowledged', () => {
    const rules = evalOn(MON);
    expect(rules.dayStatus).toBe('not-allowed');
    expect(rules.needsReview).toBe(true);
    const gate = needsReviewGate(rules, QA_GROUP, null);
    expect(gate).toBe(true);
    expect(markPostedDisabled(QA_GROUP, gate)).toBe(true); // blocked
  });

  it('on SATURDAY: day is allowed, needsReview false, Mark Posted available', () => {
    const rules = evalOn(SAT);
    expect(rules.dayStatus).toBe('allowed');
    expect(rules.needsReview).toBe(false);
    const gate = needsReviewGate(rules, QA_GROUP, null);
    expect(gate).toBe(false);
    expect(markPostedDisabled(QA_GROUP, gate)).toBe(false); // available
  });

  it('on MONDAY after explicit review acknowledgment: gate clears, Mark Posted available', () => {
    const rules = evalOn(MON);
    expect(rules.needsReview).toBe(true);
    // User clicked "I reviewed the rules — let me post anyway" → reviewedGroupId === cur.id
    const gate = needsReviewGate(rules, QA_GROUP, QA_GROUP.id);
    expect(gate).toBe(false);
    expect(markPostedDisabled(QA_GROUP, gate)).toBe(false);
  });
});

describe('Mass Flock review gate — unknown rules', () => {
  it('group with no permitted days and no any-day: day unknown, surfaced but not hard-blocked', () => {
    const rules = evaluateGroupRules({
      group: { name: 'QA Unknown Rules' },
      today: MON,
      history: [],
      now: Date.now(),
    });
    expect(rules.dayStatus).toBe('unknown');
    expect(rules.needsReview).toBe(false); // unknown does NOT auto-block
    // but it must surface an "unknown — check the rules" message (never claims safe)
    expect(rules.messages.join(' ').toLowerCase()).toContain('check the group');
    const gate = needsReviewGate(rules, { id: 'qa-unknown' }, null);
    expect(gate).toBe(false);
  });
});

describe('Mass Flock review gate — possible frequency violation', () => {
  const now = Date.now();
  const twoDaysAgo = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();

  it('weekly limit + posted within 7 days on an ALLOWED day: frequency possible-violation → needsReview true', () => {
    const rules = evaluateGroupRules({
      group: { name: QA_GROUP.name, postingDays: [SAT], anyday: false, frequencyLimit: 'once per week' },
      today: SAT, // allowed day, so the gate is driven purely by frequency
      history: [{ group: QA_GROUP.name, postedAt: twoDaysAgo }],
      now,
    });
    expect(rules.dayStatus).toBe('allowed');
    expect(rules.frequencyStatus).toBe('possible-violation');
    expect(rules.needsReview).toBe(true);
    const gate = needsReviewGate(rules, QA_GROUP, null);
    expect(gate).toBe(true);
    expect(markPostedDisabled(QA_GROUP, gate)).toBe(true); // blocked until acknowledged
  });

  it('acknowledging the frequency review clears the gate', () => {
    const rules = evaluateGroupRules({
      group: { name: QA_GROUP.name, postingDays: [SAT], anyday: false, frequencyLimit: 'once per week' },
      today: SAT,
      history: [{ group: QA_GROUP.name, postedAt: twoDaysAgo }],
      now,
    });
    const gate = needsReviewGate(rules, QA_GROUP, QA_GROUP.id);
    expect(gate).toBe(false);
    expect(markPostedDisabled(QA_GROUP, gate)).toBe(false);
  });

  it('weekly limit with NO recent history: frequency ok, no review required', () => {
    const rules = evaluateGroupRules({
      group: { name: QA_GROUP.name, postingDays: [SAT], anyday: false, frequencyLimit: 'once per week' },
      today: SAT,
      history: [],
      now,
    });
    expect(rules.frequencyStatus).toBe('ok');
    expect(rules.needsReview).toBe(false);
  });
});
