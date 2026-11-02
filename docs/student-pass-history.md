# Student pass history

Branch: `feature/student-pass-history` (created from the current
`feature/admin-device-management` checkout).

Open **Student portal → Operations → Pass history** (`/student/passes`). The
read-only page uses GET `/api/v1/me/passes` rather than merging independently
paginated lists. It displays access requests and historical leave records in the
server order, with type and status filters, combined pagination, refresh and
links to original details. Filters and offset stay in the URL for back navigation.

Used access approvals remain Approved with an additional Used badge and scan
consumption timestamp. Going Home declarations are excluded by the backend.
Reading history does not change presence, consume permissions or make decisions.
No submission, approval, rejection or cancellation actions are added to this page.

The request sends only `type`, `status`, `limit` and `offset`. Student ownership is
derived by the backend from authentication. Returned rows are also checked against
the student profile already loaded by the portal. Cross-student or inconsistent
rows invalidate the whole response. `(type, source_id)` is the item key, because
source IDs can be equal across the two tables.

Session/setup/role failures clear the feed and invalidate the portal. A missing
or archived student profile is reported as unavailable for this account. Stale
requests are aborted when filters, account, profile or page change.

The original leave read path also recognises cancelled historical records and
shows their cancellation timestamp. No new cancellation operation is introduced.

Backend requirements: combined-pass-history route and existing migration 28 or
later. No new database migration/configuration is introduced by this frontend
feature. Deploy/restart the backend with the route before testing the feature.

Automated checks cover API contracts, ownership, type-specific metadata, statuses,
invalid filters, mixed pagination, read-only UI, original-record links, used
approvals, cancellation history, access rejection and request cleanup. Live
backend acceptance is separate from these local automated checks.
