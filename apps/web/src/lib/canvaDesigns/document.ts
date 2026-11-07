/**
 * Compose a DesignSpec into (a) a full-resolution preview data URL and (b) a Design Studio document
 * (Fabric canvas JSON serialized with EXTRA_PROPS) that the UNMODIFIED DesignStudio can open, edit,
 * save and reopen. Pure client-side: no network, no AI, no image credits.
 */
import type { BrandKit } from '../brandKit';
import { EXTRA_PROPS, newDesignId, type DesignDocument } from '../designDocument';
import { loadCanvaFonts } from './fonts';
import { buildObjects } from './builder';
import type { DesignSpec } from './spec';

export interface ComposedDesign {
  /** stable id for this spec (so previews cache and the Studio can save it) */
  id: string;
  spec: DesignSpec;
  previewUrl: string;
  /** the editable Studio document (reopen with the same crop/mask/role tags) */
  toDocument: (name: string) => DesignDocument;
  /** true when the picture shows a shortened version of the caption (full caption kept) */
  imageShowsSummary: boolean;
}

/**
 * Render one spec on an off-screen StaticCanvas (full 1080) → PNG preview + a function that returns
 * a DesignStudio document on demand. We serialize with EXTRA_PROPS so role/frame tags round-trip.
 */
export async function composeSpecToDocument(spec: DesignSpec, _kit: BrandKit): Promise<ComposedDesign> {
  await loadCanvaFonts();
  const fabric = await import('fabric');
  const el = document.createElement('canvas');
  const fc: any = new fabric.StaticCanvas(el, { width: 1080, height: 1080, backgroundColor: spec.background, renderOnAddRemove: false });
  try {
    for (const o of await buildObjects(fabric, spec)) fc.add(o);
    fc.renderAll();
    const previewUrl = fc.toDataURL({ format: 'png', multiplier: 1 });
    const canvasJson = fc.toObject([...EXTRA_PROPS]);
    const summary = fc.getObjects().some((o: any) => o.data?.isHeadline && o.data?.imageShowsSummary);
    const id = `canva_${spec.id}_${newDesignId()}`;
    return {
      id,
      spec,
      previewUrl,
      imageShowsSummary: summary,
      toDocument: (name: string): DesignDocument => ({
        id, name: name || spec.title, templateId: 'branded-1', width: 1080, height: 1080,
        canvasJson, thumbnail: previewUrl, createdAt: Date.now(), updatedAt: Date.now(),
      }),
    };
  } finally {
    try { fc.dispose(); } catch { /* ignore */ }
  }
}
