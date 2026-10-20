# Student dashboard

After student sign-in at `/login`, `/student` displays the authenticated student's
profile, guardian contact details, current accommodation and last recorded presence.
The dashboard uses the existing HostelHive fonts, colours and compact dashboard
typography, with page navigation that wraps above the content on narrow screens.
Student pages use separate routes:

- `/student`: overview, recorded presence and links to student pages.
- `/student/profile`: personal, contact, guardian and photo details.
- `/student/accommodation`: the current block, room and bed.
- `/student/qr`: on-demand private QR display and download.

The sidebar highlights the current hostel page. The bottom account menu contains
My profile and Sign out; on mobile it remains available below the navigation.
On desktop, the sidebar stays below the sticky header while content scrolls;
short viewports allow scrolling inside the sidebar to reach all account controls.
See [ticket #53](issues/53-student-account-menu-navigation.md).

Direct links and browser history use the same protected student route guard.

## Backend contracts

All reads use the existing authenticated request helper with a current Firebase
Bearer token, no-store caching, timeouts and request cancellation. The backend
derives the student from the verified identity. No student/user ID, body or query
parameters are submitted to these endpoints:

- `GET /api/v1/me/student-profile`: profile, guardians, nullable current allocation,
  nullable private photo route and IN/OUT/UNKNOWN presence from one snapshot.
- `GET /api/v1/me/student-profile/image`: normalized private PNG/JPEG bytes.
- `GET /api/v1/me/qr`: private PNG QR. The backend may issue its stable identifier
  on first retrieval; this does not create an attendance scan.

The frontend validates response shapes and image content types/signatures. It uses
the fixed authenticated image endpoint rather than public R2 URLs or arbitrary
URLs from response data. No image tokens, R2 keys or payload IDs appear in URLs.
No backend or database files are changed by this frontend work.

## Behaviour

- Null accommodation displays an unassigned state; missing guardians and photo
  have explicit empty states. UNKNOWN means no presence record, not outside.
- Presence is the last scanner state, not a live location or access permission.
  Times use the device timezone. Refresh dashboard re-reads the snapshot and
  clears the previous private images and allocation while loading.
- Photos load only when the backend reports a photo; failures can be retried.
- QR images are retrieved on demand, with duplicate reads prevented. They can be
  hidden, refreshed and downloaded after decoding. Changing to a hidden tab clears
  the image and cancels pending reads; returning does not reveal it automatically.
- Object URLs are revoked on removal/unmount. Request aborts prevent late data
  from appearing after account changes, refresh, hiding the QR or logout.
- Missing/archived profiles, denied access, expired sessions and service failures
  have separate states. Access denial from photo/QR reads clears the private
  profile cards and offers account verification/sign-in. A new setup requirement
  is handled by the existing session verification and setup guard.
- Student self-edit, photo upload, allocation changes, attendance history and
  request submission screens are outside this change.

## Verification

Automated tests cover endpoint ownership, malformed responses, nullable data,
authorization errors, retries, snapshot refresh, image decode failures, QR visibility,
download links, cancellation, account changes and URL cleanup. Authentication tests
continue to check that staff and pending-setup accounts cannot enter the dashboard.

Live acceptance and peer review remain to be recorded with approved test accounts:

1. Sign in with a linked student and compare profile/guardian/allocation values
   with staff records. Check another student sees only their own information.
2. Test an unallocated student and a student with no scan history/photo.
3. Show/download/hide the actual QR, switch tabs and return, and verify the scanner
   can identify the student. Merely displaying the code must not change presence.
4. Load an actual R2-backed photo through the authenticated own-photo route.
5. Change a bed allocation or record a scan, refresh, and confirm the new snapshot.
6. Check revoked/inactive accounts, lost connectivity, keyboard navigation and
   320px/375px desktop layouts. Backend data and real scanner/image delivery are
   not established by mocked tests alone.
