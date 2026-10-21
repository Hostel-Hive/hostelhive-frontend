# [DDP-#75] feat(dashboard): add dedicated admin overview dashboard

## Description

- Replace the duplicated attendance screen with a dedicated Admin overview.
- Show active students, hostel blocks, pending leave/access requests and complaint counts.
- Include a compact IN/OUT/UNKNOWN presence snapshot linking to Attendance.
- Show paginated accommodation summaries by block, using backend capacity and allocation counts.
- Link directly to filtered request/complaint workflows and management tools.
- Handle independent loading, empty results, partial failures, retry and refresh.
- Clear private results and abort requests on access loss, account change or navigation.
- Include responsive layouts, keyboard support and automated checks.

Boundary: frontend only, existing authorized APIs. No backend/database changes,
fabricated totals/trends, manual attendance editing or new management permissions.
Live attendance and the detailed presence list remain on the Attendance page.

## Branch and location

Branch: `feature/75-admin-overview-dashboard`.

URL: `/dashboard/admin`; heading `Admin dashboard`; breadcrumb `Staff / Overview`.

## Count semantics

- Active students: attendance summary total, covering active student accounts with
  non-archived profiles. The directory may include additional records.
- Hostel blocks: the inventory API's full block total, not page length.
- Pending leave/access requests: full totals for the corresponding status filter.
- Pending and in-progress complaints: separate full filtered totals, without
  summing independently fetched snapshots into a supposedly atomic unresolved count.
- Accommodation: each displayed block's room, capacity, occupied-bed and
  available-bed values. There is no global bed-summary endpoint; a partial page
  is never presented as a hostel-wide bed total.

Refresh reloads all resources and returns accommodation to page 1. Each resource
has an independent request and retry. Fetched times are client receipt times,
not server mutation times or a guarantee that separate resources share a snapshot.

## Verification

1,699 tests across 81 files passed, including 48 new ticket tests. Coverage gates,
TypeScript, ESLint, formatting and production build passed. Overall line coverage
is 98.34%; the Admin dashboard page has 100% line coverage.

See `docs/admin-overview-dashboard.md` for automated results and pending live
acceptance. No account permissions, Firebase settings or database records are
changed by this ticket. Warden dashboard behavior remains outside this ticket.

This local ticket is ready to copy into GitHub. GitHub issue creation was not
performed because no authenticated GitHub connector or CLI is available here.
