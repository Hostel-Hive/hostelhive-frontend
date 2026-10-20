# Changelog

## [Unreleased]

### Fixed

- Stabilized asynchronous UI checks for lazy routes on Windows and under coverage, with bounded waits and explicit React act-environment setup for imported Vitest hooks. Assertions and coverage gates are unchanged.

### Added

- Private complaint evidence gallery for students/staff, validated student upload/removal,
  local previews, confirmation, stable image retries and conflict recovery (issue #61).

- Student-owned complaint submission, status/category filters, paginated details/history,
  notes, version-conflict review and identical uncertain-write retries (issue #60).

- Admin student registration by university email through the invitation API, including normalized profile/guardian details, safe request replay, delivery/setup status refresh and a separate existing-account profile workflow (issue #104).

- Admin/Warden complaint tracking with category/status/student/date filters, chronological history, student-visible notes, confirmed resolution/reopening, version checks and idempotent recovery after uncertain writes (issue #43).

- Staff early-exit/late-entry request review with status/student filters, pagination, direction/expected-time details, recorded permission use, confirmed Admin/Warden decisions and conflict/uncertain-response recovery (issue #41).

- Staff leave request browsing and details with status/student filters, pagination, Admin/Warden approval and rejection, decision confirmation, validation, draft guards and status checks after uncertain or conflicting outcomes (issue #39).

- Hostel inventory browsing for Admin/Warden with block → room → bed navigation, server occupancy counts, availability filters and pagination; Admin-only creation/renaming with validation, draft protection and explicit recovery after uncertain saves (issue #37).

- Read-only student presence and movement/scan history for Admin/Warden, with independent retries, explicit recorded/ignored outcomes, legacy permission labels, pagination and access-loss cleanup (issue #29).

- Student accommodation integration for Admin/Warden: current bed assignment, paginated allocation history, available block/room/bed selection, confirmed assign/transfer/revoke, and explicit refresh after conflicts or uncertain outcomes (issue #28).

- Student, allocation and inventory requests share the authentication module's current-session transport; feature APIs retain their own response validation and error handling.

- Authorized student QR display for Admin/Warden profiles, explicit retrieval, PNG download, eligibility/error recovery and private image cleanup on hide, tab hiding and navigation (issue #27).

- Admin-only student CSV import with authenticated template download, UTF-8/size/record/structure checks, a review step, partial row reports, safe CSV report download, and explicit recovery after uncertain outcomes (issue #26).

- Private student profile photo display, validated JPEG/PNG upload and replacement, confirmed removal, and explicit status checks after uncertain writes. Photo controls use the existing authorized backend endpoints.

- Student profile archival with confirmation, authorized empty-body DELETE, filter-preserving directory refresh and explicit recovery for uncertain outcomes (issue #24).

- Student profile creation and editing through the existing authorized APIs, including guardian management, backend-aligned validation, save recovery, and unsaved-navigation protection.

- Student directory and read-only profiles for Admin/Warden accounts, backed by Firebase-authorized student APIs (issue #19).
- URL-preserved name/ID search, exact faculty and year filters, offset pagination, contact and guardian details, and request recovery states.

- Firebase password recovery, generic request confirmation, resend cooldown, reset-link validation and policy-driven reset form (issue #14).
- Reset success, invalid/expired-link recovery and service retry states using the shared authentication layout.
- Password-flow SDK, form interaction and reset-request parsing tests.
- Protected dashboard routes, role-specific access, shared authentication state and Firebase session observation (issue #11).
- Sign-out, role-filtered navigation, verification loading/retry states and stale-response protection.
- Direct-route, restored-session, service-failure, role-change and sign-out regression tests.
- Institution-neutral branding and full Figma tonal palette; login cyan accents now use cyan-500.
- Reusable Button and Input controls under shared/components/ui, used by login and mobile navigation.
- Shared Figma authentication layout and login page with accessible validation, loading/error states and password recovery assistance route (issue #7).
- Firebase email/password sign-in and persisted-session restoration, verified against the backend active-account and role response before dashboard redirects.
- Login interaction and Firebase/backend contract tests; development API proxy.
- Figma colour/type tokens and locally bundled Plus Jakarta Sans, Instrument Serif and JetBrains Mono fonts (issue #5).
- Indigo dashboard sidebar, cyan active navigation and updated responsive shell, cards and recovery page styling.
- Application routing, admin/warden landing pages and shared responsive dashboard layout (issue #3).
- Active navigation, keyboard-accessible mobile menu and Not Found recovery.
- Route and mobile navigation interaction tests.

- React and TypeScript web foundation using Vite (issue #1).
- Validated public API base URL configuration.
- ESLint, Prettier, unit/component tests and an 80% coverage gate.
- GitHub Actions web quality checks and dependency security scan.
