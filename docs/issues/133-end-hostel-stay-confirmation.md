# #133 — End hostel stay confirmation

## Scope

An active Admin can select **End hostel stay** from a current student profile.
Wardens and other roles do not see the action. The server remains authoritative
for permissions and account eligibility.

The dialog loads the current allocation using the existing student-filtered
allocation endpoint before enabling confirmation. It shows the bed identifier
returned by that contract; no block/room names are invented. Loading failures
block submission and offer recovery. Students without beds and inactive student
accounts remain supported.

The form requires a departure reason, an explicit deactivate/keep-access choice
and a permanent-departure confirmation. Notes are optional, up to 1,000 characters.
Keeping access never reactivates an inactive account. Temporary trips home and
access suspensions must not use this workflow.

## API and retry contract

`POST /api/v1/students/{studentID}/checkout` receives the original request UUID,
reason, notes, `deactivate_account` boolean and `confirmed: true`, using the current
Admin Firebase token. There is no automatic mutation retry.

An unconfirmed result locks the original payload and exposes **Retry same checkout**.
Closing/reopening on the same profile keeps that payload and operation UUID;
the action becomes **Resume checkout**. Navigation/reload warns while the outcome
is pending or uncertain. Requests abort and operation state is discarded when
the component/account/role changes. No credentials, operation details or form
notes are persisted to browser storage.

Response validation binds the student, user, request, reason, notes and account
choice to the submitted operation and validates identifiers, timestamps and bed
release consistency. Invalid/mismatched responses remain unconfirmed. Session,
authorization, eligibility, conflict and already-ended errors do not silently
start a new operation.

## Receipt and refresh

The confirmed receipt displays the actual released bed, account state after the
checkout and completion time. Pending Firebase revocation is shown explicitly;
local denial is already effective when deactivation was requested.

A replay is labelled **Original checkout confirmed**. It is historical, and must
not be presented as a new checkout of a later restored stay. Directory navigation
fetches fresh current/archived records and discards stale profile/accommodation
panels. Search/faculty/year filters are retained and pagination resets.

Allocation history recognizes `end_reason: checkout` and displays **Hostel stay
ended**. Existing assignment, transfer, revocation, archive and restore controls
remain separate. Lifecycle action clarification is a separate ticket.

## Dependency and verification

Backend #132 and migration 32 are required. Restart the local backend after
updating it. Production migration/deployment are separate from local implementation.

Tests use mocked APIs and never check out real students or revoke real sessions.
They cover authenticated requests, malformed responses, role restrictions, current
bed loading, no-bed/inactive-account departures, required choices, safe retries,
closing/reopening an uncertain operation, duplicate prevention, cancellation,
reload warnings, unmount cleanup, result receipts and checkout allocation history.
Run the existing Vitest, lint, TypeScript and Vite production build checks.
