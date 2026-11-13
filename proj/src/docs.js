/*
 * Medic documents & readiness — pure logic (no DOM, no storage).
 *
 * A staff record stores raw values per document key in `certs`:
 *   - expiry documents:   'YYYY-MM-DD' (expiry date)
 *   - refresher courses:  'YYYY-MM-DD' (date completed; due = completed + months)
 *   - 'na'                not applicable (only where def.na, e.g. residence visa for UAE nationals)
 * Everything below works on an "expiry map" { key: 'YYYY-MM-DD' | 'na' } built by expiries().
 */

/** Predictive alert milestones, in days before expiry. */
export const TIERS = [60, 30, 15];

export const DOC_GROUPS = [
  { k: 'license', t: 'Licenses & accreditations' },
  { k: 'personal', t: 'Personal documents' },
  { k: 'refresher', t: 'Refresher courses' },
];

/*
 * k: storage key · sl: short label · c: 1-char code used in the QR payload · g: group · l: label
 * block: counts against shift readiness by default ('all' staff, or 'adv' = EMT-A / SIC only)
 * opt: optional — a blank value means "not held", not "missing"
 * na: may be marked not applicable · months: refresher validity after completion
 */
export const DOC_DEFS = [
  { k: 'dha', sl: 'DHA', c: 'd', g: 'license', l: 'DHA Professional License', block: 'all' },
  { k: 'bls', sl: 'BLS', c: 'b', g: 'license', l: 'BLS', block: 'all' },
  { k: 'acls', sl: 'ACLS', c: 'a', g: 'license', l: 'ACLS', block: 'adv' },
  { k: 'pals', sl: 'PALS', c: 'p', g: 'license', l: 'PALS', opt: true },
  { k: 'phtls', sl: 'PHTLS', c: 't', g: 'license', l: 'PHTLS', opt: true },
  { k: 'driving', sl: 'Driving', c: 'v', g: 'license', l: 'Driving Permit', block: 'all' },
  { k: 'airport', sl: 'Airport', c: 'r', g: 'license', l: 'Airport Permit', block: 'all' },
  { k: 'eid', sl: 'EID', c: 'e', g: 'personal', l: 'Emirates ID', block: 'all' },
  { k: 'passport', sl: 'Passport', c: 's', g: 'personal', l: 'Passport' },
  { k: 'visa', sl: 'Visa', c: 'i', g: 'personal', l: 'Residence Visa', block: 'all', na: true },
  { k: 'ref_cpr', sl: 'CPR', c: '1', g: 'refresher', l: 'CPR & AED refresher', months: 12 },
  { k: 'ref_mci', sl: 'MCI', c: '2', g: 'refresher', l: 'Mass-casualty (MCI) drill', months: 12 },
  { k: 'ref_ic', sl: 'IC', c: '3', g: 'refresher', l: 'Infection control', months: 12 },
  { k: 'ref_air', sl: 'Airside', c: '4', g: 'refresher', l: 'Airside safety', months: 24 },
];
export const defOf = (k) => DOC_DEFS.filter((d) => d.k === k)[0];
export const defaultPolicy = () => DOC_DEFS.filter((d) => d.block).map((d) => d.k);
export const isAdvanced = (s) => !!s && (s.title === 'EMT-A' || s.title === 'SIC');

/* ---- dates (calendar days, timezone-safe via UTC) ---- */
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const isoOfUtc = (t) => new Date(t).toISOString().slice(0, 10);
const utc = (iso) => {
  const m = ISO_RE.exec(iso || '');
  if (!m) return NaN;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  return isoOfUtc(t) === iso ? t : NaN; // reject roll-overs such as 2026-02-30
};
const pad = (n) => String(n).padStart(2, '0');
export const isISO = (s) => !isNaN(utc(s));
/** Local calendar date as YYYY-MM-DD. */
export const localISO = (d) => {
  const x = d || new Date();
  return x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate());
};
export const addDays = (iso, n) => isoOfUtc(utc(iso) + n * 86400000);
export function addMonths(iso, n) {
  const m = ISO_RE.exec(iso);
  if (!m) return '';
  const y = +m[1],
    mo = +m[2] - 1 + n;
  const last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
  return isoOfUtc(Date.UTC(y, mo, Math.min(+m[3], last)));
}
export const daysBetween = (fromIso, toIso) => Math.round((utc(toIso) - utc(fromIso)) / 86400000);

/** Normalise a user/Excel value to 'YYYY-MM-DD', 'na', or '' (unrecognised / blank). */
export function normDate(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'number' && isFinite(v) && v > 59)
    return isoOfUtc(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000); // Excel serial date
  if (v instanceof Date) return isNaN(v) ? '' : localISO(v);
  const s = String(v).trim();
  if (/^(n\/?a|not applicable|exempt)$/i.test(s)) return 'na';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return isISO(s.slice(0, 10)) ? s.slice(0, 10) : '';
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s); // DD/MM/YYYY (UAE convention)
  if (m) {
    const iso = m[3] + '-' + pad(m[2]) + '-' + pad(m[1]);
    return isISO(iso) && +m[2] <= 12 ? iso : '';
  }
  return '';
}

/* ---- document state ---- */
export function expiryOf(def, value) {
  if (!value) return '';
  if (value === 'na') return def.na ? 'na' : '';
  if (!isISO(value)) return '';
  return def.months ? addMonths(value, def.months) : value;
}
export function expiries(certs) {
  const out = {};
  DOC_DEFS.forEach((d) => {
    const e = expiryOf(d, certs ? certs[d.k] : '');
    if (e) out[d.k] = e;
  });
  return out;
}
export const tierOf = (days) =>
  days < 0 ? 'expired' : days <= 15 ? 15 : days <= 30 ? 30 : days <= 60 ? 60 : null;

/**
 * State of one document as of a date.
 * state: 'valid' | 'expired' | 'missing' | 'none' (optional, not held) | 'na'
 */
export function docState(def, exp, asOf) {
  if (exp === 'na') return { def, state: 'na', exp: '', days: Infinity, tier: null };
  if (!exp)
    return { def, state: def.opt ? 'none' : 'missing', exp: '', days: -Infinity, tier: null };
  const days = daysBetween(asOf, exp);
  return { def, state: days < 0 ? 'expired' : 'valid', exp, days, tier: tierOf(days) };
}

export function isBlocking(def, staff, policy) {
  const p = policy || defaultPolicy();
  return p.indexOf(def.k) >= 0 && (def.block !== 'adv' || isAdvanced(staff));
}

/**
 * Readiness of one staff member for duty on `asOf`.
 * ready: no blocking document expired or missing on that date.
 * watch: blocking documents expiring within 15 days, and lapsed non-blocking items.
 */
export function assess(staff, exps, asOf, policy) {
  const items = DOC_DEFS.map((def) => {
    const st = docState(def, (exps || {})[def.k], asOf);
    st.blocking = isBlocking(def, staff, policy);
    return st;
  });
  const blockers = items.filter(
    (i) => i.blocking && (i.state === 'expired' || i.state === 'missing'),
  );
  const watch = items.filter(
    (i) =>
      (i.state === 'valid' && i.days <= 15 && i.blocking) ||
      (!i.blocking && (i.state === 'expired' || i.state === 'missing')),
  );
  return { ready: blockers.length === 0, blockers, watch, items };
}

/** Readiness of a shift crew. pct is null when nobody is rostered. */
export function crewReadiness(crew, expsOf, asOf, policy) {
  const rows = crew.map((s) => ({ s, a: assess(s, expsOf(s), asOf, policy) }));
  const ready = rows.filter((r) => r.a.ready).length;
  return {
    crew: rows.length,
    ready,
    pct: rows.length ? Math.round((ready / rows.length) * 100) : null,
    rows,
  };
}
export const readinessBand = (pct) =>
  pct == null ? 'none' : pct >= 95 ? 'ok' : pct >= 85 ? 'watch' : 'risk';

/* ---- QR verification payload (compact, URL-safe; lives in the URL #fragment) ---- */
const EPOCH = Date.UTC(2000, 0, 1);
const b36d = (iso) =>
  Math.max(0, Math.round((utc(iso) - EPOCH) / 86400000))
    .toString(36)
    .padStart(3, '0');
const fromB36d = (s) => isoOfUtc(EPOCH + parseInt(s, 36) * 86400000);
const clean = (s) => encodeURIComponent(String(s == null ? '' : s).replace(/~/g, '-'));

/*
 * Personal documents (Emirates ID, passport, visa) never go into a QR badge: anyone who scans it
 * can read the payload, and a visa marked N/A would reveal nationality. They stay in the app only.
 */
export const QR_DEFS = DOC_DEFS.filter((d) => d.g !== 'personal');

export function encodeVerify(p) {
  const docs = QR_DEFS.map((d) => {
    const e = (p.exps || {})[d.k];
    return e ? d.c + (e === 'na' ? '---' : b36d(e)) : '';
  }).join('');
  return ['v1', clean(p.id), clean(p.team), clean(p.title), b36d(p.asOf), docs, clean(p.name)].join(
    '~',
  );
}
export function decodeVerify(str) {
  try {
    const parts = String(str || '').split('~');
    if (parts[0] !== 'v1' || parts.length < 7) return null;
    const exps = {},
      docs = parts[5];
    for (let i = 0; i + 4 <= docs.length; i += 4) {
      const def = QR_DEFS.filter((d) => d.c === docs[i])[0];
      const v = docs.slice(i + 1, i + 4);
      if (def) exps[def.k] = v === '---' ? 'na' : fromB36d(v);
    }
    return {
      id: decodeURIComponent(parts[1]),
      team: decodeURIComponent(parts[2]),
      title: decodeURIComponent(parts[3]),
      asOf: fromB36d(parts[4]),
      exps,
      name: decodeURIComponent(parts.slice(6).join('~')),
    };
  } catch (e) {
    return null;
  }
}
/** Pull the payload out of anything a scanner returns (full URL, bare fragment, or payload). */
export function verifyPayloadFrom(text) {
  const s = String(text || '');
  const i = s.indexOf('verify=');
  return i >= 0 ? s.slice(i + 7) : s;
}

/* ---- deterministic sample documents (demo data for the anonymised roster) ---- */
function prng(seedStr) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) h = Math.imul(h ^ seedStr.charCodeAt(i), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/**
 * Plausible document set for one staff member: mostly valid, with a realistic share of
 * upcoming expiries (60/30/15-day tiers), lapses inside the roster month, and gaps.
 */
export function sampleDossier(staff, nowIso, rosterStartIso) {
  const r = prng(staff.team + '|' + staff.id);
  const int = (a, b) => a + Math.floor(r() * (b - a + 1));
  const certs = {};
  DOC_DEFS.forEach((d) => {
    if (d.opt && r() > (d.k === 'pals' ? 0.5 : 0.4)) return;
    if (d.na && r() < 0.12) certs[d.k] = 'na';
    else certs[d.k] = d.months ? addDays(nowIso, -int(15, 300)) : addDays(nowIso, int(90, 900));
  });
  if (r() < 0.06) certs.ref_mci = addDays(nowIso, -int(372, 420)); // overdue drill
  const blocking = DOC_DEFS.filter((d) => d.block === 'all').map((d) => d.k);
  const pick = (list) => list[int(0, list.length - 1)];
  const roll = r();
  if (roll < 0.08) {
    certs[pick(blocking)] = addDays(rosterStartIso, int(2, 27)); // lapses mid-roster
  } else if (roll < 0.22) {
    const k = pick(DOC_DEFS.filter((d) => !d.months && certs[d.k] && certs[d.k] !== 'na')).k;
    certs[k] = addDays(nowIso, pick([int(3, 15), int(16, 30), int(31, 60), int(31, 60)]));
  } else if (roll < 0.25) {
    delete certs[pick(['dha', 'airport', 'bls'])]; // not on file
  } else if (roll < 0.28) {
    certs[pick(blocking.filter((k) => certs[k] !== 'na'))] = addDays(nowIso, -int(3, 40));
  }
  const sic = staff.title === 'SIC';
  const quals = [
    {
      title: sic || r() < 0.3 ? 'BSc Paramedic Science' : 'Diploma in Emergency Medical Services',
      inst: 'Accredited EMS college',
      year: String(int(2008, 2021)),
      attested: r() > 0.1,
    },
  ];
  const training = [
    {
      course: 'Airport emergency orientation',
      provider: 'In-house',
      date: addDays(nowIso, -int(400, 1500)),
      hours: 16,
    },
    {
      course: 'Advanced airway workshop',
      provider: 'In-house',
      date: addDays(nowIso, -int(60, 380)),
      hours: 8,
    },
  ];
  if (sic)
    training.push({
      course: 'Major incident command',
      provider: 'In-house',
      date: addDays(nowIso, -int(90, 700)),
      hours: 24,
    });
  return { certs, quals, training };
}
