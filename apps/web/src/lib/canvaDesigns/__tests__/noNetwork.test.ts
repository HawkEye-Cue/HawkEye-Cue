// Feature: canva-style-design-integration, Task 5.1: Zero network / zero AI
// Validates: Requirements 7 (Credit-Free, Client-Side Generation)
//
// Requirement 7:
//   7.1 Composing, previewing, or editing a Canva_Design performs NO network request and NO AI call.
//   7.2 Zero AI image credits are consumed by any Canva_Design operation.
//   7.3 Previews render at full 1080x1080 entirely client-side.
//   7.4 Existing tier gating for paid AI image generation stays unchanged and INDEPENDENT of Canva.
//
// This feature's credit-free guarantee has two enforceable halves, both covered here:
//
//   (A) STATIC GUARANTEE — the shipping engine source cannot reach the network or the AI/credit
//       system. We read every module on the Canva shipping path with node fs and assert that NONE
//       of them:
//         - import the shared `ApiClient` (the only client that talks to the backend, incl. the
//           `/content/image-credits` balance + the paid image-generation endpoints), or any
//           `@social-lead-gen/shared` surface,
//         - call `fetch(` / `XMLHttpRequest` / `navigator.sendBeacon` / `WebSocket` / `EventSource`,
//         - reference any AI image / credit endpoint or symbol (generate-image, image-credits,
//           aiImage, deductCredit, etc.).
//       Fonts must load from BUNDLED LOCAL assets (Vite `?url` imports of self-hosted woff2 +
//       an injected @font-face), never a remote font URL (fonts.googleapis / gstatic / http(s)).
//
//   (B) BEHAVIORAL GUARANTEE — with `global.fetch` spied, driving the pure engine (buildCanvaSpecs
//       -> buildObjects via a minimal Fabric stub, the same pattern as caption.property.test.ts)
//       never invokes fetch. `composeSpecToDocument` additionally needs a real browser DOM +
//       Fabric StaticCanvas (not available in the default `node` vitest env) to export the PNG, so
//       its full run is exercised by the Task 8 authenticated E2E, which asserts 0 AI calls at
//       runtime; here the static scan proves document.ts has no network/AI reach.
//
// This is a guard test (no rendering, no real network). It runs in the web app's default `node`
// vitest environment.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCanvaSpecs } from '../index';
import { buildObjects } from '../builder';
import type { DesignSpec } from '../spec';
import type { BrandKit } from '../../brandKit';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE_DIR = join(HERE, '..');

// Every TypeScript module on the shipping Canva path (the dev prototype under src/dev/canva is
// not shipped and is out of scope here; see Task 10). If a new engine module is added it should
// be listed here so this guarantee keeps covering the whole path.
const ENGINE_MODULES = [
  'index.ts',
  'document.ts',
  'builder.ts',
  'fonts.ts',
  'inputs.ts',
  'kit.ts',
  'spec.ts',
  'insurancePhoto.ts',
  'insuranceIllustrated.ts',
  'insuranceEditorial.ts',
] as const;

function readModule(name: string): string {
  return readFileSync(join(ENGINE_DIR, name), 'utf8');
}

// Patterns that would indicate the module can reach the network or the AI/credit system.
// Each entry: [human label, regex]. The regexes are intentionally broad so an accidental future
// introduction trips the guard.
const NETWORK_PATTERNS: [string, RegExp][] = [
  ['a fetch() call', /\bfetch\s*\(/],
  ['XMLHttpRequest', /\bXMLHttpRequest\b/],
  ['navigator.sendBeacon', /\bsendBeacon\s*\(/],
  ['a WebSocket', /\bnew\s+WebSocket\b/],
  ['an EventSource', /\bnew\s+EventSource\b/],
  ['an axios call', /\baxios\b/],
  ['an absolute http(s) URL literal', /["'`]https?:\/\//],
];

const AI_CREDIT_PATTERNS: [string, RegExp][] = [
  ['the shared ApiClient', /\bApiClient\b/],
  ['the @social-lead-gen/shared backend surface', /@social-lead-gen\/shared/],
  ['an image-generation endpoint', /generate[-_]?image/i],
  ['the image-credits endpoint', /image[-_]?credits/i],
  ['an AI image symbol', /\baiImage\b/i],
  ['a credit deduction', /\b(deduct|reserve|charge|spend)\w*credit/i],
  ['an AI model/completion call', /\b(openai|bedrock|anthropic|dall[-_]?e|stable[-_]?diffusion)\b/i],
];

describe('Task 5.1 · zero network / zero AI — static source guarantee (Req 7.1, 7.2)', () => {
  it.each(ENGINE_MODULES)('shipping module "%s" exists and is readable', (name) => {
    const src = readModule(name);
    expect(src.length).toBeGreaterThan(0);
  });

  it.each(ENGINE_MODULES)('shipping module "%s" performs no network request', (name) => {
    const src = readModule(name);
    for (const [label, re] of NETWORK_PATTERNS) {
      expect(re.test(src), `"${name}" appears to contain ${label} — Canva designs must be 100% client-side (Req 7.1)`).toBe(false);
    }
  });

  it.each(ENGINE_MODULES)('shipping module "%s" makes no AI / image-credit call', (name) => {
    const src = readModule(name);
    for (const [label, re] of AI_CREDIT_PATTERNS) {
      expect(re.test(src), `"${name}" appears to reference ${label} — Canva designs must consume zero AI image credits (Req 7.2)`).toBe(false);
    }
  });

  it('no shipping module imports from outside the local relative tree or fabric', () => {
    // The engine's only external runtime dependency is Fabric (local vector rendering). Everything
    // else it imports is a RELATIVE sibling module or a bundled `?url` asset. In particular it never
    // imports the API/network layer. This asserts the import graph itself is network-free.
    const importRe = /\bimport\s+(?:type\s+)?(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/g;
    for (const name of ENGINE_MODULES) {
      const src = readModule(name);
      let m: RegExpExecArray | null;
      while ((m = importRe.exec(src))) {
        const spec = m[1];
        const ok =
          spec.startsWith('.') ||            // relative sibling module or bundled ?url asset
          spec === 'fabric';                 // local vector rendering engine (no network)
        expect(ok, `"${name}" imports "${spec}", which is not a local relative module or fabric`).toBe(true);
      }
    }
  });
});

describe('Task 5.1 · fonts load from bundled local assets, not the network (Req 7.1)', () => {
  const fontsSrc = readModule('fonts.ts');

  it('all font faces come from Vite `?url` imports of self-hosted woff2', () => {
    // Each imported font is a local asset resolved to a bundled URL at build time (`...?url`),
    // not a remote download. There must be no reference to a font CDN or an http(s) URL.
    const urlImports = fontsSrc.match(/from\s+['"]\.[^'"]+\?url['"]/g) ?? [];
    expect(urlImports.length, 'expected the font loader to import local woff2 assets via `?url`').toBeGreaterThan(0);
    for (const imp of urlImports) {
      expect(imp).toMatch(/\.woff2\?url['"]$/); // local, self-hosted woff2
    }
  });

  it('the font loader references no remote font URL or CDN', () => {
    expect(/fonts\.googleapis\.com/i.test(fontsSrc)).toBe(false);
    expect(/fonts\.gstatic\.com/i.test(fontsSrc)).toBe(false);
    expect(/typekit|use\.fontawesome|cdn\./i.test(fontsSrc)).toBe(false);
    expect(/["'`]https?:\/\//.test(fontsSrc)).toBe(false);
  });

  it('font delivery is a locally-injected @font-face (src: url(<bundled asset>)), not a network GET', () => {
    // The loader builds a @font-face stylesheet whose `src` is the bundled `?url` value and injects
    // it into document.head; measurement uses the local `document.fonts` API. No network request.
    expect(fontsSrc.includes('@font-face')).toBe(true);
    expect(fontsSrc.includes('document.fonts')).toBe(true);
  });
});

// ── Behavioral guarantee: driving the engine never calls fetch ─────────────────────────────────
// Minimal Fabric stub (same shape as caption.property.test.ts) so the REAL builder.ts runs here
// without a browser/canvas. The builder only constructs objects and reads/writes plain geometry +
// `data` props; it must not touch the network.
function makeFabricStub() {
  class Obj {
    data: any; text?: string; width = 0; height = 0; top = 0; left = 0; scaleX = 1; scaleY = 1;
    fontSize = 0; textLines?: string[]; pathOffset = { x: 0, y: 0 };
    constructor(opts: any = {}) { Object.assign(this, opts); }
    set(p: any) { Object.assign(this, p); if (p.text != null || p.fontSize != null) this.recompute(); return this; }
    setCoords() {}
    recompute() {
      const per = Math.max(1, Math.floor(this.width / Math.max(1, this.fontSize * 0.6)));
      const words = String(this.text ?? '').split(/\s+/).filter(Boolean);
      const lines: string[] = []; let cur = '';
      for (const w of words) { if (!cur) cur = w; else if ((cur + ' ' + w).length <= per) cur += ' ' + w; else { lines.push(cur); cur = w; } }
      this.textLines = lines.length ? (cur ? [...lines, cur] : lines) : [''];
      this.height = (this.textLines?.length ?? 1) * Math.max(1, this.fontSize) * 1.2;
    }
    initDimensions() { this.recompute(); }
  }
  class Textbox extends Obj { constructor(text: string, opts: any = {}) { super({ ...opts, text }); this.recompute(); } }
  class Rect extends Obj {}
  class Ellipse extends Obj {}
  class Path extends Obj { constructor(_d: string, opts: any = {}) { super(opts); } }
  class Gradient { constructor(public o: any) {} }
  class Shadow { constructor(public s: any) {} }
  return { Rect, Ellipse, Path, Textbox, Gradient, Shadow, FabricImage: { fromURL: async () => new Obj() } } as any;
}

const KIT: BrandKit = {
  companyName: 'Harbor & Pike Insurance',
  phone: '(555) 123-4567',
  website: 'harborpike.example',
  tagline: 'Covered, come what may',
  primaryColor: '#1d4ed8',
  accentColor: '#ffffff',
  logoDataUrl: null,
};
const CAPTION = 'Is your home really covered? Most families are underinsured. Call me for a free quote.';

describe('Task 5.1 · behavioral — building designs issues no network request (Req 7.1, 7.2)', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('buildCanvaSpecs + buildObjects never call global.fetch', async () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error('network access is forbidden for Canva designs')));
    vi.stubGlobal('fetch', fetchSpy);

    const specs = buildCanvaSpecs('insurance-agent', CAPTION, 'Insurance Agent', KIT);
    expect(specs).not.toBeNull();

    const f = makeFabricStub();
    for (const spec of specs as DesignSpec[]) {
      const objs = await buildObjects(f, spec);
      expect(objs.length).toBeGreaterThan(0); // the design really did build (not a no-op)
    }

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('building designs does not consume AI image credits (no credit/quota call is made)', () => {
    // The only path to the AI image quota is the shared ApiClient (fetchImageCredits ->
    // GET /content/image-credits and the generation endpoints). The engine never imports it
    // (asserted statically above) and building a design makes no network call (asserted above),
    // so no Canva operation can read, reserve, or deduct an AI image credit. Tier gating for paid
    // AI images lives entirely in aiImageAccess.ts / ContentCreatorPage and is untouched here
    // (Req 7.4). Runtime confirmation of "0 AI calls" is additionally covered by the Task 8 E2E.
    const fetchSpy = vi.fn(() => Promise.reject(new Error('network access is forbidden for Canva designs')));
    vi.stubGlobal('fetch', fetchSpy);
    const specs = buildCanvaSpecs('insurance-agent', CAPTION, 'Insurance Agent', KIT);
    expect(specs).toHaveLength(3);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
