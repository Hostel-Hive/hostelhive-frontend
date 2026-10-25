# Admin invitation management

Open **Students → Invitations** (`/dashboard/students/invitations`). This is an
Admin-only page and route. Wardens and Students cannot access the management API.

The directory displays email delivery and account setup separately, with bounded
pagination and a manual refresh that returns to page one. Review an invitation
to check current metadata, attempts, timestamps and safe delivery error categories.
Sent means the provider accepted a send request; it does not prove inbox receipt.

Resend requires explicit confirmation. Pending delivery and completed setup do
not offer a new resend. The UI observes five minutes since the last request and
honours the server's Retry-After response; backend eligibility remains authoritative.
Archived/inactive/wrong-role accounts can be rejected even when their eligibility
is not present in list metadata.

Each intended resend uses a new UUID. Network/server/response uncertainty keeps
that UUID for an explicit identical retry. No mutation is retried automatically.
Checking current metadata does not prove which operation was accepted, so it does
not discard an uncertain operation ID. Closing an uncertain dialog refreshes the
list and explicitly directs the Admin to check it before starting another resend.
No action links, passwords or request IDs are written to browser storage.

Endpoints:

- GET `/api/v1/student-invitations?limit=20&offset=0`
- GET `/api/v1/student-invitations/{invitationID}`
- POST `/api/v1/student-invitations/{invitationID}/resend`, JSON containing only
  `{ "request_id": "NEW_OPERATION_UUID" }`

Use backend code/migrations containing student invitation support. Email delivery
also requires its invitation worker and Firebase email configuration. This UI does
not start the worker or guarantee delivery. No backend changes are required.

Automated tests cover endpoint contracts, Admin-only routes and controls, fresh
detail reads, confirmation, cooldowns, exact retries, denied access, malformed
responses, pagination and abort/duplicate-click protection. Live email delivery
must be checked separately in the intended deployment.
