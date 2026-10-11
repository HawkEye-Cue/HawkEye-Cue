// Bug condition RECONCILIATION test for: separate-flocks-from-posts
//
// ORIGIN: This file began as a bug-condition exploration test (Task 1). It encoded the INTENDED
// behavior against a provisional classifier that mirrored the CURRENT buggy logic
// (`e.type === 'post'`), and was EXPECTED TO FAIL on the unfixed code — that failure confirmed the
// bug: regular business-page scheduled posts (type:'post' with no group link) were mis-classified
// as Flocks.
//
// RECONCILED: Now that the real `isFlockEvent` predicate (Task 2) replaces the buggy logic, this
// test is reconciled to verify the FIX. It imports the REAL `isFlockEvent` from `../flocks.js` and
// asserts that the previously-failing cases now PASS: a `type:'post'` event WITHOUT a non-empty
// group link is NOT a Flock, while a real Flock (post with a group link) IS a Flock. The documented
// intent and the Property 1 tag are preserved; see `flock-classification.test.ts` for the full
// regression suite.
//
// Validates: Requirements 1.1, 2.1, 2.2, 5.2

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { isFlockEvent, type FlockClassifiable } from '../flocks.js';

describe('flock classification — bug reconciled by the real isFlockEvent predicate', () => {
  it('concrete: a regular post with an empty link is NOT a Flock (previously mis-classified)', () => {
    const regularPostEmptyLink: FlockClassifiable = { type: 'post', link: '' };
    expect(isFlockEvent(regularPostEmptyLink)).toBe(false);
  });

  it('concrete: a regular post with no link is NOT a Flock (previously mis-classified)', () => {
    const regularPostNoLink: FlockClassifiable = { type: 'post' };
    expect(isFlockEvent(regularPostNoLink)).toBe(false);
  });

  it('concrete: a real Flock (post with a group link) IS a Flock', () => {
    const realFlock: FlockClassifiable = { type: 'post', link: 'https://facebook.com/groups/x' };
    expect(isFlockEvent(realFlock)).toBe(true);
  });

  // Feature: separate-flocks-from-posts, Property 1: Flock classification by group link
  it('property: a type:"post" event WITHOUT a non-empty link is NOT a Flock', () => {
    fc.assert(
      fc.property(
        // Regular business-page posts: type:'post' with an absent, empty, or whitespace-only link.
        fc.oneof(
          fc.constant<FlockClassifiable>({ type: 'post' }),
          fc
            .stringMatching(/^\s*$/)
            .map((blank): FlockClassifiable => ({ type: 'post', link: blank })),
        ),
        (regularPost) => {
          // Reconciled behavior: a post with no real group link is NOT a Flock under the fix.
          expect(isFlockEvent(regularPost)).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });
});
