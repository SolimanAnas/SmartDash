import { test, expect } from '@playwright/test';
import XLSX from 'xlsx';
import fs from 'node:fs';
import { toSheets, fromSheets, sheetsToWorkbook, workbookToSheets } from '../src/backup.js';

const readBackup = (file) =>
  fromSheets(workbookToSheets(XLSX, XLSX.read(fs.readFileSync(file), { type: 'buffer' })));

async function openSettings(page) {
  await page.locator('.nav button[data-v="more"]').click();
  await page.locator('#view-more [data-act="go"][data-v="settings"]').click();
  await expect(page.locator('#backupCard')).toContainText('Back up now');
}
async function waitXlsx(page) {
  await page.waitForFunction(() => typeof window.XLSX !== 'undefined');
}
async function chooseBackup(page, file) {
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#backupCard [data-act="restore-pick"]').click();
  await (await chooser).setFiles(file);
  await expect(page.locator('#sheetTitle')).toHaveText('Restore backup');
}
const challengeIds = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('dcas_ch') || '[]').map((c) => c.id));

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await waitXlsx(page);
});

test('dashboard nudges for a backup only when real changes are unsaved', async ({ page }) => {
  await expect(page.locator('#backupNudge .bk-nudge')).toHaveCount(0); // demo data only
  await page.evaluate(() => localStorage.setItem('dcas_dirty', '3'));
  await page.reload();
  await expect(page.locator('#backupNudge .bk-nudge')).toContainText('No backup yet');
  const dl = page.waitForEvent('download');
  await page.locator('#backupNudge [data-act="backup-now"]').click();
  await dl;
  await expect(page.locator('#backupNudge .bk-nudge')).toHaveCount(0);
});

test('back up now downloads a complete, restorable workbook', async ({ page }, info) => {
  await openSettings(page);
  await expect(page.locator('#backupCard .bk-status')).toContainText('No backup yet');
  const dl = page.waitForEvent('download');
  await page.locator('#backupCard [data-act="backup-now"]').click();
  const d = await dl;
  expect(d.suggestedFilename()).toMatch(/^smartdash-backup-\d{4}-\d{2}-\d{2}-\d{4}\.xlsx$/);
  const file = info.outputPath('b.xlsx');
  await d.saveAs(file);
  const { state, meta } = readBackup(file);
  const local = await page.evaluate(() => ({
    ch: JSON.parse(localStorage.getItem('dcas_ch')),
    cert: JSON.parse(localStorage.getItem('dcas_cert')),
    shift: JSON.parse(localStorage.getItem('dcas_shift')),
  }));
  expect(state.challenges).toEqual(local.ch);
  expect(state.certifications).toEqual(local.cert);
  expect(state.shiftReports).toEqual(local.shift);
  expect(meta.device).toMatch(/^Device /);
  await expect(page.locator('#backupCard .bk-status')).toContainText('Last backup: today');
});

test('replace restores a backup and undo puts the device back', async ({ page }, info) => {
  await openSettings(page);
  const dl = page.waitForEvent('download');
  await page.locator('#backupCard [data-act="backup-now"]').click();
  const file = info.outputPath('b.xlsx');
  await (await dl).saveAs(file);
  const before = await challengeIds(page);
  // Simulate losing data: wipe challenges on this device.
  await page.evaluate(() => localStorage.setItem('dcas_ch', '[]'));
  await page.reload();
  await waitXlsx(page);
  await openSettings(page);
  await chooseBackup(page, file);
  await page.locator('[data-act="restore-apply"][data-mode="replace"]').click();
  await expect(page.locator('#toast')).toContainText('Backup restored');
  expect((await challengeIds(page)).sort()).toEqual(before.slice().sort());
  page.once('dialog', (dlg) => dlg.accept());
  await page.locator('[data-act="restore-undo"]').click();
  await expect(page.locator('#toast')).toContainText('Last restore undone');
  expect(await challengeIds(page)).toEqual([]);
});

test('merge adds records from another device without losing local ones', async ({ page }, info) => {
  const mine = await challengeIds(page);
  const file = info.outputPath('other.xlsx');
  const sheets = toSheets(
    {
      challenges: [
        {
          id: 'from-tablet',
          date: '2026-11-12',
          category: 'Equipment',
          location: 'T1',
          description: 'Stretcher wheel broken',
          priority: 'High',
          owner: '',
          status: 'Open',
          createdAt: 1762900000000,
          updatedAt: 1762900000000,
        },
      ],
    },
    { createdAt: 1762900000000, device: 'Device TAB1', deviceId: 'other' },
  );
  fs.writeFileSync(
    file,
    XLSX.write(sheetsToWorkbook(XLSX, sheets), { type: 'buffer', bookType: 'xlsx' }),
  );
  await openSettings(page);
  await chooseBackup(page, file);
  await expect(page.locator('#sheet')).toContainText('(another device)');
  await page.locator('[data-act="restore-apply"][data-mode="merge"]').click();
  await expect(page.locator('#toast')).toContainText('merged');
  const after = await challengeIds(page);
  expect(after).toContain('from-tablet');
  mine.forEach((id) => expect(after).toContain(id));
});

test('a non-backup Excel file is refused', async ({ page }, info) => {
  const file = info.outputPath('report.xlsx');
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Month', 'Cases']]), 'Sheet1');
  fs.writeFileSync(file, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  await openSettings(page);
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#backupCard [data-act="restore-pick"]').click();
  await (await chooser).setFiles(file);
  await expect(page.locator('#toast')).toContainText('not a SmartDash backup');
});

test('adding and deleting a record is tracked for backup and merge', async ({ page }) => {
  expect(await page.evaluate(() => localStorage.getItem('dcas_dirty'))).toBe('0');
  await page.locator('.nav button[data-v="challenges"]').click();
  await page.locator('#fab').click();
  await page.locator('#c_desc').fill('Defib pads expired at T2 store');
  await page.locator('[data-act="ch-save"]').click();
  const added = await page.evaluate(() => {
    const ch = JSON.parse(localStorage.getItem('dcas_ch'));
    const r = ch.filter((c) => c.description === 'Defib pads expired at T2 store')[0];
    return { id: r.id, updatedAt: r.updatedAt, dirty: localStorage.getItem('dcas_dirty') };
  });
  expect(added.updatedAt).toBeGreaterThan(Date.now() - 60000);
  expect(added.dirty).toBe('1');
  // Delete it: a tombstone is left so a merge can't bring it back.
  await page.evaluate((id) => {
    const ch = JSON.parse(localStorage.getItem('dcas_ch')).filter((c) => c.id !== id);
    localStorage.setItem('dcas_ch', JSON.stringify(ch));
  }, added.id);
  await page.reload();
  await page.locator('.nav button[data-v="challenges"]').click();
  await page.locator('#fab').click();
  await page.locator('#c_desc').fill('second');
  await page.locator('[data-act="ch-save"]').click();
  const tomb = await page.evaluate(() => JSON.parse(localStorage.getItem('dcas_tomb')));
  expect(Object.keys(tomb.challenges)).toContain(added.id);
});
