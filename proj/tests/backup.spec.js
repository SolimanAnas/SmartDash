import { test, expect } from '@playwright/test';
import XLSX from 'xlsx';
import {
  COLLECTIONS,
  SCHEMA_VERSION,
  toSheets,
  fromSheets,
  merge,
  track,
  sigsOf,
  migrate,
  statTotals,
  sheetsToWorkbook,
  workbookToSheets,
  collOf,
} from '../src/backup.js';

/* Through a real .xlsx file and back, exactly as the app does it. */
const viaXlsx = (sheets) =>
  workbookToSheets(
    XLSX,
    XLSX.read(XLSX.write(sheetsToWorkbook(XLSX, sheets), { type: 'buffer', bookType: 'xlsx' }), {
      type: 'buffer',
    }),
  );

const fullState = () => ({
  challenges: [
    {
      id: 'c1',
      date: '2026-11-01',
      category: 'Equipment',
      location: 'T3 · Gate B12',
      description: 'Line 1\nLine 2 — "quoted", =SUM(A1) شكراً',
      priority: 'High',
      owner: '',
      status: 'Open',
      createdAt: 1762000000000,
      updatedAt: 1762000000500,
    },
  ],
  reports: [
    {
      id: 'r1',
      month: '2026-10',
      cases: 412,
      resp: 7.4,
      rosc: 3,
      refusals: 0,
      transfers: 51,
      sample: 0,
      updatedAt: 0,
    },
  ],
  achievements: [],
  initiatives: [
    { id: 'i1', title: 'Digital handover', status: 'progress', impact: '', updatedAt: 5 },
  ],
  certifications: [
    {
      staffId: '0002',
      staffTeam: 'A',
      certs: { dha: '2027-01-01', visa: 'na', ref_cpr: '2026-05-01' },
      quals: [{ title: 'BSc', inst: 'College', year: '2015', attested: true }],
      training: [],
      updatedAt: 1762000000000,
    },
  ],
  shiftReports: [
    {
      id: 's1',
      date: '2026-11-12',
      shift: 'N',
      team: 'B',
      staffPresent: ['0001', '0042'],
      casesHandled: 9,
      notes: '',
      updatedAt: 1762000009999,
    },
  ],
  tombstones: { challenges: { old1: 1761000000000 } },
  notifLog: { 'A|0002|dha|2027-01-01|60': { at: 1762000000000, medic: 1762000001000 } },
  policy: ['dha', 'bls'],
  roster: {
    staff: [{ id: '0001', team: 'A', name: 'Staff 001', shifts: ['D', 'N', 'X'] }],
    teams: ['A'],
  },
});

test('backup round-trips every field through a real .xlsx file', () => {
  const s = fullState();
  const sheets = viaXlsx(
    toSheets(s, { createdAt: 1762000000000, device: 'Tablet 1', deviceId: 'dev1' }),
  );
  const { meta, state } = fromSheets(sheets);
  expect(meta).toEqual({
    version: SCHEMA_VERSION,
    createdAt: 1762000000000,
    device: 'Tablet 1',
    deviceId: 'dev1',
  });
  expect(state).toEqual(s);
  expect(typeof state.certifications[0].staffId).toBe('string'); // leading zeros survive
});

test('backup sheets are plain tables with headers in row 1', () => {
  const sheets = toSheets(fullState(), { createdAt: 1 });
  expect(Object.keys(sheets)[0]).toBe('_meta');
  expect(sheets['Shift Reports'][0]).toContain('staffPresent');
  expect(sheets['Shift Reports'][1]).toContain('["0001","0042"]');
});

test('non-backup and newer-version files are refused with a clear message', () => {
  expect(() => fromSheets({ Sheet1: [['Month', 'Cases']] })).toThrow(/not a SmartDash backup/);
  const s = toSheets(fullState(), { createdAt: 1 });
  s._meta = s._meta.map((r) => (r[0] === 'Schema version' ? [r[0], SCHEMA_VERSION + 1] : r));
  expect(() => fromSheets(s)).toThrow(/newer SmartDash/);
});

test('track stamps changed records, records deletions, ignores sample data', () => {
  const c = collOf('challenges');
  const list = [
    { id: 'a', t: 1, updatedAt: 1 },
    { id: 'b', t: 1, updatedAt: 1 },
    { id: 'x', sample: 1 },
  ];
  const sigs = sigsOf(c, list);
  list[0].t = 2; // edit
  list.splice(1, 1); // delete b
  list.splice(1, 1); // delete sample x
  list.push({ id: 'n' }, { id: 'y', sample: 1 }); // new real + new sample
  const r = track(c, list, sigs, 99);
  expect(list[0].updatedAt).toBe(99);
  expect(list[1].updatedAt).toBe(99);
  expect(r.deleted.sort()).toEqual(['b', 'x']);
  expect(r.changed).toBe(3); // edit a + new n + delete b
  expect(track(c, list, r.sigs, 100).changed).toBe(0); // nothing changed since
  expect(list[0].updatedAt).toBe(99);
});

test('migrate v0 gives every record an updatedAt', () => {
  const s = migrate({ challenges: [{ id: 'a', createdAt: 7 }], reports: [{ id: 'r' }] }, 0);
  expect(s.challenges[0].updatedAt).toBe(7);
  expect(s.reports[0].updatedAt).toBe(0);
});

test('merge: newer edit wins, both sides keep their own new records', () => {
  const local = {
    challenges: [
      { id: 'a', v: 'mine', updatedAt: 10 },
      { id: 'b', v: 'b', updatedAt: 50 },
      { id: 'l', updatedAt: 1 },
    ],
  };
  const inc = {
    challenges: [
      { id: 'a', v: 'theirs', updatedAt: 20 },
      { id: 'b', v: 'old', updatedAt: 40 },
      { id: 'f', updatedAt: 1 },
    ],
  };
  const m = merge(local, inc);
  const byId = Object.fromEntries(m.challenges.map((r) => [r.id, r.v]));
  expect(byId).toEqual({ a: 'theirs', b: 'b', l: undefined, f: undefined });
  expect(m.stats.challenges).toMatchObject({ added: 1, updated: 1, kept: 1 });
});

test('merge: deletions are respected in both directions, re-creation wins', () => {
  const local = {
    challenges: [
      { id: 'gone-there', updatedAt: 5 },
      { id: 'edited-after', updatedAt: 90 },
    ],
    tombstones: { challenges: { 'gone-here': 30 } },
  };
  const inc = {
    challenges: [
      { id: 'gone-here', updatedAt: 20 },
      { id: 'back', updatedAt: 70 },
    ],
    tombstones: { challenges: { 'gone-there': 10, 'edited-after': 60, back: 50 } },
  };
  const m = merge(local, inc);
  expect(m.challenges.map((r) => r.id).sort()).toEqual(['back', 'edited-after']);
  expect(m.stats.challenges).toMatchObject({ skipped: 1, removed: 1, added: 1 });
  expect(m.tombstones.challenges).toEqual({ 'gone-here': 30, 'gone-there': 10 });
});

test('merge keeps local settings, unions alert history; totals add up', () => {
  const m = merge(
    { policy: ['dha'], notifLog: { k: { at: 5 } } },
    { policy: ['bls'], notifLog: { k: { at: 3, sic: 9 }, k2: { at: 1 } } },
  );
  expect(m.policy).toEqual(['dha']);
  expect(m.notifLog).toEqual({ k: { at: 3, sic: 9 }, k2: { at: 1 } });
  expect(Object.keys(m.stats)).toEqual(COLLECTIONS.map((c) => c.k));
  expect(statTotals(m.stats).added).toBe(0);
});
