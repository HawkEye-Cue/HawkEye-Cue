// @vitest-environment jsdom
//
// Proves the Phase 1 serialization defect and its fix against the REAL Fabric.js library.
//
// Defect: the studio tagged layers with a custom `data` property and serialized with
// toJSON(). In Fabric 6, toJSON() takes no arguments and drops unknown properties, so after a
// single undo (restore from JSON) every role tag was gone.
//
// Fix: serialize with toObject(EXTRA_PROPS).

import { describe, it, expect, beforeAll } from 'vitest';
import { StaticCanvas, Textbox } from 'fabric';
import { EXTRA_PROPS } from './designDocument';

// jsdom has no real 2D context. Fabric only needs text-measurement + no-op drawing calls to
// build and serialize objects, so provide a minimal stub. Serialization does not depend on
// real pixels, so this does not weaken what the test proves.
beforeAll(() => {
  (HTMLCanvasElement.prototype as any).getContext = function (this: HTMLCanvasElement) {
    const el = this;
    return new Proxy({} as any, {
      get(target, prop) {
        if (prop === 'canvas') return el; // Fabric reads ctx.canvas (e.g. setAttribute)
        if (prop === 'measureText') return (t: string) => ({ width: String(t).length * 10, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 });
        if (prop === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
        if (prop === 'createLinearGradient' || prop === 'createRadialGradient' || prop === 'createPattern') return () => ({ addColorStop() {} });
        if (prop in target) return target[prop];
        return () => {}; // every other draw call is a no-op
      },
      set(target, prop, value) { target[prop] = value; return true; },
    });
  };
});

function makeCanvas() {
  const el = document.createElement('canvas');
  return new StaticCanvas(el, { width: 100, height: 100 });
}

function taggedHeadline() {
  const tb = new Textbox('FREE ROOF INSPECTIONS', { left: 10, top: 10, width: 80 });
  (tb as any).data = { id: 'headline', isHeadline: true };
  return tb;
}

describe('Fabric serialization of custom layer tags', () => {
  it('DEFECT: toJSON() drops the custom `data` tag (Phase 1 bug)', () => {
    const c = makeCanvas();
    c.add(taggedHeadline());
    const json = c.toJSON();
    expect(json.objects[0].data).toBeUndefined();
  });

  it('FIX: toObject(EXTRA_PROPS) preserves the `data` tag', () => {
    const c = makeCanvas();
    c.add(taggedHeadline());
    const obj = c.toObject([...EXTRA_PROPS]);
    expect(obj.objects[0].data).toEqual({ id: 'headline', isHeadline: true });
  });

  it('FIX: the tag survives a full save → loadFromJSON round-trip (undo / reopen)', async () => {
    const c1 = makeCanvas();
    c1.add(taggedHeadline());
    const saved = JSON.parse(JSON.stringify(c1.toObject([...EXTRA_PROPS])));

    const c2 = makeCanvas();
    await c2.loadFromJSON(saved);
    const restored = c2.getObjects()[0] as any;
    expect(restored.text).toBe('FREE ROOF INSPECTIONS');
    expect(restored.data).toEqual({ id: 'headline', isHeadline: true });
  });
});
