# [DDP-#54] feat(student): add attendance and movement history

## Objective

Let students view their own recorded hostel entries and exits through the existing
student-owned attendance history API from backend issue #93.

## Scope

- Add Attendance to the student sidebar and `/student/attendance` protected route.
- Display recorded movements, newest first, in the backend-provided hostel timezone.
- Offer paired inclusive From/To dates (maximum 366 days), Entry/Exit filters,
  backend totals and pagination of 20 records per page.
- Reset pagination when applying/clearing filters or refreshing. Preserve applied
  filters on refresh and failed requests, with an explicit retry.
- Handle loading, empty results, invalid dates, missing profiles, expired sessions,
  denied access, required account setup and service failures.
- Cancel requests on navigation/account changes and suppress late responses.
- Use accessible controls and responsive layouts.

## Boundaries

Frontend only. Read `GET /api/v1/me/attendance/events` with the authenticated
request helper and no student/user ID. No staff/scanner APIs or write operations.
History does not infer daily attendance, current location, access permissions or
attendance percentages. Only `recorded` movements are returned by the backend.
Student profile editing/photo writes in ticket #52 remain pending backend APIs.

## Acceptance criteria

- [x] Student navigation and direct entry open the protected Attendance page.
- [x] History, timezone, totals, filters and pagination follow backend contracts.
- [x] Invalid date ranges are rejected before requesting data.
- [x] Empty/error/retry states work without displaying stale records.
- [x] Account changes and unmount cancel requests and clear previous results.
- [ ] Keyboard and narrow-screen layouts work.
- [x] Targeted tests, new-feature coverage, lint, formatting and build pass.
- [ ] Live acceptance and peer review are recorded.

Local issue documentation only; this file does not create or update a GitHub issue.

Automated validation: 148 tests pass across the student portal, student auth entry
and app routes. Focused coverage of the new API and component is 100% lines,
100% functions, 97.27% statements and 96.62% branches. Live browser checks and peer
review remain pending; the full repository test suite was not rerun for this ticket.
