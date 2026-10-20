# Student leave requests — #56

Students use Leave requests in the portal sidebar. The list, new form and details
have protected URLs: `/student/leaves`, `/student/leaves/new` and
`/student/leaves/:leaveID`. Staff continue to use the existing operations module.

## Backend workflow checked

- `internal/modules/leave/leave_routes.go`: POST requires Student; list/details
  allow Student, Admin and Warden; decision POST is Admin/Warden only.
- `dto/leave_requests.go` and `service/leave_service.go`: submission contains
  `request_id,starts_at,ends_at,reason`. Dates are RFC3339 instants; the reason is
  trimmed, required, limited to 1000 Unicode characters and excludes unsupported
  control characters. End must follow start.
- `repository/leave_request_repository.go`: the verified identity owns the request;
  future starts and active student eligibility are enforced on submission. Pending
  and approved periods cannot overlap. Matching retries with the same request ID
  and exact normalized payload return the existing record, even after its start.
- The repository scopes student list/detail reads to their own profile; another
  student's detail is concealed as 404. Ownership cannot be expanded by the UI.
- Backend cancellation, editing and deletion routes do not exist. Student controls
  never call staff decision endpoints or claim those unsupported operations.

No backend/database changes are made. Ticket #52 remains pending its profile write
APIs. Leave approval does not change attendance or recorded presence.

## Frontend contracts and handling

Use the existing authenticated request helper with current tokens, no-store cache,
timeouts and cancellation. List GET sends only limit=20, offset and optional status.
POST sends only the four supported submission fields. The loaded profile ID is used
to verify returned ownership locally, never to select an owner in the API request.
Reuse the shared leave shape validator; strip account/staff identity fields from
student view models. Verify response metadata, IDs, status and submission echoes.

Dates entered with datetime-local are in the device timezone, explicitly shown in
the form. Convert them to UTC RFC3339 instants for the backend. Reject impossible
calendar values, daylight-saving gaps, past starts, reversed intervals and invalid
reasons. Do not add a maximum duration or other policy absent from the backend.
Displayed dates use the existing timezone-labelled LeaveDate component.

Apply status filters and Refresh at page 1. Use backend totals and has_more for
pagination. Empty or beyond-end pages have explicit messages; failures support
retry. New reads hide stale records. Identity changes, navigation and unmount cancel
requests and suppress late results. Account/session/setup denial delegates to the
portal's account verification flow and clears private content.

Submission generates a UUID only for a new attempt. Duplicate clicks are blocked.
Definite validation/conflict/ineligibility responses preserve an editable draft.
Network/server failures and unverifiable acknowledgements retain the exact payload
and ID, lock its fields and offer Retry same request. An exact retry does not
repeat the future-start validation, because an existing saved request may now have
started or been decided. The backend remains authoritative.

Submission context is held in memory, not local/session storage. Navigation protects
dirty drafts and unconfirmed submissions with a modal; pending writes cannot be
abandoned through that modal. Closing/reloading the tab receives the browser's
unsaved-work prompt. Explicitly leaving an unconfirmed form loses its retry context;
the warning says to check existing leave requests before submitting again. Logout
and setup/auth redirects are allowed, and old requests are aborted on unmount.
Success replaces the form URL with the saved request detail; returning to the list
fetches current backend data. Failed submissions retain the entered dates/reason.

## Verification

Automated tests cover owned API parameters, time/reason validation, normalization,
backend response validation, safe error mapping, cross-student denial, idempotent
submission/retry, filters, pagination, details, decisions, duplicate clicks,
navigation/unload protection, cancellation and late results. Router tests cover
student list/new/detail entry and role/setup guards.

Ticket validation passed 286 targeted tests across the student portal, existing
staff leave, student entry and app route tests, including 61 new leave tests.
Focused coverage for the four new API/UI files is 97.32% lines, 94.11% statements,
93.53% branches and 96.61% functions. Type checking, production bundling, lint and
formatting passed. System memory pressure required serial checks with reduced
Node compiler-memory settings; no package or CI configuration was changed. The
full repository test suite was not rerun for this ticket.

Live acceptance and peer review remain pending with approved test accounts:

1. Submit future leave as Student A, verify staff can review it, approve/reject it,
   then refresh student details and compare status/note/timestamps.
2. Verify Student B sees none of A's requests, including by directly entering A's URL.
3. Try blank/long reasons, reversed/past dates, overlapping pending/approved leave
   and a profile no longer eligible to submit. Check failed values are retained.
4. Interrupt a submission response, retry the unchanged request and verify exactly
   one backend row exists. Test navigation warnings and sign-out during a request.
5. Exercise keyboard/mobile layouts, empty lists, status filters, more than 20 rows,
   service failures and account expiry. Confirm presence remains scan-based.
