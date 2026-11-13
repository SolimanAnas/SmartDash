# DCAS Airport Operations Platform — Agent Instructions

Handoff/onboarding for an AI coding agent (OpenCode, Claude Code, etc.) continuing this project.
Place this file at the repo root. It also works as `AGENTS.md` / `CLAUDE.md`.

---

## 1. What this is

An offline-first **Progressive Web App** for the **Dubai Corporation for Ambulance Services (DCAS) — Airport Section** (Dubai Int'l / DXB and Al-Maktoum / DWC). It gives shift supervisors and management a single view of:

- **Operations** — terminal coverage, station staffing, who's on duty.
- **Roster** — the 4-platoon (A/B/C/D) monthly shift schedule.
- **Records** — challenges (issue tracker), monthly KPI reports, staff achievements, and digital-transformation initiatives.
- **Paramedic documents** — one permanent record per medic for licenses & accreditations, personal documents (Emirates ID, passport, residence visa), refresher courses, academic qualifications and training path, with predictive expiry alerts (60/30/15 days), a QR code profile per medic, and a shift-readiness heatmap.
- **Analytics** — KPI trends (cases, response time, ROSC) and staffing distributions.

It is the Phase-1 deliverable of a departmental digital-transformation initiative. Target deployment is a **Capacitor** Android wrapper around the single built HTML file.

---

## 2. Golden rules (read before editing)

1. **Vanilla only.** No React/Vue/frameworks, no build-time runtime libs. The **only** external runtime dependency is **SheetJS (xlsx)** loaded from a CDN `<script>` for Excel I/O.
2. **One-page architecture with PWA assets.** The core deliverable is a single self-contained HTML. Develop in modules under `src/`; `esbuild` bundles to `dist/`. The build also copies `manifest.json`, `sw.js`, and `404.html` to the output — these are required for PWA install + offline + GitHub Pages 404 handling. Never add other external runtime dependencies.
3. **No inline event handlers.** All clicks go through one delegated listener and the `ACTIONS` map, via `data-act` + `data-*` attributes. There must be **zero** `onclick=`/`oninput=` in the output.
4. **Escape everything rendered.** Any dynamic value placed into `innerHTML` must pass through `esc()`. **Never** put data into an executable/JS-string context — read it from `el.dataset` instead. This is the XSS guarantee; do not weaken it.
5. **Excel, not JSON, for users.** Supervisors import/export via `.xlsx`. JSON is internal storage only — do not surface JSON file import/export in the UI.
6. **Roster is read-only data.** Staff/station/shift data is bundled and updated only by re-uploading the Excel roster (Upload Center) + rebuild. Do not add per-staff editing UI for roster fields. **Exception:** staff documents (licenses, IDs, visas, refresher courses, qualifications, training) are edited per staff member and stored separately in localStorage (`dcas_cert`).
7. **Privacy.** Data includes staff names, phone numbers, IDs (PII) and operational info. Do **not** send it to external APIs/analytics. Do **not** commit real `data/roster.json` with actual PII to a public repo — use an anonymized roster instead. Everything stays client-side until a sanctioned backend exists (see §11).
8. **Verify before done.** Run the checklist in §10 after any change.

---

## 3. Stack & repo layout

```
proj/
├── src/
│   ├── util.js         # pure helpers (exports). No DOM, no state.
│   ├── docs.js         # pure staff-documents logic: definitions, 60/30/15 tiers, readiness, QR payload.
│   ├── qr.js           # dependency-free QR Code encoder (byte mode, ECC M) → SVG.
│   ├── app.js          # the application: state, views, Excel I/O, dispatcher.
│   ├── style.css       # extracted CSS, minified via esbuild at build time.
│   ├── manifest.json   # PWA manifest (icons, display, theme).
│   ├── sw.js           # service worker (cache-first, offline fallback).
│   ├── 404.html        # custom 404 page for GitHub Pages.
│   └── index.html      # HTML shell with /*CSS*/ and /*BUNDLE*/ slots.
├── data/
│   └── roster.json     # roster data, imported by app.js and bundled at build time.
├── tests/
│   ├── serve.mjs       # local HTTP server for Playwright tests.
│   ├── pwa.spec.js     # PWA manifest/SW/404 validity tests.
│   ├── docs.spec.js    # unit tests for docs.js (tiers, dates, readiness, QR payload).
│   ├── qr.spec.js      # QR encoder decoded by an independent decoder (jsQR, dev-only).
│   └── app.spec.js     # app functionality tests.
├── build.mjs           # esbuild: bundle + minify → dist/ → copy assets → root index.html.
├── package.json        # scripts: build, lint, format, test, ci.
├── eslint.config.js    # ESLint flat config.
├── .prettierrc         # Prettier config.
└── playwright.config.js # Playwright config (webServer, 1 worker, 30s timeout).
```

- Language: ES2017+ vanilla JS, CSS custom properties, semantic HTML.
- Bundler: **esbuild** (`format: 'iife'`, `bundle: true`, `minify: true`, JSON loader).
- `roster.json` is consumed via `import ROSTER from "../data/roster.json"` and inlined by esbuild.

---

## 4. Build & run

```bash
npm install
npm run build          # → dist/dcas-airport-platform.html + root index.html (for GitHub Pages)
```

Update next month's roster: replace `data/roster.json` (matching the existing shape) **or** use the in-app Upload Center, then `npm run build`.

Add a module: create `src/<name>.js`, `import` it from `app.js`; esbuild bundles it into the single output. (`charts` and the Excel layer are the next clean extraction candidates — both are mostly self-contained.)

---

## 5. Architecture

### State (in `app.js` closure)
Mutable module-scoped vars (not global): `day` (1–30, `TODAY` = today's day of month), `view`, `stfFilter`, `chFilter`, `achFilter`, `initFilter`, `docsFilter`, `STAFF`, `ROSTER`, the record arrays `challenges`, `reports`, `achievements`, `initiatives`, `certifications`, `shiftReports`, plus `notifLog` (raised expiry alerts) and `policy` (document keys that count toward readiness).

### Navigation
`go(view)` toggles `.view` panels and the bottom-nav active state, then calls that view's render fn.
Views: `dashboard`, `command`, `roster`, `challenges`, `more`, `staff`, `docs`, `readiness`, `reports`, `shift`, `analytics`, `achievements`, `initiatives`, `upload`, `settings`. (`more` is a hub; views reached from it set the nav highlight back to `more`.)
Hash routes handled on load and on `hashchange`: `#verify=<payload>` (QR badge → verification card), `#docs`, `#readiness` (used by notification taps).

### Event delegation (the only event model)
One listener: `document.addEventListener('click', …)` → `e.target.closest('[data-act]')` → `ACTIONS[act](el.dataset, el)`.
To add an interaction:
1. Render the element with `data-act="my-action"` and any `data-id` / `data-key` / etc.
2. Add `'my-action': a => myFn(a.id)` to the `ACTIONS` map.
Search inputs use debounced `input` listeners attached in init (`deb(fn, 150)`), not inline.

### Rendering
Each `renderX()` builds an HTML string and assigns it to a container once (single reflow). All dynamic values wrapped in `esc()`. Detail/edit screens use `openSheet(title, html)` (bottom sheet) with `det(k, v)` rows; `closeSheet()` to dismiss; `toast(msg)` for feedback; `emptyState(text)` for empty lists.

### Storage
`Store` wrapper = `localStorage` with an **in-memory fallback** (so a sandboxed/blocked environment doesn't crash). Always use `Store.get/set`, never `localStorage` directly.
Keys: `dcas_ch`, `dcas_rep`, `dcas_ach`, `dcas_init`, `dcas_cert` (staff documents), `dcas_shift` (records), `dcas_notif` (raised expiry alerts), `dcas_notif_run` (last alert check), `dcas_policy` (readiness policy), `dcas_roster` (uploaded-roster override), `dcas_seeded` / `dcas_docs_v` (sample-data flags).
`seedSample()` loads demo reports/challenges on first run (flagged) so dashboards aren't empty for demos; Settings can reset/clear.

### Derived operations data
- `stationsList()` — unique stations (across teams) with crew.
- `TERMS` — the four terminal groups (T1/T2/T3 DXB, DWC).
- `terminalCoverage(day)` — per terminal: stations, covered, gaps, headcount, status (`ok`/`short`/`crit`). Drives Dashboard + Command Center.
- `teamCode(team, day)` — modal shift code for a team on a day (roster strip).
- `shiftOn(staff, day)`, `isDuty(code)`.
- `rosterISO(day)` — roster day → calendar date (from `ROSTER.year` / `monthIndex`).
- `expsOf(staff)` — expiry map for a staff member (cached; `saveCert()` invalidates).
- `staffAssess(staff, date)` / `shiftReadiness(day, code)` — readiness of a medic / of a shift crew, evaluated **on the shift's date**.
- `currentAlerts(date)` — every document at a 60/30/15-day milestone, expired, or not on file.

### Staff documents & alerts
- Definitions live in `docs.js` (`DOC_DEFS`, grouped by `DOC_GROUPS`). Each has a 1-char code for the QR payload, an optional `block` (counts toward readiness by default: `'all'`, or `'adv'` = EMT-A/SIC only), `opt` (blank = not held), `na` (may be "not applicable", e.g. residence visa for UAE nationals) and `months` (refresher validity after completion).
- **Alert engine** `runAlertEngine()` runs on load, every 6 h while open, on return to the app, and after any document save/import. Each milestone a document crosses is raised once into `notifLog` (key `team|id|doc|expiry|tier`), pushed as a device notification when permitted (via the service worker; `notificationclick` opens `#docs`), and addressed to the medic plus their team's SIC(s). Renewing a document retires its alerts. Delivery to people is one tap: `sms:` links (medic, SIC, team digest) — no external API.
- **QR profile**: `qrSvg(verifyUrl(staff))`. The status snapshot travels in the URL **#fragment** (never sent to a server) and only carries `QR_DEFS` — personal documents (EID, passport, visa) are never encoded. Scanning on a device that has records shows the live record and flags an out-of-date badge; on any other device the card shows **Cannot verify** with no verdict (badges are unsigned, so a snapshot must never claim readiness). In-app scanning uses `BarcodeDetector` where available, with staff-ID lookup as fallback.
- **Readiness**: a medic is ready for a shift when every document in `policy` is valid on that shift's date (Settings → Shift readiness policy). Bands: ≥95% ready, 85–94% watch, <85% at risk.

### Excel I/O
`hasXLSX()` guards all Excel use. `handleFile(file, kind)` → `importRoster|importReports|importAchievements`. `writeBook(name, sheets)` writes `.xlsx`; `tplReport()/tplAch()` emit templates; `exportAllExcel()` writes a multi-sheet workbook.
**Roster parser** reads only dotted sheets `.A.`–`.D.`; columns `[Terminal, Area, Call Sign, Title, Staff ID, Name, Phone, ADP, TDP, day1..day30, Remarks]`; skips `RELIEVERS/Overtime/Swap/ANNUAL LEAVES/SPECIAL DUTY`; switches airport on `Dubai International Airport` / `Al-Maktoum Airport` rows.

---

## 6. Data models

```js
// staff (read-only, from roster)
{ team:'A'|'B'|'C'|'D', airport:'DXB'|'DWC', terminal, area,
  callsign:'AIRPORT 12'|'Supervisor', stationNo:'12',
  title:'EMT'|'EMT-A'|'SIC', id:'2238', name, phone,
  adp:bool, tdp:bool, shifts:[30 codes], remark }

// ROSTER
{ month:'June 2026', year, monthIndex:5, days:30, teams:['A','B','C','D'], staff:[...] }

// challenge
{ id, date, category, location, description,
  priority:'Low'|'Medium'|'High'|'Critical',
  status:'Open'|'In progress'|'Resolved', owner, createdAt }

// report (monthly KPIs)
{ id, month:'YYYY-MM', cases, resp /*min*/, rosc, refusals, transfers, sample? }

// achievement
{ id, staffName, staffId, title, desc, cat, date, notes, createdAt }

// initiative
{ id, title, desc, cat, status:'proposed'|'progress'|'done'|'hold',
  owner, ownerId, startDate, completedDate, impact, createdAt }

// staff documents (dcas_cert — an array, one entry per staff member)
{ staffId, staffTeam,
  certs: { dha, bls, acls, pals, phtls, driving, airport,      // licenses & accreditations → expiry date
           eid, passport, visa,                               // personal documents → expiry date | 'na'
           ref_cpr, ref_mci, ref_ic, ref_air },               // refresher courses → date completed
  quals:    [{ title, inst, year, attested }],                // academic qualifications
  training: [{ course, provider, date, hours }],              // training path
  sample?, updatedAt? }

// notifLog (dcas_notif) — one entry per milestone raised
{ 'A|0002|dha|2026-12-01|30': { at, medic?, sic? } }          // timestamps (ms)
```

Excel template columns:
- Monthly Report: `Month, Cases, Avg Response (min), ROSC, Refusals, Transfers`
- Achievements: `Name, Staff ID, Achievement, Description, Type, Date, Notes`
- Staff documents (workbook, prefilled from the roster and current records so it round-trips):
  - `Documents`: `Staff ID, Team, Name, Title`, then one column per document — `<Label> (expiry)` or `<Label> (completed)` for refresher courses. Dates as `YYYY-MM-DD`, `DD/MM/YYYY` or Excel dates; `N/A` where allowed. Blank cells leave the record unchanged.
  - `Qualifications`: `Staff ID, Team, Name, Qualification, Institution, Year, Attested` (replaces that medic's list).
  - `Training`: `Staff ID, Team, Name, Course, Provider, Date, Hours` (replaces that medic's list).

---

## 7. Design system

- **Fonts:** `Sora` (display/headings/numbers), `IBM Plex Sans` (body), `IBM Plex Mono` (codes, IDs, shift cells). Loaded from Google Fonts; system fallbacks degrade gracefully offline.
- **Colors (CSS vars):** `--red #C8102E` / `--red-d #A30C24` (brand), `--ink` text, `--bg`/`--surface`. Shift codes: `--day #B5790A`, `--night #3B4DA6`, `--off`, `--leave #0E8074`. Team accents: A=red, B=indigo (`--night`), C=gold, D=green.
- **Shift codes:** `D` Day, `N` Night, `X` Off, `AL` Annual leave.
- **Status classes:** challenges → `.st-open/.st-prog/.st-res` (via `stCls()`); priority → `.pri-Low/.pri-Medium/.pri-High/.pri-Critical`.
- Keep the institutional, high-contrast, mobile-first look. Bottom nav (5 tabs), bottom sheets for detail/edit, FAB on list views.

---

## 8. Domain glossary

- **DCAS** — Dubai Corporation for Ambulance Services. **DXB** — Dubai Int'l Airport. **DWC** — Al-Maktoum Airport.
- **Station / call sign** — a fixed coverage point, e.g. `AIRPORT 12`.
- **Team / platoon (A–D)** — 4 rotating crews; on any day some are Day, some Night, some Off.
- **EMT / EMT-A / SIC** — Emergency Medical Technician / Advanced / Shift-in-Charge (supervisor).
- **ADP / TDP** — duty-point assignment flags on a staff record.
- **ROSC** — Return of Spontaneous Circulation (cardiac-arrest outcome KPI).
- **Coverage** — stations with ≥1 on-duty medic ÷ total stations.

---

## 9. Current features (done)

Dashboard (live status band + document-expiry badge + shift-readiness card with 7-day strip + 6 management KPIs + response-time sparkline + coverage), Command Center (terminal status map + coverage + shift readiness for the selected shift + drill-down), Roster (4-team rotation strips + on-duty list), Challenges (CRUD + filters + stats), Shift Reports, Monthly Reports (CRUD + Excel import + template), Analytics (SVG bar/line charts), Staff Directory + Employee Portfolio (readiness banner, licenses & accreditations, personal documents, refresher courses, academic qualifications, training path, attendance, linked achievements/initiatives, tap-to-call, shift calendar), **Paramedic documents** (documents editor, Documents & Alerts view with 60/30/15-day predictive expiry alerts, device notifications, SMS reminders to medic/SIC and team digests, QR code profile per medic with badge download and verification by scan or staff ID, Shift Readiness heatmap with drill-down, lowest shifts and blocking documents, configurable readiness policy, Excel workbook import/export), Achievements & Initiatives (CRUD), Upload Center (drag-drop Excel: roster/report/achievement/staff documents + templates), Settings (Excel export, readiness policy, reset/clear, roadmap), PWA (manifest.json, service worker with cache-first + offline fallback + notification taps, install banner toast, 404 page), Playwright test suite (37 tests: PWA validity, QR decoding, documents logic, app functionality), CI/CD (GitHub Actions: lint → format check → build → test), Event delegation, hardened escaping, debounced search, esbuild build pipeline.

---

## 10. Verification checklist (run after every change)

```bash
npm run lint              # must pass (0 errors)
npm run format:check      # must pass
npm run build             # must succeed
npm test                  # must pass (37 Playwright tests)
```
Then open `dist/dcas-airport-platform.html` or the built root `index.html` in a browser and click through every view + open/edit/save one record of each type. (esbuild catches syntax/import errors; Playwright covers navigation and core flows — still exercise the UI for visual regressions.)

---

## 11. Roadmap

### Safe front-end tasks to pick up
- **Shift handover form** — one screen a supervisor fills at end of shift (cases handled, issues, staff present) that writes straight into Reports + Challenges. (Highest-value next feature; supervisors enter data per shift.)
- Extract `charts.js` and `excel.js` as modules (pattern already supported).
- Per-staff Excel/portfolio export.
- Print / PDF layout for the monthly report.
- List virtualization only if staff count grows beyond ~500.

### Do NOT "fix" without discussion (deliberate decisions)
- **DOMPurify** — unnecessary given delegation + `esc()`; do not add.
- **Full decomposition of the stateful core into many modules** — optional; do incrementally, never in one risky pass.

### Paramedic documents — next steps that need a backend
- Server-side delivery of expiry alerts (push/SMS/email to each medic's own device without a supervisor tapping send) and signed QR badges. The alert log (`notifLog`) and the QR payload format are designed to be handed to that service unchanged.

### Out of scope until a data-layer decision is made (with DCAS IT)
Backend sync, authentication, RBAC (Admin/SIC/EMT), audit trails, multi-user. **Do not build these on top of localStorage.** Recommended path when greenlit: prototype on **Supabase** (Postgres + Auth + RLS + realtime) for speed, but choose **Postgres** specifically so it is portable to the DCAS-sanctioned environment (Azure UAE / Moro Hub–DEWA) for production. Data residency/compliance is a governance decision, not a technical one — route it through DCAS IT.

---

## 12. Style

Concise, readable vanilla JS. Match existing patterns (delegation, `esc()`, `Store`, `openSheet/toast`, `renderX`). CSS lives in `src/style.css` using existing tokens; it is minified and inlined at build time. Prefer small, verifiable edits; rebuild and run the checklist before declaring done.
