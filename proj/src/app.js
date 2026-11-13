import ROSTER from '../data/roster.json';
import { esc, deb, dateOf, dispName, initials, telOf, uid, today, fmtD } from './util.js';
import { qrSvg } from './qr.js';
import {
  DOC_DEFS,
  DOC_GROUPS,
  defaultPolicy,
  isBlocking,
  localISO,
  addDays,
  normDate,
  expiries,
  docState,
  assess,
  crewReadiness,
  readinessBand,
  encodeVerify,
  decodeVerify,
  verifyPayloadFrom,
  sampleDossier,
  QR_DEFS,
} from './docs.js';
import {
  COLLECTIONS,
  SCHEMA_VERSION,
  collOf,
  track,
  sigsOf,
  migrate,
  toSheets,
  fromSheets,
  merge,
  statTotals,
  keyOf,
  sheetsToWorkbook,
  workbookToSheets,
} from './backup.js';

/* ===== utilities ===== */
const $ = (s) => document.querySelector(s);
const TODAY = Math.min(new Date().getDate(), 30);
let day = TODAY,
  view = sessionStorage.getItem('dcas_view') || 'dashboard',
  cmdShift = new Date().getHours() >= 5 && new Date().getHours() < 16 ? 'D' : 'N';
let stfFilter = 'all',
  chFilter = 'all',
  achFilter = 'all',
  initFilter = 'all',
  shiftFilter = 'all';
const CODES = { D: { l: 'Day' }, N: { l: 'Night' }, X: { l: 'Off' }, AL: { l: 'Leave' } };
const shiftOn = (s, d) => s.shifts[d - 1] || 'X';
const isDuty = (c) => c === 'D' || c === 'N';
let STAFF = ROSTER.staff;

/* ===== storage ===== */
const Store = (() => {
  let mem = {},
    ok = true;
  try {
    localStorage.setItem('__t', '1');
    localStorage.removeItem('__t');
  } catch (e) {
    ok = false;
  }
  return {
    get: (k) => {
      try {
        return ok ? localStorage.getItem(k) : k in mem ? mem[k] : null;
      } catch (e) {
        return k in mem ? mem[k] : null;
      }
    },
    set: (k, v) => {
      try {
        ok ? localStorage.setItem(k, v) : (mem[k] = v);
      } catch (e) {
        mem[k] = v;
      }
    },
    del: (k) => {
      try {
        ok ? localStorage.removeItem(k) : delete mem[k];
      } catch (e) {
        delete mem[k];
      }
    },
  };
})();
let challenges = JSON.parse(Store.get('dcas_ch') || '[]');
let reports = JSON.parse(Store.get('dcas_rep') || '[]');
let achievements = JSON.parse(Store.get('dcas_ach') || '[]');
let initiatives = JSON.parse(Store.get('dcas_init') || '[]');
let certifications = JSON.parse(Store.get('dcas_cert') || '[]');
let shiftReports = JSON.parse(Store.get('dcas_shift') || '[]');
let notifLog = JSON.parse(Store.get('dcas_notif') || '{}');
let policy = JSON.parse(Store.get('dcas_policy') || 'null') || defaultPolicy();

/* ===== change tracking (backup & merge) =====
 * Every save goes through persist(): changed records get updatedAt, deletions leave a
 * tombstone, and real (non-sample) changes count toward the "back up" reminder. */
const LISTS = {
  challenges: () => challenges,
  reports: () => reports,
  achievements: () => achievements,
  initiatives: () => initiatives,
  certifications: () => certifications,
  shiftReports: () => shiftReports,
};
const listState = () => {
  const o = {};
  COLLECTIONS.forEach((c) => (o[c.k] = LISTS[c.k]()));
  return o;
};
if ((+Store.get('dcas_schema') || 0) < SCHEMA_VERSION) {
  migrate(listState(), +Store.get('dcas_schema') || 0);
  COLLECTIONS.forEach((c) => Store.set(c.store, JSON.stringify(LISTS[c.k]())));
  Store.set('dcas_schema', String(SCHEMA_VERSION));
}
let sigStore = JSON.parse(Store.get('dcas_sigs') || 'null');
if (!sigStore) {
  sigStore = {};
  COLLECTIONS.forEach((c) => (sigStore[c.k] = sigsOf(c, LISTS[c.k]())));
  Store.set('dcas_sigs', JSON.stringify(sigStore));
}
let tombs = JSON.parse(Store.get('dcas_tomb') || '{}');
const dirtyCount = () => +Store.get('dcas_dirty') || 0;
function persist(k) {
  const c = collOf(k),
    list = LISTS[k](),
    now = Date.now();
  const r = track(c, list, sigStore[k] || {}, now);
  sigStore[k] = r.sigs;
  const t = (tombs[k] = tombs[k] || {});
  r.deleted.forEach((key) => (t[key] = now));
  Object.keys(t).forEach((key) => {
    if (key in r.sigs) delete t[key];
  });
  Store.set(c.store, JSON.stringify(list));
  Store.set('dcas_sigs', JSON.stringify(sigStore));
  Store.set('dcas_tomb', JSON.stringify(tombs));
  if (r.changed) Store.set('dcas_dirty', String(dirtyCount() + r.changed));
}
const saveCh = () => persist('challenges');
const saveRep = () => persist('reports');
const saveAch = () => persist('achievements');
const saveInit = () => persist('initiatives');
const saveShiftR = () => persist('shiftReports');
const saveCert = () => {
  persist('certifications');
  _expCache = null;
};
const saveNotif = () => Store.set('dcas_notif', JSON.stringify(notifLog));

/* ===== staff documents: lookups, dates, readiness ===== */
const nowISO = () => localISO();
const rosterStart = () =>
  localISO(new Date(ROSTER.year || 2026, ROSTER.monthIndex == null ? 5 : ROSTER.monthIndex, 1));
const rosterISO = (d) => addDays(rosterStart(), d - 1);
const dayLabel = (d) =>
  new Date(
    ROSTER.year || 2026,
    ROSTER.monthIndex == null ? 5 : ROSTER.monthIndex,
    d,
  ).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
const findStaff = (id, team) =>
  STAFF.filter((x) => x.id === id && x.team === team)[0] || STAFF.filter((x) => x.id === id)[0];
const teamSics = (team) =>
  STAFF.filter((s) => s.team === team && (s.title === 'SIC' || s.callsign === 'Supervisor'));
let _expCache = null;
function expsOf(s) {
  if (!_expCache) {
    _expCache = {};
    certifications.forEach((r) => {
      const e = expiries(r.certs);
      _expCache[r.staffTeam + '|' + r.staffId] = e;
      if (!_expCache['|' + r.staffId]) _expCache['|' + r.staffId] = e;
    });
  }
  return _expCache[s.team + '|' + s.id] || _expCache['|' + s.id] || {};
}
const hasRecord = (s) => !!getStaffCerts(s.id, s.team);
const staffAssess = (s, asOf) => assess(s, expsOf(s), asOf || nowISO(), policy);
const shiftCrew = (d, code) => STAFF.filter((s) => shiftOn(s, d) === code);
const shiftReadiness = (d, code) => crewReadiness(shiftCrew(d, code), expsOf, rosterISO(d), policy);
const tierText = (a) =>
  a.days < 0
    ? 'expired ' + fmtD(a.exp)
    : a.days === 0
      ? 'expires today'
      : 'expires ' + fmtD(a.exp) + ' (' + a.days + 'd)';

function seedSample(force) {
  reports = [
    {
      id: uid(),
      month: '2026-01',
      cases: 420,
      resp: 3.5,
      rosc: 9,
      refusals: 35,
      transfers: 180,
      sample: 1,
    },
    {
      id: uid(),
      month: '2026-02',
      cases: 390,
      resp: 3.3,
      rosc: 11,
      refusals: 30,
      transfers: 165,
      sample: 1,
    },
    {
      id: uid(),
      month: '2026-03',
      cases: 455,
      resp: 3.2,
      rosc: 13,
      refusals: 38,
      transfers: 195,
      sample: 1,
    },
    {
      id: uid(),
      month: '2026-04',
      cases: 410,
      resp: 3.4,
      rosc: 10,
      refusals: 33,
      transfers: 172,
      sample: 1,
    },
    {
      id: uid(),
      month: '2026-05',
      cases: 478,
      resp: 3.6,
      rosc: 14,
      refusals: 41,
      transfers: 205,
      sample: 1,
    },
  ];
  challenges = [
    {
      id: uid(),
      date: '2026-06-02',
      category: 'Equipment',
      location: 'AMC-D',
      description: 'Radio dead zone reported in AMC-D',
      priority: 'High',
      owner: 'Moayyad Darweesh',
      status: 'In progress',
      createdAt: Date.now(),
    },
    {
      id: uid(),
      date: '2026-06-04',
      category: 'Equipment',
      location: 'AP 21 / AP 10',
      description: 'No refrigerator in AP 21 and AP 10!',
      priority: 'Medium',
      owner: '',
      status: 'Open',
      createdAt: Date.now() - 1,
    },
    {
      id: uid(),
      date: '2026-06-03',
      category: 'Equipment',
      location: 'DXB / DWC',
      description:
        'The DNATA fuel tag is not valid for any ambulance vehicles at the DXB and DWC fuel stations.',
      priority: 'High',
      owner: '',
      status: 'Open',
      createdAt: Date.now() - 2,
    },
  ];
  initiatives = [
    {
      id: uid(),
      title: 'Automate department paperwork',
      desc: 'Replace paper handover forms with digital forms linked to a central record.',
      cat: 'Digital transformation',
      status: 'progress',
      owner: 'Soliman Anas',
      ownerId: '2238',
      startDate: '2026-06-01',
      completedDate: '',
      impact: 'Cut processing time, improve accuracy.',
      createdAt: Date.now(),
    },
    {
      id: uid(),
      title: 'Optimise first-aid point distribution',
      desc: 'Use station + case data to position first-aid points by terminal demand.',
      cat: 'Field operations',
      status: 'proposed',
      owner: '',
      ownerId: '',
      startDate: '2026-06-01',
      completedDate: '',
      impact: 'Faster emergency response.',
      createdAt: Date.now() - 1,
    },
  ];
  achievements = [
    {
      id: uid(),
      staffName: 'Soliman Anas',
      staffId: '2238',
      title: 'Built the airport operations platform',
      desc: 'Developed this internal operations & documentation platform.',
      cat: 'Individual initiative',
      date: '2026-06-05',
      notes: '',
      createdAt: Date.now(),
    },
  ];
  certifications = seedDocs();
  notifLog = {};
  saveNotif();
  shiftReports = [
    {
      id: uid(),
      date: '2026-06-06',
      shift: 'Day',
      team: 'A',
      sicName: 'Soliman Anas',
      casesHandled: 8,
      transfers: 3,
      refusals: 1,
      roscCount: 1,
      staffPresent: STAFF.filter((s) => s.team === 'A')
        .slice(0, 4)
        .map((s) => s.id),
      staffingShortages: '',
      equipmentIssues: '',
      pendingIncidents: '',
      notes: 'Smooth shift. All stations covered.',
      linkedChallenges: [],
      createdAt: Date.now() - 86400000,
      updatedAt: Date.now() - 86400000,
    },
    {
      id: uid(),
      date: '2026-06-06',
      shift: 'Night',
      team: 'B',
      sicName: '',
      casesHandled: 5,
      transfers: 2,
      refusals: 0,
      roscCount: 0,
      staffPresent: STAFF.filter((s) => s.team === 'B')
        .slice(0, 3)
        .map((s) => s.id),
      staffingShortages: 'Short 1 medic on Terminal 3',
      equipmentIssues: 'Portable radio #7 battery low',
      pendingIncidents: '',
      notes: '',
      linkedChallenges: [],
      createdAt: Date.now() - 43200000,
      updatedAt: Date.now() - 43200000,
    },
  ];
  saveCert();
  saveRep();
  saveCh();
  saveInit();
  saveAch();
  saveShiftR();
  Store.set('dcas_seeded', '1');
  Store.set('dcas_docs_v', '1');
  Store.set('dcas_dirty', '0');
  if (force) {
    go('dashboard');
    runAlertEngine();
    toast('Sample data loaded');
  }
}
/* Demo document set for every roster member (anonymised roster → sample records only). */
function seedDocs() {
  const now = nowISO(),
    start = rosterStart();
  return STAFF.map((s) =>
    Object.assign({ staffId: s.id, staffTeam: s.team, sample: 1 }, sampleDossier(s, now, start)),
  );
}

let toastTimer;
function toast(m) {
  const t = $('#toast');
  t.textContent = m;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

/* ===== navigation ===== */
function go(v) {
  view = v;
  sessionStorage.setItem('dcas_view', v);
  document.querySelectorAll('.view').forEach((x) => x.classList.remove('active'));
  const el = $('#view-' + v);
  if (el) el.classList.add('active');
  const nm = {
    staff: 'more',
    reports: 'more',
    analytics: 'more',
    achievements: 'more',
    initiatives: 'more',
    upload: 'more',
    settings: 'more',
    shift: 'more',
    docs: 'more',
    readiness: 'more',
  };
  document
    .querySelectorAll('.nav button')
    .forEach((b) => b.classList.toggle('active', b.dataset.v === (nm[v] || v)));
  $('#fab').classList.toggle(
    'show',
    ['challenges', 'achievements', 'initiatives', 'reports', 'shift'].indexOf(v) >= 0,
  );
  window.scrollTo({ top: 0, behavior: 'smooth' });
  const r = {
    dashboard: renderDashboard,
    command: renderCommand,
    roster: renderRoster,
    challenges: renderChallenges,
    staff: renderStaff,
    reports: renderReports,
    analytics: renderAnalytics,
    achievements: renderAch,
    initiatives: renderInit,
    upload: renderUpload,
    settings: renderSettings,
    shift: renderShift,
    docs: renderDocs,
    readiness: renderReadiness,
  };
  if (r[v]) r[v]();
}
function onFab() {
  (
    ({
      challenges: () => editChallenge(null),
      achievements: () => editAch(null),
      initiatives: () => editInit(null),
      reports: () => editReport(null),
      shift: () => editShift(null),
    })[view] || function () {}
  )();
}
function stepDay(n) {
  day = Math.min(30, Math.max(1, day + n));
  refreshDay();
}
function setDay(d) {
  day = d;
  refreshDay();
}
function refreshDay() {
  if (view === 'dashboard') renderDashboard();
  if (view === 'command') renderCommand();
  if (view === 'roster') renderRoster();
  if (view === 'readiness') renderReadiness();
}

/* ===== derived ops data ===== */
function stationsList() {
  const m = {};
  STAFF.filter((s) => s.stationNo).forEach((s) => {
    const k = s.airport + '\u00b7' + s.stationNo;
    if (!m[k])
      m[k] = {
        airport: s.airport,
        terminal: s.terminal,
        area: s.area,
        no: s.stationNo,
        callsign: s.callsign,
        crew: [],
      };
    m[k].crew.push(s);
  });
  return Object.values(m).sort(
    (a, b) => (UNIT_ORDER[a.callsign] || 99) - (UNIT_ORDER[b.callsign] || 99),
  );
}
const TERMS = [
  ['Terminal 1', 'DXB', 'Terminal 1'],
  ['Terminal 2', 'DXB', 'Terminal 2'],
  ['Terminal 3', 'DXB', 'Terminal 3'],
  ['Al-Maktoum', 'DWC', null],
];
const normTerm = (t) => (t || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const UNIT_ORDER = {
  'AIRPORT 10': 1,
  'AIRPORT 12': 2,
  'AIRPORT 14': 3,
  'AIRPORT 20': 4,
  'AIRPORT 21': 5,
  'AIRPORT 30': 6,
  'AIRPORT 32': 7,
  'AIRPORT 33': 8,
  'AIRPORT 37': 9,
  'AIRPORT 35': 10,
  'AIRPORT 36': 11,
  'AIRPORT 11': 12,
  'AIRPORT 13': 13,
  'AIRPORT 40': 14,
  'AIRPORT 41': 15,
};
function terminalCoverage(d, shiftCode) {
  const all = stationsList();
  const code = shiftCode || (isDuty('D') ? 'D' : 'N');
  return TERMS.map((t) => {
    const label = t[0],
      ap = t[1],
      term = t[2];
    const sts = all.filter(
      (s) => s.airport === ap && (term ? normTerm(s.terminal) === normTerm(term) : true),
    );
    let covered = 0,
      headcount = 0;
    sts.forEach((s) => {
      const on = s.crew.filter((c) => shiftOn(c, d) === code);
      headcount += on.length;
      if (on.length) covered++;
    });
    const gaps = sts.length - covered;
    return {
      label: label,
      ap: ap,
      term: term,
      stations: sts.length,
      covered: covered,
      gaps: gaps,
      headcount: headcount,
      status: gaps === 0 ? 'ok' : gaps <= 1 ? 'short' : 'crit',
    };
  });
}
function singleMedicUnits(d) {
  return stationsList()
    .map((s) => {
      const on = s.crew.filter((c) => isDuty(shiftOn(c, d)));
      return { ...s, onDuty: on, count: on.length };
    })
    .filter((s) => s.count === 1);
}
function teamCode(t, d) {
  const c = {};
  STAFF.filter((s) => s.team === t).forEach((s) => {
    const x = shiftOn(s, d);
    c[x] = (c[x] || 0) + 1;
  });
  return Object.entries(c).sort((a, b) => b[1] - a[1])[0][0];
}

/* ===== dashboard ===== */
function latestReport() {
  return reports
    .slice()
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-1)[0];
}
function prevReport() {
  const s = reports.slice().sort((a, b) => a.month.localeCompare(b.month));
  return s[s.length - 2];
}
function mLabel(m) {
  if (!m) return '';
  const p = m.split('-');
  return new Date(p[0], p[1] - 1, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

function renderDashboard() {
  renderBackupNudge();
  $('#dsDate').textContent = 'June ' + day;
  $('#dsWd').textContent = dateOf(day).toLocaleDateString('en-US', { weekday: 'long' });
  $('#dsToday').classList.toggle('show', day !== TODAY);
  const onDuty = STAFF.filter((s) => isDuty(shiftOn(s, day))).length;
  const dashShift = new Date().getHours() >= 5 && new Date().getHours() < 16 ? 'D' : 'N';
  const cov = terminalCoverage(day, dashShift);
  const totStations = cov.reduce((a, c) => a + c.stations, 0),
    totCov = cov.reduce((a, c) => a + c.covered, 0);
  const covPct = Math.round((totCov / totStations) * 100);
  const openIssues = challenges.filter((c) => c.status !== 'Resolved').length;
  const avail = Math.round((onDuty / STAFF.length) * 100);

  const alerts = currentAlerts(nowISO()).filter((a) => a.tier !== 'missing');
  const uniqueExpired = alerts.filter((a) => a.tier === 'expired').length;
  const uniqueSoon = alerts.filter((a) => a.tier !== 'expired').length;

  const bandItems = [
    { n: onDuty, l: 'On duty', dot: true, cls: 'good' },
    { n: totCov + '/' + totStations, l: 'Stations' },
    { n: covPct + '%', l: 'Coverage', cls: covPct >= 90 ? 'good' : covPct >= 70 ? 'warn' : 'bad' },
    { n: openIssues, l: 'Open issues', cls: openIssues ? 'warn' : 'good' },
  ];
  const colors = ['#ef4358', '#5f96e2', '#41b970', '#e3a531'];

  $('#liveband').innerHTML =
    '<div class="lb-grid">' +
    bandItems
      .map(
        (b, i) =>
          '<div class="lb-item" style="--accent:' +
          colors[i] +
          '"><div class="lb-n ' +
          (b.cls || '') +
          '">' +
          (b.dot ? '<span class="lb-dot"></span>' : '') +
          esc(b.n) +
          '</div><div class="lb-l">' +
          b.l +
          '</div></div>',
      )
      .join('') +
    '</div>' +
    (uniqueExpired || uniqueSoon
      ? '<div class="lb-cert" data-act="go" data-v="docs">' +
        (uniqueExpired
          ? '<span class="lb-badge lb-bad">' + uniqueExpired + ' expired</span>'
          : '') +
        (uniqueSoon
          ? '<span class="lb-badge lb-warn">' + uniqueSoon + ' due \u2264 60 days</span>'
          : '') +
        '<span class="lb-cert-l">Documents \u2192</span></div>'
      : '');
  renderDashReady(dashShift);

  const todayStr = today();
  const h = new Date().getHours();
  const todayShift = h >= 5 && h < 16 ? 'Day' : 'Night';
  const shiftActive = todayShift === 'Day' ? h >= 14 : h >= 3 || h < 5;
  const hasTodayReport = shiftReports.some((r) => r.date === todayStr && r.shift === todayShift);
  $('#shiftNudge').innerHTML = '';

  const r = latestReport(),
    p = prevReport();
  $('#repMonthLbl').textContent = r ? mLabel(r.month) : 'no reports yet';

  const trend = (cur, prev, inv) => {
    if (prev == null || cur == null) return '';
    const up = cur >= prev;
    const good = inv ? !up : up;
    return (
      '<div class="trend ' +
      (good ? 'up' : 'down') +
      '">' +
      (up ? '\u25b2' : '\u25bc') +
      ' ' +
      Math.abs(cur - prev).toFixed(inv ? 1 : 0) +
      '</div>'
    );
  };

  const cards = [
    {
      n: r ? r.cases : '\u2014',
      l: 'Cases this month',
      ic: 'M22 12h-4l-3 9L9 3l-3 9H2',
      c: 'red',
      t: r && p ? trend(r.cases, p.cases) : '',
    },
    {
      n: r ? r.resp : '\u2014',
      u: 'min',
      l: 'Avg response time',
      ic: 'M12 7v5l3 2M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z',
      c: 'blue',
      t: r && p ? trend(r.resp, p.resp, true) : '',
    },
    {
      n: r ? r.rosc : '\u2014',
      l: 'ROSC cases',
      ic: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z',
      c: 'green',
      t: r && p ? trend(r.rosc, p.rosc) : '',
    },
    {
      n: avail,
      u: '%',
      l: 'Staff availability',
      ic: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
      c: 'amber',
    },
    {
      n: openIssues,
      l: 'Open challenges',
      ic: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h0',
      c: 'red',
    },
    {
      n: initiatives.filter((i) => i.status !== 'done').length,
      l: 'Active initiatives',
      ic: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
      c: 'night',
    },
  ];
  const cmap = {
    red: ['var(--red-soft)', 'var(--red-d)'],
    blue: ['var(--blue-soft)', 'var(--blue)'],
    green: ['var(--green-soft)', 'var(--green)'],
    amber: ['var(--amber-soft)', 'var(--amber)'],
    night: ['var(--night-soft)', 'var(--night)'],
  };
  const kpis = cards
    .map(
      (c, i) =>
        '<div class="kpi" style="--i:' +
        i +
        '"><div class="kpi-accent" style="background:' +
        cmap[c.c][1] +
        '"></div><div class="kpi-body"><div class="kpi-top"><div class="kpi-n">' +
        esc(c.n) +
        (c.u ? '<span class="kpi-unit">' + c.u + '</span>' : '') +
        '</div><div class="kpi-ic" style="background:' +
        cmap[c.c][0] +
        ';color:' +
        cmap[c.c][1] +
        '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="' +
        c.ic +
        '"/></svg></div></div><div class="kpi-l">' +
        c.l +
        '</div>' +
        (c.t || '') +
        '</div></div>',
    )
    .join('');
  $('#mgmtKpis').innerHTML = kpis;

  $('#dashSpark').innerHTML = sparkline(
    reports
      .slice()
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((x) => ({ x: x.month.slice(5), y: x.resp })),
  );

  $('#dashCoverage').innerHTML =
    '<div class="cov-list">' + cov.map((c, i) => covRow(c, i)).join('') + '</div>';
}
/* ===== shift readiness (dashboard card) ===== */
const BAND_TXT = { ok: 'Ready', watch: 'Watch', risk: 'At risk', none: 'No crew' };
const bandPill = (band) =>
  '<span class="status-pill ' +
  { ok: 'sp-ok', watch: 'sp-short', risk: 'sp-crit', none: 'sp-none' }[band] +
  '"><span class="d"></span>' +
  BAND_TXT[band] +
  '</span>';
function hmCell(d, code, r) {
  const band = readinessBand(r.pct);
  return (
    '<button class="hm-cell b-' +
    band +
    '" data-act="ready-shift" data-d="' +
    d +
    '" data-c="' +
    code +
    '" title="' +
    esc(
      dayLabel(d) +
        ' \u00b7 ' +
        CODES[code].l +
        ': ' +
        (r.pct == null ? 'no crew' : r.pct + '% ready (' + r.ready + '/' + r.crew + ')'),
    ) +
    '" aria-label="' +
    esc(
      dayLabel(d) +
        ' ' +
        CODES[code].l +
        ' shift, ' +
        (r.pct == null
          ? 'no crew'
          : r.pct + ' percent ready, ' + r.ready + ' of ' + r.crew + ' crew'),
    ) +
    '"><span class="hm-s">' +
    code +
    '</span><span class="hm-v">' +
    (r.pct == null ? '\u2014' : r.pct + (band === 'risk' ? '!' : '')) +
    '</span></button>'
  );
}
function renderDashReady(code) {
  const r = shiftReadiness(day, code);
  const band = readinessBand(r.pct);
  let strip = '';
  for (let d = day; d < Math.min(30, day + 6) + 1; d++)
    strip +=
      '<div class="hm-day' +
      (d === day ? ' sel' : '') +
      '"><div class="hm-dn">' +
      d +
      '</div>' +
      hmCell(d, 'D', shiftReadiness(d, 'D')) +
      hmCell(d, 'N', shiftReadiness(d, 'N')) +
      '</div>';
  const blockedDocs = {};
  r.rows.forEach((x) =>
    x.a.blockers.forEach((b) => (blockedDocs[b.def.sl] = (blockedDocs[b.def.sl] || 0) + 1)),
  );
  const top = Object.entries(blockedDocs).sort((a, b) => b[1] - a[1]);
  $('#dashReady').innerHTML =
    '<div class="rd-top" data-act="ready-shift" data-d="' +
    day +
    '" data-c="' +
    code +
    '"><div class="rd-n">' +
    (r.pct == null ? '\u2014' : r.pct + '<span class="kpi-unit">%</span>') +
    '</div><div class="rd-meta"><div class="rd-t">' +
    CODES[code].l +
    ' shift \u00b7 ' +
    esc(dayLabel(day)) +
    ' ' +
    bandPill(band) +
    '</div><div class="rd-s">' +
    r.ready +
    '/' +
    r.crew +
    ' crew with valid licenses & documents' +
    (top.length
      ? ' \u00b7 blocked by ' +
        top
          .slice(0, 3)
          .map((t) => esc(t[0]) + ' (' + t[1] + ')')
          .join(', ')
      : '') +
    '</div></div></div><div class="hm-strip">' +
    strip +
    '</div>';
}
function covRow(c, i) {
  const pct = c.stations ? Math.round((c.covered / c.stations) * 100) : 0;
  const sp =
    c.status === 'ok'
      ? ['sp-ok', 'Covered']
      : c.status === 'short'
        ? ['sp-short', 'Short ' + c.gaps]
        : ['sp-crit', 'Critical ' + c.gaps];
  return (
    '<div class="cov-row" style="--i:' +
    (i || 0) +
    '" data-act="term" data-ap="' +
    c.ap +
    '" data-term="' +
    esc(c.term || '') +
    '">' +
    '<div class="cov-bar"><div class="cov-fill" style="width:' +
    pct +
    '%"></div></div>' +
    '<div class="cov-body"><div class="cov-top"><div class="cov-name">' +
    esc(c.label) +
    '</div><span class="status-pill ' +
    sp[0] +
    '"><span class="d"></span>' +
    sp[1] +
    '</span></div>' +
    '<div class="cov-meta">' +
    c.covered +
    '/' +
    c.stations +
    ' stations \u00b7 ' +
    c.headcount +
    ' on duty</div></div></div>'
  );
}

/* ===== command center ===== */
function renderCommand() {
  const shiftLabel = cmdShift === 'D' ? 'Day' : 'Night';
  $('#cmdDayLbl').textContent = shiftLabel + ' shift \u00b7 June ' + day;
  document.querySelectorAll('#cmdShiftSel .shift-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.shift === cmdShift);
  });
  const cov = terminalCoverage(day, cmdShift);
  $('#termMap').innerHTML = cov
    .map((c) => {
      const z = c.status === 'ok' ? 'z-ok' : c.status === 'short' ? 'z-short' : 'z-crit';
      const badge =
        c.status === 'ok' ? 'Covered' : c.status === 'short' ? 'Short ' + c.gaps : 'Critical';
      return (
        '<div class="zone ' +
        z +
        '" data-act="term" data-ap="' +
        c.ap +
        '" data-term="' +
        esc(c.term || '') +
        '">' +
        '<div><div class="zt">' +
        esc(c.label) +
        '</div><div class="zs">' +
        (c.term ? c.ap : 'DWC') +
        '</div></div>' +
        '<div><span class="zbadge">' +
        badge +
        '</span><div class="zmeta" style="margin-top:8px">' +
        c.stations +
        ' Units \u00b7 ' +
        c.headcount +
        ' Medics</div></div></div>'
      );
    })
    .join('');
  $('#cmdCoverage').innerHTML = cov
    .map((c) => {
      const variance = c.headcount - c.stations;
      const sp =
        c.status === 'ok'
          ? ['sp-ok', 'Covered']
          : c.status === 'short'
            ? ['sp-short', 'Short']
            : ['sp-crit', 'Critical'];
      return (
        '<div class="cov-row" data-act="term" data-ap="' +
        c.ap +
        '" data-term="' +
        esc(c.term || '') +
        '">' +
        '<div class="cov-name"><div class="t">' +
        esc(c.label) +
        '</div><div class="s">' +
        c.stations +
        ' Units \u00b7 ' +
        c.headcount +
        ' Medics on duty</div></div>' +
        '<span class="status-pill ' +
        sp[0] +
        '" style="margin-left:10px"><span class="d"></span>' +
        sp[1] +
        '</span></div>'
      );
    })
    .join('');
  $('#cmdReady').innerHTML = shiftReadyHtml(day, cmdShift);
  const sm = singleMedicUnits(day);
  const smCard = $('#singleMedicCard');
  smCard.style.display = sm.length ? '' : 'none';
  $('#cmdSingleMedic').innerHTML = sm.length
    ? sm
        .map(
          (s, i) =>
            '<div class="smu-row" style="animation-delay:' +
            i * 0.05 +
            's">' +
            '<span class="callsign smu-cs">' +
            esc(s.callsign) +
            '</span>' +
            '<div class="smu-info">' +
            '<div class="smu-name">' +
            esc(dispName(s.onDuty[0].name)) +
            '</div>' +
            '<div class="smu-meta">' +
            esc(s.area || s.terminal || s.airport) +
            ' \u00b7 ' +
            CODES[shiftOn(s.onDuty[0], day)].l +
            '</div></div>' +
            '<div class="smu-alert">1 medic</div></div>',
        )
        .join('')
    : '';
}
function viewTerminal(ap, term) {
  const sts = stationsList().filter(
    (s) => s.airport === ap && (term ? normTerm(s.terminal) === normTerm(term) : true),
  );
  const label = term || 'Al-Maktoum (DWC)';
  const issues = challenges.filter(
    (c) =>
      c.status !== 'Resolved' &&
      (c.location || '').toLowerCase().indexOf((term || 'maktoum').toLowerCase().split(' ')[0]) >=
        0,
  );
  const h = sts
    .map((s) => {
      const on = s.crew.filter((c) => isDuty(shiftOn(c, day)));
      return (
        '<div style="padding:11px 0;border-top:1px solid var(--line)">' +
        '<div style="display:flex;align-items:center;gap:10px"><span class="callsign">' +
        esc(s.callsign) +
        '</span>' +
        '<div style="flex:1"><div style="font-size:13.5px;font-weight:700">' +
        esc(s.area || s.airport) +
        '</div></div>' +
        '<span class="status-pill ' +
        (on.length ? 'sp-ok' : 'sp-crit') +
        '"><span class="d"></span>' +
        (on.length ? on.length + ' on duty' : 'gap') +
        '</span></div>' +
        (on.length
          ? '<div class="crewline" style="margin-top:9px">' +
            on
              .map(
                (c) =>
                  '<span class="crew-pill" data-act="staff" data-id="' +
                  esc(c.id) +
                  '" data-team="' +
                  esc(c.team) +
                  '"><span class="tdot ' +
                  c.team +
                  '">' +
                  c.team +
                  '</span>' +
                  esc(dispName(c.name)) +
                  ' <span class="scode sc-' +
                  shiftOn(c, day) +
                  '" style="padding:2px 5px">' +
                  shiftOn(c, day) +
                  '</span></span>',
              )
              .join('') +
            '</div>'
          : '') +
        '</div>'
      );
    })
    .join('');
  openSheet(
    label + ' \u00b7 June ' + day,
    det(
      'Coverage',
      sts.filter((s) => s.crew.some((c) => isDuty(shiftOn(c, day)))).length +
        '/' +
        sts.length +
        ' stations covered',
    ) +
      (issues.length
        ? det(
            'Open challenges',
            issues
              .map(
                (i) =>
                  '<div style="margin-bottom:6px"><span class="pri pri-' +
                  i.priority +
                  '">' +
                  i.priority +
                  '</span> ' +
                  esc(i.description) +
                  '</div>',
              )
              .join(''),
          )
        : '') +
      '<div class="det-row"><div class="k">Stations</div>' +
      h +
      '</div>',
  );
}

/* ===== roster ===== */
function renderRoster() {
  $('#rosMonth').textContent = ROSTER.month;
  $('#rosDay').textContent = 'June ' + day;
  $('#strips').innerHTML = ROSTER.teams
    .map((t) => {
      let h =
        '<div class="strip-row"><div class="rl"><span class="tdot ' +
        t +
        '">' +
        t +
        '</span></div>';
      for (let d = 1; d <= 30; d++) {
        const c = teamCode(t, d);
        h +=
          '<div class="cell c-' +
          c +
          (d === day ? ' sel' : '') +
          '" data-act="setday" data-d="' +
          d +
          '"><span class="cd">' +
          d +
          '</span><span class="cc">' +
          c +
          '</span></div>';
      }
      return h + '</div>';
    })
    .join('');
  const duty = STAFF.filter((s) => isDuty(shiftOn(s, day))).sort((a, b) => {
    const aSup = a.callsign === 'Supervisor',
      bSup = b.callsign === 'Supervisor';
    if (aSup !== bSup) return aSup ? -1 : 1;
    return (UNIT_ORDER[a.callsign] || 99) - (UNIT_ORDER[b.callsign] || 99);
  });
  $('#rosDuty').innerHTML = duty.length
    ? '<p style="font-size:12px;color:var(--muted);margin:0 2px 8px">' +
      duty.length +
      ' staff on duty</p>' +
      duty
        .map((s) => {
          const isSup = s.callsign === 'Supervisor';
          const bg = isSup ? 'var(--red-soft)' : 'var(--night-soft)';
          return (
            '<div class="staff-row" style="padding:8px 0;border-top:1px solid var(--line)" data-act="staff" data-id="' +
            esc(s.id) +
            '" data-team="' +
            esc(s.team) +
            '"><span class="callsign" style="font-size:11px;padding:4px 7px;background:' +
            bg +
            '">' +
            esc(s.callsign) +
            '</span><div class="info"><div class="nm" style="font-size:13.5px">' +
            esc(dispName(s.name)) +
            '</div><div class="sub">' +
            esc(s.area || s.airport) +
            ' \u00b7 Team ' +
            s.team +
            (s.adp ? ' \u00b7 <span style="color:var(--green);font-weight:600">ADP</span>' : '') +
            (s.tdp ? ' \u00b7 <span style="color:var(--blue);font-weight:600">TDP</span>' : '') +
            '</div></div><span class="scode sc-' +
            shiftOn(s, day) +
            '">' +
            CODES[shiftOn(s, day)].l +
            '</span></div>'
          );
        })
        .join('')
    : '<p style="color:var(--muted);font-size:13.5px;margin:4px 2px">No staff on duty this day.</p>';
}

/* ===== staff ===== */
function renderStaff() {
  const q = ($('#stfSearch').value || '').trim().toLowerCase();
  const f = [
    ['all', 'All'],
    ['A', 'Team A'],
    ['B', 'Team B'],
    ['C', 'Team C'],
    ['D', 'Team D'],
    ['SIC', 'Supervisors'],
  ];
  $('#stfChips').innerHTML = f
    .map(
      (x) =>
        '<button class="chip ' +
        (stfFilter === x[0] ? 'active' : '') +
        '" data-act="stf-filter" data-key="' +
        x[0] +
        '">' +
        x[1] +
        '</button>',
    )
    .join('');
  let list = STAFF.slice();
  if (['A', 'B', 'C', 'D'].indexOf(stfFilter) >= 0) list = list.filter((s) => s.team === stfFilter);
  else if (stfFilter === 'SIC') list = list.filter((s) => s.title === 'SIC');
  if (q)
    list = list.filter(
      (s) =>
        (s.name + ' ' + s.id + ' ' + s.callsign + ' ' + s.phone + ' ' + s.area + ' ' + s.terminal)
          .toLowerCase()
          .indexOf(q) >= 0,
    );
  list.sort((a, b) => dispName(a.name).localeCompare(dispName(b.name)));
  $('#stfCount').textContent = STAFF.length + ' staff';
  $('#stfList').innerHTML = list.length
    ? list
        .map((s, i) => {
          const c = shiftOn(s, day);
          return (
            '<div class="rec" style="animation-delay:' +
            Math.min(i, 12) * 0.01 +
            's;padding:12px 14px" data-act="staff" data-id="' +
            esc(s.id) +
            '" data-team="' +
            esc(s.team) +
            '"><div class="staff-row"><div class="avatar">' +
            esc(initials(s.name)) +
            '</div><div class="info"><div class="nm">' +
            esc(dispName(s.name)) +
            '</div><div class="sub"><span class="mono">#' +
            esc(s.id) +
            '</span> \u00b7 <span class="mono">' +
            esc(s.callsign) +
            '</span> \u00b7 ' +
            esc(s.title) +
            ' \u00b7 Team ' +
            s.team +
            (s.adp ? ' \u00b7 <span style="color:var(--green);font-weight:600">ADP</span>' : '') +
            (s.tdp ? ' \u00b7 <span style="color:var(--blue);font-weight:600">TDP</span>' : '') +
            '</div></div><span class="scode sc-' +
            c +
            '">' +
            c +
            '</span></div></div>'
          );
        })
        .join('')
    : emptyState('No staff match');
}
const getStaffCerts = (id, team) =>
  certifications.filter((c) => c.staffId === id && c.staffTeam === team)[0] ||
  certifications.filter((c) => c.staffId === id)[0];
function viewStaff(id, team) {
  const s =
    STAFF.filter((x) => x.id === id && x.team === team)[0] || STAFF.filter((x) => x.id === id)[0];
  if (!s) return;
  const tagT = s.title === 'SIC' ? 'sic' : s.title === 'EMT-A' ? 'ema' : '';
  const cnt = (c) => s.shifts.filter((x) => x === c).length;
  const myAch = achievements.filter(
    (a) =>
      (a.staffId && a.staffId === s.id) ||
      dispName(a.staffName || '').toLowerCase() === dispName(s.name).toLowerCase(),
  );
  const myInit = initiatives.filter(
    (i) =>
      (i.ownerId && i.ownerId === s.id) ||
      dispName(i.owner || '').toLowerCase() === dispName(s.name).toLowerCase(),
  );
  const docs = docsSection(s);
  openSheet(
    dispName(s.name),
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px"><span class="tag ' +
      tagT +
      '">' +
      esc(s.title) +
      '</span><span class="tag team' +
      s.team +
      '">Team ' +
      s.team +
      '</span>' +
      (s.adp ? '<span class="tag">ADP</span>' : '') +
      (s.tdp ? '<span class="tag">TDP</span>' : '') +
      '</div>' +
      docs.banner +
      det(
        'Station',
        '<span class="mono" style="color:var(--red-d);font-weight:600">' +
          esc(s.callsign) +
          '</span> \u00b7 ' +
          esc(
            [s.airport === 'DWC' ? 'Al-Maktoum (DWC)' : s.airport, s.terminal, s.area]
              .filter(Boolean)
              .join(' \u00b7 '),
          ),
      ) +
      det('Staff ID', '<span class="mono">' + esc(s.id) + '</span>') +
      det(
        'Phone',
        '<a class="callbtn" href="' +
          esc(telOf(s.phone)) +
          '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2z"/></svg>' +
          esc(s.phone) +
          '</a>',
      ) +
      docs.body +
      det(
        'Attendance \u2014 June',
        '<span style="color:var(--day);font-weight:600">' +
          cnt('D') +
          ' day</span> \u00b7 <span style="color:var(--night);font-weight:600">' +
          cnt('N') +
          ' night</span> \u00b7 ' +
          cnt('X') +
          ' off' +
          (cnt('AL')
            ? ' \u00b7 <span style="color:var(--leave);font-weight:600">' +
              cnt('AL') +
              ' leave</span>'
            : ''),
      ) +
      (s.remark
        ? det(
            'Note',
            '<span style="color:var(--leave);font-weight:600">' + esc(s.remark) + '</span>',
          )
        : '') +
      det(
        'Achievements',
        myAch.length
          ? myAch
              .map(
                (a) =>
                  '<div style="margin-bottom:6px">\u2022 ' +
                  esc(a.title) +
                  ' <span style="color:var(--muted);font-size:12px">(' +
                  fmtD(a.date) +
                  ')</span></div>',
              )
              .join('')
          : '<span style="color:var(--muted)">None recorded yet</span>',
      ) +
      det(
        'Initiatives',
        myInit.length
          ? myInit
              .map((i) => '<div style="margin-bottom:6px">\u2022 ' + esc(i.title) + '</div>')
              .join('')
          : '<span style="color:var(--muted)">None</span>',
      ) +
      det('Shift schedule \u2014 June 2026', miniCal(s)),
  );
}
function miniCal(s) {
  let h = '<div class="minical">';
  for (let d = 1; d <= 30; d++) {
    const c = shiftOn(s, d);
    h +=
      '<div class="mc c-' +
      c +
      (d === TODAY ? ' today' : '') +
      '"><div class="d">' +
      d +
      '</div><div class="c">' +
      c +
      '</div></div>';
  }
  return h + '</div>';
}

/* ===== staff documents: profile, editor, QR profile, verification ===== */
const DB_CLS = { expired: 'db-exp', 15: 'db-t15', 30: 'db-t30', 60: 'db-t60' };
function docBadge(st) {
  const d = st.def;
  let cls = 'db-ok',
    txt;
  if (st.state === 'na') ((cls = 'db-na'), (txt = 'N/A'));
  else if (st.state === 'none') ((cls = 'db-na'), (txt = 'not held'));
  else if (st.state === 'missing') ((cls = 'db-miss'), (txt = 'missing'));
  else {
    cls = DB_CLS[st.tier] || 'db-ok';
    txt =
      (d.months ? 'due ' : '') +
      fmtD(st.exp) +
      (st.state === 'expired' ? ' · EXPIRED' : st.tier ? ' · ' + st.days + 'd' : '');
  }
  return (
    '<span class="dbadge ' +
    cls +
    '">' +
    (st.blocking ? '<i class="db-req" title="Required for duty"></i>' : '') +
    esc(d.l) +
    ' <b>' +
    txt +
    '</b></span>'
  );
}
const blockerText = (b) =>
  esc(b.def.l) + ' ' + (b.state === 'missing' ? 'not on file' : 'expired ' + fmtD(b.exp));
function readyBanner(a) {
  return a.ready
    ? '<div class="rbanner rb-ok"><b>Ready for duty</b><span>' +
        (a.watch.length
          ? a.watch.length + ' item(s) need attention soon'
          : 'All required licenses & documents valid') +
        '</span></div>'
    : '<div class="rbanner rb-bad"><b>Not ready for duty</b><span>' +
        a.blockers.map(blockerText).join(' · ') +
        '</span></div>';
}
function qualsHtml(list) {
  return list && list.length
    ? list
        .map(
          (q) =>
            '<div class="ql"><b>' +
            esc(q.title) +
            '</b>' +
            (q.inst ? ' · ' + esc(q.inst) : '') +
            (q.year ? ' · ' + esc(q.year) : '') +
            (q.attested
              ? ' <span class="tag tag-ok">Attested</span>'
              : ' <span class="tag tag-warn">Attestation pending</span>') +
            '</div>',
        )
        .join('')
    : '<span style="color:var(--muted)">None recorded</span>';
}
function trainingHtml(list) {
  if (!list || !list.length) return '<span style="color:var(--muted)">None recorded</span>';
  const hrs = list.reduce((n, t) => n + (+t.hours || 0), 0);
  return (
    '<div class="tl-list">' +
    list
      .slice()
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .map(
        (t) =>
          '<div class="tl"><span class="tl-d mono">' +
          fmtD(t.date) +
          '</span><div><b>' +
          esc(t.course) +
          '</b><div class="tl-m">' +
          esc([t.provider, t.hours ? t.hours + ' h' : ''].filter(Boolean).join(' · ')) +
          '</div></div></div>',
      )
      .join('') +
    '</div>' +
    (hrs ? '<div class="tl-tot">' + hrs + ' training hours on record</div>' : '')
  );
}
function docsSection(s) {
  const a = staffAssess(s);
  const rec = getStaffCerts(s.id, s.team) || {};
  return {
    banner:
      (rec.sample
        ? '<div class="vf-src warn">Demo documents \u2014 sample data, not this medic\u2019s real records</div>'
        : '') + readyBanner(a),
    body:
      DOC_GROUPS.map((g) =>
        det(
          g.t,
          '<div class="dbadges">' +
            a.items
              .filter((i) => i.def.g === g.k)
              .map(docBadge)
              .join('') +
            '</div>',
        ),
      ).join('') +
      det('Academic qualifications', qualsHtml(rec.quals)) +
      det('Training path', trainingHtml(rec.training)) +
      '<div class="btn-row" style="margin:12px 0 4px"><button class="btn btn-ghost" data-act="stf-cert" data-id="' +
      esc(s.id) +
      '" data-team="' +
      esc(s.team) +
      '">Update documents</button><button class="btn btn-primary" data-act="stf-qr" data-id="' +
      esc(s.id) +
      '" data-team="' +
      esc(s.team) +
      '">QR profile</button></div>',
  };
}
const qualRow = (q) =>
  '<div class="erow qual-row"><input class="q-title" placeholder="Qualification" value="' +
  esc(q.title || '') +
  '"><input class="q-inst" placeholder="Institution" value="' +
  esc(q.inst || '') +
  '"><input class="q-year" inputmode="numeric" placeholder="Year" value="' +
  esc(q.year || '') +
  '"><label class="shift-flag"><input type="checkbox" class="q-att"' +
  (q.attested ? ' checked' : '') +
  '>Attested</label><button class="iconbtn erow-del" data-act="row-del" aria-label="Remove">×</button></div>';
const trainRow = (t) =>
  '<div class="erow train-row"><input class="t-course" placeholder="Course" value="' +
  esc(t.course || '') +
  '"><input class="t-prov" placeholder="Provider" value="' +
  esc(t.provider || '') +
  '"><input class="t-date" type="date" value="' +
  esc(t.date || '') +
  '"><input class="t-hours" type="number" min="0" placeholder="Hours" value="' +
  esc(t.hours || '') +
  '"><button class="iconbtn erow-del" data-act="row-del" aria-label="Remove">×</button></div>';
function editStfCerts(id, team) {
  const s = findStaff(id, team);
  if (!s) return;
  const rec = getStaffCerts(id, team) || {};
  const c = rec.certs || {};
  const groups = DOC_GROUPS.map(
    (g) =>
      '<div class="doc-gh">' +
      g.t +
      '</div><div class="doc-grid">' +
      DOC_DEFS.filter((d) => d.g === g.k)
        .map(
          (d) =>
            '<div class="field doc-f"><label>' +
            esc(d.l) +
            (isBlocking(d, s, policy)
              ? ' <span class="req" title="Required for duty">*</span>'
              : '') +
            ' <span class="doc-fs">' +
            (d.months ? 'completed on · valid ' + d.months + ' mo' : 'expiry date') +
            '</span></label><input id="cert-' +
            d.k +
            '" type="date" value="' +
            esc(c[d.k] && c[d.k] !== 'na' ? c[d.k] : '') +
            '">' +
            (d.na
              ? '<label class="shift-flag"><input type="checkbox" id="cert-' +
                d.k +
                '-na"' +
                (c[d.k] === 'na' ? ' checked' : '') +
                '>Not applicable (UAE national)</label>'
              : '') +
            '</div>',
        )
        .join('') +
      '</div>',
  ).join('');
  openSheet(
    'Certifications & documents — ' + dispName(s.name),
    groups +
      '<p class="hint"><span class="req">*</span> required for shift readiness. Leave blank for optional certifications not held.</p>' +
      '<div class="doc-gh">Academic qualifications</div><div id="qualRows">' +
      (rec.quals || []).map(qualRow).join('') +
      '</div><button class="btn btn-ghost btn-sm" data-act="qual-add">+ Add qualification</button>' +
      '<div class="doc-gh">Training path</div><div id="trainRows">' +
      (rec.training || []).map(trainRow).join('') +
      '</div><button class="btn btn-ghost btn-sm" data-act="train-add">+ Add training</button>' +
      '<button class="btn btn-primary" style="margin-top:16px" data-act="stf-cert-save" data-id="' +
      esc(id) +
      '" data-team="' +
      esc(team) +
      '">Save documents</button>',
  );
}
function saveStfCerts(id, team) {
  const certs = {};
  DOC_DEFS.forEach((d) => {
    const na = $('#cert-' + d.k + '-na');
    if (na && na.checked) certs[d.k] = 'na';
    else if ($('#cert-' + d.k).value) certs[d.k] = $('#cert-' + d.k).value;
  });
  const val = (r, c) => r.querySelector(c).value.trim();
  const quals = Array.from(document.querySelectorAll('#qualRows .qual-row'))
    .map((r) => ({
      title: val(r, '.q-title'),
      inst: val(r, '.q-inst'),
      year: val(r, '.q-year'),
      attested: r.querySelector('.q-att').checked,
    }))
    .filter((q) => q.title);
  const training = Array.from(document.querySelectorAll('#trainRows .train-row'))
    .map((r) => ({
      course: val(r, '.t-course'),
      provider: val(r, '.t-prov'),
      date: val(r, '.t-date'),
      hours: +val(r, '.t-hours') || 0,
    }))
    .filter((t) => t.course);
  let rec = getStaffCerts(id, team);
  if (!rec) {
    rec = { staffId: id, staffTeam: team };
    certifications.push(rec);
  }
  Object.assign(rec, { certs, quals, training, updatedAt: Date.now() });
  delete rec.sample;
  saveCert();
  runAlertEngine();
  closeSheet();
  viewStaff(id, team);
  toast('Documents saved');
}

/* --- Medic QR Code Profile --- */
const verifyBase = () =>
  /^https?:$/.test(location.protocol) ? location.origin + location.pathname : 'smartdash:';
const verifyUrl = (s) =>
  verifyBase() +
  '#verify=' +
  encodeVerify({
    id: s.id,
    team: s.team,
    title: s.title,
    name: dispName(s.name),
    asOf: nowISO(),
    exps: expsOf(s),
  });
const VF = {
  valid: ['vf-ok', '✓'],
  watch: ['vf-warn', '!'],
  expired: ['vf-bad', '✕'],
  missing: ['vf-bad', '?'],
  na: ['vf-na', '–'],
};
function vfRow(i) {
  const k =
    i.state === 'valid'
      ? i.tier
        ? 'watch'
        : 'valid'
      : i.state === 'missing' && !i.blocking
        ? 'watch'
        : i.state;
  const v =
    i.state === 'na'
      ? 'N/A'
      : i.state === 'missing'
        ? 'not on file'
        : i.state === 'expired'
          ? (i.def.months ? 'overdue since ' : 'expired ') + fmtD(i.exp)
          : (i.def.months ? 'due ' : 'valid to ') +
            fmtD(i.exp) +
            (i.tier ? ' · ' + i.days + 'd' : '');
  return (
    '<div class="vf-row"><span class="vf-ic ' +
    VF[k][0] +
    '">' +
    VF[k][1] +
    '</span><span class="vf-l">' +
    esc(i.def.l) +
    (i.blocking ? ' <span class="vf-req">required</span>' : '') +
    '</span><span class="vf-v">' +
    v +
    '</span></div>'
  );
}
function verifyCardBody(a) {
  return (
    '<div class="vf-status ' +
    (a.ready ? 'ok' : 'bad') +
    '"><b>' +
    (a.ready ? '✓ READY FOR DUTY' : '✕ NOT READY FOR DUTY') +
    '</b><span>' +
    (a.ready
      ? a.watch.length
        ? a.watch.length + ' item(s) lapse within 15 days'
        : 'All required licenses & documents valid'
      : a.blockers.map(blockerText).join(' · ')) +
    '</span><span class="vf-asof">Checked ' +
    fmtD(nowISO()) +
    '</span></div>' +
    DOC_GROUPS.map((g) => {
      const items = a.items.filter((i) => i.def.g === g.k && i.state !== 'none');
      return items.length
        ? '<div class="vf-g"><div class="vf-gh">' +
            (g.k === 'refresher' ? 'Required refresher courses' : g.t) +
            '</div>' +
            items.map(vfRow).join('') +
            '</div>'
        : '';
    }).join('')
  );
}
function vfHeader(s) {
  return (
    '<div class="staff-row vf-head"><div class="avatar">' +
    esc(initials(s.name)) +
    '</div><div class="info"><div class="nm">' +
    esc(dispName(s.name)) +
    '</div><div class="sub"><span class="mono">#' +
    esc(s.id) +
    '</span> · Team ' +
    esc(s.team) +
    ' · ' +
    esc(s.title) +
    (s.callsign ? ' · <span class="mono">' + esc(s.callsign) + '</span>' : '') +
    '</div></div></div>'
  );
}
function viewQr(id, team) {
  const s = findStaff(id, team);
  if (!s) return;
  openSheet(
    'QR profile — ' + dispName(s.name),
    '<div class="qr-wrap"><div class="qr-box">' +
      qrSvg(verifyUrl(s)) +
      '</div><div class="qr-cap"><b>' +
      esc(dispName(s.name)) +
      '</b><span class="mono">#' +
      esc(s.id) +
      ' · Team ' +
      esc(s.team) +
      ' · ' +
      esc(s.title) +
      '</span><span>Issued ' +
      fmtD(nowISO()) +
      '</span></div></div>' +
      verifyCardBody(staffAssess(s)) +
      '<div class="btn-row" style="margin-top:14px"><button class="btn btn-ghost" data-act="qr-png" data-id="' +
      esc(s.id) +
      '" data-team="' +
      esc(s.team) +
      '">Download badge</button><button class="btn btn-primary" data-act="qr-link" data-id="' +
      esc(s.id) +
      '" data-team="' +
      esc(s.team) +
      '">Copy link</button></div>' +
      '<p class="hint">Supervisors scan this code with any phone camera (or <b>Verify medic</b> in Documents &amp; Alerts) to check readiness, accreditations and refresher courses instantly. Status data travels in the link’s #fragment, which is never sent to a server, and personal documents (Emirates ID, passport, visa) are never included. Only a device holding SmartDash records can verify a badge; re-issue it after renewals.</p>',
  );
}
function downloadQrPng(id, team) {
  const s = findStaff(id, team);
  if (!s) return;
  const img = new Image();
  img.onload = () => {
    const W = 720,
      c = document.createElement('canvas');
    c.width = W;
    c.height = W + 128;
    const g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    g.imageSmoothingEnabled = false;
    g.drawImage(img, 0, 0, W, W);
    g.textAlign = 'center';
    g.fillStyle = '#15202b';
    g.font = '700 34px Sora, sans-serif';
    g.fillText(dispName(s.name), W / 2, W + 38);
    g.fillStyle = '#4a5563';
    g.font = '600 24px "IBM Plex Mono", monospace';
    g.fillText('#' + s.id + ' · Team ' + s.team + ' · ' + s.title, W / 2, W + 76);
    g.font = '500 20px "IBM Plex Sans", sans-serif';
    g.fillText('SmartDash medic profile · issued ' + fmtD(nowISO()), W / 2, W + 108);
    c.toBlob((b) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = 'smartdash-qr-' + s.id + '.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    });
  };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(qrSvg(verifyUrl(s)));
}
function copyQrLink(id, team) {
  const s = findStaff(id, team);
  if (!s) return;
  const url = verifyUrl(s);
  if (navigator.clipboard && navigator.clipboard.writeText)
    navigator.clipboard.writeText(url).then(
      () => toast('Verification link copied'),
      () => toast('Copy not available on this device'),
    );
  else toast('Copy not available on this device');
}
/* Verification card: from a scanned badge (snapshot) or a live lookup. */
function showVerify(p, manual) {
  const s = findStaff(p.id, p.team);
  const live = !!s && hasRecord(s);
  const subject = s || { id: p.id, team: p.team, title: p.title, name: p.name };
  const exps = live ? expsOf(s) : p.exps;
  if (!live && !manual) {
    openSheet(
      'Verify medic',
      vfHeader(subject) +
        '<div class="vf-status bad"><b>\u2715 CANNOT VERIFY ON THIS DEVICE</b><span>No SmartDash record for #' +
        esc(subject.id) +
        ' on this device. Badge contents are not shown because a badge alone cannot prove readiness.</span><span class="vf-asof">Badge issued ' +
        fmtD(p.asOf) +
        '</span></div>' +
        '<p class="hint">Scan again on a supervisor device that holds DCAS records, or check the original licenses and documents.</p>',
    );
    return;
  }
  let diffs = 0;
  if (live && !manual)
    QR_DEFS.forEach((d) => {
      if ((p.exps[d.k] || '') !== (exps[d.k] || '')) diffs++;
    });
  const src = manual
    ? '<div class="vf-src ok">Live record on this device</div>'
    : live
      ? '<div class="vf-src ' +
        (diffs ? 'warn' : 'ok') +
        '">Live record on this device · ' +
        (diffs
          ? 'badge issued ' +
            fmtD(p.asOf) +
            ' is out of date (' +
            diffs +
            ' change' +
            (diffs > 1 ? 's' : '') +
            ') — re-issue it'
          : 'matches badge issued ' + fmtD(p.asOf)) +
        '</div>'
      : '<div class="vf-src warn">Badge snapshot issued ' +
        fmtD(p.asOf) +
        ' · no live record on this device to confirm against</div>';
  openSheet(
    'Verify medic',
    vfHeader(subject) +
      src +
      verifyCardBody(assess(subject, exps, nowISO(), policy)) +
      (s
        ? '<button class="btn btn-ghost" style="margin-top:12px" data-act="staff" data-id="' +
          esc(s.id) +
          '" data-team="' +
          esc(s.team) +
          '">Open full profile</button>'
        : ''),
  );
}
const canScan = () =>
  'BarcodeDetector' in window && !!navigator.mediaDevices && !!navigator.mediaDevices.getUserMedia;
function openScanner() {
  const can = canScan();
  openSheet(
    'Verify medic',
    (can
      ? '<div class="scan-box"><video id="scanVid" playsinline muted></video><div class="scan-frame"></div></div><p class="hint" id="scanMsg">Point the camera at a SmartDash QR badge…</p>'
      : '<p class="hint">In-app scanning isn’t supported in this browser — scan the badge with the phone’s camera app, or look the medic up by staff ID.</p>') +
      '<div class="field"><label>Staff ID</label><input id="verifyId" inputmode="numeric" placeholder="e.g. 0002"></div><button class="btn btn-primary" data-act="verify-id">Verify</button>',
  );
  if (can) startScan();
}
async function startScan() {
  let stream = null,
    timer = 0,
    stopped = false;
  const stop = () => {
    stopped = true;
    clearTimeout(timer);
    if (stream) stream.getTracks().forEach((t) => t.stop());
  };
  sheetCleanup = stop;
  const msg = (t) => {
    const m = $('#scanMsg');
    if (m) m.textContent = t;
  };
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    if (stopped) return stop();
    const v = $('#scanVid');
    v.srcObject = stream;
    await v.play();
    const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
    const tick = async () => {
      if (stopped) return;
      try {
        const codes = await detector.detect(v);
        const hit = codes.filter((c) => c.rawValue.indexOf('verify=') >= 0)[0];
        if (hit) {
          stop();
          sheetCleanup = null;
          const p = decodeVerify(verifyPayloadFrom(hit.rawValue));
          return p ? showVerify(p) : msg('Unreadable SmartDash badge');
        }
        if (codes.length) msg('That QR code is not a SmartDash badge');
      } catch (e) {}
      timer = setTimeout(tick, 250);
    };
    tick();
  } catch (e) {
    msg('Camera unavailable — enter the staff ID instead.');
  }
}
function verifyById() {
  const v = ($('#verifyId').value || '').trim().replace(/^#/, '');
  const n = v.replace(/^0+/, '');
  const s = STAFF.filter((x) => x.id === v || (n && x.id.replace(/^0+/, '') === n))[0];
  if (!s) {
    toast('No staff with ID ' + v);
    return;
  }
  showVerify({ id: s.id, team: s.team, exps: {}, asOf: nowISO() }, true);
}
function handleHash() {
  const h = location.hash || '';
  if (!h) return;
  const clear = () => history.replaceState(null, '', location.pathname + location.search);
  if (h.indexOf('#verify=') === 0) {
    const p = decodeVerify(verifyPayloadFrom(h));
    clear();
    if (p) showVerify(p);
    else toast('This QR code could not be read');
  } else if (h === '#docs' || h === '#readiness') {
    clear();
    go(h.slice(1));
  }
}

/* ===== challenges ===== */
const PRIOS = ['Low', 'Medium', 'High', 'Critical'],
  CH_STATUS = ['Open', 'In progress', 'Resolved'],
  CH_CATS = ['Field', 'Equipment', 'Administrative', 'Staffing', 'Safety', 'Other'];
const stCls = (s) => ({ Open: 'open', 'In progress': 'prog', Resolved: 'res' })[s] || 'open';
function renderChallenges() {
  const q = ($('#chSearch').value || '').trim().toLowerCase();
  const open = challenges.filter((c) => c.status === 'Open').length,
    prog = challenges.filter((c) => c.status === 'In progress').length,
    res = challenges.filter((c) => c.status === 'Resolved').length;
  $('#chStats').innerHTML = [
    ['Open', open, 'var(--red-d)'],
    ['In progress', prog, 'var(--amber)'],
    ['Resolved', res, 'var(--green)'],
  ]
    .map(
      (x) =>
        '<div class="kpi" style="padding:12px"><div class="n" style="color:' +
        x[2] +
        ';font-size:22px">' +
        x[1] +
        '</div><div class="l">' +
        x[0] +
        '</div></div>',
    )
    .join('');
  const byCat = {};
  challenges.forEach((c) => (byCat[c.category] = (byCat[c.category] || 0) + 1));
  const catData = Object.entries(byCat)
    .map(([k, v]) => ({ x: k, y: v }))
    .sort((a, b) => b.y - a.y);
  $('#chChart').innerHTML = catData.length
    ? '<div class="card"><div class="card-h">By category</div>' +
      barChart(catData, 'var(--amber)') +
      '</div>'
    : '';
  const chips = [{ k: 'all', t: 'All' }]
    .concat(CH_STATUS.map((s) => ({ k: s, t: s })))
    .concat(PRIOS.map((p) => ({ k: p, t: p })));
  $('#chChips').innerHTML = chips
    .map(
      (c) =>
        '<button class="chip ' +
        (chFilter === c.k ? 'active' : '') +
        '" data-act="ch-filter" data-key="' +
        esc(c.k) +
        '">' +
        c.t +
        '</button>',
    )
    .join('');
  let list = challenges.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  if (CH_STATUS.indexOf(chFilter) >= 0) list = list.filter((c) => c.status === chFilter);
  else if (PRIOS.indexOf(chFilter) >= 0) list = list.filter((c) => c.priority === chFilter);
  if (q)
    list = list.filter(
      (c) =>
        (c.description + ' ' + c.category + ' ' + (c.location || '') + ' ' + (c.owner || ''))
          .toLowerCase()
          .indexOf(q) >= 0,
    );
  $('#chCount').textContent = challenges.length + ' total';
  $('#chList').innerHTML = list.length
    ? list
        .map(
          (c, i) =>
            '<div class="rec" style="animation-delay:' +
            Math.min(i, 12) * 0.02 +
            's" data-act="ch-view" data-id="' +
            esc(c.id) +
            '"><div class="crewline" style="margin:0 0 9px"><span class="pri pri-' +
            c.priority +
            '">' +
            c.priority +
            '</span><span class="st st-' +
            stCls(c.status) +
            '">' +
            c.status +
            '</span><span class="tag" style="background:transparent;color:var(--muted)">' +
            fmtD(c.date) +
            '</span></div><div class="rec-main"><div class="t" style="font-size:14px;line-height:1.45">' +
            esc(c.description) +
            '</div><div class="m" style="margin-top:6px">' +
            esc(c.category) +
            (c.location ? ' \u00b7 ' + esc(c.location) : '') +
            (c.owner ? ' \u00b7 ' + esc(c.owner) : '') +
            '</div></div></div>',
        )
        .join('')
    : emptyState('No challenges \u2014 tap + to log one');
}

/* ===== shift reports ===== */
const SH_TEAMS = ['A', 'B', 'C', 'D'];
function teamOnShift(dateStr, code) {
  const counts = {};
  SH_TEAMS.forEach((t) => (counts[t] = 0));
  STAFF.forEach((s) => {
    if (shiftOn(s, dateStr) === code) counts[s.team] = (counts[s.team] || 0) + 1;
  });
  let best = 'A',
    max = 0;
  Object.entries(counts).forEach(([t, n]) => {
    if (n > max) {
      max = n;
      best = t;
    }
  });
  return max > 0 ? best : 'A';
}
function onDutyFor(dateStr, code) {
  return STAFF.filter((s) => shiftOn(s, dateStr) === code);
}
function renderShift() {
  const q = ($('#shiftSearch').value || '').trim().toLowerCase();
  const chips = [{ k: 'all', t: 'All' }]
    .concat([
      { k: 'Day', t: 'Day' },
      { k: 'Night', t: 'Night' },
    ])
    .concat(SH_TEAMS.map((t) => ({ k: 'team-' + t, t: 'Team ' + t })));
  $('#shiftChips').innerHTML = chips
    .map(
      (c) =>
        '<button class="chip ' +
        (shiftFilter === c.k ? 'active' : '') +
        '" data-act="shift-filter" data-key="' +
        esc(c.k) +
        '">' +
        c.t +
        '</button>',
    )
    .join('');
  let list = shiftReports
    .slice()
    .sort(
      (a, b) =>
        (b.date || '').localeCompare(a.date || '') || (b.shift || '').localeCompare(a.shift || ''),
    );
  if (shiftFilter === 'Day' || shiftFilter === 'Night')
    list = list.filter((r) => r.shift === shiftFilter);
  else if (shiftFilter.startsWith('team-'))
    list = list.filter((r) => r.team === shiftFilter.slice(5));
  if (q)
    list = list.filter(
      (r) =>
        (r.sicName + ' ' + r.notes + ' ' + r.team + ' ' + r.date).toLowerCase().indexOf(q) >= 0,
    );
  $('#shiftCount').textContent = shiftReports.length + ' total';
  $('#shiftList').innerHTML = list.length
    ? list
        .map(
          (r, i) =>
            '<div class="rec" style="animation-delay:' +
            Math.min(i, 12) * 0.02 +
            's" data-act="shift-view" data-id="' +
            esc(r.id) +
            '"><div class="crewline" style="margin:0 0 9px"><span class="tag" style="background:var(--' +
            (r.shift === 'Day' ? 'day' : 'night') +
            '-soft);color:var(--' +
            (r.shift === 'Day' ? 'day' : 'night') +
            ')">' +
            esc(r.shift) +
            '</span><span class="tag" style="background:var(--red-soft);color:var(--red-d)">Team ' +
            esc(r.team) +
            '</span><span class="tag" style="background:transparent;color:var(--muted)">' +
            fmtD(r.date) +
            '</span></div><div class="rec-main"><div class="t" style="font-size:14px;line-height:1.45">' +
            esc(r.sicName || 'Unknown SIC') +
            '</div><div class="m" style="margin-top:6px">Cases: ' +
            (r.casesHandled || 0) +
            ' \u00b7 Transfers: ' +
            (r.transfers || 0) +
            ' \u00b7 Refusals: ' +
            (r.refusals || 0) +
            '</div></div></div>',
        )
        .join('')
    : emptyState('No shift reports \u2014 tap + to file one');
}
function editShift(id) {
  const r = id ? shiftReports.filter((x) => x.id === id)[0] : null;
  const isEdit = !!r;
  const dateVal = r ? r.date : today();
  const shiftVal = r
    ? r.shift
    : new Date().getHours() >= 5 && new Date().getHours() < 16
      ? 'Day'
      : 'Night';
  const teamVal = r ? r.team : teamOnShift(dateVal, shiftVal === 'Day' ? 'D' : 'N');
  const onDuty = onDutyFor(dateVal, shiftVal === 'Day' ? 'D' : 'N');
  const sicRecord = STAFF.find((s) => s.team === teamVal && s.isSupervisor);
  const sicName = r ? r.sicName : sicRecord ? sicRecord.name : '';
  const staffIds = r ? r.staffPresent || [] : onDuty.map((s) => s.id);
  const staffChecklist = onDuty.length
    ? onDuty
        .map(
          (s) =>
            '<label class="shift-staff"><input type="checkbox" value="' +
            s.id +
            '"' +
            (staffIds.indexOf(s.id) >= 0 ? ' checked' : '') +
            '/><span>' +
            esc(s.name) +
            ' <span style="color:var(--muted);font-size:11px">' +
            esc(s.team) +
            '</span></span></label>',
        )
        .join('')
    : '<p style="color:var(--muted);font-size:13px">No crew on duty for this shift</p>';
  openSheet(
    isEdit ? 'Edit shift report' : 'File shift report',
    '<div class="field-row"><div class="field"><label>Date</label><input type="date" id="sh_date" value="' +
      dateVal +
      '"/></div><div class="field"><label>Shift</label><select id="sh_shift"><option value="Day"' +
      (shiftVal === 'Day' ? ' selected' : '') +
      '>Day</option><option value="Night"' +
      (shiftVal === 'Night' ? ' selected' : '') +
      '>Night</option></select></div></div>' +
      '<div class="field-row"><div class="field"><label>Team</label><select id="sh_team">' +
      SH_TEAMS.map(
        (t) =>
          '<option value="' +
          t +
          '"' +
          (t === teamVal ? ' selected' : '') +
          '>Team ' +
          t +
          '</option>',
      ).join('') +
      '</select></div><div class="field"><label>SIC</label><input id="sh_sic" value="' +
      esc(sicName) +
      '" placeholder="Supervisor name"/></div></div>' +
      '<div class="field-row"><div class="field"><label>Cases handled</label><input type="number" id="sh_cases" min="0" value="' +
      (r ? r.casesHandled || 0 : 0) +
      '"/></div><div class="field"><label>Transfers</label><input type="number" id="sh_transfers" min="0" value="' +
      (r ? r.transfers || 0 : 0) +
      '"/></div></div>' +
      '<div class="field-row"><div class="field"><label>Refusals</label><input type="number" id="sh_refusals" min="0" value="' +
      (r ? r.refusals || 0 : 0) +
      '"/></div><div class="field"><label>ROSC</label><input type="number" id="sh_rosc" min="0" value="' +
      (r ? r.roscCount || 0 : 0) +
      '"/></div></div>' +
      '<div class="field"><label>Staff present</label><div class="shift-staff-list">' +
      staffChecklist +
      '</div></div>' +
      '<div class="field"><label>Staffing shortages</label><input id="sh_shortages" value="' +
      esc(r ? r.staffingShortages || '' : '') +
      '" placeholder="Any gaps?"/></div>' +
      '<div class="field"><label>Equipment issues</label><textarea id="sh_equipment" placeholder="Equipment problems">' +
      esc(r ? r.equipmentIssues || '' : '') +
      '</textarea><label class="shift-flag"><input type="checkbox" id="sh_flagEquip"' +
      (r && r.flagEquipment ? ' checked' : '') +
      '/>Flag as challenge</label></div>' +
      '<div class="field"><label>Pending incidents</label><textarea id="sh_incidents" placeholder="Unresolved incidents">' +
      esc(r ? r.pendingIncidents || '' : '') +
      '</textarea><label class="shift-flag"><input type="checkbox" id="sh_flagIncident"' +
      (r && r.flagIncidents ? ' checked' : '') +
      '/>Flag as challenge</label></div>' +
      '<div class="field"><label>Notes</label><textarea id="sh_notes" placeholder="Additional notes">' +
      esc(r ? r.notes || '' : '') +
      '</textarea></div>' +
      '<div style="display:flex;gap:10px;margin-top:8px"><button class="btn" data-act="shift-save" data-id="' +
      (isEdit ? esc(r.id) : '') +
      '">Save report</button><button class="btn btn-ghost" data-act="close">Cancel</button></div>',
  );
}
function saveShiftForm(id) {
  const dateVal = $('#sh_date').value;
  const shiftVal = $('#sh_shift').value;
  const teamVal = $('#sh_team').value;
  if (!dateVal || !shiftVal) {
    toast('Date and shift required');
    return;
  }
  const staffPresent = Array.from(
    document.querySelectorAll('.shift-staff-list input[type=checkbox]:checked'),
  ).map((cb) => cb.value);
  const data = {
    id: id || uid(),
    date: dateVal,
    shift: shiftVal,
    team: teamVal,
    sicName: $('#sh_sic').value.trim(),
    casesHandled: parseInt($('#sh_cases').value) || 0,
    transfers: parseInt($('#sh_transfers').value) || 0,
    refusals: parseInt($('#sh_refusals').value) || 0,
    roscCount: parseInt($('#sh_rosc').value) || 0,
    staffPresent: staffPresent,
    staffingShortages: $('#sh_shortages').value.trim(),
    equipmentIssues: $('#sh_equipment').value.trim(),
    flagEquipment: $('#sh_flagEquip').checked,
    pendingIncidents: $('#sh_incidents').value.trim(),
    flagIncidents: $('#sh_flagIncident').checked,
    notes: $('#sh_notes').value.trim(),
    linkedChallenges: [],
    createdAt: id ? undefined : Date.now(),
    updatedAt: Date.now(),
  };
  if (id) {
    const idx = shiftReports.findIndex((x) => x.id === id);
    if (idx >= 0) {
      data.createdAt = shiftReports[idx].createdAt;
      data.linkedChallenges = shiftReports[idx].linkedChallenges || [];
      shiftReports[idx] = data;
    }
  } else {
    const dup = shiftReports.find(
      (x) => x.date === data.date && x.shift === data.shift && x.team === data.team,
    );
    if (dup) {
      if (
        !confirm(
          'A report for ' +
            data.shift +
            ' Team ' +
            data.team +
            ' on ' +
            fmtD(data.date) +
            ' already exists. Overwrite?',
        )
      )
        return;
      data.id = dup.id;
      data.createdAt = dup.createdAt;
      data.linkedChallenges = dup.linkedChallenges || [];
      const idx = shiftReports.findIndex((x) => x.id === dup.id);
      shiftReports[idx] = data;
    } else {
      shiftReports.push(data);
    }
  }
  if (data.flagEquipment && data.equipmentIssues) {
    const ch = {
      id: uid(),
      date: data.date,
      category: 'Equipment',
      location: 'Team ' + data.team,
      description: data.equipmentIssues,
      priority: 'Medium',
      owner: data.sicName,
      status: 'Open',
      createdAt: Date.now(),
    };
    challenges.push(ch);
    saveCh();
    data.linkedChallenges.push(ch.id);
  }
  if (data.flagIncidents && data.pendingIncidents) {
    const ch = {
      id: uid(),
      date: data.date,
      category: 'Field',
      location: 'Team ' + data.team,
      description: data.pendingIncidents,
      priority: 'High',
      owner: data.sicName,
      status: 'Open',
      createdAt: Date.now(),
    };
    challenges.push(ch);
    saveCh();
    data.linkedChallenges.push(ch.id);
  }
  saveShiftR();
  closeSheet();
  renderShift();
  toast(id ? 'Report updated' : 'Report filed');
}
function viewShift(id) {
  const r = shiftReports.find((x) => x.id === id);
  if (!r) return;
  const staffNames = (r.staffPresent || [])
    .map((sid) => {
      const s = STAFF.find((x) => x.id === sid);
      return s ? dispName(s.name) : sid;
    })
    .join(', ');
  openSheet(
    'Shift report',
    det('Date', fmtD(r.date)) +
      det('Shift', r.shift) +
      det('Team', 'Team ' + r.team) +
      det('SIC', esc(r.sicName || '\u2014')) +
      det('Cases handled', r.casesHandled || 0) +
      det('Transfers', r.transfers || 0) +
      det('Refusals', r.refusals || 0) +
      det('ROSC', r.roscCount || 0) +
      det('Staff present', esc(staffNames || '\u2014')) +
      det('Shortages', esc(r.staffingShortages || '\u2014')) +
      det('Equipment issues', esc(r.equipmentIssues || '\u2014')) +
      det('Pending incidents', esc(r.pendingIncidents || '\u2014')) +
      det('Notes', esc(r.notes || '\u2014')) +
      (r.linkedChallenges && r.linkedChallenges.length
        ? det('Linked challenges', r.linkedChallenges.length + ' challenge(s)')
        : '') +
      '<div style="display:flex;gap:10px;margin-top:14px"><button class="btn" data-act="shift-edit" data-id="' +
      esc(r.id) +
      '">Edit</button><button class="btn btn-ghost" style="color:var(--red)" data-act="shift-del" data-id="' +
      esc(r.id) +
      '">Delete</button></div>',
  );
}
function delShift(id) {
  if (!confirm('Delete this shift report?')) return;
  shiftReports = shiftReports.filter((x) => x.id !== id);
  saveShiftR();
  closeSheet();
  renderShift();
  toast('Deleted');
}

function editChallenge(id) {
  const c = id
    ? challenges.filter((x) => x.id === id)[0]
    : {
        date: today(),
        category: 'Field',
        location: '',
        description: '',
        priority: 'Medium',
        owner: '',
        status: 'Open',
      };
  openSheet(
    id ? 'Edit challenge' : 'Log challenge',
    '<div class="field"><label>Description <span class="req">*</span></label><textarea id="c_desc" placeholder="What is the issue?">' +
      esc(c.description) +
      '</textarea></div>' +
      '<div class="field-row"><div class="field"><label>Category</label><select id="c_cat">' +
      CH_CATS.map(
        (x) => '<option ' + (c.category === x ? 'selected' : '') + '>' + x + '</option>',
      ).join('') +
      '</select></div>' +
      '<div class="field"><label>Priority</label><select id="c_pri">' +
      PRIOS.map(
        (x) => '<option ' + (c.priority === x ? 'selected' : '') + '>' + x + '</option>',
      ).join('') +
      '</select></div></div>' +
      '<div class="field"><label>Location / terminal</label><input id="c_loc" value="' +
      esc(c.location) +
      '" placeholder="e.g. Terminal 3 \u00b7 Concourse B"></div>' +
      '<div class="field-row"><div class="field"><label>Owner</label><input id="c_own" value="' +
      esc(c.owner) +
      '" placeholder="Assigned to"></div>' +
      '<div class="field"><label>Status</label><select id="c_st">' +
      CH_STATUS.map(
        (x) => '<option ' + (c.status === x ? 'selected' : '') + '>' + x + '</option>',
      ).join('') +
      '</select></div></div>' +
      '<div class="field"><label>Date</label><input id="c_date" type="date" value="' +
      esc(c.date) +
      '"></div>' +
      '<button class="btn btn-primary" data-act="ch-save" data-id="' +
      esc(id || '') +
      '">' +
      (id ? 'Save changes' : 'Log challenge') +
      '</button>',
  );
}
function saveChallenge(id) {
  const desc = $('#c_desc').value.trim();
  if (!desc) {
    toast('Please add a description');
    return;
  }
  const d = {
    date: $('#c_date').value,
    category: $('#c_cat').value,
    location: $('#c_loc').value.trim(),
    description: desc,
    priority: $('#c_pri').value,
    owner: $('#c_own').value.trim(),
    status: $('#c_st').value,
  };
  if (id) Object.assign(challenges.filter((x) => x.id === id)[0], d);
  else challenges.push(Object.assign({ id: uid(), createdAt: Date.now() }, d));
  saveCh();
  closeSheet();
  renderChallenges();
  toast(id ? 'Saved' : 'Challenge logged');
}
function viewChallenge(id) {
  const c = challenges.filter((x) => x.id === id)[0];
  if (!c) return;
  openSheet(
    'Challenge',
    '<div class="crewline" style="margin-bottom:8px"><span class="pri pri-' +
      c.priority +
      '">' +
      c.priority +
      '</span><span class="st st-' +
      stCls(c.status) +
      '">' +
      c.status +
      '</span></div>' +
      det('Description', esc(c.description)) +
      det('Category', esc(c.category)) +
      (c.location ? det('Location', esc(c.location)) : '') +
      (c.owner ? det('Owner', esc(c.owner)) : '') +
      det('Date', fmtD(c.date)) +
      '<div class="btn-row" style="margin-top:14px"><button class="btn btn-ghost" data-act="ch-edit" data-id="' +
      esc(c.id) +
      '">Edit</button><button class="btn btn-danger" data-act="ch-del" data-id="' +
      esc(c.id) +
      '">Delete</button></div>',
  );
}
function delChallenge(id) {
  if (!confirm('Delete this challenge?')) return;
  challenges = challenges.filter((x) => x.id !== id);
  saveCh();
  closeSheet();
  renderChallenges();
  toast('Deleted');
}

/* ===== reports ===== */
function renderReports() {
  const list = reports.slice().sort((a, b) => b.month.localeCompare(a.month));
  $('#repCount').textContent = reports.length + ' months';
  $('#repList').innerHTML = list.length
    ? list
        .map(
          (r) =>
            '<div class="rec" data-act="rep-view" data-id="' +
            esc(r.id) +
            '"><div class="rec-top"><div class="rec-main"><div class="t">' +
            mLabel(r.month) +
            (r.sample
              ? ' <span class="tag" style="background:var(--amber-soft);color:var(--amber)">sample</span>'
              : '') +
            '</div></div></div><div class="crewline" style="margin-top:10px"><span class="tag">' +
            r.cases +
            ' cases</span><span class="tag">' +
            r.resp +
            ' min</span><span class="tag" style="background:var(--green-soft);color:var(--green)">' +
            r.rosc +
            ' ROSC</span><span class="tag" style="background:transparent;color:var(--muted)">' +
            r.transfers +
            ' transfers \u00b7 ' +
            r.refusals +
            ' refusals</span></div></div>',
        )
        .join('')
    : emptyState('No reports \u2014 upload an Excel or add manually');
}
function editReport(id) {
  const r = id
    ? reports.filter((x) => x.id === id)[0]
    : { month: today().slice(0, 7), cases: '', resp: '', rosc: '', refusals: '', transfers: '' };
  openSheet(
    id ? 'Edit report' : 'Add monthly report',
    '<div class="field"><label>Month <span class="req">*</span></label><input id="r_month" type="month" value="' +
      esc(r.month) +
      '"></div>' +
      '<div class="field-row"><div class="field"><label>Total cases</label><input id="r_cases" type="number" value="' +
      esc(r.cases) +
      '"></div><div class="field"><label>Avg response (min)</label><input id="r_resp" type="number" step="0.1" value="' +
      esc(r.resp) +
      '"></div></div>' +
      '<div class="field-row"><div class="field"><label>ROSC cases</label><input id="r_rosc" type="number" value="' +
      esc(r.rosc) +
      '"></div><div class="field"><label>Refusals</label><input id="r_ref" type="number" value="' +
      esc(r.refusals) +
      '"></div></div>' +
      '<div class="field"><label>Transfers</label><input id="r_tr" type="number" value="' +
      esc(r.transfers) +
      '"></div>' +
      '<button class="btn btn-primary" data-act="rep-save" data-id="' +
      esc(id || '') +
      '">' +
      (id ? 'Save' : 'Add report') +
      '</button>',
  );
}
function saveReport(id) {
  const m = $('#r_month').value;
  if (!m) {
    toast('Pick a month');
    return;
  }
  const d = {
    month: m,
    cases: +$('#r_cases').value || 0,
    resp: +$('#r_resp').value || 0,
    rosc: +$('#r_rosc').value || 0,
    refusals: +$('#r_ref').value || 0,
    transfers: +$('#r_tr').value || 0,
    sample: 0,
  };
  const ex = reports.filter((x) => x.month === m && x.id !== id)[0];
  if (ex) Object.assign(ex, d);
  else if (id) Object.assign(reports.filter((x) => x.id === id)[0], d);
  else reports.push(Object.assign({ id: uid() }, d));
  saveRep();
  closeSheet();
  renderReports();
  toast('Report saved');
}
function viewReport(id) {
  const r = reports.filter((x) => x.id === id)[0];
  if (!r) return;
  openSheet(
    mLabel(r.month),
    det('Total cases', r.cases) +
      det('Avg response time', r.resp + ' min') +
      det('ROSC cases', r.rosc) +
      det('Refusals', r.refusals) +
      det('Transfers', r.transfers) +
      '<div class="btn-row" style="margin-top:14px"><button class="btn btn-ghost" data-act="rep-edit" data-id="' +
      esc(r.id) +
      '">Edit</button><button class="btn btn-danger" data-act="rep-del" data-id="' +
      esc(r.id) +
      '">Delete</button></div>',
  );
}
function delReport(id) {
  if (!confirm('Delete this report?')) return;
  reports = reports.filter((x) => x.id !== id);
  saveRep();
  closeSheet();
  renderReports();
  toast('Deleted');
}

/* ===== analytics ===== */
function renderAnalytics() {
  const rs = reports.slice().sort((a, b) => a.month.localeCompare(b.month));
  const byTeam = {};
  STAFF.forEach((s) => (byTeam[s.team] = (byTeam[s.team] || 0) + 1));
  const byTerm = TERMS.map((t) => [
    t[0],
    STAFF.filter((s) => s.airport === t[1] && (t[2] ? s.terminal === t[2] : true)).length,
  ]);
  $('#analytics').innerHTML =
    '<div class="card"><div class="card-h">Cases by month</div>' +
    barChart(rs.map((r) => ({ x: r.month.slice(5), y: r.cases }))) +
    '</div>' +
    '<div class="card"><div class="card-h">Avg response time (min)</div>' +
    sparkline(rs.map((r) => ({ x: r.month.slice(5), y: r.resp }))) +
    '</div>' +
    '<div class="card"><div class="card-h">ROSC cases by month</div>' +
    barChart(
      rs.map((r) => ({ x: r.month.slice(5), y: r.rosc })),
      'var(--green)',
    ) +
    '</div>' +
    '<div class="card"><div class="card-h">Staff by terminal</div>' +
    barChart(
      byTerm.map((x) => ({
        x: x[0].replace('Terminal ', 'T').replace('Al-Maktoum', 'DWC'),
        y: x[1],
      })),
      'var(--night)',
    ) +
    '</div>' +
    '<div class="card"><div class="card-h">Staff by team</div>' +
    barChart(
      Object.entries(byTeam).map((x) => ({ x: x[0], y: x[1] })),
      'var(--red)',
    ) +
    '</div>';
}
let _barGradId = 0;
function barChart(data, color) {
  if (!data.length) return '<p style="color:var(--muted);font-size:13px">No data</p>';
  const W = 320,
    H = 140,
    pad = 24,
    gap = (W - pad * 2) / data.length,
    bw = gap * 0.6,
    max = Math.max.apply(null, data.map((d) => d.y).concat([1])),
    gid = 'bgrad' + _barGradId++,
    c = color || 'var(--red)';
  let grid = '';
  for (let g = 1; g <= 3; g++) {
    const gy = H - pad - (g / 4) * (H - pad * 2);
    grid +=
      '<line class="grid" x1="' +
      pad +
      '" y1="' +
      gy.toFixed(1) +
      '" x2="' +
      (W - pad) +
      '" y2="' +
      gy.toFixed(1) +
      '"/>';
  }
  let bars = '',
    labels = '';
  data.forEach((d, i) => {
    const h = (d.y / max) * (H - pad * 2),
      x = pad + i * gap + (gap - bw) / 2,
      y = H - pad - h;
    bars +=
      '<rect class="bar bar-anim" style="--bi:' +
      i +
      '" x="' +
      x.toFixed(1) +
      '" y="' +
      y.toFixed(1) +
      '" width="' +
      bw.toFixed(1) +
      '" height="' +
      h.toFixed(1) +
      '" rx="4" fill="url(#' +
      gid +
      ')"/>';
    bars +=
      '<text class="bar-val" x="' +
      (x + bw / 2).toFixed(1) +
      '" y="' +
      (y - 5).toFixed(1) +
      '" text-anchor="middle">' +
      d.y +
      '</text>';
    labels +=
      '<text x="' +
      (x + bw / 2).toFixed(1) +
      '" y="' +
      (H - 8) +
      '" text-anchor="middle">' +
      esc(d.x) +
      '</text>';
  });
  return (
    '<svg class="chart" viewBox="0 0 ' +
    W +
    ' ' +
    H +
    '" preserveAspectRatio="xMidYMid meet"><defs><linearGradient id="' +
    gid +
    '" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="' +
    c +
    '" stop-opacity="0.92"/><stop offset="100%" stop-color="' +
    c +
    '" stop-opacity="0.55"/></linearGradient></defs>' +
    grid +
    '<line class="axis" x1="' +
    pad +
    '" y1="' +
    (H - pad) +
    '" x2="' +
    (W - pad) +
    '" y2="' +
    (H - pad) +
    '"/>' +
    bars +
    labels +
    '</svg>'
  );
}
function sparkline(data) {
  if (data.length < 2) return '<p style="color:var(--muted);font-size:13px">Need 2+ months</p>';
  const W = 320,
    H = 130,
    pad = 24,
    ys = data.map((d) => d.y),
    min = Math.min.apply(null, ys),
    max = Math.max.apply(null, ys),
    rng = max - min || 1;
  const px = (i) => pad + i * ((W - pad * 2) / (data.length - 1)),
    py = (v) => H - pad - ((v - min) / rng) * (H - pad * 2);
  let grid = '';
  for (let g = 1; g <= 2; g++) {
    const gy = H - pad - (g / 3) * (H - pad * 2);
    grid +=
      '<line class="grid" x1="' +
      pad +
      '" y1="' +
      gy.toFixed(1) +
      '" x2="' +
      (W - pad) +
      '" y2="' +
      gy.toFixed(1) +
      '"/>';
  }
  const pts = data.map((d, i) => ({ x: px(i), y: py(d.y) }));
  let d = 'M' + pts[0].x.toFixed(1) + ',' + pts[0].y.toFixed(1);
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1],
      c = pts[i],
      tx = (c.x - p.x) / 3;
    d +=
      ' C' +
      (p.x + tx).toFixed(1) +
      ',' +
      p.y.toFixed(1) +
      ' ' +
      (c.x - tx).toFixed(1) +
      ',' +
      c.y.toFixed(1) +
      ' ' +
      c.x.toFixed(1) +
      ',' +
      c.y.toFixed(1);
  }
  const areaD = d + ' L' + (W - pad) + ',' + (H - pad) + ' L' + pad + ',' + (H - pad) + ' Z';
  const totalLen = 800;
  const dots = pts
    .map(
      (p, i) =>
        '<circle class="spark-dot" cx="' +
        p.x.toFixed(1) +
        '" cy="' +
        p.y.toFixed(1) +
        '" r="4" fill="var(--red)" stroke="var(--surface)" stroke-width="2"/><text x="' +
        p.x.toFixed(1) +
        '" y="' +
        (p.y - 10).toFixed(1) +
        '" text-anchor="middle">' +
        data[i].y +
        '</text>',
    )
    .join('');
  const labels = data
    .map(
      (dd, i) =>
        '<text x="' +
        px(i).toFixed(1) +
        '" y="' +
        (H - 8) +
        '" text-anchor="middle">' +
        esc(dd.x) +
        '</text>',
    )
    .join('');
  return (
    '<svg class="chart" viewBox="0 0 ' +
    W +
    ' ' +
    H +
    '" preserveAspectRatio="xMidYMid meet"><defs><linearGradient id="sgrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--red)" stop-opacity="0.22"/><stop offset="100%" stop-color="var(--red)" stop-opacity="0.02"/></linearGradient></defs>' +
    grid +
    '<path class="spark-area" d="' +
    areaD +
    '" fill="url(#sgrad)"/><path class="spark-line" d="' +
    d +
    '" stroke-dasharray="' +
    totalLen +
    '" stroke-dashoffset="' +
    totalLen +
    '"/>' +
    dots +
    labels +
    '</svg>'
  );
}

/* ===== achievements + initiatives ===== */
const ACH_CATS = [
  'Appreciation',
  'Excellence certificate',
  'Field achievement',
  'Individual initiative',
  'Award',
  'Commendation',
];
function renderAch() {
  const q = ($('#achSearch').value || '').trim().toLowerCase();
  $('#achChips').innerHTML = [{ k: 'all', t: 'All' }]
    .concat(ACH_CATS.map((c) => ({ k: c, t: c })))
    .map(
      (c) =>
        '<button class="chip ' +
        (achFilter === c.k ? 'active' : '') +
        '" data-act="ach-filter" data-key="' +
        esc(c.k) +
        '">' +
        c.t +
        '</button>',
    )
    .join('');
  let list = achievements.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  if (achFilter !== 'all') list = list.filter((a) => a.cat === achFilter);
  if (q)
    list = list.filter(
      (a) =>
        ((a.staffName || '') + ' ' + (a.staffId || '') + ' ' + a.title + ' ' + (a.desc || ''))
          .toLowerCase()
          .indexOf(q) >= 0,
    );
  $('#achCount').textContent = achievements.length + ' total';
  $('#achList').innerHTML = list.length
    ? list
        .map(
          (a, i) =>
            '<div class="rec" style="animation-delay:' +
            Math.min(i, 12) * 0.02 +
            's" data-act="ach-view" data-id="' +
            esc(a.id) +
            '"><div class="rec-main"><div class="t">' +
            esc(a.title) +
            '</div><div class="m" style="margin-top:3px"><b style="color:var(--ink2)">' +
            esc(a.staffName || '\u2014') +
            '</b>' +
            (a.staffId ? ' \u00b7 ID ' + esc(a.staffId) : '') +
            '</div></div><div class="crewline" style="margin-top:10px">' +
            (a.cat ? '<span class="scode sc-AL">' + esc(a.cat) + '</span>' : '') +
            '<span class="tag" style="background:transparent;color:var(--muted)">' +
            fmtD(a.date) +
            '</span></div></div>',
        )
        .join('')
    : emptyState('No achievements \u2014 tap + to record');
}
function editAch(id) {
  const a = id
    ? achievements.filter((x) => x.id === id)[0]
    : {
        staffName: '',
        staffId: '',
        title: '',
        desc: '',
        cat: ACH_CATS[0],
        date: today(),
        notes: '',
      };
  openSheet(
    id ? 'Edit achievement' : 'Record achievement',
    '<div class="field-row"><div class="field"><label>Staff name <span class="req">*</span></label><input id="a_name" value="' +
      esc(a.staffName) +
      '" placeholder="Full name"></div><div class="field"><label>Staff ID</label><input id="a_id" value="' +
      esc(a.staffId) +
      '" inputmode="numeric" placeholder="2238"></div></div>' +
      '<div class="field"><label>Achievement <span class="req">*</span></label><input id="a_title" value="' +
      esc(a.title) +
      '" placeholder="Title"></div>' +
      '<div class="field"><label>Description</label><textarea id="a_desc">' +
      esc(a.desc) +
      '</textarea></div>' +
      '<div class="field-row"><div class="field"><label>Type</label><select id="a_cat">' +
      ACH_CATS.map(
        (c) => '<option ' + (a.cat === c ? 'selected' : '') + '>' + c + '</option>',
      ).join('') +
      '</select></div><div class="field"><label>Date</label><input id="a_date" type="date" value="' +
      esc(a.date) +
      '"></div></div>' +
      '<div class="field"><label>Notes / reference</label><textarea id="a_notes">' +
      esc(a.notes) +
      '</textarea></div>' +
      '<button class="btn btn-primary" data-act="ach-save" data-id="' +
      esc(id || '') +
      '">' +
      (id ? 'Save' : 'Record') +
      '</button>',
  );
}
function saveAchForm(id) {
  const name = $('#a_name').value.trim(),
    title = $('#a_title').value.trim();
  if (!name || !title) {
    toast('Name and title required');
    return;
  }
  const d = {
    staffName: name,
    staffId: $('#a_id').value.trim(),
    title: title,
    desc: $('#a_desc').value.trim(),
    cat: $('#a_cat').value,
    date: $('#a_date').value,
    notes: $('#a_notes').value.trim(),
  };
  if (id) Object.assign(achievements.filter((x) => x.id === id)[0], d);
  else achievements.push(Object.assign({ id: uid(), createdAt: Date.now() }, d));
  saveAch();
  closeSheet();
  renderAch();
  toast(id ? 'Saved' : 'Recorded');
}
function viewAch(id) {
  const a = achievements.filter((x) => x.id === id)[0];
  if (!a) return;
  openSheet(
    'Achievement',
    '<h3 style="font-size:18px;margin-bottom:8px">' +
      esc(a.title) +
      '</h3><div class="crewline" style="margin-bottom:6px"><span class="scode sc-AL">' +
      esc(a.cat || '') +
      '</span><span class="tag" style="background:transparent;color:var(--muted)">' +
      fmtD(a.date) +
      '</span></div>' +
      det('Staff', esc(a.staffName) + (a.staffId ? ' \u00b7 ID ' + esc(a.staffId) : '')) +
      (a.desc ? det('Description', esc(a.desc)) : '') +
      (a.notes ? det('Notes', esc(a.notes)) : '') +
      '<div class="btn-row" style="margin-top:14px"><button class="btn btn-ghost" data-act="ach-edit" data-id="' +
      esc(a.id) +
      '">Edit</button><button class="btn btn-danger" data-act="ach-del" data-id="' +
      esc(a.id) +
      '">Delete</button></div>',
  );
}
function delAch(id) {
  if (!confirm('Delete?')) return;
  achievements = achievements.filter((x) => x.id !== id);
  saveAch();
  closeSheet();
  renderAch();
  toast('Deleted');
}

const INIT_CATS = [
  'Digital transformation',
  'Service development',
  'Field operations',
  'Administrative',
  'Training',
];
const I_ST = [
  { k: 'proposed', t: 'Proposed', c: 'sc-N' },
  { k: 'progress', t: 'In progress', c: 'sc-D' },
  { k: 'done', t: 'Completed', c: 'sc-AL' },
  { k: 'hold', t: 'On hold', c: 'sc-X' },
];
const iSt = (k) => I_ST.filter((s) => s.k === k)[0] || I_ST[0];
function renderInit() {
  const q = ($('#initSearch').value || '').trim().toLowerCase();
  const bySt = {};
  initiatives.forEach((i) => (bySt[i.status] = (bySt[i.status] || 0) + 1));
  const stData = Object.entries(bySt)
    .map(([k, v]) => ({ x: k, y: v }))
    .sort((a, b) => b.y - a.y);
  $('#initChart').innerHTML = stData.length
    ? '<div class="card"><div class="card-h">By status</div>' +
      barChart(stData, 'var(--night)') +
      '</div>'
    : '';
  $('#initChips').innerHTML = [{ k: 'all', t: 'All' }]
    .concat(I_ST)
    .map(
      (s) =>
        '<button class="chip ' +
        (initFilter === s.k ? 'active' : '') +
        '" data-act="init-filter" data-key="' +
        s.k +
        '">' +
        s.t +
        '</button>',
    )
    .join('');
  let list = initiatives.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  if (initFilter !== 'all') list = list.filter((i) => i.status === initFilter);
  if (q)
    list = list.filter(
      (i) =>
        (i.title + ' ' + i.desc + ' ' + (i.owner || '') + ' ' + (i.cat || ''))
          .toLowerCase()
          .indexOf(q) >= 0,
    );
  $('#initCount').textContent = initiatives.length + ' total';
  $('#initList').innerHTML = list.length
    ? list
        .map((i, idx) => {
          const s = iSt(i.status);
          return (
            '<div class="rec" style="animation-delay:' +
            Math.min(idx, 12) * 0.02 +
            's" data-act="init-view" data-id="' +
            esc(i.id) +
            '"><div class="rec-main"><div class="t">' +
            esc(i.title) +
            '</div>' +
            (i.desc
              ? '<div class="m" style="margin-top:6px;color:var(--ink2);font-size:13px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">' +
                esc(i.desc) +
                '</div>'
              : '') +
            '</div><div class="crewline" style="margin-top:11px"><span class="scode ' +
            s.c +
            '">' +
            s.t +
            '</span>' +
            (i.cat ? '<span class="tag">' + esc(i.cat) + '</span>' : '') +
            (i.owner
              ? '<span class="tag" style="background:transparent;color:var(--muted)">' +
                esc(i.owner) +
                '</span>'
              : '') +
            '</div></div>'
          );
        })
        .join('')
    : emptyState('No initiatives \u2014 tap + to add');
}
function editInit(id) {
  const it = id
    ? initiatives.filter((i) => i.id === id)[0]
    : {
        title: '',
        desc: '',
        cat: INIT_CATS[0],
        owner: '',
        ownerId: '',
        status: 'proposed',
        startDate: today(),
        completedDate: '',
        impact: '',
      };
  openSheet(
    id ? 'Edit initiative' : 'New initiative',
    '<div class="field"><label>Title <span class="req">*</span></label><input id="f_title" value="' +
      esc(it.title) +
      '"></div>' +
      '<div class="field"><label>Description</label><textarea id="f_desc">' +
      esc(it.desc) +
      '</textarea></div>' +
      '<div class="field-row"><div class="field"><label>Category</label><select id="f_cat">' +
      INIT_CATS.map(
        (c) => '<option ' + (it.cat === c ? 'selected' : '') + '>' + c + '</option>',
      ).join('') +
      '</select></div><div class="field"><label>Status</label><select id="f_status">' +
      I_ST.map(
        (s) =>
          '<option value="' +
          s.k +
          '" ' +
          (it.status === s.k ? 'selected' : '') +
          '>' +
          s.t +
          '</option>',
      ).join('') +
      '</select></div></div>' +
      '<div class="field-row"><div class="field"><label>Owner</label><input id="f_owner" value="' +
      esc(it.owner) +
      '"></div><div class="field"><label>Staff ID</label><input id="f_oid" value="' +
      esc(it.ownerId) +
      '" inputmode="numeric"></div></div>' +
      '<div class="field-row"><div class="field"><label>Start</label><input id="f_start" type="date" value="' +
      esc(it.startDate) +
      '"></div><div class="field"><label>Completed</label><input id="f_done" type="date" value="' +
      esc(it.completedDate) +
      '"></div></div>' +
      '<div class="field"><label>Impact / notes</label><textarea id="f_impact">' +
      esc(it.impact) +
      '</textarea></div>' +
      '<button class="btn btn-primary" data-act="init-save" data-id="' +
      esc(id || '') +
      '">' +
      (id ? 'Save' : 'Add initiative') +
      '</button>',
  );
}
function saveInitForm(id) {
  const title = $('#f_title').value.trim();
  if (!title) {
    toast('Title required');
    return;
  }
  const d = {
    title: title,
    desc: $('#f_desc').value.trim(),
    cat: $('#f_cat').value,
    status: $('#f_status').value,
    owner: $('#f_owner').value.trim(),
    ownerId: $('#f_oid').value.trim(),
    startDate: $('#f_start').value,
    completedDate: $('#f_done').value,
    impact: $('#f_impact').value.trim(),
  };
  if (id) Object.assign(initiatives.filter((x) => x.id === id)[0], d);
  else initiatives.push(Object.assign({ id: uid(), createdAt: Date.now() }, d));
  saveInit();
  closeSheet();
  renderInit();
  toast(id ? 'Saved' : 'Added');
}
function viewInit(id) {
  const i = initiatives.filter((x) => x.id === id)[0];
  if (!i) return;
  const s = iSt(i.status);
  openSheet(
    'Initiative',
    '<h3 style="font-size:18px;margin-bottom:8px">' +
      esc(i.title) +
      '</h3><div class="crewline" style="margin-bottom:6px"><span class="scode ' +
      s.c +
      '">' +
      s.t +
      '</span>' +
      (i.cat ? '<span class="tag">' + esc(i.cat) + '</span>' : '') +
      '</div>' +
      (i.desc ? det('Description', esc(i.desc)) : '') +
      (i.owner ? det('Owner', esc(i.owner) + (i.ownerId ? ' \u00b7 ' + esc(i.ownerId) : '')) : '') +
      det(
        'Dates',
        'Start: ' +
          fmtD(i.startDate) +
          (i.completedDate ? ' \u00b7 Completed: ' + fmtD(i.completedDate) : ''),
      ) +
      (i.impact ? det('Impact', esc(i.impact)) : '') +
      '<div class="btn-row" style="margin-top:14px"><button class="btn btn-ghost" data-act="init-edit" data-id="' +
      esc(i.id) +
      '">Edit</button><button class="btn btn-danger" data-act="init-del" data-id="' +
      esc(i.id) +
      '">Delete</button></div>',
  );
}
function delInit(id) {
  if (!confirm('Delete?')) return;
  initiatives = initiatives.filter((x) => x.id !== id);
  saveInit();
  closeSheet();
  renderInit();
  toast('Deleted');
}

/* ===== predictive expiry alerts (60 / 30 / 15 days, and on expiry) ===== */
let docsFilter = 'active';
const TIER_LBL = {
  expired: 'Expired',
  15: '15 days',
  30: '30 days',
  60: '60 days',
  missing: 'Not on file',
};
const TIER_ORD = { expired: 0, 15: 1, 30: 2, 60: 3, missing: 4 };
/* One entry per document that has reached a milestone (or is missing) as of `asOf`. */
function currentAlerts(asOf) {
  const out = [];
  STAFF.forEach((s) => {
    const exps = expsOf(s);
    DOC_DEFS.forEach((def) => {
      const st = docState(def, exps[def.k], asOf);
      if (!st.tier && st.state !== 'missing') return;
      const base = s.team + '|' + s.id + '|' + def.k + '|' + st.exp;
      out.push({
        s,
        def,
        exp: st.exp,
        days: st.days,
        tier: st.state === 'missing' ? 'missing' : st.tier,
        base,
        key: base + '|' + st.tier,
        blocking: isBlocking(def, s, policy),
      });
    });
  });
  return out.sort(
    (a, b) =>
      TIER_ORD[a.tier] - TIER_ORD[b.tier] || a.days - b.days || a.def.l.localeCompare(b.def.l),
  );
}
/*
 * The alert engine: every milestone a document crosses is raised once (logged with a
 * timestamp, addressed to the medic and their team's SIC) and pushed as a device
 * notification when permitted. Renewing a document retires its alerts automatically.
 */
function runAlertEngine(manual) {
  const list = currentAlerts(nowISO()).filter((a) => a.tier !== 'missing');
  const live = {};
  list.forEach((a) => (live[a.base] = 1));
  Object.keys(notifLog).forEach((k) => {
    if (!live[k.split('|').slice(0, 4).join('|')]) delete notifLog[k];
  });
  const t = Date.now();
  const fresh = list.filter((a) => !notifLog[a.key]);
  fresh.forEach((a) => (notifLog[a.key] = { at: t }));
  saveNotif();
  Store.set('dcas_notif_run', String(t));
  if (fresh.length) deviceNotify(fresh);
  if (manual)
    toast(fresh.length ? fresh.length + ' new alert(s) raised' : 'Checked — no new milestones');
  if (view === 'docs') renderDocs();
  return fresh;
}
const notifSupported = () => typeof Notification !== 'undefined';
function showDeviceNotification(title, body) {
  const opts = {
    body,
    tag: 'smartdash-expiry',
    icon: 'icons/icon-192x192.png',
    badge: 'icons/icon-96x96.png',
    data: { url: './#docs' },
  };
  const fallback = () => {
    try {
      new Notification(title, opts);
    } catch (e) {}
  };
  if (navigator.serviceWorker && navigator.serviceWorker.getRegistration)
    navigator.serviceWorker
      .getRegistration()
      .then((reg) => (reg ? reg.showNotification(title, opts) : fallback()))
      .catch(fallback);
  else fallback();
}
function deviceNotify(fresh) {
  if (!notifSupported() || Notification.permission !== 'granted') return;
  const body =
    fresh
      .slice(0, 4)
      .map((a) => dispName(a.s.name) + ' — ' + a.def.l + ' ' + tierText(a))
      .join('\n') + (fresh.length > 4 ? '\n+' + (fresh.length - 4) + ' more' : '');
  showDeviceNotification(
    fresh.length === 1 ? 'Document expiry alert' : fresh.length + ' document expiry alerts',
    body,
  );
}
function enableNotifications() {
  if (!notifSupported()) {
    toast('Notifications are not supported on this device');
    return;
  }
  Promise.resolve(Notification.requestPermission()).then((p) => {
    if (p === 'granted') {
      const n = currentAlerts(nowISO()).filter((a) => a.tier !== 'missing').length;
      showDeviceNotification(
        'SmartDash alerts are on',
        n
          ? n + ' active expiry alert(s). You will be notified at 60, 30 and 15 days before expiry.'
          : 'You will be notified at 60, 30 and 15 days before any document expires.',
      );
      toast('Device notifications enabled');
    } else toast('Notifications were not allowed');
    renderDocs();
  });
}
const smsHref = (phones, body) =>
  'sms:' +
  phones
    .map((p) => String(p || '').replace(/[^\d+]/g, ''))
    .filter(Boolean)
    .join(',') +
  '?body=' +
  encodeURIComponent(body);
const medicMsg = (a) =>
  'SmartDash reminder: your ' +
  a.def.l +
  (a.tier === 'missing'
    ? ' is not on file. Please submit a copy to your supervisor.'
    : (a.days < 0
        ? ' expired on ' + fmtD(a.exp)
        : ' expires on ' + fmtD(a.exp) + ' (' + a.days + ' days)') +
      '. Please renew it to avoid any interruption to your operational privileges.');
const sicMsg = (a) =>
  'SmartDash alert — ' +
  dispName(a.s.name) +
  ' (#' +
  a.s.id +
  ', Team ' +
  a.s.team +
  '): ' +
  a.def.l +
  ' ' +
  (a.tier === 'missing' ? 'not on file' : tierText(a)) +
  '.';
function sendNotice(a) {
  if (a.key && a.key.indexOf('miss') !== 0) {
    const e = notifLog[a.key] || (notifLog[a.key] = { at: Date.now() });
    e[a.role] = Date.now();
    saveNotif();
    renderDocs();
  }
  window.location.href = a.href;
}
function sendDigest(team) {
  const list = currentAlerts(nowISO()).filter((a) => a.s.team === team);
  if (!list.length) return;
  const body =
    'SmartDash — Team ' +
    team +
    ' document alerts (' +
    fmtD(nowISO()) +
    '):\n' +
    list
      .slice(0, 20)
      .map(
        (a) =>
          '• ' +
          dispName(a.s.name) +
          ': ' +
          a.def.l +
          ' — ' +
          (a.tier === 'missing' ? 'not on file' : tierText(a)),
      )
      .join('\n') +
    (list.length > 20 ? '\n+' + (list.length - 20) + ' more in SmartDash' : '');
  const t = Date.now();
  list.forEach((a) => {
    if (notifLog[a.key]) notifLog[a.key].sic = t;
  });
  saveNotif();
  renderDocs();
  window.location.href = smsHref(
    teamSics(team).map((x) => x.phone),
    body,
  );
}
const dShort = (t) => fmtD(localISO(new Date(t))).slice(0, 5);
function alertRow(a, i) {
  const n = notifLog[a.key] || {};
  const sics = teamSics(a.s.team);
  const raised = Object.keys(notifLog)
    .filter((k) => k.indexOf(a.base + '|') === 0)
    .map((k) => ({ t: k.split('|')[4], at: notifLog[k].at }))
    .sort((x, y) => x.at - y.at);
  const key = a.tier === 'missing' ? 'miss|' + a.base : a.key;
  const btn = (role, label, done, href) =>
    '<button class="btn-mini' +
    (done ? ' done' : '') +
    '" data-act="notify" data-role="' +
    role +
    '" data-key="' +
    esc(key) +
    '" data-href="' +
    esc(href) +
    '">' +
    (done ? '✓ ' + label + ' ' + dShort(done) : label) +
    '</button>';
  return (
    '<div class="rec al-row" style="animation-delay:' +
    Math.min(i, 12) * 0.02 +
    's" data-act="docs-staff" data-id="' +
    esc(a.s.id) +
    '" data-team="' +
    esc(a.s.team) +
    '"><div class="crewline" style="margin:0 0 8px"><span class="al-tier t-' +
    a.tier +
    '">' +
    TIER_LBL[a.tier] +
    '</span>' +
    (a.blocking ? '<span class="tag tag-bad">Affects readiness</span>' : '') +
    '<span class="tag" style="background:transparent;color:var(--muted)">Team ' +
    esc(a.s.team) +
    '</span></div><div class="rec-main"><div class="t">' +
    esc(dispName(a.s.name)) +
    ' <span class="mono" style="color:var(--muted);font-weight:500">#' +
    esc(a.s.id) +
    '</span></div><div class="m" style="margin-top:3px">' +
    esc(a.def.l) +
    ' — ' +
    (a.tier === 'missing' ? 'not on file' : tierText(a)) +
    '</div>' +
    (raised.length
      ? '<div class="al-trail">Alerts raised: ' +
        raised.map((r) => TIER_LBL[r.t] + ' (' + dShort(r.at) + ')').join(' · ') +
        '</div>'
      : '') +
    '<div class="al-trail">To: ' +
    esc(dispName(a.s.name)) +
    (sics.length ? ' · SIC ' + esc(sics.map((x) => dispName(x.name)).join(' / ')) : '') +
    '</div></div><div class="al-acts">' +
    btn('medic', 'Remind medic', n.medic, smsHref([a.s.phone], medicMsg(a))) +
    (sics.length
      ? btn(
          'sic',
          'Notify SIC',
          n.sic,
          smsHref(
            sics.map((x) => x.phone),
            sicMsg(a),
          ),
        )
      : '') +
    '</div></div>'
  );
}
/* Demo document records (seeded for the anonymised roster) must never pass for real ones. */
const demoDocCount = () => certifications.filter((r) => r.sample).length;
function demoNote() {
  const n = demoDocCount();
  return n
    ? '<div class="vf-src warn demo-note"><span>' +
        n +
        ' staff document record' +
        (n > 1 ? 's are' : ' is') +
        ' demo data, not real records. Readiness and alerts below include them.</span><button class="btn btn-ghost btn-sm" data-act="docs-clear-demo">Remove demo documents</button></div>'
    : '';
}
function removeDemoDocs() {
  const n = demoDocCount();
  if (!n) return 0;
  certifications = certifications.filter((r) => !r.sample);
  saveCert();
  runAlertEngine();
  return n;
}
function clearDemoDocs() {
  if (!confirm('Remove all demo document records? Real records are kept.')) return;
  const n = removeDemoDocs();
  toast(n + ' demo record' + (n === 1 ? '' : 's') + ' removed');
  go(view);
}
function renderDocs() {
  const asOf = nowISO();
  const all = currentAlerts(asOf);
  const alerts = all.filter((a) => a.tier !== 'missing');
  const cnt = (t) => alerts.filter((a) => a.tier === t).length;
  const readyNow = STAFF.filter((s) => staffAssess(s, asOf).ready).length;
  const pct = STAFF.length ? Math.round((readyNow / STAFF.length) * 100) : 0;
  $('#docsCount').textContent = alerts.length + ' active alerts';
  $('#docsDemo').innerHTML = demoNote();
  $('#docsKpis').innerHTML = [
    [
      pct + '<span class="kpi-unit">%</span>',
      'Staff ready for duty',
      pct >= 95 ? 'var(--green)' : pct >= 85 ? 'var(--amber)' : 'var(--red-d)',
    ],
    [cnt('expired'), 'Expired', 'var(--red-d)'],
    [cnt(15), 'Due within 15 days', 'var(--orange)'],
    [cnt(30) + cnt(60), 'Due in 16–60 days', 'var(--amber)'],
  ]
    .map(
      (x) =>
        '<div class="kpi mini-k"><div class="n" style="color:' +
        x[2] +
        '">' +
        x[0] +
        '</div><div class="l">' +
        x[1] +
        '</div></div>',
    )
    .join('');
  const perm = notifSupported() ? Notification.permission : 'unsupported';
  const last = +Store.get('dcas_notif_run') || 0;
  $('#docsNotif').innerHTML =
    '<p class="nf-p">Automatic alerts to the medic and their team supervisor at <b>60</b>, <b>30</b> and <b>15</b> days before any license, accreditation, ID, visa or refresher course lapses — and again on expiry — so operational privileges are never interrupted.</p>' +
    '<div class="btn-row">' +
    (perm === 'granted'
      ? '<button class="btn btn-ghost" disabled>\u2713 Notifications on</button>'
      : perm === 'denied'
        ? '<button class="btn btn-ghost" disabled title="Allow notifications for this site in browser settings">Notifications blocked</button>'
        : perm === 'unsupported'
          ? '<button class="btn btn-ghost" disabled>No device notifications</button>'
          : '<button class="btn btn-primary" data-act="notif-enable">Enable notifications</button>') +
    '<button class="btn btn-ghost" data-act="alerts-check">Check now</button></div>' +
    '<p class="hint" style="margin-bottom:0">Last check ' +
    (last
      ? fmtD(localISO(new Date(last))) + ' ' + new Date(last).toTimeString().slice(0, 5)
      : '—') +
    ' · checks run automatically on open and every 6 hours.</p>';
  const teams = ROSTER.teams
    .map((t) => [t, alerts.filter((a) => a.s.team === t).length])
    .filter((x) => x[1]);
  $('#docsDigest').innerHTML = teams.length
    ? '<div class="menu-label" style="margin-top:4px">Send supervisor digest</div><div class="chips">' +
      teams
        .map(
          (x) =>
            '<button class="chip" data-act="digest" data-team="' +
            esc(x[0]) +
            '">Team ' +
            esc(x[0]) +
            ' · ' +
            x[1] +
            ' → SIC</button>',
        )
        .join('') +
      '</div>'
    : '';
  const chips = [
    ['active', 'Active', alerts.length],
    ['expired', 'Expired', cnt('expired')],
    ['15', '≤ 15 days', cnt(15)],
    ['30', '≤ 30 days', cnt(30)],
    ['60', '≤ 60 days', cnt(60)],
    ['blocking', 'Affects readiness', alerts.filter((a) => a.blocking).length],
    ['missing', 'Not on file', all.length - alerts.length],
  ];
  $('#docsChips').innerHTML = chips
    .map(
      (c) =>
        '<button class="chip ' +
        (docsFilter === c[0] ? 'active' : '') +
        '" data-act="docs-filter" data-key="' +
        c[0] +
        '">' +
        c[1] +
        ' <span style="opacity:.6">' +
        c[2] +
        '</span></button>',
    )
    .join('');
  let list =
    docsFilter === 'missing'
      ? all.filter((a) => a.tier === 'missing')
      : docsFilter === 'blocking'
        ? alerts.filter((a) => a.blocking)
        : docsFilter === 'active'
          ? alerts
          : alerts.filter((a) => String(a.tier) === docsFilter);
  const q = ($('#docsSearch').value || '').trim().toLowerCase();
  if (q)
    list = list.filter(
      (a) =>
        (a.s.name + ' ' + a.s.id + ' ' + a.def.l + ' team ' + a.s.team).toLowerCase().indexOf(q) >=
        0,
    );
  $('#docsList').innerHTML = list.length
    ? list.slice(0, 200).map(alertRow).join('') +
      (list.length > 200
        ? '<p class="hint">Showing 200 of ' + list.length + ' — refine the search.</p>'
        : '')
    : emptyState(
        docsFilter === 'missing'
          ? 'Every required document is on file'
          : 'No alerts — all documents valid for 60+ days',
      );
}

/* ===== shift readiness heatmap ===== */
const noDocsHint = () =>
  certifications.length
    ? ''
    : '<p class="hint">No staff documents on file yet \u2014 add them from a staff profile, or upload the Staff Documents workbook in <span class="more-l" data-act="go" data-v="upload">Upload Center</span>.</p>';
function shiftReadyHtml(d, code) {
  const r = shiftReadiness(d, code);
  const band = readinessBand(r.pct);
  const notReady = r.rows.filter((x) => !x.a.ready);
  const watch = r.rows.filter((x) => x.a.ready && x.a.watch.some((w) => w.blocking));
  const row = (x, bad) =>
    '<div class="staff-row rr-row" data-act="staff" data-id="' +
    esc(x.s.id) +
    '" data-team="' +
    esc(x.s.team) +
    '"><span class="callsign">' +
    esc(x.s.callsign) +
    '</span><div class="info"><div class="nm">' +
    esc(dispName(x.s.name)) +
    ' <span class="rr-team">Team ' +
    esc(x.s.team) +
    '</span></div><div class="sub">' +
    (bad
      ? x.a.blockers.map((b) => '<span class="rr-b">' + blockerText(b) + '</span>').join('')
      : x.a.watch
          .filter((w) => w.blocking)
          .map((w) => '<span class="rr-w">' + esc(w.def.l) + ' lapses ' + fmtD(w.exp) + '</span>')
          .join('')) +
    '</div></div></div>';
  return (
    '<div class="rd-top"><div class="rd-n">' +
    (r.pct == null ? '—' : r.pct + '<span class="kpi-unit">%</span>') +
    '</div><div class="rd-meta"><div class="rd-t">' +
    CODES[code].l +
    ' shift · ' +
    esc(dayLabel(d)) +
    ' ' +
    bandPill(band) +
    '</div><div class="rd-s">' +
    r.ready +
    '/' +
    r.crew +
    ' rostered crew hold valid required licenses & documents on ' +
    fmtD(rosterISO(d)) +
    '</div></div></div>' +
    noDocsHint() +
    (r.crew
      ? notReady.length
        ? '<div class="rr-h">Not ready (' +
          notReady.length +
          ')</div>' +
          notReady.map((x) => row(x, true)).join('')
        : '<p class="hint">Every rostered crew member is cleared for this shift.</p>'
      : '<p class="hint">No crew rostered on this shift.</p>') +
    (watch.length
      ? '<div class="rr-h">Lapsing within 15 days (' +
        watch.length +
        ')</div>' +
        watch.map((x) => row(x, false)).join('')
      : '')
  );
}
function viewShiftReady(d, code) {
  openSheet('Shift readiness', shiftReadyHtml(d, code));
}
function renderReadiness() {
  const days = ROSTER.days || 30;
  $('#rdyMonth').textContent = ROSTER.month;
  $('#rdyDemo').innerHTML = demoNote();
  const grid = {},
    all = [];
  for (let d = 1; d <= days; d++) {
    grid[d] = { D: shiftReadiness(d, 'D'), N: shiftReadiness(d, 'N') };
    all.push({ d, c: 'D', r: grid[d].D }, { d, c: 'N', r: grid[d].N });
  }
  const scored = all.filter((x) => x.r.pct != null);
  const avg = scored.length
    ? Math.round(scored.reduce((n, x) => n + x.r.pct, 0) / scored.length)
    : null;
  const lowest = scored.slice().sort((a, b) => a.r.pct - b.r.pct || a.d - b.d);
  const below = scored.filter((x) => x.r.pct < 95).length;
  const lo = lowest[0];
  const tile = (n, l, band) =>
    '<div class="kpi rdy-k b-' +
    band +
    '"><div class="n">' +
    n +
    '</div><div class="l">' +
    l +
    '</div></div>';
  $('#rdyStats').innerHTML =
    tile(avg == null ? '—' : avg + '%', 'Month average', readinessBand(avg)) +
    tile(
      lo ? lo.r.pct + '%' : '—',
      lo ? 'Lowest · ' + CODES[lo.c].l + ' ' + lo.d : 'Lowest shift',
      lo ? readinessBand(lo.r.pct) : 'none',
    ) +
    tile(below + '/' + scored.length, 'Shifts below 95%', below ? 'watch' : 'ok');
  const offset =
    (new Date(ROSTER.year || 2026, ROSTER.monthIndex == null ? 5 : ROSTER.monthIndex, 1).getDay() +
      6) %
    7;
  let cal =
    '<div class="hm-cal">' +
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
      .map((w) => '<div class="hm-wd">' + w + '</div>')
      .join('');
  for (let i = 0; i < offset; i++) cal += '<div class="hm-day hm-pad"></div>';
  for (let d = 1; d <= days; d++)
    cal +=
      '<div class="hm-day' +
      (d === day ? ' sel' : '') +
      '"><div class="hm-dn">' +
      d +
      '</div>' +
      hmCell(d, 'D', grid[d].D) +
      hmCell(d, 'N', grid[d].N) +
      '</div>';
  cal += '</div>';
  const legend =
    '<div class="hm-legend">' +
    [
      ['ok', '≥ 95% ready'],
      ['watch', '85–94% watch'],
      ['risk', '< 85% at risk (!)'],
      ['none', 'no crew'],
    ]
      .map((x) => '<span><i class="hm-sw b-' + x[0] + '"></i>' + x[1] + '</span>')
      .join('') +
    '</div>';
  $('#rdyHeat').innerHTML = noDocsHint() + cal + legend;
  $('#rdyLow').innerHTML = lowest.length
    ? lowest
        .slice(0, 5)
        .map((x) => {
          const blk = {};
          x.r.rows.forEach((row) =>
            row.a.blockers.forEach((b) => (blk[b.def.sl] = (blk[b.def.sl] || 0) + 1)),
          );
          return (
            '<div class="cov-row rr-low" data-act="ready-shift" data-d="' +
            x.d +
            '" data-c="' +
            x.c +
            '"><div class="cov-name"><div class="t">' +
            CODES[x.c].l +
            ' · ' +
            esc(dayLabel(x.d)) +
            '</div><div class="s">' +
            x.r.ready +
            '/' +
            x.r.crew +
            ' ready' +
            (Object.keys(blk).length
              ? ' · ' +
                Object.entries(blk)
                  .map((e) => esc(e[0]) + ' ×' + e[1])
                  .join(', ')
              : '') +
            '</div></div><span class="rr-pct">' +
            x.r.pct +
            '%</span>' +
            bandPill(readinessBand(x.r.pct)) +
            '</div>'
          );
        })
        .join('')
    : emptyState('No rostered shifts');
  const blocked = {};
  all.forEach((x) =>
    x.r.rows.forEach((row) =>
      row.a.blockers.forEach((b) => {
        (blocked[b.def.sl] = blocked[b.def.sl] || {})[row.s.team + row.s.id] = 1;
      }),
    ),
  );
  const data = Object.entries(blocked)
    .map(([k, v]) => ({ x: k, y: Object.keys(v).length }))
    .sort((a, b) => b.y - a.y);
  $('#rdyBlock').innerHTML = data.length
    ? barChart(data, 'var(--red)') +
      '<p class="hint" style="margin-bottom:0">Distinct medics blocked on at least one rostered shift this month, by document.</p>'
    : '<p class="hint">No document is blocking any rostered shift this month.</p>';
  $('#rdyPolicy').innerHTML =
    'Readiness counts: ' +
    DOC_DEFS.filter((d) => policy.indexOf(d.k) >= 0)
      .map((d) => esc(d.l) + (d.block === 'adv' ? ' (EMT-A/SIC)' : ''))
      .join(', ') +
    '. <span class="more-l" data-act="go" data-v="settings">Change policy →</span>';
}
function renderPolicy() {
  $('#policyList').innerHTML =
    DOC_GROUPS.map(
      (g) =>
        '<div class="doc-gh">' +
        g.t +
        '</div>' +
        DOC_DEFS.filter((d) => d.g === g.k)
          .map(
            (d) =>
              '<label class="shift-staff"><input type="checkbox" data-pol="' +
              d.k +
              '"' +
              (policy.indexOf(d.k) >= 0 ? ' checked' : '') +
              '><span>' +
              esc(d.l) +
              (d.block === 'adv'
                ? ' <span style="color:var(--muted);font-size:11px">EMT-A & SIC only</span>'
                : '') +
              '</span></label>',
          )
          .join(''),
    ).join('') +
    '<div class="btn-row" style="margin-top:12px"><button class="btn btn-ghost" data-act="policy-reset">Reset to default</button><button class="btn btn-primary" data-act="policy-save">Save policy</button></div>';
}
function savePolicy() {
  policy = Array.from(document.querySelectorAll('#policyList [data-pol]'))
    .filter((x) => x.checked)
    .map((x) => x.dataset.pol);
  Store.set('dcas_policy', JSON.stringify(policy));
  toast('Readiness policy saved');
}

/* ===== Excel I/O ===== */
const hasXLSX = () => typeof XLSX !== 'undefined';
function renderSettings() {
  $('#xlsxState').textContent = hasXLSX() ? 'ready' : 'loading\u2026';
  renderBackupCard();
  renderPolicy();
}
let pickKind = 'roster';
function renderUpload() {
  const card = (title, desc, col, tpl) =>
    '<div class="di" style="background:' +
    col[0] +
    ';color:' +
    col[1] +
    '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5M12 3v12"/></svg></div><div class="dt">' +
    title +
    '</div><div class="dd">' +
    desc +
    '</div>' +
    (tpl ? '<span class="tpl" data-act="' + tpl + '">\u2193 Download template</span>' : '');
  $('#dropRoster').innerHTML = card(
    'Upload Roster',
    '.xlsx schedule (teams .A.\u2013.D.)',
    ['var(--blue-soft)', 'var(--blue)'],
    '',
  );
  $('#dropReport').innerHTML = card(
    'Upload Monthly Report',
    'Cases \u00b7 response \u00b7 ROSC',
    ['var(--green-soft)', 'var(--green)'],
    'tpl-report',
  );
  $('#dropAch').innerHTML = card(
    'Upload Achievement Report',
    'Bulk staff achievements',
    ['var(--gold-soft)', 'var(--gold)'],
    'tpl-ach',
  );
  $('#dropDocs').innerHTML = card(
    'Upload Staff Documents',
    'Licenses \u00b7 IDs \u00b7 visas \u00b7 refresher courses \u00b7 qualifications',
    ['var(--red-soft)', 'var(--red-d)'],
    'tpl-docs',
  );
  [
    ['dropRoster', 'roster'],
    ['dropReport', 'report'],
    ['dropAch', 'ach'],
    ['dropDocs', 'docs'],
  ].forEach((p) => {
    const el = $('#' + p[0]),
      kind = p[1];
    el.ondragover = (e) => {
      e.preventDefault();
      el.classList.add('over');
    };
    el.ondragleave = () => el.classList.remove('over');
    el.ondrop = (e) => {
      e.preventDefault();
      el.classList.remove('over');
      if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0], kind);
    };
  });
}
function pickFile(kind) {
  if (!hasXLSX()) {
    toast('Excel engine still loading \u2014 try again');
    return;
  }
  pickKind = kind;
  $('#fileIn').value = '';
  $('#fileIn').click();
}
function handleFile(file, kind) {
  if (!hasXLSX()) {
    toast('Excel engine not ready');
    return;
  }
  const r = new FileReader();
  r.onload = (ev) => {
    try {
      const wb = XLSX.read(ev.target.result, { type: 'array' });
      if (kind === 'backup') importBackup(wb);
      else if (kind === 'roster') importRoster(wb);
      else if (kind === 'report') importReports(wb);
      else if (kind === 'docs') importDocs(wb);
      else importAchievements(wb);
    } catch (err) {
      toast('Could not read the file');
    }
  };
  r.readAsArrayBuffer(file);
}
function importRoster(wb) {
  const dotted = wb.SheetNames.filter((n) => /^\..*\.$/.test(n));
  if (!dotted.length) {
    toast('No team sheets (.A.\u2013.D.) found');
    return;
  }
  const AIR = { 'Dubai International Airport': 'DXB', 'Al-Maktoum Airport': 'DWC' };
  const SEC = ['Overtime', 'Swap', 'ANNUAL LEAVES', 'SPECIAL DUTY'];
  const REL = ['RELIEVERS', 'RELIEVERS from Other Areas'];
  const out = [];
  dotted.forEach((sn) => {
    const team = sn.replace(/\./g, '');
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '' });
    let airport = 'DXB',
      term = '',
      area = '',
      cs = '',
      supp = false;
    rows.forEach((R) => {
      const c = R.map((x) =>
        String(x == null ? '' : x)
          .trim()
          .replace(/\n/g, ' '),
      );
      while (c.length < 41) c.push('');
      if (c[2] === 'CALL SIGN') {
        if (AIR[c[0]]) airport = AIR[c[0]];
        supp = false;
        return;
      }
      if (AIR[c[0]]) {
        airport = AIR[c[0]];
        supp = false;
      }
      if (SEC.indexOf(c[0]) >= 0) {
        supp = true;
        return;
      }
      if (REL.indexOf(c[0]) >= 0) {
        term = '';
        area = '';
        cs = '';
        return;
      }
      if (supp) return;
      if (c[0] && !AIR[c[0]]) term = c[0];
      if (c[1]) area = c[1];
      if (c[2]) cs = c[2];
      const name = c[5],
        sid = String(c[4]).replace(/\.0$/, '');
      if (!name || !sid) return;
      let days = c.slice(9, 39).map((x) => x || 'X');
      while (days.length < 30) days.push('X');
      const no = cs.toUpperCase().indexOf('AIRPORT') === 0 ? cs.replace(/\D/g, '') : '';
      const sup = cs === 'Supervisor';
      out.push({
        team: team,
        airport: airport,
        terminal: sup ? '' : term,
        area: sup ? '' : area,
        callsign: no ? 'AIRPORT ' + no : cs,
        stationNo: no,
        title: c[3],
        id: sid,
        name: name,
        phone: c[6],
        adp: c[7].toUpperCase() === 'ADP',
        tdp: c[8].toUpperCase() === 'TDP',
        shifts: days,
        remark: c[39] || '',
      });
    });
  });
  if (!out.length) {
    toast('No staff rows parsed');
    return;
  }
  ROSTER.staff = out;
  STAFF = out;
  ROSTER.teams = Object.keys(
    out.reduce((a, s) => {
      a[s.team] = 1;
      return a;
    }, {}),
  ).sort();
  Store.set('dcas_roster', JSON.stringify({ staff: out, teams: ROSTER.teams }));
  _expCache = null;
  const demo = removeDemoDocs();
  toast(
    out.length +
      ' staff loaded from Excel' +
      (demo ? ' \u00b7 ' + demo + ' demo document records removed' : ''),
  );
  go('roster');
}
function importReports(wb) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  let n = 0;
  rows.forEach((row) => {
    const g = (k) => {
      const key = Object.keys(row).filter((x) => x.toLowerCase().indexOf(k) >= 0)[0];
      return key ? row[key] : '';
    };
    let m = String(g('month')).trim();
    if (!m) return;
    if (/^\d{4}-\d{2}/.test(m)) m = m.slice(0, 7);
    const d = {
      month: m,
      cases: +g('case') || 0,
      resp: +g('response') || 0,
      rosc: +g('rosc') || 0,
      refusals: +g('refus') || 0,
      transfers: +g('transfer') || 0,
      sample: 0,
    };
    const ex = reports.filter((x) => x.month === m)[0];
    if (ex) Object.assign(ex, d);
    else reports.push(Object.assign({ id: uid() }, d));
    n++;
  });
  saveRep();
  toast(n + ' month(s) imported');
  go('reports');
}
function importAchievements(wb) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  let n = 0;
  rows.forEach((row) => {
    const g = (k) => {
      const key = Object.keys(row).filter((x) => x.toLowerCase().indexOf(k) >= 0)[0];
      return key ? row[key] : '';
    };
    const name = String(g('name')).trim(),
      title = String(g('achiev') || g('title')).trim();
    if (!name || !title) return;
    achievements.push({
      id: uid(),
      createdAt: Date.now(),
      staffName: name,
      staffId: String(g('id')).replace(/\.0$/, ''),
      title: title,
      desc: String(g('desc')),
      cat: String(g('type') || g('cat')) || 'Appreciation',
      date: String(g('date')) || today(),
      notes: String(g('note')),
    });
    n++;
  });
  saveAch();
  toast(n + ' achievement(s) imported');
  go('achievements');
}
function writeBook(name, sheets) {
  if (!hasXLSX()) {
    toast('Excel engine not ready');
    return;
  }
  const wb = XLSX.utils.book_new();
  Object.keys(sheets).forEach((n) => {
    const aoa = sheets[n];
    const ws = Array.isArray(aoa[0]) ? XLSX.utils.aoa_to_sheet(aoa) : XLSX.utils.json_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, n.slice(0, 31));
  });
  XLSX.writeFile(wb, name);
}
function tplReport() {
  writeBook('monthly-report-template.xlsx', {
    'Monthly Report': [
      ['Month', 'Cases', 'Avg Response (min)', 'ROSC', 'Refusals', 'Transfers'],
      ['2026-06', 0, 0, 0, 0, 0],
    ],
  });
}
function tplAch() {
  writeBook('achievement-template.xlsx', {
    Achievements: [
      ['Name', 'Staff ID', 'Achievement', 'Description', 'Type', 'Date', 'Notes'],
      ['', '', '', '', 'Appreciation', '', ''],
    ],
  });
}
/* --- staff documents workbook (template = current records, so it round-trips) --- */
const docCol = (d) => d.l + (d.months ? ' (completed)' : ' (expiry)');
function docsSheets() {
  const docs = [['Staff ID', 'Team', 'Name', 'Title'].concat(DOC_DEFS.map(docCol))],
    quals = [['Staff ID', 'Team', 'Name', 'Qualification', 'Institution', 'Year', 'Attested']],
    train = [['Staff ID', 'Team', 'Name', 'Course', 'Provider', 'Date', 'Hours']];
  STAFF.forEach((s) => {
    const r = getStaffCerts(s.id, s.team) || {},
      c = r.certs || {},
      nm = dispName(s.name);
    docs.push(
      [s.id, s.team, nm, s.title].concat(
        DOC_DEFS.map((d) => (c[d.k] === 'na' ? 'N/A' : c[d.k] || '')),
      ),
    );
    (r.quals || []).forEach((q) =>
      quals.push([s.id, s.team, nm, q.title, q.inst, q.year, q.attested ? 'Yes' : 'No']),
    );
    (r.training || []).forEach((t) =>
      train.push([s.id, s.team, nm, t.course, t.provider, t.date, t.hours]),
    );
  });
  return { Documents: docs, Qualifications: quals, Training: train };
}
function alertRows() {
  return currentAlerts(nowISO()).map((a) => {
    const n = notifLog[a.key] || {};
    const at = (t) => (t ? localISO(new Date(t)) : '');
    return {
      Name: dispName(a.s.name),
      'Staff ID': a.s.id,
      Team: a.s.team,
      Document: a.def.l,
      Expiry: a.exp || '',
      'Days left': a.tier === 'missing' ? '' : a.days,
      Alert: TIER_LBL[a.tier],
      'Affects readiness': a.blocking ? 'Yes' : 'No',
      Supervisors: teamSics(a.s.team)
        .map((x) => dispName(x.name))
        .join(', '),
      Raised: at(n.at),
      'Medic notified': at(n.medic),
      'SIC notified': at(n.sic),
    };
  });
}
function readinessRows() {
  const out = [];
  for (let d = 1; d <= (ROSTER.days || 30); d++)
    ['D', 'N'].forEach((c) => {
      const r = shiftReadiness(d, c);
      out.push({
        Date: rosterISO(d),
        Shift: CODES[c].l,
        Crew: r.crew,
        Ready: r.ready,
        'Readiness %': r.pct == null ? '' : r.pct,
        'Not ready': r.rows
          .filter((x) => !x.a.ready)
          .map((x) => dispName(x.s.name) + ' (' + x.a.blockers.map((b) => b.def.sl).join('/') + ')')
          .join('; '),
      });
    });
  return out;
}
function tplDocs() {
  writeBook('staff-documents-' + today() + '.xlsx', docsSheets());
}
function exportAlerts() {
  writeBook('expiry-alerts-' + today() + '.xlsx', { 'Expiry Alerts': alertRows() });
}
function importDocs(wb) {
  const norm = (h) =>
    String(h)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  const sheetOf = (word) => {
    const n = wb.SheetNames.filter((x) => norm(x).indexOf(word) >= 0)[0];
    return n ? XLSX.utils.sheet_to_json(wb.Sheets[n], { defval: '' }) : null;
  };
  const col = (row, test) => Object.keys(row).filter((k) => test(norm(k)))[0];
  const staffOf = (row) => {
    const ik = col(row, (n) => n === 'staffid' || n === 'id' || n === 'employeeid'),
      tk = col(row, (n) => n === 'team');
    const id = ik ? String(row[ik]).replace(/\.0$/, '').trim() : '';
    if (!id) return null;
    const team = tk ? String(row[tk]).trim() : '';
    return (
      findStaff(id, team) ||
      STAFF.filter(
        (x) => x.id.replace(/^0+/, '') === id.replace(/^0+/, '') && (!team || x.team === team),
      )[0]
    );
  };
  const recOf = (s) => {
    let r = getStaffCerts(s.id, s.team);
    if (!r) {
      r = { staffId: s.id, staffTeam: s.team };
      certifications.push(r);
    }
    r.certs = r.certs || {};
    return r;
  };
  const touched = {};
  let unknown = 0;
  (
    sheetOf('document') || XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' })
  ).forEach((row) => {
    const s = staffOf(row);
    if (!s) return void unknown++;
    const r = recOf(s);
    DOC_DEFS.forEach((d) => {
      const k = col(
        row,
        (n) => n === norm(d.l) || n === norm(docCol(d)) || n === norm(d.k) || n === norm(d.sl),
      );
      const v = k ? normDate(row[k]) : '';
      if (!v || (v === 'na' && !d.na) || r.certs[d.k] === v) return;
      r.certs[d.k] = v;
      touched[s.team + s.id] = r;
    });
  });
  const lists = [
    [
      'qualif',
      'quals',
      (row) => ({
        title: String(row[col(row, (n) => n.indexOf('qualif') === 0)] || '').trim(),
        inst: String(row[col(row, (n) => n.indexOf('institut') === 0)] || '').trim(),
        year: String(row[col(row, (n) => n === 'year')] || '').replace(/\.0$/, ''),
        attested: /^(y|yes|true|1)/i.test(
          String(row[col(row, (n) => n.indexOf('attest') === 0)] || ''),
        ),
      }),
      'title',
    ],
    [
      'training',
      'training',
      (row) => ({
        course: String(row[col(row, (n) => n.indexOf('course') === 0)] || '').trim(),
        provider: String(row[col(row, (n) => n.indexOf('provider') === 0)] || '').trim(),
        date: normDate(row[col(row, (n) => n === 'date')]),
        hours: +row[col(row, (n) => n.indexOf('hour') === 0)] || 0,
      }),
      'course',
    ],
  ];
  lists.forEach(([word, field, parse, need]) => {
    const rows = sheetOf(word);
    if (!rows) return;
    const fresh = {};
    rows.forEach((row) => {
      const s = staffOf(row);
      const item = s && parse(row);
      if (!item || !item[need]) return;
      const r = recOf(s);
      if (!fresh[s.team + s.id]) ((fresh[s.team + s.id] = 1), (r[field] = []));
      r[field].push(item);
      touched[s.team + s.id] = r;
    });
  });
  const n = Object.keys(touched).length;
  Object.values(touched).forEach((r) => {
    delete r.sample;
    r.updatedAt = Date.now();
  });
  saveCert();
  runAlertEngine();
  toast(
    n +
      ' staff record(s) updated' +
      (unknown ? ' \u00b7 ' + unknown + ' unknown ID(s) skipped' : ''),
  );
  go('docs');
}
function exportAllExcel() {
  if (!hasXLSX()) {
    toast('Excel engine not ready');
    return;
  }
  writeBook('dcas-operations-' + today() + '.xlsx', {
    Challenges: challenges.map((c) => ({
      Date: c.date,
      Category: c.category,
      Location: c.location,
      Description: c.description,
      Priority: c.priority,
      Owner: c.owner,
      Status: c.status,
    })),
    Reports: reports.map((r) => ({
      Month: r.month,
      Cases: r.cases,
      'Avg Response': r.resp,
      ROSC: r.rosc,
      Refusals: r.refusals,
      Transfers: r.transfers,
    })),
    Achievements: achievements.map((a) => ({
      Name: a.staffName,
      'Staff ID': a.staffId,
      Achievement: a.title,
      Description: a.desc,
      Type: a.cat,
      Date: a.date,
      Notes: a.notes,
    })),
    Initiatives: initiatives.map((i) => ({
      Title: i.title,
      Description: i.desc,
      Category: i.cat,
      Status: i.status,
      Owner: i.owner,
      Start: i.startDate,
      Completed: i.completedDate,
      Impact: i.impact,
    })),
    ...docsSheets(),
    'Expiry Alerts': alertRows(),
    'Shift Readiness': readinessRows(),
    'Shift Reports': shiftReports.map((r) => ({
      Date: r.date,
      Shift: r.shift,
      Team: r.team,
      SIC: r.sicName,
      'Cases Handled': r.casesHandled || 0,
      Transfers: r.transfers || 0,
      Refusals: r.refusals || 0,
      ROSC: r.roscCount || 0,
      'Staff Present': (r.staffPresent || []).length,
      Shortages: r.staffingShortages || '',
      'Equipment Issues': r.equipmentIssues || '',
      Incidents: r.pendingIncidents || '',
      Notes: r.notes || '',
    })),
  });
  toast('Exported to Excel');
}
/* Before anything destructive: offer a backup if this device has changes not in one. */
function offerBackupFirst() {
  const n = dirtyCount();
  if (
    n &&
    confirm(
      n +
        ' change' +
        (n > 1 ? 's' : '') +
        ' on this device ' +
        (n > 1 ? 'are' : 'is') +
        ' not in any backup.\n\nDownload a backup first? (OK = back up, Cancel = skip)',
    )
  )
    backupNow();
}
function resetSample() {
  offerBackupFirst();
  if (!confirm('Reload demo data? This replaces current records.')) return;
  seedSample(true);
}
function clearAll() {
  offerBackupFirst();
  if (
    !confirm(
      'Clear ALL records (reports, challenges, achievements, initiatives, shift reports, staff documents)?',
    )
  )
    return;
  reports = [];
  challenges = [];
  achievements = [];
  initiatives = [];
  certifications = [];
  shiftReports = [];
  notifLog = {};
  saveNotif();
  Store.set('dcas_docs_v', '1');
  saveRep();
  saveCh();
  saveAch();
  saveInit();
  saveCert();
  saveShiftR();
  Store.set('dcas_seeded', '1');
  go('dashboard');
  toast('All records cleared');
}

/* ===== backup & restore ===== */
const DATA_KEYS = COLLECTIONS.map((c) => c.store).concat([
  'dcas_notif',
  'dcas_notif_run',
  'dcas_policy',
  'dcas_roster',
  'dcas_sigs',
  'dcas_tomb',
  'dcas_schema',
  'dcas_dirty',
  'dcas_seeded',
  'dcas_docs_v',
  'dcas_last_backup',
]);
const deviceId =
  Store.get('dcas_device') ||
  (() => {
    const d = uid();
    Store.set('dcas_device', d);
    return d;
  })();
const deviceLabel = () => 'Device ' + deviceId.slice(-4).toUpperCase();
const rosterOverride = () => {
  try {
    return JSON.parse(Store.get('dcas_roster') || 'null');
  } catch (e) {
    return null;
  }
};
function localState() {
  return Object.assign(listState(), {
    tombstones: tombs,
    notifLog,
    policy: JSON.parse(Store.get('dcas_policy') || 'null'),
    roster: rosterOverride(),
  });
}
const realRecords = () =>
  COLLECTIONS.reduce((n, c) => n + LISTS[c.k]().filter((r) => !r.sample).length, 0);
let storagePersisted = null;
if (navigator.storage && navigator.storage.persist)
  navigator.storage
    .persisted()
    .then((p) => p || navigator.storage.persist())
    .then((p) => {
      storagePersisted = !!p;
      if (view === 'settings') renderBackupCard();
    })
    .catch(() => {});

function backupNow() {
  if (!hasXLSX()) {
    toast('Excel engine still loading \u2014 try again');
    return false;
  }
  const now = Date.now(),
    d = new Date(now),
    p2 = (n) => String(n).padStart(2, '0');
  try {
    XLSX.writeFile(
      sheetsToWorkbook(
        XLSX,
        toSheets(localState(), { createdAt: now, device: deviceLabel(), deviceId }),
      ),
      'smartdash-backup-' + localISO(d) + '-' + p2(d.getHours()) + p2(d.getMinutes()) + '.xlsx',
    );
  } catch (e) {
    toast('Backup failed: ' + e.message);
    return false;
  }
  Store.set('dcas_last_backup', String(now));
  Store.set('dcas_dirty', '0');
  toast('Backup saved \u2014 keep it on DCAS-approved storage');
  if (view === 'settings') renderBackupCard();
  if (view === 'dashboard') renderBackupNudge();
  return true;
}
function backupStatus() {
  const last = +Store.get('dcas_last_backup') || 0,
    dirty = dirtyCount();
  const days = last ? Math.floor((Date.now() - last) / 86400000) : null;
  const ago =
    days == null ? '' : days === 0 ? 'today' : days === 1 ? 'yesterday' : days + ' days ago';
  const level = !dirty
    ? 'ok'
    : !last || days >= 14
      ? 'bad'
      : days >= 7 || dirty >= 20
        ? 'warn'
        : 'ok';
  return { last, dirty, days, ago, level };
}
function renderBackupNudge() {
  const el = $('#backupNudge');
  if (!el) return;
  const b = backupStatus();
  const show = realRecords() > 0 && b.dirty > 0 && (!b.last || b.days >= 7 || b.dirty >= 20);
  el.innerHTML = show
    ? '<div class="bk-nudge bk-' +
      b.level +
      '"><div><b>' +
      (b.last ? 'Last backup ' + b.ago : 'No backup yet') +
      '</b><span>' +
      b.dirty +
      ' change' +
      (b.dirty > 1 ? 's' : '') +
      ' exist only on this device</span></div><button class="btn btn-primary btn-sm" data-act="backup-now">Back up now</button></div>'
    : '';
}
function renderBackupCard() {
  const el = $('#backupCard');
  if (!el) return;
  const b = backupStatus();
  let undo = null;
  try {
    undo = JSON.parse(Store.get('dcas_undo') || 'null');
  } catch (e) {
    undo = null;
  }
  el.innerHTML =
    '<div class="bk-status bk-' +
    b.level +
    '"><b>' +
    (b.last ? 'Last backup: ' + b.ago : 'No backup yet') +
    '</b><span>' +
    (b.dirty
      ? b.dirty + ' change' + (b.dirty > 1 ? 's' : '') + ' since then exist only on this device'
      : 'Everything on this device is in a backup') +
    '</span></div>' +
    '<div class="btn-row"><button class="btn btn-primary" data-act="backup-now">Back up now</button><button class="btn btn-ghost" data-act="restore-pick">Restore from backup</button></div>' +
    (undo
      ? '<button class="btn btn-ghost" style="margin-top:8px;width:100%" data-act="restore-undo">Undo last restore (' +
        esc(new Date(undo.at).toLocaleString('en-GB')) +
        ')</button>'
      : '') +
    '<p class="hint">One Excel file with every record, setting and alert. It contains staff personal data: save it only to DCAS-approved storage such as the division SharePoint or your work OneDrive.</p><p class="hint">Storage on this device: ' +
    (storagePersisted == null
      ? 'checking\u2026'
      : storagePersisted
        ? '<b>protected</b> from automatic clearing by the browser.'
        : '<b>not protected</b> \u2014 the browser may clear it when space is low. Install the app to the home screen, and back up regularly.') +
    ' Clearing site data or losing the device still erases it.</p>';
}

let pendingRestore = null;
function importBackup(wb) {
  let parsed;
  try {
    parsed = fromSheets(workbookToSheets(XLSX, wb));
  } catch (e) {
    toast(e.message);
    return;
  }
  pendingRestore = parsed;
  const local = localState();
  const m = merge(local, parsed.state);
  const t = statTotals(m.stats);
  let lost = 0;
  COLLECTIONS.forEach((c) => {
    const inFile = {};
    (parsed.state[c.k] || []).forEach((r) => (inFile[keyOf(c, r)] = 1));
    lost += local[c.k].filter((r) => !r.sample && !inFile[keyOf(c, r)]).length;
  });
  const rows = COLLECTIONS.map((c) => {
    const st = m.stats[c.k];
    return (
      '<tr><td>' +
      esc(c.t) +
      '</td><td>' +
      (parsed.state[c.k] || []).length +
      '</td><td>' +
      (st.added || '\u2013') +
      '</td><td>' +
      (st.updated || '\u2013') +
      '</td><td>' +
      (st.kept || '\u2013') +
      '</td><td>' +
      (st.removed || '\u2013') +
      '</td></tr>'
    );
  }).join('');
  const meta = parsed.meta;
  openSheet(
    'Restore backup',
    '<div class="bk-status bk-ok"><b>Backup of ' +
      esc(new Date(meta.createdAt).toLocaleString('en-GB')) +
      '</b><span>' +
      esc(meta.device || 'Unknown device') +
      (meta.deviceId === deviceId ? ' (this device)' : ' (another device)') +
      '</span></div>' +
      '<div class="bk-table-wrap"><table class="bk-table"><thead><tr><th></th><th>In file</th><th>New</th><th>Newer in file</th><th>Newer here</th><th>Deleted in file</th></tr></thead><tbody>' +
      rows +
      '</tbody></table></div>' +
      '<div class="bk-opt"><b>Merge (recommended)</b><span>Adds ' +
      t.added +
      ' new and ' +
      t.updated +
      ' updated record(s) and applies ' +
      t.removed +
      ' deletion(s). The newest version of every record is kept, from either side. Settings on this device stay as they are.</span><button class="btn btn-primary" data-act="restore-apply" data-mode="merge">Merge into this device</button></div>' +
      '<div class="bk-opt"><b>Replace</b><span>Makes this device an exact copy of the backup, including roster and settings.' +
      (lost
        ? ' <b>' + lost + ' record(s) on this device are not in the backup and will be removed.</b>'
        : '') +
      '</span><button class="btn btn-ghost" data-act="restore-apply" data-mode="replace">Replace this device\u2019s data</button></div>' +
      '<p class="hint">Either way, a safety copy of this device\u2019s current data is kept first: Settings \u2192 Undo last restore.</p>',
  );
}
function writeState(st, replace) {
  COLLECTIONS.forEach((c) => Store.set(c.store, JSON.stringify(st[c.k] || [])));
  const sigs = {};
  COLLECTIONS.forEach((c) => (sigs[c.k] = sigsOf(c, st[c.k] || [])));
  Store.set('dcas_sigs', JSON.stringify(sigs));
  Store.set('dcas_tomb', JSON.stringify(st.tombstones || {}));
  Store.set('dcas_notif', JSON.stringify(st.notifLog || {}));
  if (replace) {
    if (st.policy) Store.set('dcas_policy', JSON.stringify(st.policy));
    else Store.del('dcas_policy');
    if (st.roster) Store.set('dcas_roster', JSON.stringify(st.roster));
    else Store.del('dcas_roster');
  }
  Store.set('dcas_schema', String(SCHEMA_VERSION));
  Store.set('dcas_seeded', '1');
  Store.set('dcas_docs_v', '1');
}
function applyRestore(mode) {
  if (!pendingRestore) return;
  const snap = {};
  DATA_KEYS.forEach((k) => {
    const v = Store.get(k);
    if (v != null) snap[k] = v;
  });
  Store.set('dcas_undo', JSON.stringify({ at: Date.now(), keys: snap }));
  if (
    Store.get('dcas_undo') == null &&
    !confirm('Could not keep a safety copy (storage is full). Restore anyway, without undo?')
  )
    return;
  const replace = mode === 'replace';
  const st = replace ? pendingRestore.state : merge(localState(), pendingRestore.state);
  writeState(st, replace);
  pendingRestore = null;
  try {
    sessionStorage.setItem(
      'dcas_flash',
      replace ? 'Backup restored (replace)' : 'Backup merged into this device',
    );
    sessionStorage.setItem('dcas_view', 'settings');
  } catch (e) {}
  location.reload();
}
function undoRestore() {
  let u = null;
  try {
    u = JSON.parse(Store.get('dcas_undo') || 'null');
  } catch (e) {
    u = null;
  }
  if (!u || !confirm('Put back this device\u2019s data from before the last restore?')) return;
  DATA_KEYS.forEach((k) => (k in u.keys ? Store.set(k, u.keys[k]) : Store.del(k)));
  Store.del('dcas_undo');
  try {
    sessionStorage.setItem('dcas_flash', 'Last restore undone');
    sessionStorage.setItem('dcas_view', 'settings');
  } catch (e) {}
  location.reload();
}

/* ===== shared ===== */
let sheetCleanup = null;
function runSheetCleanup() {
  if (sheetCleanup) {
    const f = sheetCleanup;
    sheetCleanup = null;
    f();
  }
}
function openSheet(t, h) {
  runSheetCleanup();
  $('#sheetTitle').textContent = t;
  $('#sheetBody').innerHTML = h;
  $('#sheet').scrollTop = 0;
  $('#scrim').classList.add('open');
  $('#sheet').classList.add('open');
}
function closeSheet() {
  runSheetCleanup();
  $('#scrim').classList.remove('open');
  $('#sheet').classList.remove('open');
}
function det(k, v) {
  return '<div class="det-row"><div class="k">' + k + '</div><div class="v">' + v + '</div></div>';
}
function emptyState(t) {
  return (
    '<div class="empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg><p>' +
    t +
    '</p></div>'
  );
}

/* ===== single delegated event dispatcher (no inline handlers, no globals) ===== */
const ACTIONS = {
  go: (a) => go(a.v),
  theme: () => toggleTheme(),
  step: (a) => stepDay(+a.n),
  today: () => setDay(TODAY),
  fab: () => onFab(),
  close: () => closeSheet(),
  setday: (a) => setDay(+a.d),
  staff: (a) => viewStaff(a.id, a.team),
  term: (a) => viewTerminal(a.ap, a.term),
  pick: (a) => pickFile(a.kind),
  'tpl-report': () => tplReport(),
  'tpl-ach': () => tplAch(),
  'export-all': () => exportAllExcel(),
  'reset-sample': () => resetSample(),
  'clear-all': () => clearAll(),
  'ch-new': () => editChallenge(null),
  'ch-view': (a) => viewChallenge(a.id),
  'ch-edit': (a) => editChallenge(a.id),
  'ch-del': (a) => delChallenge(a.id),
  'ch-save': (a) => saveChallenge(a.id || ''),
  'ch-filter': (a) => {
    chFilter = a.key;
    renderChallenges();
  },
  'rep-new': () => editReport(null),
  'rep-view': (a) => viewReport(a.id),
  'rep-edit': (a) => editReport(a.id),
  'rep-del': (a) => delReport(a.id),
  'rep-save': (a) => saveReport(a.id || ''),
  'ach-view': (a) => viewAch(a.id),
  'ach-edit': (a) => editAch(a.id),
  'ach-del': (a) => delAch(a.id),
  'ach-save': (a) => saveAchForm(a.id || ''),
  'ach-filter': (a) => {
    achFilter = a.key;
    renderAch();
  },
  'init-view': (a) => viewInit(a.id),
  'init-edit': (a) => editInit(a.id),
  'init-del': (a) => delInit(a.id),
  'init-save': (a) => saveInitForm(a.id || ''),
  'init-filter': (a) => {
    initFilter = a.key;
    renderInit();
  },
  'stf-filter': (a) => {
    stfFilter = a.key;
    renderStaff();
  },
  'stf-cert': (a) => editStfCerts(a.id, a.team),
  'stf-cert-save': (a) => saveStfCerts(a.id, a.team),
  'stf-qr': (a) => viewQr(a.id, a.team),
  'qr-png': (a) => downloadQrPng(a.id, a.team),
  'qr-link': (a) => copyQrLink(a.id, a.team),
  'qual-add': () => $('#qualRows').insertAdjacentHTML('beforeend', qualRow({})),
  'train-add': () => $('#trainRows').insertAdjacentHTML('beforeend', trainRow({})),
  'row-del': (_a, el) => el.closest('.erow').remove(),
  scan: () => openScanner(),
  'verify-id': () => verifyById(),
  'docs-filter': (a) => {
    docsFilter = a.key;
    renderDocs();
  },
  'docs-staff': (a) => viewStaff(a.id, a.team),
  notify: (a) => sendNotice(a),
  digest: (a) => sendDigest(a.team),
  'notif-enable': () => enableNotifications(),
  'docs-clear-demo': () => clearDemoDocs(),
  'backup-now': () => backupNow(),
  'restore-pick': () => pickFile('backup'),
  'restore-apply': (a) => applyRestore(a.mode),
  'restore-undo': () => undoRestore(),
  'alerts-check': () => {
    runAlertEngine(true);
    renderDocs();
  },
  'alerts-export': () => exportAlerts(),
  'ready-shift': (a) => viewShiftReady(+a.d, a.c),
  'policy-save': () => savePolicy(),
  'policy-reset': () => {
    policy = defaultPolicy();
    Store.set('dcas_policy', JSON.stringify(policy));
    renderSettings();
    toast('Readiness policy reset');
  },
  'tpl-docs': () => tplDocs(),
  'shift-new': () => editShift(null),
  'shift-view': (a) => viewShift(a.id),
  'shift-edit': (a) => editShift(a.id),
  'shift-del': (a) => delShift(a.id),
  'shift-save': (a) => saveShiftForm(a.id || ''),
  'shift-filter': (a) => {
    shiftFilter = a.key;
    renderShift();
  },
  'cmd-shift': (a) => {
    cmdShift = a.shift;
    renderCommand();
  },
};
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = ACTIONS[el.dataset.act];
  if (fn) {
    e.preventDefault();
    fn(el.dataset, el);
  }
});
$('#fileIn').addEventListener('change', (e) => {
  if (e.target.files[0]) handleFile(e.target.files[0], pickKind);
});
[
  'stfSearch|renderStaff',
  'chSearch|renderChallenges',
  'achSearch|renderAch',
  'initSearch|renderInit',
  'shiftSearch|renderShift',
  'docsSearch|renderDocs',
].forEach((p) => {
  const id = p.split('|')[0],
    fn = {
      renderStaff: renderStaff,
      renderChallenges: renderChallenges,
      renderAch: renderAch,
      renderInit: renderInit,
      renderShift: renderShift,
      renderDocs: renderDocs,
    }[p.split('|')[1]];
  $('#' + id).addEventListener('input', deb(fn, 150));
});

/* restore uploaded roster if present */
try {
  const rj = Store.get('dcas_roster');
  if (rj) {
    const o = JSON.parse(rj);
    if (o.staff && o.staff.length) {
      ROSTER.staff = o.staff;
      STAFF = o.staff;
      if (o.teams) ROSTER.teams = o.teams;
    }
  }
} catch (e) {}

/* first run: demo data. Existing installs get the document set once, unless real records exist. */
if (!Store.get('dcas_seeded')) seedSample(false);
else if (!Store.get('dcas_docs_v')) {
  if (!certifications.some((r) => STAFF.some((x) => x.id === r.staffId))) {
    certifications = seedDocs();
    saveCert();
  }
  Store.set('dcas_docs_v', '1');
}

/* install banner */
let deferredPrompt = null;
let installTimer = null;
const ib = $('#installBanner');
const installBtn = $('#installBtn');
const dismissBtn = $('#installDismiss');
function dismissInstall() {
  ib.classList.add('hide');
  ib.classList.remove('show');
  setTimeout(() => ib.classList.remove('hide'), 500);
  deferredPrompt = null;
  if (installTimer) {
    clearTimeout(installTimer);
    installTimer = null;
  }
}
function showInstall() {
  if (sessionStorage.getItem('dcas_install_shown')) return;
  if (window.matchMedia('(display-mode: standalone)').matches) return;
  sessionStorage.setItem('dcas_install_shown', '1');
  ib.classList.remove('hide');
  ib.classList.add('show');
  installTimer = setTimeout(dismissInstall, 3000);
}
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  showInstall();
});
installBtn.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const result = await deferredPrompt.userChoice;
  if (result.outcome === 'accepted') dismissInstall();
  deferredPrompt = null;
});
dismissBtn.addEventListener('click', dismissInstall);
window.addEventListener('appinstalled', dismissInstall);

/* theme */
const themeMeta = $('meta[name="theme-color"]');
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  if (themeMeta) themeMeta.setAttribute('content', t === 'dark' ? '#0d1218' : '#ffffff');
}
function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  const next = cur === 'dark' ? 'light' : 'dark';
  Store.set('dcas_theme', next);
  applyTheme(next);
  toast(next === 'dark' ? 'Dark theme on' : 'Light theme on');
}
(() => {
  const saved = Store.get('dcas_theme');
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  applyTheme(saved || (mq.matches ? 'dark' : 'light'));
  // follow the system only while the user hasn't picked a theme explicitly
  if (mq.addEventListener)
    mq.addEventListener('change', (e) => {
      if (!Store.get('dcas_theme')) applyTheme(e.matches ? 'dark' : 'light');
    });
})();

go(view);
handleHash();
try {
  const flash = sessionStorage.getItem('dcas_flash');
  if (flash) {
    sessionStorage.removeItem('dcas_flash');
    setTimeout(() => toast(flash), 300);
  }
} catch (e) {}
window.addEventListener('hashchange', handleHash);
runAlertEngine();
setInterval(() => runAlertEngine(), 6 * 3600 * 1000);
document.addEventListener('visibilitychange', () => {
  if (
    document.visibilityState === 'visible' &&
    Date.now() - (+Store.get('dcas_notif_run') || 0) > 3600 * 1000
  )
    runAlertEngine();
});
