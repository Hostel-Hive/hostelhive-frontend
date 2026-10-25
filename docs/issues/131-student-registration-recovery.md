# #131 — Bulk student registration and archived profile recovery

## Implemented scope

The Admin CSV page registers new students through
`POST /api/v1/student-invitations/import`. The server template comes from
`GET /api/v1/student-invitations/import/template`. Upload raw UTF-8 CSV, up to
2 MiB and 100 records, with these seven columns:

```csv
email,index_no,full_name,faculty,year,contact_phone,guardians
```

Accounts do not need to exist first. Approved email domains and profile details
are checked by the backend; guardian JSON must be properly CSV-quoted.
The preview checks file structure and displays the first five records.
Confirmation is required before sending registrations. Requests are not retried
automatically. An uncertain response preserves the selected CSV, locks edits and
allows explicit Retry same CSV. Backend #129 derives stable row keys from the
normalized data and Admin identity, so unchanged retries by the same Admin reuse
confirmed registrations. CSV data and reports remain in memory and are discarded
on account change/unmount; navigation warns about unfinished work.

The report distinguishes queued, replayed, rejected, not-attempted and unconfirmed
registrations and validates totals, row positions, safe codes and successful
identities before displaying results. Downloaded reports retain the original
registration statuses. Queued email is never presented as delivered email.
The old profile-only `/students/import` route is not used by this screen.

Student form submission errors appear in a fixed, high-contrast accessible toast.
The notification remains until dismissed or the form changes; dismissal does not
discard data or change the original invitation operation ID.

Admins can switch between Current students and Archived students, preserving
search/faculty/year filters and resetting pagination when switching views.
Archived data uses `GET /api/v1/students/archived`. A confirmation dialog calls
`POST /api/v1/students/{studentID}/restore` with no body. It handles already-current
profiles, authorization/session failures and safe explicit retry after an
unconfirmed response. Successful restoration refreshes the directory. Dialogs
focus Cancel initially, support Escape, prevent double submission and abort
pending requests when unmounted. Cached directory data is scoped to identity and
role. Only Admins see recovery controls; backend authorization remains authoritative.

Restore does not reactivate accounts, assign beds, change presence or recover
removed photos. End hostel stay/checkout is outside this ticket.

## Backend dependency

Backend issue #129 must be deployed. Apply migration 31 and restart the backend
before testing archived listing/restoration or the seven-column CSV locally.
Older servers may treat `archived` as a student ID and return 400.

## Verification

Use Node 22 and the frontend's existing Vitest, lint, TypeScript and Vite build
commands. Focused suites cover CSV parsing and authentication, report validation,
exact retry, account cleanup, role boundaries, toast dismissal, restoration,
cancellation, duplicate prevention and existing directory/profile behavior.
Tests mock invitation submission and do not send real registration emails.
Manual deployment/live-user acceptance is separate from these automated checks.
