# Admin user management

Ticket: #79. Route: `/dashboard/users`.

Staff-role account rows also link to the separate [#83 staff profile setup workflow](admin-staff-creation.md). That workflow can create a missing profile without creating another login account.

## Access and navigation

Sign in through `/staff/login` with an active Admin account and select **User management**.
The route uses the existing staff layout and an Admin role guard. Wardens are redirected to their own dashboard; the Admin-only sidebar link is hidden. The page also checks the active Admin account before starting reads.

The table shows backend email, optional display name/designation, role, active status and local account UUID. The current signed-in account is labelled “you”. It does not expose Firebase credentials.

## Backend contract

| Action      | Request                                            | Successful response                              |
| ----------- | -------------------------------------------------- | ------------------------------------------------ |
| List        | `GET /api/v1/users?limit=20&offset=N`              | `{users, limit, offset, has_more}`               |
| Change role | `PATCH /api/v1/users/{userID}/role`, JSON `{role}` | Updated account                                  |
| Activate    | `POST /api/v1/users/{userID}/activate`, no body    | Updated active account                           |
| Deactivate  | `POST /api/v1/users/{userID}/deactivate`, no body  | `{account, revocation_pending}`, HTTP 200 or 202 |

Only pagination is supported by the current list endpoint. There is no invented search, role filter or global total. Page size is 20 and the supported offset ceiling is 1,000,000.

Supported roles: `admin`, `warden`, `sub_warden`, `security_staff`, `student`. The role dialog explains that Sub-warden and Security staff do not currently have dedicated web portals. Selecting a role does not create a student/staff profile or supply accommodation.

The shared authorized-request helper now accepts PATCH. It retains Firebase identity checks, no-store requests, omitted credentials, abort handling and the existing request timeout.

## Changes and recovery

- Every mutation requires a modal confirmation. Cancel receives initial focus; Escape cancels only when no save is pending. Focus returns to the invoking control or page heading when that control is removed.
- The current role cannot be submitted unchanged. A synchronous guard prevents duplicate submissions while pending; pending controls and cancellation are disabled.
- Successful responses are validated against the target identity and requested change, then the current list page is fetched again. No optimistic account status is shown.
- HTTP 202 deactivation confirms local account denial while Firebase session revocation remains pending. It is not reported as completed external revocation.
- Backend conflicts explain last-active-Admin protection, pending revocation, incomplete provisioning and missing/mismatched Firebase identity. The browser never guesses last-Admin state from one page.
- A network/server failure or malformed successful mutation response can mean the change was committed. The dialog hides the submit action and requires closing/refetching accounts before considering another action. There is no automatic mutation retry.
- A removed account also requires a fresh list. Access/session denial clears records and closes the dialog, with session verification and sign-out recovery.
- Changing the current Admin's role away from Admin or deactivating that account hides the list and requires access verification. Backend authorization remains authoritative on every request.
- Requests abort on identity change, role change or unmount and late results are ignored. Changing pages/refreshing hides the old page during loading. No account data is persisted to browser storage.
- Deactivation manages login access; it does not archive student profiles. Account deletion and account creation are outside this ticket.

## Verification

Local verification completed:

- All 1,819 tests passed across 86 files, including 96 new user-management tests.
- Overall coverage: 96.38% statements, 94.11% branches, 97.40% functions and 98.40% lines.
- The new API, dialog and page each have 100% line/function coverage. Branch coverage is 98.97%, 96.25% and 88.15%, respectively, above the 80% target.
- TypeScript, ESLint, Prettier, production build and whitespace checks passed. The existing production chunk-size advisory remains non-fatal.
- The application navigation test now checks the additional Admin-only link. An existing embedded-inbox test now waits for its asynchronously loaded notification heading instead of checking before the read completes.

Automated checks cover pagination, response validation, confirmations, supported roles, access restrictions, mutation conflicts, uncertain results, cancellation, duplicate submissions and request cleanup.

Before merging, complete peer review, CI and a staging smoke test with authorized development accounts. Browser/mobile checks should verify table scrolling, long email addresses, modal focus trapping, Escape, focus restoration and denied-role navigation. Last-Admin protection and external revocation/activation require the running backend/Firebase integration; no live accounts are changed by the unit tests.
