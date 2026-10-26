// @vitest-environment jsdom
//
// Targeted regression tests for the team-invite token preservation across the auth flow.
// These guard the fix for: "/team?invite=TOKEN in incognito → redirect to /landing lost
// the invite". The helper stashes the token so it survives landing/register/verify/login.

import { describe, it, expect, beforeEach } from 'vitest';
import { stashInvite, stashInviteFromSearch, peekInvite, consumeInvite } from './pendingInvite';

// jsdom provides sessionStorage; clear between tests.
beforeEach(() => { sessionStorage.clear(); });

describe('pendingInvite', () => {
  it('stashes and peeks a valid token without clearing it', () => {
    stashInvite('abc123DEF-456_789');
    expect(peekInvite()).toBe('abc123DEF-456_789');
    // peek does not consume
    expect(peekInvite()).toBe('abc123DEF-456_789');
  });

  it('consume returns the token once, then clears it', () => {
    stashInvite('5f3e9c2a-1b4d-4e6f-8a0c-2d9b1e7f3a5c');
    expect(consumeInvite()).toBe('5f3e9c2a-1b4d-4e6f-8a0c-2d9b1e7f3a5c');
    expect(consumeInvite()).toBeNull(); // already consumed
    expect(peekInvite()).toBeNull();
  });

  it('extracts the invite token from a URL search string (the AuthGuard path)', () => {
    stashInviteFromSearch('?invite=9a8b7c6d-0000-1111-2222-333344445555&x=1');
    expect(peekInvite()).toBe('9a8b7c6d-0000-1111-2222-333344445555');
  });

  it('ignores a missing invite param', () => {
    stashInviteFromSearch('?foo=bar');
    expect(peekInvite()).toBeNull();
  });

  it('rejects junk / malformed tokens (never stashes unsafe values)', () => {
    stashInvite('');                          // empty
    expect(peekInvite()).toBeNull();
    stashInvite('short');                     // too short (<8)
    expect(peekInvite()).toBeNull();
    stashInvite('has spaces and / slashes');  // illegal chars
    expect(peekInvite()).toBeNull();
    stashInvite('a'.repeat(200));             // too long (>128)
    expect(peekInvite()).toBeNull();
  });

  it('a newer stash overwrites an older pending invite', () => {
    stashInvite('1111aaaa-bbbb-cccc-dddd-eeeeffff0000');
    stashInvite('2222aaaa-bbbb-cccc-dddd-eeeeffff0000');
    expect(peekInvite()).toBe('2222aaaa-bbbb-cccc-dddd-eeeeffff0000');
  });
});
