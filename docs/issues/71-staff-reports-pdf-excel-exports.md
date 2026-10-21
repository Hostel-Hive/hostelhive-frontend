# [DDP-#71] feat(reports): add staff reports and PDF Excel exports

## Objective

Let Admin/Warden review and download hostel reports using the existing backend APIs.

## Scope

- Add protected Reports navigation and attendance movement/daily, leave and complaint screens.
- Support backend date, student and report-specific filters plus pagination.
- Show backend full-period summaries, date basis and configured timezone clearly.
- Download PDF/XLSX files for applied filters, covering all matching rows.
- Handle loading, empty results, validation, route/access/session failures and retries.
- Handle export limits/busy states, prevent duplicate clicks and clear stale private files.
- Support responsive layouts, keyboard access and automated checks.

## Permissions and boundaries

Admin/Warden only. Backend authorization remains authoritative. Frontend changes
only; reuse the authenticated request helper. No report-data editing, scheduled
reports, invented statistics, cancellation actions or client-generated exports.
Read-only cancelled leave data follows the current backend report contract.

## Acceptance criteria

- [x] Supported staff can open all four report types through protected routes.
- [x] Filters, backend pagination, full-period summaries and timezone metadata are shown.
- [x] Export requests use applied filters and omit pagination.
- [x] PDF/XLSX responses are checked before offering a private save link.
- [x] Busy/oversized exports and failed reads have clear recovery states.
- [x] Account/filter/route changes abort old requests and release private download URLs.
- [x] Native keyboard controls, responsive layouts and automated API/UI/route checks exist.
- [x] Full coverage suite, type check, lint, formatting and build pass.
- [ ] Live file/backend acceptance and peer review are recorded.

Branch: `feature/71-staff-reports-pdf-excel-exports`.

See [staff reports](../staff-reports.md) for contracts, interpretation and export limits.
This local record does not create or update a GitHub issue or project status.

Verification: all 1553 tests passed across 74 files, including 118 new report tests.
The focused reports/app run passed all 139 tests. Full-suite coverage passed the
configured thresholds: 98.25% lines, 96.19% statements, 93.94% branches and 97.12%
functions. Type checking, lint, production build, repository formatting with Windows
line-ending handling and default Prettier checks of changed files passed. The
existing nonfatal Vite main-bundle size warning remains. Live backend/file-open
acceptance, keyboard/narrow-screen walkthrough and peer review remain pending.
