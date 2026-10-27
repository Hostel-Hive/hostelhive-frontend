# Live staff attendance — ticket #73

## Use

Open `/dashboard/attendance` as Admin/Warden and choose **Enable live updates**.
Since tickets #75/#77, both role overviews link to Attendance instead of embedding
the full presence/live controls. Manual refresh remains available. Incident views
and historical reports remain deliberate reads; this feed covers the current
presence dashboard.

The feed carries aggregate counts and a revision, with no names, profile IDs,
contacts, credentials or scan history. The frontend uses its version as a signal
to reload authorized counts and presence rows with the current applied search,
status and page. It does not sum page rows, overwrite searched counts with global
projection counts, or infer physical location. Background refresh keeps the
previous rows visible until its result arrives, without moving focus. A failed
REST refresh shows its normal error/retry controls; a connected feed alone does
not prove that the displayed rows are up to date.

Updates within 1.5 seconds coalesce. Reconnection requests a fresh REST read even
when the revision is unchanged. Older/equal revisions do not overwrite newer
ones. Filter changes/manual refresh retain their existing behavior, including
manual refresh returning to page 1.

## Backend/Firebase contract

Read-only inspection verified the existing backend registration, service,
repository and `docs/attendance-realtime.md` on 21 October 2026:

- `GET /api/v1/attendance/realtime/status`, active Admin/Warden only, no query/body.
- `POST /api/v1/attendance/realtime/session`, same authorization, empty body.
- The grant returns a Firebase root URL, `hostelhive/attendance`, expiry and renewal interval.
- Currently grants last five minutes and renew after 120 seconds.
- Projection fields: safe integer version, epoch-millisecond timestamps and total/IN/OUT/UNKNOWN counts.
- Backend publishes a heartbeat every 60 seconds; intermediate versions may coalesce.
- PostgreSQL and authorized HTTP APIs remain authoritative.

The client uses the existing Firebase Auth app and current UID. It subscribes only
to the returned attendance path and Firebase's `.info/connected` node. It does not
read staff grant paths or write to RTDB. Root HTTPS Firebase domains/path, expiry,
metadata and aggregate counts are validated; provider bodies are not shown.
The existing `firebase` dependency supplies the dynamically imported database SDK;
no dependency or lockfile changes are needed.

This feature currently owns this app's RTDB connection. Cleanup detaches all
listeners and takes that database connection offline. Coordinate ownership if
another frontend feature later shares the same Firebase database instance.

The implementation follows Firebase's official
[listener and unsubscribe API](https://firebase.google.com/docs/database/web/read-and-write)
and [database connection API](https://firebase.google.com/docs/reference/js/database).

## Lifecycle and failure behavior

- Explicit enable/disable, scoped to this mounted dashboard; no browser storage.
- Grant renewal at the backend-provided interval, plus a hard expiry timeout.
- Publication status checks every 30 seconds; no overlapping status reads.
- Connecting, first-publication waiting, connected, reconnecting and stale labels.
- A publication over 90 seconds old is stale. Times use device timezone. Keep
  browser/backend clocks synchronized; projections far ahead of the browser
  clock are rejected rather than presented as fresh.
- Delayed publication and pending grant synchronization are displayed separately.
- SDK reconnect may proceed within a valid grant; SDK cancellation, grant renewal
  failure or health-check failure stops the lifecycle and offers explicit reconnect.
- A generic feed failure also triggers an authorized REST refresh to discover
  account/access changes. API 401/403 hides private results and offers account
  verification/sign-in. No anonymous fallback exists.
- Hidden tab/offline: listeners, timers and HTTP requests stop. Return mounts a
  fresh lifecycle and grant. Navigation, disable, UID/role changes and access loss
  also stop work; late results are ignored.
- Existing rows are read-only snapshots, not a location guarantee. No attendance
  edits, simulated scanner events, incident resolution or student live feed.

## Development setup and live acceptance

No new frontend environment variables or service-account credentials are required.
The existing Firebase sign-in configuration must match the backend project.
The backend requires its existing `RTDB_ENABLED=true`, `FIREBASE_DATABASE_URL`,
service-account permissions, matching applied migrations and published restricted
RTDB rules. See the backend's realtime guide for setup; this ticket neither
changes those settings nor applies migrations. With realtime disabled, the UI
explains that manual refresh is available.

Pending live checks:

1. Enable as Admin and Warden, verify projection and authorized counts in a quiet
   development environment. Confirm Student cannot request a staff grant/read.
2. Use an existing authorized scanner test fixture, then verify rows refresh
   with filters/page preserved. Do not fabricate scanner events in this UI.
3. Disconnect/reconnect, hide/restore the tab, disable/re-enable live updates,
   and navigate away. Check network/listener activity stops and reconnects.
4. Verify grant renewal/expiry, backend disabled/outage, stale publication,
   denied RTDB rules and dedicated test-account revocation. Do not use the last Admin.
5. Check keyboard activation/focus, narrow-screen wrapping and screen-reader status.

Automated checks cover API validation, authenticated SDK wiring, initial/repeated
publications, reconnects, coalescing, stale data, grant renewal/hung expiry,
disabled/error/denial states, abort/late completion, hidden/offline cleanup,
applied filters/pagination, focus preservation and private-result removal.
Live Firebase acceptance and peer review remain pending.

### Automated verification — 21 October 2026

- Full suite: 1,651 tests across 79 files passed, including 98 new tests for this ticket.
- Coverage gates passed: 96.22% statements, 93.98% branches, 97.23% functions, 98.32% lines.
- TypeScript project build and ESLint passed.
- Default Prettier check passed for all changed/new ticket files; repository check
  also passed with Windows line endings handled using `--end-of-line auto`.
- Vite production build passed. The existing main-chunk size advisory remains;
  the database SDK is a separate dynamic chunk.
- `git diff --check` passed.

No backend/database/provider configuration was changed, and no live scanner,
Firebase rules, revocation or browser file acceptance was inferred from mocks.
