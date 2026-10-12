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

The proposed larger feature structure grows through individual tickets. Issue #3 adds routing and the dashboard layout; issue #7 adds `features/auth/`, the shared authentication layout and login stylesheet. Realtime connections and business features belong to subsequent tickets.

## Routes and navigation

- `/` redirects to `/login`.
- `/login` renders the staff login page, or redirects a restored, backend-verified session to its role's dashboard.
- `/forgot-password` provides an assistance page and a return link. Reset emails and reset-password forms belong to the password-recovery ticket.
- `/dashboard` redirects to `/dashboard/admin`.
- `/dashboard/admin` renders the admin landing page.
- `/dashboard/warden` renders the warden landing page.
- Unknown URLs show a Not Found page with a return link.

Issue #11 protects both dashboard routes. Only an active backend-verified Admin may open `/dashboard/admin`, and only an active Warden may open `/dashboard/warden`. The pages still contain placeholder content; route guards are implemented independently of future business modules.

Below 768px, the desktop sidebar is replaced with a navigation disclosure. Open/close it with the toggle button, use Escape to close it and return focus to the toggle, or select a link to navigate and close it. A skip link takes keyboard users directly to the main content.

For deployment, configure the web host to serve `index.html` for application routes such as `/dashboard/warden`; static assets must continue to use their actual paths. This browser-history fallback is necessary for direct URLs and refreshes. Vite provides it locally.

### Manual smoke checks

1. While signed out, open `/dashboard/admin` and `/dashboard/warden`; confirm both return to login without displaying dashboard content.
2. Sign in with dedicated active Admin and Warden accounts separately. Confirm each sees only their own dashboard navigation.
3. Refresh the permitted dashboard and confirm it loads after session verification. Open the other role's URL and confirm redirection to the permitted dashboard.
4. Open an unknown URL and use Return to dashboard.
5. At 375px width, open the menu, navigate and verify there is no horizontal overflow.
6. Use Tab/Enter to operate the menu and Escape to close it.

## Staff login — issue #7

The login page follows the Figma Auth · Login screen, with a shared header/logo, narrow form and footer. Privacy/Terms destinations and a verified live system-status source are not available yet, so the footer does not show dead links or claim operational status. Support text is the Figma reference copy; confirm the office extension before deployment.

Set these **public web-app** values in your existing `.env.local`, using Firebase Console → Project settings → Your apps → Web SDK configuration:

```dotenv
VITE_FIREBASE_API_KEY=your-public-web-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
```

Use the same Firebase project as the backend (its current documentation identifies `hostel-hive-152ef`); copy the actual web configuration rather than inventing an API key. No service-account or Firebase Admin credentials belong in frontend configuration. Enable/review the Email/Password provider, authorised domains and web-key restrictions in that project. Restart Vite after editing environment values. The UI remains previewable with blank Firebase values; submitting then displays a configuration message instead of attempting authentication. Do not commit `.env.local`.

Sign-in uses Firebase email/password authentication, then sends its ID token in the `Authorization: Bearer` header to **GET `/api/v1/me`**. The response must match the Firebase UID, be active and have role `admin` or `warden`. Other roles (including `sub_warden`) have no implemented dashboard and are denied. Failed verification clears Firebase sign-in state. No passwords or tokens are logged or manually copied into browser storage; Firebase manages its session credentials.

Unchecked “Keep me signed in” selects Firebase session persistence (the tab/window session); checked selects local persistence across browser restarts. This is not a 30-day backend expiry guarantee. See [Firebase persistence documentation](https://firebase.google.com/docs/auth/web/auth-state-persistence). Returning to `/login` rechecks a saved user against the backend before redirecting. API requests time out after 15 seconds.

For local development, set `VITE_API_BASE_URL` to your running backend (commonly `http://127.0.0.1:18080` in the backend documentation). Vite forwards `/backend-api/api/v1/me` to that backend, avoiding a browser cross-origin request. The backend base must not already end in `/api/v1`. Production and `vite preview` call the configured backend URL directly and require an allowed-origin CORS policy or a deployment reverse proxy. Vite's development proxy is not deployed with the static build.

Firebase is pinned to 12.4.0 for the repository's Node 22 runtime. The transitive `@grpc/grpc-js` override selects a patched version for the umbrella SDK's Firestore dependency; this application imports only Firebase app/auth modules. Review the SDK pin and override together when upgrading Node/Firebase.

### Login verification

Automated tests use mocked Firebase and fetch; they do not contact a live Firebase project. Before closing this ticket, verify with dedicated active test accounts:

1. Submit empty fields and an invalid email; confirm messages and focus on the first invalid field.
2. Sign in as Admin and Warden; confirm the matching dashboard URL.
3. Try incorrect credentials, inactive accounts, and an unsupported role; confirm no dashboard redirect and a safe error.
4. Verify the button disables during submission and allows retry after failure.
5. Verify checked/unchecked persistence across reload and tab/browser closure, returning through `/login`.
6. Open Forgot password and return to login; recovery operations are not implemented by this ticket.
7. Check desktop, 375px and 320px widths, keyboard focus, and direct `/login` refresh.

Firebase public configuration, a running backend/database and live test credentials are required for these integration checks. Dashboard content remains placeholder content, while frontend access guards and backend authorization enforce their separate responsibilities.

## Protected routes — issue #11

`features/auth/components/AuthProvider.tsx` owns shared authentication state; `features/auth/hooks/useAuth.ts` exposes it to feature and layout components. The provider observes Firebase ID-token/session changes and verifies the current user through `/api/v1/me`. Account roles come from the current backend response, not Firebase claims or a browser-stored role. `ProtectedRoute`, `PublicOnlyRoute` and `RoleGuard` live in `app/router/`, with role-to-dashboard mapping in `config/roles.ts`.

Protected content is hidden until the account is verified for the current pathname. Verification runs on direct load, route changes, token/session notifications, window focus and returning to a visible tab. Stale responses cannot restore access after sign-out or a newer verification. Wrong-role URLs redirect to the user's permitted dashboard; authenticated `/login` visits do the same. `/dashboard` resolves to the permitted dashboard. Navigation and the header brand also use that role.

Expired/rejected sessions, inactive accounts and unsupported roles are denied. Temporary network/backend failures hide protected content and show Retry verification and Sign out actions. Restored Firebase credentials are preserved for transient failures so retries can recover; permanent rejection clears the Firebase session. Sign-out hides dashboard content immediately, clears the Firebase session and returns to login. Failed sign-out keeps protected content hidden and offers another attempt. Firebase notifications also handle sign-out from another tab when local persistence is used.

The client rechecks at the events listed above; it does not promise instantaneous detection of a database role/status change in an idle tab. Every business API must continue enforcing backend authorization on every request. No new backend permission policy is introduced by this ticket.

Automated route tests mock Firebase/backend boundaries and cover anonymous access, restored sessions, pending verification, wrong-role URLs, retry, sign-out, back navigation and stale responses. Live acceptance still requires working Firebase sign-in and dedicated active Admin/Warden accounts. Before closing the GitHub issue, record live checks, peer review and passing CI; mocked tests do not prove real Firebase configuration or production CORS.
