# Shift Reports — Implementation Plan

_Feature plan for adding a **Shift Reports** tab to SmartDash (DCAS Airport Operations Platform)._
_This is the "Shift Handover" flagship from the roadmap, scoped as a tab. Obeys `instructions.md` guardrails; grounded in the real code (`proj/src/app.js`, `index.html`, `build.mjs`, `sw.js`)._

---

## 1. What it is (and what it is NOT)

A **Shift Report** is the end-of-shift operational log a Supervisor-in-Charge (SIC) files per shift. It captures activity, staffing, equipment, and incidents, and turns the app from a dashboard into a **system of record**.

Keep it distinct from two existing things to avoid confusion:

| Feature | Cadence | Source | Purpose |
|---|---|---|---|
| **Monthly Reports** (`view-reports`, `dcas_rep`) | per month | manual / Excel | aggregate KPIs (cases, response, ROSC) |
| **Challenges** (`view-challenges`, `dcas_ch`) | ad-hoc | manual | issue tracker |
| **Shift Reports** (new, `dcas_shift`) | **per shift** | SIC at end of shift | granular operational record; **feeds** the other two |

Design intent: Shift Reports are the **granular source** that Challenges (flagged issues) and Monthly Reports (aggregates) can be derived from — not a duplicate of either.

---

## 2. Best-practice design decisions

1. **Smart prefill (the core value).** Given `date` + `shift` (Day/Night), auto-derive the on-duty team and crew from the roster (`STAFF` + `shiftOn`) so the SIC barely types. Day ⇒ code `D`, Night ⇒ code `N`; `team` = the team on that shift; `staffPresent` = those on duty; `sic` = that team's `SIC` record.
2. **Write-through, not double-entry.** Equipment/staffing issues flagged in the form can spawn **Challenges** (reusing `dcas_ch` + the challenge create path), with `linkedChallenges` stored back on the shift report. No retyping.
3. **Roll-up, don't overwrite.** Add an Analytics card for shift activity, and an **optional** one-tap "Generate monthly report from shift reports" — never silently overwrite a manually-entered Monthly Report.
4. **One report per (date, shift, team).** On save, detect an existing match and offer to edit/merge instead of duplicating.
5. **Durability built in.** Include Shift Reports in `exportAllExcel()` + a template + an importer (round-trips for backup — ties to roadmap Phase 1).
6. **Same conventions.** Delegation via `data-act` + `ACTIONS`; `esc()` every value; `Store` wrapper; `renderX` + `openSheet`; no new runtime deps.

---

## 3. Navigation & placement (recommendation)

The bottom nav is full (Dashboard · Command · Roster · Challenges · More). Recommended:

- **Add `Shift Reports` under `More` → Operations group** (alongside Staff/Reports/Analytics), like the other secondary views.
- **Add a Dashboard CTA**: a "＋ New shift report" button, shown prominently when **today's on-duty shift has no report yet** (smart nudge — highest-frequency daily action).
- **FAB** on the Shift Reports view for quick add.

_Alternative (decide with supervisors):_ if they file every shift, promote it into the bottom nav by swapping out `Challenges` (lower daily frequency). Keep this as an option, not the default.

---

## 4. Data model (`dcas_shift`)

```js
{
  id,                       // uid()
  date: 'YYYY-MM-DD',
  shift: 'Day' | 'Night',
  team: 'A'|'B'|'C'|'D',    // auto-derived; editable
  sicName, sicId,           // prefilled from on-duty SIC
  casesHandled: 0,
  transfers: 0,
  refusals: 0,
  roscCount: 0,             // optional clinical
  staffPresent: [staffId],  // prefilled from on-duty roster, toggleable
  staffingShortages: '',
  equipmentIssues: '',
  pendingIncidents: '',
  notes: '',
  linkedChallenges: [challengeId],   // created from flagged issues
  createdAt, updatedAt
}
```

Helpers to add (pure, unit-testable):
- `teamOnShift(date, code)` → which team has the majority `code` ('D'/'N') that day (reuse `teamCode`).
- `onDutyFor(date, code)` → `STAFF.filter(s => shiftOn(s,date)===code)`.
- `monthOf(date)` → `'YYYY-MM'` for roll-ups.

---

## 5. UI flow

1. **Dashboard nudge** → if no report for today's on-duty shift, show "End-of-shift report due" CTA (`data-act="shift-new"`).
2. **Form (`openSheet`)**, sections:
   - **Shift context** — date, shift (Day/Night) → auto-fills team + SIC; all editable.
   - **Activity** — cases, transfers, refusals, ROSC (numbers, default 0).
   - **Staffing** — `staffPresent` prefilled as a toggleable checklist; shortages note.
   - **Equipment & incidents** — issue text fields, each with a "Log as challenge" checkbox.
   - **Notes**.
3. **Save** → upsert record; create any flagged Challenges; toast.
4. **History (`renderShift`)** — list newest-first, filter chips (All / Day / Night / Team / this month), search; tap → detail (`viewShift`) with edit/delete.
5. **Roll-up** — Analytics "Shift activity (this month)" card; optional "Generate monthly report from shift reports".

---

## 6. Code touchpoints

| File | Change |
|---|---|
| `proj/src/index.html` | Add `<main id="view-shift" class="view">` (back btn, search, chips, list) using the secondary-view template; add `More`→Operations menu item `data-act="go" data-v="shift"`; add Dashboard CTA button. |
| `proj/src/app.js` | **State:** `let shiftReports = JSON.parse(Store.get('dcas_shift')||'[]'); const saveShift=()=>Store.set('dcas_shift',JSON.stringify(shiftReports));` + `shiftFilter`. **Seed:** 1–2 samples in `seedSample()`. **Renders:** `renderShift`, `editShift`, `saveShift`, `viewShift`, `delShift` + helpers (§4). **Router:** add `shift: renderShift` to the `go()` render map; add `shift:'more'` to the nav-highlight map; add `'shift'` to the FAB-visible set. **`onFab`:** `shift → editShift(null)`. **`ACTIONS`:** `'shift-new'|'shift-view'|'shift-edit'|'shift-del'|'shift-save'|'shift-filter'`. **Search:** debounced `#shiftSearch` listener. **Excel:** `tplShift()`, `importShift(wb)`, add a `Shift Reports` sheet to `exportAllExcel()`; add a 4th drop card in `renderUpload`. **Analytics:** shift-activity card (optional). |
| `proj/src/style.css` | Reuse existing classes/tokens; no new patterns needed. |
| `proj/src/sw.js` | Bump `CACHE`/`CDN_CACHE` to `smartdash-v6` (asset change). |
| `proj/tests/app.spec.js` | New test: open Shift Reports → create with prefill → appears in history → flagged issue creates a linked Challenge. |
| `instructions.md` / `plans.md` | Move "Shift Reports/Handover" to the shipped list; add `dcas_shift` to the storage-keys list. |

---

## 7. Build steps (incremental — verify after each)

- [ ] **Step 1 — Read-only scaffold.** Add the view, More entry, `renderShift` (empty state), router + nav wiring. `npm run build` → tab opens. _No data yet._
- [ ] **Step 2 — CRUD.** `editShift`/`saveShift`/`viewShift`/`delShift`, `dcas_shift`, FAB, search/filter, seed. Round-trip create → list → edit → delete.
- [ ] **Step 3 — Smart prefill.** `teamOnShift`/`onDutyFor`; date+shift auto-fills team, SIC, `staffPresent`.
- [ ] **Step 4 — Write-through.** "Log as challenge" toggles create `dcas_ch` records; store `linkedChallenges`.
- [ ] **Step 5 — Durability.** `exportAllExcel()` includes Shift Reports; `tplShift()`; `importShift()`; Upload Center card.
- [ ] **Step 6 — Roll-up + nudge.** Analytics card; Dashboard "report due" CTA; optional monthly generation.
- [ ] **Step 7 — Tests + SW bump + docs.** Playwright test; `smartdash-v6`; update `instructions.md`/`plans.md`.

---

## 8. Acceptance criteria (Definition of Done)

1. New `Shift Reports` tab reachable from `More`; Dashboard nudge appears only when today's on-duty shift has no report.
2. Selecting date + shift **prefills** team, SIC, and on-duty crew from the roster.
3. Flagging an equipment/staffing issue creates a linked **Challenge** visible in the Challenges tab.
4. Records persist via `dcas_shift`; included in `exportAllExcel()` and restored by import.
5. `npm run lint && format:check && build && test` green; built `index.html` has **0** `onclick=` and no leftover ESM `import`; all values `esc()`'d; interactions via `data-act` only.
6. `sw.js` cache version bumped.

---

## 9. Edge cases & guardrails

- **Duplicate guard:** warn/merge on an existing (date, shift, team) report.
- **Validation:** require `date` + `shift`; numeric fields default to 0; never crash on an empty roster day.
- **No new deps**; SheetJS (CDN) remains the only runtime dependency.
- **PII:** shift reports may name staff — keep client-side; nothing leaves the device (no real PII in repo).
- **Future RBAC (gated):** when the backend lands, restrict filing to SIC and deletion to Admin — design fields now (`sicId`) so that maps cleanly later. Do **not** build auth on localStorage.
