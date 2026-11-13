# Paramedic Documents, Expiry Alerts, QR Profile & Shift Readiness

_Feature reference for the paramedic data documentation module in SmartDash._

---

## 1. Purpose

A permanent, unified record of every medic's documents, so that nothing that affects operational
privileges lapses unnoticed:

| Group | Documents | Stored as |
|---|---|---|
| **Licenses & accreditations** | DHA Professional License, BLS, ACLS, PALS, PHTLS, Driving Permit, Airport Permit | expiry date |
| **Personal documents** | Emirates ID / national ID, Passport, Residence Visa (N/A for UAE nationals) | expiry date or N/A |
| **Refresher courses** | CPR & AED (12 mo), Mass-casualty drill (12 mo), Infection control (12 mo), Airside safety (24 mo) | date completed → due date |
| **Academic qualifications** | degree / diploma, institution, year, attestation status | list |
| **Training path** | course, provider, date, hours | list (timeline + total hours) |

Definitions live in `proj/src/docs.js` (`DOC_DEFS`); adding a document is one line there.

## 2. Predictive expiry alerts (60 / 30 / 15 days)

- Every document is checked against today's date. Alerts are raised at **60, 30 and 15 days** before
  expiry and **again on expiry**; each milestone is raised once and logged with its date.
- Each alert is addressed to **the medic and their team's SIC(s)**:
  - **Device notification** on the supervisor's device (opt-in, *Enable notifications*); tapping it
    opens *Documents & Alerts*.
  - **Remind medic** / **Notify SIC** — one tap opens a prefilled SMS; the alert records when each
    person was notified.
  - **Supervisor digest** — one SMS per team listing all of that team's alerts.
- Checks run on app open, every 6 hours while open, when the app returns to the foreground, and after
  any document save or import. Renewing a document retires its alerts automatically.
- Missing required documents are listed separately (*Not on file*).
- Export: *Export alerts* (Excel) and the *Expiry Alerts* sheet in *Export everything*.

## 3. Medic QR code profile

- Every staff profile has **QR profile**: a QR code plus the same verification card a supervisor sees.
  **Download badge** saves a printable PNG (code, name, staff ID, team, title, issue date).
- Scanning with any phone camera opens SmartDash at the verification card: readiness verdict,
  licenses & accreditations, personal documents and **required refresher courses**, each with status.
- In-app: *Documents & Alerts → Verify medic* scans with the camera where the browser supports it,
  or looks the medic up by staff ID.
- Privacy: the status snapshot travels in the link's `#fragment`, which browsers never send to a
  server, and it **never includes personal documents** (Emirates ID, passport, visa) — anyone who
  scans a badge can read its payload. Personal documents stay in the app only.
- Integrity: badges are not signed, so a badge alone proves nothing. On a device that holds
  SmartDash records the **live record** is shown and an out-of-date badge is flagged. On any other
  device the card says **Cannot verify on this device** and shows no verdict or badge contents.

## 4. Shift readiness heatmap

- A medic is **ready** for a shift when every document in the readiness policy is valid **on that
  shift's date** — so a license expiring mid-month lowers readiness only from that day on.
- Shift readiness = ready crew ÷ rostered crew, for every Day and Night shift of the roster month.
- Bands: **≥ 95% ready**, **85–94% watch**, **< 85% at risk** (marked `!`); each cell shows its value.
- Views: dashboard card (current shift + next 7 days), Command Center card (selected shift), and the
  *Shift Readiness* screen (calendar heatmap, month average, lowest shifts, documents blocking
  readiness). Tapping any shift lists the medics who are not ready and why, plus anyone lapsing
  within 15 days.
- **Policy** (Settings → Shift readiness policy). Default: DHA license, BLS, ACLS (EMT-A & SIC only),
  Driving Permit, Airport Permit, Emirates ID, Residence Visa. Unticked items are still tracked and
  alerted.

## 5. Demo documents

New installs (and installs that predate this module) get sample document records for the
anonymised roster so the screens are not empty. These are flagged `sample` and are never shown as
real: *Documents & Alerts* and *Shift Readiness* show a banner with **Remove demo documents**, the
staff profile labels them, and uploading a real roster removes them automatically. Saving or
importing a medic's documents turns that record into a real one.

## 6. Bulk data entry (Excel)

Upload Center → **Upload Staff Documents**. *Download template* produces a workbook prefilled with
the roster and current records, so it round-trips:

- `Documents` — one row per medic, one column per document (`YYYY-MM-DD`, `DD/MM/YYYY` or Excel
  dates; `N/A` where allowed). Blank cells leave the record unchanged.
- `Qualifications` and `Training` — one row per entry; replaces that medic's list.

## 7. Limits of the current (client-only) architecture

Everything stays on the device, per the platform's privacy rules. Fully automatic delivery to each
medic's own phone, and cryptographically signed badges, need the sanctioned backend; the alert log
and QR payload format are designed to carry over to it unchanged.
