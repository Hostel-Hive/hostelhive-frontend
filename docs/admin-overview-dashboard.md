# Admin overview dashboard — ticket #75

## User flow

Sign in as Admin and open `/dashboard/admin`. The dedicated overview replaces the
previous reuse of the full staff attendance component. Its breadcrumb is
`Staff / Overview`. The Attendance sidebar entry still opens the presence list,
filters, incidents and live-update controls introduced by earlier tickets.

The overview shows six summary cards, a compact presence snapshot, management
shortcuts and paginated accommodation by block. Metrics link to existing workflows
with status filters already applied. Block links open the corresponding inventory
rooms. Reports, announcements, imports, incident review and the owned notification
inbox remain available through their existing protected routes.

## Data sources

The frontend reuses existing feature APIs and their validation/authenticated
transport; no new backend endpoint is invented:

| Section                               | Existing read                                                   | Scope                                                                 |
| ------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------- |
| Active students and recorded presence | `/api/v1/attendance/summary`                                    | Active student accounts with non-archived profiles; unfiltered counts |
| Hostel blocks and accommodation       | `/api/v1/blocks?limit=20&offset=…`                              | Full block count plus individual block capacity/allocation counts     |
| Pending leave                         | `/api/v1/leaves?status=pending&limit=20&offset=0`               | Full matching total, not returned row count                           |
| Pending access                        | `/api/v1/late-access-requests?status=pending&limit=20&offset=0` | Full matching total                                                   |
| Pending complaints                    | `/api/v1/complaints?status=pending&limit=20&offset=0`           | Full matching total                                                   |
| Complaints in progress                | `/api/v1/complaints?status=in_progress&limit=20&offset=0`       | Full matching total                                                   |

Only one page per resource is fetched. No full-directory scan or traversal of all
inventory pages is performed to manufacture totals. Pending request totals have
no artificial date window. Complaint statuses remain separate metrics. The
attendance active-student total is explicitly distinguished from all directory
records. Per-block bed availability describes current allocations, not recorded
presence or physical location. UNKNOWN is not interpreted as OUT.

The inventory contract provides block/room summaries but no hostel-wide bed
summary. The overview therefore labels accommodation per block rather than
summing only the visible page. Pagination retains the API's existing offset
limit (100,000) and focuses the updated accommodation region after deliberate
page navigation. Empty later pages offer Previous/Refresh, without claiming
that no blocks exist anywhere.

## Loading, refresh and access

- Six bounded read requests run independently: one presence request, one block
  page and four filtered request/complaint lists.
- Partial failure leaves other summaries available. Each failed resource has
  its own retry; shared presence/block data updates both its card and panel.
- Unknown/loading/error values display a dash and explanatory state, not zero.
  Genuine zero totals remain visible as zero.
- Refresh invalidates every resource and resets accommodation to page 1. Prior
  requests are aborted; late responses are ignored. Receipt timestamps are
  labeled as device-time fetch times. Resources are separate snapshots and
  may differ during concurrent activity.
- This overview is a manual snapshot. Live attendance is available on the
  dedicated Attendance page; no Firebase listener is started here.
- The existing Admin route guard remains, with an additional local role check.
  API session/permission denial unmounts all private overview data and aborts
  outstanding work. Account verification/sign-in controls offer recovery.
- UID changes reset resource state; role loss and navigation unmount it.
- No browser storage, new dependencies, backend/database changes or provider
  configuration changes are introduced.

## Acceptance

Automated checks cover scope/filter mapping, backend totals, safe error mapping,
zero/loading/error states, independent retries, refresh, block pagination,
navigation URLs, focus, access denial, UID/role changes and ignored late results.
The attendance route regression asserts a distinct Admin overview. Ticket #77
adds a Warden operations overview and extracts shared presentation while preserving
the Admin behavior, ordering and permissions.

Live authenticated browser acceptance, narrow-screen/screen-reader walkthrough
and peer review remain pending. Mocked totals are test fixtures, not evidence
of the development database's current counts.

## Automated verification — 21 October 2026

- Focused dashboard, attendance-route and application checks: 80 tests passed.
- Full coverage run: 1,699 tests across 81 files passed, including 48 new ticket tests.
- Coverage gates passed: 96.28% statements, 94.04% branches, 97.31% functions,
  98.34% lines. The Admin dashboard page has 100% line coverage.
- TypeScript project build and ESLint passed.
- Default Prettier checks passed for changed/new files. The whole-repository
  check also passed with `--end-of-line auto` for Windows line endings.
- Production Vite build passed; the existing main-chunk size advisory remains.
- `git diff --check` passed.

Backend, database, Firebase configuration and dependencies remain unchanged.
The unrelated pending #67 document is not part of this ticket's changes.
