# Student profile photo management (#52)

My profile provides Add photo or Change photo. The editor accepts JPEG/PNG,
validates size and decoded dimensions before preview, and uploads only after an
explicit action. Maximums match the backend: 5 MiB, 4096 pixels per axis and
12 million pixels. Removal requires a separate confirmation.

Authenticated requests use only the fixed owned endpoint:

- `PUT /api/v1/me/student-profile/image`: raw file bytes with image Content-Type.
  Require HTTP 200, the expected owned student ID and the owned image API path.
- `DELETE /api/v1/me/student-profile/image`: no request body; require HTTP 204.
- Refresh `GET /api/v1/me/student-profile` after successful writes, then reload
  the authenticated photo with a fresh component instance.

No student/account selector, multipart payload, public storage URL or storage
credentials are sent. Staff image endpoints remain separate. Preview and fetched
photos use private object URLs which are revoked on replacement/unmount. Pending
operations disable duplicate actions and abort on unmount. Authentication/access
failures clear the portal data through its existing access handler.

Unknown write outcomes and failed post-write reads lock further mutations until
the student checks the current profile. No photo write is retried automatically.
Closing the editor reloads the profile before making another action available.
Server-rejected input remains editable. Name, faculty, year and other staff-owned
fields are never included in a photo mutation.

Backend PR #124 adds these endpoints without a new migration. The running backend
must include that version and have private R2 storage enabled. Storage-disabled
or failed requests return 503; JSON profile viewing remains available. Live
acceptance with dedicated accounts and configured storage remains to be recorded.

Access-request cancellation is separately connected from student request details
through `OwnAccessCancellation` -> `cancelOwnLateAccess` -> authenticated empty
`POST /api/v1/late-access-requests/{lateAccessID}/cancel`. Its confirmation,
ownership validation, cancellation history and conflict recovery are unchanged.
