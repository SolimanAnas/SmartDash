# DCAS Airport Operations Platform - Development Roadmap

## Current Status

The application is a highly polished single-file PWA focused on:

* Airport medical operations overview
* Staff roster management
* Coverage monitoring
* Challenges tracking
* Monthly reports
* Achievements tracking
* Initiatives management
* Excel import/export
* Offline-first architecture

Current implementation is primarily:

* HTML
* CSS
* Vanilla JavaScript
* LocalStorage persistence
* SheetJS (Excel processing)

The platform functions as an operational dashboard but is not yet an enterprise-grade EMS platform.

---

# Priority 1 — Enterprise Foundation

## Authentication & Authorization

Implement:

### Roles

* Administrator
* Airport Operations Manager
* SIC (Supervisor In Charge)
* EMT-A
* EMT
* Read-Only Executive

### Features

* Login screen
* Session management
* Password reset workflow
* Role-based access control

### Permissions

Examples:

* Only Admin can delete records
* SIC can edit operational records
* EMT can view roster and reports only
* Executives can view analytics only

---

## Audit Logging

Create immutable audit records.

Track:

* User
* Timestamp
* Action
* Record Type
* Old Value
* New Value

Audit examples:

* Challenge created
* Challenge edited
* Report deleted
* Staff profile updated
* Roster imported

Never permanently overwrite records.

---

## PostgreSQL Migration

Replace LocalStorage with PostgreSQL.

Suggested schema:

### staff

* id
* employee_id
* name
* title
* team
* station
* phone
* certifications (APD TDP Segway)



### reports

* month
* total_cases
* response_time
* ROSC
* notes



---

# Priority 2 — EMS Operations



## Cardiac Arrest Registry

Specialized workflow.

Capture:

* CPR Started
* Defibrillation Count
* Initial Rhythm
* ROSC Achieved
* ROSC Time
* Hospital Destination

Dashboard KPIs:

* ROSC %
* Shockable Rhythm %
* Survival Tracking

---



# Priority 3 — Workforce Intelligence

## Certification Tracking

Monitor:

* BLS
* ACLS
* PALS
* PHTLS
* Driving Permit
* Airport Access Permit

Features:

* Expiry alerts
* Dashboard warnings
* Renewal reports

---

## Leave Management

Add:

* Annual Leave
* Sick Leave
* Training Leave
* Emergency Leave

Automatic staffing impact calculations.

---

## Shift Handover Module

Digital shift handover.

Capture:

* Staffing shortages
* Equipment issues
* Pending incidents
* Operational notes

Generate searchable history.

---

# Priority 4 — Analytics

## Power BI Integration

Expose:

* Incident data
* Staffing data
* Coverage metrics
* Response times

Provide Power BI compatible API endpoints.

---

## Predictive Staffing

Forecast:

* Peak passenger periods
* High-risk coverage windows
* Staffing shortages

Inputs:

* Historical incidents
* Flight schedules
* Passenger volume

---

## Executive Dashboard

KPIs:

* Total Cases
* Response Time
* ROSC %
* Coverage %
* Staff Availability
* Equipment Readiness

---

# Priority 5 — AI Features (((in the future not now)))

## AI Incident Narratives

Generate professional EMS narratives from structured fields.

Example output:

* Clinical report
* Incident summary
* Management summary

---

## AI Operational Insights

Automatically identify:

* Coverage gaps
* Staffing risks
* Delayed responses
* Terminal trends

---

## AI Forecasting

Predict:

* High incident periods
* Equipment demand
* Staffing demand

---

# Infrastructure Target

Current:

HTML + JS + LocalStorage

Target Architecture:

Frontend:

* React
* TypeScript
* PWA

Backend:

* Node.js
* NestJS

Database:

* PostgreSQL

Hosting:

Github

Authentication:

* Microsoft Entra ID

Reporting:

* Power BI

Storage:

* Object Storage / Blob Storage

---

# Success Criteria

The platform should evolve from:

"Operational dashboard"

to

"Enterprise Airport EMS Operations Platform"

capable of supporting:

* Airport Medical Operations
* Workforce Management
* Executive Reporting
* Clinical Quality Monitoring
* Digital Transformation Initiatives
