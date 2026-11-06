/**
 * draftStore — per-user working-draft storage for the Create page.
 *
 * Drafts (caption, generated text, the original writing to restore, the attached design image,
 * composer mode) used to live under UNSCOPED localStorage keys (`hawkeye_draft_<name>`), so on a
 * shared computer the next person to sign in could see the previous user's draft or design.
 * Every draft key is now scoped to the signed-in user: `hawkeye_draft_<sub>_<name>`.
 *
 * Nothing is lost on upgrade: if a user's scoped key does not exist yet but a LEGACY unscoped
 * draft does, it is MOVED (not deleted) to that user's scoped key the first time they open Create.
 * Only the first user to open Create after the update can claim a legacy draft, because moving it
 * removes the legacy key.
 */

const PREFIX = 'hawkeye_draft_';

export const draftKey = (name: string, sub: string | undefined) => `${PREFIX}${sub || 'anon'}_${name}`;
const legacyKey = (name: string) => `${PREFIX}${name}`;

export function readDraft(name: string, sub: string | undefined): string | null {
  try {
    const scoped = localStorage.getItem(draftKey(name, sub));
    if (scoped !== null) return scoped;
    const legacy = localStorage.getItem(legacyKey(name));
    if (legacy !== null) {
      localStorage.setItem(draftKey(name, sub), legacy); // preserve: move to this user's scope
      localStorage.removeItem(legacyKey(name));
      return legacy;
    }
  } catch { /* storage unavailable */ }
  return null;
}

/** value === null removes the key. Failures (quota / private mode) are swallowed: drafts are best-effort. */
export function writeDraft(name: string, sub: string | undefined, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(draftKey(name, sub));
    else localStorage.setItem(draftKey(name, sub), value);
  } catch { /* quota — ignore */ }
}
