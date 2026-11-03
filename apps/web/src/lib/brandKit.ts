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

function brandKitKey(sub: string | undefined) {
  return `hawkeye_brand_kit_${sub || 'default'}`;
}

export function loadBrandKit(sub: string | undefined): BrandKit {
  try {
    const raw = localStorage.getItem(brandKitKey(sub));
    if (!raw) return { ...BRAND_KIT_DEFAULTS };
    return { ...BRAND_KIT_DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...BRAND_KIT_DEFAULTS };
  }
}

export function saveBrandKit(sub: string | undefined, kit: BrandKit): void {
  try {
    localStorage.setItem(brandKitKey(sub), JSON.stringify(kit));
  } catch { /* quota exceeded — ignore, next attempt will try again */ }
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
