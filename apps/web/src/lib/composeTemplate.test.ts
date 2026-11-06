import { describe, it, expect } from 'vitest';
import { composeTemplate, deriveCopy, deriveCta, toHeadline, cleanCaption, compositionSignature, verticalRoom, LINE_H } from './composeTemplate';
import { TEMPLATES, suggestTemplates, keywordHits } from './designTemplates';
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

  it('applies a CUSTOM, readable brand color to the design accent (shapes and accent text)', () => {
    const out = composeTemplate({ template: storm, postText: 'Free inspection', brandKit: kit({ primaryColor: '#22c55e' }) });
    expect(out.layers.find((l) => l.id === 'accent')?.backgroundColor).toBe('#22c55e');
    expect(out.layers.find((l) => l.isPhoneSlot)?.fill).toBe('#22c55e'); // accent-colored text follows too
  });

  it('does NOT recolor with the Brand Kit DEFAULT color (user never chose one)', () => {
    const rate = TEMPLATES.find((t) => t.id === 'ins-rate-drop-1')!;
    const out = composeTemplate({ template: rate, postText: 'Rates dropped', brandKit: kit({ companyName: 'Acme' }) });
    expect(out.layers.find((l) => l.id === 'tag')?.backgroundColor).toBe('#22c55e'); // stays the design's green
  });

  it('skips a brand color that would be unreadable on the design background', () => {
    const out = composeTemplate({ template: storm, postText: 'Free inspection', brandKit: kit({ primaryColor: '#123456' }) });
    expect(out.layers.find((l) => l.id === 'accent')?.backgroundColor).toBe('#f97316'); // navy-on-navy rejected
  });

  it('keeps text on a recolored button readable', () => {
    const out = composeTemplate({ template: storm, postText: 'Book a free inspection', brandKit: kit({ primaryColor: '#fde047' }) });
    const cta = out.layers.find((l) => l.id === 'cta-text')!;
    expect(cta.fill).toBe('#000000'); // light yellow button -> black text
  });

  it('never overwrites a fixed focal word (keepText), e.g. SOLD!', () => {
    const sold = TEMPLATES.find((t) => t.id === 're-just-sold-1')!;
    const out = composeTemplate({ template: sold, postText: 'Closed on a beautiful home today', brandKit: kit() });
    expect(out.layers.find((l) => l.id === 'sold')?.text).toBe('SOLD!');
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

// ─── Relevance gating: only offer designs that fit what the post is actually about ──────────
describe('suggestTemplates — relevance gating', () => {
  const ids = (text: string, tradeId: string, kw: string[] = []) =>
    suggestTemplates({ postText: text, tradeId, tradeKeywords: kw, max: 3 }).map((p) => p.template.id);

  it('a roofing post never gets the insurance FREE QUOTE or a real-estate design', () => {
    const got = ids('Hail storm damage season is here. Book your free roof inspection before the next big one hits town.', 'roofing', ['roof']);
    expect(got).not.toContain('ins-free-quote-1');
    expect(got).not.toContain('re-just-listed-1');
    expect(got).toContain('roof-storm-1');
  });
  it('an HVAC post is not offered Before & After just because it says "before the rush"', () => {
    expect(ids('Is your AC ready for summer? Schedule your seasonal tune-up before the rush starts.', 'hvac-technician', ['ac'])).not.toContain('before-after-1');
  });
  it('a thank-you post is not turned into a "Customer Name" testimonial', () => {
    const got = ids('Thank you to everyone who trusted us this year!', 'roofing');
    expect(got).not.toContain('testimonial-1');
    expect(got).toContain('appreciation-1');
  });
  it('a real testimonial post DOES get the testimonial design', () => {
    expect(ids('Five star review from a happy customer: they would recommend us to any client.', 'roofing')).toContain('testimonial-1');
  });
  it('short keywords match whole words only ("ac" must not match "back")', () => {
    expect(keywordHits('we are back and ready', ['ac'])).toBe(0);
    expect(keywordHits('is your ac ready', ['ac'])).toBe(1);
  });
  it('always returns 3 distinct-family designs even for an unrelated post', () => {
    const picks = suggestTemplates({ postText: 'zzz qqq', tradeId: 'roofing', tradeKeywords: [], max: 3 });
    expect(picks.length).toBe(3);
    expect(new Set(picks.map((p) => p.template.layoutFamily)).size).toBe(3);
  });
});

// ─── Automated layout lint: composed copy must fit the room the template leaves for it ─────
describe('composed layouts never overflow into the next element (spacing lint)', () => {
  const CAPTIONS = [
    'Hail storm damage season is here. Book your free roof inspection before the next big one hits town.',
    'Homeowners insurance rates just dropped. Get a free quote today and see how much you could save on your premium.',
    'Just listed! Beautiful 4 bedroom home near downtown with a huge backyard. Schedule a showing this weekend.',
    'Thank you to everyone who trusted us this year!',
    'We spent the entire weekend helping three different families in our community recover from burst pipes and flooding after the freeze, and we are so grateful for the chance to serve our neighbors. Call anytime.',
    'Fast.',
  ];
  const lines = (t?: string) => String(t || '').split('\n').length;

  it('every headline/subtext/CTA fits its vertical room (allowing one line at minimum size)', () => {
    const bad: string[] = [];
    for (const tpl of TEMPLATES) {
      for (const cap of CAPTIONS) {
        const out = composeTemplate({ template: tpl, postText: cap, brandKit: kit({ companyName: 'Pinnacle Roofing & Restoration', phone: '(512) 555-0147' }) });
        for (const l of out.layers) {
          if (l.type !== 'text' || !(l.isHeadline || l.isSubtext)) continue;
          const room = verticalRoom(l, out.layers, out);
          const h = lines(l.text) * (l.fontSize ?? 40) * LINE_H;
          const oneLineAtMin = (l.fontSize ?? 40) * LINE_H;
          if (h > Math.max(room, oneLineAtMin) + 1) bad.push(`${tpl.id}/${l.id} "${cap.slice(0, 24)}…": h=${Math.round(h)} room=${Math.round(room)}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('text never exceeds a readable minimum size (26px) unless the template itself is smaller', () => {
    for (const tpl of TEMPLATES) {
      const out = composeTemplate({ template: tpl, postText: CAPTIONS[4], brandKit: kit() });
      for (const l of out.layers) {
        if (l.type !== 'text' || !(l.isHeadline || l.isSubtext)) continue;
        const orig = tpl.layers.find((o) => o.id === l.id)?.fontSize ?? 40;
        expect(l.fontSize!).toBeGreaterThanOrEqual(Math.min(orig, 26));
      }
    }
  });

  it('CTA copy sits inside its button: centered and within the pill width', () => {
    const out = composeTemplate({ template: storm, postText: 'Get a free quote for your roof', brandKit: kit() });
    const pill = out.layers.find((l) => l.id === 'cta')!;
    const text = out.layers.find((l) => l.id === 'cta-text')!;
    expect(text.textAlign).toBe('center');
    expect(text.left!).toBeGreaterThanOrEqual(pill.left!);
    expect(text.left! + text.width!).toBeLessThanOrEqual(pill.left! + pill.width!);
  });
});
