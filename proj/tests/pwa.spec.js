import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve('..');

test('manifest.json is valid PWA manifest', () => {
  const raw = fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8');
  const m = JSON.parse(raw);
  expect(m.name).toBeTruthy();
  expect(m.short_name).toBeTruthy();
  expect(m.start_url).toMatch(/^\.\/?$/);
  expect(m.display).toBe('standalone');
  expect(m.background_color).toBeTruthy();
  expect(m.theme_color).toBeTruthy();
  expect(m.icons.length).toBeGreaterThanOrEqual(2);
  expect(m.icons[0].sizes).toBe('192x192');
  expect(m.icons[1].sizes).toBe('512x512');
  expect(m.icons[1].purpose).toContain('maskable');
});

test('sw.js exists with expected structure', () => {
  const raw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  expect(raw).toContain('install');
  expect(raw).toContain('activate');
  expect(raw).toContain('fetch');
  expect(raw).toContain('CACHE');
  expect(raw).toContain('skipWaiting');
  expect(raw).toContain('clients.claim');
});

test('404.html renders as standalone page', async ({ page }) => {
  await page.goto('/nonexistent-page-test');
  await expect(page).toHaveTitle(/404/);
  await expect(page.locator('text=404')).toBeVisible();
  await expect(page.locator('text=LOST SIGNAL')).toBeVisible();
  await expect(page.locator('text=Return to base')).toBeVisible();
  const link = page.locator('a.btn');
  await expect(link).toHaveAttribute('href', 'index.html');
});

test('index.html links to manifest and registers SW', async ({ page }) => {
  await page.goto('/');
  const manifestLink = page.locator('link[rel="manifest"]');
  await expect(manifestLink).toHaveAttribute('href', 'manifest.json');

  const hasSW = await page.evaluate(() => 'serviceWorker' in navigator);
  expect(hasSW).toBe(true);
});
