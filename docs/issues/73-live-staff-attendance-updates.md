# [DDP-#73] feat(attendance): add live staff attendance updates

## Description

- Connect Admin/Warden attendance dashboards to the existing authorized Firebase feed.
- Refresh backend counts and student lists on version changes and reconnects.
- Preserve applied search, status, page, visible results and keyboard focus during live refresh.
- Display connection, publication freshness, delayed delivery and disabled-service states.
- Renew staff grants while the page is visible and online; stop on expiry or access loss.
- Detach listeners, abort reads and clear timers on pause, navigation and account changes.
- Include responsive controls and automated checks for renewal, retries and cleanup.

Boundary: frontend only, read-only attendance. No manual attendance editing,
simulated scans, RTDB writes, student identity projection, new backend endpoints,
database migrations or Firebase rules changes.

## Implementation

Branch: `feature/73-live-staff-attendance-updates`.

The Admin/Warden dashboards and `/dashboard/attendance` include an opt-in Live
updates control. The default remains manual refresh. Opt-in is scoped to the
mounted dashboard and is not persisted across navigation or accounts.

Uses the existing staff session/status endpoints and the existing signed-in
Firebase app. The returned root/path are validated. Publications trigger
authorized REST reads rather than replacing filtered counts with global Firebase
counts. Initial connection and reconnect both refresh; bursts coalesce over
1.5 seconds. Background reads preserve current rows until completion and do not
move keyboard focus. API denial removes private results.

Grant renewal follows the returned interval (currently 120 seconds); a separate
expiry timer stops the feed even if renewal hangs. Backend health is checked
every 30 seconds while active. A publication older than 90 seconds is labeled
stale; the backend's normal heartbeat is 60 seconds. Hidden/offline tabs stop
the lifecycle; return starts a new authorized session. SDK failures stop reads
and offer explicit reconnect, with an authorized REST refresh to detect access
loss. There is no anonymous fallback or automatic retry loop after failure.

## Verification

1,651 tests across 79 files passed, including 98 new ticket tests. Coverage gates,
TypeScript, ESLint, formatting and production build passed.

Automated results are recorded in `docs/live-staff-attendance.md`. Real Firebase
rules, configured backend publication, browser reconnect/revocation behavior,
and keyboard/narrow-screen acceptance must be checked against the team's live
development setup; mocked tests do not establish those outcomes.

This local issue document does not create or update a GitHub issue or project.
