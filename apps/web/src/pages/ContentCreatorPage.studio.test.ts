// Regression tests for the Create page ↔ Design Studio wiring and the AI-image access fix.
// The full page needs live auth, so (like ContentCreatorPage.flocks.test.ts) wiring is
// asserted on the source, and the access rule is tested directly.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { canUseAiImageForTier } from '../lib/aiImageAccess';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, './ContentCreatorPage.tsx'), 'utf8');

describe('AI image access follows the SUBSCRIPTION, not the Guided/Pro UI mode', () => {
  it('paid tiers (incl. summit alias + legacy labels) can use AI images', () => {
    for (const t of ['soar', 'team', 'summit', 'pro', 'base', 'growth']) expect(canUseAiImageForTier(t)).toBe(true);
  });
  it('free / nest / unknown cannot', () => {
    for (const t of ['free', 'nest', 'expired', '', undefined, null, 'mystery']) expect(canUseAiImageForTier(t)).toBe(false);
  });
  it('the page derives canUseAiImage from userTier, and no AI-image gate uses isPro', () => {
    expect(src).toContain('const canUseAiImage = canUseAiImageForTier(userTier)');
    expect(src).not.toMatch(/canUseAiImage=\{isPro\}/);
  });
});

describe('Design Studio → post attachment', () => {
  it('Use in Post routes the exported PNG into aiPhotoUrl (→ readyImageSrc → scheduling/Flocks)', () => {
    expect(src).toMatch(/function handleStudioUseInPost\(dataUrl: string\)\s*\{[\s\S]*?setAiPhotoUrl\(dataUrl\)/);
    expect(src).toContain('const readyImageSrc = aiPhotoUrl || imagePreview || null');
    expect(src).toContain('onUseInPost={handleStudioUseInPost}');
  });
  it('Flocks still receives the ready image (unchanged handoff)', () => {
    expect(src).toContain('readyImageSrc={readyImageSrc}');
  });
  it('AI photo edits go through the server endpoint (entitlement enforced server-side)', () => {
    expect(src).toContain('client.editImage({ image, instruction })');
    expect(src).toContain('onEditPhoto={handleStudioEditPhoto}');
  });
  it('Upload & Edit My Photo opens the studio with the photo (Workflow C)', () => {
    expect(src).toContain('onUploadPhoto={openStudioWithPhoto}');
    expect(src).toContain('initialPhoto={studioPhoto}');
  });
  it('saved designs can be reopened (Workflow D)', () => {
    expect(src).toContain('onClick={() => reopenDesign(d)}');
    expect(src).toContain('initialDesign={studioDesign}');
  });
  it('suggestions never change the post text (no setter for ownContent/baseText in the suggestion path)', () => {
    const block = src.slice(src.indexOf('<ImageSuggestions'), src.indexOf('/>', src.indexOf('<ImageSuggestions')));
    expect(block).not.toMatch(/setOwnContent|setBaseText|setPlatformContent/);
  });
});
