# Student early-exit and late-entry requests — #58

Access requests in the student sidebar opens the owned list. Protected list, new
and detail routes use `/student/late-access-requests`, `/new` and `/:lateAccessID`.
Students select OUT (early exit) or IN (late entry), enter a future expected date
and time and give a reason of up to 1000 Unicode characters.

## Backend flow verified

- `internal/modules/lateaccess/late_access_routes.go`: Student-only submission;
  Student/Admin/Warden list/details; Admin/Warden-only decisions.
- `dto/late_access_requests.go`, `service/late_access_service.go`: accepted fields
  are `request_id,direction,expected_at,reason`, with a trimmed reason and RFC3339
  timestamp normalized to UTC microseconds.
- `repository/late_access_request_repository.go`: derive ownership from the
  verified UID, recheck eligibility transactionally and require a future movement
  that needs permission under `domain.Policy.RequiresPermission`.
- Exact request ID/payload retries return the original record before time/policy
  validation, even after the expected time. Changed payloads conflict. A different
  UUID for the same student/direction/time conflicts while pending or approved;
  this is not the interval-overlap rule used by leave requests.
- List/detail reads are scoped to the owning student. Foreign detail is 404 and
  attempts to expand ownership are 403. Pagination uses backend totals/has_more.

Default policy is OUT before 06:00, IN at/after 20:00 or overnight before 06:00,
in Asia/Colombo. These are server defaults, not frontend validation constants.
The backend does not expose a policy endpoint. The frontend therefore validates
date syntax, future time, direction and reason, and explains backend 400 policy
rejections without guessing configured deadlines or assuming device/hostel time
zones are the same. The form labels the device timezone and submits UTC instants.

## Frontend behaviour

- Reuse the authenticated request helper, shared late-access response validator
  and existing portal request styles. No new packages or environment settings.
- POST sends only the four accepted fields. List GET sends limit=20, offset and
  optional status; detail GET has no query or body. The loaded profile ID verifies
  returned ownership locally and is never submitted as an owner selector.
- Sanitize student view models: retain request details, decision data and optional
  consumed_at; omit account/staff identities and consumed scanner/device/event IDs.
- Display consumed_at as recorded use separately from the approved status. Do not
  invent completed/expired statuses, assume no use means valid permission, infer
  current location, record a movement or claim approval unlocks a door.
- Apply status filters and refresh at page 1. Pagination and retry retain the
  applied status; pending reads clear stale rows and disable duplicate controls.
- Generate a UUID only for new submissions. A network/server failure or unverifiable
  acknowledgement locks the payload and offers an exact same-ID retry. Definite
  invalid/conflict/ineligible responses preserve an editable draft. Success replaces
  the form URL with the saved detail; returning to the list fetches current data.
- Protect dirty drafts and uncertain submissions with a navigation modal and
  browser unload prompt. Pending writes cannot be abandoned through the modal.
  Explicitly leaving an uncertain form loses its in-memory retry details; check
  existing requests before submitting another. No draft PII is stored in browser
  storage. Logout and setup/auth redirects remain available.
- Cancel requests on navigation/account changes/unmount and suppress stale responses.
  Session/access/setup errors clear the portal content through existing verification
  controls; missing data, validation, policy conflicts and service failures have
  explicit messages and safe retry paths.
- Use labelled controls, semantic details/lists, live status/error messages,
  keyboard focus management and responsive forms. No edit/cancel/delete or staff
  decision controls. Backend/database/scanner files are unchanged; no migrations.
  Ticket #52 remains pending its separate profile write APIs.

## Verification

Automated checks cover owned request URLs/payloads, both directions, normalization,
date/reason validation, backend policy rejection, idempotency/echo checks, malformed
responses, foreign ownership, recorded use/privacy, status filters, pagination,
retry, navigation/unload protection, duplicate submissions and cancellation.
Router tests cover direct list/new/detail entry and role/setup guards.

Ticket validation passed 374 targeted tests across the student portal, auth/app
routes and existing staff late-access module, including 67 new access-request
tests. Focused coverage of the new API/list/detail/form files: 97.32% lines,
94.09% statements, 93.75% branches, 96.61% functions. Type checking, lint,
formatting and production bundling passed. Checks used reduced Node memory/compiler
settings without changing package or CI configuration. The full repository test
suite was not rerun for this ticket.

Live acceptance and peer review remain pending:

1. Submit early OUT and late/overnight IN with a test student under the configured
   hostel policy; check a daytime/non-permission time is rejected clearly.
2. Test exact policy boundaries and a browser timezone different from the hostel
   timezone. Compare the submitted instant and displayed expected time.
3. Review as staff, refresh as student and compare approval/rejection notes. Verify
   another student cannot read the request, even through a direct detail URL.
4. Retry an interrupted submission and verify exactly one backend request exists.
   Check the navigation warning before abandoning an uncertain request.
5. Verify backend-reported consumed_at is shown without scanner identifiers or
   rewriting approved status. Test more than 20 rows, filters, offline retries,
   keyboard/mobile layouts and session expiry. No presence is changed by the UI.
