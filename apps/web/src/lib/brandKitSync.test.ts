// @vitest-environment jsdom
//
// Account-safe Brand Kit sync: never restore a deleted business detail, never mix accounts,
// never lose an unsynced edit, and let a newer change from another device win.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { syncBrandKit, saveBrandKitForUser, migrateLocalToCloud } from './designStore';
import {
  BRAND_KIT_DEFAULTS, type BrandKit, loadBrandKit, saveBrandKit, recordBrandKitEdit,
  loadPendingBrandEdit, loadCloudBase,
} from './brandKit';

const K = (over: Partial<BrandKit> = {}): BrandKit => ({ ...BRAND_KIT_DEFAULTS, ...over });

/** A fake account backend, one record per user, with a server-side version on every save. */
function fakeServer() {
  const records = new Map<string, any>();
  let version = 0;
  let failPuts = false;
  const puts: { sub: string; input: any }[] = [];
  const apiFor = (sub: string) => ({
    getBrandKit: async () => ({ brandKit: records.get(sub) ?? null }),
    putBrandKit: async (input: any) => {
      if (failPuts) throw new Error('offline');
      puts.push({ sub, input });
      const rec = { companyName: input.companyName || '', phone: input.phone || '', website: input.website || '', tagline: input.tagline || '',
        primaryColor: input.primaryColor || '#f97316', accentColor: input.accentColor || '#ffffff', logoUrl: null, updatedAt: `v${++version}` };
      records.set(sub, rec);
      return { brandKit: rec };
    },
    createBrandLogoUpload: async () => ({ rev: 'r', uploadUrl: 'https://put/logo' }),
    listDesigns: async () => ({ designs: [] }),
  }) as any;
  return {
    records, puts, apiFor,
    setOffline: (v: boolean) => { failPuts = v; },
    /** simulate an edit made on ANOTHER device */
    editElsewhere: (sub: string, patch: Partial<BrandKit>) => {
      const cur = records.get(sub) ?? { companyName: '', phone: '', website: '', tagline: '', primaryColor: '#f97316', accentColor: '#ffffff', logoUrl: null };
      records.set(sub, { ...cur, ...patch, updatedAt: `v${++version}` });
    },
  };
}

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200 }))); });

describe('Brand Kit sync — deletions are never undone', () => {
  it('a field cleared in the account is NOT restored from an old local copy', async () => {
    const srv = fakeServer();
    const api = srv.apiFor('A');
    await saveBrandKitForUser(api, 'A', K({ companyName: 'Acme', phone: '(512) 555-0100' }));
    // User clears the phone on another device; this browser still has the old mirror.
    srv.editElsewhere('A', { phone: '' });
    saveBrandKit('A', K({ companyName: 'Acme', phone: '(512) 555-0100' }));
    const kit = await syncBrandKit(api, 'A');
    expect(kit.phone).toBe('');
    expect(srv.records.get('A').phone).toBe('');
    expect(loadBrandKit('A').phone).toBe(''); // mirror corrected too
  });

  it('a deletion made HERE while offline is pushed as a deletion on the next load', async () => {
    const srv = fakeServer();
    const api = srv.apiFor('A');
    await saveBrandKitForUser(api, 'A', K({ companyName: 'Acme', phone: '(512) 555-0100' }));
    srv.setOffline(true);
    recordBrandKitEdit('A', K({ companyName: 'Acme', phone: '' })); // user deleted the phone
    await expect(saveBrandKitForUser(api, 'A', K({ companyName: 'Acme', phone: '' }))).rejects.toThrow();
    expect(loadPendingBrandEdit('A')?.kit.phone).toBe('');
    srv.setOffline(false);
    const kit = await syncBrandKit(api, 'A');
    expect(kit.phone).toBe('');
    expect(srv.records.get('A').phone).toBe('');
    expect(loadPendingBrandEdit('A')).toBeNull();
  });

  it('an unsynced edit is discarded when the account changed elsewhere since (newer wins)', async () => {
    const srv = fakeServer();
    const api = srv.apiFor('A');
    await saveBrandKitForUser(api, 'A', K({ companyName: 'Acme' }));
    srv.setOffline(true);
    recordBrandKitEdit('A', K({ companyName: 'Acme Old Edit' }));
    srv.setOffline(false);
    srv.editElsewhere('A', { companyName: 'Acme Roofing LLC' }); // newer, from the phone
    const kit = await syncBrandKit(api, 'A');
    expect(kit.companyName).toBe('Acme Roofing LLC');
    expect(srv.records.get('A').companyName).toBe('Acme Roofing LLC');
    expect(loadPendingBrandEdit('A')).toBeNull();
  });

  it('an unsynced edit with no conflicting change IS preserved and uploaded', async () => {
    const srv = fakeServer();
    const api = srv.apiFor('A');
    await saveBrandKitForUser(api, 'A', K({ companyName: 'Acme' }));
    recordBrandKitEdit('A', K({ companyName: 'Acme', phone: '(512) 555-0199' }));
    const kit = await syncBrandKit(api, 'A');
    expect(kit.phone).toBe('(512) 555-0199');
    expect(srv.records.get('A').phone).toBe('(512) 555-0199');
    expect(loadCloudBase('A')).toBe(srv.records.get('A').updatedAt);
  });

  it('a never-saved account uploads this user\'s own local details once (nothing lost)', async () => {
    const srv = fakeServer();
    saveBrandKit('A', K({ companyName: 'Acme', phone: '(512) 555-0100' }));
    const kit = await syncBrandKit(srv.apiFor('A'), 'A');
    expect(kit.companyName).toBe('Acme');
    expect(srv.records.get('A').companyName).toBe('Acme');
  });

  it('migration never fills a SAVED kit\'s empty fields from local (that would undo a deletion)', async () => {
    const srv = fakeServer();
    const api = srv.apiFor('A');
    await saveBrandKitForUser(api, 'A', K()); // user saved an intentionally empty kit
    const r = await migrateLocalToCloud(api, 'A', K({ companyName: 'Old Local Name' }));
    expect(r.migratedBrandKit).toBe(false);
    expect(srv.records.get('A').companyName).toBe('');
  });
});

describe('Brand Kit sync — account isolation', () => {
  it('account switching: B never sees or uploads A\'s details', async () => {
    const srv = fakeServer();
    await saveBrandKitForUser(srv.apiFor('A'), 'A', K({ companyName: 'Acme', phone: '(512) 555-0100' }));
    recordBrandKitEdit('A', K({ companyName: 'Acme Pending' }));
    const kitB = await syncBrandKit(srv.apiFor('B'), 'B');
    expect(kitB.companyName).toBe('');
    expect(kitB.phone).toBe('');
    expect(srv.records.has('B')).toBe(false);                    // nothing uploaded for B
    expect(srv.puts.filter((p) => p.sub === 'B')).toHaveLength(0);
    expect(loadPendingBrandEdit('A')?.kit.companyName).toBe('Acme Pending'); // A's edit untouched
  });

  it('logout → login as the same user restores their own kit; signed-out reads nothing', async () => {
    const srv = fakeServer();
    await saveBrandKitForUser(srv.apiFor('A'), 'A', K({ companyName: 'Acme' }));
    expect(loadBrandKit(undefined)).toEqual(BRAND_KIT_DEFAULTS);
    expect((await syncBrandKit(srv.apiFor('A'), 'A')).companyName).toBe('Acme');
  });

  it('no user id → nothing is stored (the old shared "default" key is never read or written)', () => {
    localStorage.setItem('hawkeye_brand_kit_default', JSON.stringify(K({ companyName: 'Someone Else Inc' })));
    saveBrandKit(undefined, K({ companyName: 'Leak' }));
    recordBrandKitEdit(undefined, K({ companyName: 'Leak' }));
    expect(loadBrandKit(undefined)).toEqual(BRAND_KIT_DEFAULTS);
    expect(loadBrandKit('B').companyName).toBe('');
    expect(Object.keys(localStorage).filter((k) => k.includes('Leak') || localStorage.getItem(k)?.includes('Leak'))).toHaveLength(0);
  });
});
