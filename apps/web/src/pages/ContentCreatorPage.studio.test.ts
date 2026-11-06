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
  it('suggestions never change the post text (no caption setters in the suggestion render path)', () => {
    const start = src.indexOf('<ImageSuggestions');
    const block = src.slice(start, src.indexOf('/>', src.indexOf('canUseAiImage={canUseAiImage}', start)));
    // The suggestion strip must not overwrite the user's caption. onNoImage clears media only.
    expect(block).not.toMatch(/setOwnContent\(|setBaseText\(|setPlatformContent\(/);
  });
});

describe('Priority 1 — automatic, content-aware editable templates', () => {
  it('suggestions render automatically (no extra button): wired to caption + platformContent effects', () => {
    expect(src).toContain('recomputeSuggestions(text, currentTrade ?? null, brandKit)');
    expect(src).toMatch(/platformContent[\s\S]{0,400}recomputeSuggestions/);
  });
  it('ImageSuggestions receives the actual caption, trade, brand kit, and a composition signature', () => {
    expect(src).toContain('postText={suggestionText}');
    expect(src).toContain('tradeName={currentTrade?.name}');
    expect(src).toContain('brandKit={brandKit}');
    expect(src).toContain('signature={suggestionSignature}');
  });
  it('recompute is gated on a MEANINGFUL change via the composition signature (not every keystroke)', () => {
    expect(src).toContain('compositionSignature(');
    expect(src).toContain('lastSuggestionSig.current');
  });
  it('a No Image option exists and clears media WITHOUT touching the caption', () => {
    expect(src).toContain('onNoImage={');
    const block = src.slice(src.indexOf('onNoImage={'), src.indexOf('onDismiss', src.indexOf('onNoImage={')));
    expect(block).toMatch(/setImageFile\(null\)|setAiPhotoUrl\(null\)/);
    expect(block).not.toMatch(/setOwnContent|setBaseText/);
  });
});

describe('Priority 2 — draft preservation across Create', () => {
  it('captures the original writing before an AI draft so it can be restored', () => {
    expect(src).toContain('setRestorableDraft((prev) => (platformContent && prev)');
    // a stale capture from an earlier post must never survive into a fresh generation
    expect(src).toContain('setRestorableDraft(null); // this preview IS the user')
  });
  it('offers an explicit discard-AI-draft control that restores the original caption', () => {
    expect(src).toContain('data-testid="discard-ai-draft"');
    const block = src.slice(src.indexOf('data-testid="discard-ai-draft"'), src.indexOf('</button>', src.indexOf('data-testid="discard-ai-draft"')));
    expect(block).toMatch(/setOwnContent\(restorableDraft\.text\)|setBaseText\(restorableDraft\.text\)/);
  });
  it('autosaves the generated draft + restorable original across refresh/navigation', () => {
    expect(src).toContain("writeDraft('platformContent', user?.sub");
    expect(src).toContain("writeDraft('restorable', user?.sub");
    expect(src).toContain("readDraft('platformContent', user?.sub)");
  });
});

// Every paid AI image request in the app goes through ONE gate. These assertions fail if a new
// button or code path calls the paid endpoints without the confirmation first.
describe('paid AI image requests cannot bypass the confirmation', () => {
  const body = (name: string) => {
    const start = src.includes(`async function ${name}(`) ? src.indexOf(`async function ${name}(`) : src.indexOf(`function ${name}(`);
    expect(start, name).toBeGreaterThan(-1);
    const next = src.indexOf('\n  async function ', start + 10);
    const next2 = src.indexOf('\n  function ', start + 10);
    const end = Math.min(...[next, next2].filter((i) => i > 0));
    return src.slice(start, end);
  };

  it('the paid endpoints are called from exactly two functions on the page', () => {
    expect(src.match(/'\/content\/generate-image'/g)).toHaveLength(1);
    expect(src.match(/\.editImage\(/g)).toHaveLength(1);
    expect(body('generateAiPhoto')).toContain("'/content/generate-image'");
    expect(body('handleStudioEditPhoto')).toContain('.editImage(');
  });

  it('text-to-image: confirmation comes BEFORE the request; cancel returns without calling it', () => {
    const fn = body('generateAiPhoto');
    const gate = fn.indexOf("await confirmAiImage('generate')");
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(fn.indexOf("'/content/generate-image'"));
    expect(fn).toMatch(/if \(!\(await confirmAiImage\('generate'\)\)\) \{[^}]*return; \}/);
  });

  it('AI photo edit (studio): confirmation comes BEFORE the request; cancel throws before it', () => {
    const fn = body('handleStudioEditPhoto');
    const gate = fn.indexOf("await confirmAiImage('edit')");
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(fn.indexOf('.editImage('));
    expect(fn).toMatch(/if \(!\(await confirmAiImage\('edit'\)\)\) throw new Error/);
  });

  it('every AI image button funnels into generateAiPhoto (composer, suggestions strip, regenerate)', () => {
    expect(src).toContain('onCreateAiImage={handleCreateAiImageFromComposer}');
    expect(src).toContain('onGenerateAiImage={handleCreateAiImageFromComposer}');
    expect(body('handleCreateAiImageFromComposer')).toContain('generateAiPhoto(seed)');
    expect(src).toContain('{confirmDialog}');
  });
});
