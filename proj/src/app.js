import ROSTER from '../data/roster.json';
import { esc, deb, dateOf, dispName, initials, telOf, uid, today, fmtD } from './util.js';

/* ===== utilities ===== */
const $ = (s) => document.querySelector(s);
const TODAY = Math.min(new Date().getDate(), 30);
let day = TODAY,
  view = sessionStorage.getItem('dcas_view') || 'dashboard';
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
  };
})();
let challenges = JSON.parse(Store.get('dcas_ch') || '[]');
let reports = JSON.parse(Store.get('dcas_rep') || '[]');
let achievements = JSON.parse(Store.get('dcas_ach') || '[]');
let initiatives = JSON.parse(Store.get('dcas_init') || '[]');
let certifications = JSON.parse(Store.get('dcas_cert') || '[]');
let shiftReports = JSON.parse(Store.get('dcas_shift') || '[]');
const saveCh = () => Store.set('dcas_ch', JSON.stringify(challenges));
const saveRep = () => Store.set('dcas_rep', JSON.stringify(reports));
const saveAch = () => Store.set('dcas_ach', JSON.stringify(achievements));
const saveInit = () => Store.set('dcas_init', JSON.stringify(initiatives));
const saveShiftR = () => Store.set('dcas_shift', JSON.stringify(shiftReports));
const saveCert = () => Store.set('dcas_cert', JSON.stringify(certifications));
const certExpiryDays = (d) =>
  d ? Math.ceil((new Date(d + 'T23:59') - Date.now()) / 86400000) : -Infinity;
const certStatus = (d) => {
  const n = certExpiryDays(d);
  return n < 0 ? 'expired' : n < 90 ? 'soon' : 'valid';
};

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
  certifications = [
    {
      staffId: '2238',
      staffTeam: 'A',
      certs: {
        bls: '2027-06-01',
        acls: '2026-12-15',
        pals: '2026-09-01',
        phtls: '2027-03-01',
        driving: '2027-05-01',
        airport: '2026-08-15',
      },
    },
    {
      staffId: '756',
      staffTeam: 'A',
      certs: {
        bls: '2026-07-01',
        acls: '2026-06-01',
        pals: '2026-11-01',
        phtls: '2027-02-01',
        driving: '2026-12-01',
        airport: '2026-09-01',
      },
    },
    {
      staffId: '1293',
      staffTeam: 'B',
      certs: {
        bls: '2026-08-01',
        acls: '2026-10-01',
        pals: '2027-04-01',
        phtls: '2026-07-01',
        driving: '2027-06-01',
        airport: '2026-11-01',
      },
    },
  ];
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
  if (force) {
    go('dashboard');
    toast('Sample data loaded');
  }
}
if (!Store.get('dcas_seeded')) seedSample(false);

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
function terminalCoverage(d) {
  const all = stationsList();
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
      const on = s.crew.filter((c) => isDuty(shiftOn(c, d)));
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
  $('#dsDate').textContent = 'June ' + day;
  $('#dsWd').textContent = dateOf(day).toLocaleDateString('en-US', { weekday: 'long' });
  $('#dsToday').classList.toggle('show', day !== TODAY);
  const onDuty = STAFF.filter((s) => isDuty(shiftOn(s, day))).length;
  const cov = terminalCoverage(day);
  const totStations = cov.reduce((a, c) => a + c.stations, 0),
    totCov = cov.reduce((a, c) => a + c.covered, 0);
  const covPct = Math.round((totCov / totStations) * 100);
  const openIssues = challenges.filter((c) => c.status !== 'Resolved').length;
  const avail = Math.round((onDuty / STAFF.length) * 100);

  const expiredCerts = [],
    soonCerts = [];
  certifications.forEach((record) => {
    if (!record.certs) return;
    Object.entries(record.certs).forEach(([_k, d]) => {
      const s = certStatus(d);
      if (s === 'expired') expiredCerts.push(record.staffId);
      else if (s === 'soon') soonCerts.push(record.staffId);
    });
  });
  const uniqueExpired = [...new Set(expiredCerts)].length;
  const uniqueSoon = [...new Set(soonCerts)].length;

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
      ? '<div class="lb-cert" data-act="go" data-v="staff">' +
        (uniqueExpired
          ? '<span class="lb-badge lb-bad">' + uniqueExpired + ' expired</span>'
          : '') +
        (uniqueSoon
          ? '<span class="lb-badge lb-warn">' + uniqueSoon + ' expiring soon</span>'
          : '') +
        '<span class="lb-cert-l">Certifications \u2192</span></div>'
      : '');

  const todayStr = today();
  const todayShift = new Date().getHours() < 14 ? 'Day' : 'Night';
  const hasTodayReport = shiftReports.some((r) => r.date === todayStr && r.shift === todayShift);
  $('#shiftNudge').innerHTML = hasTodayReport
    ? ''
    : '<div class="shift-nudge"><div class="shift-nudge-body"><span class="shift-nudge-icon">\u26a0</span><div><div class="shift-nudge-t">End-of-shift report due</div><div class="shift-nudge-d">' +
      todayShift +
      ' shift \u00b7 ' +
      fmtD(todayStr) +
      '</div></div></div><button class="shift-nudge-btn" data-act="shift-new">File report \u2192</button></div>';

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
  $('#cmdDate').textContent = 'June ' + day;
  $('#cmdWd').textContent = dateOf(day).toLocaleDateString('en-US', { weekday: 'long' });
  $('#cmdToday').classList.toggle('show', day !== TODAY);
  $('#cmdDayLbl').textContent = 'June ' + day;
  const cov = terminalCoverage(day);
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
            '</div><div class="sub"><span class="mono">' +
            esc(s.callsign) +
            '</span> \u00b7 ' +
            esc(s.title) +
            ' \u00b7 Team ' +
            s.team +
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
const certBadge = (label, key, data) => {
  const d = data ? data[key] : null;
  const s = d ? certStatus(d) : null;
  const days = d ? certExpiryDays(d) : 0;
  const color =
    s === 'expired'
      ? ['var(--red-soft)', 'var(--red-d)']
      : s === 'soon'
        ? ['var(--amber-soft)', 'var(--amber)']
        : ['var(--green-soft)', 'var(--green)'];
  return (
    '<span style="display:inline-flex;align-items:center;gap:6px;background:' +
    color[0] +
    ';color:' +
    color[1] +
    ';padding:4px 9px;border-radius:8px;font-size:12px;font-weight:600;margin:3px 3px 0 0">' +
    esc(label) +
    ' ' +
    (d ? fmtD(d) : '<span style="opacity:.5">—</span>') +
    (s === 'expired'
      ? ' <span style="font-size:10px">EXPIRED</span>'
      : s === 'soon'
        ? ' <span style="font-size:10px">(' + days + 'd)</span>'
        : '') +
    '</span>'
  );
};
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
      det('Certifications', certSection(s)) +
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

function certSection(s) {
  const data = getStaffCerts(s.id, s.team);
  const keys = {
    bls: 'BLS',
    acls: 'ACLS',
    pals: 'PALS',
    phtls: 'PHTLS',
    driving: 'Driving Permit',
    airport: 'Airport Permit',
  };
  const certs = data && data.certs ? data.certs : {};
  const h = Object.entries(keys)
    .map(([k, label]) => certBadge(label, k, certs))
    .join('');
  return (
    '<div style="margin-bottom:8px">' +
    h +
    '</div>' +
    '<button class="btn btn-ghost" data-act="stf-cert" data-id="' +
    esc(s.id) +
    '" data-team="' +
    esc(s.team) +
    '">Update certifications</button>'
  );
}
function editStfCerts(id, team) {
  const s =
    STAFF.filter((x) => x.id === id && x.team === team)[0] || STAFF.filter((x) => x.id === id)[0];
  if (!s) return;
  let data = getStaffCerts(id, team);
  if (!data) {
    data = { staffId: id, staffTeam: team, certs: {} };
    certifications.push(data);
  }
  const keys = {
    bls: 'BLS',
    acls: 'ACLS',
    pals: 'PALS',
    phtls: 'PHTLS',
    driving: 'Driving Permit',
    airport: 'Airport Permit',
  };
  const c = data.certs || {};
  const fields = Object.entries(keys)
    .map(
      ([k, label]) =>
        '<div class="field" style="flex:1;min-width:120px"><label>' +
        label +
        '</label><input id="cert-' +
        k +
        '" type="date" value="' +
        esc(c[k] || '') +
        '"></div>',
    )
    .join('');
  openSheet(
    'Certifications \u2014 ' + dispName(s.name),
    '<div class="field-row" style="flex-wrap:wrap">' +
      fields +
      '</div>' +
      '<p style="font-size:12px;color:var(--muted);margin:6px 0 14px">Leave blank for certifications the staff member does not hold.</p>' +
      '<button class="btn btn-primary" data-act="stf-cert-save" data-id="' +
      esc(id) +
      '" data-team="' +
      esc(team) +
      '">Save certifications</button>',
  );
}
function saveStfCerts(id, team) {
  const keys = ['bls', 'acls', 'pals', 'phtls', 'driving', 'airport'];
  const certs = {};
  keys.forEach((k) => {
    const v = $('#cert-' + k).value;
    if (v) certs[k] = v;
  });
  let data = getStaffCerts(id, team);
  if (data) data.certs = certs;
  else {
    certifications.push({ staffId: id, staffTeam: team, certs: certs });
  }
  saveCert();
  closeSheet();
  viewStaff(id, team);
  toast('Certifications saved');
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
  const shiftVal = r ? r.shift : new Date().getHours() < 14 ? 'Day' : 'Night';
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

/* ===== Excel I/O ===== */
const hasXLSX = () => typeof XLSX !== 'undefined';
function renderSettings() {
  $('#xlsxState').textContent = hasXLSX() ? 'ready' : 'loading\u2026';
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
  [
    ['dropRoster', 'roster'],
    ['dropReport', 'report'],
    ['dropAch', 'ach'],
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
      if (kind === 'roster') importRoster(wb);
      else if (kind === 'report') importReports(wb);
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
  const SEC = [
    'RELIEVERS',
    'RELIEVERS from Other Areas',
    'Overtime',
    'Swap',
    'ANNUAL LEAVES',
    'SPECIAL DUTY',
  ];
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
      if (SEC.indexOf(c[0]) >= 0) supp = true;
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
  toast(out.length + ' staff loaded from Excel');
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
    Certifications: certifications.flatMap((r) => {
      const s =
        STAFF.filter((x) => x.id === r.staffId && x.team === r.staffTeam)[0] ||
        STAFF.filter((x) => x.id === r.staffId)[0];
      return Object.entries(r.certs || {}).map(([k, d]) => ({
        Name: s ? dispName(s.name) : r.staffId,
        'Staff ID': r.staffId,
        Certification:
          {
            bls: 'BLS',
            acls: 'ACLS',
            pals: 'PALS',
            phtls: 'PHTLS',
            driving: 'Driving Permit',
            airport: 'Airport Permit',
          }[k] || k,
        'Expiry Date': d,
        Status: certStatus(d),
      }));
    }),
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
function resetSample() {
  if (!confirm('Reload demo data? This replaces current records.')) return;
  seedSample(true);
}
function clearAll() {
  if (
    !confirm('Clear ALL records (reports, challenges, achievements, initiatives, shift reports)?')
  )
    return;
  reports = [];
  challenges = [];
  achievements = [];
  initiatives = [];
  certifications = [];
  shiftReports = [];
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

/* ===== shared ===== */
function openSheet(t, h) {
  $('#sheetTitle').textContent = t;
  $('#sheetBody').innerHTML = h;
  $('#scrim').classList.add('open');
  $('#sheet').classList.add('open');
}
function closeSheet() {
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
  'shift-new': () => editShift(null),
  'shift-view': (a) => viewShift(a.id),
  'shift-edit': (a) => editShift(a.id),
  'shift-del': (a) => delShift(a.id),
  'shift-save': (a) => saveShiftForm(a.id || ''),
  'shift-filter': (a) => {
    shiftFilter = a.key;
    renderShift();
  },
};
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = ACTIONS[el.dataset.act];
  if (fn) {
    e.preventDefault();
    fn(el.dataset);
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
].forEach((p) => {
  const id = p.split('|')[0],
    fn = {
      renderStaff: renderStaff,
      renderChallenges: renderChallenges,
      renderAch: renderAch,
      renderInit: renderInit,
      renderShift: renderShift,
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
