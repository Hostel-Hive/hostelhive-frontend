# HostelHive Frontend

[![Frontend CI](https://github.com/Hostel-Hive/hostelhive-frontend/actions/workflows/frontend-ci.yml/badge.svg?branch=develop)](https://github.com/Hostel-Hive/hostelhive-frontend/actions/workflows/frontend-ci.yml?query=branch%3Adevelop)
[![Test coverage reports](https://img.shields.io/badge/coverage-CI%20artifacts-blue)](https://github.com/Hostel-Hive/hostelhive-frontend/actions/workflows/frontend-ci.yml?query=branch%3Adevelop)

React, TypeScript and Vite web application for HostelHive. Students manage their
profile, view accommodation and recorded presence, submit access requests and
complaints, and read announcements. Admin and Warden staff manage the hostel
through role-protected dashboards.

Part of the [HostelHive project](https://github.com/Hostel-Hive).
Related repositories: [backend](https://github.com/Hostel-Hive/hostelhive-backend)
and [design documents / development guideline](https://github.com/Hostel-Hive/Design-and-Development-Project).
This README covers the web application; mobile integration is documented separately.

## Live application

The shared assessment environment uses `develop`. The web application is hosted
on Vercel and connects to the Render backend and Supabase PostgreSQL database.

| Service               | URL                                                                                |
| --------------------- | ---------------------------------------------------------------------------------- |
| Student portal        | [Student login](https://web-kohl-delta-90.vercel.app/login)                        |
| Staff portal          | [Admin / Warden login](https://web-kohl-delta-90.vercel.app/staff/login)           |
| Backend base          | [hostelhive-backend-dev.onrender.com](https://hostelhive-backend-dev.onrender.com) |
| API base              | [Backend `/api/v1`](https://hostelhive-backend-dev.onrender.com/api/v1)            |
| API documentation     | [Swagger UI](https://hostelhive-backend-dev.onrender.com/docs/)                    |
| API specification     | [OpenAPI JSON](https://hostelhive-backend-dev.onrender.com/openapi.json)           |
| Backend health        | [Health](https://hostelhive-backend-dev.onrender.com/health)                       |
| Database connectivity | [Readiness](https://hostelhive-backend-dev.onrender.com/ready)                     |

The backend base URLs are endpoint prefixes, not web pages; use Swagger to
explore the API. Readiness confirms database connectivity, not applied migrations.

## Demo accounts

These shared accounts are supplied for assessment using test data. Select the
correct login page for the role.

| Role    | Email                         | Password       | Login page                                                |
| ------- | ----------------------------- | -------------- | --------------------------------------------------------- |
| Admin   | `darshikatasheen99@gmail.com` | `JackCM@3003`  | [Staff](https://web-kohl-delta-90.vercel.app/staff/login) |
| Warden  | `navonsanjuni@gmail.com`      | `Sanjuni@1234` | [Staff](https://web-kohl-delta-90.vercel.app/staff/login) |
| Student | `kavindithagya21@gmail.com`   | `Thagya21`     | [Student](https://web-kohl-delta-90.vercel.app/login)     |

Authentication uses Firebase; backend account status and role determine access.
The browser does not connect directly to Supabase.

## Requirements

- Node.js **22.16.0**, pinned in [.nvmrc](.nvmrc); the supported range is Node 22.12+ below 23.
- npm (included with Node.js) and Git.
- Firebase public web-app configuration matching the backend project.
- A running local backend or the hosted backend URL above.

## Install and run locally

From a fresh repository checkout:

```powershell
cd web
npm ci
if (-not (Test-Path '.env.local')) {
    Copy-Item .env.example .env.local
}
notepad .env.local
```

Configure these public browser values:

```dotenv
VITE_API_BASE_URL=https://hostelhive-backend-dev.onrender.com
VITE_FIREBASE_PROJECT_ID=your-firebase-project-id
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_API_KEY=your-public-firebase-web-api-key
```

Use the Firebase values for the registered web app in the same project as the
backend. For a local backend, set `VITE_API_BASE_URL=http://127.0.0.1:18080`.
The base URL must not include `/api/v1`; requests add that prefix themselves.
The backend must allow the local browser origin in its CORS configuration when
requests are made directly. Vite uses a development proxy for API requests.

```powershell
npm run dev
```

Open [student login](http://127.0.0.1:5173/login) or
[staff login](http://127.0.0.1:5173/staff/login). Restart Vite after editing
environment settings. Frontend variables are public build-time values;
database passwords, Firebase service accounts and storage secrets belong only
on the backend. See [web setup and feature guides](web/README.md) for details.

## Checks and coverage

Run from `web/`:

```powershell
npm run lint
npm run format:check
npm run test:coverage
npm run build
```

CI runs lint, formatting, TypeScript/build, tests, coverage and dependency checks.
Coverage must meet the configured 80% lines, statements, functions and branches
thresholds. The coverage badge links to CI runs; it does not claim a measured
percentage. Download the `web-coverage` artifact from a successful
[Frontend CI run](https://github.com/Hostel-Hive/hostelhive-frontend/actions/workflows/frontend-ci.yml)
or inspect local `web/coverage/index.html` for measured results.

## Deployment

| Vercel setting           | Value           |
| ------------------------ | --------------- |
| Project                  | `web`           |
| Shared deployment branch | `develop`       |
| Root Directory           | `web`           |
| Framework                | Vite            |
| Install Command          | `npm ci`        |
| Build Command            | `npm run build` |
| Output Directory         | `dist`          |
| Node.js                  | 22.x            |

Set `VITE_API_BASE_URL=https://hostelhive-backend-dev.onrender.com` and the
matching public Firebase variables in Vercel. Rebuild after changing variables.
Configure the backend CORS origin and Firebase authorized domains for the live
frontend host. Route fallback is configured in [web/vercel.json](web/vercel.json).
Automatic deployment requires a connected Git repository; a manual CLI deployment
does not by itself enable deployment on future pushes.

## Repository and contribution guide

- `web/`: application, environment example, dependencies and build configuration.
- `web/src/features/`: feature pages, forms and API clients.
- `web/src/shared/`: shared controls; `web/src/styles/`: design tokens and styles.
- `docs/`: module contracts, implementation notes and acceptance checks.
- `.github/workflows/frontend-ci.yml`: CI and coverage workflow.

Follow the [course development guideline, section 9.3](https://github.com/Hostel-Hive/Design-and-Development-Project/blob/main/documents/guidelines/SENG34213_System_Development_Project.pdf)
for README and assessment submission requirements. Create an issue, branch from
`develop` using `feature/<ticket>-<slug>` or `fix/<ticket>-<slug>`, and use
Conventional Commits. Open a pull request into `develop`, require passing CI and
peer review, then release to `main` through an approved pull request.
The shared assessment environment currently deploys `develop`.

Use strict TypeScript, the existing ESLint/React Hooks rules, Prettier and shared
design tokens. Tests should verify observable behavior. See the
[student registration and recovery](docs/issues/131-student-registration-recovery.md),
[End hostel stay](docs/issues/133-end-hostel-stay-confirmation.md) and
[lifecycle guidance](docs/issues/134-student-lifecycle-guidance.md) notes for the
recent workflows and manual acceptance checks.
