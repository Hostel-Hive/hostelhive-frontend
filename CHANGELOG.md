# Changelog

## [Unreleased]

### Added

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
