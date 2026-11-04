// Tests for photo revision history (Phase 2, task 7: preserve originals + undo AI edits).
import { describe, it, expect } from 'vitest';
import {
  startRevisions, addAiRevision, undoAi, redoAi, restoreOriginal, canUndoAi, canRedoAi,
  currentRevision, originalRevision, MAX_AI_REVISIONS,
} from './photoRevisions';

const ORIG = 'data:image/png;base64,ORIGINAL';

describe('the original photo is preserved', () => {
  it('starts on the original', () => {
    const s = startRevisions(ORIG);
    expect(currentRevision(s).src).toBe(ORIG);
    expect(currentRevision(s).source).toBe('original');
  });

  it('an AI edit does NOT overwrite the original', () => {
    const s = addAiRevision(startRevisions(ORIG), 'data:EDIT1', 'remove the car');
    expect(originalRevision(s).src).toBe(ORIG);
    expect(currentRevision(s).src).toBe('data:EDIT1');
  });

  it('the original survives many edits, undo, branching, and the cap', () => {
    let s = startRevisions(ORIG);
    for (let i = 0; i < MAX_AI_REVISIONS + 5; i++) s = addAiRevision(s, `data:E${i}`, `edit ${i}`);
    s = undoAi(undoAi(s));
    s = addAiRevision(s, 'data:BRANCH', 'branch');
    expect(originalRevision(s).src).toBe(ORIG);
    expect(s.revisions[0].source).toBe('original');
  });

  it('restoreOriginal jumps back to the untouched photo', () => {
    let s = addAiRevision(addAiRevision(startRevisions(ORIG), 'data:E1', 'a'), 'data:E2', 'b');
    s = restoreOriginal(s);
    expect(currentRevision(s).src).toBe(ORIG);
  });

  it('restoreOriginal keeps AI history so the user can redo back to their edit', () => {
    let s = addAiRevision(startRevisions(ORIG), 'data:E1', 'a');
    s = restoreOriginal(s);
    expect(canRedoAi(s)).toBe(true);
    s = redoAi(s);
    expect(currentRevision(s).src).toBe('data:E1');
  });
});

describe('undo / redo of AI edits', () => {
  it('undo steps back one AI edit, redo steps forward', () => {
    let s = addAiRevision(addAiRevision(startRevisions(ORIG), 'data:E1', 'a'), 'data:E2', 'b');
    s = undoAi(s);
    expect(currentRevision(s).src).toBe('data:E1');
    s = redoAi(s);
    expect(currentRevision(s).src).toBe('data:E2');
  });

  it('cannot undo past the original', () => {
    let s = startRevisions(ORIG);
    expect(canUndoAi(s)).toBe(false);
    s = undoAi(s);
    expect(currentRevision(s).src).toBe(ORIG);
  });

  it('cannot redo past the newest edit', () => {
    let s = addAiRevision(startRevisions(ORIG), 'data:E1', 'a');
    expect(canRedoAi(s)).toBe(false);
    s = redoAi(s);
    expect(currentRevision(s).src).toBe('data:E1');
  });

  it('a new edit after undo discards forward history (standard branching)', () => {
    let s = addAiRevision(addAiRevision(startRevisions(ORIG), 'data:E1', 'a'), 'data:E2', 'b');
    s = undoAi(s);                       // on E1
    s = addAiRevision(s, 'data:E3', 'c'); // branch from E1
    expect(s.revisions.map((r) => r.src)).toEqual([ORIG, 'data:E1', 'data:E3']);
    expect(canRedoAi(s)).toBe(false);
  });

  it('records the instruction that produced each AI revision', () => {
    const s = addAiRevision(startRevisions(ORIG), 'data:E1', 'remove the trash cans');
    expect(currentRevision(s).instruction).toBe('remove the trash cans');
    expect(currentRevision(s).source).toBe('ai-edit');
  });
});

describe('memory cap', () => {
  it(`keeps the original + at most ${MAX_AI_REVISIONS} AI edits, dropping the OLDEST edit`, () => {
    let s = startRevisions(ORIG);
    for (let i = 0; i < MAX_AI_REVISIONS + 3; i++) s = addAiRevision(s, `data:E${i}`, `e${i}`);
    expect(s.revisions).toHaveLength(MAX_AI_REVISIONS + 1);
    expect(s.revisions[0].src).toBe(ORIG);
    // Oldest three AI edits (E0,E1,E2) dropped; newest retained.
    expect(s.revisions[1].src).toBe('data:E3');
    expect(currentRevision(s).src).toBe(`data:E${MAX_AI_REVISIONS + 2}`);
  });
});

describe('immutability', () => {
  it('operations never mutate the previous state', () => {
    const s0 = startRevisions(ORIG);
    const s1 = addAiRevision(s0, 'data:E1', 'a');
    expect(s0.revisions).toHaveLength(1);
    expect(s0.current).toBe(0);
    undoAi(s1);
    expect(s1.current).toBe(1);
  });
});
