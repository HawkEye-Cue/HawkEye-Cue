// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { readDraft, writeDraft, draftKey } from './draftStore';

beforeEach(() => localStorage.clear());

describe('draftStore — per-user working drafts', () => {
  it('round-trips a draft for a user', () => {
    writeDraft('ownContent', 'user-a', 'My caption');
    expect(readDraft('ownContent', 'user-a')).toBe('My caption');
  });

  it("one user's draft is never visible to another user on the same browser", () => {
    writeDraft('ownContent', 'user-a', 'Private caption A');
    writeDraft('image', 'user-a', 'data:image/png;base64,AAAA');
    expect(readDraft('ownContent', 'user-b')).toBeNull();
    expect(readDraft('image', 'user-b')).toBeNull();
    expect(readDraft('ownContent', 'user-a')).toBe('Private caption A');
  });

  it('writing null removes the draft', () => {
    writeDraft('platformContent', 'user-a', '{"facebook":"x"}');
    writeDraft('platformContent', 'user-a', null);
    expect(readDraft('platformContent', 'user-a')).toBeNull();
  });

  it('MIGRATES (does not lose) a legacy unscoped draft to the first user who opens Create', () => {
    localStorage.setItem('hawkeye_draft_ownContent', 'Written before the update');
    expect(readDraft('ownContent', 'user-a')).toBe('Written before the update');
    // moved into the user's scope, and the legacy key is gone so a second user cannot claim it
    expect(localStorage.getItem(draftKey('ownContent', 'user-a'))).toBe('Written before the update');
    expect(localStorage.getItem('hawkeye_draft_ownContent')).toBeNull();
    expect(readDraft('ownContent', 'user-b')).toBeNull();
  });

  it('a scoped draft wins over a legacy one', () => {
    writeDraft('baseText', 'user-a', 'new scoped');
    localStorage.setItem('hawkeye_draft_baseText', 'old legacy');
    expect(readDraft('baseText', 'user-a')).toBe('new scoped');
  });

  it('keys are namespaced by user and by name', () => {
    expect(draftKey('mode', 'abc')).toBe('hawkeye_draft_abc_mode');
    expect(draftKey('mode', undefined)).toBe('hawkeye_draft_anon_mode');
  });
});
