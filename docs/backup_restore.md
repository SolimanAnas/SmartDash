# Backup & Restore

_How SmartDash keeps data safe while it lives only on the device._

---

## 1. Why

All records live in the browser's storage on one device. Clearing site data, resetting or losing
the device erases them. The only real protection is a copy that leaves the device, so SmartDash
makes that copy easy, complete and restorable.

## 2. The backup file

Settings → **Back up now** downloads `smartdash-backup-YYYY-MM-DD-HHMM.xlsx`. It holds **every field
of every record**, so restoring it gives back exactly what was saved:

| Sheet | Contents |
|---|---|
| `_meta` | format, schema version, created, device, record counts, personal-data notice |
| `Challenges`, `Monthly Reports`, `Achievements`, `Initiatives`, `Staff Documents`, `Shift Reports` | one row per record, one column per field |
| `Deleted` | records deleted on this device (so a merge can't bring them back) |
| `Alert Log` | expiry alerts raised and when the medic / SIC were notified |
| `Settings` | readiness policy, roster teams |
| `Roster` | uploaded roster (only when one was uploaded) |
| `_columns` | which columns hold JSON (lists such as staff present, qualifications) |

Data sheets are plain tables (headers in row 1), so Power Automate, Office Scripts and Power BI can
read them. The file contains staff personal data: keep it only on DCAS-approved storage (the
division SharePoint or a work OneDrive).

**Export everything** is different: a readable report, not a restorable copy.

## 3. Restore

Settings → **Restore from backup** → choose the file. A preview shows, per record type, how many
records are in the file, new, newer in the file, newer here, and deleted in the file. Then:

- **Merge (recommended)**: adds new records and keeps the newest version of every record from
  either side; deletions on either side are respected; this device's settings and roster stay.
  This is also how two supervisors' devices are combined.
- **Replace**: makes this device an exact copy of the backup, including roster and settings.
  The preview warns how many records on this device would be removed.

Before either, a **safety copy** of the device's data is kept: Settings → **Undo last restore**.
A file that isn't a SmartDash backup, or was made by a newer app version, is refused.

## 4. Reminders

- The dashboard shows a reminder when real changes exist only on this device and there is no
  backup yet, the last one is 7+ days old, or 20+ changes have been made since.
- Settings shows the backup status (green / amber / red).
- **Clear all records** and **Reset sample data** offer a backup first.
- Demo data never triggers a reminder.

The app also asks the browser to protect its storage from automatic clearing
(`navigator.storage.persist()`); Settings shows whether that was granted.

## 5. How it works (for developers)

- Logic is in `proj/src/backup.js` (pure, unit-tested); `app.js` only does the UI and SheetJS calls.
- Every save goes through `persist(collection)`, which compares each record with its stored
  signature (`dcas_sigs`): changed records get `updatedAt`, deleted ones a tombstone (`dcas_tomb`),
  and real changes increase `dcas_dirty`.
- `dcas_schema` holds the stored data version. When the data layout changes, bump
  `SCHEMA_VERSION` and add a step to `migrate()`; old devices and old backups upgrade themselves.
