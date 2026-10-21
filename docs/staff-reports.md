# Staff reports and downloads

Ticket #71 adds Reports to Admin/Warden navigation. These read-only routes use the
existing report APIs and authenticated request helper:

- `/dashboard/reports`: attendance movements.
- `/dashboard/reports/daily`: daily attendance totals.
- `/dashboard/reports/leaves`: leave requests.
- `/dashboard/reports/complaints`: complaints and recorded resolution metadata.

Sign-in and role guards protect direct entry. Students are redirected to their own
portal. Backend authorization remains authoritative; no additional staff roles,
report writes, scheduled jobs or invented statistics are introduced.

## Filters, dates and report meaning

Each screen starts with an empty date form. No report request is made until the
user runs it. Required From/To values are inclusive hostel calendar dates, in order,
at most 366 days, using the backend's supported years 0001–9998. Date-only values
are sent unchanged; the browser does not guess the configured hostel timezone or
convert them into device-local instants. The backend returns the actual timezone
with each report. Timestamps display in that zone, with an explicit device-time
fallback if the browser cannot format a stored zone.

An optional student profile UUID filters each report. It is not the university
Student ID. Empty optional parameters are omitted, and only fields supported by
the selected report are sent:

| Report               | Additional filters                                        | Date basis                               |
| -------------------- | --------------------------------------------------------- | ---------------------------------------- |
| Attendance movements | IN/OUT direction                                          | Recorded movement occurrence             |
| Daily attendance     | IN/OUT direction                                          | Recorded movement's hostel calendar date |
| Leave requests       | pending/approved/rejected/cancelled                       | Request submission time                  |
| Complaints           | maintenance/disciplinary and pending/in_progress/resolved | Complaint submission time                |

Changing report type resets draft/applied filters and private results. Editing form
fields does not change the applied report until Run report is used. Applied dates,
profile and supported filters remain visible with results; downloads use those
applied values. Failed validation and requests preserve entered values.

Pagination requests 20 rows with backend offsets bounded at 1,000,000. The backend
provides rows, total, has_more and the full filtered period summary. Refresh returns
to page 1. Each request is a fresh snapshot, so later pages/refreshes can reflect
subsequent changes.

Attendance includes only accepted recorded movements, not ignored attempts. Legacy
permission metadata remains unspecified, never inferred approved. Daily reports
include every date, including zero-activity dates. Their total is a count of dates;
zero movements does not establish absence. The period distinct-student count cannot
be obtained by adding daily distinct-student counts.

Leave/complaint dates select submissions, not planned leave or resolution dates.
Status reflects current state at the query snapshot, not reconstructed state at the
range's final date. Complaint category/status summaries are independent breakdowns
of the same records. Resolution metadata can be null for legacy resolved records;
the UI does not invent an actor, timestamp or note.

The current local backend includes migration 28 and cancelled leave reporting.
Cancelled records display read-only cancellation metadata without adding any
cancellation action. Their full report fields are available inline; no link is
offered to the older leave detail screen that does not yet support cancellation.
Other resources link to existing authorized detail/profile/incident screens. Confirm
the running backend and database match the source/migrations before live testing.

## API contracts verified in backend source

JSON routes are `GET /api/v1/reports/attendance`, `/attendance/daily`, `/leaves` and
`/complaints` under the same reports prefix. Required query fields are `from,to`;
optional fields are `student_id` and the report-specific filters above. Lists add
`limit,offset`. The UI validates response dates/filter metadata, timezone, totals,
pagination, unique row identities, nullable decision/resolution data and policy
assessment fields. Movement identity uses scanner plus event ID, not event ID alone.
It does not calculate replacement summary statistics from one page of rows.

Each report has an Excel route ending `/export` and a PDF route ending
`/export/pdf`. They take the same applied filters **without** limit/offset. One
server snapshot contains all matching rows or returns an explicit error; exports
are not browser-generated tables or downloaded one page at a time.

## Export workflow and limits

1. Run the desired report, then choose Download PDF or Download Excel.
2. The frontend fetches through the authenticated helper; it never places a token
   in a URL or opens an unauthenticated binary endpoint.
3. A successful response must have the correct PDF/XLSX media type, a nonempty
   body and the expected basic binary signature. JSON error bodies are not saved.
4. A private blob URL supplies an explicit Save PDF/Excel report link. Filenames
   are derived from validated report kind, dates and format, rather than trusting
   arbitrary server-provided filenames. File-ready does not claim a browser save
   has completed.

Excel has a server limit of 5,000 matching rows. PDF has 1,000 rows plus 200-page
and 16 MiB document limits. HTTP 413 asks for narrower filters; 429 explains busy
generation and offers deliberate retry. Service/timeout failures can be retried.
There is no automatic retry loop, partial-file success or silent truncation.
Exports are fresh server snapshots and can differ from previously displayed data.

Duplicate export clicks are blocked. Cancel download aborts the client request.
Changing applied filters, pagination, report type or account, refreshing, clearing
or leaving releases the prepared blob URL. Pending requests are aborted on
unmount; late results cannot create a download for a different account. Report
data, files and credentials are not persisted in browser storage. Already saved
files remain under the user's control.

## Recovery and validation

Loading, empty results, beyond-end pages, validation, route availability, service,
session and access errors have explicit states. Report errors do not invent zero
totals. Export errors preserve an otherwise successful report. Access loss unmounts
private results/downloads and offers verification or sign-in. Account/role keys and
abort checks discard stale reads, exports and prepared files.

Forms, links and actions use native keyboard controls. Results and save links
receive focus when ready. Responsive filters wrap, and wide tables have a keyboard
focusable horizontal scroll region. Content is escaped plain text with preserved
line breaks. The report module is lazy loaded and adds no dependencies.

Automated checks cover APIs, metadata/row validation, date rules, binary exports,
busy/oversize/error states, route permissions, account cleanup and UI interaction.
Live backend/file-open acceptance, keyboard/narrow-screen walkthrough and peer
review remain pending. No backend, database, bucket or provider settings are changed.
