/**
 * designStore — account-backed Brand Kit + Design storage with safe local→cloud migration.
 *
 * Designs and Brand Kits moved from browser-only localStorage (device-locked, lost on cache
 * clear) to the user's account (DynamoDB metadata + private S3 objects via presigned URLs),
 * so they sync across devices.
 *
 * Migration (item 2 — never delete the user's work):
 *   • On first authenticated load we read any localStorage designs/brand kit and, for each item
 *     NOT already in the cloud, upload a copy. We do NOT delete the local copies — they stay as a
 *     fallback until the user confirms everything is in the cloud (and even then we keep them).
 *   • Migration is idempotent: a per-user "migrated" marker plus id-level existence checks mean
 *     re-running never duplicates or overwrites newer cloud data.
 *
 * All large payloads (design JSON, which can embed photos; logos) go browser↔S3 directly via
 * short-lived presigned URLs minted by the server AFTER it authorizes the request.
 */

import type { ApiClient, CloudDesignMeta, BrandKitInput } from '@social-lead-gen/shared';
import type { BrandKit } from './brandKit';
import {
  BRAND_KIT_DEFAULTS, loadBrandKit, saveBrandKit, hasBrandDetails,
  loadPendingBrandEdit, clearPendingBrandEdit, saveCloudBase,
} from './brandKit';
import { listDesigns as listLocalDesigns, type DesignDocument } from './designDocument';

// ─── Brand Kit ──────────────────────────────────────────────────────────────

/** The studio's in-memory BrandKit uses a logo data URL; the cloud returns a presigned URL. */
export async function fetchBrandKit(api: ApiClient): Promise<BrandKit> {
  const { brandKit } = await api.getBrandKit();
  if (!brandKit) return { ...BRAND_KIT_DEFAULTS };
  return {
    companyName: brandKit.companyName,
    phone: brandKit.phone,
    website: brandKit.website,
    tagline: brandKit.tagline,
    primaryColor: brandKit.primaryColor || '#f97316',
    accentColor: brandKit.accentColor || '#ffffff',
    // The presigned URL is loadable by <img>/Fabric; we keep it in the same field.
    logoDataUrl: brandKit.logoUrl,
  };
}

/**
 * Persist a Brand Kit. If `logoDataUrl` is a data URL (newly chosen in the browser), upload it
 * and attach by rev. If it's a presigned https URL (unchanged existing logo) we keep it
 * (logoRev undefined). If null, we remove the logo.
 */
export async function saveBrandKitCloud(api: ApiClient, kit: BrandKit): Promise<BrandKit> {
  const input: BrandKitInput = {
    companyName: kit.companyName,
    phone: kit.phone,
    website: kit.website,
    tagline: kit.tagline,
    primaryColor: kit.primaryColor,
    accentColor: kit.accentColor,
  };
  if (kit.logoDataUrl === null) {
    input.logoRev = null;
  } else if (kit.logoDataUrl.startsWith('data:')) {
    const { contentType, blob } = dataUrlToBlob(kit.logoDataUrl);
    const { rev, uploadUrl } = await api.createBrandLogoUpload(contentType);
    await putToPresigned(uploadUrl, blob, contentType);
    input.logoRev = rev;
  } // else: existing https logo unchanged → leave logoRev undefined
  return fetchBrandKitFromResult(await api.putBrandKit(input));
}

/**
 * Account-safe Brand Kit sync, run on every authenticated load of Create.
 *
 *   • An unsynced local EDIT (recorded with the cloud version it was based on) is pushed only if
 *     the cloud is still at that version — the whole kit, deletions included. If the cloud moved on
 *     (edited on another device) the cloud wins and the stale local edit is discarded.
 *   • Otherwise the cloud copy is authoritative, field by field: a field that is empty in the
 *     cloud stays empty, so a detail the user deleted is never restored from an old local mirror.
 *   • If the account has NEVER saved a Brand Kit, the user's own (per-account) local copy is
 *     uploaded once, so nothing they entered before cloud sync existed is lost.
 * Everything is keyed by the user's id; nothing is ever read from another account's keys.
 */
export async function syncBrandKit(api: ApiClient, sub: string): Promise<BrandKit> {
  const pending = loadPendingBrandEdit(sub);
  const { brandKit: cloud } = await api.getBrandKit();
  const cloudAt = (cloud as { updatedAt?: string | null } | null)?.updatedAt ?? null;

  if (pending && (pending.base ?? null) === (cloud ? cloudAt : null)) {
    return saveBrandKitForUser(api, sub, pending.kit);
  }
  if (pending) clearPendingBrandEdit(sub); // the cloud changed since this edit: cloud wins

  if (cloud) {
    const kit = mapCloudKit(cloud);
    saveBrandKit(sub, kit);
    saveCloudBase(sub, cloudAt);
    return kit;
  }
  // Never saved to the account: migrate this account's own local copy once (if it has details).
  const local = loadBrandKit(sub);
  if (hasBrandDetails(local)) return saveBrandKitForUser(api, sub, local);
  return local;
}

/** Save the user's kit to the account; on success the local mirror + version are updated and
 *  the pending edit is cleared. On failure the pending edit stays for the next sync. */
export async function saveBrandKitForUser(api: ApiClient, sub: string, kit: BrandKit): Promise<BrandKit> {
  const { kit: saved, updatedAt } = await saveBrandKitCloudWithMeta(api, kit);
  saveBrandKit(sub, saved);
  saveCloudBase(sub, updatedAt);
  clearPendingBrandEdit(sub);
  return saved;
}

async function saveBrandKitCloudWithMeta(api: ApiClient, kit: BrandKit): Promise<{ kit: BrandKit; updatedAt: string | null }> {
  const input: BrandKitInput = {
    companyName: kit.companyName, phone: kit.phone, website: kit.website, tagline: kit.tagline,
    primaryColor: kit.primaryColor, accentColor: kit.accentColor,
  };
  if (kit.logoDataUrl === null) {
    input.logoRev = null;
  } else if (kit.logoDataUrl.startsWith('data:')) {
    const { contentType, blob } = dataUrlToBlob(kit.logoDataUrl);
    const { rev, uploadUrl } = await api.createBrandLogoUpload(contentType);
    await putToPresigned(uploadUrl, blob, contentType);
    input.logoRev = rev;
  }
  const res = await api.putBrandKit(input);
  return { kit: fetchBrandKitFromResult(res), updatedAt: (res.brandKit as { updatedAt?: string | null }).updatedAt ?? null };
}

function mapCloudKit(b: { companyName: string; phone: string; website: string; tagline: string; primaryColor: string; accentColor: string; logoUrl: string | null }): BrandKit {
  return fetchBrandKitFromResult({ brandKit: b });
}

function fetchBrandKitFromResult(res: { brandKit: { companyName: string; phone: string; website: string; tagline: string; primaryColor: string; accentColor: string; logoUrl: string | null } }): BrandKit {
  const b = res.brandKit;
  return {
    companyName: b.companyName, phone: b.phone, website: b.website, tagline: b.tagline,
    primaryColor: b.primaryColor || '#f97316', accentColor: b.accentColor || '#ffffff',
    logoDataUrl: b.logoUrl,
  };
}

// ─── Designs ──────────────────────────────────────────────────────────────

export async function listCloudDesigns(api: ApiClient): Promise<CloudDesignMeta[]> {
  return (await api.listDesigns()).designs;
}

/** Fetch a saved design's editable document (Fabric canvas JSON) from the cloud. */
export async function fetchDesignDocument(api: ApiClient, id: string): Promise<{ meta: CloudDesignMeta; canvasJson: unknown }> {
  const { design } = await api.getDesign(id);
  const res = await fetch(design.documentUrl);
  if (!res.ok) throw new Error('Could not load that design.');
  const canvasJson = await res.json();
  return { meta: design, canvasJson };
}

/**
 * Save a design: two-step commit.
 *   1. POST /designs/{id}/upload → presigned PUT URLs for the document + thumbnail.
 *   2. Browser PUTs the JSON + thumbnail directly to S3.
 *   3. PUT /designs/{id} commits metadata; the server verifies the upload before linking it.
 */
export async function saveDesignCloud(
  api: ApiClient,
  args: { id: string; name: string; templateId: string; width: number; height: number; canvasJson: unknown; thumbnailDataUrl?: string | null; createdAt?: number },
): Promise<CloudDesignMeta> {
  const { rev, documentUploadUrl, thumbnailUploadUrl } = await api.createDesignUpload(args.id);
  const docBlob = new Blob([JSON.stringify(args.canvasJson)], { type: 'application/json' });
  await putToPresigned(documentUploadUrl, docBlob, 'application/json');
  if (args.thumbnailDataUrl && args.thumbnailDataUrl.startsWith('data:')) {
    const { blob } = dataUrlToBlob(args.thumbnailDataUrl);
    try { await putToPresigned(thumbnailUploadUrl, blob, 'image/jpeg'); } catch { /* thumbnail is optional */ }
  }
  const { design } = await api.commitDesign(args.id, {
    rev, name: args.name, templateId: args.templateId, width: args.width, height: args.height, createdAt: args.createdAt,
  });
  return design;
}

export async function deleteDesignCloud(api: ApiClient, id: string): Promise<void> {
  await api.deleteDesign(id);
}

// ─── Migration (local → cloud; never deletes local) ──────────────────────────

function migrationKey(sub: string | undefined) { return `hawkeye_design_migrated_${sub || 'default'}`; }

export interface MigrationResult { migratedDesigns: number; migratedBrandKit: boolean; skipped: number; errors: number; }

/**
 * Migrate any browser-local designs + brand kit to the account, ONCE per user. Idempotent and
 * non-destructive: never deletes local data, never overwrites a cloud item that already exists.
 * Safe to call on every authenticated load — it no-ops after the first success.
 */
export async function migrateLocalToCloud(
  api: ApiClient,
  sub: string | undefined,
  localBrandKit: BrandKit,
): Promise<MigrationResult> {
  const result: MigrationResult = { migratedDesigns: 0, migratedBrandKit: false, skipped: 0, errors: 0 };
  if (typeof localStorage !== 'undefined' && localStorage.getItem(migrationKey(sub)) === 'done') return result;

  // Brand Kit: only migrate if the user has local brand data AND the cloud has none yet.
  try {
    const hasLocalBrand = !!(localBrandKit.companyName || localBrandKit.phone || localBrandKit.website || localBrandKit.tagline || localBrandKit.logoDataUrl);
    if (hasLocalBrand) {
      const { brandKit: cloud } = await api.getBrandKit();
      // Only when the account has NEVER saved a Brand Kit. A saved kit with empty fields means
      // the user cleared them; filling them back from an old local copy would undo a deletion.
      if (!cloud) {
        await saveBrandKitCloud(api, localBrandKit);
        result.migratedBrandKit = true;
      } else {
        result.skipped++;
      }
    }
  } catch { result.errors++; }

  // Designs: migrate any local design whose id is not already in the cloud.
  try {
    const local = listLocalDesigns(sub);
    if (local.length > 0) {
      const cloudIds = new Set((await api.listDesigns()).designs.map((d) => d.id));
      for (const d of local) {
        if (cloudIds.has(d.id)) { result.skipped++; continue; }
        try {
          await saveDesignCloud(api, {
            id: d.id, name: d.name, templateId: d.templateId, width: d.width, height: d.height,
            canvasJson: d.canvasJson, thumbnailDataUrl: d.thumbnail, createdAt: d.createdAt,
          });
          result.migratedDesigns++;
        } catch { result.errors++; }
      }
    }
  } catch { result.errors++; }

  // Mark done only if nothing errored, so a partial failure retries next load.
  if (result.errors === 0 && typeof localStorage !== 'undefined') {
    try { localStorage.setItem(migrationKey(sub), 'done'); } catch { /* ignore */ }
  }
  return result;
}

// For completeness / tests: expose the local list in the shape migration consumes.
export type { DesignDocument };

// ─── helpers ──────────────────────────────────────────────────────────────

export function dataUrlToBlob(dataUrl: string): { contentType: string; blob: Blob } {
  const [head, b64] = dataUrl.split(',');
  const contentType = /data:([^;]+)/.exec(head)?.[1] || 'application/octet-stream';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { contentType, blob: new Blob([bytes], { type: contentType }) };
}

async function putToPresigned(url: string, body: Blob, contentType: string): Promise<void> {
  const res = await fetch(url, { method: 'PUT', body, headers: { 'Content-Type': contentType } });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
}
