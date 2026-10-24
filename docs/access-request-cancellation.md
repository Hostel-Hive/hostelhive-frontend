# Pending access-request cancellation

Students can withdraw their own pending restricted-hours access request from its
details page. A confirmation dialog explains that the record stays in history
and recorded attendance is unchanged. Approved, rejected, cancelled and consumed
requests have no cancellation action. Admin/Warden screens retain cancellation
history and never offer approval/rejection for a cancelled record.

The client sends an empty POST to
`/api/v1/late-access-requests/{lateAccessID}/cancel`. Ownership is enforced by the
backend using the authenticated account. The frontend verifies the response's
request ID, student ID, cancellation timestamp and actor ID before showing success;
the student projection omits actor IDs. Repeated cancellation is idempotent under
the existing backend contract. No backend or database change is required.

Confirmation is disabled while the operation runs. An uncertain response or a
decision conflict triggers a current-record read, rather than an automatic write
retry. If that read fails, the dialog offers a status check. Closing it also
reloads the detail before another cancellation attempt is available. Account
denials propagate to the portal's access handler; navigation/unmount aborts the
pending request and ignores stale responses.

Cancelled status is supported by student/staff list filters, response validation,
badges and details. Legacy response records without cancellation fields remain
compatible; cancelled records require valid cancellation audit fields. This does
not enable cancellation of retired ordinary leave requests.

Automated checks cover empty-body transport, ownership/response validation,
confirmation/dismissal, duplicate clicks, terminal states, decision conflicts,
uncertain outcomes and access denial. Live acceptance with dedicated Student and
Admin/Warden accounts remains to be performed against the deployed backend.
