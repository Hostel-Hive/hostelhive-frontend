# Staff attendance dashboard and incidents

Ticket #69 introduced backend presence counts and a paginated student list on the
staff dashboards. Tickets #75 and #77 give Admin and Warden dedicated overviews
with compact attendance snapshots. The full presence view remains available at
`/dashboard/attendance`; Attendance in the sidebar remains active on incident pages.

## Routes and permissions

- `/dashboard/admin`: Admin overview; see `admin-overview-dashboard.md`.
- `/dashboard/warden`: Warden operations overview; see `warden-overview-dashboard.md`.
- `/dashboard/attendance`: dedicated presence dashboard.
- `/dashboard/attendance/incidents`: incident list, optionally preselected using
  `?student_id=<profile UUID>` from the presence list.
- `/dashboard/attendance/incidents/:incidentID`: recorded incident detail.

Only Admin/Warden can use these screens. Existing route/session guards and current
backend authorization remain authoritative. Students are redirected to their own
portal; no Sub-Warden or Security portal permissions are added.

## Source-verified API contracts

- `GET /api/v1/attendance/summary`: optional `q` only; returns
  `total,in,out,unknown`. No status or pagination is sent to the summary.
- `GET /api/v1/attendance/students`: `q,status,limit,offset`, with optional fields
  omitted when empty. Search is trimmed, at most 200 Unicode code points, without
  control characters. Status is IN/OUT/UNKNOWN. Page size is 20; offset is bounded
  by the backend maximum of 1,000,000.
- `GET /api/v1/attendance/incidents`: optional `student_id,direction,incident_type`
  plus pagination. Student ID here is the profile UUID; direction is IN/OUT and
  type is late_entry/early_exit. There is no date, resolution or free-text filter.
- `GET /api/v1/attendance/incidents/{incidentID}`: no query/body; returns the
  event identity, direction/type, occurrence time and stored policy values.

Verified against the backend attendance routes, handlers, dashboard/incident DTOs,
services and repositories. Dashboard and incident routes are registered in app
startup. Existing migrations already support this feature; no backend or database
changes are included.

The shared authenticated request helper supplies current Firebase credentials,
UID verification, no-store, timeout and abort support. APIs reject malformed
responses, mismatched IDs, contradictory IN/OUT/UNKNOWN rows, invalid policy data,
duplicate page identities and inconsistent pagination. Summary totals must be
internally consistent; no equality is imposed between separate backend snapshots.

## Dashboard behavior

The summary and presence list cover active student accounts with non-archived
profiles. Both use the applied name/Student ID search. The status filter applies
only to the list, so summary cards continue to show all three status counts within
the search scope. Display values come from the backend, not current page rows.

Apply filters or Refresh attendance reloads both requests together. Refresh returns
to page 1 and keeps the applied filters. Results render after both requests succeed;
if either fails, the group shows an error and Retry attendance reloads both. Draft
filter fields are preserved. The two API calls are separate snapshots and may
briefly disagree while scanner activity changes presence.

The list is ordered by name, Student ID and profile UUID. Student links open the
existing staff profile; View incidents preselects that profile in the incident list.
UNKNOWN means no accepted movement established presence; it never means OUT.
Presence is a retained scanner record, not guaranteed physical location, attendance
editing or a permission to enter/leave. Presence/list times use the device timezone.

## Incident behavior

Incidents are historical scanner movements without matching permission under the
recorded policy. They are not unresolved cases or disciplinary decisions. The list
is ordered newest occurrence first and uses the backend total/pagination.

Details show the recorded hostel timezone, occurrence time in that timezone, exit
opening minute as HH:MM, entry deadline as HH:MM and the saved permission matching
window. These are snapshots from the incident, not current settings. If the browser
cannot format the stored timezone, the fallback explicitly labels device time.
Scanner ID plus event ID identify the original movement. No additional student
directory requests are made to invent a missing name.

Staff attendance notifications now link to these details. Incident references in
the existing per-student scan history also link here. Opening a source detail does
not introduce another notification mark-read request. A missing/inaccessible source
is handled by the detail screen's own authorized read.

## Recovery and accessibility

Loading, empty results, beyond-end pages, validation, missing resources and service
failures have explicit states. Retry never invents zero counts or UNKNOWN records.
Session/access failures unmount private results and offer verification or sign-in.
UID/role/route keyed state and aborted requests discard old-account/old-filter data;
late responses are ignored. Refresh clears the prior data while loading.

Controls are native keyboard-accessible forms/buttons/links. Route headings receive
focus; filters/pagination move focus to the results region when ready. Counts and
detail fields reflow on narrow screens; the presence table allows horizontal scroll.

No manual attendance editing, incident resolution, real-time subscriptions,
simulated scans or provider configuration are introduced. Live backend acceptance,
keyboard/narrow-screen walkthrough and peer review remain pending.
