// Run with PLAYWRIGHT_MODULE set if Playwright is outside node_modules:
// node tests/prototype/host-state.cjs /absolute/path/to/tennis-courtside.html
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const source = fs.readFileSync(process.argv[2], 'utf8');
const reproduce = process.argv.includes('--reproduce');

function bridge(initial) {
  window.testHost = { pending: 0, snapshots: [] };
  window.openai = {
    widgetState: initial,
    setWidgetState(snapshot) {
      const saved = JSON.parse(JSON.stringify(snapshot));
      window.testHost.snapshots.push(saved);
      window.testHost.pending++;
      return new Promise(resolve => setTimeout(() => {
        window.openai.widgetState = saved;
        window.dispatchEvent(new CustomEvent('openai:set_globals', {
          detail: { globals: { widgetState: saved } }
        }));
        window.testHost.pending--;
        resolve();
      }, 20));
    }
  };
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}),
    args: ['--no-sandbox']
  });
  try {
    const page = await browser.newPage({ viewport: { width: 736, height: 1200 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    async function load(initial = null) {
      const html = '<!doctype html><html style="color-scheme:light"><head><meta charset="utf-8"></head><body style="margin:0"><script>(' + bridge.toString() + ')(' + JSON.stringify(initial).replace(/</g, '\\u003c') + ');</script>' + source + '</body></html>';
      await page.setContent('<iframe sandbox="allow-scripts" style="width:100%;height:1400px;border:0" srcdoc="' + html.replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '"></iframe>');
      const frame = await page.locator('iframe').contentFrame();
      await frame.locator('#tt-quick .tt-pointscore').first().waitFor();
      return { frame, quick: frame.locator('#tt-quick'), guided: frame.locator('#tt-guided') };
    }
    async function drain(frame) {
      await frame.locator('body').evaluate(async () => {
        while (window.testHost.pending) await new Promise(resolve => setTimeout(resolve, 5));
      });
    }
    async function activate(frame, name) {
      await frame.locator('.viz-carousel').evaluate((root, selected) => {
        root.querySelectorAll('[data-variant]').forEach(el => { el.hidden = el.dataset.variant !== selected; });
      }, name);
    }
    async function emit(frame, state) {
      await frame.locator('body').evaluate((_, saved) => {
        window.dispatchEvent(new CustomEvent('openai:set_globals', { detail: { globals: { widgetState: saved } } }));
      }, state);
    }
    let { frame, quick, guided } = await load();
    await quick.locator('[data-action="details"]').click();
    await drain(frame);
    const detailsStayedOpen = await quick.locator('[aria-label="Point details"]').isVisible();
    await activate(frame, 'Guided entry');
    await guided.locator('[data-action="choose-winner"][data-winner="1"]').click();
    await drain(frame);
    const guidedAdvanced = await guided.locator('[data-action="ending"]').count() > 0;
    if (reproduce) {
      assert.equal(detailsStayedOpen, false);
      assert.equal(guidedAdvanced, false);
      console.log('REPRODUCED: state echo closes Details and resets Guided entry.');
      return;
    }
    assert.equal(detailsStayedOpen, true, 'Details must remain open after the host echoes saved state');
    assert.equal(guidedAdvanced, true, 'Guided entry must retain the selected winner after a state echo');
    console.log('PASS Details and Guided entry survive asynchronous host echoes');

    await guided.locator('[data-action="ending"][data-ending="unforced"]').click();
    await drain(frame);
    assert.deepEqual(await guided.locator('.tt-pointscore').allTextContents(), ['30', '30']);
    console.log('PASS Guided entry records the selected winner through the full two-step flow');

    await activate(frame, 'Quick endings');
    await quick.locator('[data-detail="stroke"]').selectOption('Forehand');
    await quick.locator('[data-detail="disputed"]').check();
    await quick.locator('[data-detail="caller"]').selectOption('Jamie');
    await quick.locator('[data-detail="note"]').fill('Keep this note while the host sends an older snapshot');
    const stale = await frame.locator('body').evaluate(() => window.testHost.snapshots[0]);
    await emit(frame, stale);
    assert.equal(await quick.locator('[data-detail="note"]').inputValue(), 'Keep this note while the host sends an older snapshot');
    assert.equal(await quick.locator('[data-detail="stroke"]').inputValue(), 'Forehand');
    await quick.locator('[data-action="save-details"]').click();
    await drain(frame);
    await quick.locator('[data-action="report"]').click();
    await drain(frame);
    assert.match(await quick.innerText(), /Keep this note/);
    assert.match(await quick.innerText(), /Disputed call · call by Jamie/);
    assert.deepEqual(await guided.locator('.tt-pointscore').allTextContents(), ['30', '30']);
    console.log('PASS Unsaved detail fields, saved notes, and the other design survive stale snapshots');

    await quick.locator('[data-action="live"]').click();
    await drain(frame);
    const before = await frame.locator('body').evaluate(() => window.testHost.snapshots.at(-1));
    for (let i = 0; i < 2; i++) await quick.locator('[data-action="ending"][data-actor="0"][data-ending="winner"]').click();
    await drain(frame);
    await emit(frame, before);
    assert.deepEqual(await quick.locator('.tt-gamescore').allTextContents(), ['1', '0']);
    await quick.locator('[data-action="undo"]').click();
    await drain(frame);
    assert.deepEqual(await quick.locator('.tt-pointscore').allTextContents(), ['40', '15']);
    console.log('PASS Late updates cannot roll back points or undo');

    await quick.locator('[data-action="correct"]').click();
    await drain(frame);
    await quick.locator('[data-correct="p0"]').selectOption('3');
    await quick.locator('[data-correct="p1"]').selectOption('3');
    await quick.locator('[data-action="save-correction"]').click();
    await drain(frame);
    assert.deepEqual(await quick.locator('.tt-pointscore').allTextContents(), ['40', '40']);
    await quick.locator('[data-action="setup"]').click();
    await drain(frame);
    await quick.locator('[data-setup="name0"]').fill('Sam');
    await emit(frame, stale);
    assert.equal(await quick.locator('[data-setup="name0"]').inputValue(), 'Sam');
    await quick.locator('[data-setup="format"]').selectOption('tie7');
    await quick.locator('[data-action="start"]').click();
    await drain(frame);
    assert.match(await quick.innerText(), /Sam/);
    assert.deepEqual(await quick.locator('.tt-pointscore').allTextContents(), ['0', '0']);
    console.log('PASS Correction and setup panels survive echoes and keep their input');

    await quick.locator('[data-action="finish"]').click();
    await drain(frame);
    await quick.locator('[data-finish="status"]').selectOption('abandoned');
    await quick.locator('[data-action="save-finish"]').click();
    await drain(frame);
    assert.match(await quick.innerText(), /Match abandoned/);
    const latest = await frame.locator('body').evaluate(() => window.testHost.snapshots.at(-1));
    ({ frame, quick, guided } = await load(latest));
    assert.match(await quick.innerText(), /Match abandoned/);
    assert.match(await quick.innerText(), /Sam/);
    assert.deepEqual(await guided.locator('.tt-pointscore').allTextContents(), ['30', '30']);
    console.log('PASS Saved state restores both designs after a fresh load');

    ({ frame, quick, guided } = await load());
    await emit(frame, latest);
    assert.match(await quick.innerText(), /Match abandoned/);
    console.log('PASS Initial host hydration still works before local interaction');
    assert.deepEqual(errors, []);
    console.log('All host integration regressions passed in a sandboxed iframe.');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
