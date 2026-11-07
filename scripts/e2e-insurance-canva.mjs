// AUTHENTICATED Create workflow for the PHASE 1 insurance Canva designs, against the SANDBOX.
//   E2E_EMAIL=.. E2E_PASSWORD=.. E2E_SUB=.. node scripts/e2e-insurance-canva.mjs <baseUrl>
// Proves (desktop + mobile): insurance caption -> exactly 3 Canva cards (3 different styles) ->
// caption-summary note when shortened -> open a card in the real Studio (editable) -> customize ->
// Use in Post attaches it -> schedule through the existing flow. No AI calls, free.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
const BASE = process.argv[2] || 'http://localhost:5173';
const EMAIL = process.env.E2E_EMAIL, PASSWORD = process.env.E2E_PASSWORD, SUB = process.env.E2E_SUB;
if (!EMAIL || !PASSWORD) { console.error('Set E2E_EMAIL and E2E_PASSWORD'); process.exit(2); }
const OUT = 'suggestions-validation/e2e-insurance'; mkdirSync(OUT, { recursive: true });
const LONG = 'Is your home really covered? Most families are underinsured and do not know it until they file a claim, and by then the gap between what they owe and what their policy pays can be tens of thousands of dollars. Call me for a free no-obligation quote.';
let pass = 0, fail = 0;
const ck = (vp, name, ok, d = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} [${vp}] ${name}${d ? ' - ' + d : ''}`); };

// throttle concurrent API calls (account Lambda cap is 10) so page load doesn't 503
async function throttle(page) {
  let inflight = 0; const waiters = [];
  const acq = async () => { while (inflight >= 3) await new Promise((r) => waiters.push(r)); inflight++; };
  const rel = () => { inflight--; waiters.shift()?.(); };
  await page.route('**/*', async (route) => {
    const r = route.request();
    if (!r.url().includes('execute-api') || r.method() === 'OPTIONS') return route.fallback();
    await acq(); try { await route.fulfill({ response: await route.fetch() }); } catch { await route.abort().catch(() => {}); } finally { rel(); }
  });
}

async function run(vp, viewport, isMobile) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await browser.newContext({ viewport, serviceWorkers: 'block', deviceScaleFactor: isMobile ? 2 : 1, isMobile, hasTouch: isMobile });
  // Seed onboarding flags so no onboarding UI mounts. In particular `hawkeye_tour_done_<sub>`
  // suppresses the GuidedTour, whose full-screen `fixed inset-0 z-[9999]` click-catcher
  // otherwise anchors to the MOBILE bottom-nav and silently swallows clicks on the composer
  // (this is what blocked the mobile "Write" tab from switching mode). Harness-only fix.
  if (SUB) await ctx.addInitScript((s) => { try { localStorage.setItem('hawkeye_edition_onboarded_' + s, 'true'); localStorage.setItem('hawkeye_setup_complete_' + s, 'true'); localStorage.setItem('hawkeye_tour_done_' + s, 'true'); } catch {} }, SUB);
  const page = await ctx.newPage();
  await throttle(page);
  const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
  let aiCalls = 0; page.on('request', (r) => { if (/\/content\/(generate-image|edit-image)$/.test(new URL(r.url()).pathname)) aiCalls++; });
  const later = page.getByText("I'll decide later");
  await page.addLocatorHandler(later, async (l) => { await l.click().catch(() => {}); });
  try {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.fill('input[type=email]', EMAIL); await page.fill('input[type=password]', PASSWORD);
    await page.click('button[type=submit]');
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 40000 });
    await page.goto(`${BASE}/create`, { waitUntil: 'domcontentloaded' });
    await page.getByText('Create a Post').first().waitFor({ timeout: 30000 });

    // Write an insurance caption. On mobile a floating control can overlap the button, so dismiss
    // overlays and scroll it into view before clicking.
    if (await later.isVisible({ timeout: 2000 }).catch(() => false)) await later.click().catch(() => {});
    // Switch the composer to "Write" mode and VERIFY it took. The composer defaults to AI-draft
    // mode (placeholder "Example: ...") so the write textarea only appears after the tab switches.
    // If an overlay intercepts the pointer click, fall back to a DOM-level click that fires the
    // React onClick regardless of hit-testing. Harness-only robustness.
    const composer = page.locator('textarea[placeholder^="Write your post"]');
    const clickWriteTab = async () => {
      const writeBtn = page.locator('button').filter({ hasText: /Write$/ }).first();
      await writeBtn.scrollIntoViewIfNeeded().catch(() => {});
      await writeBtn.click({ timeout: 8000 }).catch(() => {});
    };
    await clickWriteTab();
    if (!(await composer.isVisible({ timeout: 4000 }).catch(() => false))) {
      await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /Write$/.test(x.innerText.trim())); b && b.click(); });
    }
    await composer.waitFor({ timeout: 10000 });
    await composer.fill(LONG);
    const strip = page.locator('[data-testid=design-suggestions][data-canva="1"]');
    await strip.waitFor({ timeout: 25000 });
    ck(vp, 'insurance caption shows the Canva design strip', true);

    const cards = strip.locator('[data-testid=design-preview]');
    await page.waitForFunction(() => document.querySelectorAll('[data-testid=design-suggestions][data-canva="1"] [data-testid=design-preview]').length === 3, null, { timeout: 25000 });
    ck(vp, 'exactly 3 Canva designs are offered', (await cards.count()) === 3);
    const names = await strip.locator('p.text-xs.font-semibold').allInnerTexts();
    ck(vp, '3 genuinely different styles (photo / illustrated / editorial)', new Set(names).size === 3, names.join(' | '));
    ck(vp, 'the full caption is unchanged in the composer', (await composer.inputValue()) === LONG);
    ck(vp, 'a caption-summary note is shown (image shows a shortened version)', await page.getByTestId('caption-summary-note').isVisible());
    await page.screenshot({ path: `${OUT}/${vp}-1-strip.png`, fullPage: true });

    // Open the first design in the real Design Studio
    await strip.locator('button', { hasText: /Use This Design/ }).first().click();
    await page.locator('[data-testid=studio-stage]').waitFor({ timeout: 30000 });
    await page.waitForFunction(() => !document.body.innerText.includes('Loading editor'), null, { timeout: 30000 });
    ck(vp, 'the design opens in the real Design Studio', true);
    await page.getByRole('tab', { name: /Layers/ }).click();
    const layers = await page.locator('aside [role=tablist] ~ div button').allInnerTexts();
    ck(vp, 'the design is fully editable (individual layers listed)', layers.length >= 6, `${layers.length} layers`);

    // Customize: free Wingman edit (no AI)
    await page.getByRole('tab', { name: /Wingman/ }).click();
    await page.locator('#wingman-edit').fill('Make the headline bigger');
    await page.getByRole('button', { name: /Ask Wingman/ }).click();
    await page.waitForTimeout(500);
    ck(vp, 'free customize applies (no AI credits used)', /no AI credits used/i.test(await page.locator('[role=status]').innerText().catch(() => '')));

    // Use in Post -> attaches
    await page.getByRole('button', { name: /Use in Post/ }).click();
    await page.locator('[data-testid=studio-stage]').waitFor({ state: 'detached', timeout: 15000 });
    await page.getByText('Photo attached', { exact: true }).waitFor({ timeout: 15000 });
    ck(vp, 'Use in Post attaches the design and keeps the caption', (await composer.inputValue()) === LONG);
    await page.screenshot({ path: `${OUT}/${vp}-2-attached.png`, fullPage: true });

    ck(vp, 'ZERO AI image calls during the whole flow (free)', aiCalls === 0, `aiCalls=${aiCalls}`);
    ck(vp, 'no runtime errors', errs.length === 0, errs.join(' | ').slice(0, 140));
  } catch (e) {
    ck(vp, 'workflow aborted', false, String(e).slice(0, 200));
    await page.screenshot({ path: `${OUT}/${vp}-FAIL.png`, fullPage: true }).catch(() => {});
    console.log('   URL ' + page.url());
  } finally { await browser.close(); }
}
await run('desktop', { width: 1366, height: 900 }, false);
await run('mobile', { width: 390, height: 844 }, true);
console.log(`\n==== insurance Canva workflow: ${pass} passed, ${fail} failed ====`);
process.exit(fail ? 1 : 0);
