/**
 * DEV-ONLY browser validation harness for the Design Studio.
 *
 * Mounts the REAL DesignStudio component (no auth, no Cognito, no network) so it can be
 * exercised end-to-end in a real browser by scripts/validate-studio.mjs. The AI photo edit is
 * MOCKED here (it tints the image) so the full Wingman → photo-edit → revision UI flow can be
 * tested WITHOUT spending real OpenAI credits. The real endpoint is covered by
 * content-image.test.ts.
 *
 * Query params:
 *   ?template=<id>   which template to open (default roof-storm-1)
 *   ?paid=0          simulate a free plan (AI photo editing gated)
 *   ?reopen=1        reopen the most recently saved design (Workflow D)
 */
import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import '../index.css';
import DesignStudio from '../components/DesignStudio';
import { TEMPLATES } from '../lib/designTemplates';
import { BRAND_KIT_DEFAULTS, type BrandKit } from '../lib/brandKit';
import { listDesigns, saveDesign } from '../lib/designDocument';

const params = new URLSearchParams(location.search);
const SUB = 'harness-user';
const template = TEMPLATES.find((t) => t.id === (params.get('template') || 'roof-storm-1')) || TEMPLATES[0];
const paid = params.get('paid') !== '0';
const reopen = params.get('reopen') === '1' ? listDesigns(SUB)[0] || null : null;

declare global {
  interface Window {
    __studio: {
      usedInPost: string | null;
      editCalls: { instruction: string; inputBytes: number }[];
      cloudSaves: { id: string; name: string }[];
      brandSaves: string[];
      closed: boolean;
    };
  }
}
window.__studio = { usedInPost: null, editCalls: [], cloudSaves: [], brandSaves: [], closed: false };

// Mock AI edit: tint the photo so the result is visibly different from the original.
async function mockEditPhoto(image: string, instruction: string): Promise<string> {
  window.__studio.editCalls.push({ instruction, inputBytes: image.length });
  await new Promise((r) => setTimeout(r, 300));
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const el = new Image(); el.onload = () => res(el); el.onerror = rej; el.src = image;
  });
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  ctx.fillStyle = 'rgba(0,120,255,0.45)';
  ctx.fillRect(0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}

function Harness() {
  const [open, setOpen] = useState(true);
  const [kit, setKit] = useState<BrandKit>({ ...BRAND_KIT_DEFAULTS, companyName: 'Acme Roofing', phone: '(555) 123-4567' });
  if (!open) return <div id="closed">studio closed</div>;
  return (
    <DesignStudio
      template={template}
      brandKit={kit}
      sub={SUB}
      initialDesign={reopen}
      canUseAiImage={paid}
      onEditPhoto={mockEditPhoto}
      // Mock cloud save: record the call so the validator can assert account-backed saving,
      // and mirror into the harness's local list so ?reopen=1 works without a backend.
      onCloudSave={async (args) => {
        window.__studio.cloudSaves.push({ id: args.id, name: args.name });
        // Mirror to local so ?reopen=1 (which reads the local list) can reopen it in the harness.
        saveDesign(SUB, { id: args.id, name: args.name, templateId: args.templateId, width: args.width, height: args.height, canvasJson: args.canvasJson, thumbnail: args.thumbnailDataUrl || undefined, createdAt: args.createdAt || Date.now(), updatedAt: Date.now() });
        return true;
      }}
      onUseInPost={(url) => { window.__studio.usedInPost = url; }}
      onBrandKitChange={async (k) => { window.__studio.brandSaves.push(k.companyName); setKit(k); }}
      onClose={() => { window.__studio.closed = true; setOpen(false); }}
    />
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><Harness /></React.StrictMode>,
);
