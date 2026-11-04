/**
 * Photo revision history — preserves the ORIGINAL photo and every AI edit as a revision.
 *
 * Product rules:
 *   • The user's original upload is IMMUTABLE and always recoverable ("Restore original").
 *   • Each AI photo edit APPENDS a new revision; it never overwrites a prior one.
 *   • The user can step back/forward through AI edits (undo/redo an AI edit), independent of
 *     the canvas's own text/layout undo stack.
 *   • Branching: if the user goes back to an older revision and makes a NEW edit, the forward
 *     history is discarded (standard undo semantics) — but the ORIGINAL is never discarded.
 *
 * Pure and immutable (every operation returns a new state) so it is trivially testable and
 * safe to hold in React state.
 */

export interface PhotoRevision {
  id: string;
  /** data URL of this version of the photo */
  src: string;
  /** what produced it: the original upload or an AI instruction */
  source: 'original' | 'ai-edit';
  /** the natural-language instruction (ai-edit only) */
  instruction?: string;
  createdAt: number;
}

export interface RevisionState {
  /** revisions[0] is ALWAYS the original upload */
  revisions: PhotoRevision[];
  /** index of the revision currently shown on the canvas */
  current: number;
}

/** Cap memory: keep the original + the most recent N AI edits. */
export const MAX_AI_REVISIONS = 10;

let seq = 0;
const nextId = () => `rev_${Date.now().toString(36)}_${(seq++).toString(36)}`;

export function startRevisions(originalSrc: string, now = Date.now()): RevisionState {
  return {
    revisions: [{ id: nextId(), src: originalSrc, source: 'original', createdAt: now }],
    current: 0,
  };
}

/**
 * Record a new AI edit. Discards any forward (redo) history beyond `current`, then appends.
 * The original (index 0) is never removed; when over the cap, the OLDEST AI edit is dropped.
 */
export function addAiRevision(state: RevisionState, src: string, instruction: string, now = Date.now()): RevisionState {
  const kept = state.revisions.slice(0, state.current + 1);
  let revisions = [...kept, { id: nextId(), src, source: 'ai-edit' as const, instruction, createdAt: now }];
  // Enforce the cap on AI edits while ALWAYS retaining the original at index 0.
  const aiCount = revisions.length - 1;
  if (aiCount > MAX_AI_REVISIONS) {
    const overflow = aiCount - MAX_AI_REVISIONS;
    revisions = [revisions[0], ...revisions.slice(1 + overflow)];
  }
  return { revisions, current: revisions.length - 1 };
}

export function canUndoAi(state: RevisionState): boolean { return state.current > 0; }
export function canRedoAi(state: RevisionState): boolean { return state.current < state.revisions.length - 1; }

export function undoAi(state: RevisionState): RevisionState {
  return canUndoAi(state) ? { ...state, current: state.current - 1 } : state;
}

export function redoAi(state: RevisionState): RevisionState {
  return canRedoAi(state) ? { ...state, current: state.current + 1 } : state;
}

/** Jump straight back to the untouched original. Keeps the AI history so the user can redo. */
export function restoreOriginal(state: RevisionState): RevisionState {
  return { ...state, current: 0 };
}

export function currentRevision(state: RevisionState): PhotoRevision {
  return state.revisions[state.current];
}

export function originalRevision(state: RevisionState): PhotoRevision {
  return state.revisions[0];
}
