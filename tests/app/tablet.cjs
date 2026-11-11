// Run against the Expo browser preview. Native device checks remain separate.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const pwName = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = require(pwName);
const { expect } = require(pwName + '/test');
const base = process.env.APP_URL || 'http://localhost:8093';
const output = process.env.TEST_OUTPUT || '/tmp/tennis-tablet-check';
const sizes = [
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1280, height: 800 },
  { width: 480, height: 800 },
  { width: 320, height: 640 },
  { width: 900, height: 500 },
];
fs.mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true,
    ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}),
    args: ['--no-sandbox'],
  });
  let context;
  let page;
  const errors = [];
  const fresh = async viewport => {
    if (context) await context.close();
    context = await browser.newContext({ viewport, acceptDownloads: true });
    page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.setFixedTime(new Date('2026-11-11T12:00:00Z'));
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Your tennis notebook', { exact: true })).toBeVisible({ timeout: 60000 });
  };
  const button = name => page.getByRole('button', { name, exact: true });
  const textbox = name => page.getByRole('textbox', { name, exact: true });
  const idle = async () => expect(page.getByText('Saving…', { exact: true })).toHaveCount(0);
  const score = async (a, b) => {
    await expect(page.locator('[data-testid^="score-0-"]').last()).toHaveText(a);
    await expect(page.locator('[data-testid^="score-1-"]').last()).toHaveText(b);
  };
  const layout = async ({ dialog = false } = {}) => {
    await expect.poll(() => page.evaluate(() => {
      const violations = [];
      if (document.documentElement.scrollWidth > innerWidth + 1) violations.push('document overflows horizontally');
      const content = document.querySelector('[data-testid="app-content"]');
      if (content) {
        const bounds = content.getBoundingClientRect();
        if (bounds.left < -1 || bounds.right > innerWidth + 1) violations.push('main content extends outside window');
      }
      const sheet = document.querySelector('[data-testid="app-dialog"]');
      if (sheet && sheet.getBoundingClientRect().height > 0) {
        const bounds = sheet.getBoundingClientRect();
        if (bounds.left < -1 || bounds.right > innerWidth + 1 || bounds.top < -1 || bounds.bottom > innerHeight + 1) {
          violations.push('dialog extends outside window');
        }
        if (sheet.scrollWidth > sheet.clientWidth + 1) violations.push('dialog overflows horizontally');
      }
      return violations;
    })).toEqual([]);
    if (dialog) await expect(page.getByTestId('app-dialog')).toBeVisible();
  };
  const resize = async (size, options) => { await page.setViewportSize(size); await layout(options); };
  const screenshot = name => page.screenshot({ path: path.join(output, name), fullPage: true });
  const widths = async (container, direction) => expect(page.getByTestId(container)).toHaveCSS('flex-direction', direction);
  try {
    await fresh(sizes[0]);
    await button('Start recording your first match').click();
    await page.getByTestId('new-player-name').fill('Alex');
    await page.getByTestId('opponent-name').fill('Jamie');
    await textbox('Tournament or group').fill('Tablet practice');
    await page.getByTestId('recording-depth-detailed').click();
    for (const size of sizes) {
      await resize(size);
      await expect(page.getByTestId('new-player-name')).toHaveValue('Alex');
      await expect(page.getByTestId('opponent-name')).toHaveValue('Jamie');
      await expect(textbox('Tournament or group')).toHaveValue('Tablet practice');
      await expect(page.getByTestId('recording-depth-detailed')).toHaveAttribute('aria-pressed', 'true');
    }
    await resize(sizes[0]);
    await screenshot('tablet-setup-portrait.png');
    await page.getByTestId('save-match').click();
    await expect(button('Alex vs Jamie, Not started')).toBeVisible();
    await button('Alex vs Jamie, Not started').click();
    await button('Start match').click();
    await page.getByTestId('first-server-0').click();
    await page.getByTestId('start-match').click();
    await expect(page.getByTestId('service-step-first-serve')).toBeVisible();
    console.log('PASS Setup values and recording mode survive tablet rotation, narrow split windows and short landscape');

    await page.getByTestId('first-fault').click();
    await idle();
    for (const size of sizes) {
      await resize(size);
      await expect(page.getByTestId('service-step-second-serve')).toBeVisible();
      await expect(page.getByText('First serve fault', { exact: true })).toBeVisible();
      await score('0', '0');
    }
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('service-step-second-serve')).toBeVisible();
    await page.getByTestId('second-in').click();
    await page.getByTestId('return-result-in').click();
    await page.getByTestId('return-stroke-backhand').click();
    await page.getByTestId('point-winner-0').click();
    await idle();
    for (const size of sizes) {
      await resize(size);
      await expect(page.getByText('Alex won the point', { exact: true })).toBeVisible();
      await expect(page.getByTestId('shot-0-winner-forehand')).toBeVisible();
      await score('0', '0');
    }
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Alex won the point', { exact: true })).toBeVisible();
    await page.getByTestId('shot-0-winner-forehand').click();
    await idle(); await score('15', '0');
    await resize(sizes[2]);
    const recordingWidth = (await page.getByTestId('app-content').boundingBox()).width;
    assert.ok(recordingWidth <= 620, 'Recording controls should retain a comfortable reach on a tablet');
    await screenshot('tablet-recording-landscape.png');
    console.log('PASS Serve observations and pending point entry survive resizing and reload before one durable point is recorded');

    const matchNotes = 'Tablet match notes: preserve this unsaved text during rotation.';
    await button('Match notes').click();
    await textbox('Notes about the match').fill(matchNotes);
    for (const size of [...sizes, { width: 480, height: 360 }]) {
      await resize(size, { dialog: true });
      await expect(textbox('Notes about the match')).toHaveValue(matchNotes);
      await button('Save match notes').scrollIntoViewIfNeeded();
      await expect(button('Save match notes')).toBeInViewport();
    }
    await button('Save match notes').click();
    await expect(button('Save match notes')).toHaveCount(0);
    await score('15', '0');
    await button('Match notes').click();
    await expect(textbox('Notes about the match')).toHaveValue(matchNotes);
    await button('Cancel').click();

    const pointNotes = 'Tablet point note: kept while editing in a short resized window.';
    await button('Add notes').click();
    await textbox('Notes').fill(pointNotes);
    const mindset = page.getByRole('button', { name: 'Mindset, effort and resilience', exact: true });
    await mindset.click();
    for (const size of [...sizes, { width: 480, height: 360 }]) {
      await resize(size, { dialog: true });
      await expect(textbox('Notes')).toHaveValue(pointNotes);
      await expect(mindset).toHaveAttribute('aria-expanded', 'true');
      await expect(page.getByTestId('save-point-notes')).toBeInViewport({ ratio: 1 });
    }
    await screenshot('tablet-point-notes-short.png');
    await page.getByTestId('save-point-notes').click();
    await expect(page.getByTestId('save-point-notes')).toHaveCount(0);
    await score('15', '0');
    console.log('PASS Unsaved match and point notes survive resize; short dialogs remain bounded and save actions stay reachable');

    await page.getByTestId('tab-report').click();
    await page.getByTestId('match-report-points').click();
    await page.getByTestId('report-points-notable').click();
    for (const size of sizes) {
      await resize(size);
      await expect(page.getByTestId('match-report-points')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByTestId('report-points-notable')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByTestId('report-point-1').getByText(pointNotes, { exact: true })).toBeVisible();
    }
    await page.getByTestId('match-report-overview').click();
    await resize(sizes[2]);
    await widths('match-report-columns', 'row');
    assert.ok((await page.getByTestId('app-content').boundingBox()).width > recordingWidth, 'Reports should use more tablet width than recording controls');
    await screenshot('tablet-match-report-landscape.png');
    await resize(sizes[4]);
    await widths('match-report-columns', 'column');
    await expect(page.getByText(matchNotes, { exact: true })).toBeVisible();

    await page.getByTestId('back-to-matches').click();
    await button('Player performance').click();
    await button('Custom period').click();
    await textbox('From (YYYY-MM-DD)').fill('2026-11-01');
    await textbox('To (YYYY-MM-DD)').fill('2026-11-30');
    for (const size of sizes) {
      await resize(size);
      await expect(button('Custom period')).toHaveAttribute('aria-pressed', 'true');
      await expect(textbox('From (YYYY-MM-DD)')).toHaveValue('2026-11-01');
      await expect(textbox('To (YYYY-MM-DD)')).toHaveValue('2026-11-30');
      await expect(page.getByText('1 match · 1 recorded point', { exact: true })).toBeVisible();
    }
    await resize(sizes[2]);
    await widths('player-report-columns', 'row');
    await screenshot('tablet-player-report-landscape.png');
    const pdfDownload = page.waitForEvent('download');
    await button('Export player PDF').click();
    const pdf = await pdfDownload;
    const pdfPath = path.join(output, 'tablet-player-report.pdf');
    await pdf.saveAs(pdfPath);
    assert.equal(fs.readFileSync(pdfPath).subarray(0, 5).toString(), '%PDF-');
    await resize(sizes[4]);
    await widths('player-report-columns', 'column');
    console.log('PASS Report sections and custom date filters retain their state as reports switch between columns and compact layouts');

    await page.getByTestId('back-to-matches').click();
    await button('Settings').click();
    const backupDownload = page.waitForEvent('download');
    await button('Back up all records').click();
    const backupPath = path.join(output, 'tablet-records-backup.json');
    await (await backupDownload).saveAs(backupPath);
    const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
    assert.equal(backup.matches.length, 1); assert.equal(backup.players.length, 1);
    const match = backup.matches[0];
    assert.equal(match.matchNotes, matchNotes);
    assert.equal(match.events.filter(event => event.type === 'point').length, 1);
    assert.equal(match.events.find(event => event.type === 'point').input.observations.firstServe, 'fault');
    assert.equal(match.events.find(event => event.type === 'point').input.observations.secondServe, 'in');
    assert.equal(match.events.find(event => event.type === 'point').input.observations.returnStroke, 'backhand');

    await fresh(sizes[1]);
    await button('Settings').click();
    const chooser = page.waitForEvent('filechooser');
    await button('Restore backup').click();
    await (await chooser).setFiles(backupPath);
    await expect(page.getByText('1 new players and 1 new matches.', { exact: true })).toBeVisible();
    await resize(sizes[4], { dialog: true });
    await button('Import new records').click();
    await expect(page.getByText('Restored 1 matches. Existing records were kept.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /^Alex vs Jamie, In progress,/ }).click();
    await score('15', '0');
    await page.getByTestId('tab-report').click();
    await expect(page.getByText(matchNotes, { exact: true })).toBeVisible();
    await page.getByTestId('match-report-points').click();
    await expect(page.getByTestId('report-point-1').getByText(pointNotes, { exact: true })).toBeVisible();
    await layout();
    console.log('PASS Tablet PDF download and JSON backup/restore preserve score, serve observations and notes');

    await page.getByTestId('back-to-matches').click();
    await button('Add match to event').click();
    await page.getByRole('button', { name: /^Tablet practice ·/ }).click();
    await page.getByTestId('opponent-name').fill('Taylor');
    await page.getByTestId('save-match').click();
    const cards = page.locator('[data-testid^="match-card-"]');
    await expect(cards).toHaveCount(2);
    await resize(sizes[2]);
    await expect.poll(async () => {
      const [a, b] = await Promise.all([cards.nth(0).boundingBox(), cards.nth(1).boundingBox()]);
      return a && b && Math.abs(a.y - b.y) <= 1 && b.x >= a.x + a.width - 1;
    }).toBe(true);
    await screenshot('tablet-library-landscape.png');
    await resize(sizes[4]);
    await expect.poll(async () => {
      const [a, b] = await Promise.all([cards.nth(0).boundingBox(), cards.nth(1).boundingBox()]);
      return a && b && Math.abs(a.x - b.x) <= 1 && b.y >= a.y + a.height - 1;
    }).toBe(true);
    assert.deepEqual(errors, [], 'No runtime errors while rotating, resizing or restoring tablet records');
    console.log('PASS Match library cards share a row on wide tablets and stack in narrow windows without runtime errors');
  } catch (error) {
    if (page) await screenshot('tablet-failure.png').catch(() => {});
    throw error;
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
