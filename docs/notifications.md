# Owned notification inbox

Ticket #66 adds `/student/notifications` and `/dashboard/notifications`, sidebar
links and a header bell with the backend unread count. Students use the student
portal; Admin/Warden use the staff workspace. Sign-in and student setup guards
apply to direct links. The backend also supports Sub-Warden inbox access, but
the current frontend authentication model has no Sub-Warden portal. This ticket
does not extend role provisioning or grant additional roles access.

## Backend contracts verified in source

- `GET /api/v1/notifications?limit=20&offset=0&unread=false` returns
  `items,total,limit,offset,has_more`; `unread=true` filters unread rows. Ordering
  is descending event occurrence time, then notification ID.
- `GET /api/v1/notifications/unread-count` returns `{unread}`.
- `POST /api/v1/notifications/{notificationID}/read` has an empty body and
  returns the matching notification with `read_at`. It is idempotent: the first
  read timestamp is retained on retry.

All calls reuse the authenticated request helper, current Firebase UID/token,
no-store, timeout and abort support. No recipient ID is sent: the backend derives
ownership from the verified account. Its list, count and mark-read checks apply
current role/source visibility as well as recipient ownership. Source resources
use their own authorized detail APIs.

Rows contain a notification UUID, source type and source UUID, event kind, title,
status, occurrence/delivery timestamps and nullable read timestamp. The UI validates
the response shape, matching mark-read ID, source IDs, pagination and counters.
It renders escaped text, without inventing a notification body or loading previews
from other students' records. A source link uses only an existing local route;
arbitrary remote links from data are never used.

## User flow

1. Open Notifications, browse pages of 20 or enable Unread only. Merely loading,
   refreshing, focusing or filtering the list does not mark anything read.
2. Click **Open notification** to intentionally open its event summary and mark
   that notification read. This action does not claim the student read or understood
   the underlying announcement/request.
3. Use **View related …** to visit the current complaint, leave, access request or
   announcement. Existing detail screens handle a missing or inaccessible source.
   Admin/Warden attendance notifications now open the incident detail screen added
   in [ticket #69](staff-attendance-dashboard.md). Students have no staff incident
   route; no unrelated student is selected.
4. Confirmed read changes refresh the inbox from page 1 and re-fetch unread counts.
   In unread-only mode, the opened event can remain in its detail panel while it
   disappears from the unread list. The count is never optimistically decremented.

The bell and inbox counters refresh on window focus, tab visibility return, and
each minute while visible. A same-account, in-memory event refreshes counters
after successful mark-read. There is no persistent browser notification cache,
cross-account event payload, push registration or mark-all-read action. A count
failure shows an unavailable state, not zero. Delivery is asynchronous; refreshing
can reveal newly delivered rows.

## Recovery and privacy

Loading, empty results, beyond-end pages, service failures and retries have explicit
states. An uncertain read outcome preserves the opened notification and retries
the same idempotent operation. Duplicate clicks are blocked during the request.
A missing notification asks for inbox refresh; read confirmation remains separate
from a subsequent failed list refresh. Session, setup and denied-access errors
clear the private inbox and offer account verification or sign-in.

Account/role changes reset keyed state; stale fetches/writes are aborted and late
results ignored. Unmount removes polling, focus/event listeners and pending
requests. The header independently hides failed count results. The existing app
authentication lifecycle remains authoritative for session verification.

Lists reflow at narrow widths. Filter/action buttons work by keyboard, opened
details receive focus and pagination returns focus to the results region. Times
are explicitly displayed in the device timezone.

## Validation

Automated coverage includes API contracts and malformed responses, all source
routes, ownership-oriented request shape, role/setup route guards, read retries,
duplicate clicks, filters/pagination, access-loss cleanup, account switches,
stale results, polling and listener removal. See the ticket record for check results.
Live acceptance against a running backend, narrow-screen/keyboard walkthrough and
peer review are pending. No backend/database changes are included.
