/**
 * DEV-ONLY visual-review gallery for the automatic templates. For each realistic scenario it
 * composes the 3 suggested designs exactly as the Create page does and renders them with the
 * real Fabric thumbnail renderer. No auth, no network. Used to review spacing / quality.
 *
 * Query: ?kit=empty (default) | partial | full — which Brand Kit every design is composed with.
 * Every composed text layer is audited for placeholder / dummy copy (window.__galleryIssues).
 */
import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import '../index.css';
import { suggestTemplates } from '../lib/designTemplates';
import { composeTemplate } from '../lib/composeTemplate';
import { renderTemplateToDataUrl } from '../lib/renderTemplatePreview';
import { BRAND_KIT_DEFAULTS, type BrandKit } from '../lib/brandKit';

declare global { interface Window { __galleryDone?: boolean; __galleryIssues?: string[] } }

const KITS: Record<string, { label: string; kit: BrandKit }> = {
  empty: { label: 'Empty Brand Kit', kit: { ...BRAND_KIT_DEFAULTS } },
  partial: { label: 'Partial Brand Kit (company name only)', kit: { ...BRAND_KIT_DEFAULTS, companyName: 'Rivera Family Insurance' } },
  full: { label: 'Complete Brand Kit (name, phone, custom color)', kit: { ...BRAND_KIT_DEFAULTS, companyName: 'Pinnacle Roofing & Restoration', phone: '(512) 555-0147', primaryColor: '#16a34a' } },
};
const kitId = new URLSearchParams(location.search).get('kit') || 'empty';
const { label: kitLabel, kit } = KITS[kitId] || KITS.empty;

const SCENARIOS = [
  { label: 'Roofing', trade: 'roofing', tradeName: 'Roofing', kw: ['roof', 'storm', 'inspection'], text: 'Hail storm damage season is here. Book your free roof inspection before the next big one hits town.' },
  { label: 'Insurance', trade: 'insurance-agent', tradeName: 'Insurance Agent', kw: ['insurance quote', 'home insurance'], text: 'Is your home really covered? Most families are underinsured and do not know it until they file a claim. Call me for a free quote.' },
  { label: 'Real estate', trade: 'real-estate-agent', tradeName: 'Real Estate Agent', kw: ['home for sale', 'open house'], text: 'Just listed! Beautiful 4 bedroom home near downtown with a huge backyard. Schedule a showing this weekend.' },
  { label: 'HVAC', trade: 'hvac-technician', tradeName: 'HVAC Technician', kw: ['AC repair', 'air conditioning'], text: 'Is your AC ready for summer? Schedule your seasonal tune-up before the rush starts.' },
  { label: 'Thank-you post', trade: 'roofing', tradeName: 'Roofing', kw: ['roof repair'], text: 'Thank you to everyone who trusted us this year!' },
  { label: 'Plumber, long caption', trade: 'plumber', tradeName: 'Plumber', kw: ['plumbing leak', 'pipe burst'], text: 'We spent the entire weekend helping three different families in our community recover from burst pipes and flooding after the freeze, and we are so grateful for the chance to serve our neighbors. Call anytime.' },
];

const PLACEHOLDER_RE = /(your company|your name|\(555\) 000|000-0000|license #|customer name|add your|goes here|headline|announcement|special offer|learn more|\+ logo)/i;

type Cell = { name: string; family: string; url: string; issues: string[] };

function Gallery() {
  const [rows, setRows] = useState<{ label: string; text: string; cells: Cell[] }[]>([]);
  useEffect(() => {
    (async () => {
      const out: { label: string; text: string; cells: Cell[] }[] = [];
      const all: string[] = [];
      for (const s of SCENARIOS) {
        const picks = suggestTemplates({ postText: s.text, tradeId: s.trade, tradeKeywords: s.kw, max: 3 });
        const cells: Cell[] = [];
        for (const p of picks) {
          const composed = composeTemplate({ template: p.template, postText: s.text, tradeName: s.tradeName, brandKit: kit });
          const issues = composed.layers
            .filter((l) => l.type === 'text' && l.text && PLACEHOLDER_RE.test(l.text))
            .map((l) => `${s.label} / ${p.template.name}: "${l.text}"`);
          all.push(...issues);
          const url = await renderTemplateToDataUrl(composed, kit, { thumbWidth: 400 });
          cells.push({ name: p.template.name, family: p.template.layoutFamily || p.template.category, url, issues });
        }
        out.push({ label: s.label, text: s.text, cells });
      }
      setRows(out);
      window.__galleryIssues = all;
      requestAnimationFrame(() => { window.__galleryDone = true; });
    })();
  }, []);

  return (
    <div style={{ padding: 16, background: '#0b1020', minHeight: '100vh', color: '#fff', fontFamily: 'Arial' }}>
      <h2 style={{ margin: '0 0 12px' }}>Automatic templates — {kitLabel}</h2>
      {rows.map((r) => (
        <div key={r.label} style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{r.label} <span style={{ fontWeight: 400, color: '#94a3b8' }}>— “{r.text}”</span></div>
          <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
            {r.cells.map((c, i) => (
              <figure key={i} style={{ margin: 0 }}>
                <img src={c.url} style={{ width: 400, display: 'block', borderRadius: 6 }} alt={c.name} />
                <figcaption style={{ fontSize: 11, color: c.issues.length ? '#f87171' : '#94a3b8', marginTop: 3 }}>
                  {c.name} · {c.family}{c.issues.length ? ` · PLACEHOLDER: ${c.issues.length}` : ''}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<Gallery />);
