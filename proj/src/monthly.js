/*
 * Monthly report — pure aggregation (no DOM, no storage).
 * Month keys are 'YYYY-MM'. Roster-dependent figures (coverage, readiness) and document
 * status are computed in app.js, which owns the roster.
 */

export const monthOf = (iso) => (/^\d{4}-\d{2}/.test(iso || '') ? iso.slice(0, 7) : '');
export const daysInMonth = (m) => new Date(+m.slice(0, 4), +m.slice(5, 7), 0).getDate();
export function prevMonth(m) {
  const y = +m.slice(0, 4),
    mo = +m.slice(5, 7) - 1;
  return mo === 0 ? y - 1 + '-12' : y + '-' + String(mo).padStart(2, '0');
}

/** Months that have any data, newest first. `extra` adds months that must be offered (roster). */
export function reportMonths(d, extra) {
  const set = {};
  (d.reports || []).forEach((r) => r.month && (set[r.month] = 1));
  (d.shiftReports || []).forEach((r) => monthOf(r.date) && (set[monthOf(r.date)] = 1));
  (d.challenges || []).forEach((r) => monthOf(r.date) && (set[monthOf(r.date)] = 1));
  (d.achievements || []).forEach((r) => monthOf(r.date) && (set[monthOf(r.date)] = 1));
  (extra || []).forEach((m) => m && (set[m] = 1));
  return Object.keys(set).sort().reverse();
}

const KPI = ['cases', 'resp', 'rosc', 'refusals', 'transfers'];
const PRIO_ORD = { Critical: 0, High: 1, Medium: 2, Low: 3 };
const isNight = (s) => /^n/i.test(String(s || ''));
const text = (v) => String(v == null ? '' : v).trim();

/**
 * Everything the report needs that does not depend on the roster.
 * d: { reports, shiftReports, challenges, initiatives, achievements }
 */
export function monthSummary(d, m) {
  const rep = (d.reports || []).filter((r) => r.month === m)[0] || null;
  const prev = (d.reports || []).filter((r) => r.month === prevMonth(m))[0] || null;
  const kpis = KPI.map((k) => ({
    k,
    v: rep ? +rep[k] || 0 : null,
    prev: prev ? +prev[k] || 0 : null,
  }));

  const sh = (d.shiftReports || [])
    .filter((r) => monthOf(r.date) === m)
    .sort((a, b) =>
      (a.date + (isNight(a.shift) ? 1 : 0)).localeCompare(b.date + (isNight(b.shift) ? 1 : 0)),
    );
  const sum = (k) => sh.reduce((n, r) => n + (+r[k] || 0), 0);
  const issues = (field) =>
    sh
      .filter((r) => text(r[field]))
      .map((r) => ({
        date: r.date,
        shift: isNight(r.shift) ? 'Night' : 'Day',
        team: r.team || '',
        t: text(r[field]),
      }));
  const shifts = {
    reported: sh.length,
    expected: daysInMonth(m) * 2,
    day: sh.filter((r) => !isNight(r.shift)).length,
    night: sh.filter((r) => isNight(r.shift)).length,
    cases: sum('casesHandled'),
    transfers: sum('transfers'),
    refusals: sum('refusals'),
    rosc: sum('roscCount'),
    shortages: issues('staffingShortages'),
    equipment: issues('equipmentIssues'),
    incidents: issues('pendingIncidents'),
  };

  const ch = d.challenges || [];
  const opened = ch.filter((c) => monthOf(c.date) === m);
  const byPrio = {};
  opened.forEach(
    (c) => (byPrio[c.priority || 'Medium'] = (byPrio[c.priority || 'Medium'] || 0) + 1),
  );
  const openNow = ch.filter((c) => c.status !== 'Resolved');
  const challenges = {
    opened: opened.length,
    openedResolved: opened.filter((c) => c.status === 'Resolved').length,
    byPrio,
    openNow: openNow.length,
    urgent: openNow
      .filter((c) => c.priority === 'Critical' || c.priority === 'High')
      .sort(
        (a, b) =>
          PRIO_ORD[a.priority] - PRIO_ORD[b.priority] || text(a.date).localeCompare(text(b.date)),
      ),
  };

  const ini = d.initiatives || [];
  const initiatives = {
    completed: ini.filter((i) => i.status === 'done' && monthOf(i.completedDate) === m),
    inProgress: ini.filter((i) => i.status === 'progress').length,
    proposed: ini.filter((i) => i.status === 'proposed').length,
  };
  const achievements = (d.achievements || [])
    .filter((a) => monthOf(a.date) === m)
    .sort((a, b) => text(a.date).localeCompare(text(b.date)));

  return {
    month: m,
    hasKpi: !!rep,
    hasPrev: !!prev,
    kpis,
    shifts,
    challenges,
    initiatives,
    achievements,
  };
}

/** Change vs previous month as a short label; lower is better for response time and refusals. */
export function delta(k, v, prev) {
  if (v == null || prev == null) return { t: '', good: null };
  const diff = Math.round((v - prev) * 10) / 10;
  if (!diff) return { t: 'no change', good: null };
  const better = k === 'resp' || k === 'refusals' ? diff < 0 : diff > 0;
  return { t: (diff > 0 ? '+' : '') + diff + ' vs prev.', good: better };
}
