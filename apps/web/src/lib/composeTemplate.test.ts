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

    // Empty kit: the slots are REMOVED (no placeholder, no invented details, no empty boxes).
    const noBrand = composeTemplate({ template: storm, postText: 'Free inspection', brandKit: kit() });
    expect(noBrand.layers.some((l) => l.isPhoneSlot || l.isBrandSlot)).toBe(false);
    // Partial kit: only the provided detail appears.
    const nameOnly = composeTemplate({ template: storm, postText: 'Free inspection', brandKit: kit({ companyName: 'Acme Roofing' }) });
    expect(nameOnly.layers.some((l) => l.isPhoneSlot)).toBe(false);
    expect(nameOnly.layers.find((l) => l.isBrandSlot && !l.isPhoneSlot)!.text).toBe('Acme Roofing');
    const phoneOnly = composeTemplate({ template: storm, postText: 'Free inspection', brandKit: kit({ phone: '(555) 111-2222' }) });
    expect(phoneOnly.layers.find((l) => l.isPhoneSlot)!.text).toBe('(555) 111-2222');
    expect(phoneOnly.layers.some((l) => l.isBrandSlot && !l.isPhoneSlot)).toBe(false);
  });

  it('applies a CUSTOM, readable brand color to the design accent (shapes and accent text)', () => {
    // (a phone is supplied: an empty phone slot is removed, so there would be no text to check)
    const out = composeTemplate({ template: storm, postText: 'Free inspection', brandKit: kit({ primaryColor: '#22c55e', phone: '(555) 111-2222' }) });
    expect(out.layers.find((l) => l.id === 'accent')?.backgroundColor).toBe('#22c55e');
    expect(out.layers.find((l) => l.isPhoneSlot)?.fill).toBe('#22c55e'); // accent-colored text follows too
  });

  it('does NOT recolor with the Brand Kit DEFAULT color (user never chose one)', () => {
    // The old 'RATE UPDATE' tag was removed (it asserted a rate change the user may not have
    // made); the design's green now lives on the trade kicker and the accent CTA.
    const rate = TEMPLATES.find((t) => t.id === 'ins-rate-drop-1')!;
    const out = composeTemplate({ template: rate, postText: 'Rates dropped. Get a free quote.', tradeName: 'Insurance Agent', brandKit: kit({ companyName: 'Acme' }) });
    expect(out.layers.find((l) => l.id === 'kicker')?.fill).toBe('#22c55e'); // stays the design's green
    expect(out.layers.find((l) => l.id === 'cta')?.fill).toBe('#22c55e');
    // A trade-palette direction keeps ITS design when the user customized nothing either...
    const editorial = TEMPLATES.find((t) => t.id === 'u-editorial')!;
    const plain = composeTemplate({ template: editorial, postText: 'Hello neighbors', brandKit: kit() });
    expect(plain.layers.find((l) => l.id === 'bar')?.backgroundColor).toBe('#b45309');
    // ...but takes the trade's palette (when readable) instead of the generic default.
    const roof = composeTemplate({ template: editorial, postText: 'Hello neighbors', tradeName: 'Roofing', brandKit: kit() });
    expect(roof.layers.find((l) => l.id === 'bar')?.backgroundColor).toBe('#ea580c');
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

// ─── Finished designs: no placeholder / invented copy, for every kit × trade × topic ─────
const SCENARIOS = [
  { tradeId: 'roofing', tradeName: 'Roofing', kw: ['roof repair', 'storm damage'], text: 'Hail storm damage season is here. Book your free roof inspection before the next big one hits town.' },
  { tradeId: 'insurance-agent', tradeName: 'Insurance Agent', kw: ['insurance quote'], text: 'Is your home really covered? Most families are underinsured. Call me for a free quote.' },
  { tradeId: 'real-estate-agent', tradeName: 'Real Estate Agent', kw: ['open house'], text: 'Just listed! Beautiful 4 bedroom home near downtown. Schedule a showing this weekend.' },
  { tradeId: 'real-estate-agent', tradeName: 'Real Estate Agent', kw: ['open house'], text: 'Just sold! Congratulations to the Smith family on their new home.' },
  { tradeId: 'hvac-technician', tradeName: 'HVAC Technician', kw: ['AC repair'], text: 'Is your AC ready for summer? Schedule your seasonal tune-up before the rush starts.' },
  { tradeId: 'plumber', tradeName: 'Plumber', kw: ['pipe burst'], text: 'We spent the weekend helping three families recover from burst pipes after the freeze.' },
  { tradeId: 'roofing', tradeName: 'Roofing', kw: ['roof repair'], text: 'Thank you to everyone who trusted us this year!' },
  { tradeId: 'cosmetologist', tradeName: 'Cosmetologist', kw: ['haircut'], text: 'Five-star review from a happy customer! So grateful for the kind words.' },
  { tradeId: 'flooring-installer', tradeName: 'Flooring Installer', kw: ['flooring'], text: 'Before and after: this kitchen got brand new hardwood floors. What a transformation.' },
];
const KITS: Record<string, BrandKit> = {
  empty: kit(),
  nameOnly: kit({ companyName: 'Rivera Family Insurance' }),
  phoneOnly: kit({ phone: '(512) 555-0147' }),
  full: kit({ companyName: 'Pinnacle Roofing & Restoration', phone: '(512) 555-0147', primaryColor: '#16a34a', tagline: 'Built to last' }),
};
// Words that only ever appear as template filler or as claims the user did not write.
const FORBIDDEN = /(your company|your name|555\) 000|000-0000|license #|customer name|add your|goes here|double-click|announcement|special offer|learn more|rate update|rates have|no obligation|save thousands|costs you thousands|\+ logo|★)/i;

describe('finished designs never contain placeholder or invented copy', () => {
  for (const [kitName, k] of Object.entries(KITS)) {
    it(`kit=${kitName}: every text in every suggested design comes from the caption, trade or Brand Kit`, () => {
      for (const s of SCENARIOS) {
        for (const { template } of suggestTemplates({ postText: s.text, tradeId: s.tradeId, tradeKeywords: s.kw, max: 3 })) {
          const out = composeTemplate({ template, postText: s.text, tradeName: s.tradeName, brandKit: k });
          for (const l of out.layers) {
            if (l.type !== 'text' || !l.text) continue;
            expect(l.text, `${s.tradeName} / ${template.id} / ${l.id}`).not.toMatch(FORBIDDEN);
            // the template's own stand-in headline words never survive composition
            if (l.isHeadline && !l.keepText) expect(l.text, `${template.id} headline`).not.toMatch(/^(headline|quote|thank you)$/i);
            if (l.isBrandSlot && !l.isPhoneSlot) expect(l.text.replace(/\s+/g, ' '), `${template.id} brand`).toBe(k.companyName);
            if (l.isPhoneSlot) expect(l.text).toBe(k.phone);
            if (l.isKicker) expect(l.text.replace(/\s+/g, ' ')).toBe(s.tradeName.toUpperCase());
          }
          // An empty business detail is omitted entirely (no empty boxes, no orphaned footer).
          if (!k.companyName) expect(out.layers.some((l) => l.isBrandSlot && !l.isPhoneSlot)).toBe(false);
          if (!k.phone) expect(out.layers.some((l) => l.isPhoneSlot)).toBe(false);
          if (!k.companyName && !k.phone) expect(out.layers.some((l) => l.requires === 'contact')).toBe(false);
        }
      }
    });
  }

  it('the supporting line comes from the caption or the Brand Kit tagline, never from template copy', () => {
    const rate = TEMPLATES.find((t) => t.id === 'ins-rate-drop-1')!;
    const short = composeTemplate({ template: rate, postText: 'Rates dropped', tradeName: 'Insurance Agent', brandKit: kit() });
    expect(short.layers.some((l) => l.isSubtext)).toBe(false); // nothing true to say → no line
    const tag = composeTemplate({ template: rate, postText: 'Rates dropped', tradeName: 'Insurance Agent', brandKit: kit({ tagline: 'Local and independent' }) });
    expect(tag.layers.find((l) => l.isSubtext)?.text?.replace(/\s+/g, ' ')).toBe('Local and independent');
  });

  it('a CTA (and its button) only appears when the caption asks for an action', () => {
    const poster = TEMPLATES.find((t) => t.id === 'u-poster')!;
    const none = composeTemplate({ template: poster, postText: 'Thank you to everyone who trusted us this year!', brandKit: kit() });
    expect(none.layers.some((l) => /cta/i.test(l.id))).toBe(false);
    const ask = composeTemplate({ template: poster, postText: 'Storm season is here. Call us for a free inspection.', brandKit: kit() });
    expect(ask.layers.find((l) => l.id === 'cta-text')?.text).toBe('FREE INSPECTION');
    expect(ask.layers.some((l) => l.id === 'cta' && l.type === 'rect')).toBe(true);
  });

  it('topic-specific claim designs only appear when the caption says so', () => {
    const ids = (text: string, tradeId = 'insurance-agent') => suggestTemplates({ postText: text, tradeId, tradeKeywords: [], max: 3 }).map((r) => r.template.id);
    expect(ids('Protect your family with the right coverage.')).not.toContain('ins-free-quote-1');
    expect(ids('Call me today for a free quote on your coverage.')).toContain('ins-free-quote-1');
    expect(ids('Beautiful neighborhood park cleanup today!', 'real-estate-agent')).not.toContain('re-just-sold-1');
    expect(ids('Beautiful neighborhood park cleanup today!', 'real-estate-agent')).not.toContain('re-just-listed-1');
  });
});

// ─── Three genuinely different creative directions per set ─────────────────────────────
describe('each set of three is visually distinct', () => {
  const LIGHT = new Set(['u-editorial', 'u-colorblock']);
  for (const s of SCENARIOS) {
    it(`${s.tradeName}: "${s.text.slice(0, 32)}…"`, () => {
      const res = suggestTemplates({ postText: s.text, tradeId: s.tradeId, tradeKeywords: s.kw, max: 3 });
      expect(res).toHaveLength(3);
      const fams = res.map((r) => r.template.layoutFamily);
      expect(new Set(fams).size).toBe(3);                                   // 3 different layouts
      expect(new Set(res.map((r) => r.template.background)).size).toBe(3);  // 3 different palettes
      expect(res.filter((r) => LIGHT.has(r.template.id)).length).toBe(1);  // exactly one light design
      expect(res.filter((r) => !r.template.direction).length).toBeLessThanOrEqual(1);
      // stable: the same caption always yields the same set (no flicker while typing)
      expect(suggestTemplates({ postText: s.text, tradeId: s.tradeId, tradeKeywords: s.kw, max: 3 }).map((r) => r.template.id))
        .toEqual(res.map((r) => r.template.id));
    });
  }

  it('across many topics, both light directions and every dark direction get used', () => {
    const seen = new Set<string>();
    const topics = ['Spring cleaning tips', 'Meet our new technician', 'Holiday hours update', 'Our community food drive',
      'Five ways to save energy', 'Ask me anything this week', 'Happy anniversary to our team', 'Safety reminder for winter',
      'Weekend availability is open', 'Thanks for 500 followers', 'Local business spotlight', 'Fun fact Friday'];
    for (const t of topics) for (const tr of ['roofing', 'plumber', 'painter']) {
      for (const r of suggestTemplates({ postText: t, tradeId: tr, tradeKeywords: [], max: 3 })) seen.add(r.template.id);
    }
    for (const id of ['u-poster', 'u-editorial', 'u-colorblock', 'u-spotlight', 'u-frame', 'u-stripe']) expect(seen.has(id), id).toBe(true);
  });

  it('a topic layout never sits next to the direction that looks like it', () => {
    const res = suggestTemplates({ postText: 'Hail storm damage? Book a free roof inspection.', tradeId: 'roofing', tradeKeywords: [], max: 3 });
    expect(res[0].template.id).toBe('roof-storm-1');                    // hero
    expect(res.map((r) => r.template.id)).not.toContain('u-poster');     // too similar to hero
  });
});

// ─── Editability and sparse designs ─────────────────────────────────────────────────────
describe('composed designs stay editable and complete', () => {
  it('every content text layer (headline, supporting line, CTA, kicker, business details) is editable', () => {
    for (const s of SCENARIOS) {
      for (const { template } of suggestTemplates({ postText: s.text, tradeId: s.tradeId, tradeKeywords: s.kw, max: 3 })) {
        const out = composeTemplate({ template, postText: s.text, tradeName: s.tradeName, brandKit: KITS.full });
        for (const l of out.layers) {
          if (l.isHeadline || l.isSubtext || l.isKicker || l.isBrandSlot || /cta-text|cta$/.test(l.id) && l.type === 'text') {
            expect(l.isEditable, `${template.id}/${l.id}`).toBe(true);
          }
        }
      }
    }
  });

  it('a short thank-you post gets decoration (topic icon) instead of empty space; a full post does not', () => {
    const poster = TEMPLATES.find((t) => t.id === 'u-poster')!;
    const sparse = composeTemplate({ template: poster, postText: 'Thank you to everyone who trusted us this year!', tradeName: 'Roofing', brandKit: kit() });
    expect(sparse.layers.find((l) => l.id === 'sparse-icon')?.text).toBe('\u2764\uFE0F');
    const full = composeTemplate({ template: poster, postText: 'Thank you all. We fixed 40 roofs this year and loved every one.', tradeName: 'Roofing', brandKit: kit() });
    expect(full.layers.some((l) => l.sparseOnly)).toBe(false);
  });

  it('the supporting line stays readable (never shrunk below ~80% of its design size)', () => {
    const spot = TEMPLATES.find((t) => t.id === 'u-spotlight')!;
    const long = 'Hail storm damage season. ' + 'We help families with fast, honest repairs and clear answers about every step of the process. '.repeat(3);
    const out = composeTemplate({ template: spot, postText: long, brandKit: kit() });
    const sub = out.layers.find((l) => l.isSubtext)!;
    expect(sub.fontSize!).toBeGreaterThanOrEqual(Math.round(40 * 0.8));
  });

  it('a long business name is fitted, never cut off with an ellipsis', () => {
    for (const id of ['u-poster', 'u-editorial', 'u-colorblock', 'u-stripe']) {
      const t = TEMPLATES.find((x) => x.id === id)!;
      const out = composeTemplate({ template: t, postText: 'Hello neighbors', brandKit: kit({ companyName: 'Pinnacle Roofing & Restoration', phone: '(512) 555-0147' }) });
      expect(out.layers.find((l) => l.isBrandSlot && !l.isPhoneSlot)!.text, id).toBe('Pinnacle Roofing & Restoration');
    }
  });

  it('composition is pure: no network request of any kind', async () => {
    const calls: string[] = [];
    const orig = globalThis.fetch;
    globalThis.fetch = (async (u: string) => { calls.push(String(u)); throw new Error('blocked'); }) as typeof fetch;
    try {
      for (const s of SCENARIOS) {
        for (const { template } of suggestTemplates({ postText: s.text, tradeId: s.tradeId, tradeKeywords: s.kw, max: 3 })) {
          composeTemplate({ template, postText: s.text, tradeName: s.tradeName, brandKit: KITS.full });
        }
      }
    } finally { globalThis.fetch = orig; }
    expect(calls).toHaveLength(0);
  });
});
