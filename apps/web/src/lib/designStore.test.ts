// @vitest-environment jsdom
//
// Tests for local→cloud migration (item 2: preserve users' work; never delete/overwrite).

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { migrateLocalToCloud, saveDesignCloud, fetchBrandKit, dataUrlToBlob } from './designStore';
import { saveDesign, type DesignDocument } from './designDocument';
import { BRAND_KIT_DEFAULTS, type BrandKit } from './brandKit';

// A fake ApiClient capturing cloud state + calls.
function fakeApi() {
  const cloud = {
    brandKit: null as any,
    designs: new Map<string, any>(),
  };
  const calls: string[] = [];
  const uploadedTo: string[] = [];
  // Stub fetch (used for presigned PUTs + document GETs).
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: any) => {
    if (init?.method === 'PUT') { uploadedTo.push(String(url)); return { ok: true, status: 200 } as any; }
    return { ok: true, status: 200, json: async () => ({ objects: [] }) } as any;
  }));
  const api = {
    getBrandKit: async () => { calls.push('getBrandKit'); return { brandKit: cloud.brandKit }; },
    putBrandKit: async (input: any) => {
      calls.push('putBrandKit');
      cloud.brandKit = { companyName: input.companyName || '', phone: input.phone || '', website: input.website || '', tagline: input.tagline || '', primaryColor: input.primaryColor || '#f97316', accentColor: input.accentColor || '#ffffff', logoUrl: input.logoRev ? 'https://signed/logo' : null, updatedAt: 'now' };
      return { brandKit: cloud.brandKit };
    },
    createBrandLogoUpload: async () => ({ rev: 'logo-rev', uploadUrl: 'https://put/logo' }),
    listDesigns: async () => { calls.push('listDesigns'); return { designs: [...cloud.designs.values()] }; },
    getDesign: async (id: string) => ({ design: { ...cloud.designs.get(id), documentUrl: 'https://signed/doc' } }),
    createDesignUpload: async (id: string) => ({ rev: `rev-${id}`, documentUploadUrl: `https://put/${id}/doc`, thumbnailUploadUrl: `https://put/${id}/thumb` }),
    commitDesign: async (id: string, req: any) => {
      calls.push(`commitDesign:${id}`);
      const meta = { id, name: req.name, templateId: req.templateId, width: req.width, height: req.height, createdAt: req.createdAt || 1, updatedAt: 2, thumbnailUrl: null };
      cloud.designs.set(id, meta);
      return { design: meta };
    },
    deleteDesign: async (id: string) => { cloud.designs.delete(id); return { deleted: true }; },
  };
  return { api: api as any, cloud, calls, uploadedTo };
}

const SUB = 'u-migrate';
function localDesign(id: string, name = 'Local Design'): DesignDocument {
  const now = Date.now();
  return { id, name, templateId: 'roof-storm-1', width: 1080, height: 1080, canvasJson: { objects: [{ type: 'textbox', text: name, data: { isHeadline: true } }] }, createdAt: now, updatedAt: now };
}

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

describe('dataUrlToBlob', () => {
  it('decodes a data URL into a typed Blob', () => {
    const { contentType, blob } = dataUrlToBlob('data:image/png;base64,YWJj'); // "abc"
    expect(contentType).toBe('image/png');
    expect(blob.size).toBe(3);
  });
});

describe('migrateLocalToCloud — preserves work, never deletes, idempotent', () => {
  it('uploads local designs that are not yet in the cloud', async () => {
    saveDesign(SUB, localDesign('dsn_a'));
    saveDesign(SUB, localDesign('dsn_b'));
    const { api, cloud } = fakeApi();
    const r = await migrateLocalToCloud(api, SUB, { ...BRAND_KIT_DEFAULTS });
    expect(r.migratedDesigns).toBe(2);
    expect(cloud.designs.has('dsn_a')).toBe(true);
    expect(cloud.designs.has('dsn_b')).toBe(true);
  });

  it('NEVER deletes the local copies (fallback preserved)', async () => {
    saveDesign(SUB, localDesign('dsn_a'));
    const { api } = fakeApi();
    await migrateLocalToCloud(api, SUB, { ...BRAND_KIT_DEFAULTS });
    const stillLocal = JSON.parse(localStorage.getItem(`hawkeye_designs_${SUB}`) || '[]');
    expect(stillLocal).toHaveLength(1);
    expect(stillLocal[0].id).toBe('dsn_a');
  });

  it('does NOT overwrite a design already in the cloud (skips by id)', async () => {
    saveDesign(SUB, localDesign('dsn_a', 'LOCAL name'));
    const { api, cloud, calls } = fakeApi();
    cloud.designs.set('dsn_a', { id: 'dsn_a', name: 'CLOUD name', templateId: 'roof-storm-1', width: 1080, height: 1080, createdAt: 1, updatedAt: 9, thumbnailUrl: null });
    const r = await migrateLocalToCloud(api, SUB, { ...BRAND_KIT_DEFAULTS });
    expect(r.migratedDesigns).toBe(0);
    expect(r.skipped).toBeGreaterThanOrEqual(1);
    expect(cloud.designs.get('dsn_a').name).toBe('CLOUD name'); // untouched
    expect(calls).not.toContain('commitDesign:dsn_a');
  });

  it('is idempotent — a second run uploads nothing', async () => {
    saveDesign(SUB, localDesign('dsn_a'));
    const { api } = fakeApi();
    await migrateLocalToCloud(api, SUB, { ...BRAND_KIT_DEFAULTS });
    const second = await migrateLocalToCloud(api, SUB, { ...BRAND_KIT_DEFAULTS });
    expect(second.migratedDesigns).toBe(0);
  });

  it('migrates the brand kit only when the cloud has none', async () => {
    const localKit: BrandKit = { ...BRAND_KIT_DEFAULTS, companyName: 'Acme', phone: '(555) 1' };
    const { api, cloud } = fakeApi();
    const r = await migrateLocalToCloud(api, SUB, localKit);
    expect(r.migratedBrandKit).toBe(true);
    expect(cloud.brandKit.companyName).toBe('Acme');
  });

  it('does NOT overwrite an existing cloud brand kit', async () => {
    const { api, cloud } = fakeApi();
    cloud.brandKit = { companyName: 'CloudCo', phone: '', website: '', tagline: '', primaryColor: '#f97316', accentColor: '#fff', logoUrl: null, updatedAt: 'x' };
    const r = await migrateLocalToCloud(api, SUB, { ...BRAND_KIT_DEFAULTS, companyName: 'LocalCo' });
    expect(r.migratedBrandKit).toBe(false);
    expect(cloud.brandKit.companyName).toBe('CloudCo');
  });

  it('retries next load if an upload errored (marker not set)', async () => {
    saveDesign(SUB, localDesign('dsn_a'));
    const { api } = fakeApi();
    api.commitDesign = async () => { throw new Error('network'); };
    const r = await migrateLocalToCloud(api, SUB, { ...BRAND_KIT_DEFAULTS });
    expect(r.errors).toBeGreaterThanOrEqual(1);
    expect(localStorage.getItem(`hawkeye_design_migrated_${SUB}`)).toBeNull();
  });

  it('no local data → clean no-op', async () => {
    const { api } = fakeApi();
    const r = await migrateLocalToCloud(api, SUB, { ...BRAND_KIT_DEFAULTS });
    expect(r).toEqual({ migratedDesigns: 0, migratedBrandKit: false, skipped: 0, errors: 0 });
  });
});

describe('fetchBrandKit maps the cloud shape to the studio BrandKit', () => {
  it('returns defaults when the cloud has no brand kit', async () => {
    const { api } = fakeApi();
    const kit = await fetchBrandKit(api);
    expect(kit).toEqual(BRAND_KIT_DEFAULTS);
  });
  it('maps logoUrl into logoDataUrl (Fabric/img can load the presigned URL)', async () => {
    const { api, cloud } = fakeApi();
    cloud.brandKit = { companyName: 'Acme', phone: '', website: '', tagline: '', primaryColor: '#111111', accentColor: '#222222', logoUrl: 'https://signed/logo.png', updatedAt: 'x' };
    const kit = await fetchBrandKit(api);
    expect(kit.companyName).toBe('Acme');
    expect(kit.logoDataUrl).toBe('https://signed/logo.png');
  });
});

describe('saveDesignCloud two-step commit', () => {
  it('uploads the document then commits metadata', async () => {
    const { api, cloud, uploadedTo } = fakeApi();
    const meta = await saveDesignCloud(api, { id: 'dsn_x', name: 'X', templateId: 'roof-storm-1', width: 1080, height: 1080, canvasJson: { objects: [] } });
    expect(uploadedTo.some((u) => u.includes('/dsn_x/doc'))).toBe(true);
    expect(cloud.designs.has('dsn_x')).toBe(true);
    expect(meta.id).toBe('dsn_x');
  });
});
