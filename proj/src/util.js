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
export const dateOf = (d) => new Date(2026, 5, d);
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
