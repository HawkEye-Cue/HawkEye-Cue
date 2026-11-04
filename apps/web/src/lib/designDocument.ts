/**
 * Editable design documents — save, reopen, duplicate.
 *
 * Fixes a Phase 1 defect: the studio tagged Fabric objects with a custom `data` property
 * (isHeadline / isPhoneSlot / isLogoSlot …) but Fabric's toJSON() does NOT serialize unknown
 * properties. Undo/redo restored from toJSON(), so after a single undo every tag was lost and
 * Apply Brand / layer selection / Wingman routing silently stopped finding layers.
 *
 * Fix: always serialize with canvas.toObject(EXTRA_PROPS) so `data` (and our role tags)
 * round-trip. NOTE: in Fabric 6, `toJSON()` takes NO arguments — the custom-properties list
 * moved to `toObject(propertiesToInclude)`. Passing the list to toJSON() is silently ignored.
 *
 * Storage: editable design data is stored SEPARATELY from exported images (per spec). Designs
 * live in localStorage per user under `hawkeye_designs_{sub}` for now (see the Brand Kit note
 * on cross-device sync — the same account-backed migration path applies here).
 */

/** Custom properties that must survive toJSON()/loadFromJSON() round-trips. */
export const EXTRA_PROPS = ['data', 'selectable', 'editable', 'hasControls'] as const;

export interface DesignDocument {
  id: string;
  name: string;
  templateId: string;
  width: number;
  height: number;
  /** Fabric canvas JSON (serialized WITH EXTRA_PROPS) — the editable layer data. */
  canvasJson: unknown;
  /** Small preview image for the "My Designs" list (NOT the editable data). */
  thumbnail?: string;
  createdAt: number;
  updatedAt: number;
}

const key = (sub: string | undefined) => `hawkeye_designs_${sub || 'default'}`;
export const MAX_SAVED_DESIGNS = 30;

export function listDesigns(sub: string | undefined): DesignDocument[] {
  try {
    const raw = localStorage.getItem(key(sub));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.sort((a: DesignDocument, b: DesignDocument) => b.updatedAt - a.updatedAt) : [];
  } catch {
    return [];
  }
}

export function getDesign(sub: string | undefined, id: string): DesignDocument | null {
  return listDesigns(sub).find((d) => d.id === id) || null;
}

export type SaveResult = { ok: true; doc: DesignDocument } | { ok: false; reason: 'quota' | 'error' };

/** Insert or update a design. Keeps the newest MAX_SAVED_DESIGNS. */
export function saveDesign(sub: string | undefined, doc: DesignDocument): SaveResult {
  try {
    const others = listDesigns(sub).filter((d) => d.id !== doc.id);
    const next = [doc, ...others].slice(0, MAX_SAVED_DESIGNS);
    localStorage.setItem(key(sub), JSON.stringify(next));
    return { ok: true, doc };
  } catch (e) {
    // localStorage is ~5MB; designs with embedded photos can exceed it. Surface this so the UI
    // can tell the user instead of silently dropping their work.
    const isQuota = e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22);
    return { ok: false, reason: isQuota ? 'quota' : 'error' };
  }
}

export function deleteDesign(sub: string | undefined, id: string): void {
  try {
    localStorage.setItem(key(sub), JSON.stringify(listDesigns(sub).filter((d) => d.id !== id)));
  } catch { /* ignore */ }
}

let seq = 0;
export function newDesignId(): string {
  return `dsn_${Date.now().toString(36)}_${(seq++).toString(36)}`;
}

/** Duplicate: deep copy of the editable data under a new id + "(copy)" name. */
export function duplicateDesign(doc: DesignDocument, now = Date.now()): DesignDocument {
  return {
    ...doc,
    id: newDesignId(),
    name: `${doc.name} (copy)`,
    canvasJson: JSON.parse(JSON.stringify(doc.canvasJson)),
    createdAt: now,
    updatedAt: now,
  };
}
