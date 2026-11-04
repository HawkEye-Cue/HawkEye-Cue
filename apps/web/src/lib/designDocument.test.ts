// @vitest-environment jsdom
//
// Tests for editable design save / reopen / duplicate (Workflow D) and the layer-tag
// serialization fix.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveDesign, listDesigns, getDesign, deleteDesign, duplicateDesign, newDesignId,
  EXTRA_PROPS, MAX_SAVED_DESIGNS, type DesignDocument,
} from './designDocument';

const SUB = 'user-A';

function doc(over: Partial<DesignDocument> = {}): DesignDocument {
  const now = Date.now();
  return {
    id: newDesignId(), name: 'Storm ad', templateId: 'roof-storm-1', width: 1080, height: 1080,
    canvasJson: { objects: [{ type: 'textbox', text: 'FREE ROOF INSPECTIONS', data: { isHeadline: true } }] },
    createdAt: now, updatedAt: now, ...over,
  };
}

beforeEach(() => localStorage.clear());

describe('EXTRA_PROPS — the layer-tag serialization fix', () => {
  it('includes `data` so role tags (isHeadline/isPhoneSlot/isLogoSlot) survive toJSON()', () => {
    expect(EXTRA_PROPS).toContain('data');
  });
});

describe('save → reopen (Workflow D)', () => {
  it('a saved design can be reopened with its editable layer data intact', () => {
    const d = doc();
    expect(saveDesign(SUB, d).ok).toBe(true);
    const reopened = getDesign(SUB, d.id);
    expect(reopened).not.toBeNull();
    expect(reopened!.canvasJson).toEqual(d.canvasJson);
    // The role tag that drives Apply Brand / Wingman routing is preserved.
    expect((reopened!.canvasJson as any).objects[0].data.isHeadline).toBe(true);
  });

  it('re-saving updates the existing design instead of duplicating it', () => {
    const d = doc();
    saveDesign(SUB, d);
    saveDesign(SUB, { ...d, name: 'Storm ad v2', updatedAt: d.updatedAt + 1 });
    const all = listDesigns(SUB);
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('Storm ad v2');
  });

  it('lists newest-updated first', () => {
    const a = doc({ name: 'A', updatedAt: 1000 });
    const b = doc({ name: 'B', updatedAt: 2000 });
    saveDesign(SUB, a);
    saveDesign(SUB, b);
    expect(listDesigns(SUB).map((x) => x.name)).toEqual(['B', 'A']);
  });

  it('deletes a design', () => {
    const d = doc();
    saveDesign(SUB, d);
    deleteDesign(SUB, d.id);
    expect(getDesign(SUB, d.id)).toBeNull();
  });

  it(`keeps at most ${MAX_SAVED_DESIGNS} designs`, () => {
    for (let i = 0; i < MAX_SAVED_DESIGNS + 5; i++) saveDesign(SUB, doc({ updatedAt: i }));
    expect(listDesigns(SUB)).toHaveLength(MAX_SAVED_DESIGNS);
  });
});

describe('account isolation', () => {
  it("one user's designs are never visible to another user on the same browser", () => {
    saveDesign('user-A', doc({ name: 'A-private' }));
    expect(listDesigns('user-B')).toEqual([]);
  });
});

describe('duplicate', () => {
  it('creates an independent copy with a new id', () => {
    const d = doc();
    const copy = duplicateDesign(d);
    expect(copy.id).not.toBe(d.id);
    expect(copy.name).toBe('Storm ad (copy)');
    // Deep copy: editing the copy's layer data must not mutate the original.
    (copy.canvasJson as any).objects[0].text = 'CHANGED';
    expect((d.canvasJson as any).objects[0].text).toBe('FREE ROOF INSPECTIONS');
  });
});

describe('storage failure is surfaced, not silent', () => {
  it('returns a quota error instead of throwing when localStorage is full', () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); };
    try {
      const r = saveDesign(SUB, doc());
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('quota');
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});
