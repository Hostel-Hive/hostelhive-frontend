# [DDP-#66] feat(notifications): add owned inbox and unread tracking

## Objective

Let students and supported staff roles browse their own notifications, see the
unread count and open the relevant hostel resource using the existing backend APIs.

## Scope

- Add protected student/staff inbox routes, sidebar links and header unread badge.
- Support backend pagination and an unread-only filter.
- Display escaped event titles, status and timestamps, with authorized source links.
- Mark a notification read only after an explicit Open notification action.
- Refresh authoritative unread counts after read changes and while the app is visible.
- Handle loading, empty states, missing/inaccessible sources, session/setup/access
  errors, service failures and safe idempotent retry.
- Prevent duplicate submissions and discard private state on account changes.
- Support responsive layouts, keyboard access and automated verification.

## Permissions and boundaries

Frontend only. Admin/Warden use the existing staff portal; students use the student
portal. Backend ownership and current visibility checks remain authoritative.
Sub-Warden support in the backend does not add a new frontend role/portal here.
Security has no inbox access. No browser push, mark-all-read, invented message-body
previews or attendance incident screen are added. Keep student self-edit/photo
mutation work pending until its backend APIs are ready.

## Acceptance criteria

- [x] Supported roles can navigate their paginated owned inbox.
- [x] Unread filter/count use backend data and include independent recovery.
- [x] Explicit opening sends the empty-body, idempotent mark-read request.
- [x] Current-resource links use existing role-specific local routes.
- [x] Attendance incident screen absence is explained without a broken route.
- [x] Uncertain read changes retry the same notification; duplicate clicks are blocked.
- [x] Old-account data, requests, timers and listeners are cleared.
- [x] API, UI, hook and protected-route tests cover the workflow.
- [x] Full suite, focused coverage, type check, lint, format and build pass.
- [ ] Live acceptance and peer review are recorded.

This local issue description does not create or update a GitHub issue.

Branch: `feature/66-owned-notification-inbox-unread-tracking`.

Follow-up #69 adds the staff attendance incident screen and connects staff inbox
source links to it. The original #66 boundary describes its own scope.

Verification: all 1352 tests pass across 68 files, including 82 new notification
tests across four files. The focused run
including existing app and student-portal checks passes all 122 tests.
Coverage for the four new production files is 100% lines, 97.75% statements,
96.9% branches and 100% functions. Type checking, lint, production build and
repository formatting with Windows line-ending handling (`--end-of-line auto`)
pass. Live acceptance and peer review remain pending. The existing nonfatal Vite
bundle-size warning remains.
