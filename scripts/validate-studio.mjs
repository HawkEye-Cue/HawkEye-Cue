// Real-browser validation of the Design Studio (Phase 1 + Phase 2), desktop AND mobile.
//
// Drives the installed Google Chrome (playwright-core, channel 'chrome') against the dev-only
// harness (apps/web/studio-harness.html), which mounts the REAL DesignStudio component. The
// AI photo edit is mocked in the harness so no OpenAI credits are spent; the real endpoint is
// covered by content-image.test.ts.
//
// It inspects the actual Fabric canvas object state — not just the DOM — to verify edits truly
// happened. Usage:  node scripts/validate-studio.mjs <baseUrl>

import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:5199';
const OUT = 'studio-validation';
mkdirSync(OUT, { recursive: true });

// A real photo-like PNG (gradient "house") generated in-page so the test needs no fixtures.
const MAKE_PHOTO = `(() => { const c=document.createElement('canvas'); c.width=1200; c.height=900;
  const g=c.getContext('2d'); const gr=g.createLinearGradient(0,0,0,900); gr.addColorStop(0,'#87ceeb'); gr.addColorStop(1,'#3a7d44');
  g.fillStyle=gr; g.fillRect(0,0,1200,900); g.fillStyle='#8b4513'; g.fillRect(400,350,400,350);
  g.fillStyle='#b22222'; g.beginPath(); g.moveTo(370,360); g.lineTo(600,200); g.lineTo(830,360); g.fill();
  return c.toDataURL('image/png'); })()`;

const results = [];
const pass = (vp, name, d = '') => { results.push({ vp, name, ok: true, d }); console.log(`PASS [${vp}] ${name}${d ? ' — ' + d : ''}`); };
const fail = (vp, name, d = '') => { results.push({ vp, name, ok: false, d }); console.log(`FAIL [${vp}] ${name}${d ? ' — ' + d : ''}`); };
const check = (vp, name, cond, d = '') => (cond ? pass(vp, name, d) : fail(vp, name, d));

// Sample a pixel of the on-screen canvas at a LOGICAL (1080-grid) coordinate.
async function sampleCanvas(page, lx, ly) {
  return page.evaluate(([x, y]) => {
    const lower = document.querySelector('canvas.lower-canvas');
    const f = lower.width / 1080; // logical → backing-store pixels (includes zoom + DPR)
    const d = lower.getContext('2d').getImageData(Math.round(x * f), Math.round(y * f), 1, 1).data;
    return [d[0], d[1], d[2]];
  }, [lx, ly]);
}
// Sample a pixel of an exported image data URL at full-resolution coordinates.
async function sampleImage(page, url, x, y) {
  return page.evaluate(([u, px, py]) => new Promise((r) => {
    const i = new Image();
    i.onload = () => { const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight;
      const g = c.getContext('2d'); g.drawImage(i, 0, 0); const d = g.getImageData(px, py, 1, 1).data; r([d[0], d[1], d[2]]); };
    i.src = u;
  }), [url, x, y]);
}
const NAVY = [15, 23, 42]; // roof-storm-1 template background (#0f172a)
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
// A clear spot on roof-storm-1 with no text/shape over it (bottom-right corner).
const PROBE = [1050, 1050];

async function stageContainment(page) {
  return page.evaluate(() => {
    const s = document.querySelector('[data-testid=studio-stage]').getBoundingClientRect();
    const c = document.querySelector('.canvas-container').getBoundingClientRect();
    const t = document.querySelector('[data-testid=studio-toolbar]').getBoundingClientRect();
    // Canvas must be inside the stage AND fully below a visible, un-scrolled toolbar AND on screen.
    const toolbarOk = t.top >= -1;
    const belowToolbar = c.top >= t.bottom - 1;
    const onScreen = c.bottom <= window.innerHeight + 1;
    return { inside: toolbarOk && belowToolbar && onScreen && c.top >= s.top - 1 && c.bottom <= s.bottom + 1 && c.left >= s.left - 1 && c.right <= s.right + 1,
      stage: [Math.round(s.top), Math.round(s.bottom)], canvas: [Math.round(c.top), Math.round(c.bottom)] };
  });
}

async function getCanvasInfo(page) {
  return page.evaluate(() => {
    // Locate the Fabric instance: DesignStudio stores it on the wrapper's lower canvas element.
    const lower = document.querySelector('canvas.lower-canvas');
    const wrapper = lower?.parentElement;
    const rect = wrapper?.getBoundingClientRect();
    return {
      hasFabric: !!document.querySelector('.canvas-container'),
      wrapperW: rect ? Math.round(rect.width) : 0,
      wrapperH: rect ? Math.round(rect.height) : 0,
      lowerW: lower ? lower.width : 0,
      vw: window.innerWidth,
    };
  });
}

async function run(vpName, viewport, isMobile) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: isMobile ? 2 : 1, isMobile, hasTouch: isMobile });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
  // Record failing requests WITH their URL (the console message omits it).
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`); });

  await page.goto(`${BASE}/studio-harness.html?template=roof-storm-1`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.canvas-container', { timeout: 20000 });
  await page.waitForFunction(() => !document.body.innerText.includes('Loading editor'), null, { timeout: 20000 });
  await page.screenshot({ path: `${OUT}/${vpName}-1-loaded.png` });

  // ── 1. Canvas renders and FITS the viewport (Phase 1 defect 1: scaling) ──
  const info = await getCanvasInfo(page);
  check(vpName, 'canvas renders (Fabric container present)', info.hasFabric);
  check(vpName, 'canvas fits within the viewport (no overflow)', info.wrapperW > 0 && info.wrapperW <= info.vw, `displayed ${info.wrapperW}px in ${info.vw}px viewport`);
  const contain = await stageContainment(page);
  check(vpName, 'canvas is fully visible inside the stage (not clipped top/bottom)', contain.inside, `stage y ${contain.stage} canvas y ${contain.canvas}`);

  // ── 2. Click lands on the correct object (scaling coordinate correctness) ──
  // Observable behavior: click the headline at its zoom-mapped position, then "Delete selected".
  // The headline layer disappears ONLY if the click hit it — proving coordinates map correctly.
  // Template headline: left 80, top 280 on the 1080 grid. Then undo so later steps are unaffected.
  const layerNames = async () => {
    await page.getByRole('tab', { name: /Layers/ }).click();
    const names = await page.locator('aside [role=tablist] ~ div button').allInnerTexts();
    await page.getByRole('tab', { name: /Wingman/ }).click();
    return names;
  };
  const beforeLayers = await layerNames();
  const box = await page.locator('canvas.upper-canvas').boundingBox();
  const zoom = box.width / 1080;
  await page.mouse.click(box.x + (80 + 200) * zoom, box.y + (280 + 50) * zoom);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${vpName}-2-selected.png` });
  await page.getByRole('button', { name: /Delete selected/ }).click();
  await page.waitForTimeout(300);
  const afterLayers = await layerNames();
  const headlineBefore = beforeLayers.some((n) => n.includes('FREE ROOF'));
  const headlineAfter = afterLayers.some((n) => n.includes('FREE ROOF'));
  check(vpName, 'clicking the headline selects THAT layer (zoom coordinates map correctly)',
    headlineBefore && !headlineAfter && afterLayers.length === beforeLayers.length - 1,
    `layers ${beforeLayers.length}→${afterLayers.length}, headline removed=${headlineBefore && !headlineAfter}`);
  // Restore the headline for the remaining steps.
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.waitForTimeout(400);
  const restoredLayers = await layerNames();
  check(vpName, 'canvas Undo restores a deleted layer', restoredLayers.some((n) => n.includes('FREE ROOF')));

  // ── 3. Wingman CANVAS edit: "Make the headline bigger" — instant, no AI call ──
  await page.locator('#wingman-edit').fill('Make the headline bigger');
  await page.getByRole('button', { name: /Ask Wingman/ }).click();
  await page.waitForTimeout(400);
  const canvasMsg = await page.locator('[role=status]').innerText().catch(() => '');
  const editCallsAfterCanvas = await page.evaluate(() => window.__studio.editCalls.length);
  check(vpName, 'canvas edit applies instantly with "no AI credits used"', /no AI credits used/i.test(canvasMsg), canvasMsg);
  check(vpName, 'canvas edit made ZERO AI photo-edit calls (cost safety)', editCallsAfterCanvas === 0, `editCalls=${editCallsAfterCanvas}`);

  // ── 4. Canvas UNDO restores (Phase 1 defect 2 regression: tags must survive undo) ──
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.waitForTimeout(400);
  // After undo, Apply Brand must still find brand-tagged layers (proves `data` tags survived).
  await page.getByRole('tab', { name: /Brand/ }).click();
  await page.getByRole('button', { name: /Apply My Brand/ }).click();
  await page.waitForTimeout(300);
  const brandMsg = await page.locator('[role=status]').innerText().catch(() => '');
  check(vpName, 'after UNDO, Apply Brand still finds tagged layers (data tags survived undo)', /Applied your brand/i.test(brandMsg), brandMsg);

  // ── 5. Brand fields are functional (Phase 1 defect 4) ──
  await page.locator('#bk-companyName').fill('Summit Roofing LLC');
  const storedKit = await page.evaluate(() => localStorage.getItem('hawkeye_brand_kit_harness-user'));
  check(vpName, 'Brand Kit field edits persist to storage', !!storedKit && storedKit.includes('Summit Roofing LLC'));

  // ── 6. Upload a photo → becomes the ORIGINAL revision ──
  await page.getByRole('tab', { name: /Wingman/ }).click();
  const photo = await page.evaluate(MAKE_PHOTO);
  const buf = Buffer.from(photo.split(',')[1], 'base64');
  await page.locator('input[type=file][accept="image/*"]').setInputFiles({ name: 'house.png', mimeType: 'image/png', buffer: buf });
  await page.waitForFunction(() => document.body.innerText.includes('Photo added'), null, { timeout: 10000 });
  await page.waitForTimeout(300);
  const origPx = await sampleCanvas(page, ...PROBE);
  check(vpName, 'uploaded photo is actually VISIBLE on the canvas (not hidden behind the background)',
    dist(origPx, NAVY) > 40, `probe rgb ${origPx}`);
  await page.screenshot({ path: `${OUT}/${vpName}-3-photo.png` });

  // ── 7. Wingman PHOTO edit: routes to AI, shows result, preserves original ──
  await page.locator('#wingman-edit').fill('Remove the trash cans from this driveway');
  await page.getByRole('button', { name: /Ask Wingman/ }).click();
  await page.waitForFunction(() => document.body.innerText.includes('Your original is saved'), null, { timeout: 15000 });
  const editCalls = await page.evaluate(() => window.__studio.editCalls);
  check(vpName, 'photo edit routes to the AI editor exactly once', editCalls.length === 1, JSON.stringify(editCalls.map((c) => c.instruction)));
  check(vpName, 'the user\'s exact instruction is sent to the AI editor', editCalls[0]?.instruction === 'Remove the trash cans from this driveway');
  check(vpName, 'image is downscaled before sending (under 4MB server cap)', editCalls[0]?.inputBytes < 5.6 * 1024 * 1024, `${Math.round((editCalls[0]?.inputBytes || 0) / 1024)} KB base64`);
  const versionLabel = await page.getByText(/Version 1 of 1/).count();
  check(vpName, 'AI edit recorded as revision "Version 1 of 1"', versionLabel > 0);
  await page.waitForTimeout(300);
  const editedPx = await sampleCanvas(page, ...PROBE);
  check(vpName, 'the AI-EDITED photo is visible and differs from the original',
    dist(editedPx, NAVY) > 40 && dist(editedPx, origPx) > 25, `original ${origPx} → edited ${editedPx}`);
  const contain2 = await stageContainment(page);
  check(vpName, 'canvas stays fully visible after the side panel grows (status + revision controls)', contain2.inside, `stage y ${contain2.stage} canvas y ${contain2.canvas}`);
  await page.screenshot({ path: `${OUT}/${vpName}-4-ai-edited.png` });

  // ── 8. Undo AI edit + Restore original ──
  const undoAi = page.getByRole('button', { name: /Undo AI edit/ });
  check(vpName, '"Undo AI edit" is enabled after an AI edit', await undoAi.isEnabled());
  await undoAi.click();
  await page.waitForTimeout(500);
  check(vpName, 'Undo AI edit returns to the ORIGINAL photo', (await page.getByText(/Showing your original photo/).count()) > 0);
  const undonePx = await sampleCanvas(page, ...PROBE);
  check(vpName, 'after Undo AI edit, the canvas pixels match the ORIGINAL photo again', dist(undonePx, origPx) < 12, `undo ${undonePx} vs original ${origPx}`);
  await page.getByRole('button', { name: /^↪ Redo$/ }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /Restore original photo/ }).click();
  await page.waitForTimeout(500);
  check(vpName, 'Restore original photo works', (await page.getByText(/Showing your original photo/).count()) > 0);

  // ── 9. Ambiguous request does NOT silently spend AI credits ──
  const before = await page.evaluate(() => window.__studio.editCalls.length);
  await page.locator('#wingman-edit').fill('Make this look more professional');
  await page.getByRole('button', { name: /Ask Wingman/ }).click();
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => window.__studio.editCalls.length);
  check(vpName, 'vague request makes NO AI call (asks user to be specific)', after === before);
  check(vpName, 'vague request offers an explicit opt-in to the AI editor', (await page.getByRole('button', { name: /Send .* to the AI photo editor/ }).count()) > 0);

  // ── 10. Save → reopen (Workflow D) ──
  await page.locator('input[aria-label="Design name"]').fill('Storm Validation Design');
  await page.getByRole('button', { name: /Save/ }).first().click();
  await page.waitForFunction(() => window.__studio.cloudSaves.length > 0, null, { timeout: 10000 }).catch(() => {});
  const cloudSaves = await page.evaluate(() => window.__studio.cloudSaves);
  check(vpName, 'Save persists to the ACCOUNT (cloud), not just localStorage', cloudSaves.some((s) => s.name === 'Storm Validation Design'), JSON.stringify(cloudSaves));
  // The editable document + role tags are verified via the local mirror the harness writes.
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('hawkeye_designs_harness-user') || '[]'));
  const savedDesign = saved.find((d) => d.name === 'Storm Validation Design');
  check(vpName, 'saved design carries editable layer data', !!savedDesign && Array.isArray(savedDesign.canvasJson?.objects) && savedDesign.canvasJson.objects.length > 0,
    savedDesign ? `${savedDesign.canvasJson.objects.length} layers` : 'not found');
  const taggedCount = savedDesign ? savedDesign.canvasJson.objects.filter((o) => o.data && (o.data.isHeadline || o.data.isPhoneSlot || o.data.isBrandSlot)).length : 0;
  check(vpName, 'saved design preserves role tags (headline/phone/brand) for later editing', taggedCount > 0, `${taggedCount} tagged layers`);

  // ── 11. Use in Post exports a full-resolution PNG ──
  await page.getByRole('button', { name: /Use in Post/ }).click();
  await page.waitForTimeout(500);
  const used = await page.evaluate(() => window.__studio.usedInPost);
  check(vpName, 'Use in Post exports a PNG data URL', typeof used === 'string' && used.startsWith('data:image/png'));
  if (used) {
    const dims = await page.evaluate((u) => new Promise((r) => { const i = new Image(); i.onload = () => r([i.naturalWidth, i.naturalHeight]); i.src = u; }), used);
    check(vpName, 'exported image is FULL 1080×1080 resolution (not the on-screen zoom size)', dims[0] === 1080 && dims[1] === 1080, `${dims[0]}×${dims[1]}`);
    const expPx = await sampleImage(page, used, ...PROBE);
    check(vpName, 'the photo is present in the EXPORTED post image', dist(expPx, NAVY) > 40, `export probe rgb ${expPx}`);
  }
  check(vpName, 'Use in Post closes the studio', await page.evaluate(() => window.__studio.closed));

  // ── 12. Reopen the saved design and modify it ──
  await page.goto(`${BASE}/studio-harness.html?template=roof-storm-1&reopen=1`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.canvas-container', { timeout: 20000 });
  await page.waitForFunction(() => !document.body.innerText.includes('Loading editor'), null, { timeout: 20000 });
  const reopenedName = await page.locator('input[aria-label="Design name"]').inputValue();
  check(vpName, 'saved design REOPENS with its name', reopenedName === 'Storm Validation Design', reopenedName);
  await page.getByRole('tab', { name: /Brand/ }).click();
  await page.getByRole('button', { name: /Apply My Brand/ }).click();
  await page.waitForTimeout(300);
  check(vpName, 'reopened design is still editable (Apply Brand finds tagged layers)', /Applied your brand/i.test(await page.locator('[role=status]').innerText().catch(() => '')));
  await page.screenshot({ path: `${OUT}/${vpName}-5-reopened.png` });

  // ── 13. No runtime errors ──
  const realErrors = errors.filter((e) => !/favicon|manifest|sw\.js|Download the React DevTools/i.test(e));
  check(vpName, 'no runtime errors during the whole session', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));

  await browser.close();
}

// Free-plan gating in the real UI.
async function runFreePlan() {
  const vp = 'free-plan';
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await page.goto(`${BASE}/studio-harness.html?template=roof-storm-1&paid=0`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.canvas-container', { timeout: 20000 });
  await page.waitForFunction(() => !document.body.innerText.includes('Loading editor'), null, { timeout: 20000 });
  const photo = await page.evaluate(MAKE_PHOTO);
  await page.locator('input[type=file][accept="image/*"]').setInputFiles({ name: 'h.png', mimeType: 'image/png', buffer: Buffer.from(photo.split(',')[1], 'base64') });
  await page.waitForFunction(() => document.body.innerText.includes('Photo added'), null, { timeout: 10000 });
  await page.locator('#wingman-edit').fill('Remove the car');
  await page.getByRole('button', { name: /Ask Wingman/ }).click();
  await page.waitForTimeout(500);
  const calls = await page.evaluate(() => window.__studio.editCalls.length);
  check(vp, 'free plan: photo edit is gated in the UI (no AI call made)', calls === 0);
  check(vp, 'free plan: clear upgrade message shown', (await page.getByText(/included with Soar and Summit/).count()) > 0);
  // Canvas edits must still work for free users.
  await page.locator('#wingman-edit').fill('Change the background to black');
  await page.getByRole('button', { name: /Ask Wingman/ }).click();
  await page.waitForTimeout(400);
  check(vp, 'free plan: free canvas edits still work', /no AI credits used/i.test(await page.locator('[role=status]').innerText().catch(() => '')));
  await browser.close();
}

(async () => {
  await run('desktop', { width: 1366, height: 860 }, false);
  await run('mobile', { width: 390, height: 844 }, true); // iPhone 12-class viewport
  await runFreePlan();
  const ok = results.filter((r) => r.ok).length;
  const bad = results.filter((r) => !r.ok);
  writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
  console.log(`\n==== STUDIO BROWSER VALIDATION: ${ok} passed, ${bad.length} failed ====`);
  process.exit(bad.length ? 1 : 0);
})().catch((e) => { console.error('VALIDATION HARNESS ERROR:', e); process.exit(2); });
