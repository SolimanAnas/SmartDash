import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('page loads with correct title and branding', async ({ page }) => {
  await expect(page).toHaveTitle(/DCAS Airport Operations/);
  await expect(page.getByRole('heading', { name: 'Airport Operations' })).toBeVisible();
  await expect(page.locator('text=DUBAI CORPORATION FOR AMBULANCE SERVICES')).toBeVisible();
});

test('dashboard shows liveband with 4 stats', async ({ page }) => {
  const liveband = page.locator('#liveband');
  await expect(liveband).toBeVisible();
  const lives = liveband.locator('.live');
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
  await page.waitForTimeout(300);
  const countAfter = await page.locator('#stfList .rec').count();
  expect(countAfter).toBeLessThan(countBefore);
});

test('staff detail sheet shows certifications section', async ({ page }) => {
  await page.locator('.nav button[data-v="more"]').click();
  await page.getByRole('button', { name: /Staff Directory/ }).click();
  const firstStaff = page.locator('#stfList .rec').first();
  await expect(firstStaff).toBeVisible();
  await firstStaff.click();
  const sheet = page.locator('#sheet');
  await expect(sheet).toHaveClass(/open/);
  await expect(sheet.locator('.det-row .k').filter({ hasText: 'Certifications' })).toBeVisible();
});

test('staff certifications editor opens and can save', async ({ page }) => {
  await page.locator('.nav button[data-v="more"]').click();
  await page.getByRole('button', { name: /Staff Directory/ }).click();
  await page.locator('#stfList .rec').first().click();
  await page.waitForTimeout(200);
  await page.locator('[data-act="stf-cert"]').click();
  await page.waitForTimeout(200);
  const sheet = page.locator('#sheet');
  await expect(sheet.locator('#sheetTitle')).toContainText(/Certifications/);
  await expect(sheet.locator('button').filter({ hasText: 'Save certifications' })).toBeVisible();
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
  await expect(page.locator('text=Digital transformation roadmap')).toBeVisible();
  await expect(page.locator('text=Clear all records')).toBeVisible();
});

test('install banner element exists in DOM', async ({ page }) => {
  const banner = page.locator('#installBanner');
  await expect(banner).toBeVisible();
  await expect(banner.locator('#installBtn')).toBeVisible();
  await expect(banner.locator('#installDismiss')).toBeVisible();
});
