// Feature: canva-style-design-integration, Task 4.2 — Photo replacement preserves frame/crop
// Validates: Requirements 6 (6.2 preserve shape/mask + re-fit to focal point; 6.3 rect/rounded/arch/circle).
//
// Approach (mirrors the Fabric stub strategy used by caption.property.test.ts):
//   placeInFrame (photoFrame.ts) and the builder's photo layer read/write only a handful of plain
//   Fabric props: width/height on the source image, scaleX/scaleY/left/top/clipPath on the image,
//   and the clip shape class (Ellipse | Path | Rect) + its geometry. So we model the minimum:
//     - a fabric namespace exposing Ellipse/Path/Rect constructors that just record their class + opts
//     - a fabric image stub ({ width, height, set(), captured left/top/scaleX/scaleY/clipPath })
//   This lets us drive placeInFrame deterministically with NO product-code changes and assert the
//   exact cover-fit + mask behaviour, including the re-fit that happens when a DIFFERENT aspect-ratio
//   image is dropped into the SAME PhotoFrame.
//
// Two things are asserted per mask shape (rect, rounded, arch, circle):
//   1. cover-fit: the scaled image fully covers the frame box, scale = max(w/iw, h/ih), and the
//      clipPath class matches the mask shape (rounded => Rect with rx>0).
//   2. replacement with the SAME frame but a different-aspect image preserves the frame's
//      left/top/w/h + mask, and re-derives the crop from the frame's focus (offsets recomputed,
//      not carried over / lost) so the new image still covers the frame around the focal point.

import { describe, it, expect } from 'vitest';
import { placeInFrame, coverFit, type PhotoFrame, type PhotoMask } from '../../photoFrame';
import { buildObjects } from '../builder';
import type { DesignSpec } from '../spec';

// ── Minimal Fabric stub ─────────────────────────────────────────────────────────────────────
// Clip shapes just record their constructor name + opts; the image records whatever placeInFrame
// sets on it. Nothing here does real rendering — it only captures geometry for assertions.
class StubEllipse {
  kind = 'Ellipse' as const;
  constructor(public o: any) {}
}
class StubPath {
  kind = 'Path' as const;
  constructor(public d: string, public o: any) {}
}
class StubRect {
  kind = 'Rect' as const;
  constructor(public o: any) {}
}

function makeFabricStub() {
  class Obj {
    data: any; width = 0; height = 0; top = 0; left = 0; scaleX = 1; scaleY = 1;
    opacity = 1; clipPath: any; pathOffset = { x: 0, y: 0 };
    constructor(opts: any = {}) { Object.assign(this, opts); }
    set(p: any) { Object.assign(this, p); return this; }
    setCoords() {}
    initDimensions() {}
  }
  const FabricImage = {
    // builder.ts calls FabricImage.fromURL; return a sized image so cover-fit has real geometry.
    fromURL: async () => Object.assign(new Obj(), { width: 1600, height: 1200 }),
  };
  return {
    Rect: StubRect,
    Ellipse: StubEllipse,
    Path: StubPath,
    Textbox: Obj,
    Gradient: class { constructor(public o: any) {} },
    Shadow: class { constructor(public s: any) {} },
    FabricImage,
  } as any;
}

// A standalone image stub for the direct placeInFrame assertions.
function makeImage(width: number, height: number) {
  return {
    width, height, left: 0, top: 0, scaleX: 1, scaleY: 1, clipPath: undefined as any,
    set(p: any) { Object.assign(this, p); return this; },
  };
}

const MASKS: PhotoMask[] = ['rect', 'rounded', 'arch', 'circle'];
const clipClassFor: Record<PhotoMask, string> = {
  rect: 'Rect', rounded: 'Rect', arch: 'Path', circle: 'Ellipse',
};

function frameFor(mask: PhotoMask, focus: [number, number]): PhotoFrame {
  return { left: 120, top: 200, w: 600, h: 400, mask, radius: 28, focus };
}

// Does the scaled image (iw*s x ih*s placed at img.left/img.top) fully cover the frame box?
function coversFrame(img: { left: number; top: number; scaleX: number; scaleY: number; width: number; height: number }, fr: PhotoFrame) {
  const imgLeft = img.left, imgTop = img.top;
  const imgRight = imgLeft + img.width * img.scaleX;
  const imgBottom = imgTop + img.height * img.scaleY;
  const EPS = 1e-6;
  return (
    imgLeft <= fr.left + EPS &&
    imgTop <= fr.top + EPS &&
    imgRight >= fr.left + fr.w - EPS &&
    imgBottom >= fr.top + fr.h - EPS
  );
}

describe('Photo replacement preserves frame/crop (Req 6)', () => {
  const f = makeFabricStub();

  for (const mask of MASKS) {
    it(`[${mask}] cover-fits the image and applies a clipPath consistent with the mask`, () => {
      const fr = frameFor(mask, [0.5, 0.5]);
      const img = makeImage(1600, 1200); // 4:3 landscape
      placeInFrame(f, img, fr);

      // cover-fit: scale is the max ratio so the image covers the frame box.
      const expectedS = Math.max(fr.w / 1600, fr.h / 1200);
      expect(img.scaleX).toBeCloseTo(expectedS, 6);
      expect(img.scaleY).toBeCloseTo(expectedS, 6);
      expect(coversFrame(img, fr)).toBe(true);

      // clipPath class matches the mask; rounded uses a Rect with rx > 0, plain rect rx === 0.
      expect(img.clipPath).toBeTruthy();
      expect(img.clipPath.kind).toBe(clipClassFor[mask]);
      if (mask === 'rounded') expect(img.clipPath.o.rx).toBeGreaterThan(0);
      if (mask === 'rect') expect(img.clipPath.o.rx ?? 0).toBe(0);
    });

    it(`[${mask}] replacing with a different-aspect image keeps frame left/top/w/h + mask and re-fits to focus`, () => {
      const focus: [number, number] = [0.25, 0.75];
      const fr = frameFor(mask, focus);
      const frameSnapshot = { ...fr };

      // Original image: landscape 4:3.
      const original = makeImage(1600, 1200);
      placeInFrame(f, original, fr);

      // Replacement image: SAME PhotoFrame object, but portrait 3:4 (different aspect ratio).
      const replacement = makeImage(900, 1600);
      placeInFrame(f, replacement, fr);

      // Frame geometry + mask are untouched by placing either image (shape/mask preserved).
      expect(fr.left).toBe(frameSnapshot.left);
      expect(fr.top).toBe(frameSnapshot.top);
      expect(fr.w).toBe(frameSnapshot.w);
      expect(fr.h).toBe(frameSnapshot.h);
      expect(fr.mask).toBe(frameSnapshot.mask);
      expect(replacement.clipPath.kind).toBe(clipClassFor[mask]);

      // The replacement still covers the frame (re-fit happened for the new aspect ratio).
      expect(coversFrame(replacement, fr)).toBe(true);

      // Crop is RE-COMPUTED from the frame's focus for the new image dimensions, not reused from the
      // old image. Compare against coverFit for the replacement's own size + the frame focus.
      const expected = coverFit(900, 1600, fr.w, fr.h, focus);
      expect(replacement.scaleX).toBeCloseTo(expected.s, 6);
      expect(replacement.left).toBeCloseTo(fr.left + expected.ox, 6);
      expect(replacement.top).toBeCloseTo(fr.top + expected.oy, 6);

      // Sanity: because the aspect ratios differ, the two images were fit differently (offsets changed),
      // proving the crop was re-derived rather than carried over.
      const origFit = coverFit(1600, 1200, fr.w, fr.h, focus);
      expect(replacement.scaleX).not.toBeCloseTo(origFit.s, 3);
    });
  }

  it('builder tags the photo layer with data.frame { left, top, w, h, mask, radius, focus } for each mask', async () => {
    for (const mask of MASKS) {
      const spec: DesignSpec = {
        id: `photo-${mask}`, title: 't', style: 'photo', trade: 'insurance-agent',
        width: 1080, height: 1080, background: '#ffffff', caption: 'Protect what matters most.',
        layers: [
          {
            kind: 'photo', id: 'ph', group: 'photo', src: 'x.jpg',
            left: 120, top: 200, width: 600, height: 400,
            mask, radius: 28, focus: [0.25, 0.75],
          },
        ],
      };
      const objs = await buildObjects(f, spec);
      const photo = objs.find((o: any) => o.data?.isPhoto);
      expect(photo).toBeTruthy();
      expect(photo.data.mask).toBe(mask);
      const frame = photo.data.frame as PhotoFrame;
      expect(frame).toMatchObject({ left: 120, top: 200, w: 600, h: 400, mask, radius: 28, focus: [0.25, 0.75] });
      // The image was cover-fit into the frame (clipPath applied, consistent shape).
      expect(photo.clipPath).toBeTruthy();
      expect(photo.clipPath.kind).toBe(clipClassFor[mask]);
    }
  });
});
