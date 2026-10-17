# Changelog

## [Unreleased]

### Added

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
