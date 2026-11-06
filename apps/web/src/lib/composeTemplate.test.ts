import { describe, it, expect } from 'vitest';
import { composeTemplate, deriveCopy, deriveCta, toHeadline, cleanCaption, compositionSignature } from './composeTemplate';
import { TEMPLATES, suggestTemplates } from './designTemplates';
import { BRAND_KIT_DEFAULTS, type BrandKit } from './brandKit';

const kit = (over: Partial<BrandKit> = {}): BrandKit => ({ ...BRAND_KIT_DEFAULTS, ...over });
const storm = TEMPLATES.find((t) => t.id === 'roof-storm-1')!;

describe('cleanCaption', () => {
  it('strips hashtags, mentions, urls, emoji', () => {
    const out = cleanCaption('Big storm! 🌧️ Call us #roofing @me https://x.com/y');
    expect(out).not.toMatch(/#|@|https?:|🌧/);
    expect(out.toLowerCase()).toContain('storm');
  });
});

describe('toHeadline', () => {
  it('title-cases and caps length at a word boundary', () => {
    const h = toHeadline('we fix roofs fast and affordably for everyone in town', 24);
    expect(h.length).toBeLessThanOrEqual(24);
    expect(h).toMatch(/^We /);
  });
  it('keeps acronyms', () => {
    expect(toHeadline('HVAC tune up special')).toContain('HVAC');
  });
});

describe('deriveCta', () => {
  it('maps intent to a short CTA', () => {
    expect(deriveCta('Get a free inspection today')).toMatch(/free/i);
    expect(deriveCta('Call us now')).toMatch(/call/i);
    expect(deriveCta('Just listed a beautiful home')).toMatch(/showing/i);
    expect(deriveCta('here is an update about our team')).toBe('Learn More');
  });
});

describe('deriveCopy', () => {
  it('pulls headline + subtext from the caption; CTA from intent', () => {
    const c = deriveCopy({ postText: 'Storm damage season is here. Book a free roof inspection before it gets worse.', fallbackHeadline: 'X', fallbackSubtext: 'Y' });
    expect(c.headline.toLowerCase()).toContain('storm');
    expect(c.subtext.toLowerCase()).toContain('inspection');
    expect(c.cta).toMatch(/free/i);
  });
  it('falls back to template copy when the caption is empty', () => {
    const c = deriveCopy({ postText: '   ', fallbackHeadline: 'FALLBACK H', fallbackSubtext: 'FALLBACK S' });
    expect(c.headline).toBe('FALLBACK H');
    expect(c.subtext).toBe('FALLBACK S');
  });
});

describe('composeTemplate', () => {
  it('rewrites the headline + subtext from the post, keeps role tags editable', () => {
    const out = composeTemplate({ template: storm, postText: 'Hail damage is everywhere. Get your free inspection now.', brandKit: kit() });
    const headline = out.layers.find((l) => l.isHeadline)!;
    expect(headline.text!.toLowerCase()).toContain('hail');
    // role tags preserved (still editable / brand/wingman still work)
    expect(headline.isHeadline).toBe(true);
    expect(headline.isEditable).toBe(true);
  });

  it('fills brand slots ONLY when the kit has the value (never invents)', () => {
    const withBrand = composeTemplate({ template: storm, postText: 'Free inspection', brandKit: kit({ companyName: 'Acme Roofing', phone: '(555) 111-2222' }) });
    expect(withBrand.layers.find((l) => l.isPhoneSlot)!.text).toBe('(555) 111-2222');
    expect(withBrand.layers.find((l) => l.isBrandSlot && !l.isPhoneSlot)!.text).toBe('Acme Roofing');

    const noBrand = composeTemplate({ template: storm, postText: 'Free inspection', brandKit: kit() });
    // keeps the template's own placeholder, does not blank or invent
    expect(noBrand.layers.find((l) => l.isPhoneSlot)!.text).toBe(storm.layers.find((l) => l.isPhoneSlot)!.text);
  });

  it('applies the brand primary color to accent rects', () => {
    const out = composeTemplate({ template: storm, postText: 'Free inspection', brandKit: kit({ primaryColor: '#123456' }) });
    const accent = out.layers.find((l) => l.id === 'accent' && l.type === 'rect');
    expect(accent?.backgroundColor).toBe('#123456');
  });

  it('does not mutate the input template', () => {
    const before = JSON.stringify(storm);
    composeTemplate({ template: storm, postText: 'Changed headline text here', brandKit: kit({ companyName: 'X' }) });
    expect(JSON.stringify(storm)).toBe(before);
  });
});

describe('compositionSignature', () => {
  it('is stable across trivial edits but changes on meaningful ones', () => {
    const base = compositionSignature({ postText: 'Free roof inspection this week', tradeId: 'roofing', brandKit: kit() });
    const trivial = compositionSignature({ postText: 'Free roof inspection this week ', tradeId: 'roofing', brandKit: kit() }); // trailing space
    const meaningful = compositionSignature({ postText: 'Completely different message about plumbing leaks today', tradeId: 'roofing', brandKit: kit() });
    expect(trivial).toBe(base);
    expect(meaningful).not.toBe(base);
  });
  it('changes when the brand identity changes', () => {
    const a = compositionSignature({ postText: 'Free roof inspection', tradeId: 'roofing', brandKit: kit() });
    const b = compositionSignature({ postText: 'Free roof inspection', tradeId: 'roofing', brandKit: kit({ companyName: 'Acme' }) });
    expect(a).not.toBe(b);
  });
});

describe('suggestTemplates — distinct layout families', () => {
  it('returns 3 templates from DIFFERENT layout families (genuinely different)', () => {
    const picks = suggestTemplates({ postText: 'Free roof inspection after the storm', tradeId: 'roofing', tradeKeywords: ['roof', 'storm'], max: 3 });
    expect(picks.length).toBe(3);
    const families = picks.map((p) => p.template.layoutFamily || p.template.category);
    expect(new Set(families).size).toBe(3); // all different
  });
  it('always returns 3 even for an unmatched post (universal archetypes backfill)', () => {
    const picks = suggestTemplates({ postText: 'xyzzy nothing matches here', tradeId: 'unknown-trade', tradeKeywords: [], max: 3 });
    expect(picks.length).toBe(3);
    expect(new Set(picks.map((p) => p.template.id)).size).toBe(3);
  });
});
