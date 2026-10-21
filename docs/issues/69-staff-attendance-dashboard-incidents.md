# [DDP-#69] feat(attendance): add staff attendance dashboard and incident tracking

## Objective

Give Admin/Warden a hostel-wide attendance view using the existing backend APIs.

## Scope

- Replace placeholder staff dashboards with backend presence summaries.
- Add a paginated presence list with name/Student ID search and IN/OUT/UNKNOWN filters.
- Add incident list/detail pages with supported student, direction and type filters.
- Refresh summary and presence list together while explaining their separate snapshots.
- Show incident policy snapshots and distinguish recorded presence from physical location.
- Connect staff notification and per-student scan incident references to details.
- Handle loading, empty results, validation, missing resources, access failures and retry.
- Clear stale private state, support responsive/keyboard layouts and add automated checks.

## Boundary

Frontend only. Admin/Warden only; backend authorization is authoritative. No manual
attendance editing, incident resolution, simulated scanner events or real-time
subscriptions. Ticket #67 Going Home remains pending its backend dependency; its
separate local issue record is preserved.

## Acceptance criteria

- [x] Existing Admin/Warden entry pages show backend attendance data.
- [x] Presence search/status filters, pagination and grouped refresh are implemented.
- [x] Incident list/detail, supported filters and stored policy fields are implemented.
- [x] Counts and list scopes are explained without asserting an atomic shared snapshot.
- [x] Staff notification and scan references open incident details.
- [x] Read-only boundaries, access checks and stale-account cleanup are implemented.
- [x] Automated API/UI/route and notification regression tests cover the workflow.
- [x] Full coverage suite, type check, lint, formatting and build pass.
- [ ] Live acceptance and peer review are recorded.

Branch: `feature/69-staff-attendance-dashboard-incidents`.

This local record does not create or update the GitHub issue or project status.
See [staff attendance](../staff-attendance-dashboard.md) for contracts and behavior.

Verification: all 1435 tests passed across 71 files, including 83 added tests.
The full coverage suite passed its configured thresholds: 98.17% lines,
96.06% statements, 93.65% branches and 97.02% functions. Type checking, lint,
production build, repository formatting with Windows line-ending handling and
default Prettier checks of changed files passed. The initial full run exposed
two old directory assertions that attendance was absent from the whole page;
they now check the directory table boundary and the new sidebar link. The
corrected full suite passed. Existing nonfatal Vite bundle-size warnings remain.
Live acceptance and peer review remain pending.
