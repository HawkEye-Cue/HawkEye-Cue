/**
 * Photo frame: a photo that lives inside a fixed window (rectangle, rounded, arch or circle).
 * The frame geometry is stored on the photo object (`data.frame`), so when the customer replaces the
 * photo the Design Studio re-applies the SAME crop and mask instead of dropping the new image over
 * the whole canvas. Pure geometry + Fabric calls; no network, no AI.
 */
export type PhotoMask = 'rect' | 'rounded' | 'arch' | 'circle';
export interface PhotoFrame {
  left: number; top: number; w: number; h: number;
  mask: PhotoMask; radius?: number;
  /** focal point 0..1 (which part of the photo stays visible when it is cropped) */
  focus: [number, number];
}

/** Scale + offset that makes an iw x ih image cover a w x h window around a focal point. */
export function coverFit(iw: number, ih: number, w: number, h: number, focus: [number, number] = [0.5, 0.5]) {
  const s = Math.max(w / iw, h / ih);
  return { s, ox: -(iw * s - w) * focus[0], oy: -(ih * s - h) * focus[1] };
}

type FabricNs = typeof import('fabric');

/** Position `img` inside `frame` (cover-fit) and clip it to the frame's shape. Mutates `img`. */
export function placeInFrame(f: FabricNs, img: any, frame: PhotoFrame): void {
  const iw = img.width || 1, ih = img.height || 1;
  const { s, ox, oy } = coverFit(iw, ih, frame.w, frame.h, frame.focus);
  // The clip lives in the image's own pixel space, centred on the image: the visible window starts
  // at (-ox/s, -oy/s) image-px from the image's top-left and is w/s x h/s image-px big.
  const cw = frame.w / s, ch = frame.h / s;
  const x0 = -ox / s - iw / 2, y0 = -oy / s - ih / 2;
  const base: any = { originX: 'left', originY: 'top' };
  let clip: any;
  if (frame.mask === 'circle') {
    clip = new f.Ellipse({ ...base, left: x0, top: y0, rx: cw / 2, ry: ch / 2 } as any);
  } else if (frame.mask === 'arch') {
    const r = cw / 2;
    clip = new f.Path(`M 0 ${ch} L 0 ${r} A ${r} ${r} 0 0 1 ${cw} ${r} L ${cw} ${ch} Z`, { ...base, left: x0, top: y0 } as any);
  } else {
    const rr = frame.mask === 'rounded' ? (frame.radius ?? 28) / s : 0;
    clip = new f.Rect({ ...base, left: x0, top: y0, width: cw, height: ch, rx: rr, ry: rr } as any);
  }
  img.set({ left: frame.left + ox, top: frame.top + oy, scaleX: s, scaleY: s, clipPath: clip });
}
