import { test, expect } from '@playwright/test';
import jsQR from 'jsqr';
import { qrMatrix, qrSvg } from '../src/qr.js';

// Rasterise a QR matrix into RGBA pixels and decode it with an independent decoder.
function decode(q, scale = 4, border = 4) {
  const dim = (q.size + border * 2) * scale;
  const px = new Uint8ClampedArray(dim * dim * 4).fill(255);
  for (let y = 0; y < q.size; y++)
    for (let x = 0; x < q.size; x++)
      if (q.dark(x, y))
        for (let sy = 0; sy < scale; sy++)
          for (let sx = 0; sx < scale; sx++) {
            const i = (((y + border) * scale + sy) * dim + (x + border) * scale + sx) * 4;
            px[i] = px[i + 1] = px[i + 2] = 0;
          }
  const r = jsQR(px, dim, dim);
  return r ? r.data : null;
}

test('QR encoder round-trips across versions and ECC levels', () => {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~:/?#=&%';
  const versions = new Set();
  for (const ecl of ['L', 'M', 'Q', 'H']) {
    for (const len of [1, 17, 60, 150, 300, 600]) {
      let t = '';
      for (let i = 0; i < len; i++) t += chars[(i * 31 + len) % chars.length];
      const q = qrMatrix(t, ecl);
      versions.add(q.version);
      expect(q.size).toBe(q.version * 4 + 17);
      expect(decode(q, q.version > 25 ? 3 : 4)).toBe(t);
    }
  }
  expect(versions.size).toBeGreaterThan(10);
});

test('QR encoder handles UTF-8 (Arabic) payloads', () => {
  const t = 'ملف المسعف الرقمي — SmartDash';
  expect(decode(qrMatrix(t))).toBe(t);
});

test('QR SVG output contains only numeric path data', () => {
  const svg = qrSvg('<script>alert(1)</script>');
  expect(svg.startsWith('<svg')).toBe(true);
  expect(svg).not.toContain('script');
  expect(svg).toMatch(/d="[Mhvz0-9,.-]+"/);
});
