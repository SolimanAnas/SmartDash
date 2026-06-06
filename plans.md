# DCAS Airport Operations Platform — SWOT Analysis & Build Plans

_Last updated: 2026-06-06_

A strategic review of the repo as it stands today, followed by a phased, actionable build
plan. Scope is grounded in the actual codebase (`proj/src/app.js` ~2,377 LOC, single-file
vanilla-JS PWA), the handoff doc (`instructions.md`), and the aspirational roadmap
(`updates.md`).

---

## 1. Context Snapshot

| Aspect | Current state |
|---|---|
| **Product** | Offline-first PWA for DCAS Airport EMS ops (DXB + DWC) — Phase-1 digital-transformation deliverable |
| **Stack** | Vanilla JS (ES2017+), CSS custom props, esbuild → single HTML; SheetJS (CDN) for Excel; localStorage persistence |
| **Architecture** | One-page app, event delegation + `ACTIONS` map, `esc()` XSS guard, `Store` wrapper w/ in-memory fallback |
| **Persistence** | 100% client-side localStorage. No backend, no auth, no multi-user |
| **Quality gates** | ESLint + Prettier + esbuild + Playwright (17 tests); GitHub Actions CI on push/PR to `main` |
| **Deploy target** | GitHub Pages (root `index.html`) now; Capacitor Android wrapper planned |
| **Codebase size** | `app.js` 2,377 lines, `style.css` ~25 KB, built HTML ~133 KB |

---

## 2. SWOT Analysis

### 🟢 Strengths

- **Genuinely offline-first & zero-infra.** Self-contained single HTML + service worker (cache-first
  + offline fallback) + manifest. Installs as a PWA, works with no network — exactly right for
  airport floor use where connectivity is unreliable.
- **Disciplined, defensible architecture.** One delegated event listener, the `ACTIONS` map, and a
  hard `esc()`-everything XSS rule give a small, consistent surface. No framework bloat; the
  "vanilla only" constraint keeps the bundle tiny and the dependency risk near zero.
- **Real engineering hygiene for a Phase-1.** Lint + format + build + 17 Playwright tests wired into
  CI is well above typical "internal tool" baseline. The modular `src/` → bundled `dist/` split is
  clean and documented.
- **Privacy-conscious by design.** PII stays client-side; the repo ships an **anonymized** roster
  (`Staff 001`, `050XXXXXXX`) with an `anonymize.mjs` script — the public repo carries no real PII.
- **Excellent handoff documentation.** `instructions.md` is a model AGENTS.md: data models, domain
  glossary, golden rules, verification checklist, and explicit "do NOT fix" decisions. Onboarding any
  agent/dev is fast.
- **Feature-complete for its stated scope.** Dashboard, Command Center, Roster, Challenges, Reports,
  Analytics, Staff portfolio, Achievements/Initiatives, Upload Center, Certification tracking with
  expiry alerts, Settings — all shipped and tested.

### 🟡 Weaknesses

- **Monolithic `app.js` (2,377 lines).** State, all views, Excel I/O, and the dispatcher live in one
  closure. `instructions.md` itself flags `charts.js` and `excel.js` as overdue extractions. Every
  change touches one giant file → merge friction and harder review.
- **No data durability or sync.** localStorage is per-device, per-browser, wipeable by the user or a
  cache clear. There is **no backup, no export-on-schedule, no multi-device continuity**. A supervisor
  clearing site data loses all challenges/reports/certs. Excel export is the only safety net and it's
  manual.
- **No authentication / authorization / audit.** Anyone with the URL has full read/write/delete. For
  a platform holding staff PII and operational data, this is the biggest functional gap (and the whole
  Priority-1 of `updates.md`).
- **Single point of data-entry truth is fragile.** Roster updates require an Excel re-upload + rebuild;
  there's no validation feedback loop documented for malformed sheets beyond the parser's skip rules.
- **Repo hygiene drift.** Build artifacts are committed at root (`index.html`, `sw.js`, `manifest.json`,
  `404.html`) **and** a stale `dcas-airport-platform.html` (Jun 6 09:14) sits alongside the freshly
  built `index.html` (14:30) — duplication that will rot. `git status` shows many modified tracked
  files + untracked `icon/`, `proj/scripts/`, `instructions.md` not yet committed.
- **Test coverage is shallow relative to logic.** 17 Playwright tests cover navigation + PWA validity,
  but the data-heavy pure logic (`terminalCoverage`, roster parser, `teamCode`, cert-expiry math,
  Excel import) has no unit tests. Regressions in coverage math would pass CI.
- **Accessibility & i18n unverified.** No documented a11y audit; DCAS is a UAE/Dubai org where Arabic
  (RTL) support may eventually be expected — nothing addresses it yet.

### 🔵 Opportunities

- **Highest-value next feature is well-scoped: the Shift Handover form.** `instructions.md` names it as
  the top pick — one screen at end-of-shift that writes straight into Reports + Challenges. It matches
  the real supervisor workflow and turns the app from "dashboard" into "system of record."
- **Clean backend on-ramp already chosen.** The roadmap recommends Supabase (Postgres + Auth + RLS +
  realtime) for speed, portable to the DCAS-sanctioned env (Azure UAE / Moro Hub). Picking Postgres now
  de-risks the production migration. This unlocks auth, audit, multi-device, and durability in one move.
- **Cardiac Arrest Registry = clinical-quality differentiator.** A structured ROSC/rhythm/defib
  workflow (Priority-2) elevates the platform from ops dashboard to clinical-quality tool — strong
  executive-reporting story for the digital-transformation mandate.
- **Capacitor Android wrapper** turns the existing single HTML into an installable corporate app with
  near-zero rework — fast credibility win for management demos.
- **Power BI / executive reporting.** Even without a backend, a clean structured export already feeds
  Power BI; with Postgres it becomes live. Strong fit for "Read-Only Executive" stakeholders.
- **AI features (deliberately deferred).** Incident narratives, operational insights, forecasting —
  real upside later, correctly parked until the data layer exists.

### 🔴 Threats

- **Data loss is a when-not-if risk.** With localStorage as the only store, a single browser-data clear,
  device loss, or OS reinstall destroys operational history. If the platform becomes relied upon before
  durability exists, this is a reputational and operational liability.
- **PII / compliance exposure.** The app handles staff names, phones, IDs, and operational info. Any
  accidental commit of real `data/roster.json`, or any future ad-hoc external integration, risks a data
  governance breach. Data residency for UAE government data is a hard compliance constraint, not a
  technical preference.
- **Scope-creep into enterprise features on a localStorage foundation.** `updates.md` lists auth, RBAC,
  audit, Postgres, Power BI, AI. Building any of these on top of localStorage (instead of after the
  data-layer decision) would create throwaway work — `instructions.md` explicitly warns against this.
- **Bus-factor / single-maintainer risk.** One developer, one giant file. Excellent docs mitigate it,
  but key operational knowledge (roster Excel format quirks, DCAS-specific rules) is concentrated.
- **Governance dependency.** The most impactful next phase (backend) is blocked on a DCAS IT decision
  about the sanctioned environment — outside the dev's control and potentially slow.

---

## 3. Strategic Themes

1. **Don't lose data.** Durability/backup is the #1 risk; address it cheaply now, properly later.
2. **Finish the system-of-record story** (Shift Handover) before adding breadth.
3. **Keep the foundation clean** (extract modules, fix repo hygiene, add logic unit tests) so the
   backend migration lands smoothly.
4. **Gate enterprise features behind the data-layer decision** — prototype, don't pour concrete on
   localStorage.

---

## 4. Build Plan

Phased. Each phase ends with the standard verification checklist (`lint → format:check → build →
test`) passing.

### Phase 0 — Repo Hygiene & Safety Net _(this week, ~0.5 day)_

Low-risk cleanups that stop drift and de-risk everything after.

- [ ] **Commit the pending work-in-progress.** `git status` shows many modified/untracked files
      (`instructions.md`, `proj/scripts/`, `icon/`). Review and commit in logical chunks.
- [ ] **Resolve duplicated build artifacts at root.** Decide: either (a) keep committing built
      `index.html`/`sw.js`/`manifest.json`/`404.html` for GitHub Pages (document this clearly), or
      (b) move to a GitHub Pages build action and `.gitignore` them. Delete the stale
      `dcas-airport-platform.html` duplicate at root.
- [ ] **Add `data/roster.json` guard.** A pre-commit check or CI assertion that the committed roster
      contains only anonymized values (e.g., phones match `050XXXXXXX`, names match `Staff \d+`) so real
      PII can never be pushed.
- [ ] **Document the GitHub Pages publishing flow** in `README.md` (which file serves, how rebuild
      propagates).

### Phase 1 — Data Durability (cheap, high-impact) _(~1 day)_

Mitigate the biggest threat _before_ committing to a backend.

- [ ] **Auto-backup to Excel/JSON.** On a schedule or on each significant write, offer/trigger an
      export (download or, on Capacitor, write to device storage). At minimum, a one-tap "Backup all
      data" already exists via `exportAllExcel()` — surface it prominently and add a "last backup"
      timestamp + nag banner if stale.
- [ ] **Import-to-restore.** Verify the Excel import round-trips all record types (challenges, reports,
      achievements, initiatives, certifications), not just reports/achievements. Add the missing
      importers if any.
- [ ] **Storage-quota awareness.** Detect when localStorage is near full / writes fail and warn the
      user (the `Store` in-memory fallback hides failures silently today).

### Phase 2 — Shift Handover Module (the flagship feature) _(~2–3 days)_

The highest-value front-end task per `instructions.md`. Turns the app into a system of record.

- [ ] New `handover` view + bottom-nav/`more` entry, following the `renderX` + `openSheet` pattern.
- [ ] One end-of-shift form: cases handled, staffing shortages, equipment issues, pending incidents,
      operational notes, staff present (prefilled from on-duty roster for the day).
- [ ] On submit: write a monthly-report delta (or draft) **and** auto-create Challenges for flagged
      issues — reuse existing `ACTIONS` + `Store` keys; add `dcas_handover`.
- [ ] Searchable handover history view (filter by date/team), reusing the list + filter pattern.
- [ ] Excel export + template for handovers (consistent with `tplReport()`/`tplAch()`).
- [ ] Playwright test covering create → appears in history → linked challenge created.

### Phase 3 — Foundation Refactor & Test Depth _(~2 days, parallelizable)_

Make the codebase migration-ready. Do incrementally — never one risky pass (per `instructions.md`).

- [ ] **Extract `charts.js`** (SVG bar/line rendering) — self-contained, low risk.
- [ ] **Extract `excel.js`** (SheetJS layer: parsers, templates, `writeBook`, `exportAllExcel`).
- [ ] **Add unit tests for pure logic.** Stand up a tiny test runner (node `--test` or vitest) for
      `util.js` + extracted modules: `terminalCoverage`, `teamCode`, `shiftOn`, cert-expiry math, and
      the roster parser against a fixture sheet. These are the regressions CI currently can't catch.
- [ ] **Quick a11y pass.** Run Lighthouse/axe on the built file; fix obvious contrast/label/focus
      issues. (Chrome DevTools MCP is available for an automated audit.)

### Phase 4 — Capacitor Android Wrapper _(~1–2 days)_

Fast credibility win; no app rewrite.

- [ ] Wrap the built single HTML in Capacitor; configure icons/splash from the existing icon pipeline
      (`generate-icons.mjs`).
- [ ] Verify offline behavior, file export to device storage, and tap-to-call inside the wrapper.
- [ ] Document the build/sign/deploy steps for internal distribution.

### Phase 5 — Backend & Enterprise (GATED on DCAS IT decision) _(multi-week)_

**Do not start until the data-layer / data-residency decision is made with DCAS IT.** Building auth,
RBAC, audit, or Postgres on localStorage = throwaway work.

When greenlit, recommended sequence:
- [ ] **Prototype on Supabase** (Postgres + Auth + RLS + realtime) — but choose **Postgres** so it
      ports to the DCAS-sanctioned environment (Azure UAE / Moro Hub–DEWA).
- [ ] **Auth** (Microsoft Entra ID per `updates.md`) + session management.
- [ ] **RBAC**: Admin / Ops Manager / SIC / EMT-A / EMT / Read-Only Executive (permission matrix in
      `updates.md`).
- [ ] **Immutable audit log**: user, timestamp, action, record type, old/new value.
- [ ] **Migrate localStorage → Postgres** schema (staff, reports, challenges, certs, handovers, audit).
- [ ] Keep offline-first: sync layer, not replace — the PWA's offline strength must survive.

### Phase 6 — Clinical & Analytics (post-backend) _(future)_

- [ ] **Cardiac Arrest Registry** (CPR started, defib count, initial rhythm, ROSC + time, destination;
      ROSC%, shockable%, survival KPIs).
- [ ] **Leave Management** with automatic staffing-impact calc.
- [ ] **Power BI integration** via API endpoints for executives.
- [ ] **Predictive staffing** (flight schedules + passenger volume + historical incidents).

### Phase 7 — AI (explicitly deferred per `updates.md`)

Incident narratives, operational insight detection, forecasting. Only after a stable data layer and a
privacy/governance decision — **PII must never leave the sanctioned environment.**

---

## 5. Recommended Next 3 Actions

1. **Phase 0 + Phase 1** (repo hygiene + data durability) — a day of work that removes the two ugliest
   risks (artifact drift, silent data loss).
2. **Phase 2 — Shift Handover** — the single feature with the most operational value; well-scoped and
   buildable entirely on the current stack.
3. **Open the data-layer conversation with DCAS IT now** (it's the long-lead-time blocker) so Phase 5
   can start the moment the rest is ready.

---

## 6. Decision Log / Guardrails (from `instructions.md` — do not violate)

- Vanilla only; SheetJS is the **only** runtime dependency. No frameworks.
- Zero inline event handlers; everything via delegation + `ACTIONS`.
- `esc()` every dynamic value into `innerHTML`; never into a JS-string context.
- Excel (not JSON) is the user-facing I/O; JSON is internal only.
- Roster is read-only data (Excel re-upload + rebuild); certs are the one per-staff exception.
- No real PII in the public repo; nothing leaves the client until a sanctioned backend exists.
- **No DOMPurify** (unnecessary). **No big-bang module decomposition** (incremental only).
- **No enterprise features on localStorage** — wait for the data-layer decision.
