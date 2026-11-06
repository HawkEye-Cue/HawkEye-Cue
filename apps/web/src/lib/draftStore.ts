/**
 * draftStore — per-user working-draft storage for the Create page.
 *
 * Drafts (caption, generated text, the original writing to restore, the attached design image,
 * composer mode) used to live under UNSCOPED localStorage keys (`hawkeye_draft_<name>`), so on a
 * shared computer the next person to sign in could see the previous user's draft or design.
 * Every draft key is now scoped to the signed-in user: `hawkeye_draft_<sub>_<name>`.
 *
 * Privacy rules (do not weaken):
 *  - LEGACY unscoped drafts have NO recorded owner, so ownership can never be established. They are
 *    therefore NEVER read, migrated or assigned to any user. They are left untouched in storage
 *    (not deleted, so nothing is destroyed) but are unreachable from the app.
 *  - Without a signed-in user id there is no owner: reads return null and writes are ignored, so
 *    nothing is ever stored under a shared/anonymous scope that a later user could read.
 *  - A user only ever reads keys carrying their own id.
 */

const PREFIX = 'hawkeye_draft_';

export const draftKey = (name: string, sub: string | undefined) => `${PREFIX}${sub}_${name}`;

export function readDraft(name: string, sub: string | undefined): string | null {
  if (!sub) return null;
  try {
    return localStorage.getItem(draftKey(name, sub));
  } catch { /* storage unavailable */ }
  return null;
}

/** value === null removes the key. Failures (quota / private mode) are swallowed: drafts are best-effort. */
export function writeDraft(name: string, sub: string | undefined, value: string | null): void {
  if (!sub) return;
  try {
    if (value === null) localStorage.removeItem(draftKey(name, sub));
    else localStorage.setItem(draftKey(name, sub), value);
  } catch { /* quota — ignore */ }
}
