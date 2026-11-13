import { test, expect } from '@playwright/test';
import {
  DOC_DEFS,
  TIERS,
  tierOf,
  normDate,
  expiryOf,
  expiries,
  docState,
  assess,
  crewReadiness,
  readinessBand,
  addMonths,
  encodeVerify,
  decodeVerify,
  verifyPayloadFrom,
  sampleDossier,
  defaultPolicy,
} from '../src/docs.js';

const EMT = { id: '0002', team: 'A', title: 'EMT' };
const SIC = { id: '0001', team: 'A', title: 'SIC' };
const allValid = () => {
  const c = {};
  DOC_DEFS.forEach((d) => (c[d.k] = d.months ? '2026-06-01' : '2027-12-31'));
  return c;
};

test('alert milestones are 60 / 30 / 15 days and expiry', () => {
  expect(TIERS).toEqual([60, 30, 15]);
  expect(tierOf(61)).toBe(null);
  expect(tierOf(60)).toBe(60);
  expect(tierOf(31)).toBe(60);
  expect(tierOf(30)).toBe(30);
  expect(tierOf(16)).toBe(30);
  expect(tierOf(15)).toBe(15);
  expect(tierOf(0)).toBe(15);
  expect(tierOf(-1)).toBe('expired');
  expect(docState(DOC_DEFS[0], '2026-07-16', '2026-06-01').tier).toBe(60);
  expect(docState(DOC_DEFS[0], '2026-06-01', '2026-06-01').state).toBe('valid');
  expect(docState(DOC_DEFS[0], '2026-05-31', '2026-06-01').state).toBe('expired');
});

test('dates from Excel and users are normalised', () => {
  expect(normDate('2026-06-25')).toBe('2026-06-25');
  expect(normDate('25/06/2026')).toBe('2026-06-25');
  expect(normDate(46000)).toBe('2025-12-09'); // Excel serial
  expect(normDate('N/A')).toBe('na');
  expect(normDate('2026-02-30')).toBe('');
  expect(normDate('13/13/2026')).toBe('');
  expect(normDate('')).toBe('');
  expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
});

test('refresher courses fall due a fixed period after completion', () => {
  const cpr = DOC_DEFS.filter((d) => d.k === 'ref_cpr')[0];
  expect(expiryOf(cpr, '2026-03-10')).toBe('2027-03-10');
  const visa = DOC_DEFS.filter((d) => d.k === 'visa')[0];
  expect(expiryOf(visa, 'na')).toBe('na');
  expect(expiryOf(DOC_DEFS[0], 'na')).toBe(''); // N/A is only allowed where defined
});

test('readiness: blocking documents expired or missing make a medic not ready', () => {
  const ok = assess(EMT, expiries(allValid()), '2026-06-15');
  expect(ok.ready).toBe(true);

  const c = allValid();
  c.dha = '2026-06-10';
  const lapsed = assess(EMT, expiries(c), '2026-06-15');
  expect(lapsed.ready).toBe(false);
  expect(lapsed.blockers.map((b) => b.def.k)).toEqual(['dha']);
  // forward-looking: still ready on a shift before the expiry date
  expect(assess(EMT, expiries(c), '2026-06-09').ready).toBe(true);

  const noAcls = allValid();
  delete noAcls.acls;
  expect(assess(EMT, expiries(noAcls), '2026-06-15').ready).toBe(true); // ACLS: advanced roles only
  expect(assess(SIC, expiries(noAcls), '2026-06-15').ready).toBe(false);

  const national = allValid();
  national.visa = 'na';
  expect(assess(EMT, expiries(national), '2026-06-15').ready).toBe(true);

  const noPassport = allValid();
  delete noPassport.passport; // tracked but not blocking by default
  const a = assess(EMT, expiries(noPassport), '2026-06-15');
  expect(a.ready).toBe(true);
  expect(a.watch.map((w) => w.def.k)).toContain('passport');
  expect(defaultPolicy()).not.toContain('passport');
});

test('crew readiness percentage and bands', () => {
  const good = expiries(allValid());
  const crew = [
    EMT,
    SIC,
    { id: '3', team: 'A', title: 'EMT' },
    { id: '4', team: 'A', title: 'EMT' },
  ];
  const r = crewReadiness(crew, (s) => (s.id === '4' ? {} : good), '2026-06-15');
  expect(r.crew).toBe(4);
  expect(r.ready).toBe(3);
  expect(r.pct).toBe(75);
  expect(readinessBand(r.pct)).toBe('risk');
  expect(readinessBand(90)).toBe('watch');
  expect(readinessBand(95)).toBe('ok');
  expect(crewReadiness([], () => ({}), '2026-06-15').pct).toBe(null);
});

test('QR verification payload round-trips', () => {
  const exps = expiries(Object.assign(allValid(), { visa: 'na' }));
  const p = encodeVerify({
    id: '0002',
    team: 'A',
    title: 'EMT',
    name: 'Staff~002 Ä',
    asOf: '2026-11-13',
    exps,
  });
  expect(p).toMatch(/^v1~/);
  const back = decodeVerify(verifyPayloadFrom('https://example.test/app/#verify=' + p));
  expect(back.id).toBe('0002');
  expect(back.team).toBe('A');
  expect(back.asOf).toBe('2026-11-13');
  expect(back.name).toBe('Staff-002 Ä');
  const shared = Object.assign({}, exps);
  delete shared.eid;
  delete shared.passport;
  delete shared.visa;
  expect(back.exps).toEqual(shared);
  expect(decodeVerify('garbage')).toBe(null);
});

test('QR payload never carries personal documents', () => {
  const back = decodeVerify(
    encodeVerify({
      id: '0002',
      team: 'A',
      title: 'EMT',
      name: 'Staff 002',
      asOf: '2026-11-13',
      exps: { dha: '2027-01-01', eid: '2027-02-02', passport: '2030-03-03', visa: 'na' },
    }),
  );
  expect(back.exps).toEqual({ dha: '2027-01-01' });
});

test('sample documents are deterministic per staff member', () => {
  const s = { id: '0042', team: 'B', title: 'EMT' };
  expect(sampleDossier(s, '2026-11-13', '2026-06-01')).toEqual(
    sampleDossier(s, '2026-11-13', '2026-06-01'),
  );
});
