/**
 * Montserrat + Playfair Display (both SIL OFL 1.1 — free for commercial use and embedding; licence
 * texts in ./assets/fonts). Self-hosted and injected as @font-face so Fabric can measure and draw
 * with them. Loaded lazily, only when a Canva-style design is first composed.
 */
import m500 from './assets/fonts/montserrat-latin-500-normal.woff2?url';
import m700 from './assets/fonts/montserrat-latin-700-normal.woff2?url';
import m800 from './assets/fonts/montserrat-latin-800-normal.woff2?url';
import m900 from './assets/fonts/montserrat-latin-900-normal.woff2?url';
import p700 from './assets/fonts/playfair-display-latin-700-normal.woff2?url';
import p700i from './assets/fonts/playfair-display-latin-700-italic.woff2?url';
import p900 from './assets/fonts/playfair-display-latin-900-normal.woff2?url';

const FACES: [string, number, string, string][] = [
  ['Montserrat', 500, 'normal', m500], ['Montserrat', 700, 'normal', m700],
  ['Montserrat', 800, 'normal', m800], ['Montserrat', 900, 'normal', m900],
  ['Playfair Display', 700, 'normal', p700], ['Playfair Display', 700, 'italic', p700i],
  ['Playfair Display', 900, 'normal', p900],
];

let loaded: Promise<void> | null = null;
/** Inject the @font-face rules once and resolve when the faces are ready to render. */
export function loadCanvaFonts(): Promise<void> {
  if (loaded) return loaded;
  if (typeof document === 'undefined') { loaded = Promise.resolve(); return loaded; }
  if (!document.querySelector('style[data-canva-fonts]')) {
    const css = FACES.map(([f, w, s, u]) =>
      `@font-face{font-family:'${f}';font-weight:${w};font-style:${s};font-display:swap;src:url(${u}) format('woff2');}`).join('\n');
    const el = document.createElement('style');
    el.setAttribute('data-canva-fonts', '1');
    el.textContent = css;
    document.head.appendChild(el);
  }
  loaded = Promise.all(FACES.map(([f, w, s]) => document.fonts.load(`${s} ${w} 40px "${f}"`)))
    .then(() => document.fonts.ready).then(() => undefined).catch(() => undefined);
  return loaded;
}
