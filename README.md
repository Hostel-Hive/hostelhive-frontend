# HostelHive Frontend

[![Frontend CI](https://github.com/Hostel-Hive/hostelhive-frontend/actions/workflows/frontend-ci.yml/badge.svg)](https://github.com/Hostel-Hive/hostelhive-frontend/actions/workflows/frontend-ci.yml)

React staff web dashboard and planned Flutter mobile application for [HostelHive](https://github.com/Hostel-Hive).

## Current scope

Issue #1 provides the React + TypeScript + Vite scaffold and public environment configuration inside `web/`. Issue #3 adds application routing, admin/warden landing pages and a responsive dashboard layout. Feature folders are added when their tickets are implemented.

Issue #5 applies the [HostelHive Figma component library](https://www.figma.com/design/TO7IwjDIvqi0dMv1D0VcZz/HostelHive?node-id=7-2) to the existing dashboard shell: indigo sidebar, cyan active navigation, tinted neutral surfaces and Plus Jakarta Sans typography. This ticket styles the existing landing pages; the complete Figma page content belongs to individual feature tickets.

Design tokens live in `web/src/styles/tokens.css` and shared shell styles in `web/src/styles/globals.css`. The colour values and font families come from Figma; spacing, radii and shadows adapt the current shell. Plus Jakarta Sans, Instrument Serif (italic editorial accents) and JetBrains Mono are bundled locally through Fontsource, with no runtime font CDN request. Serif and mono tokens are available for future feature content. Only the Latin subsets and required weights are imported in the application entry point.

- `web/`: application, package manifest, lockfile, TypeScript/Vite/Vitest configuration.
- Root ESLint/Prettier configuration: shared entry points for coding checks.
- `.github/workflows/frontend-ci.yml`: install, lint, format, tests, coverage and build; dependency scanning on pushes to develop/main.

See [web setup instructions](web/README.md) for installation, configuration and commands.

## Contribution workflow

Issue #43 adds **Complaints** for Admin/Warden staff: filtered browsing, details, chronological history, student-visible notes and confirmed status changes. Writes follow backend request-ID/version semantics; uncertain retries preserve the original payload, and conflicts require reloading and explicit review. See the web README for the workflow and acceptance checks.

Issue #41 adds **Access requests** for Admin/Warden review of early-exit and late-entry requests, using the existing late-access APIs. The interface displays recorded permission use separately from approval status and does not change attendance or scanner behavior. The GitHub-ready issue draft is in [docs/issues/41-late-access-request-management.md](docs/issues/41-late-access-request-management.md).

Issue #39 adds **Leave requests** for Admin/Warden staff: filtered browsing, request details and confirmed approval/rejection through the existing leave APIs. Decisions do not change attendance or presence. Implementation, recovery behavior and live acceptance checks are described in the web README.

Issue #37 adds **Inventory** to the staff navigation. Admin and Warden accounts browse blocks, rooms and beds; only Admin accounts create or rename them. The inventory feature uses the existing backend APIs and shares the current-session Firebase transport with the student and allocation modules. See the web README for behavior and acceptance checks.

Issue #14 implements password recovery at `/forgot-password` and the Firebase password-reset action handler at `/reset-password`. It uses the project's Firebase password policy, institution-neutral copy, shared controls and the existing authentication layout. See the web README for email-template action URL setup and live verification.

Issue #7 adds the shared authentication layout and login flow at `/login`; `/` now opens login. Firebase credentials are exchanged directly with Firebase, and the backend `/api/v1/me` response determines whether an active Admin or Warden can enter their dashboard. Issue #11 protects dashboard routes, verifies restored sessions and adds role-filtered navigation and sign-out. See the web README for public Firebase configuration and live verification.

Create a repository issue and add it to the existing HostelHive project with Phase = Development. Branch from `develop` using `feature/<issue-number>-<slug>` or `fix/<issue-number>-<slug>`. Reference the issue in commits and open a PR against `develop`. Require one peer approval and passing checks. Release into `main` through an approved PR.

Use Conventional Commits, for example `chore(frontend): configure web scaffold`, with `Refs #1` in the body. Put `Closes #1` in the PR description. This closes on merge only when the target is the repository default branch.

## Coding standards

HostelHive is an open source application for use across hostels. Product copy and examples must remain institution-neutral; do not hard-code a hostel name, university email domain or local office extension.

Frontend modules follow the proposed feature-based structure: `features/<module>` owns business pages, forms and API logic; `layouts/` owns page shells; `shared/components/ui/` owns reusable `Button.tsx` and `Input.tsx` primitives. Shared UI imports no feature-specific code. Create additional folders/components only when needed by a ticket. Colours come from `styles/tokens.css`, reusable controls from `styles/ui.css`, and authentication layout styles from `styles/auth.css`.

Use strict TypeScript, ESLint recommended JavaScript/TypeScript and React Hooks rules, and Prettier with single quotes. Tests cover observable behaviour and follow Arrange-Act-Assert. CI requires at least 80% lines, statements, functions and branches across application source; bootstrap, declarations and test utilities are excluded. This is the initial team style configuration, rather than a claim of full Airbnb style-guide compliance.

## CI and coverage

CI runs on pushes to all branches and PRs into `develop`/`main`. Coverage is uploaded as `web-coverage` in the Actions run. Open its HTML `index.html` to inspect results. A measured coverage badge can be added when a coverage publishing service is configured.

Deployment, API integration and end-to-end tests belong to subsequent tickets. There is no staging or production URL yet. The first ticket still needs peer review, a passing remote CI run and the course-required staging smoke test before its complete Definition of Done is satisfied.
