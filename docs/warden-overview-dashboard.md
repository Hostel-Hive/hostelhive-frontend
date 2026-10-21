# Warden operations overview — ticket #77

## User flow

Sign in as Warden and open `/dashboard/warden`. `Staff / Operations` identifies
this overview. Pending leave requests, access requests, pending complaints and
complaints in progress come before the general student/block metrics.

The compact presence snapshot links to Attendance for the full list, filters,
incidents and live updates. A recent-incidents panel shows up to five recorded
incidents, with detail and student-profile links. Accommodation remains paginated
by block. Warden-authorized shortcuts include incident review, reports,
announcements and the owned notification inbox; no Admin-only import is shown.

The Admin entry retains its existing overview, ordering and import action.
Both pages now use shared presentation and the existing `useOverviewRead` lifecycle
rather than duplicating fetch, error, pagination and access-recovery code. The
shared styles keep their established `admin-overview` class names internally.

## Verified API scope

The shared summaries reuse ticket #75's existing sources: attendance summary,
block inventory, pending leave/access lists and pending/in-progress complaint
lists. Each value is a backend full filtered total; no page-length count or
sum of independently fetched snapshots is presented as an atomic global metric.

The only additional Warden overview read is the existing
`GET /api/v1/attendance/incidents?limit=20&offset=0`. Its feature API validates
records and metadata. The backend repository orders by occurrence time then
incident ID descending. The overview displays only its first five records and
keeps the server's full total. No traversal of history, date filter, "today"
counter, unresolved status or incident-resolution operation is introduced.
An empty result means no recorded incidents; a failed request is not shown as zero.

Backend route inspection confirms Warden read access to attendance/incidents,
inventory, request lists and reports. Announcement management is also an existing
Warden permission. Inventory writes and student imports retain their existing
Admin restrictions. The overview changes no route/server permissions and does
not assume a per-Warden assignment filter that the backend does not provide.

## Lifecycle and display

- Seven bounded independent reads: six shared summary reads plus the first incident page.
- Recent incidents have separate loading, empty, failure and retry states.
- A recent-panel retry does not reload the other metrics. Refresh overview reloads
  every resource and returns accommodation to page 1.
- Counts and list panels may reflect different moments. Fetch times are client
  receipt times, not server mutation times or proof of physical presence.
- Incident occurrence timestamps use the device timezone and preserve their
  original datetime values. Policy snapshots remain on incident details.
- The newest historical records are not labeled unresolved, disciplinary outcomes
  or proof of current location. UNKNOWN presence never means OUT.
- Each entry requires its exact role. API session/permission denial clears all
  private overview results and aborts pending reads. UID changes, role loss and
  navigation reset/stop work; late results are ignored.
- Heading focus, deliberate accommodation-page focus, native keyboard controls,
  and responsive grids reuse the checked Admin behavior.
- No new dependencies, browser storage, database changes or Firebase writes.

## Acceptance

Automated checks cover first-page/preview scope, full totals, empty/failure
handling, Warden-first metrics, source/profile links, independent retry, refresh,
accommodation paging/focus, exact role guards, access denial, UID/role changes and
late results. The existing Admin tests run against the extracted shared component;
route checks assert that both role entries differ from the detailed attendance page.

Live authenticated browser acceptance, narrow-screen/screen-reader walkthrough
and peer review remain pending. Test fixtures do not establish actual database
counts or a live scanner/Firebase outcome.

## Automated verification — 21 October 2026

- Focused dashboard, attendance-route and application checks: 104 tests passed.
- Full suite: 1,723 tests across 83 files passed, including 24 new ticket tests.
- Coverage gates passed: 96.29% statements, 94.08% branches, 97.32% functions,
  98.35% lines. Shared dashboard components have 100% line coverage.
- TypeScript project build and ESLint passed.
- Default Prettier checks passed for changed/new files; the repository check also
  passed with `--end-of-line auto` for Windows line endings.
- Production Vite build passed; the existing main-chunk size advisory remains.
- `git diff --check` passed.

The unrelated pending #67 document is not part of this ticket.
