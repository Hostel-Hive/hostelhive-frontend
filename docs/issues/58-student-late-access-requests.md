# [DDP-#58] feat(student): add early-exit and late-entry requests

## Objective

Let students request permission for an early exit or late entry and track staff
decisions using the existing backend APIs.

## Scope

- Add Access requests to the student sidebar, with list, submission and detail pages.
- Submit a direction (OUT early exit or IN late entry), future expected time and
  required reason of up to 1000 Unicode characters.
- Show only owned requests, with status filters, pagination, decisions and notes.
- Display backend-reported permission use when present, keeping the recorded
  approved/rejected status unchanged.
- Preserve failed values, prevent duplicate submissions and retry uncertain writes
  with the same request ID and exact normalized payload.
- Handle navigation warnings, loading, empty states, invalid policy times,
  conflicts, expired sessions, denied access and retries.
- Support keyboard navigation and narrow screens.

## Boundaries

Frontend only; reuse the authenticated request helper and existing
`/api/v1/late-access-requests` POST, list GET and detail GET routes.
The backend derives ownership and decides whether the movement requires permission
using its configured hostel timezone and policy. No hardcoded client policy,
cancellation, editing, staff decisions, database changes or scanner operations.
Approval does not record attendance, change presence or unlock a door.
Ticket #52 remains pending its profile write APIs.

## Acceptance criteria

- [x] Students can submit early-exit and late-entry requests.
- [x] List, status filters, pagination and details show only owned requests.
- [x] Decisions, rejection notes and recorded use are displayed correctly.
- [x] Validation and backend policy rejection messages are clear.
- [x] Failed/uncertain submissions retain values and prevent duplicate creation.
- [ ] Navigation protection and keyboard/mobile layouts work.
- [x] Targeted tests, focused coverage, lint, formatting and build pass.
- [ ] Live acceptance and peer review are recorded.

This local description does not create or update a GitHub issue.

Automated verification: 374 targeted tests passed across the student portal,
student auth/app routes and existing staff access-request screens, including 67
new access tests. Focused coverage for the four new API/UI files: 97.32% lines,
94.09% statements, 93.75% branches and 96.61% functions. Type checking, lint,
formatting and production build passed. The full repository suite, live account
acceptance and peer review remain pending.
