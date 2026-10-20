# Student attendance and movement history — #54

Students open **Attendance** from the portal sidebar or `/student/attendance`.
The existing student guard handles authentication, role checks and required setup.
The profile snapshot supplies the account menu; history loads only on this page.

## Backend flow

The implementation follows the read-only backend attendance module:

1. `attendance_routes.go`: `RegisterStudentHistory` protects
   `GET /api/v1/me/attendance/events` with authentication and Student role.
2. `student_attendance_history_handler.go` parses a body-free GET with known
   query fields only. The service validates ranges using the hostel timezone.
3. `student_attendance_history_repository.go` resolves the verified Firebase UID
   to an active, unarchived student profile. Counts and rows share a snapshot.
4. The response exposes `items,total,limit,offset,has_more,timezone,from,to`.
   Items contain `movement_id,event_id,direction,occurred_at`. Only recorded
   movements qualify. `movement_id` is the stable key; event IDs can repeat.

The frontend uses the existing authenticated request helper (current token,
no-store cache, abort support and timeout). It never sends a student/user ID,
request body, scanner credentials or a staff endpoint. No backend, migration,
database or R2 changes are made. Ticket #52 stays pending its own write APIs.

## Behaviour

- Start with all recorded movements, newest first, 20 per page. Direction is
  omitted for all movements or supplied as `IN`/`OUT` for Entry/Exit.
- Date filters are optional, paired inclusive `YYYY-MM-DD` dates, years
  0001–9998, at most 366 days including both dates. Impossible/reversed dates
  and unsupported directions are rejected before requesting data.
- Apply and Clear reset to page 1. Refresh resets to page 1 using applied filters;
  draft filters take effect only after Apply. Retry preserves the requested page,
  applied filters and entered values. Pending controls prevent duplicate reads.
- New reads hide prior rows. Navigation, refresh and account changes cancel old
  requests; late completions cannot display old data or invalidate a new account.
- Validate the response shape, pagination consistency, date echoes, supported
  timezone, movement IDs, directions, timestamps and newest-first order. Unknown
  fields are stripped. Missing or malformed responses show a safe retry message.
- Render timestamps with the returned hostel timezone, including calendar dates
  that differ from UTC/device time. Counts describe movements matching filters,
  not days present or attendance percentages. No presence/location/permission is
  inferred, and opening this page does not record a scan.
- Empty history and beyond-end pages have explicit messages. New scans may shift
  offset pages; Refresh returns to the beginning. At the backend offset ceiling,
  ask for narrower filters rather than sending an invalid page request.
- Missing/archived profiles provide administrator guidance. Expired sessions,
  denied access and setup-required responses clear the portal's private content
  and offer the existing account verification/sign-in controls. Service failures
  allow retry without exposing backend response details.
- Semantic tables, date labels, keyboard focus styles, live loading/error/status
  messages and wrapping controls support keyboard and narrow-screen use.

## Verification

Automated coverage includes the owned request URL and parameters, response
validation, date boundaries/leap years, identity-key collisions, timezone display,
filter/pagination/reset/retry behaviour, duplicate prevention, access denials and
cancellation on unmount/account changes. Router tests check Attendance sidebar
navigation and direct student entry; staff remain redirected to their dashboards.

Ticket validation passed 148 targeted tests (student portal, student entry and app
routes), lint, formatting and production build. Focused coverage for the new API
and history component: 100% lines/functions, 97.27% statements, 96.62% branches.
The full repository suite was not rerun for this ticket.

Live acceptance and peer review remain to be recorded with approved test accounts:

1. Sign in as two students and compare each history to its recorded backend events.
2. Verify a known near-midnight scan renders in the returned hostel timezone and
   is included in that local day's date filter. Check Entry/Exit independently.
3. Use more than 20 rows to test Next/Previous, filter reset and Refresh after a new
   scan. Check an empty student and an out-of-range page after data changes.
4. Navigate by keyboard, use mobile width/short desktop viewport, scroll the table
   if needed and confirm sidebar/account-menu behaviour remains intact.
5. Exercise session expiry, denied access, missing profile, offline retry and
   navigation during a delayed request. Confirm no scans or presence are changed.
