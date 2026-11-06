/**
 * DEV-ONLY harness for the AUTOMATIC template experience (Priority 1) + Mass Flock run phase
 * (Priority 3). No auth, no Cognito, no network. Renders the REAL ImageSuggestions component
 * with content-aware composition + real Fabric/SVG previews so validate-suggestions.mjs can
 * prove: 3 distinct real previews appear automatically, they reflect the caption, No Image is
 * present, and NO network/AI call happens.
 *
 * Query params:
 *   ?caption=<text>   the post caption to compose designs from
 *   ?trade=<name>     the trade name
 *   ?svg=1            force the SVG fallback path (mobile)
 *   ?width=<px>       max width of the Create column (default 680)
 */
import React, { useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import '../index.css';
import ImageSuggestions from '../components/ImageSuggestions';
import { suggestTemplates } from '../lib/designTemplates';
import { compositionSignature } from '../lib/composeTemplate';
import { BRAND_KIT_DEFAULTS, type BrandKit } from '../lib/brandKit';

declare global {
  interface Window {
    __sugg: {
      opened: { id: string; customize: boolean }[];
      noImage: number;
      generateAi: number;
      personalize: number;
      networkCalls: string[]; // any fetch/XHR during suggestions = credit-safety violation
    };
  }
}

// Trip-wire: record ANY network call so the validator can assert zero (credit safety).
window.__sugg = { opened: [], noImage: 0, generateAi: 0, personalize: 0, networkCalls: [] };
const origFetch = window.fetch;
window.fetch = (...args: Parameters<typeof fetch>) => {
  window.__sugg.networkCalls.push(String(args[0]));
  return origFetch(...args);
};

const params = new URLSearchParams(location.search);
const caption = params.get('caption') || 'Storm season is here. Get your free roof inspection before the next big one hits.';
const tradeName = params.get('trade') || 'Roofing';
const brandKit: BrandKit = { ...BRAND_KIT_DEFAULTS, companyName: 'Summit Roofing LLC', phone: '(555) 123-4567', primaryColor: '#f97316' };

function Harness() {
  const [visible, setVisible] = useState(true);
  const signature = useMemo(() => compositionSignature({ postText: caption, tradeId: 'roofing', brandKit }), []);
  const suggestions = useMemo(() => suggestTemplates({ postText: caption, tradeId: 'roofing', tradeKeywords: ['roof', 'storm', 'inspection'], max: 3 }), []);

  return (
    <div style={{ maxWidth: Number(params.get('width') || 680), margin: '0 auto', padding: 16 }}>
      {/* The original caption is shown ABOVE and must stay intact throughout. */}
      <div className="glass-card" data-testid="caption-box" style={{ marginBottom: 12 }}>
        <p className="text-xs text-slate-400">Your post (stays intact)</p>
        <p className="text-sm text-white" data-testid="caption-text">{caption}</p>
      </div>
      {visible && (
        <ImageSuggestions
          suggestions={suggestions}
          postText={caption}
          tradeName={tradeName}
          brandKit={brandKit}
          signature={signature}
          onOpenStudio={(t, c) => window.__sugg.opened.push({ id: t.id, customize: !!c })}
          onGenerateAiImage={() => { window.__sugg.generateAi++; }}
          onUploadPhoto={() => {}}
          onNoImage={() => { window.__sugg.noImage++; setVisible(false); }}
          onDismiss={() => setVisible(false)}
          canUseAiImage={true}
          onPersonalize={() => { window.__sugg.personalize++; }}
          brandComplete={false}
        />
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><Harness /></React.StrictMode>);
