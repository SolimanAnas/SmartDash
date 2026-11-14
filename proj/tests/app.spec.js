import { test, expect } from '@playwright/test';
import { encodeVerify } from '../src/docs.js';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('page loads with correct title and branding', async ({ page }) => {
  await expect(page).toHaveTitle(/SmartDash/);
  await expect(page.getByRole('heading', { name: 'SmartDash' })).toBeVisible();
  await expect(page.locator('text=DUBAI CORPORATION FOR AMBULANCE SERVICES')).toBeVisible();
});

test('dashboard shows liveband with 4 stats', async ({ page }) => {
  const liveband = page.locator('#liveband');
  await expect(liveband).toBeVisible();
  const lives = liveband.locator('.lb-item');
  await expect(lives).toHaveCount(4);
  await expect(liveband.locator('text=On duty')).toBeVisible();
  await expect(liveband.locator('text=Stations')).toBeVisible();
  await expect(liveband.locator('text=Coverage')).toBeVisible();
  await expect(liveband.locator('text=Open issues')).toBeVisible();
});

test('dashboard shows KPI cards', async ({ page }) => {
  const kpis = page.locator('#mgmtKpis .kpi');
  await expect(kpis.first()).toBeVisible();
  const count = await kpis.count();
  expect(count).toBeGreaterThanOrEqual(6);
});

test('dashboard shows coverage sparkline', async ({ page }) => {
  await expect(page.locator('#dashSpark svg')).toBeVisible();
});

test('navigation switches between views', async ({ page }) => {
  const views = ['command', 'roster', 'challenges', 'more'];
  for (const v of views) {
    await page.locator(`.nav button[data-v="${v}"]`).click();
    const viewEl = page.locator(`#view-${v}`);
    await expect(viewEl).toHaveClass(/active/);
  }
});

test('roster shows team strips and on-duty staff', async ({ page }) => {
  await page.locator('.nav button[data-v="roster"]').click();
  await expect(page.locator('#strips .strip-row')).toHaveCount(4);
  await expect(page.locator('#rosDuty .staff-row').first()).toBeVisible();
});

test('challenges view shows stats, search, and list', async ({ page }) => {
  await page.locator('.nav button[data-v="challenges"]').click();
  await expect(page.locator('#chStats .kpi')).toHaveCount(3);
  await expect(page.locator('#chSearch')).toBeVisible();
  const items = page.locator('#chList .rec');
  await expect(items.first()).toBeVisible();
});

test('staff directory renders and is searchable', async ({ page }) => {
  await page.locator('.nav button[data-v="more"]').click();
  await page.getByRole('button', { name: /Staff Directory/ }).click();
  await expect(page.locator('#stfList .rec').first()).toBeVisible();

  const countBefore = await page.locator('#stfList .rec').count();
  await page.locator('#stfSearch').fill('Soliman');
  await expect.poll(async () => page.locator('#stfList .rec').count()).toBeLessThan(countBefore);
});

test('staff profile shows readiness and unified documents', async ({ page }) => {
  await page.locator('.nav button[data-v="more"]').click();
  await page.getByRole('button', { name: /Staff Directory/ }).click();
  const firstStaff = page.locator('#stfList .rec').first();
  await expect(firstStaff).toBeVisible();
  await firstStaff.click();
  const sheet = page.locator('#sheet');
  await expect(sheet).toHaveClass(/open/);
  await expect(sheet.locator('.rbanner')).toContainText(/ready for duty/i);
  for (const section of [
    'Licenses & accreditations',
    'Personal documents',
    'Refresher courses',
    'Academic qualifications',
    'Training path',
  ]) {
    await expect(sheet.locator('.det-row .k').filter({ hasText: section })).toBeVisible();
  }
  await expect(sheet.locator('.dbadge').filter({ hasText: 'Emirates ID' })).toBeVisible();
});

test('staff documents editor opens and saves', async ({ page }) => {
  await page.locator('.nav button[data-v="more"]').click();
  await page.getByRole('button', { name: /Staff Directory/ }).click();
  await page.locator('#stfList .rec').first().click();
  await expect(page.locator('#sheet')).toHaveClass(/open/);
  await page.locator('[data-act="stf-cert"]').click();
  const sheet = page.locator('#sheet');
  await expect(sheet.locator('#sheetTitle')).toContainText(/Certifications & documents/);
  await expect(sheet.locator('#cert-bls')).toBeVisible();
  await expect(sheet.locator('#cert-visa-na')).toBeAttached();
  await sheet.locator('[data-act="qual-add"]').click();
  await sheet.locator('#qualRows .qual-row').last().locator('.q-title').fill('MSc Emergency Care');
  await sheet.locator('button').filter({ hasText: 'Save documents' }).click();
  await expect(page.locator('#toast')).toHaveText('Documents saved');
  await expect(sheet.locator('.ql').filter({ hasText: 'MSc Emergency Care' })).toBeVisible();
});

test('QR profile renders a code for the medic', async ({ page }) => {
  await page.locator('.nav button[data-v="more"]').click();
  await page.getByRole('button', { name: /Staff Directory/ }).click();
  await page.locator('#stfList .rec').first().click();
  await page.locator('[data-act="stf-qr"]').click();
  const sheet = page.locator('#sheet');
  await expect(sheet.locator('#sheetTitle')).toContainText(/QR profile/);
  await expect(sheet.locator('.qr-box svg path')).toBeAttached();
  await expect(sheet.locator('.vf-status')).toBeVisible();
  await expect(
    sheet.locator('.vf-gh').filter({ hasText: 'Required refresher courses' }),
  ).toBeVisible();
});

test('scanned QR link opens the verification card', async ({ page }) => {
  const payload = encodeVerify({
    id: '0010',
    team: 'A',
    title: 'EMT',
    name: 'Staff 010',
    asOf: '2026-11-01',
    exps: { airport: '2099-01-01', bls: '2000-01-01' },
  });
  await page.evaluate(() => localStorage.setItem('dcas_cert', '[]'));
  await page.goto('/?scan=1#verify=' + payload);
  const sheet = page.locator('#sheet');
  await expect(sheet).toHaveClass(/open/);
  await expect(sheet.locator('#sheetTitle')).toHaveText('Verify medic');
  // No record on this device: the badge must not be able to claim readiness on its own.
  await expect(sheet.locator('.vf-status')).toContainText('CANNOT VERIFY');
  await expect(sheet.locator('.vf-status')).toContainText('issued 01/11/2026');
  await expect(sheet.locator('.vf-row')).toHaveCount(0);
  await expect(sheet).not.toContainText('READY FOR DUTY');
});

test('scanned QR link is checked against the live record when present', async ({ page }) => {
  const payload = encodeVerify({
    id: '0010',
    team: 'A',
    title: 'EMT',
    name: 'Staff 010',
    asOf: '2026-11-01',
    exps: { airport: '2099-01-01' },
  });
  await page.goto('/?scan=2#verify=' + payload);
  const sheet = page.locator('#sheet');
  await expect(sheet.locator('.vf-src')).toContainText('Live record on this device');
  await expect(sheet.locator('.vf-status')).toContainText('FOR DUTY');
});

test('demo documents are labelled and can be removed', async ({ page }) => {
  await page.locator('.nav button[data-v="more"]').click();
  await page.locator('#view-more [data-act="go"][data-v="docs"]').click();
  await expect(page.locator('#docsDemo .demo-note')).toContainText('demo data');
  page.once('dialog', (d) => d.accept());
  await page.locator('[data-act="docs-clear-demo"]').click();
  await expect(page.locator('#docsDemo .demo-note')).toHaveCount(0);
  const left = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('dcas_cert') || '[]').filter((r) => r.sample),
  );
  expect(left).toHaveLength(0);
});

test('documents & alerts view lists predictive expiry alerts', async ({ page }) => {
  await page.locator('.nav button[data-v="more"]').click();
  await page.locator('#view-more [data-act="go"][data-v="docs"]').click();
  await expect(page.locator('#view-docs')).toHaveClass(/active/);
  await expect(page.locator('#docsKpis .kpi')).toHaveCount(4);
  await expect(page.locator('#docsNotif')).toContainText('60');
  const rows = page.locator('#docsList .al-row');
  await expect(rows.first()).toBeVisible();
  await expect(rows.first().locator('[data-act="notify"][data-role="medic"]')).toBeVisible();
  await page.locator('#docsChips [data-key="15"]').click();
  const tiers = await page.locator('#docsList .al-tier').allTextContents();
  expect(tiers.every((t) => t === '15 days')).toBe(true);
});

test('verify medic by staff ID', async ({ page }) => {
  await page.locator('.nav button[data-v="more"]').click();
  await page.locator('#view-more [data-act="go"][data-v="docs"]').click();
  await page.locator('[data-act="scan"]').click();
  await page.locator('#verifyId').fill('2');
  await page.locator('[data-act="verify-id"]').click();
  await expect(page.locator('#sheet .vf-head')).toContainText('#0002');
  await expect(page.locator('#sheet .vf-src')).toContainText('Live record');
});

test('dashboard shows shift readiness with a 7-day strip', async ({ page }) => {
  await expect(page.locator('#dashReady .rd-n')).toBeVisible();
  const cells = await page.locator('#dashReady .hm-cell').count();
  expect(cells).toBeGreaterThanOrEqual(2);
  expect(cells).toBeLessThanOrEqual(14);
});

test('readiness heatmap covers every shift and drills down', async ({ page }) => {
  await page.locator('.nav button[data-v="more"]').click();
  await page.locator('#view-more [data-act="go"][data-v="readiness"]').click();
  await expect(page.locator('#rdyHeat .hm-cell')).toHaveCount(60);
  await expect(page.locator('#rdyStats .kpi')).toHaveCount(3);
  await expect(page.locator('#rdyHeat .hm-legend')).toBeVisible();
  await page.locator('#rdyHeat .hm-cell').nth(10).click();
  await expect(page.locator('#sheet')).toHaveClass(/open/);
  await expect(page.locator('#sheet .rd-meta')).toContainText(/shift/);
});

test('command center shows readiness for the selected shift', async ({ page }) => {
  await page.locator('.nav button[data-v="command"]').click();
  await expect(page.locator('#cmdReady .rd-n')).toBeVisible();
});

test('dashboard certification alert appears if certs exist', async ({ page }) => {
  const band = page.locator('#liveband');
  const hasCertAlert = await band.locator('text=Certifications').count();
  if (hasCertAlert > 0) {
    await expect(band.locator('text=Certifications')).toBeVisible();
  }
});

test('settings page loads with export and roadmap', async ({ page }) => {
  await page.locator('.nav button[data-v="more"]').click();
  await page.locator('[data-act="go"][data-v="settings"]').click();
  await expect(page.locator('text=Export everything')).toBeVisible();
  await expect(page.locator('#policyList [data-pol="airport"]')).toBeChecked();
  await expect(page.locator('#policyList [data-pol="dha"]')).toHaveCount(0);
  await expect(page.locator('text=Digital transformation roadmap')).toBeVisible();
  await expect(page.locator('text=Clear all records')).toBeVisible();
});

test('install banner element exists in DOM', async ({ page }) => {
  const banner = page.locator('#installBanner');
  await expect(banner).toBeVisible();
  await expect(banner.locator('#installBtn')).toBeVisible();
  await expect(banner.locator('#installDismiss')).toBeVisible();
});
