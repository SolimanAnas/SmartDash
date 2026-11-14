export const esc = (s) =>
  (s == null ? '' : String(s)).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
export const deb = (fn, ms) => {
  let t;
  return function () {
    clearTimeout(t);
    t = setTimeout(fn, ms || 160);
  };
};
export const dispName = (n) => String(n || '').replace(/^(Mr\.|Mrs\.|Miss|Ms\.|Dr\.)\s*/, '');
export const initials = (n) => {
  const p = dispName(n).split(' ').filter(Boolean);
  return ((p[0] || '')[0] || '') + ((p[1] || '')[0] || '');
};
export const telOf = (p) => 'tel:' + String(p).replace(/[^\d+]/g, '');
export const uid = () =>
  crypto.randomUUID ? crypto.randomUUID() : 'id' + Date.now() + Math.random().toString(16).slice(2);
export const today = () => new Date().toISOString().slice(0, 10);
export const fmtD = (d) => {
  if (!d) return '\u2014';
  const x = new Date(d + 'T00:00');
  return isNaN(x)
    ? esc(d)
    : String(x.getDate()).padStart(2, '0') +
        '/' +
        String(x.getMonth() + 1).padStart(2, '0') +
        '/' +
        x.getFullYear();
};

/* ---- roster period: a roster is a run of consecutive days, not necessarily a calendar month ---- */
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
/** Month / year named in a file name such as "Airport_Oct._2026.xlsx" (month -1 / year null if absent). */
export function monthHint(name) {
  const s = String(name || '').toLowerCase();
  const y = /(?:^|[^0-9])(20\d\d)(?:[^0-9]|$)/.exec(s);
  const month = MONTHS.findIndex((k) => new RegExp('(^|[^a-z])' + k).test(s));
  return { month, year: y ? +y[1] : null };
}
/**
 * Start date (YYYY-MM-DD) of a roster whose header lists day-of-month numbers, e.g.
 * [5, 6, …, 31, 1, 2, …, 15]. Candidates must reproduce the header (so a 31 → 1 wrap pins
 * the month length); a file-name month wins next (most days inside it), else the period
 * nearest to `todayIso`.
 */
export function rosterStartFor(nums, hint, todayIso) {
  const ty = +todayIso.slice(0, 4),
    tm = +todayIso.slice(5, 7) - 1,
    td = +todayIso.slice(8, 10);
  if (!nums.length) return todayIso.slice(0, 8) + '01';
  const h = hint || { month: -1, year: null };
  const y0 = h.year || ty;
  const base =
    h.month >= 0
      ? [-1, 0].map((k) => [y0, h.month + k])
      : [-2, -1, 0, 1, 2].map((k) => [ty, tm + k]);
  const now = Date.UTC(ty, tm, td);
  const cands = base
    .map(([y, m]) => {
      const t = Date.UTC(y, m, nums[0]);
      if (new Date(t).getUTCDate() !== nums[0]) return null; // e.g. the 31st of a 30-day month
      let match = 0,
        inHint = 0;
      nums.forEach((n, i) => {
        const d = new Date(t + i * 864e5);
        if (d.getUTCDate() === n) match++;
        if (d.getUTCMonth() === (h.month + 12) % 12 && h.month >= 0) inHint++;
      });
      const mid = t + (nums.length / 2) * 864e5;
      return {
        iso: new Date(t).toISOString().slice(0, 10),
        match,
        inHint,
        dist: Math.abs(mid - now),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.match - a.match || b.inHint - a.inHint || a.dist - b.dist);
  return cands.length ? cands[0].iso : todayIso.slice(0, 8) + '01';
}
