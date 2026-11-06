// AUTHENTICATED end-to-end test of the full Create workflow in a real browser, against the
// SANDBOX backend (dev server in staging mode), using a dedicated sandbox test account.
//
//   E2E_EMAIL=... E2E_PASSWORD=... node scripts/e2e-create-workflow.mjs <baseUrl>
//
// Proves (desktop + mobile): write a caption -> 3 automatic designs appear -> AI-improve the
// caption -> discard it and get the ORIGINAL back -> use / remove a design image -> AI image
// failure + success (network-mocked: no OpenAI spend) never touch the caption -> navigate away
// and back, and hard-refresh, without losing the caption, mode, AI draft or attached image.
// Credit safety: the number of real /content/generate-image and /content/edit-image requests that
// leave the browser is asserted to be ZERO; the caller verifies the DB counter afterwards.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:5199';
const EMAIL = process.env.E2E_EMAIL, PASSWORD = process.env.E2E_PASSWORD, SUB = process.env.E2E_SUB;
if (!EMAIL || !PASSWORD) { console.error('Set E2E_EMAIL and E2E_PASSWORD'); process.exit(2); }
const OUT = 'suggestions-validation';
mkdirSync(OUT, { recursive: true });

const ORIGINAL = 'Homeowners insurance rates just dropped. Get a free quote today and see how much you could save on your premium.';
const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

let passed = 0, failed = 0;
const rec = (ok, vp, name, d = '') => { ok ? passed++ : failed++; console.log(`${ok ? 'PASS' : 'FAIL'} [${vp}] ${name}${d ? ' — ' + d : ''}`); };

async function run(vp, viewport) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  // serviceWorkers:'block' is ESSENTIAL: the app registers a service worker, and requests made by a
  // service worker BYPASS page.route() - without this the 'mocked' AI-image calls reach the real API
  // and spend real credits.
  const ctx = await browser.newContext({ viewport, serviceWorkers: 'block' });
  // Treat the account as a RETURNING user who already answered the one-time CRM question (the app's own seen-flag).
  if (SUB) await ctx.addInitScript((sub) => { try { localStorage.setItem('hawkeye_edition_onboarded_' + sub, 'true'); } catch {} }, SUB);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  // A brand-new account sees a one-time modal ("One quick question: do you use a CRM?") that can
  // appear at any moment and blocks the page. Dismiss it whenever it shows, as a user would, with
  // the least-committal answer ("I'll decide later").
  let crmPromptsDismissed = 0;
  await page.addLocatorHandler(page.getByText("I'll decide later"), async (l) => { crmPromptsDismissed++; await l.click(); });
  // HARD GUARD: a response that carries an API Gateway request id came from the REAL backend. If that
  // ever happens for an image endpoint, the mock failed to intercept: stop immediately.
  let realImageCalls = 0;
  page.on('response', (r) => {
    if (/\/content\/(generate-image|edit-image)$/.test(new URL(r.url()).pathname) && (r.headers()['apigw-requestid'] || r.headers()['x-amzn-requestid'])) {
      realImageCalls++; console.error('!!! REAL image request reached the backend - aborting test run'); process.exit(3);
    }
  });
  const api = []; // every request that goes to the API
  page.on('request', (r) => { if (r.url().includes('execute-api')) api.push(`${r.method()} ${new URL(r.url()).pathname}`); });
  const count = (re) => api.filter((a) => re.test(a)).length;
  const check = (name, ok, d) => rec(!!ok, vp, name, d);

  const composer = () => page.locator('textarea[placeholder^="Write your post"]');
  const composerText = async () => (await composer().inputValue().catch(() => null));
  const attachedChip = () => page.getByText('Photo attached', { exact: true });
  const spaNavigate = async (path) => {
    await page.evaluate((p) => { window.history.pushState({}, '', p); window.dispatchEvent(new PopStateEvent('popstate')); }, path);
    await page.waitForTimeout(700);
  };
  const waitComposer = async () => { await page.getByText('Create a Post').first().waitFor({ timeout: 30000 }); };
  // First-run interstitials a brand-new account sees (CRM question, setup guide). Dismissed the
  // way a real user would: the least-committal choice, never a data-changing one.
  const dismissOverlays = async () => {
    const later = page.getByText("I'll decide later");
    if (await later.isVisible({ timeout: 9000 }).catch(() => false)) { await later.click().catch(() => {}); await later.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {}); }
    for (const name of [/^skip/i, /^got it/i, /^maybe later/i, /^dismiss/i]) {
      const b = page.getByRole('button', { name }).first();
      if (await b.isVisible({ timeout: 300 }).catch(() => false)) await b.click().catch(() => {});
    }
  };
  const useFirstDesign = async () => {
    await page.getByRole('button', { name: /Use This Design/i }).first().click();
    await page.locator('[data-testid=studio-stage]').waitFor({ timeout: 30000 });
    await page.getByRole('button', { name: /Use in Post/ }).click();
    await page.locator('[data-testid=studio-stage]').waitFor({ state: 'detached', timeout: 15000 });
  };

  try {
    // ── 1. Sign in through the REAL login form ─────────────────────────────
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.fill('input[type=email]', EMAIL);
    await page.fill('input[type=password]', PASSWORD);
    await page.click('button[type=submit]');
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 40000 });
    check('signs in with the dedicated test account (real Cognito login)', true, new URL(page.url()).pathname);

    await page.goto(`${BASE}/create`, { waitUntil: 'domcontentloaded' });
    await dismissOverlays();
    await waitComposer();
    await dismissOverlays();
    check('Create page loads for the signed-in user', true);

    // ── 2. Write a caption -> 3 designs appear automatically ──────────────
    await page.locator('button').filter({ hasText: /Write$/ }).first().click();
    await composer().fill(ORIGINAL);
    await page.locator('[data-testid=design-suggestions]').waitFor({ timeout: 20000 });
    await page.waitForFunction(() => document.querySelectorAll('[data-testid=design-preview]').length === 3, null, { timeout: 20000 });
    check('3 designs appear automatically beneath the post (no extra click)', true);
    check('the original caption stays visible and unchanged', (await composerText()) === ORIGINAL);
    await page.waitForTimeout(2200);
    await page.screenshot({ path: `${OUT}/e2e-${vp}-1-templates.png`, fullPage: true });

    // ── 3. AI-improve the caption, then return to the ORIGINAL writing ─────
    await page.getByRole('button', { name: /Improve with AI/ }).click();
    await page.getByText('Generated Content — Per Platform').waitFor({ timeout: 60000 });
    check('AI draft is generated (real /content/generate on the sandbox)', count(/POST \/content\/generate$/) >= 1);
    const discard = page.locator('[data-testid=discard-ai-draft]');
    check('a "Discard AI draft · restore my writing" control is offered', await discard.isVisible());
    const aiValues = await page.$$eval('textarea', (els) => els.map((e) => e.value));
    check('the AI result is a different text from the original', aiValues.some((v) => v && v !== ORIGINAL), `${aiValues.length} textareas`);
    await page.screenshot({ path: `${OUT}/e2e-${vp}-2-ai-draft.png`, fullPage: true });
    await discard.click();
    await page.getByText('Generated Content — Per Platform').waitFor({ state: 'detached', timeout: 10000 });
    check('discarding the AI draft restores EXACTLY the original writing', (await composerText()) === ORIGINAL);
    await page.screenshot({ path: `${OUT}/e2e-${vp}-3-restored.png`, fullPage: true });

    // ── 4. Select, remove and re-select an image (automatic designs are free) ─
    await page.locator('[data-testid=design-suggestions]').waitFor({ timeout: 15000 });
    await useFirstDesign();
    await attachedChip().waitFor({ timeout: 10000 });
    check('Use This Design attaches the finished design to the post', true);
    check('the caption is untouched by attaching a design', (await composerText()) === ORIGINAL);
    await page.screenshot({ path: `${OUT}/e2e-${vp}-4-attached.png`, fullPage: true });
    await attachedChip().locator('xpath=..').getByRole('button', { name: 'Remove' }).click();
    await attachedChip().waitFor({ state: 'detached', timeout: 5000 });
    check('Remove takes the image off without touching the caption', (await composerText()) === ORIGINAL);

    // Studio "Back to Post" without using the design: nothing attached, caption intact.
    await page.getByRole('button', { name: /^Customize$/ }).first().click();
    await page.locator('[data-testid=studio-stage]').waitFor({ timeout: 30000 });
    await page.locator('[data-testid=studio-back]').click();
    await page.locator('[data-testid=studio-stage]').waitFor({ state: 'detached', timeout: 10000 });
    check('Back to Post leaves the post exactly as it was (no image, caption intact)', (await attachedChip().count()) === 0 && (await composerText()) === ORIGINAL);

    // "Personalize with your Brand Kit" opens the studio straight on the Brand panel.
    await page.getByTestId('personalize-brand').click();
    await page.locator('[data-testid=studio-stage]').waitFor({ timeout: 30000 });
    check('"Personalize with your Brand Kit" opens the studio on the Brand Kit panel', await page.locator('#bk-companyName').isVisible({ timeout: 5000 }).catch(() => false));
    await page.locator('[data-testid=studio-back]').click();
    await page.locator('[data-testid=studio-stage]').waitFor({ state: 'detached', timeout: 10000 });
    check('…and Back to Post leaves the caption untouched', (await composerText()) === ORIGINAL && (await attachedChip().count()) === 0);

    // ── 5. Paid AI images: a confirmation with cost + balance in front of EVERY entry point ─
    // All paid endpoints are mocked in the browser (no OpenAI spend). The balance endpoint is
    // mocked too (it is a new read-only route not yet deployed to the sandbox). Every mock answers
    // the CORS preflight and carries CORS headers, exactly like the real API.
    const cors = { 'access-control-allow-origin': new URL(BASE).origin, 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
    const hits = { gen: 0, edit: 0, credits: 0 };
    let genMode = 'fail';
    await page.route('**/content/image-credits', (route) => route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 204, headers: cors })
      : (hits.credits++, route.fulfill({ status: 200, headers: cors, contentType: 'application/json',
          body: JSON.stringify({ tier: 'soar', month: '2026-11', costPerImage: 1, limit: 40, used: 9, remaining: 31 }) })));
    await page.route('**/content/generate-image', (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      hits.gen++;
      return genMode === 'fail' ? route.abort()
        : route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ dataUrl: TINY_PNG }) });
    });
    await page.route('**/content/edit-image', (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      hits.edit++;
      return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ dataUrl: TINY_PNG }) });
    });
    const dialog = () => page.locator('[data-testid=ai-confirm]');
    const openConfirm = async (btn) => {
      await btn.click();
      await dialog().waitFor({ timeout: 10000 });
      await page.getByTestId('ai-confirm-remaining').filter({ hasText: /of/ }).waitFor({ timeout: 10000 });
    };

    // 5a. Composer button → dialog with exact cost + balance → Cancel: no request at all.
    await openConfirm(page.getByTestId('composer-ai-image'));
    check('composer AI button: confirmation shows the exact cost', (await page.getByTestId('ai-confirm-cost').innerText()) === '1 AI image credit');
    check('composer AI button: confirmation shows the remaining balance', (await page.getByTestId('ai-confirm-remaining').innerText()) === '31 of 40');
    await page.screenshot({ path: `${OUT}/e2e-${vp}-6-ai-confirm.png`, fullPage: false });
    await page.getByTestId('ai-confirm-cancel').click();
    await dialog().waitFor({ state: 'detached', timeout: 5000 });
    await page.waitForTimeout(400);
    check('composer AI button: Cancel sends NO generation request', hits.gen === 0, `generate-image requests: ${hits.gen}`);

    // 5b. Suggestions-strip AI link → same dialog → Cancel: no request.
    await openConfirm(page.getByTestId('suggestions-ai-image'));
    await page.getByTestId('ai-confirm-cancel').click();
    await dialog().waitFor({ state: 'detached', timeout: 5000 });
    await page.waitForTimeout(400);
    check('designs-strip AI link: Cancel sends NO generation request', hits.gen === 0, `generate-image requests: ${hits.gen}`);
    check('cancelling leaves the caption untouched and attaches nothing', (await composerText()) === ORIGINAL && (await attachedChip().count()) === 0);

    // 5c. Confirmed, but the generation FAILS: caption untouched, nothing attached.
    await openConfirm(page.getByTestId('composer-ai-image'));
    await page.getByTestId('ai-confirm-generate').click();
    await page.waitForTimeout(1500);
    check('Generate sends exactly one request only after confirmation', hits.gen === 1, `generate-image requests: ${hits.gen}`);
    check('a FAILED AI image leaves the caption untouched and attaches nothing', (await composerText()) === ORIGINAL && (await attachedChip().count()) === 0);

    // 5d. Confirmed from the strip and SUCCEEDS: attaches without touching the caption.
    genMode = 'ok';
    await openConfirm(page.getByTestId('suggestions-ai-image'));
    await page.getByTestId('ai-confirm-generate').click();
    await attachedChip().waitFor({ timeout: 10000 });
    check('a successful AI image attaches without touching the caption', (await composerText()) === ORIGINAL && hits.gen === 2);
    await attachedChip().locator('xpath=..').getByRole('button', { name: 'Remove' }).click();
    check('the AI image can be removed without restarting', (await attachedChip().count()) === 0 && (await composerText()) === ORIGINAL);

    // 5e. AI PHOTO EDIT in the studio (third paid path): confirmation first; Cancel = no request.
    const png = Buffer.from(TINY_PNG.split(',')[1], 'base64');
    await page.locator('[aria-label="Ready-to-use designs for your post"] input[type=file]').setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: png });
    await page.locator('[data-testid=studio-stage]').waitFor({ timeout: 30000 });
    await page.locator('#wingman-edit').fill('Remove the trash cans');
    await page.getByRole('button', { name: /Ask Wingman/ }).click();
    await dialog().waitFor({ timeout: 10000 });
    check('studio AI photo edit: the same confirmation appears above the studio', await page.getByTestId('ai-confirm-generate').isVisible());
    await page.getByTestId('ai-confirm-cancel').click();
    await page.getByText('Cancelled. No AI credit was used.').waitFor({ timeout: 5000 });
    check('studio AI photo edit: Cancel sends NO edit request', hits.edit === 0, `edit-image requests: ${hits.edit}`);
    await page.getByRole('button', { name: /Ask Wingman/ }).click();
    await dialog().waitFor({ timeout: 10000 });
    await page.getByTestId('ai-confirm-generate').click();
    await page.getByText(/Done! Your original is saved/).waitFor({ timeout: 15000 });
    check('studio AI photo edit: Generate sends exactly one edit request', hits.edit === 1, `edit-image requests: ${hits.edit}`);
    await page.locator('[data-testid=studio-back]').click();
    await page.locator('[data-testid=studio-stage]').waitFor({ state: 'detached', timeout: 10000 });
    check('after the studio photo edit, Back to Post: caption intact', (await composerText()) === ORIGINAL);
    // Opening the studio from an uploaded photo hides the designs strip (existing behavior);
    // touching the caption brings it back, exactly as for a user.
    await composer().fill(ORIGINAL + ' ');
    await composer().fill(ORIGINAL);
    await page.locator('[data-testid=design-suggestions]').waitFor({ timeout: 15000 });
    check('the balance was read from the server for every confirmation', hits.credits >= 5, `${hits.credits} balance reads`);
    await page.unroute('**/content/generate-image');
    await page.unroute('**/content/edit-image');
    await page.unroute('**/content/image-credits');

    // ── 6. Navigate away and back (SPA), then HARD REFRESH ───────────────
    await useFirstDesign();
    await attachedChip().waitFor({ timeout: 10000 });
    await spaNavigate('/dashboard');
    await spaNavigate('/create');
    await waitComposer();
    check('after navigating away and back: caption preserved', (await composerText()) === ORIGINAL);
    check('after navigating away and back: attached design preserved', (await attachedChip().count()) === 1);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await dismissOverlays();
    await waitComposer();
    check('after a hard refresh: still in Write mode with the caption intact', (await composerText()) === ORIGINAL);
    check('after a hard refresh: attached design preserved', (await attachedChip().count()) === 1);
    await page.screenshot({ path: `${OUT}/e2e-${vp}-5-after-refresh.png`, fullPage: true });

    // ── 7. AI draft survives a refresh, and can STILL be discarded afterwards ─
    await page.getByRole('button', { name: /Improve with AI/ }).click();
    await page.getByText('Generated Content — Per Platform').waitFor({ timeout: 60000 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await dismissOverlays();
    await waitComposer();
    check('the AI draft survives a hard refresh', await page.getByText('Generated Content — Per Platform').isVisible());
    await page.locator('[data-testid=discard-ai-draft]').click();
    check('after refresh, discarding still restores the original writing', (await composerText()) === ORIGINAL);

    // ── 8. Credit safety + health ──────────────────────────────────────────
    check('ZERO real AI image requests (generate-image/edit-image) reached the server', realImageCalls === 0, `real=${realImageCalls} mocked=${count(/\/content\/(generate-image|edit-image)$/)}`);
    check('automatic designs made no image/AI calls: only /content/generate (text) was used', count(/POST \/content\/generate$/) === 2, `${count(/POST \/content\/generate$/)} text calls`);
    check('no runtime errors in the browser', errors.length === 0, errors.join(' | ').slice(0, 160));
  } catch (e) {
    rec(false, vp, 'workflow aborted', String(e).slice(0, 300));
    await page.screenshot({ path: `${OUT}/e2e-${vp}-FAILURE.png`, fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
  }
}

await run('desktop', { width: 1366, height: 900 });
await run('mobile', { width: 390, height: 844 });
console.log(`\n==== AUTHENTICATED CREATE WORKFLOW: ${passed} passed, ${failed} failed ====`);
process.exit(failed ? 1 : 0);
