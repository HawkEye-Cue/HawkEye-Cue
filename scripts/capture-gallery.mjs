// Screenshot the dev template gallery (plain and with a custom Brand Kit) for visual review.
// Usage: node scripts/capture-gallery.mjs <baseUrl>
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
const BASE = process.argv[2] || 'http://localhost:5199';
const OUT = 'suggestions-validation';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
for (const [name, q] of [['gallery-plain', ''], ['gallery-branded', '?brand=1']]) {
  const page = await browser.newPage({ viewport: { width: 1320, height: 900 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`${BASE}/templates-gallery.html${q}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__galleryDone === true, null, { timeout: 60000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log(`saved ${name}.png`, errs.length ? `ERRORS: ${errs.join(' | ')}` : '(no errors)');
  await page.close();
}
await browser.close();
