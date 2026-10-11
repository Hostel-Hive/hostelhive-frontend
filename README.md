# HostelHive Frontend

[![Frontend CI](https://github.com/Hostel-Hive/hostelhive-frontend/actions/workflows/frontend-ci.yml/badge.svg)](https://github.com/Hostel-Hive/hostelhive-frontend/actions/workflows/frontend-ci.yml)

React staff web dashboard and planned Flutter mobile application for [HostelHive](https://github.com/Hostel-Hive).

## Current scope

Issue #1 provides the React + TypeScript + Vite scaffold and public environment configuration inside `web/`. Feature folders are added when their tickets are implemented.

- `web/`: application, package manifest, lockfile, TypeScript/Vite/Vitest configuration.
- Root ESLint/Prettier configuration: shared entry points for coding checks.
- `.github/workflows/frontend-ci.yml`: install, lint, format, tests, coverage and build; dependency scanning on pushes to develop/main.

See [web setup instructions](web/README.md) for installation, configuration and commands.

## Contribution workflow

Create a repository issue and add it to the existing HostelHive project with Phase = Development. Branch from `develop` using `feature/<issue-number>-<slug>` or `fix/<issue-number>-<slug>`. Reference the issue in commits and open a PR against `develop`. Require one peer approval and passing checks. Release into `main` through an approved PR.

Use Conventional Commits, for example `chore(frontend): configure web scaffold`, with `Refs #1` in the body. Put `Closes #1` in the PR description. This closes on merge only when the target is the repository default branch.

## Coding standards

Use strict TypeScript, ESLint recommended JavaScript/TypeScript and React Hooks rules, and Prettier with single quotes. Tests cover observable behaviour and follow Arrange-Act-Assert. CI requires at least 80% lines, statements, functions and branches across application source; bootstrap, declarations and test utilities are excluded. This is the initial team style configuration, rather than a claim of full Airbnb style-guide compliance.

## CI and coverage

CI runs on pushes to all branches and PRs into `develop`/`main`. Coverage is uploaded as `web-coverage` in the Actions run. Open its HTML `index.html` to inspect results. A measured coverage badge can be added when a coverage publishing service is configured.

Deployment, API integration and end-to-end tests belong to subsequent tickets. There is no staging or production URL yet. The first ticket still needs peer review, a passing remote CI run and the course-required staging smoke test before its complete Definition of Done is satisfied.
