# Monthly Report (PDF)

_A printable monthly summary for the head of division._

More → **Monthly Report (PDF)** → choose a month → **Print / Save as PDF**, then pick *Save as PDF*
in the print dialog. The file name defaults to `SmartDash monthly report YYYY-MM`.

## Sections

| Section | Source | Period |
|---|---|---|
| Key performance indicators | Monthly Reports (cases, avg response, ROSC, refusals, transfers) with change vs the previous month (green = better; lower is better for response time and refusals) | selected month |
| Shift reports | End-of-shift reports: shifts reported vs expected (2 per day), totals, staffing shortages, equipment issues, pending incidents | selected month |
| Coverage & shift readiness | Roster: average station coverage, shifts with uncovered stations, average crew readiness, lowest-readiness shifts | roster month only |
| Medic documents | Readiness, expired / due in 30 / due in 60 days / not on file, list of expired or due within 30 days | as of today |
| Challenges | Raised in the month (and how many resolved), open now, open high / critical list | month + current |
| Initiatives & achievements | Completed in the month, in progress, proposed, staff achievements | selected month |

Months offered are those with any data, plus the loaded roster month. Long lists show the first
entries and a "+ N more in the app" line. Demo document records are flagged in the report.

## Notes

- The report is built from the records **on this device** — merge other supervisors' backups
  first (Settings → Restore from backup → Merge) for a division-wide picture.
- It contains staff information: share it only through DCAS channels.
- Printing uses the browser's print dialog (works in Chrome / Edge / Safari and the installed PWA).
  A future Capacitor Android wrapper will need a print plugin for the same button.
- Logic: `proj/src/monthly.js` (pure, unit-tested); rendering and print styles in `app.js` /
  `style.css` (`.mr-*`).
