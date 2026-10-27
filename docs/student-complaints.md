# Student complaints

Ticket #60 adds:

- `/student/complaints`: owned, paginated complaint list with status/category filters.
- `/student/complaints/new`: maintenance or disciplinary submission.
- `/student/complaints/:complaintID`: original complaint, current status, paginated
  update history and student notes while unresolved.

All routes use the existing student session/setup guard. Admin/Warden retain their
separate complaint management screens. No backend or database files are changed.

## API integration

The frontend reads the owned profile to verify returned complaint ownership locally,
but does not send student/account IDs to select records. All calls reuse the existing
Firebase Bearer transport with no-store, timeout, cancellation and UID checks.

- `GET /api/v1/complaints`: limit 20, offset and optional status/category.
- `POST /api/v1/complaints`: request_id, category and normalized description.
- `GET /api/v1/complaints/:id`: owned complaint details.
- `GET /api/v1/complaints/:id/updates`: limit 20 and offset, oldest version first.
- `POST /api/v1/complaints/:id/notes`: request_id, expected_version and normalized text.

Descriptions/notes require 1–2000 Unicode characters; unsupported control characters
are rejected. The UI uses plain text, never HTML, and does not expose actor UUIDs.
Resolved complaints cannot receive new notes. Only staff can change or reopen status.
Image history entries are labeled. Ticket #61 adds private evidence viewing,
student upload/removal, previews and recovery; see [complaint evidence](complaint-evidence.md).
Timestamps currently follow the existing portal's explicit device-timezone display.

## Recovery

Submit/note requests prevent duplicate clicks. Unknown responses lock the original
request ID, normalized payload and note version for an explicit identical retry.
A confirmed 409 note conflict requires reloading the complaint and history; the
student reviews the new state and explicitly submits a new action with a new UUID.
Text survives these failures. Draft navigation/unload is protected; no sensitive
drafts or retry payloads are persisted to browser storage.

A successful note is acknowledged separately from its subsequent refresh. Requests
are aborted on unmount; late responses cannot replace another account's records.
401/403/setup-required results use the portal's account verification flow.

## Live acceptance to record

1. Sign in with two eligible students; verify each sees only their own complaints,
   including rejection of direct links to the other student's complaint.
2. Submit both categories; check staff visibility and status/response updates.
3. Add a student note; verify a concurrent staff update produces reviewed conflict
   recovery, and resolved complaints cannot receive new notes.
4. Exercise failed/unknown submissions, retry, account switch, logout and navigation.
5. Check keyboard access, focus, screen-reader labels and 320px/375px layouts.
6. Record peer review. Mocked API tests do not establish live server behaviour.
