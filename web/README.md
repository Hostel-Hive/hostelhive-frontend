# HostelHive Web

React staff dashboard. Responsible member: Navon Sanjuni.

## Prerequisites

- Node.js 22.16.0 (pinned in the repository root `.nvmrc`).
- npm, included with Node.js.
- Git.

## First-time setup (PowerShell)

From the repository root:

```powershell
Set-Location web
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Copy the example only during first-time setup; preserve an existing `.env.local`.
Open `http://127.0.0.1:5173`. The initial screen requires no running backend because it performs no API calls.

## Public environment configuration

Set `VITE_API_BASE_URL` in `.env.local` to the backend base URL, for example `http://127.0.0.1:8080`. If the backend uses port 18080, use that port instead. The base URL can include an API path prefix when the eventual API client requires it.

Configuration requires an absolute HTTP/HTTPS URL. Credentials, query strings and fragments are rejected; surrounding spaces and trailing slashes are normalized. Missing/invalid values stop the dev server or production build with a clear error. Restart Vite after changing an environment file.

`VITE_` values are public and embedded at build time. Never use database URLs, Firebase Admin/service-account keys or object-storage credentials here. `.env.local` is ignored; `.env.example` is committed. CI uses a non-secret sample API URL only to verify the scaffold.

## Commands

Run inside `web/`:

| Command                 | Purpose                                            |
| ----------------------- | -------------------------------------------------- |
| `npm run dev`           | Start local development server                     |
| `npm run build`         | Check TypeScript and build into ignored `dist/`    |
| `npm run preview`       | Preview the production build on port 4173          |
| `npm run lint`          | Check JavaScript, TypeScript and React Hooks rules |
| `npm run format`        | Format repository source and documentation         |
| `npm run format:check`  | Check repository formatting                        |
| `npm test`              | Watch unit/component tests                         |
| `npm run test:unit`     | Run unit/component tests once                      |
| `npm run test:coverage` | Run tests and enforce the 80% coverage gate        |

Before opening a PR, run lint, format:check, test:coverage and build. Review `coverage/index.html` for local coverage. `main.tsx` contains only bootstrap wiring and is excluded from unit coverage; verify the actual app through the dev server or production preview.

## Current structure

```text
src/
  app/       Browser entry point, route definitions and Not Found page
  config/    API URL validation and dashboard navigation
  features/  Admin and warden dashboard landing pages
  layouts/   Shared header, desktop sidebar and mobile navigation
  styles/    Responsive dashboard styling
  test/      DOM test setup
```

The proposed larger feature structure grows through individual tickets. Issue #3 adds routing and the dashboard layout. Firebase, API clients, realtime connections and business features belong to subsequent tickets.

## Routes and navigation

- `/` and `/dashboard` redirect to `/dashboard/admin`.
- `/dashboard/admin` renders the admin landing page.
- `/dashboard/warden` renders the warden landing page.
- Unknown URLs show a Not Found page with a return link.

Both landing pages are currently public layout previews. Their names do not enforce access control. Authentication and role protection will be implemented in dedicated tickets before these pages expose account or business data.

Below 768px, the desktop sidebar is replaced with a navigation disclosure. Open/close it with the toggle button, use Escape to close it and return focus to the toggle, or select a link to navigate and close it. A skip link takes keyboard users directly to the main content.

For deployment, configure the web host to serve `index.html` for application routes such as `/dashboard/warden`; static assets must continue to use their actual paths. This browser-history fallback is necessary for direct URLs and refreshes. Vite provides it locally.

### Manual smoke checks

1. Open `/` and confirm the admin landing page appears.
2. Select Warden dashboard and confirm its page and active navigation change.
3. Refresh `/dashboard/warden` and confirm it still loads.
4. Open an unknown URL and use Return to dashboard.
5. At 375px width, open the menu, navigate and verify there is no horizontal overflow.
6. Use Tab/Enter to operate the menu and Escape to close it.
