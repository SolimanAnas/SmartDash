/*
 * Full-fidelity backup, restore and merge — pure logic (no DOM, no storage, no XLSX).
 *
 * A backup is a workbook described here as { sheetName: rows[][] } (array-of-arrays, header row
 * first). app.js turns it into .xlsx with SheetJS and back. Every field of every record is kept,
 * so a backup restores exactly; nested values (arrays/objects) are stored as JSON text and the
 * `_columns` sheet records which columns those are. Data sheets are plain tables (one row per
 * record, headers in row 1) so Power Automate / Office Scripts / Power BI can read them.
 *
 * Change tracking: each record carries `updatedAt` (ms). Saves are diffed against a per-record
 * signature, so changed records are stamped automatically and deletions leave a tombstone —
 * that is what lets Merge combine two devices' data without resurrecting deleted records.
 */

export const BACKUP_FORMAT = 'smartdash-backup';
/** Version of the stored data layout. Bump it and add a step to migrate() when it changes. */
export const SCHEMA_VERSION = 1;

export const COLLECTIONS = [
  { k: 'challenges', store: 'dcas_ch', sheet: 'Challenges', t: 'Challenges' },
  { k: 'reports', store: 'dcas_rep', sheet: 'Monthly Reports', t: 'Monthly reports' },
  { k: 'achievements', store: 'dcas_ach', sheet: 'Achievements', t: 'Achievements' },
  { k: 'initiatives', store: 'dcas_init', sheet: 'Initiatives', t: 'Initiatives' },
  {
    k: 'certifications',
    store: 'dcas_cert',
    sheet: 'Staff Documents',
    t: 'Staff documents',
    key: (r) => (r.staffTeam || '') + '|' + r.staffId,
  },
  { k: 'shiftReports', store: 'dcas_shift', sheet: 'Shift Reports', t: 'Shift reports' },
];
export const collOf = (k) => COLLECTIONS.filter((c) => c.k === k)[0];
export const keyOf = (c, r) => String(c.key ? c.key(r) : r.id);

const SHEET = {
  meta: '_meta',
  columns: '_columns',
  deleted: 'Deleted',
  alerts: 'Alert Log',
  settings: 'Settings',
  roster: 'Roster',
};
export const PII_NOTICE =
  'Contains staff personal data. Store only on DCAS-approved storage (e.g. the division SharePoint).';
/** Excel's limit for one cell's text. */
const CELL_MAX = 32767;

/* ---- signatures & change tracking ---- */
function stable(v) {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object')
    return (
      '{' +
      Object.keys(v)
        .filter((k) => v[k] !== undefined)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + stable(v[k]))
        .join(',') +
      '}'
    );
  return JSON.stringify(v === undefined ? null : v);
}
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}
/** Content signature of a record, ignoring its own timestamp. Sample records are marked "s". */
export function sigOf(r) {
  const o = Object.assign({}, r);
  delete o.updatedAt;
  return (r.sample ? 's' : 'r') + hash(stable(o));
}
export const isSampleSig = (s) => String(s).charAt(0) === 's';

/**
 * Diff a collection against the signatures saved last time.
 * Stamps updatedAt on new/changed records (mutates them) and reports deletions.
 * `changed` / `deleted` count only real (non-sample) records — they drive the backup reminder.
 */
export function track(c, list, prevSigs, now) {
  const sigs = {},
    deleted = [];
  let changed = 0,
    removed = 0;
  list.forEach((r) => {
    const k = keyOf(c, r);
    let s = sigOf(r);
    if (prevSigs[k] !== s) {
      r.updatedAt = now;
      s = sigOf(r);
      if (!r.sample) changed++;
    }
    sigs[k] = s;
  });
  Object.keys(prevSigs).forEach((k) => {
    if (!(k in sigs)) {
      deleted.push(k);
      if (!isSampleSig(prevSigs[k])) removed++;
    }
  });
  return { sigs, deleted, changed: changed + removed };
}
/** Signatures for a list as it stands, without stamping anything. */
export function sigsOf(c, list) {
  const o = {};
  list.forEach((r) => (o[keyOf(c, r)] = sigOf(r)));
  return o;
}

/* ---- schema migrations ---- */
/**
 * Bring a state ({ challenges: [...], ... }) written at `from` up to SCHEMA_VERSION. Mutates.
 * v0 → v1: every record gets updatedAt (createdAt when known, else 0 = "older than any edit").
 */
export function migrate(state, from) {
  let v = from || 0;
  if (v < 1) {
    COLLECTIONS.forEach((c) =>
      (state[c.k] || []).forEach((r) => {
        if (typeof r.updatedAt !== 'number') r.updatedAt = +r.createdAt || 0;
      }),
    );
    v = 1;
  }
  return state;
}

/* ---- state ⇄ sheets ---- */
const isObj = (v) => v !== null && typeof v === 'object';
function tableOf(list) {
  const cols = [],
    json = {};
  list.forEach((r) =>
    Object.keys(r).forEach((k) => {
      if (r[k] === undefined) return;
      if (cols.indexOf(k) < 0) cols.push(k);
      if (isObj(r[k])) json[k] = 1;
    }),
  );
  const rows = list.map((r) =>
    cols.map((k) => {
      const v = r[k];
      if (v === undefined || v === null) return null;
      const out = json[k] ? JSON.stringify(v) : typeof v === 'number' && !isFinite(v) ? null : v;
      if (typeof out === 'string' && out.length > CELL_MAX)
        throw new Error('A record is too large for one Excel cell (' + k + ')');
      return out;
    }),
  );
  return { cols, json, aoa: [cols].concat(rows) };
}

/**
 * Build the backup workbook.
 * state: { challenges, reports, achievements, initiatives, certifications, shiftReports,
 *          tombstones: { coll: { key: ms } }, notifLog, policy, roster: {staff, teams} | null }
 * meta:  { createdAt (ms), device, deviceId }
 */
export function toSheets(state, meta) {
  const sheets = {},
    columns = [['Sheet', 'Column', 'Type']];
  const add = (name, list) => {
    const t = tableOf(list);
    sheets[name] = t.aoa;
    t.cols.forEach((col) => columns.push([name, col, t.json[col] ? 'json' : 'value']));
  };
  COLLECTIONS.forEach((c) => add(c.sheet, state[c.k] || []));
  const del = [['Collection', 'Key', 'Deleted at']];
  Object.keys(state.tombstones || {}).forEach((ck) =>
    Object.keys(state.tombstones[ck]).forEach((k) => del.push([ck, k, state.tombstones[ck][k]])),
  );
  sheets[SHEET.deleted] = del;
  const al = [['Key', 'Raised at', 'Medic notified at', 'SIC notified at']];
  Object.keys(state.notifLog || {}).forEach((k) => {
    const e = state.notifLog[k] || {};
    al.push([k, e.at || null, e.medic || null, e.sic || null]);
  });
  sheets[SHEET.alerts] = al;
  sheets[SHEET.settings] = [
    ['Key', 'Value'],
    ['policy', state.policy ? JSON.stringify(state.policy) : null],
    ['rosterTeams', state.roster ? JSON.stringify(state.roster.teams || []) : null],
  ];
  if (state.roster && state.roster.staff) add(SHEET.roster, state.roster.staff);
  sheets[SHEET.columns] = columns;
  const created = meta.createdAt || 0;
  sheets[SHEET.meta] = [
    ['Field', 'Value'],
    ['Format', BACKUP_FORMAT],
    ['Schema version', SCHEMA_VERSION],
    ['Created', new Date(created).toISOString()],
    ['Created (ms)', created],
    ['Device', meta.device || ''],
    ['Device ID', meta.deviceId || ''],
    ['Notice', PII_NOTICE],
  ].concat(COLLECTIONS.map((c) => [c.t + ' (records)', (state[c.k] || []).length]));
  // _meta first so a person opening the file sees what it is.
  const ordered = {};
  [SHEET.meta]
    .concat(COLLECTIONS.map((c) => c.sheet))
    .concat([SHEET.deleted, SHEET.alerts, SHEET.settings, SHEET.roster, SHEET.columns])
    .forEach((n) => {
      if (sheets[n]) ordered[n] = sheets[n];
    });
  return ordered;
}

const blank = (v) => v === undefined || v === null;
function readTable(aoa, jsonCols) {
  if (!aoa || !aoa.length) return [];
  const head = aoa[0].map((h) => (blank(h) ? '' : String(h)));
  const out = [];
  for (let i = 1; i < aoa.length; i++) {
    const row = aoa[i] || [];
    const r = {};
    let any = false;
    head.forEach((k, j) => {
      const v = row[j];
      if (!k || blank(v)) return;
      any = true;
      if (jsonCols[k]) {
        try {
          r[k] = JSON.parse(v);
        } catch (e) {
          throw new Error('Damaged value in ' + k + ' (row ' + (i + 1) + ')');
        }
      } else r[k] = v;
    });
    if (any) out.push(r);
  }
  return out;
}

/**
 * Parse a backup workbook ({ sheetName: rows[][] }) into { meta, state }.
 * Throws an Error with a user-facing message when the file is not a usable backup.
 */
export function fromSheets(sheets) {
  const metaRows = sheets[SHEET.meta];
  const m = {};
  (metaRows || []).slice(1).forEach((r) => {
    if (r && !blank(r[0])) m[String(r[0])] = r[1];
  });
  if (m.Format !== BACKUP_FORMAT)
    throw new Error(
      'This is not a SmartDash backup file (use Upload Center for other Excel files)',
    );
  const version = +m['Schema version'] || 0;
  if (version > SCHEMA_VERSION)
    throw new Error('This backup was made by a newer SmartDash version — update the app first');
  const json = {};
  (sheets[SHEET.columns] || []).slice(1).forEach((r) => {
    if (r && r[2] === 'json') (json[r[0]] = json[r[0]] || {})[r[1]] = 1;
  });
  const state = {};
  COLLECTIONS.forEach((c) => (state[c.k] = readTable(sheets[c.sheet], json[c.sheet] || {})));
  state.tombstones = {};
  (sheets[SHEET.deleted] || []).slice(1).forEach((r) => {
    if (!r || blank(r[0]) || blank(r[1])) return;
    (state.tombstones[r[0]] = state.tombstones[r[0]] || {})[String(r[1])] = +r[2] || 0;
  });
  state.notifLog = {};
  (sheets[SHEET.alerts] || []).slice(1).forEach((r) => {
    if (!r || blank(r[0])) return;
    const e = { at: +r[1] || 0 };
    if (!blank(r[2])) e.medic = +r[2];
    if (!blank(r[3])) e.sic = +r[3];
    state.notifLog[String(r[0])] = e;
  });
  const set = {};
  (sheets[SHEET.settings] || []).slice(1).forEach((r) => {
    if (r && !blank(r[0]) && !blank(r[1])) set[r[0]] = JSON.parse(r[1]);
  });
  state.policy = set.policy || null;
  const staff = readTable(sheets[SHEET.roster], json[SHEET.roster] || {});
  state.roster = staff.length ? { staff, teams: set.rosterTeams || [] } : null;
  migrate(state, version);
  return {
    meta: {
      version,
      createdAt: +m['Created (ms)'] || Date.parse(m.Created) || 0,
      device: m.Device || '',
      deviceId: m['Device ID'] || '',
    },
    state,
  };
}

/* ---- merge ---- */
/**
 * Combine local and incoming state record by record. Pure: returns a new state.
 * - same key on both sides → the newer updatedAt wins (local wins a tie)
 * - a deletion (tombstone) wins over a record not edited since it was deleted
 * - policy and roster stay local (they are device settings; Replace takes the file's)
 * stats[coll] = { added, updated, same, kept, removed, skipped }
 *   kept: local copy is newer · skipped: deleted here, not re-added · removed: deleted in the file
 */
export function merge(local, incoming) {
  const out = { tombstones: {}, stats: {} };
  COLLECTIONS.forEach((c) => {
    const lt = (local.tombstones || {})[c.k] || {},
      it = (incoming.tombstones || {})[c.k] || {};
    const tomb = Object.assign({}, lt);
    Object.keys(it).forEach((k) => (tomb[k] = Math.max(tomb[k] || 0, it[k])));
    const st = { added: 0, updated: 0, same: 0, kept: 0, removed: 0, skipped: 0 };
    const map = {},
      order = [];
    (local[c.k] || []).forEach((r) => {
      const k = keyOf(c, r);
      map[k] = r;
      order.push(k);
    });
    (incoming[c.k] || []).forEach((r) => {
      const k = keyOf(c, r),
        mine = map[k],
        t = r.updatedAt || 0;
      if (!mine) {
        if (lt[k] != null && lt[k] >= t) st.skipped++;
        else {
          map[k] = r;
          order.push(k);
          st.added++;
        }
      } else if (sigOf(mine) === sigOf(r)) st.same++;
      else if (t > (mine.updatedAt || 0)) {
        map[k] = r;
        st.updated++;
      } else st.kept++;
    });
    const list = [];
    order.forEach((k) => {
      const r = map[k];
      if (tomb[k] != null && tomb[k] >= (r.updatedAt || 0)) {
        if (it[k] != null && (local[c.k] || []).some((x) => keyOf(c, x) === k)) st.removed++;
        return;
      }
      if (tomb[k] != null) delete tomb[k]; // re-created after the deletion
      list.push(r);
    });
    out[c.k] = list;
    out.tombstones[c.k] = tomb;
    out.stats[c.k] = st;
  });
  const nl = Object.assign({}, local.notifLog || {});
  Object.keys(incoming.notifLog || {}).forEach((k) => {
    const a = nl[k] || {},
      b = incoming.notifLog[k];
    const e = { at: Math.min(a.at || b.at || 0, b.at || a.at || 0) };
    const medic = Math.max(a.medic || 0, b.medic || 0),
      sic = Math.max(a.sic || 0, b.sic || 0);
    if (medic) e.medic = medic;
    if (sic) e.sic = sic;
    nl[k] = e;
  });
  out.notifLog = nl;
  out.policy = local.policy;
  out.roster = local.roster;
  return out;
}

/** Totals for a preview line: how many records the file has and how many it would change. */
export function statTotals(stats) {
  const t = { added: 0, updated: 0, same: 0, kept: 0, removed: 0, skipped: 0 };
  Object.keys(stats).forEach((k) => Object.keys(t).forEach((f) => (t[f] += stats[k][f])));
  return t;
}

/* ---- workbook conversion (SheetJS passed in, so this module stays dependency-free) ---- */
export function sheetsToWorkbook(X, sheets) {
  const wb = X.utils.book_new();
  Object.keys(sheets).forEach((n) =>
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(sheets[n]), n),
  );
  return wb;
}
export function workbookToSheets(X, wb) {
  const out = {};
  wb.SheetNames.forEach((n) => {
    out[n] = X.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, blankrows: false });
  });
  return out;
}
