# Issue #41: feat(late-access): add staff early-exit and late-entry review

## Objective

Build staff review of early-exit and late-entry requests using existing backend APIs.

## Scope

- Admin and Warden can browse requests with status/student filters and pagination.
- Show student reference, movement direction, expected time, reason and recorded decision.
- Show backend-provided permission-use metadata when present, separately from decision status.
- Approve or reject pending requests with explicit confirmation.
- Require a nonblank rejection note; validate notes up to 1000 Unicode characters.
- Preserve failed drafts, prevent duplicate submissions, and require a fresh status check after conflicts or uncertain saves.
- Handle loading, empty results, missing resources, session expiry, denied access, service failures and retry.
- Preserve list filters through detail/back navigation and refresh after decisions.
- Display dates with an explicit browser-local timezone.

## APIs

- GET /api/v1/late-access-requests
- GET /api/v1/late-access-requests/{lateAccessID}
- POST /api/v1/late-access-requests/{lateAccessID}/decision

## Permissions and boundaries

- Active Admin/Warden can view and decide; backend authorization is authoritative.
- Frontend changes only; use features/late-access and the existing authenticated transport/shared controls.
- Student submission, notifications, incidents, exports, cancellation, editing and deletion are excluded.
- Do not hard-code hostel curfew policy; backend eligibility and direction-specific rules remain authoritative.
- Approval does not record attendance/presence, mark permission used or operate a scanner/gate.
- Permission consumption is server-provided history and does not replace approved/rejected status.
- No backend, provider configuration, migration or database changes.

## Acceptance criteria

- [ ] Admin/Warden can browse filtered, paginated requests and open details.
- [ ] Direction and expected movement time display correctly with timezone.
- [ ] Existing consumption metadata displays without fabricated movement history.
- [ ] Pending requests can be approved/rejected after confirmation.
- [ ] Rejection requires a note; notes respect the backend character limit.
- [ ] Finalized requests do not offer decision controls.
- [ ] Validation failures preserve input; duplicate writes and blind retries are prevented.
- [ ] Conflicts/uncertain outcomes require successful status recheck before resubmission.
- [ ] Authorization loss removes private details and drafts.
- [ ] Keyboard, narrow-screen, loading, empty, error and retry states work.
- [ ] Tests, coverage, lint, formatting and production build pass.
- [ ] Live acceptance, passing remote CI and peer review are recorded.

## GitHub setup

Repository: Hostel-Hive/hostelhive-frontend. Add to the development project with Phase = Development and Status = To Do, then In Progress when starting.

Branch: feature/41-late-access-request-management. PR base: develop. Commit body: Refs #41.

This file is a ready-to-paste issue draft; it does not create or update a GitHub issue or project item.
