# Admin staff profile management

Ticket #81 adds **Staff management** to the Admin staff workspace.

The directory now links to the separate [#83 staff creation workflow](admin-staff-creation.md) for new accounts and missing profiles. The editing behavior below remains scoped to existing profiles.

## Routes and permissions

- Directory: `/dashboard/staff`.
- Profile: `/dashboard/staff/{userID}`. The route uses the **account UUID**, not the staff profile UUID.
- The directory offset is retained in profile and return links, for example `?offset=20`.
- Both routes require an active Admin. Wardens are redirected to their own dashboard without staff reads. The page independently checks the active Admin and clears results on permission/session failures or actor changes.
- Staff management stays active in the sidebar on both directory and detail routes, including the existing mobile navigation.

## Backend contract

| Operation              | Request                               | Successful response                |
| ---------------------- | ------------------------------------- | ---------------------------------- |
| List existing profiles | `GET /api/v1/staff?limit=20&offset=N` | `{staff, limit, offset, has_more}` |
| Read profile           | `GET /api/v1/staff/{userID}`          | Staff profile                      |
| Update profile         | `PUT /api/v1/staff/{userID}`          | Confirmed staff profile            |

The update body contains only `full_name` and `designation`. The profile response includes `staff_id`, `user_id`, `full_name`, `designation`, `email`, `role`, `is_active`, `created_at` and `updated_at`.

The directory supports pagination only, with a fixed page size of 20 and backend offset ceiling of 100,000. No search, filters or global totals are invented. Responses are validated for account/profile UUIDs, timestamps, roles, pagination, uniqueness and the requested identity. Saves also verify both editable values and the existing profile UUID before showing success.

## Editable and read-only data

- Full name: required, up to 200 Unicode code points.
- Designation: required, up to 120 Unicode code points.
- Both fields are trimmed and reject control characters and lone surrogates. Unicode is counted by code point rather than UTF-16 string length; native `maxlength` is deliberately not used as the validation authority.
- Email, account role, access status and IDs are read-only. The page links to User management for account operations.
- Updated timestamps use the device timezone and retain the backend timestamp in a semantic `time` element.
- Historical profiles whose account role became Student remain readable if returned by the backend; editing is withheld until the account has a staff role again. A backend `staff_account_required` conflict during editing requires a fresh profile check.

The interface edits existing profiles only. It does not create staff accounts or profiles, delete records, change roles/access, or call the staff self-service API.

## Editing and recovery

Admin can select **Edit profile** directly in a staff directory row or on the profile detail screen. Both entry points use the same protected editor and existing backend update API. Saving from the directory updates the confirmed row while retaining the current page and other profiles.

- Editing opens an accessible native modal and focuses full name. Cancellation restores the invoking control or page heading. Native modal behavior confines keyboard focus.
- Dirty drafts require explicit discard before closing or client-side navigation. Browser unload also warns while dirty, pending or uncertain. Cancel/Escape and duplicate submissions are disabled while a request is pending.
- A confirmed PUT response becomes the detail screen's displayed profile; no optimistic values are treated as saved.
- Known validation failures retain the draft and allow correction.
- Network/server failures or malformed successful responses may mean the save was committed. The draft is locked and **Check current profile** performs GET, never an automatic PUT retry.
- If current saved values match the normalized draft, the confirmed profile is displayed. If they differ, the current saved values are shown alongside the preserved draft so the administrator can review before another save.
- A failed verification keeps the draft locked and permits another GET check. Missing profiles or target-role conflicts require closing/refetching the profile.
- Discarding an uncertain draft does not undo a committed change; the confirmation says so and reloads the profile when staying on that screen.
- Permission/session failures close the editor and hide all staff results. Access verification and sign-out recovery remain available.
- Identity/role changes and unmount abort requests and ignore late results. No staff data is persisted in browser storage.

The backend does not provide revision-based conditional updates, so this UI does not claim to prevent concurrent edits by another administrator. Saved-state recovery shows differing values for review.

## Verification

Local verification completed:

- All 1,921 tests passed across 89 files, including 102 new staff-management tests.
- The focused staff, application navigation and mobile navigation run passed all 127 tests.
- Overall coverage: 96.46% statements, 94.09% branches, 97.51% functions and 98.47% lines.
- The new staff API, editor and page each have 100% line/function coverage; editor/page branch coverage is 93.51% and 88.77%, above the 80% target.
- TypeScript, ESLint, Prettier, production build and whitespace checks passed. The existing production chunk-size advisory remains non-fatal.

Automated API, page and route checks cover validation, pagination, account-ID routing, read-only fields, confirmed updates, unsaved drafts, denied access and uncertain recovery.

Peer review, CI and staging smoke tests remain separate. Before merging, verify the directory and profile routes with authorized development accounts, mobile table scrolling, keyboard modal behavior, browser-back/discard, and role changes made concurrently through User management. No live accounts or backend records are changed by the unit tests.
