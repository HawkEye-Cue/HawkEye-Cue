// Tests for the Flock Safety Guard pure helpers. These exercise the advisory, pure
// decision logic directly (no DOM / localStorage) — matching the project's node-env
// vitest style. Covers cross-workflow activity counts, duplicate prevention, pacing
// reminder trigger + cooldown, pause transitions, and group-rule evaluation.

import { describe, it, expect } from 'vitest';
import {
  recordPost,
  postsToday,
  postsInWindow,
  shouldRemind,
  setPaused,
  evaluateGroupRules,
  type PostingActivityEvent,
  type RuleEvalInput,
} from './flockSafety.js';

const T0 = new Date('2024-06-10T12:00:00').getTime(); // a Monday, local noon

function ev(over: Partial<PostingActivityEvent> = {}): PostingActivityEvent {
  return { groupId: 'g1', workflow: 'today', ts: T0, ...over };
}

describe('recordPost — dedupe', () => {
  it('ignores the same group within the dedupe window (no double count)', () => {
    let events: PostingActivityEvent[] = [];
    events = recordPost(events, ev({ ts: T0, workflow: 'today' }));
    events = recordPost(events, ev({ ts: T0 + 1000, workflow: 'today' })); // 1s later
    expect(events).toHaveLength(1);
  });

  it('dedupes the SAME completion observed by different workflows', () => {
    let events: PostingActivityEvent[] = [];
    events = recordPost(events, ev({ ts: T0, workflow: 'copyopen' }));
    events = recordPost(events, ev({ ts: T0 + 500, workflow: 'today' })); // same group, cross-workflow
    expect(events).toHaveLength(1);
  });

  it('counts a different group separately', () => {
    let events: PostingActivityEvent[] = [];
    events = recordPost(events, ev({ groupId: 'g1', ts: T0 }));
    events = recordPost(events, ev({ groupId: 'g2', ts: T0 + 500 }));
    expect(events).toHaveLength(2);
  });

  it('counts the same group again once outside the dedupe window', () => {
    let events: PostingActivityEvent[] = [];
    events = recordPost(events, ev({ ts: T0 }), 60_000);
    events = recordPost(events, ev({ ts: T0 + 61_000 }), 60_000); // > window
    expect(events).toHaveLength(2);
  });

  it('falls back to groupLink for dedupe when groupId is missing', () => {
    let events: PostingActivityEvent[] = [];
    events = recordPost(events, ev({ groupId: '', groupLink: 'https://fb/groups/x', ts: T0 }));
    events = recordPost(events, ev({ groupId: '', groupLink: 'https://fb/groups/x', ts: T0 + 1000 }));
    expect(events).toHaveLength(1);
  });

  it('does not mutate the input array', () => {
    const original: PostingActivityEvent[] = [];
    const next = recordPost(original, ev());
    expect(original).toHaveLength(0);
    expect(next).toHaveLength(1);
  });

  it('caps stored events at 500 (drops oldest)', () => {
    let events: PostingActivityEvent[] = [];
    for (let i = 0; i < 520; i++) {
      // unique group + far apart so none dedupe
      events = recordPost(events, ev({ groupId: `g${i}`, ts: T0 + i * 1000 }));
    }
    expect(events).toHaveLength(500);
    expect(events[0].groupId).toBe('g20'); // oldest 20 dropped
  });
});

describe('postsToday / postsInWindow', () => {
  it('counts posts since local midnight', () => {
    const midnight = new Date(T0); midnight.setHours(0, 0, 0, 0);
    const events = [
      ev({ groupId: 'a', ts: midnight.getTime() - 1 }),      // yesterday
      ev({ groupId: 'b', ts: midnight.getTime() + 1000 }),   // today
      ev({ groupId: 'c', ts: T0 }),                          // today
    ];
    expect(postsToday(events, T0)).toBe(2);
  });

  it('counts posts within a rolling window (inclusive boundary)', () => {
    const events = [
      ev({ groupId: 'a', ts: T0 - 11 * 60 * 1000 }), // just outside 10m
      ev({ groupId: 'b', ts: T0 - 10 * 60 * 1000 }), // exactly on boundary → included
      ev({ groupId: 'c', ts: T0 - 5 * 60 * 1000 }),
    ];
    expect(postsInWindow(events, 10 * 60 * 1000, T0)).toBe(2);
  });
});

describe('shouldRemind', () => {
  function burst(n: number): PostingActivityEvent[] {
    const events: PostingActivityEvent[] = [];
    for (let i = 0; i < n; i++) events.push(ev({ groupId: `g${i}`, ts: T0 - i * 1000 }));
    return events;
  }

  it('does not remind below the threshold', () => {
    const r = shouldRemind(burst(5), {}, T0);
    expect(r.remind).toBe(false);
    expect(r.count).toBe(5);
  });

  it('reminds at the threshold when no prior reminder', () => {
    const r = shouldRemind(burst(6), {}, T0);
    expect(r.remind).toBe(true);
    expect(r.count).toBe(6);
  });

  it('suppresses repeat reminders within the cooldown', () => {
    const r = shouldRemind(burst(6), { lastRemindedAt: T0 - 60_000 }, T0); // 1 min ago
    expect(r.remind).toBe(false);
  });

  it('reminds again after the cooldown elapses', () => {
    const r = shouldRemind(burst(6), { lastRemindedAt: T0 - 11 * 60 * 1000 }, T0);
    expect(r.remind).toBe(true);
  });

  it('honors overridden threshold/window/cooldown', () => {
    const r = shouldRemind(burst(3), {}, T0, { threshold: 3, windowMs: 60_000, cooldownMs: 0 });
    expect(r.remind).toBe(true);
  });
});

describe('setPaused — PauseState transitions', () => {
  it('pauses with a reason and records since', () => {
    const s = setPaused({ paused: false }, true, 'restricted');
    expect(s.paused).toBe(true);
    expect(s.reason).toBe('restricted');
    expect(typeof s.since).toBe('string');
  });

  it('defaults reason to user when none given', () => {
    const s = setPaused(undefined, true);
    expect(s.reason).toBe('user');
  });

  it('resuming clears pause state', () => {
    const s = setPaused({ paused: true, reason: 'user', since: '2024-01-01T00:00:00Z' }, false);
    expect(s.paused).toBe(false);
    expect(s.reason).toBeUndefined();
  });

  it('keeps the original since when re-setting an already-paused state', () => {
    const since = '2024-01-01T00:00:00.000Z';
    const s = setPaused({ paused: true, reason: 'user', since }, true, 'restricted');
    expect(s.since).toBe(since);
  });
});

describe('evaluateGroupRules — day status', () => {
  const base = (over: Partial<RuleEvalInput> = {}): RuleEvalInput => ({
    group: {}, today: 1 /* Monday */, history: [], now: T0, ...over,
  });

  it('allowed for any-day groups', () => {
    const r = evaluateGroupRules(base({ group: { anyday: true } }));
    expect(r.dayStatus).toBe('allowed');
    expect(r.needsReview).toBe(false);
  });

  it('allowed when today is in postingDays', () => {
    const r = evaluateGroupRules(base({ group: { postingDays: [1, 3] } }));
    expect(r.dayStatus).toBe('allowed');
  });

  it('not-allowed when today is not in postingDays → needsReview', () => {
    const r = evaluateGroupRules(base({ group: { postingDays: [2, 4] } }));
    expect(r.dayStatus).toBe('not-allowed');
    expect(r.needsReview).toBe(true);
    expect(r.messages.some((m) => /not a permitted posting day/i.test(m))).toBe(true);
  });

  it('unknown when no day info and surfaces a message (no auto-block)', () => {
    const r = evaluateGroupRules(base({ group: {} }));
    expect(r.dayStatus).toBe('unknown');
    expect(r.needsReview).toBe(false);
    expect(r.messages.length).toBeGreaterThan(0);
  });
});

describe('evaluateGroupRules — frequency status', () => {
  const link = 'https://www.facebook.com/groups/abc';
  const base = (over: Partial<RuleEvalInput> = {}): RuleEvalInput => ({
    group: { anyday: true, link }, today: 1, history: [], now: T0, ...over,
  });

  it('unknown when no frequency recorded', () => {
    const r = evaluateGroupRules(base());
    expect(r.frequencyStatus).toBe('unknown');
  });

  it('weekly + posted within 7 days → possible-violation', () => {
    const r = evaluateGroupRules(base({
      group: { anyday: true, link, frequencyLimit: '1 per week' },
      history: [{ groupLink: link, postedAt: new Date(T0 - 2 * 24 * 3600 * 1000).toISOString() }],
    }));
    expect(r.frequencyStatus).toBe('possible-violation');
    expect(r.needsReview).toBe(true);
  });

  it('weekly + no recent post → ok', () => {
    const r = evaluateGroupRules(base({
      group: { anyday: true, link, frequencyLimit: 'Once per week' },
      history: [{ groupLink: link, postedAt: new Date(T0 - 10 * 24 * 3600 * 1000).toISOString() }],
    }));
    expect(r.frequencyStatus).toBe('ok');
  });

  it('daily + posted today → possible-violation', () => {
    const r = evaluateGroupRules(base({
      group: { anyday: true, link, frequencyLimit: 'once daily' },
      history: [{ groupLink: link, postedAt: new Date(T0 - 2 * 3600 * 1000).toISOString() }],
    }));
    expect(r.frequencyStatus).toBe('possible-violation');
  });

  it('uninterpretable frequency text → unknown (never claims safe)', () => {
    const r = evaluateGroupRules(base({ group: { anyday: true, link, frequencyLimit: 'be respectful' } }));
    expect(r.frequencyStatus).toBe('unknown');
  });
});

describe('evaluateGroupRules — recentlyPosted', () => {
  const link = 'https://www.facebook.com/groups/xyz';

  it('detects a recent post by link within 7 days', () => {
    const r = evaluateGroupRules({
      group: { anyday: true, link },
      today: 1,
      history: [{ groupLink: link, postedAt: new Date(T0 - 3 * 24 * 3600 * 1000).toISOString() }],
      now: T0,
    });
    expect(r.recentlyPosted).toBe(true);
  });

  it('detects a recent post by name within 7 days', () => {
    const r = evaluateGroupRules({
      group: { anyday: true, name: 'My Town Buy/Sell' },
      today: 1,
      history: [{ group: 'My Town Buy/Sell', postedAt: new Date(T0 - 1 * 24 * 3600 * 1000).toISOString() }],
      now: T0,
    });
    expect(r.recentlyPosted).toBe(true);
  });

  it('is false when the last post is older than 7 days', () => {
    const r = evaluateGroupRules({
      group: { anyday: true, link },
      today: 1,
      history: [{ groupLink: link, postedAt: new Date(T0 - 30 * 24 * 3600 * 1000).toISOString() }],
      now: T0,
    });
    expect(r.recentlyPosted).toBe(false);
  });
});
