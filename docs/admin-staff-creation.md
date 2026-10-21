# Admin staff account and profile creation

Ticket #83 adds `/dashboard/staff/new` for active Admins.

## Entry points

- Staff management → **Add staff member**.
- User management → **Set up staff profile** beside a staff-role account. This passes an account reference in router state scoped to the current Admin; it does not place credentials or personal details in the URL.
- The setup screen offers **New staff account** or **Existing staff account**. Existing choices use the backend account list's pagination. Only staff-role accounts on the current page are offered; the interface does not claim a server-side role filter or global staff total.

## Backend requests

1. `POST /api/v1/users`, JSON `{email, role, password}`, with `Idempotency-Key`. A fresh result is HTTP 201 with `{account, replayed:false}`; replay is HTTP 200 with `{account, replayed:true}`.
2. `GET /api/v1/staff/{userID}` checks whether a profile already exists.
3. Only a confirmed 404 allows `PUT /api/v1/staff/{userID}`, JSON `{full_name, designation}`, to create the missing profile.

The existing-account path skips step 1 entirely. It does not activate/deactivate accounts or change roles. Inactive staff-role accounts can have profiles maintained without restoring their login access. A replayed account keeps its actual current role and active status; it is not treated as freshly activated.

An existing profile is shown using its actual saved details and a link to the detail page. It is never silently overwritten with the setup form's values. Use the #81 profile editor for deliberate updates. The backend PUT is an upsert and has no create-only precondition, so GET-before-PUT does not make profile creation atomic with concurrent administrators; no stronger concurrency guarantee is claimed.

## Validation and credentials

- Email is trimmed/lowercased and checked before submission. Backend validation remains authoritative for email syntax and uniqueness.
- Role choices: Admin, Warden, Sub-warden and Security staff. The screen explains that the latter two have no dedicated web portals yet.
- Initial password: 12–128 Unicode code points, not trimmed; masked by default with a labelled visibility toggle.
- Full name/designation reuse #81 validation: required, trimmed, at most 200/120 Unicode code points, without control characters.
- This endpoint sets an initial password. It does not send an invitation, email credentials, or force a password change at the first login.
- The frontend never signs in as the newly created staff member; requests use the existing Admin session.

Passwords are held in component memory only while needed for the original provisioning attempt. They are cleared from the form after the account is confirmed and hidden when access is denied. They are not logged, sent in URLs/router state, or written to browser storage.

## Recovery and partial completion

- Before a new account POST, the page saves an allowlisted recovery record in `sessionStorage`, scoped by the authenticated Admin UID. It contains the operation key, normalized email, role, profile draft and, after confirmation, an account reference. It contains no password or token.
- If initial storage persistence fails, no account POST is sent. A corrupted saved reference blocks new account creation until it is explicitly reset after the administrator reviews the warning.
- An uncertain account response locks email/role and retains the original key/password in memory for an exact retry. There is no automatic retry and no replacement key for the uncertain operation.
- After reload, the saved key/email/role/profile values are restored. If the account is still unconfirmed, the administrator must re-enter the **original** initial password. Retrying never resets an existing Firebase identity's password. The page cannot recover a forgotten original password; use the existing account recovery process where applicable.
- After a confirmed account response, the password is removed from the form. The confirmed account is retained even if profile checking or creation fails. The page clearly reports **Account exists; profile setup is incomplete**.
- A profile-completion retry always GETs the profile first, never repeats POST `/users`, and does not overwrite an already-present profile. Uncertain profile drafts are locked until this check.
- Successful setup clears its recovery record. If a storage update/cleanup fails after the initial record was saved, the original key remains safe to replay; a reload may require the original password again before the account reference is recovered.
- Recovery metadata remains in the current tab/session until completion or explicit reset, so the same Admin can recover after reauthentication. Another Admin UID does not load it. Closing the tab or clearing browser storage can remove this reference; check User management before attempting a fresh account creation.
- A rejected account request offers an explicit reset/review action. Leaving setup never automatically deletes or deactivates an account. Account deletion and rollback are not supported here.
- Returning from an existing-account setup to **New staff account** reloads any older pending request for the same Admin instead of replacing its recovery key. Completing an unrelated existing account does not clear that older request.

## Access, navigation and cleanup

- Admin role guards protect the route. The page independently requires an active Admin before reading recovery state or account choices.
- Permission/session failures hide setup data and offer access verification/sign-out recovery. Passwords and visible drafts are removed from the UI; non-secret recovery metadata remains scoped to its original Admin for safe recovery.
- Requests abort on actor changes/unmount and late responses are ignored. A synchronous pending guard prevents duplicate submissions.
- Dirty setup, pending requests and incomplete attempts are protected by router blocking and browser unload warnings. Confirmation explains that leaving discards local credentials/edits but does not undo a saved account or profile.
- The discard confirmation focuses **Keep working**, supports Escape and restores focus. Inputs use existing shared controls, with wrapping account choices and responsive layout.

## Verification

Local verification completed:

- All 2,009 tests passed across 92 files, including 88 new tests.
- Overall coverage: 96.43% statements, 94.05% branches, 97.50% functions and 98.43% lines.
- Staff creation page coverage: 93.95% statements, 90.29% branches, 95.12% functions and 96.35% lines, above the 80% target. The account picker and leave-confirmation components have 100% line/function coverage.
- TypeScript, ESLint, Prettier, production build and whitespace checks passed. The existing production chunk-size advisory remains non-fatal.

Automated checks cover provisioning headers, normalization, response validation, safe recovery storage, role restrictions, new/existing-account flows, password visibility, duplicate submissions, partial completion, reloads, recovery-preserving mode changes and aborted requests.

Before merging, complete peer review, CI and staging smoke tests using authorized development accounts. Verify Firebase provisioning, original-key retries, inactive/replayed roles, existing missing profiles, mobile layout, keyboard dialogs and recovery after reload. Unit tests do not create live accounts, send email, or modify the backend/database.
