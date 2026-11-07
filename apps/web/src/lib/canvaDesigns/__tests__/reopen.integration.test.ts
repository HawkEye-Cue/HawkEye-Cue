// Feature: canva-style-design-integration — Task 4.1 integration test (Validates: Requirements 4, 5)
//
// Requirement 5: a composed Canva design opens in the UNMODIFIED Design Studio as individually
// editable layers tagged with the role/frame/mask metadata the Studio already understands, and a
// save → reopen round-trip preserves those layers, their crop/mask (data.frame) and role tags.
// Requirement 4: the complete caption is preserved verbatim in layer data (data.fullCaption).
//
// This test exercises the REAL product code paths WITHOUT modifying any of it:
//   - buildCanvaSpecs / buildInsuranceSpecs (index.ts)   → the three insurance specs
//   - buildObjects (builder.ts)                          → one Fabric object per layer, role/frame tags
//   - EXTRA_PROPS + a toDocument() shaped exactly like composeSpecToDocument (document.ts)
//   - DesignDocument contract (designDocument.ts)
//
// ── Environment choice (documented per the spec's testing guidance) ──────────────────────────────
// composeSpecToDocument() in document.ts constructs a real Fabric `StaticCanvas` and calls
// `toDataURL()`, which needs a working 2D canvas backend. The web app's default vitest environment
// is `node`, and node-canvas (`canvas`) is NOT installed here, so neither `node` nor `jsdom` can
// run real StaticCanvas rendering / PNG export in this repo. We therefore DO NOT depend on real
// Fabric rendering. Instead — exactly as the existing property tests (caption.property.test.ts)
// do — we drive the REAL `builder.ts` with a minimal Fabric stub that models only what the builder
// touches (plain geometry + `data` props, Textbox measuring, FabricImage.fromURL), and we rebuild
// the `toDocument` shape and the Studio's `canvas.toObject([...EXTRA_PROPS])` serialization using
// the SAME EXTRA_PROPS list the product uses. This keeps the test deterministic and
// environment-independent while still asserting the real data-tagging and a real EXTRA_PROPS
// round-trip. No product code (engine, document.ts, DesignStudio) is modified.

import { describe, it, expect } from 'vitest';
import { buildCanvaSpecs } from '../index';
import { buildObjects } from '../builder';
import { EXTRA_PROPS, newDesignId, type DesignDocument } from '../../designDocument';
import type { DesignSpec } from '../spec';
import type { BrandKit } from '../../brandKit';

const INSURANCE_TRADE = 'insurance-agent';
const CAPTION =
  'Is your home really covered? Most families are underinsured and do not find out until they file a claim. Call me for a free coverage review.';

// A fully populated Brand Kit so brand/phone layers (isBrandSlot / isPhoneSlot) are emitted and we
// can assert they round-trip. primaryColor is a real custom colour (not the default orange).
const KIT: BrandKit = {
  companyName: 'Rivera Family Insurance',
  phone: '(512) 555-0147',
  website: 'https://rivera.example',
  tagline: 'Coverage you can trust',
  primaryColor: '#1d4ed8',
  accentColor: '#ffffff',
  logoDataUrl: null,
};

// ── Minimal Fabric stub ──────────────────────────────────────────────────────────────────────────
// builder.ts constructs one object per layer and reads/writes plain props (text, width, height,
// top, left, fontSize, scaleX/Y, clipPath, data) plus initDimensions()/textLines for the measured
// text fitter and FabricImage.fromURL for photos. Each stub object exposes a Fabric-style
// `toObject(propertiesToInclude)` that serialises a plain snapshot INCLUDING the requested extra
// props (this mirrors real Fabric semantics, where canvas.toObject(extra) serialises each object
// with those extra properties — this is exactly how DesignStudio serialises via
// `fc.toObject([...EXTRA_PROPS])`).
function makeFabricStub() {
  const BASE_SERIALISE = ['type', 'left', 'top', 'width', 'height', 'scaleX', 'scaleY', 'fill', 'text'];
  class Obj {
    type = 'object';
    data: any; text?: string; width = 100; height = 40; top = 0; left = 0; scaleX = 1; scaleY = 1;
    fontSize = 0; textLines?: string[]; pathOffset = { x: 0, y: 0 }; clipPath?: any; fill?: any;
    constructor(opts: any = {}) { Object.assign(this, opts); }
    set(p: any) { Object.assign(this, p); if (p.text != null || p.fontSize != null) this.recompute(); return this; }
    setCoords() {}
    recompute() {
      const per = Math.max(1, Math.floor(this.width / Math.max(1, this.fontSize * 0.6)));
      const words = String(this.text ?? '').split(/\s+/).filter(Boolean);
      const lines: string[] = []; let cur = '';
      for (const w of words) { if (!cur) cur = w; else if ((cur + ' ' + w).length <= per) cur += ' ' + w; else { lines.push(cur); cur = w; } }
      this.textLines = cur ? [...lines, cur] : lines.length ? lines : [''];
      this.height = Math.max(1, this.textLines.length) * Math.max(1, this.fontSize) * 1.2;
    }
    initDimensions() { this.recompute(); }
    /** Mirror of Fabric's toObject(propertiesToInclude): base props + any requested extra props. */
    toObject(propertiesToInclude: string[] = []) {
      const out: Record<string, unknown> = {};
      for (const k of [...BASE_SERIALISE, ...propertiesToInclude]) {
        const v = (this as any)[k];
        if (v === undefined) continue;
        // Fabric serialises nested objects (e.g. clipPath) by calling their toObject too.
        out[k] = v && typeof v.toObject === 'function' ? v.toObject() : v;
      }
      return out;
    }
  }
  class Textbox extends Obj { type = 'textbox'; constructor(text: string, opts: any = {}) { super({ ...opts, text }); this.recompute(); } }
  class Rect extends Obj { type = 'rect'; }
  class Ellipse extends Obj { type = 'ellipse'; }
  class Path extends Obj { type = 'path'; constructor(_d: string, opts: any = {}) { super(opts); } }
  class Image extends Obj { type = 'image'; constructor(opts: any = {}) { super({ width: 1600, height: 1200, ...opts }); } }
  class Gradient { constructor(public o: any) {} toObject() { return { type: 'linear', ...this.o }; } }
  class Shadow { constructor(public s: any) {} toObject() { return { ...(typeof this.s === 'string' ? { raw: this.s } : this.s) }; } }
  return {
    Rect, Ellipse, Path, Textbox, Gradient, Shadow,
    FabricImage: { fromURL: async () => new Image() },
  } as any;
}

/** A StaticCanvas-equivalent whose toObject mirrors Fabric's `canvas.toObject([...EXTRA_PROPS])`. */
function makeStubCanvas(objects: any[]) {
  return {
    getObjects: () => objects,
    toObject(propertiesToInclude: string[] = []) {
      return { version: 'stub', objects: objects.map((o) => o.toObject(propertiesToInclude)) };
    },
  };
}

function buildSpecs(): DesignSpec[] {
  const specs = buildCanvaSpecs(INSURANCE_TRADE, CAPTION, 'Insurance Agent', KIT);
  expect(specs).not.toBeNull();
  expect(specs!.length).toBe(3); // photo, illustrated, editorial
  return specs!;
}

/** Replicate composeSpecToDocument()'s toDocument() shape exactly (document.ts), using the stub. */
async function composeToDocument(f: any, spec: DesignSpec, name: string): Promise<{ doc: DesignDocument; objects: any[] }> {
  const objects = await buildObjects(f, spec);
  const canvas = makeStubCanvas(objects);
  const canvasJson = canvas.toObject([...EXTRA_PROPS]); // === DesignStudio's serialisation
  const id = `canva_${spec.id}_${newDesignId()}`;
  const doc: DesignDocument = {
    id, name: name || spec.title, templateId: 'branded-1', width: 1080, height: 1080,
    canvasJson, thumbnail: 'data:image/png;base64,stub', createdAt: Date.now(), updatedAt: Date.now(),
  };
  return { doc, objects };
}

const dataOf = (json: any): any[] => (json.objects as any[]).map((o) => o.data).filter(Boolean);

describe('canva-style-design-integration · Task 4.1 — open in Studio + save/reopen round-trip (Req 4, 5)', () => {
  it('toDocument(name) returns a valid DesignDocument (id, 1080×1080, canvasJson, thumbnail)', async () => {
    const f = makeFabricStub();
    for (const spec of buildSpecs()) {
      const { doc } = await composeToDocument(f, spec, 'My Insurance Design');
      expect(doc.id).toMatch(/^canva_insurance-/);
      expect(doc.name).toBe('My Insurance Design');
      expect(doc.width).toBe(1080);
      expect(doc.height).toBe(1080);
      expect(doc.thumbnail).toBeTruthy();
      expect(doc.canvasJson).toBeTruthy();
      // canvasJson is a canvas serialisation with an objects array (what the Studio loadFromJSON reads).
      expect(Array.isArray((doc.canvasJson as any).objects)).toBe(true);
      expect((doc.canvasJson as any).objects.length).toBeGreaterThan(0);
    }
  });

  it('canvasJson carries role tags (isHeadline, isBrandSlot/isPhoneSlot) + data.fullCaption == caption', async () => {
    const f = makeFabricStub();
    for (const spec of buildSpecs()) {
      const { doc } = await composeToDocument(f, spec, spec.title);
      const datas = dataOf(doc.canvasJson);

      // Headline: exactly one, tagged, and carrying the ORIGINAL caption verbatim (Req 4.1/4.4, 5.3).
      const headlines = datas.filter((d) => d.isHeadline);
      expect(headlines.length).toBe(1);
      expect(headlines[0].fullCaption).toBe(CAPTION);
      expect(headlines[0].fullCaption).toBe(spec.caption);

      // Brand + phone slots present (the kit has both), tagged so the Studio can find them (Req 5.3).
      const brand = datas.filter((d) => d.isBrandSlot && !d.isPhoneSlot);
      const phone = datas.filter((d) => d.isPhoneSlot);
      expect(brand.length).toBeGreaterThanOrEqual(1);
      expect(phone.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('photo layers carry isPhoto + frame (mask/focus) tags, across rect and circle masks', async () => {
    const f = makeFabricStub();
    const specs = buildSpecs();
    const byStyle = Object.fromEntries(specs.map((s) => [s.style, s]));

    // Photo style: full-bleed photo, default rect mask.
    {
      const { doc } = await composeToDocument(f, byStyle.photo, 'photo');
      const photos = dataOf(doc.canvasJson).filter((d) => d.isPhoto);
      expect(photos.length).toBe(1);
      expect(photos[0].mask).toBe('rect');
      expect(photos[0].frame).toBeTruthy();
      expect(photos[0].frame.mask).toBe('rect');
      expect(Array.isArray(photos[0].frame.focus)).toBe(true);
    }
    // Editorial style: circle-masked photo in the lower right.
    {
      const { doc } = await composeToDocument(f, byStyle.editorial, 'editorial');
      const photos = dataOf(doc.canvasJson).filter((d) => d.isPhoto);
      expect(photos.length).toBe(1);
      expect(photos[0].mask).toBe('circle');
      expect(photos[0].frame.mask).toBe('circle');
    }
  });

  it('save → reopen round-trip preserves layers, crop/mask (data.frame) and role tags (Req 5.4)', async () => {
    const f = makeFabricStub();
    for (const spec of buildSpecs()) {
      const { doc } = await composeToDocument(f, spec, spec.title);

      // Save: the Studio persists canvasJson as-is; simulate a full serialise→store→reload cycle.
      const saved = JSON.stringify(doc.canvasJson);
      const reopened = JSON.parse(saved); // what loadFromJSON would receive on reopen

      const before = doc.canvasJson as any;
      const after = reopened as any;

      // Same number of layers survives the round-trip.
      expect(after.objects.length).toBe(before.objects.length);

      const beforeDatas = dataOf(before);
      const afterDatas = dataOf(after);

      // Every layer's `data` tag block is byte-for-byte identical after reopen (role tags + geometry).
      expect(afterDatas).toEqual(beforeDatas);

      // Role tags specifically survive.
      expect(afterDatas.filter((d) => d.isHeadline).length).toBe(1);
      expect(afterDatas.find((d) => d.isHeadline).fullCaption).toBe(CAPTION);
      expect(afterDatas.filter((d) => d.isBrandSlot && !d.isPhoneSlot).length).toBeGreaterThanOrEqual(1);
      expect(afterDatas.filter((d) => d.isPhoneSlot).length).toBeGreaterThanOrEqual(1);

      // Crop/mask (data.frame) survives for every photo layer, including the nested focus array.
      const photosBefore = beforeDatas.filter((d) => d.isPhoto);
      const photosAfter = afterDatas.filter((d) => d.isPhoto);
      expect(photosAfter.length).toBe(photosBefore.length);
      for (const p of photosAfter) {
        expect(p.frame).toBeTruthy();
        expect(['rect', 'rounded', 'arch', 'circle']).toContain(p.frame.mask);
        expect(Array.isArray(p.frame.focus)).toBe(true);
        expect(p.frame.focus.length).toBe(2);
      }
    }
  });
});
