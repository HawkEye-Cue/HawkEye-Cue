import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { computePostingConsistency, type ConsistencyEvent } from './postingConsistency.js';
import { isFlockEvent } from '../flocks.js';

// Arbitrary calendar-ish events: a mix of flocks (type 'post' + link), non-flock posts
// (no link), other types, past and future dates, completed and not.
const dateArb = fc.date({ min: new Date('2024-01-01'), max: new Date('2027-12-31') }).map(
  (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
);

const eventArb: fc.Arbitrary<ConsistencyEvent> = fc.record({
  id: fc.uuid(),
  date: dateArb,
  title: fc.string(),
  type: fc.constantFrom('post', 'task', 'meeting', 'reminder'),
  link: fc.oneof(fc.constant(null), fc.constant(''), fc.webUrl()),
  completed: fc.boolean(),
});

describe('computePostingConsistency', () => {
  // Feature: create-tab-redesign, Property 1: Posting Consistency never loses or invents records
  it('Property 1: postedCount + missedCount equals past flock count; recentMissed is exactly the past uncompleted flocks', () => {
    fc.assert(
      fc.property(fc.array(eventArb, { maxLength: 60 }), dateArb, (events, today) => {
        const result = computePostingConsistency(events, today);

        // Ground truth computed independently from the same inputs.
        const pastFlocks = events.filter((e) => isFlockEvent(e) && e.date < today);
        const expectedMissed = pastFlocks.filter((e) => !e.completed);

        // No invention / no loss: the posted+missed partition covers exactly the past flocks.
        expect(result.pastFlockCount).toBe(pastFlocks.length);
        expect(result.postedCount + result.missedCount).toBe(pastFlocks.length);
        expect(result.postedCount).toBe(pastFlocks.filter((e) => e.completed).length);
        expect(result.missedCount).toBe(expectedMissed.length);

        // recentMissed is exactly the past uncompleted flocks (as a set of ids/dates/titles),
        // never fabricated and never dropped.
        expect(result.recentMissed.length).toBe(expectedMissed.length);
        const key = (x: { date: string; title: string }) => `${x.date}::${x.title}`;
        const got = result.recentMissed.map(key).sort();
        const exp = expectedMissed.map(key).sort();
        expect(got).toEqual(exp);

        // completionRate is a bounded percentage.
        expect(result.completionRate).toBeGreaterThanOrEqual(0);
        expect(result.completionRate).toBeLessThanOrEqual(100);

        // recentMissed is sorted newest-first.
        for (let i = 1; i < result.recentMissed.length; i++) {
          expect(result.recentMissed[i - 1].date >= result.recentMissed[i].date).toBe(true);
        }
      }),
      { numRuns: 150 },
    );
  });

  it('is read-only: does not mutate the input events array or items', () => {
    const events: ConsistencyEvent[] = [
      { id: '1', date: '2026-01-01', title: 'A', type: 'post', link: 'https://fb.com/g/a', completed: true },
      { id: '2', date: '2026-01-02', title: 'B', type: 'post', link: 'https://fb.com/g/b', completed: false },
    ];
    const snapshot = JSON.parse(JSON.stringify(events));
    computePostingConsistency(events, '2026-02-01');
    expect(events).toEqual(snapshot);
  });

  it('empty history yields zeros, not errors', () => {
    const r = computePostingConsistency([], '2026-01-01');
    expect(r.postedCount).toBe(0);
    expect(r.missedCount).toBe(0);
    expect(r.completionRate).toBe(0);
    expect(r.currentStreakDays).toBe(0);
    expect(r.recentMissed).toEqual([]);
  });

  it('counts a current streak of fully-completed recent days and stops at a miss', () => {
    const events: ConsistencyEvent[] = [
      { id: '1', date: '2026-03-01', title: 'A', type: 'post', link: 'https://x/a', completed: false }, // miss (older)
      { id: '2', date: '2026-03-02', title: 'B', type: 'post', link: 'https://x/b', completed: true },
      { id: '3', date: '2026-03-03', title: 'C', type: 'post', link: 'https://x/c', completed: true },
    ];
    // today after all three; most recent two days fully completed, then a missed day.
    const r = computePostingConsistency(events, '2026-03-04');
    expect(r.currentStreakDays).toBe(2);
  });
});
