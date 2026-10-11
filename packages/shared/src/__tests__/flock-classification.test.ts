// Regression tests for: separate-flocks-from-posts
//
// These tests lock in the canonical (user-approved) Flock signal implemented by `isFlockEvent`:
// an event is a Flock iff `type === 'post'` AND it carries a non-empty, trimmed group `link`.
// Regular business-page scheduled posts (type:'post' with no/empty/whitespace link) are NOT
// Flocks and must be excluded from Today's Flocks / Missed Flocks lists and counters.
//
// Validates: Requirements 5.1, 5.2

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { isFlockEvent, type FlockClassifiable } from '../flocks.js';

/** A calendar-event-like shape used by the mixed-calendar derivation tests. */
interface TestEvent extends FlockClassifiable {
  type: 'post' | 'task' | 'meeting' | 'reminder';
  link?: string;
  date?: string;
  completed?: boolean;
}

describe('isFlockEvent — regular posts are excluded', () => {
  it('regular post with an empty link is NOT a Flock', () => {
    expect(isFlockEvent({ type: 'post', link: '' })).toBe(false);
  });

  it('regular post with a missing link is NOT a Flock', () => {
    expect(isFlockEvent({ type: 'post' })).toBe(false);
  });

  it('regular post with a whitespace-only link is NOT a Flock', () => {
    expect(isFlockEvent({ type: 'post', link: '   ' })).toBe(false);
  });
});

describe('isFlockEvent — real Flocks are included', () => {
  it('post with a group link IS a Flock', () => {
    expect(isFlockEvent({ type: 'post', link: 'https://facebook.com/groups/x' })).toBe(true);
  });

  it('a published Flock (still carries a link) IS a Flock — predicate ignores completion/published', () => {
    // Whatever completion/published state an event has, the predicate depends only on
    // type + non-empty link.
    const publishedFlock: TestEvent = {
      type: 'post',
      link: 'https://facebook.com/groups/published',
      completed: true,
    };
    expect(isFlockEvent(publishedFlock)).toBe(true);
  });
});

describe('isFlockEvent — non-post types are excluded', () => {
  it('a task with a link is NOT a Flock', () => {
    expect(isFlockEvent({ type: 'task', link: 'x' })).toBe(false);
  });

  it('a meeting is NOT a Flock', () => {
    expect(isFlockEvent({ type: 'meeting' })).toBe(false);
  });

  it('a reminder is NOT a Flock', () => {
    expect(isFlockEvent({ type: 'reminder' })).toBe(false);
  });
});

describe('mixed-calendar derivations', () => {
  const events: TestEvent[] = [
    { type: 'post', link: 'https://facebook.com/groups/a', date: '2024-01-01', completed: false }, // Flock, past, not done
    { type: 'post', link: '', date: '2024-01-01', completed: false }, // regular post (no link), past, not done
    { type: 'post', date: '2024-01-02', completed: false }, // regular post (missing link), past, not done
    { type: 'post', link: '   ', date: '2024-01-02', completed: false }, // regular post (whitespace), past, not done
    { type: 'post', link: 'https://facebook.com/groups/b', date: '2024-01-03', completed: true }, // Flock, past, DONE
    { type: 'post', link: 'https://facebook.com/groups/c', date: '2024-12-31', completed: false }, // Flock, future, not done
    { type: 'task', link: 'https://facebook.com/groups/d', date: '2024-01-01', completed: false }, // task w/ link (not a Flock)
    { type: 'meeting', date: '2024-01-01', completed: false }, // meeting
    { type: 'reminder', date: '2024-01-01', completed: false }, // reminder
  ];

  it('events.filter(isFlockEvent) equals exactly the type:post events with a non-empty trimmed link', () => {
    const expectedFlocks = events.filter(
      (e) => e.type === 'post' && typeof e.link === 'string' && e.link.trim().length > 0,
    );
    expect(events.filter(isFlockEvent)).toEqual(expectedFlocks);
    // Sanity: only the three group-linked posts qualify.
    expect(events.filter(isFlockEvent)).toHaveLength(3);
  });

  it('missed-Flock derivation = past date + not completed + isFlockEvent; link-less past posts excluded', () => {
    const today = '2024-06-01';
    const missed = events.filter((e) => e.date! < today && !e.completed && isFlockEvent(e));

    // Only the first event qualifies: it is a Flock (has a group link), is in the past, and not
    // completed. The empty/missing/whitespace-link posts are past + uncompleted but excluded
    // because they are not Flocks. The completed Flock is excluded by `!completed`.
    expect(missed).toEqual([
      { type: 'post', link: 'https://facebook.com/groups/a', date: '2024-01-01', completed: false },
    ]);

    // Explicitly confirm link-less past uncompleted posts are not in the missed set.
    const linkless = events.filter(
      (e) => e.type === 'post' && (!e.link || e.link.trim().length === 0),
    );
    for (const post of linkless) {
      expect(missed).not.toContain(post);
    }
  });
});

// Feature: separate-flocks-from-posts, Property 1: Flock classification by group link
describe('property: Flock classification by group link', () => {
  it('events.filter(isFlockEvent) equals the type:post events with a non-empty trimmed link', () => {
    // Generator for a single arbitrary calendar event.
    const linkArb = fc.oneof(
      fc.constant<string | undefined>(undefined), // absent link
      fc.constant(''), // empty link
      fc.stringMatching(/^\s+$/), // whitespace-only link
      fc.webUrl(), // real url
    );

    // Build a valid YYYY-MM-DD string from independent y/m/d parts (clamped to 28 days to
    // avoid month-overflow), rather than round-tripping through Date which can yield invalid
    // values near the bounds.
    const dateArb = fc
      .tuple(
        fc.integer({ min: 2000, max: 2100 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 28 }),
      )
      .map(([y, m, d]) => {
        const mm = String(m).padStart(2, '0');
        const dd = String(d).padStart(2, '0');
        return `${y}-${mm}-${dd}`;
      });

    const eventArb: fc.Arbitrary<TestEvent> = fc.record(
      {
        type: fc.constantFrom('post', 'task', 'meeting', 'reminder'),
        link: linkArb,
        completed: fc.boolean(),
        date: dateArb,
      },
      { requiredKeys: ['type', 'completed', 'date'] },
    );

    fc.assert(
      fc.property(fc.array(eventArb), (events) => {
        const expected = events.filter(
          (e) => e.type === 'post' && typeof e.link === 'string' && e.link.trim().length > 0,
        );
        expect(events.filter(isFlockEvent)).toEqual(expected);
      }),
      { numRuns: 200 },
    );
  });
});
