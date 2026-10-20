# [DDP-#56] feat(student): add leave requests and status tracking

## Objective

Let students submit leave requests and track hostel staff decisions using the
existing backend leave APIs.

## Scope

- Add Leave requests to the student sidebar, with list, new-request and detail pages.
- Submit future start/end dates and a required reason of up to 1000 characters.
- Browse only the signed-in student's requests, filter by status and paginate.
- Display pending, approved and rejected states, decision times and notes.
- Prevent duplicate submissions; retain the same request ID and exact payload
  when retrying an unconfirmed submission.
- Preserve failed form values, protect unsaved drafts on navigation and handle
  loading, empty results, invalid input, conflicts, denied access and retries.
- Use accessible controls and responsive layouts.

## Boundaries

Frontend only. Reuse the authenticated request helper with `POST /api/v1/leaves`,
`GET /api/v1/leaves` and `GET /api/v1/leaves/{leaveID}`. Ownership comes from the
backend identity; do not send a student ID in list queries or submission bodies.
No cancellation, editing, staff decisions, database changes or presence updates.
Backend profile write APIs for ticket #52 remain a separate dependency.

## Acceptance criteria

- [x] Students can submit valid leave and see its recorded status.
- [x] Only owned requests appear in the filtered, paginated list and details.
- [x] Staff decision notes and rejection reasons are clear.
- [x] Failed and uncertain submissions preserve values and avoid duplicate creation.
- [x] Validation, navigation protection, loading, empty/error/retry states work.
- [ ] Keyboard and narrow-screen layouts work.
- [x] Targeted tests, focused coverage, lint, formatting and build pass.
- [ ] Live acceptance and peer review are recorded.

This local ticket description does not create or update a GitHub issue.

Validation: 286 targeted tests passed across the student portal, staff leave,
student auth entry and app routes, including 61 new leave tests. Focused coverage
of the new API/list/form/detail code: 97.32% lines, 94.11% statements, 93.53%
branches, 96.61% functions. Type checking, production bundling, lint and formatting
passed. The full repository suite and live browser acceptance were not run.
