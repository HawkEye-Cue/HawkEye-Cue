// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { readDraft, writeDraft, draftKey } from './draftStore';

const NAMES = ['mode', 'ownContent', 'baseText', 'platformContent', 'restorable', 'image'];
const IMG = 'data:image/png;base64,AAAA';

beforeEach(() => localStorage.clear());

function writeFullDraft(sub: string, tag: string) {
  writeDraft('mode', sub, 'write');
  writeDraft('ownContent', sub, `own ${tag}`);
  writeDraft('baseText', sub, `base ${tag}`);
  writeDraft('platformContent', sub, JSON.stringify({ facebook: `ai ${tag}` }));
  writeDraft('restorable', sub, JSON.stringify({ mode: 'write', text: `orig ${tag}` }));
  writeDraft('image', sub, IMG + tag);
}

describe('draftStore — per-user working drafts', () => {
  it('round-trips a draft for a user', () => {
    writeDraft('ownContent', 'user-a', 'My caption');
    expect(readDraft('ownContent', 'user-a')).toBe('My caption');
  });

  it('writing null removes the draft', () => {
    writeDraft('platformContent', 'user-a', '{"facebook":"x"}');
    writeDraft('platformContent', 'user-a', null);
    expect(readDraft('platformContent', 'user-a')).toBeNull();
  });

  it('keys are namespaced by user and by name', () => {
    expect(draftKey('mode', 'abc')).toBe('hawkeye_draft_abc_mode');
  });
});

describe('draft isolation between accounts on the same browser', () => {
  it("account switching: B sees none of A's writing, AI drafts, original text or image", () => {
    writeFullDraft('user-a', 'A');
    for (const n of NAMES) expect(readDraft(n, 'user-b')).toBeNull();
    for (const n of NAMES) expect(readDraft(n, 'user-a')).not.toBeNull();
  });

  it("B's own writes never overwrite or leak into A's", () => {
    writeFullDraft('user-a', 'A');
    writeFullDraft('user-b', 'B');
    expect(readDraft('ownContent', 'user-a')).toBe('own A');
    expect(readDraft('image', 'user-a')).toBe(IMG + 'A');
    expect(readDraft('ownContent', 'user-b')).toBe('own B');
    writeDraft('image', 'user-b', null);
    expect(readDraft('image', 'user-a')).toBe(IMG + 'A');
  });

  it('logout/login as the same user restores their own draft; login as someone else gets nothing', () => {
    writeFullDraft('user-a', 'A');
    // logout -> (no user) -> login as B: nothing visible, and nothing written
    expect(readDraft('ownContent', undefined)).toBeNull();
    expect(readDraft('ownContent', 'user-b')).toBeNull();
    // back to A
    expect(readDraft('ownContent', 'user-a')).toBe('own A');
    expect(readDraft('platformContent', 'user-a')).toBe(JSON.stringify({ facebook: 'ai A' }));
    expect(readDraft('image', 'user-a')).toBe(IMG + 'A');
  });

  it('sub-string / prefix ids cannot read each other', () => {
    writeFullDraft('abc', 'short');
    expect(readDraft('ownContent', 'abc_own')).toBeNull();
    expect(readDraft('ownContent', 'ab')).toBeNull();
  });
});

describe('no signed-in user means no shared/anonymous storage', () => {
  it('writes without a user id are ignored (nothing is stored for a later user to find)', () => {
    writeDraft('ownContent', undefined, 'typed while signed out');
    writeDraft('image', '', IMG);
    expect(localStorage.length).toBe(0);
    expect(readDraft('ownContent', undefined)).toBeNull();
    expect(readDraft('ownContent', 'user-b')).toBeNull();
  });
});

describe('legacy unscoped drafts (owner unknown) are never assigned to anyone', () => {
  beforeEach(() => {
    for (const n of NAMES) localStorage.setItem(`hawkeye_draft_${n}`, `legacy-${n}`);
  });

  it('are not returned to the first, second or any user, nor when signed out', () => {
    for (const sub of ['user-a', 'user-b', undefined]) {
      for (const n of NAMES) expect(readDraft(n, sub)).toBeNull();
    }
  });

  it('are not moved into any user scope (no scoped keys are created by reading)', () => {
    for (const n of NAMES) readDraft(n, 'user-a');
    for (const n of NAMES) expect(localStorage.getItem(draftKey(n, 'user-a'))).toBeNull();
  });

  it('are left intact (not destroyed) so nothing is silently deleted', () => {
    for (const n of NAMES) readDraft(n, 'user-a');
    for (const n of NAMES) expect(localStorage.getItem(`hawkeye_draft_${n}`)).toBe(`legacy-${n}`);
  });

  it("a user's own new draft is unaffected by leftover legacy keys", () => {
    writeDraft('ownContent', 'user-a', 'mine');
    expect(readDraft('ownContent', 'user-a')).toBe('mine');
    expect(readDraft('ownContent', 'user-b')).toBeNull();
  });
});
