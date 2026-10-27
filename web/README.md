# HostelHive Web

React student portal and Admin/Warden dashboard. Responsible member: Navon Sanjuni.

## Live application

- [Student login](https://web-kohl-delta-90.vercel.app/login)
- [Admin and Warden login](https://web-kohl-delta-90.vercel.app/staff/login)
- [Backend Swagger documentation](https://hostelhive-backend-dev.onrender.com/docs/)
- Backend API base: `https://hostelhive-backend-dev.onrender.com/api/v1`

See the [repository README](../README.md#demo-accounts) for the assessment demo
accounts, repository links, CI and coverage information.

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

Feature folders contain the implemented modules. See the repository README and
the individual guides in `docs/` for their current scope and verification steps.

## Routes and navigation

- `/` redirects to the student login at `/login`. The former `/student/login` URL also redirects there.
- `/staff/login` renders the staff login page, or redirects a restored, backend-verified session to its role's dashboard.
- `/forgot-password` requests a Firebase reset email and displays a generic confirmation with resend controls.
- `/reset-password?mode=resetPassword&oobCode=...` verifies a Firebase reset link before displaying the new-password form.
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

Unchecked “Keep me signed in” selects Firebase session persistence (the tab/window session); checked selects local persistence across browser restarts. This is not a 30-day backend expiry guarantee. See [Firebase persistence documentation](https://firebase.google.com/docs/auth/web/auth-state-persistence). Returning to `/staff/login` rechecks a saved user against the backend before redirecting. API requests time out after 15 seconds.

For local development, set `VITE_API_BASE_URL` to your running backend (commonly `http://127.0.0.1:18080` in the backend documentation). Vite forwards `/backend-api/api/v1/me` to that backend, avoiding a browser cross-origin request. The backend base must not already end in `/api/v1`. Production and `vite preview` call the configured backend URL directly and require an allowed-origin CORS policy or a deployment reverse proxy. Vite's development proxy is not deployed with the static build.

Firebase is pinned to 12.4.0 for the repository's Node 22 runtime. The transitive `@grpc/grpc-js` override selects a patched version for the umbrella SDK's Firestore dependency; this application imports only Firebase app/auth modules. Review the SDK pin and override together when upgrading Node/Firebase.

### Login verification

Automated tests use mocked Firebase and fetch; they do not contact a live Firebase project. Before closing this ticket, verify with dedicated active test accounts:

1. Submit empty fields and an invalid email; confirm messages and focus on the first invalid field.
2. Sign in as Admin and Warden; confirm the matching dashboard URL.
3. Try incorrect credentials, inactive accounts, and an unsupported role; confirm no dashboard redirect and a safe error.
4. Verify the button disables during submission and allows retry after failure.
5. Verify checked/unchecked persistence across reload and tab/browser closure, returning through `/staff/login`.
6. Open Forgot password and return to login; issue #14 implements recovery and reset operations separately from login.

## Password recovery and reset — issue #14

The flow reuses `AuthLayout`, shared Button/Input controls and Figma typography/colour tokens. Business logic remains in `features/auth/`: `api/password.api.ts` wraps Firebase; `password.schema.ts` handles local validation; `ResetPasswordForm.tsx` owns form interactions; recovery/reset pages own their screen states. No new backend password API or local credential/reset-token store is added.

The recovery form calls `sendPasswordResetEmail` through the configured Firebase web app. Confirmation says **if an account exists**, a reset email will arrive; unknown/disabled-account responses receive the same confirmation. Provider/network failures are reported without exposing raw details. Acceptance does not prove email delivery. Resend has a 60-second UI cooldown and duplicate requests are disabled; this is a user-experience safeguard, not a replacement for Firebase quotas and abuse controls. Email addresses remain in component memory.

The reset handler accepts exactly one `mode=resetPassword` and one nonempty `oobCode`. It uses the project's configured Firebase app rather than any URL-supplied API key and ignores `continueUrl` instead of following untrusted redirects. The code is captured only in component memory and then removed from the address bar. Refreshing the cleaned URL requires reopening the email link; the code is deliberately not retained in storage. Codes and passwords are never logged. Production hosting should also avoid recording sensitive action-link query strings and set an appropriate Referrer-Policy.

`verifyPasswordResetCode` validates the link before password fields appear. `validatePassword` loads the configured policy, whose length/case/number/symbol requirements drive the checklist and requirements meter. The meter reports requirements met, not a password-strength rating. Submission requires matching passwords and validates through Firebase again before `confirmPasswordReset`. Invalid, expired and already-used links provide a recovery action; temporary failures offer retry. Success clears the local Firebase session and provides a sign-in link. Remote session revocation remains enforced by Firebase and the backend's revoked-token verification; verify that behaviour live rather than inferring it from unit tests.

### Firebase email-action configuration

1. Use the same Firebase project and public web configuration as login. Review the Email/Password provider, password policy and email-enumeration/abuse settings.
2. Deploy the frontend with browser-history fallback for `/reset-password`.
3. In Firebase Console → Authentication → Templates → Password reset, configure the custom action URL to your actual frontend **`https://<your-domain>/reset-password`**. For local testing, use your permitted localhost/127.0.0.1 action URL and verify the project's domain/key restrictions. Do not assume a continue URL alone replaces the email action handler.
4. Firebase appends `mode`, `oobCode` and related parameters to the email link. This page handles password reset only. Firebase custom-handler settings can affect other email action types; a dispatcher for verification/recover-email actions is required if those templates use the same custom URL. Unsupported modes are rejected here.
5. Leave the Firebase project's real link expiry and password policy as the source of truth; this UI does not promise a 20-minute expiry or hard-code the Figma sample's eight-character minimum.

See [Firebase custom email handlers](https://firebase.google.com/docs/auth/custom-email-handler) and [Firebase password policy](https://firebase.google.com/docs/auth/web/password-auth).

### Live acceptance checks

Use a dedicated test mailbox/account you control. Automated tests mock Firebase and never send emails or change live passwords.

1. Request a reset, check the generic confirmation, spam folder and resend cooldown, then verify actual email delivery.
2. Open the email link and confirm the address bar is cleaned, the verified account is shown, and requirements match the configured Firebase policy.
3. Check weak/mismatched passwords, pending submission and retry after a service failure.
4. Complete a reset; verify the new password signs in, the old password fails and prior sessions are rejected by the backend.
5. Reopen the used link and test an invalid/expired link; confirm a new-link recovery option.
6. Check desktop/mobile layouts, keyboard focus and direct reset-link navigation. Refreshing a cleaned link should show an invalid-link recovery screen.

Record real Firebase delivery/policy/session results, peer review and passing CI before closing issue #14. First-login activation and authenticated password changes remain separate tickets. 7. Check desktop, 375px and 320px widths, keyboard focus, and direct `/staff/login` refresh.

Firebase public configuration, a running backend/database and live test credentials are required for these integration checks. Dashboard content remains placeholder content, while frontend access guards and backend authorization enforce their separate responsibilities.

## Protected routes — issue #11

`features/auth/components/AuthProvider.tsx` owns shared authentication state; `features/auth/hooks/useAuth.ts` exposes it to feature and layout components. The provider observes Firebase ID-token/session changes and verifies the current user through `/api/v1/me`. Account roles come from the current backend response, not Firebase claims or a browser-stored role. `ProtectedRoute`, `PublicOnlyRoute` and `RoleGuard` live in `app/router/`, with role-to-dashboard mapping in `config/roles.ts`.

Protected content is hidden until the account is verified for the current pathname. Verification runs on direct load, route changes, token/session notifications, window focus and returning to a visible tab. Stale responses cannot restore access after sign-out or a newer verification. Wrong-role URLs redirect to the user's permitted dashboard; authenticated `/staff/login` visits do the same. `/dashboard` resolves to the permitted dashboard. Navigation and the header brand also use that role.

Expired/rejected sessions, inactive accounts and unsupported roles are denied. Temporary network/backend failures hide protected content and show Retry verification and Sign out actions. Restored Firebase credentials are preserved for transient failures so retries can recover; permanent rejection clears the Firebase session. Sign-out hides dashboard content immediately, clears the Firebase session and returns to login. Failed sign-out keeps protected content hidden and offers another attempt. Firebase notifications also handle sign-out from another tab when local persistence is used.

The client rechecks at the events listed above; it does not promise instantaneous detection of a database role/status change in an idle tab. Every business API must continue enforcing backend authorization on every request. No new backend permission policy is introduced by this ticket.

Automated route tests mock Firebase/backend boundaries and cover anonymous access, restored sessions, pending verification, wrong-role URLs, retry, sign-out, back navigation and stale responses. Live acceptance still requires working Firebase sign-in and dedicated active Admin/Warden accounts. Before closing the GitHub issue, record live checks, peer review and passing CI; mocked tests do not prove real Firebase configuration or production CORS.

## Student directory and profiles — issue #19

Admin and Warden accounts can open `/dashboard/students` and `/dashboard/students/:studentID`. Requests use the current Firebase ID token, the development API proxy, and the configured production API URL. No student data or tokens are persisted in browser storage.

The directory calls `GET /api/v1/students` with `q`, `faculty`, `year`, `limit=20`, and `offset`. Search matches name or student index/ID; faculty matches the complete name case-insensitively. Year supports 1–10. Filters and pagination live in the URL and survive profile visits, refresh, and browser back/forward. The API returns `has_more`, not a total count, so pagination shows Previous/Next without invented totals.

Profiles call `GET /api/v1/students/{studentID}` and show contact and guardian details. Account Active/Inactive describes the account only. Room/bed allocation, attendance, QR eligibility, photos, mutations, and CSV imports remain separate integrations. Students navigation is available to both currently supported staff roles.

Loading, empty directory, unmatched filters, missing profile, malformed response, access denied, and retry states are covered. Rejected sessions offer Sign in again using the existing sign-out flow. Requests are cancelled on navigation and superseded responses are ignored.

Live smoke checks with dedicated test records:

1. Sign in as Admin and Warden, select Students, and open a profile.
2. Search by name/ID; apply an exact faculty and year; test Previous/Next with more than 20 matching records.
3. Open a profile and return; verify filters and page are preserved, including refresh and browser history.
4. Check guardian/contact details, inactive accounts, missing optional details, and an unknown student ID.
5. Check backend outage/retry, rejected/expired sessions, and forbidden access; verify records are hidden.
6. Check keyboard navigation and desktop, tablet, and 320px layouts. Scroll the table within its region on narrow screens.

Automated checks mock service boundaries and do not prove live Firebase/backend/CORS configuration. Record live smoke results, peer review, and passing CI before closing #19.

## Student profile creation and editing

Use Add student from the directory or Edit profile from an existing profile. Creation calls `POST /api/v1/students`; editing calls `PUT /api/v1/students/{studentID}`. Both retain the existing Admin/Warden permissions and send the current Firebase ID token.

Creation requires an existing active student account UUID supplied by an administrator. Account browsing is Admin-only in the current backend, so this form does not call the user listing API or pretend Wardens can browse accounts. The backend checks active student status and profile uniqueness. No login account is provisioned, password collected, email modified, or QR activated by these forms.

Editable fields follow the backend limits: student ID 64 characters, name 200, faculty 120, year 1–10, phone 7–32 supported characters with at least seven digits. One to ten guardians are required, each with name, relationship, and phone. PUT replaces the guardian collection according to the existing backend contract; guardian IDs and response-only fields are excluded from the payload.

The router now supports navigation blocking. Dirty forms show a discard dialog for Cancel, internal navigation, and browser history navigation, plus the browser warning on refresh/close. Save success opens the profile and preserves directory filters. Pending submission disables controls and duplicate requests. Failed requests preserve values; rejected sessions and forbidden/missing records prevent another save. A timeout/network failure can leave the save outcome unknown, so check existing records before submitting again. Mutations are never automatically retried.

Live acceptance checks require dedicated test records: create a profile for an eligible account, edit fields/guardians, verify duplicates and inactive-account rejection, test unsaved navigation, and inspect desktop/mobile keyboard behavior. Automated tests mock the services and do not create real accounts or database records. No backend or database files were changed for this frontend ticket.

## Student profile archival — issue #24

Admin and Warden users can select Archive student profile from a loaded profile. The native modal identifies the student, focuses Cancel, traps focus through the browser modal behavior, supports Escape when idle, and restores focus on dismissal. It explains preservation of history, separate account deactivation, and separate bed-allocation revocation. No restore action is exposed.

Confirmation sends `DELETE /api/v1/students/{studentID}` with a current Firebase bearer token and no body. Only HTTP 204 confirms success. The frontend returns to the directory with its filters/page intact, fetches fresh results, and displays a success notice. Empty last pages retain Previous navigation. Requests are never automatically retried.

Pending requests disable confirmation/dismissal. Session, forbidden, invalid and missing-profile errors do not claim success. A timeout, network error, or service failure has an uncertain outcome: Check profile performs only GET. If the profile is still available, staff can review and explicitly confirm another archive. If absent, return to the directory without claiming a newly confirmed archival. Closing/reopening the dialog does not bypass the check requirement.

Automated tests mock all requests. Before closing #24, verify with dedicated test data: cancel/Escape/focus, successful archival and refreshed filters, duplicate-click prevention, denied/expired sessions, missing profiles, and service failure/check recovery. Check native modal keyboard behavior and narrow layouts in the browser. No backend files, migrations, or database records were changed during implementation.

## Student profile photos

Admin and Warden users manage photos on the existing student profile page. `features/students/api/student-images.api.ts` uses the same current Firebase session checks and API configuration as student CRUD. GET/PUT/DELETE target `/api/v1/students/{studentID}/image`; PUT sends raw image bytes with matching Content-Type, and DELETE sends no body. The server-returned `profile_image_url` only indicates that a photo exists: the request destination is derived locally to avoid forwarding a token to arbitrary URLs. Private photos are fetched with a bearer token and displayed through temporary Blob URLs, which are revoked on replacement and unmount. No photo bytes or credentials are saved to browser storage.

Choose a JPEG or PNG, preview it, then explicitly upload/replace. Client checks reject empty files, files over 5 MiB, undecodable images, dimensions over 4096 per side, and more than 12 million pixels. The backend remains authoritative for decoded format, sanitization, and storage. Removal requires a named-student confirmation; Cancel receives focus, Escape dismisses when idle, and focus returns to the trigger. Student and guardian records are unaffected by photo removal.

Writes are never automatically retried. Pending controls prevent duplicate submission. If a write response is lost or the service fails, further writes require **Check photo status**, which reads the profile and its saved photo and discards the local selection. Upload acknowledgement and subsequent preview failure are reported separately. A missing photo has an empty state; unavailable storage does not hide the rest of the profile. Expired sessions and forbidden access clear displayed photos and block controls. Navigating away aborts requests; an aborted write may still complete on the server, so returning to the profile reads current state.

The existing backend must already have private R2 photo storage configured and running. With R2 disabled, photo endpoints return 503 and the UI shows a photo-service error. This frontend ticket does not enable storage, change backend configuration, or modify the database.

Automated tests mock network requests and image decoding. Before closing the photo ticket, verify using dedicated test data and authorized staff accounts: upload PNG/JPEG, reload and display, replace, cancel/confirm removal, empty/oversized/unsupported/corrupt images, denied access, disabled storage, interrupted-write status recovery, keyboard focus/Escape, and narrow-screen layouts. Record live private-storage results, passing CI, and peer review. No live photo mutations are performed by the automated tests.

## Admin student CSV import — issue #26

Verified Admin users open **Import CSV** from the student directory, or `/dashboard/students/import`. The link preserves directory filters and pagination. A role guard denies Warden direct access, and the backend independently enforces Admin authority. The import screen loads on demand. Existing Admin/Warden student CRUD and photo permissions are unchanged.

1. Select **Get CSV template**, then **Save CSV template**. The frontend downloads the authenticated `GET /api/v1/students/import/template` response and revokes its temporary download URL on replacement/unmount.
2. Fill the seven case-sensitive columns `user_id,index_no,full_name,faculty,year,contact_phone,guardians`, each exactly once, in any order. Use existing active student account UUIDs from the separate provisioning workflow. CSV import never creates Firebase accounts, updates roles, overwrites profiles, or restores archived profiles.
3. Select a non-empty UTF-8 `.csv` file up to 2 MiB and 500 data records. UTF-8 BOM, CRLF, blank lines, reordered headers, escaped quotes and multiline quoted values are supported. Broken quoting, incorrect field counts, missing/duplicate/extra headers and header-only files are rejected before submission. Local checks cover document structure, not account eligibility or per-row business validation. Review the first five records and total count, then explicitly acknowledge partial commits.
4. Import sends the selected file's raw bytes to `POST /api/v1/students/import` with `Content-Type: text/csv; charset=utf-8` and the current Firebase bearer token. It sends no multipart form, JSON wrapper, credentials, query parameters, or browser-stored role. Duplicate submissions are disabled. The backend validates student details and guardians and links eligible accounts; each valid record commits independently.
5. Review the report totals and every record/physical starting line. **Download report CSV** saves only ordinal, line, status, created profile UUID, and allowlisted error code. Raw CSV fields and arbitrary server error text are not exported. Confirmed created rows link to their profiles. Return to the directory to fetch current data. Download reports before leaving; there is no persisted import-job history.

Guardian cells must contain a JSON array with 1–10 objects, each with `name`, `relationship`, and `contact_phone`. Use a CSV writer to quote the JSON correctly. For example, this creates a local file only; replace the account placeholder with an existing eligible test account UUID before importing:

```powershell
$guardianJSON = ConvertTo-Json -Compress -InputObject @(
  @{ name = 'Robin Morgan'; relationship = 'Parent'; contact_phone = '+94771111111' }
)
@(
  [PSCustomObject]@{
    user_id = '<existing-student-account-UUID>'
    index_no = 'STU-1042'
    full_name = 'Alex Morgan'
    faculty = 'Science'
    year = 2
    contact_phone = '+94770000000'
    guardians = $guardianJSON
  }
) | Export-Csv -LiteralPath '.\students.csv' -NoTypeInformation -Encoding UTF8
```

HTTP 200 is a row report, not universal success. Invalid rows and duplicates are skipped. Earlier confirmed commits survive interruption. If service processing stopped, inspect the directory before retrying affected rows; even a reported service failure can have an uncertain database-commit outcome. Requests are never automatically retried. A lost response, timeout, malformed/mismatched report, or network failure locks resubmission and requires acknowledging a directory check, then selecting and reviewing a fresh CSV. A structural 400 or 413/415 rejects the document before writes and allows a corrected file. Session/permission rejection clears the selected CSV and disables import controls. A report stopping for `forbidden` remains downloadable but no further import is offered until access is reverified. In-page navigation and reload guards protect selected/pending/uncertain work; leaving cannot undo server commits.

All import requests are mocked in automated checks; no live records are created. Before closing #26, use dedicated eligible test accounts to verify template download, valid and mixed-validity batches, duplicate rows/existing profiles, inactive accounts, guardian JSON, structural limits, service interruption and directory recovery, expired/revoked Admin access, Warden denial, report download, navigation focus/Escape, and narrow layouts. Record live acceptance, peer review and passing CI. No backend files, configuration, migrations or database data are changed by this frontend implementation.

## Authorized student QR display — issue #27

Verified Admin and Warden users open a student profile and select **Show QR code**. The frontend deliberately does not retrieve QR images automatically: the existing backend issues a stable identifier on first authorized retrieval. `features/students/api/student-qr.api.ts` calls only `GET /api/v1/students/{studentID}/qr`, using the student profile UUID, current Firebase bearer token, configured API origin/development proxy, no body, no query parameters, and `cache: no-store`. The separate Student-only `/api/v1/me/qr` route is not used by the staff web dashboard.

The backend generates the black-on-white 320×320 PNG and checks current eligibility. The frontend checks success status, PNG media type and signature, then displays the image through a temporary Blob URL. Browser decode failure hides the image and download. **Download QR PNG** becomes available after decoding, saves `student-qr.png`, and contains the original backend PNG bytes. No external QR service, client-side token generation, QR payload decoding, token-in-URL, automatic download, or browser storage is involved. The raw identifier is not displayed as text or logged.

**Refresh QR code** clears the existing image while rechecking with the backend; it does not rotate or regenerate the stable identifier. **Hide QR code**, navigation, staff/student changes, inactive-account rendering, and tab hiding revoke the temporary image URL. Hiding during a pending request aborts it and ignores late responses; returning to a visible tab requires explicit retrieval again. Requests are never automatically retried. Inactive profiles show an unavailable state without a request. Missing/ineligible profiles, invalid requests, service failures, expired sessions and forbidden access have safe recovery states. Session/permission errors remove the old image and block further retrieval; an expired session offers sign-in recovery. Current server checks happen on retrieval and normal route/session verification events, not continuously while an image is visible.

The QR is a stable identification code, not a login credential or proof that a saved image's holder is the student. Previously downloaded copies are not revoked by clearing this UI. Showing, refreshing, or downloading does not record entry, exit, attendance or presence. Hardware scanning and current eligibility at scan time belong to the existing device/attendance workflows; this ticket adds no scanner or rotation endpoint and makes no claim of university-card compatibility. It works independently of profile-photo R2 storage, provided the backend QR endpoints and their existing schema are available.

Automated tests mock authentication, network images and browser decode events. Before closing #27, record live acceptance with dedicated test profiles: Admin/Warden retrieval, matching stable PNGs across refresh, PNG download and local scannability, inactive/archived/missing target handling, expired/denied access, service failure/retry, keyboard hide/focus, tab-hiding cleanup, navigation between profiles, and narrow-screen image sizing without cropping the quiet border. First live retrieval can create the server's QR record; no live QR requests, backend files, migrations or database changes are performed during this frontend implementation. Peer review and passing CI remain required.

## Staff complaint management — issue #43

Open **Complaints** at `/dashboard/complaints`. Active Admin/Warden accounts can browse both maintenance and disciplinary complaints. `features/complaints` owns its types, API validation, request state, list/detail pages and action dialog, using the existing authentication transport and shared controls. Student complaint submission, Sub-Warden web access, attachments, notifications and exports are outside this frontend ticket. Original description, owner and category are read-only; no deletion or editing endpoint is invented.

`GET /api/v1/complaints` supports category, status, exact student-profile UUID and creation-time bounds with pages of 20. Date inputs use browser-local time and convert to RFC3339 instants; **Created from** is inclusive and **Created before** is exclusive. Filters remain in the URL and valid detail/back links. Applying or clearing filters returns to page 1. Unknown/repeated/invalid filters and reversed ranges show resettable validation. Empty pages retain server totals. Student and actor references display as UUIDs because these endpoints do not provide names.

Details load `GET /api/v1/complaints/{id}` and `GET /api/v1/complaints/{id}/updates?limit=20&offset=…`. Complaint state and history are independent server snapshots loaded together; a read failure hides the combined panel and Retry reloads both. History is oldest-version-first, with text, status transitions, actor IDs, server timestamps and versions. Existing `image_added`/`image_removed` audit entries display their photo reference only; no image endpoint is called. Dates explicitly include browser-local timezone. History pagination reloads current details, and **Refresh complaint** resets history to page 1. Superseded reads are aborted and late responses ignored.

Unresolved complaints offer **Add note**. Staff can transition pending → in_progress/resolved, in_progress → resolved, and resolved → in_progress. Resolution and reopening require an explanation; notes require nonblank text. Text allows up to 2000 Unicode code points, normal newlines/tabs and no other control characters. **All notes and explanations are visible to the owning student**, including staff actions on inactive/archived students' complaints; the interface does not offer confidential notes. Explicit review and confirmation precede every write. Pending operations prevent duplicates, cancellation and navigation; dirty notes and unresolved outcomes warn on navigation/reload.

Notes post to `/api/v1/complaints/{id}/notes` with `request_id`, `expected_version`, and trimmed `text`. Status actions post to `/status` with the same fields plus `status`. A fresh browser UUID is created at review; the expected version comes from the current complaint. Only documented fields are sent. Acknowledgements are immutable update entries, not current complaint objects: successful actions refetch current details and history rather than optimistically rolling the record back to the acknowledgement's version.

After **409**, the draft is retained but confirmation is locked until **Reload complaint and history** succeeds. The user must review a supported action against the new state; only then is a fresh action UUID/version generated. A lost/503/malformed response may represent a committed action: its original complaint snapshot, UUID, version, action and trimmed text remain frozen. Reload is required, after which **Review identical retry** and **Confirm identical retry** explicitly resend that exact original payload. The backend's actor-scoped idempotency returns the original update even if later actions changed the complaint, preventing duplicate notes. An identical retry that conflicts must follow the normal conflict/reload/new-review path. No action is automatically resent, and no changed payload is silently paired with a new version. Failed rechecks remain locked; Cancel discards the in-memory draft, so inspect history before starting any later action. These recovery details are not persisted in browser storage.

Validation failures retain editable input. Missing-resource, session and permission failures remove the dialog and private details. Confirmed-success feedback survives a subsequent read failure. Loading, empty, retry, conflict and denied states are explicit. All automated reads/writes and authentication are mocked; no backend, provider configuration, migrations or database records are modified.

Before closing #43, record live acceptance with dedicated fixtures for Admin/Warden access to both categories; all filters and the exclusive date boundary; directory/history pagination; notes, start-progress, resolution and reopening; required text/character limits; concurrent changes; exact UUID retries after uncertain writes and later updates; denied/expired sessions; missing records; inactive/archived owners; refresh failures; keyboard focus/Escape/navigation guards; and narrow layouts. Peer review and passing remote CI remain required. Tests validate API contracts and frontend behavior, not live database/provider integration.

## Staff early-exit and late-entry review — issue #41

Open **Access requests** at `/dashboard/late-access-requests`. Active Admin and Warden users can browse requests, filter by status or exact student-profile UUID, and navigate pages of 20 using the server total and `has_more`. `features/late-access` owns its types, APIs, pages, request state, decision dialog and styling. It uses the existing authenticated transport and shared Button/Input controls without importing the leave module's private implementation. Both request modules retain their own contracts: late access concerns one direction/expected time; leave concerns an interval.

Lists call `GET /api/v1/late-access-requests?limit=20&offset=…` with optional `status` and `student_id`. The backend has no direction filter, so the frontend does not send one or locally filter only one page of results. Applying filters resets pagination; detail/back navigation preserves valid list filters. Unknown/repeated/invalid URL filters show resettable validation without requesting data. Student/account references display as real IDs; the API does not return names. No automatic name lookup or browser storage is added.

**View request** opens `/dashboard/late-access-requests/{lateAccessID}` and calls the same ID-specific API without list query parameters. Details show IN as **Late entry** and OUT as **Early exit**, expected time, reason, submission and decision audit references. Dates use the browser's local timezone and include a timezone label. Curfew thresholds and hostel timezone are configured by the backend and are not hard-coded in this interface. The server remains authoritative for eligibility, time and permission matching.

Only pending requests offer approval/rejection. The dialog requires explicit review and confirmation, sends only `status` and a trimmed `note` to `POST /api/v1/late-access-requests/{id}/decision`, and requires a nonblank rejection note. Notes allow up to 1000 Unicode code points, normal newlines/tabs and no other control characters. Pending operations prevent duplicate submissions, cancellation and navigation; dirty notes and unresolved outcomes warn on navigation/reload. Validation failures retain input. Conflicts, ineligible-student responses and uncertain saves lock resubmission until **Check current status** succeeds. Failed checks retain the draft and lock; a still-pending request requires a new review/confirmation, while a finalized request replaces the dialog with its recorded decision. No automatic decision retry is performed. Confirmed decisions refresh details while retaining success feedback if the read fails. Returning to the list fetches current totals/statuses. Authorization or missing-resource errors remove the form and private details; superseded reads/writes are aborted and late responses ignored.

Approved requests can include `consumed_at`, `consumed_device_id` and `consumed_event_id`. When provided together, these display under **Recorded permission use**; the original approved decision remains unchanged. Their absence says only that no use is recorded in this response, not that the permission is currently valid or available. The frontend does not infer used/expired/completed states, compare policy windows, mark grants consumed, record attendance/presence, operate a gate or invoke scanner endpoints. Consumption reflects server scan history and is not proof of physical passage. Refresh explicitly to retrieve updated history.

The scope excludes student submission, notifications, incidents, exports, cancellation, editing/deletion, policy configuration and device management. Automated tests mock every API/authentication boundary and cover both directions, list filters/pages, detail/back links, optional consumption metadata, all decision/error/recheck flows, permissions, duplicate prevention, stale responses and navigation/focus. Before closing #41, record live acceptance with dedicated fixtures for Admin/Warden browsing/decisions, pending/finalized and expired/ineligible records, timezone display, consumed/unconsumed history, denied/expired sessions, missing resources, conflicts, service interruption/recheck, keyboard focus/Escape and narrow layouts. Remote CI and peer approval remain required. No backend files, provider settings, migrations or database records are changed during this implementation or automated tests.

The repository contains a ready-to-paste issue draft at `docs/issues/41-late-access-request-management.md`; saving that draft does not create a remote GitHub issue or update the project board.

## Staff leave request management — issue #39

Open **Leave requests** at `/dashboard/leaves`. Verified active Admin and Warden accounts can browse requests, filter by status and exact student-profile UUID, and navigate pages of 20 using the backend total and `has_more`. The API provides student and account references, not student names; these references are displayed as IDs. The list reads `GET /api/v1/leaves?limit=20&offset=…` with optional `status` and `student_id`. Filters are preserved in the URL and detail/back navigation. Applying or clearing filters starts at page 1. Duplicate, unsupported and invalid query parameters show a resettable validation state. Backend offsets have no inventory-style 100000 cap; the UI accepts only nonnegative safe integers with room for pagination arithmetic.

**View request** opens `/dashboard/leaves/{leaveID}` and loads `GET /api/v1/leaves/{leaveID}` without forwarding list filters to the detail API. The page shows request/student/account IDs, requested dates, reason, submission date, status and the one recorded decision (decision time, actor and note). Dates include the browser's local timezone. Invalid return filters are discarded. Loading, empty lists, missing resources, service failures/retry, session expiry and denied access have explicit states. Changing staff identity, filters or the selected request aborts superseded reads and ignores late responses. No polling, student name lookup or browser storage is added.

Only pending requests offer **Approve request** and **Reject request**. Both staff roles use `POST /api/v1/leaves/{leaveID}/decision` with only `status` and the trimmed `note`. Rejection requires a nonblank note. Notes support up to 1000 Unicode code points and allow normal newlines/tabs while rejecting other control characters. A review step shows the exact decision/note before explicit confirmation. Pending writes prevent duplicate submission, cancellation and in-app navigation; draft notes and unresolved outcomes are protected against navigation/reload. Backend permissions and approval eligibility are authoritative. Finalized requests show their recorded decision and no new decision controls.

Failed validation retains the note for correction. Conflicts, ineligible-student responses and uncertain/lost responses lock resubmission until **Check current status** successfully rereads the request. A service failure during that check keeps the form locked and retains the note. If the request is still pending, the user must review and explicitly confirm again; if it has been finalized, the recorded decision replaces the form. The backend supports exact decision retries by the same actor, but this frontend never automatically resends a decision. Session, permission or missing-resource errors remove the decision draft and old details. A confirmed decision refreshes details and preserves success feedback if the following read fails. Returning to the list performs a new read, so counts and status filters reflect the backend's latest state.

Approval or rejection does not alter attendance, physical presence, QR access, bed allocations or realtime counts. The staff web application does not submit student leave requests. Editing, cancellation, deletion, notifications and exports are outside this ticket. `features/leave` owns its APIs, pages, state and decision UI; it reuses the authentication transport and shared Button/Input controls without importing another feature's private APIs.

Automated tests mock every request and authentication boundary. Before closing #39, record live acceptance with dedicated eligible fixtures: Admin/Warden browsing and decisions; status/student filtering and pagination; approval and required rejection note; finalized history; current eligibility and competing decisions; expired/denied access; missing requests; uncertain save and failed/successful status recheck; detail/list refresh; keyboard focus/Escape; navigation guards; local-time display; and narrow layouts. Peer approval and passing remote CI remain required. No backend files, configuration, migrations or database records are changed during frontend development or automated testing.

## Hostel inventory management — issue #37

Open **Inventory** at `/dashboard/inventory`. Verified Admin and Warden accounts browse blocks, select **View rooms**, then **View beds**. The URL retains the selected block/room UUIDs, bed availability and pagination. Direct URLs show parent IDs because the backend has no individual block/room detail endpoint. Blocks and rooms show server-provided capacity, occupied beds and available beds; blocks also show room count. Capacity is the number of configured beds, and occupancy follows active allocations, including assignments that have not been revoked for inactive students. This page does not infer physical presence or attendance.

Lists call `GET /api/v1/blocks`, `/rooms?block_id=…`, and `/beds?block_id=…&room_id=…`. Beds default to all availability states, with explicit available/occupied filters. Pages contain 20 items, use the server total, and respect the backend's maximum offset of 100000. Changing hierarchy or availability resets pagination. Unknown, repeated or invalid URL filters show a reset action without a request. Loading, empty, stale-page, error/retry, session-expired and denied states are explicit. Superseded requests are aborted and late responses ignored. **Refresh inventory** reloads current server counts. Existing allocation bed selection retains its separate available-only API contract.

Only Admin accounts see **Create** and **Rename**. Forms send authenticated JSON to `POST /api/v1/blocks|rooms|beds` or `PUT /api/v1/blocks|rooms|beds/{id}`. Block names allow 120 Unicode code points; room and bed labels allow 32. Labels are trimmed, required and reject control characters. Creation includes only the appropriate parent ID; renaming sends only the label and cannot relocate a room or bed. Case-insensitive uniqueness is enforced by the backend globally for blocks and within each parent for rooms/beds. Capacity, availability, actor IDs and allocations are never editable here. Occupied beds can be renamed without changing their assignment. Warden accounts have read-only inventory; the backend rechecks mutation authority.

Failed submissions retain the label. Conflicts permit correction; missing items require closing the form and refreshing. Saves have no automatic retry, and pending forms prevent duplicate submits, Escape/Cancel and in-app navigation. Dirty drafts warn on navigation/reload. If a response is lost, unavailable or cannot be verified, the change might already exist: resubmission is disabled until the user checks the linked inventory in a separate tab and explicitly acknowledges retry. That review starts at page 1 with all bed availability states; inspect all relevant pages. Close the form and refresh if the item is already saved. Authorization failures remove the form and visible inventory. A confirmed save closes the form and refreshes the list; a subsequent read failure does not report the completed write as failed. New items reset to page 1, and may appear on a later page according to server ordering.

Automated tests mock all reads/writes and cover hierarchy/filter/pagination, server response validation, all six mutations, Admin/Warden permissions, label errors, duplicates, missing records, uncertain saves, navigation guards and stale responses. Before closing #37, record live acceptance with dedicated authorized fixtures: block/room/bed creation and rename, duplicate names with different case, occupied-bed rename preserving allocation, Warden read-only and server denial, expired sessions, service interruption and inventory review, empty/filter/page states, keyboard focus/Escape, and narrow layouts. Peer review and remote CI remain required. No backend files, configuration, migrations or database records are changed during this implementation. Deletion, archival, relocation and maintenance/gender policies are outside the existing API scope.

## Student accommodation — issue #28

Verified Admin and Warden users open a student profile, then select **Load accommodation**. This reads current allocation (`active=true`) separately from newest-first history, filtered by the profile's `student_id`, never its account or Firebase UID. History uses pages of 10 with the backend's filtered total; current allocation remains independent of the selected history page. Empty, loading, unavailable, expired-session and forbidden-access states are explicit. Directory filters remain in the existing profile URL/back link. Dates display in the browser's local time. Allocation responses contain bed UUIDs and audit references, not block/room names; the current/history view displays those real UUIDs rather than inventing room details. Legacy ended records may have no end reason and display **Ended**.

The student page composes the allocation feature's public `StudentAccommodation` component, loaded separately from the initial bundle. `features/allocation/` owns allocation types, APIs, confirmation and history; `features/inventory/api/` owns read-only block/room/available-bed listing. The picker shows actual inventory block names, room numbers, bed numbers and the globally unique bed ID, with pages of 20 at each level. Changing block, room, or page clears the old choice and aborts superseded inventory reads. An empty room does not allow confirmation. Inventory creation, editing and policy configuration remain outside this ticket.

`features/auth/api/authorized-request.ts` centralizes the existing current-Firebase-user UID check, ID token retrieval, post-response identity check, development proxy/production origin, no-store, omitted cookies and abort/timeout behavior. Student, inventory and allocation APIs call that authentication boundary; allocation does not call the student module's private API helper. Each feature still validates its own response shape and handles its own domain errors. Existing student API regression tests cover the extracted transport; no new dependency or credential storage is added.

- **Assign bed** confirms the named student and chosen inventory path, then POSTs only `{student_id,bed_id}` to `/api/v1/allocations`. Only the documented 201 response matching this student/bed confirms success.
- **Transfer bed** confirms the current bed and chosen destination, then POSTs only `{bed_id}` to `/api/v1/allocations/{allocationID}/transfer`. The server closes the old allocation and creates the new one atomically; the frontend does not revoke first, swap occupants, or evict another student.
- **Revoke allocation** confirms release of the current bed, then POSTs an empty body to `/api/v1/allocations/{allocationID}/revoke`. History and accounts are retained. Already revoked rows can return their original ended record; a transferred predecessor cannot revoke its successor.

Inactive student accounts cannot be assigned or transferred in the UI, but an existing allocation can still be revoked. The backend rechecks current staff authority, student eligibility and bed availability during every write. Account deactivation and profile archival do not automatically release beds. This ticket does not introduce gender zones or maintenance restrictions unsupported by the current API.

Confirmation dialogs focus Cancel, support Escape while idle and disable fields/dismissal during writes. Duplicate clicks are guarded in memory; reload warns while saving. Requests abort on leaving the profile or switching staff/student/eligibility, and late responses are ignored. Aborting a request cannot undo a server commit: return and reload accommodation before retrying. The backend remains the concurrency authority.

Successful writes refresh current assignment and history and reset history to page 1. A confirmed write followed by refresh failure remains reported as saved. Conflict, stale/missing resources, invalid/ineligible requests, timeouts, network failures or unverifiable acknowledgements remove the stale snapshot and require **Refresh accommodation** before exposing mutation controls again. There is no automatic write retry. Session/permission failures hide allocation details and disable controls; expired sessions offer sign-in recovery. Independent current/history requests may observe different concurrent snapshots, so Refresh is available whenever records change.

Automated tests mock all writes and inventory reads. No backend code, configuration, migrations or database records are changed during implementation. Before closing #28, use dedicated authorized test fixtures to verify Admin/Warden access; assign/transfer/revoke and refreshed inventory; occupied/same-bed/stale conflicts preserving the original allocation; inactive-account revocation; paginated and legacy history; rejected permissions; interrupted-write recovery; native dialog focus/Escape; directory filters; and narrow layouts. Verify live backend behavior, peer review and passing CI separately.

## Student presence and movement history — issue #29

Verified Admin and Warden users open a student profile, then select **Load attendance** under **Presence and movements**. The attendance feature loads separately from the initial bundle. The student page composes its public component; `features/attendance/` owns the request types, API validation, independent request lifecycle and read-only UI. It uses the existing authentication module's current-session transport, development proxy/production origin, bearer authorization, omitted cookies and no-store. No new dependency, environment setting or browser data store is added.

- `GET /api/v1/attendance/presence?student_id=<profile-UUID>` supplies the authoritative recorded IN/OUT/UNKNOWN state and nullable last-change timestamp. UNKNOWN means no recorded movement established presence; it never means OUT. An unavailable service shows an error, not UNKNOWN.
- `GET /api/v1/attendance/events?student_id=<profile-UUID>&limit=20&offset=0` supplies newest-first audit scans. Only `outcome=recorded` is labeled **Recorded movement**. `cooldown`, `already_in` and `already_out` are explicitly ignored attempts and never used to infer current presence. Ignored attempts remain visible for staff review.

These staff routes use the student profile UUID, not the user ID or Firebase UID. The separate Student-only `/api/v1/me/attendance/events`, report/date-range endpoints and scanner APIs are not called. The current staff history endpoint does not support date/direction filters, a hostel-timezone field, or a total count: the UI does not invent those parameters or values. Times display in the browser's local time and retain the original timestamp in semantic time elements.

History uses the backend's `has_more`, pages of 20, and offset limit of 1,000,000. Empty initial history and empty later pages have distinct messages, and Previous remains available beyond the end. A scan is identified by `(device_id,event_id)`, because the same event UUID may appear on different scanners. Expand **Scan reference** for the permitted event/scanner UUIDs and optional permission/incident references. No QR payload, device secret or arbitrary server text is displayed or persisted.

Permission assessments are distinct from processing outcome: approved, unapproved, not required, and not evaluated. An absent legacy assessment displays **Not specified**, without assuming approval or normal hours. This is a view of recorded classifications, not a permission decision or an attendance correction form.

Presence and history are independent request snapshots. A temporary failure in one leaves the other readable and provides a scoped retry. **Refresh attendance** resets history to page 1 and reloads both. A session or forbidden response from either immediately hides both feeds, aborts pending reads and disables further loading until access is reverified; an expired session offers sign-in recovery. Changing student/staff identity or leaving the profile aborts requests and ignores late responses. Loading is explicit and manual; no polling, automatic realtime grant, status update or background mutation is performed. The API rechecks authorization on every read.

Inactive student accounts retain staff-readable attendance when their profile can still be opened; the UI does not require an active QR or bed allocation to read history. Presence and scans are historical records, not proof of physical occupancy, passage, time spent in the hostel or an attendance percentage. The frontend neither reconstructs missed movements nor changes leave, permission, incident or scanner state.

Automated tests mock every read and authentication boundary. Before closing #29, verify with dedicated authorized fixtures: Admin/Warden retrieval; signed-out and denied access; IN, OUT and UNKNOWN; recorded versus ignored scans; legacy and current permission assessments; page navigation/refresh; partial service failures and scoped retries; inactive-account history; local-time display; stale-request cleanup and narrow layouts. Confirm live behavior, peer review and passing CI separately. No backend code, configuration, migrations or database records are changed during this frontend implementation.

## Student invitation registration (#104)

Admins use Students > Add student to register with a university email and queue private account setup. The separate existing-account profile option and Warden workflow are preserved. See [API, recovery behavior, prerequisites and live acceptance steps](../docs/issues/104-student-invitation-registration.md).
