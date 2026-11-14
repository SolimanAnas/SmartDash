import { test, expect } from '@playwright/test';
import { monthHint, rosterStartFor } from '../src/util.js';

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

test('month and year are read from roster file names', () => {
  expect(monthHint('Airport_Oct._2026.xlsx')).toEqual({ month: 9, year: 2026 });
  expect(monthHint('roster SEPT 2025')).toEqual({ month: 8, year: 2025 });
  expect(monthHint('schedule.xlsx')).toEqual({ month: -1, year: null });
});

test('roster start date is resolved from header day numbers', () => {
  const oct = range(5, 31).concat(range(1, 15)); // 5 Oct – 15 Nov
  expect(rosterStartFor(oct, monthHint('Airport_Oct._2026.xlsx'), '2026-11-14')).toBe('2026-10-05');
  // no file-name hint: the period nearest today that reproduces the 31 → 1 wrap
  expect(rosterStartFor(oct, monthHint('x.xlsx'), '2026-11-14')).toBe('2026-10-05');
  // a plain calendar month
  expect(rosterStartFor(range(1, 30), monthHint('June 2026'), '2026-11-14')).toBe('2026-06-01');
  // named after the month holding most of the days, but starting in the previous one
  expect(
    rosterStartFor(range(25, 31).concat(range(1, 30)), monthHint('Nov 2026'), '2026-11-01'),
  ).toBe('2026-10-25');
  // crossing a year end
  expect(rosterStartFor([28, 29, 30, 31, 1, 2], monthHint('Dec 2026'), '2026-12-10')).toBe(
    '2026-12-28',
  );
});

test('a roster period crossing months drives every date label', async ({ page }) => {
  await page.goto('/');
  // synthetic, anonymised roster: 5 Oct – 16 Nov 2026 (43 days), four 4-day rotations
  const cycle = ['D', 'D', 'N', 'N', 'X', 'X', 'X', 'X'];
  const staff = [];
  ['A', 'B', 'C', 'D'].forEach((team, t) =>
    [1, 2, 3].forEach((k) =>
      staff.push({
        team,
        airport: 'DXB',
        terminal: 'Terminal 1',
        area: 'Departure',
        callsign: k === 1 ? 'Supervisor' : 'AIRPORT 1' + k,
        stationNo: k === 1 ? '' : '1' + k,
        title: k === 1 ? 'SIC' : 'EMT',
        id: String(9000 + t * 10 + k),
        name: 'Test Medic ' + team + k,
        phone: '050XXXXXXX',
        adp: false,
        tdp: false,
        shifts: Array.from({ length: 43 }, (_, i) => cycle[(i + t * 2) % 8]),
        remark: '',
      }),
    ),
  );
  await page.evaluate((o) => localStorage.setItem('dcas_roster', JSON.stringify(o)), {
    staff,
    teams: ['A', 'B', 'C', 'D'],
    start: '2026-10-05',
    days: 43,
  });
  await page.reload();

  await page.locator('.nav button[data-v="roster"]').click();
  await expect(page.locator('#rosMonth')).toHaveText('5 Oct – 16 Nov 2026');
  const days = page.locator('#strips .strip-row').first().locator('.cell .cd');
  await expect(days).toHaveCount(43);
  await expect(days.nth(0)).toHaveText('5');
  await expect(days.nth(26)).toHaveText('31');
  await expect(days.nth(27)).toHaveText('1');

  await page.locator('#strips .strip-row').first().locator('.cell').nth(27).click();
  await expect(page.locator('#rosDay')).toHaveText('November 1');

  await page.locator('.nav button[data-v="more"]').click();
  await page.locator('#view-more [data-act="go"][data-v="readiness"]').click();
  await expect(page.locator('#rdyMonth')).toHaveText('5 Oct – 16 Nov 2026');
  await expect(page.locator('#rdyHeat .hm-cell')).toHaveCount(86);
  await expect(page.locator('#rdyHeat .hm-dn').first()).toHaveText('5 Oct');
});
