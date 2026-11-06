// Mass Flock validation against the REAL component via the dev harness (no production edits).
// Usage: node scripts/validate-massflock.mjs <baseUrl>
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
const BASE = process.argv[2] || 'http://localhost:5199';
const OUT = 'suggestions-validation';
mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
for (const [vp, size] of [['desktop', { width: 1280, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport: size, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  const T = (n) => `[${vp}] ${n}`;
  const sess = () => page.evaluate(() => JSON.parse(localStorage.getItem('hawkeye_massflock_session_default') || 'null'));
  const cur = () => page.evaluate(() => document.body.innerText);
  const shot = (n) => page.screenshot({ path: `${OUT}/massflock-${vp}-${n}.png`, fullPage: true });
  await page.goto(`${BASE}/massflock-harness.html`, { waitUntil: 'networkidle' });
  await page.getByTestId('mf-copy-open').waitFor({ timeout: 15000 });
  await shot('1-start');
  let s = await sess();
  check(T('starts on first group with 5 selected, nothing opened/posted'), s.selectedIds.length === 5 && s.openedIds.length === 0 && s.postedIds.length === 0 && s.currentIndex === 0);
  const autoOn = await page.evaluate(() => localStorage.getItem('hawkeye_massflock_autoadvance_default'));
  const toggle = page.getByTestId('mf-autoadvance');
  const checked = await toggle.evaluate((el) => (el.type === 'checkbox' ? el.checked : el.getAttribute('aria-checked') === 'true'));
  check(T('auto-advance is OFF by default'), autoOn !== '1' && !checked, `stored=${autoOn}`);

  // Copy & Open
  await page.getByTestId('mf-copy-open').click();
  await page.waitForTimeout(500);
  s = await sess();
  const opens = await page.evaluate(() => window.__opens);
  const clip = await page.evaluate(() => window.__clip);
  check(T('Copy & Open opens the group link and copies the post'), opens.length === 1 && /test-1$/.test(opens[0]) && clip.length === 1 && /roof inspection/.test(clip[0]));
  check(T('Copy & Open marks it OPENED, never posted'), s.openedIds.includes('g1') && s.postedIds.length === 0, JSON.stringify({ o: s.openedIds, p: s.postedIds }));
  check(T('Copy & Open does not advance (auto-advance off)'), (await cur()).includes('Austin Homeowners') && s.advancedIds.length === 0);
  await shot('2-opened');

  // Next Group
  await page.getByTestId('mf-next').click();
  await page.waitForTimeout(400);
  s = await sess();
  check(T('Next Group advances to group 2 (g1 recorded as advanced, name shown)'), s.advancedIds.includes('g1') && (await cur()).includes('Roofing Pros Network'));
  check(T('Next Group does NOT mark posted'), s.postedIds.length === 0, `posted=${s.postedIds.length}`);
  await shot('3-next');

  // Skip
  await page.getByTestId('mf-skip').click();
  await page.waitForTimeout(400);
  s = await sess();
  check(T('Skip advances to group 3 and records skipped, not posted'), (await cur()).includes('Local Moms of Round Rock') && s.skippedIds.includes('g2') && s.postedIds.length === 0);

  // Advance without opening, still not posted
  await page.getByTestId('mf-next').click();
  await page.waitForTimeout(300);
  s = await sess();
  check(T('Next Group on an unopened group still never marks posted'), (await cur()).includes('Texas Contractors Hub') && s.advancedIds.includes('g3') && s.postedIds.length === 0);

  // Refresh persistence
  const before = await sess();
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByTestId('mf-copy-open').waitFor({ timeout: 15000 });
  const after = await sess();
  check(T('progress survives a hard refresh (same index/opened/skipped/posted)'),
    JSON.stringify(after.advancedIds) === JSON.stringify(before.advancedIds) && JSON.stringify(after.openedIds) === JSON.stringify(before.openedIds) && JSON.stringify(after.skippedIds) === JSON.stringify(before.skippedIds) && after.postedIds.length === 0);
  const txt = await cur();
  check(T('UI shows the same remaining/opened/skipped counts after refresh'), /remaining/.test(txt) && /1 opened/.test(txt) && /1 skipped/.test(txt), (txt.match(/\d+ of \d+ remaining[^\n]*/) || [''])[0]);
  await shot('4-after-refresh');

  // Optional Confirm Posted
  await page.getByTestId('mf-copy-open').click();
  await page.waitForTimeout(400);
  const confirm = page.getByTestId('mf-confirm');
  if (await confirm.count()) {
    await confirm.first().click();
    await page.waitForTimeout(500);
    s = await sess();
    const needsAck = !s.postedIds.includes('g4');
    if (needsAck) {
      // Safety gate may require an explicit acknowledgement; report, don't bypass silently.
      console.log(T('INFO Confirm Posted held by safety gate:'), (await cur()).split('\n').filter((l) => /anyway|review|rule/i.test(l)).slice(0, 3).join(' | '));
    }
    check(T('Confirm Posted marks ONLY the confirmed group posted'), s.postedIds.length === 1 && s.postedIds[0] === 'g4', JSON.stringify(s.postedIds));
  } else check(T('Confirm Posted control present'), false);
  await shot('5-confirmed');
  const final = await sess();
  check(T('posted count equals explicit confirmations only (1) despite 3 opens/advances'), final.postedIds.length === 1);
  check(T('no runtime errors'), errs.length === 0, errs.join(' | '));
  await ctx.close();
}
await browser.close();
console.log(`==== MASS FLOCK: ${pass} passed, ${fail} failed ====`);
process.exit(fail ? 1 : 0);
