// Final Flocks workflow browser test: finish a design (add a photo) → Use in Post (export
// PNG) → copy the exported image to the REAL Chromium clipboard → read it back to confirm it
// is "ready to paste" into the Facebook group. Reports browser limitations.
// Uses the same dev harness as validate-studio.mjs (AI edit mocked; no OpenAI cost).
// Usage: node scripts/validate-flocks-clipboard.mjs <baseUrl>
import { chromium } from 'playwright-core';

const BASE = process.argv[2] || 'http://localhost:5199';
let passed = 0, failed = 0;
const pass = (n, d = '') => { passed++; console.log(`PASS ${n}${d ? ' — ' + d : ''}`); };
const fail = (n, d = '') => { failed++; console.log(`FAIL ${n}${d ? ' — ' + d : ''}`); };

const MAKE_PHOTO = `(() => { const c=document.createElement('canvas'); c.width=1200; c.height=900;
  const g=c.getContext('2d'); const gr=g.createLinearGradient(0,0,0,900); gr.addColorStop(0,'#87ceeb'); gr.addColorStop(1,'#3a7d44');
  g.fillStyle=gr; g.fillRect(0,0,1200,900); g.fillStyle='#8b4513'; g.fillRect(400,350,400,350);
  return c.toDataURL('image/png'); })()`;

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

try {
  await page.goto(`${BASE}/studio-harness.html`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid=studio-stage]', { timeout: 15000 });
  pass('Design Studio opens (Flocks step: finish a design)');

  // Add a photo to the design — the finished graphic the user will post to a Flock group.
  await page.getByRole('tab', { name: /Wingman/ }).click().catch(() => {});
  const photo = await page.evaluate(MAKE_PHOTO);
  const buf = Buffer.from(photo.split(',')[1], 'base64');
  await page.locator('input[type=file][accept="image/*"]').setInputFiles({ name: 'house.png', mimeType: 'image/png', buffer: buf });
  await page.waitForFunction(() => document.body.innerText.includes('Photo added'), null, { timeout: 10000 });
  pass('photo added to the design');

  // Click "Use in Post" → export the finished PNG.
  await page.getByRole('button', { name: /Use in Post/ }).click();
  await page.waitForFunction(() => window.__studio && typeof window.__studio.usedInPost === 'string' && window.__studio.usedInPost.startsWith('data:image/png'), null, { timeout: 10000 });
  const exported = await page.evaluate(() => window.__studio.usedInPost);
  pass('Use in Post exports a full PNG (ready to attach)', `${Math.round(exported.length / 1024)} KB`);

  // ── Copy the exported image to the clipboard (the Flocks "Copy & Open" step) ──
  // Replicates copyImageToClipboard(): fetch data URL → PNG blob → navigator.clipboard.write.
  const copyResult = await page.evaluate(async (dataUrl) => {
    try {
      const resp = await fetch(dataUrl);
      const blob = await resp.blob();
      const pngBlob = blob.type === 'image/png' ? blob : new Blob([blob], { type: 'image/png' });
      if (!(navigator.clipboard && typeof window.ClipboardItem !== 'undefined' && navigator.clipboard.write)) {
        return { ok: false, reason: 'clipboard-image-unsupported' };
      }
      await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': pngBlob })]);
      return { ok: true, bytes: pngBlob.size };
    } catch (e) { return { ok: false, reason: String(e) }; }
  }, exported);
  if (copyResult.ok) pass('copy image to clipboard succeeds (desktop Chrome)', `${copyResult.bytes} bytes`);
  else fail('copy image to clipboard', copyResult.reason);

  // ── Confirm the clipboard actually holds a pasteable PNG ──
  const readBack = await page.evaluate(async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const it of items) if (it.types.includes('image/png')) { const b = await it.getType('image/png'); return { ok: true, bytes: b.size }; }
      return { ok: false, reason: 'no image/png on clipboard' };
    } catch (e) { return { ok: false, reason: String(e) }; }
  });
  if (readBack.ok) pass('clipboard holds a pasteable PNG (ready to paste into the Facebook group)', `${readBack.bytes} bytes`);
  else fail('clipboard holds a pasteable PNG', readBack.reason);

  if (errors.length === 0) pass('no runtime errors during the Flocks workflow');
  else fail('runtime errors', errors.join(' | ').slice(0, 160));
} catch (e) {
  fail('Flocks workflow', String(e).slice(0, 200));
} finally {
  await browser.close();
}

console.log(`\n==== FLOCKS CLIPBOARD WORKFLOW: ${passed} passed, ${failed} failed ====`);
process.exit(failed ? 1 : 0);
