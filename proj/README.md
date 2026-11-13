# DCAS Airport Operations Platform

Modular source that compiles to a single, self-contained HTML file for PWA / Capacitor deployment.

## Layout
- `src/util.js`   - pure helpers (escaping, dates, ids)
- `src/docs.js`   - staff documents logic (definitions, 60/30/15-day alert tiers, shift readiness, QR payload)
- `src/qr.js`     - dependency-free QR Code encoder (SVG output)
- `src/app.js`    - application (state, views, Excel I/O, delegated dispatcher)
- `src/index.html`- HTML shell + CSS, with a `/*BUNDLE*/` slot for the compiled JS
- `data/roster.json` - roster, imported and bundled at build time

## Build
```
npm install
npm run build
```
Output: `dist/dcas-airport-platform.html` (one file, minified, no external JS except the SheetJS + fonts CDN links).

## Update next month's roster
Replace `data/roster.json` (or use the in-app Upload Center), then `npm run build`.

## Add more modules
Create files under `src/` and `import` them from `app.js`; esbuild bundles them back into the single output.
