/**
 * DEV-ONLY visual-review gallery for the automatic templates. For each realistic scenario it
 * composes the 3 suggested designs exactly as the Create page does and renders them with the
 * real Fabric thumbnail renderer. No auth, no network. Used to review spacing / quality.
 *
 * Query: ?brand=1 applies a customized Brand Kit (name, phone, custom color) to every design.
 */
import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import '../index.css';
import { suggestTemplates } from '../lib/designTemplates';
import { composeTemplate } from '../lib/composeTemplate';
import { renderTemplateToDataUrl } from '../lib/renderTemplatePreview';
import { BRAND_KIT_DEFAULTS, type BrandKit } from '../lib/brandKit';

declare global { interface Window { __galleryDone?: boolean } }

const branded = new URLSearchParams(location.search).get('brand') === '1';
const kit: BrandKit = branded
  ? { ...BRAND_KIT_DEFAULTS, companyName: 'Pinnacle Roofing & Restoration', phone: '(512) 555-0147', primaryColor: '#16a34a' }
  : { ...BRAND_KIT_DEFAULTS };

const SCENARIOS = [
  { label: 'Roofing', trade: 'roofing', kw: ['roof', 'storm', 'inspection'], text: 'Hail storm damage season is here. Book your free roof inspection before the next big one hits town.' },
  { label: 'Insurance', trade: 'insurance-agent', kw: ['insurance', 'quote'], text: 'Homeowners insurance rates just dropped. Get a free quote today and see how much you could save on your premium.' },
  { label: 'Real estate', trade: 'real-estate-agent', kw: ['home', 'listing'], text: 'Just listed! Beautiful 4 bedroom home near downtown with a huge backyard. Schedule a showing this weekend.' },
  { label: 'HVAC', trade: 'hvac-technician', kw: ['ac', 'heat'], text: 'Is your AC ready for summer? Schedule your seasonal tune-up before the rush starts.' },
  { label: 'Short caption', trade: 'roofing', kw: ['roof'], text: 'Thank you to everyone who trusted us this year!' },
  { label: 'Long caption', trade: 'plumber', kw: ['plumb', 'leak'], text: 'We spent the entire weekend helping three different families in our community recover from burst pipes and flooding after the freeze, and we are so grateful for the chance to serve our neighbors. Call anytime.' },
];

type Cell = { name: string; family: string; url: string };

function Gallery() {
  const [rows, setRows] = useState<{ label: string; text: string; cells: Cell[] }[]>([]);
  useEffect(() => {
    (async () => {
      const out: { label: string; text: string; cells: Cell[] }[] = [];
      for (const s of SCENARIOS) {
        const picks = suggestTemplates({ postText: s.text, tradeId: s.trade, tradeKeywords: s.kw, max: 3 });
        const cells: Cell[] = [];
        for (const p of picks) {
          const composed = composeTemplate({ template: p.template, postText: s.text, brandKit: kit });
          const url = await renderTemplateToDataUrl(composed, kit, { thumbWidth: 400 });
          cells.push({ name: p.template.name, family: p.template.layoutFamily || p.template.category, url });
        }
        out.push({ label: s.label, text: s.text, cells });
      }
      setRows(out);
      requestAnimationFrame(() => { window.__galleryDone = true; });
    })();
  }, []);

  return (
    <div style={{ padding: 16, background: '#0b1020', minHeight: '100vh', color: '#fff', fontFamily: 'Arial' }}>
      <h2 style={{ margin: '0 0 12px' }}>Automatic templates — visual review {branded ? '(custom Brand Kit)' : '(no Brand Kit)'}</h2>
      {rows.map((r) => (
        <div key={r.label} style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{r.label} <span style={{ fontWeight: 400, color: '#94a3b8' }}>— “{r.text}”</span></div>
          <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
            {r.cells.map((c, i) => (
              <figure key={i} style={{ margin: 0 }}>
                <img src={c.url} style={{ width: 400, display: 'block', borderRadius: 6 }} alt={c.name} />
                <figcaption style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>{c.name} · {c.family}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<Gallery />);
