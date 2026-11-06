// Screenshot the dev template gallery with an empty, partial and complete Brand Kit, and fail
// if any composed design still contains placeholder / dummy copy.
// Usage: node scripts/capture-gallery.mjs <baseUrl>
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
const BASE = process.argv[2] || 'http://localhost:5199';
const OUT = 'suggestions-validation';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
let problems = 0;
for (const kit of ['empty', 'partial', 'full']) {
  const page = await browser.newPage({ viewport: { width: 1320, height: 900 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`${BASE}/templates-gallery.html?kit=${kit}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__galleryDone === true, null, { timeout: 60000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/gallery-${kit}.png`, fullPage: true });
  const issues = await page.evaluate(() => window.__galleryIssues || []);
  problems += issues.length + errs.length;
  console.log(`saved gallery-${kit}.png`, errs.length ? `ERRORS: ${errs.join(' | ')}` : '(no errors)', `placeholder issues: ${issues.length}`);
  for (const i of issues) console.log('   ', i);
  await page.close();
}
await browser.close();
process.exit(problems ? 1 : 0);
