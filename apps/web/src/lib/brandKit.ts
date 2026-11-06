/**
 * HawkEye-Cue — Brand Kit (localStorage, per-user, no backend needed for Phase 1)
 *
 * Stores the small set of brand assets a sole-proprietor or small agency needs:
 * company name, phone, website, primary color, accent color, and a logo image.
 * The logo is stored as a data URL so it works offline and in the sandbox without S3.
 *
 * The DesignStudio reads this on open to pre-fill isBrandSlot / isLogoSlot layers.
 * Future phases can migrate the store to the backend (DynamoDB BRAND_KIT SK).
 */

export interface BrandKit {
  companyName: string;
  phone: string;
  website: string;
  /** tagline / common marketing phrase */
  tagline: string;
  /** CSS hex color e.g. '#f97316' */
  primaryColor: string;
  accentColor: string;
  /** data URL from a user-uploaded logo, or null */
  logoDataUrl: string | null;
}

export const BRAND_KIT_DEFAULTS: BrandKit = {
  companyName: '',
  phone: '',
  website: '',
  tagline: '',
  primaryColor: '#f97316',
  accentColor: '#ffffff',
  logoDataUrl: null,
};

// Every key is scoped to the signed-in user. Without a user id there is no owner, so nothing is
// read or written (the old shared `hawkeye_brand_kit_default` key is never used: its owner is
// unknown, so its business details must not appear for whoever signs in next).
const brandKitKey = (sub: string) => `hawkeye_brand_kit_${sub}`;
const pendingKey = (sub: string) => `hawkeye_brand_kit_pending_${sub}`;
const baseKey = (sub: string) => `hawkeye_brand_kit_base_${sub}`;

export function loadBrandKit(sub: string | undefined): BrandKit {
  if (!sub) return { ...BRAND_KIT_DEFAULTS };
  try {
    const raw = localStorage.getItem(brandKitKey(sub));
    if (!raw) return { ...BRAND_KIT_DEFAULTS };
    return { ...BRAND_KIT_DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...BRAND_KIT_DEFAULTS };
  }
}

/** Local mirror only (fast first paint / offline). Not by itself a record of a user edit. */
export function saveBrandKit(sub: string | undefined, kit: BrandKit): void {
  if (!sub) return;
  try {
    localStorage.setItem(brandKitKey(sub), JSON.stringify(kit));
  } catch { /* quota exceeded — ignore, next attempt will try again */ }
}

/** True when the kit holds any real business detail. */
export function hasBrandDetails(k: BrandKit | null | undefined): boolean {
  return !!k && !!(k.companyName?.trim() || k.phone?.trim() || k.website?.trim() || k.tagline?.trim() || k.logoDataUrl);
}

// ─── Unsynced edits (account-safe sync) ─────────────────────────────────────────
// When the user edits the Brand Kit we record the WHOLE kit (deletions included) together with
// the cloud version it was based on (`base` = the cloud updatedAt the browser last saw). On the
// next load the edit is pushed only if the cloud is still at that version; if the cloud changed
// in the meantime (edited on another device) the cloud wins. No clocks are compared, and a
// field the user cleared is sent as cleared, so a deleted detail is never brought back.

export interface PendingBrandEdit { kit: BrandKit; base: string | null }

/** The cloud version (updatedAt) this browser last loaded or saved for the user. */
export function loadCloudBase(sub: string | undefined): string | null {
  if (!sub) return null;
  try { return localStorage.getItem(baseKey(sub)); } catch { return null; }
}
export function saveCloudBase(sub: string | undefined, updatedAt: string | null): void {
  if (!sub) return;
  try { if (updatedAt) localStorage.setItem(baseKey(sub), updatedAt); else localStorage.removeItem(baseKey(sub)); } catch { /* ignore */ }
}

/** Record a USER edit of the Brand Kit (call this, not saveBrandKit, from editors). */
export function recordBrandKitEdit(sub: string | undefined, kit: BrandKit): void {
  if (!sub) return;
  const base = loadCloudBase(sub);
  saveBrandKit(sub, kit);
  try { localStorage.setItem(pendingKey(sub), JSON.stringify({ kit, base } satisfies PendingBrandEdit)); } catch { /* ignore */ }
}

export function loadPendingBrandEdit(sub: string | undefined): PendingBrandEdit | null {
  if (!sub) return null;
  try {
    const raw = localStorage.getItem(pendingKey(sub));
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p || typeof p !== 'object' || !p.kit) return null;
    return { kit: { ...BRAND_KIT_DEFAULTS, ...p.kit }, base: typeof p.base === 'string' ? p.base : null };
  } catch { return null; }
}

export function clearPendingBrandEdit(sub: string | undefined): void {
  if (!sub) return;
  try { localStorage.removeItem(pendingKey(sub)); } catch { /* ignore */ }
}

/** Read a file as a data URL (for logo upload) */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
