// Feature: canva-style-design-integration, Task (necessity proof) — DesignStudio framed-photo replacement branch
// Validates: Requirements 6 (6.2 replacing a framed photo preserves the frame's shape/mask/crop,
// re-fits the new photo to the focal point, and keeps the same z-order).
//
// WHY THIS TEST EXISTS (necessity proof for the setPhoto() framed branch):
//   DesignStudio.setPhoto() has a branch (~L287) that runs when the object being replaced carries
//   `data.frame`. Without that branch the replacement photo takes the ORIGINAL path and is
//   cover-fit to the whole canvas (or a placeholder slot), destroying the Canva-style design's
//   shaped window. The branch instead: (a) calls placeInFrame(fabricNs, img, frame) so the new
//   photo re-fits the SAME frame/mask/focal point, (b) copies the old object's `data`
//   (id / isPhoto / frame) onto the new image, and (c) removes the old framed object and re-inserts
//   the new one at the SAME z-index. This test proves that contract is necessary and correct, and
//   guards the non-framed path so it is unaffected.
//
// LIMITATION (documented, by design — no product-code refactor):
//   setPhoto() is a closure over fabricRef/canvas/template inside the DesignStudio component, so it
//   cannot be imported and invoked in isolation without rendering the whole editor against a real
//   Fabric canvas. Rather than refactor product code, this test reconstructs the EXACT decision and
//   mutations the branch performs, using the same Fabric-stub strategy as photoReplacement.test.ts,
//   and drives the REAL placeInFrame (lib/photoFrame.ts) — the same function the branch calls. The
//   `replaceFramedPhoto` helper below is a faithful, line-for-line model of the branch body; if the
//   product branch changes shape, this model (and its assertions) must change with it.

import { describe, it, expect } from 'vitest';
import { placeInFrame, coverFit, type PhotoFrame, type PhotoMask } from '../../lib/photoFrame';

// ── Minimal Fabric stub (mirrors photoReplacement.test.ts) ──────────────────────────────────────
// Clip shapes record only their class + opts; images record whatever placeInFrame sets on them.
class StubEllipse { kind = 'Ellipse' as const; constructor(public o: any) {} }
class StubPath { kind = 'Path' as const; constructor(public d: string, public o: any) {} }
class StubRect { kind = 'Rect' as const; constructor(public o: any) {} }

function makeFabricNs() {
  return { Rect: StubRect, Ellipse: StubEllipse, Path: StubPath } as any;
}

interface StubImg {
  width: number; height: number;
  left: number; top: number; scaleX: number; scaleY: number;
  clipPath: any; data: any;
  set(p: any): StubImg;
}
function makeImage(width: number, height: number): StubImg {
  return {
    width, height, left: 0, top: 0, scaleX: 1, scaleY: 1, clipPath: undefined, data: undefined,
    set(p: any) { Object.assign(this, p); return this; },
  };
}

// A minimal object array that behaves like Fabric's canvas object list for the branch's z-order ops.
function makeCanvas(initial: any[]) {
  const list = [...initial];
  return {
    objects: list,
    getObjects: () => list,
    remove(o: any) { const i = list.indexOf(o); if (i >= 0) list.splice(i, 1); },
    insertAt(idx: number, o: any) { list.splice(idx, 0, o); },
  };
}

// ── Faithful model of the setPhoto() framed-replacement branch body (DesignStudio.tsx ~L287) ─────
//   const framed = objs().find((o) => o.data?.frame);
//   if (framed) {
//     placeInFrame(fabricNs, img, framed.data.frame as PhotoFrame);
//     img.set({ data: { ...framed.data, id: framed.data.id, isPhoto: true } });
//     const at = fc.getObjects().indexOf(framed);
//     fc.remove(framed);
//     fc.insertAt(Math.max(0, at), img);
//     return true;  // took the framed path
//   }
//   return false;   // fell through to the original (non-framed) path
function replaceFramedPhoto(fabricNs: any, canvas: ReturnType<typeof makeCanvas>, img: StubImg): boolean {
  const framed = canvas.getObjects().find((o: any) => o.data?.frame);
  if (framed) {
    placeInFrame(fabricNs, img, framed.data.frame as PhotoFrame);
    img.set({ data: { ...framed.data, id: framed.data.id, isPhoto: true } });
    const at = canvas.getObjects().indexOf(framed);
    canvas.remove(framed);
    canvas.insertAt(Math.max(0, at), img);
    return true;
  }
  return false;
}

const MASKS: PhotoMask[] = ['rect', 'rounded', 'arch', 'circle'];
const clipClassFor: Record<PhotoMask, string> = {
  rect: 'Rect', rounded: 'Rect', arch: 'Path', circle: 'Ellipse',
};

function frameFor(mask: PhotoMask, focus: [number, number]): PhotoFrame {
  return { left: 120, top: 200, w: 600, h: 400, mask, radius: 28, focus };
}

function coversFrame(img: StubImg, fr: PhotoFrame) {
  const EPS = 1e-6;
  return (
    img.left <= fr.left + EPS &&
    img.top <= fr.top + EPS &&
    img.left + img.width * img.scaleX >= fr.left + fr.w - EPS &&
    img.top + img.height * img.scaleY >= fr.top + fr.h - EPS
  );
}

describe('DesignStudio setPhoto() — framed-photo replacement branch (Req 6)', () => {
  const fabricNs = makeFabricNs();

  for (const mask of MASKS) {
    it(`[${mask}] (a) framed branch: re-fits replacement to the frame's mask + focal point and preserves data`, () => {
      const focus: [number, number] = [0.25, 0.75];
      const fr = frameFor(mask, focus);

      // Old framed photo sits above a background rect; the design's shaped window.
      const oldFramed = makeImage(1600, 1200) as any;
      oldFramed.data = { id: 'photo-main', isPhoto: true, frame: fr, role: 'photo' };
      const bg = { data: { id: 'bg' } };
      const headline = { data: { id: 'headline', isHeadline: true } };
      // z-order: bg (0), oldFramed (1), headline (2)
      const canvas = makeCanvas([bg, oldFramed, headline]);

      // Replacement is a DIFFERENT aspect ratio (portrait 3:4) to prove re-fit, not reuse.
      const replacement = makeImage(900, 1600);
      const tookFramedPath = replaceFramedPhoto(fabricNs, canvas, replacement);

      // The branch must have been taken because the object carries data.frame.
      expect(tookFramedPath).toBe(true);

      // (a.1) placeInFrame was applied: clipPath matches the mask and the new photo covers the frame.
      expect(replacement.clipPath).toBeTruthy();
      expect(replacement.clipPath.kind).toBe(clipClassFor[mask]);
      if (mask === 'rounded') expect(replacement.clipPath.o.rx).toBeGreaterThan(0);
      if (mask === 'rect') expect(replacement.clipPath.o.rx ?? 0).toBe(0);
      expect(coversFrame(replacement, fr)).toBe(true);

      // (a.2) The crop is re-derived from the frame's focus for the NEW image size (not carried over).
      const expected = coverFit(900, 1600, fr.w, fr.h, focus);
      expect(replacement.scaleX).toBeCloseTo(expected.s, 6);
      expect(replacement.left).toBeCloseTo(fr.left + expected.ox, 6);
      expect(replacement.top).toBeCloseTo(fr.top + expected.oy, 6);
      // Different aspect ratios => different fit than the old image had (proves re-fit happened).
      const oldFit = coverFit(1600, 1200, fr.w, fr.h, focus);
      expect(replacement.scaleX).not.toBeCloseTo(oldFit.s, 3);

      // (a.3) data is copied forward: id + frame preserved, isPhoto set, extra tags carried.
      expect(replacement.data.id).toBe('photo-main');
      expect(replacement.data.isPhoto).toBe(true);
      expect(replacement.data.frame).toBe(fr);
      expect(replacement.data.role).toBe('photo');

      // (a.4) same z-index: new photo replaces the old at index 1, bg stays below, headline above.
      const objs = canvas.getObjects();
      expect(objs.indexOf(replacement)).toBe(1);
      expect(objs.indexOf(bg)).toBe(0);
      expect(objs.indexOf(headline)).toBe(2);
      expect(objs).not.toContain(oldFramed);
      expect(objs).toHaveLength(3);
    });
  }

  it('(b) regression guard: a non-framed photo does NOT take the framed branch (original path unaffected)', () => {
    // No object carries data.frame — the branch must fall through so the original cover/placeholder
    // logic (not modelled here) runs instead.
    const bg = { data: { id: 'bg' } };
    const plainPhoto = makeImage(1600, 1200) as any;
    plainPhoto.data = { id: 'photo-main', isPhoto: true }; // note: NO frame
    const canvas = makeCanvas([bg, plainPhoto]);

    const replacement = makeImage(900, 1600);
    const tookFramedPath = replaceFramedPhoto(fabricNs, canvas, replacement);

    // Branch not taken → placeInFrame never ran on the replacement, nothing was mutated/inserted.
    expect(tookFramedPath).toBe(false);
    expect(replacement.clipPath).toBeUndefined();
    expect(replacement.data).toBeUndefined();
    expect(canvas.getObjects()).toEqual([bg, plainPhoto]); // unchanged
  });

  it('(b.2) necessity: WITHOUT the framed branch a replacement would cover the whole canvas, breaking the window', () => {
    // This demonstrates why the branch is required. If setPhoto fell through to the original path,
    // the replacement would be cover-fit to the full 1080x1080 canvas instead of the 600x400 frame.
    const fr = frameFor('rounded', [0.5, 0.5]);
    const CANVAS = 1080;

    // Original path (no frame): cover-fit to the whole canvas.
    const wholeCanvasFit = coverFit(900, 1600, CANVAS, CANVAS, [0.5, 0.5]);
    // Framed path: cover-fit to the small shaped window.
    const framedFit = coverFit(900, 1600, fr.w, fr.h, [0.5, 0.5]);

    // The two scales differ substantially — proving the branch changes behaviour (not a no-op).
    expect(framedFit.s).not.toBeCloseTo(wholeCanvasFit.s, 2);
    // And the framed scale fits the small window while the canvas scale is far larger.
    expect(framedFit.s).toBeLessThan(wholeCanvasFit.s);
  });
});
