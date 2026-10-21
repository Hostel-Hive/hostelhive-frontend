# [DDP-#77] feat(dashboard): add dedicated warden overview dashboard

## Description

- Replace the Warden dashboard's duplicated attendance screen with an operations overview.
- Put pending leave/access requests and complaint summaries first.
- Include a compact presence snapshot and the five latest recorded attendance incidents.
- Display paginated accommodation summaries by block.
- Add shortcuts to request review, complaints, attendance, reports and other Warden-authorized tools.
- Handle independent loading, empty results, failures, refresh and retry.
- Abort requests and remove private results on access loss, role/UID changes and navigation.
- Include responsive layouts, keyboard support and automated checks.

Boundary: frontend only, existing authorized APIs. No Admin-only import action,
new management permissions, fabricated totals, manual attendance editing or
incident resolution. Detailed attendance and live updates remain under Attendance.

## Implementation

Branch: `feature/77-warden-overview-dashboard`.

URL: `/dashboard/warden`; heading `Warden dashboard`; breadcrumb `Staff / Operations`.

Shared presentation extracts the existing Admin overview's loading, count,
presence, accommodation and access-recovery behavior into `StaffOverview`.
Role-specific entry wrappers retain strict Admin/Warden checks. Admin keeps its
existing metric order, wording and import shortcut. Warden shows pending work
first, uses operations copy and adds recent recorded incidents without an import link.

The recent panel reuses the validated, newest-first first page from
`GET /api/v1/attendance/incidents`. It displays at most five records while keeping
the backend's full historical total separate. No date filter, unresolved state,
incident resolution or new endpoint is invented. Existing incident/profile links
remain subject to their own backend authorization.

Refresh reloads shared summaries and recent incidents, and resets accommodation
to page 1. Independent resource retries leave other summaries intact. These are
separate manual snapshots; a Warden's visible data is not an invented personal
assignment queue or a guarantee of current physical location.

## Verification

1,723 tests across 83 files passed, including 24 new ticket tests. Coverage gates,
TypeScript, ESLint, formatting and production build passed. Overall line coverage
is 98.35%.

See `docs/warden-overview-dashboard.md` for checks and pending live acceptance.
No backend, database, dependency, Firebase configuration or rules changes are included.

This local ticket document does not create or update a GitHub issue or project.
