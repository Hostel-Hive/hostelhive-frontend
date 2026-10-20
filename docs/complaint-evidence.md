# Private complaint evidence

Ticket #61 extends both student and staff complaint detail screens. Students submit
the text complaint first, then attach up to three JPEG/PNG images from its detail page.
One file is uploaded at a time. Staff see the same private gallery without upload or
removal controls. All existing backend category/owner/role restrictions remain authoritative.

## Backend contracts

- `GET /api/v1/complaints/:id/images`: attached image metadata and current version.
- `GET /api/v1/complaints/:id/images/:imageID`: authenticated normalized JPEG/PNG bytes.
- `PUT /api/v1/complaints/:id/images/:imageID`: raw File body and media type, with a
  generated stable image UUID. First acknowledgement is 201, exact replay is 200.
- `DELETE /api/v1/complaints/:id/images/:imageID`: empty body, 200 JSON with removed,
  version and replayed. It is not a 204 response.

All calls reuse the existing authorized request helper. Paths are derived locally
from validated IDs; response URLs, object keys and public R2 links are never used.
The image client checks metadata, parent IDs, content type, size, signatures and
mutation acknowledgements. The backend performs authoritative image decoding,
normalization, ownership checks and R2 storage. Frontend code contains no R2 credentials.

Limits: 3 attached images, 5 MiB raw/normalized per image, 4096 pixels per side,
12 million pixels. Upload/removal is available only while pending. Once staff move
to in_progress/resolved, evidence freezes; reopening does not return to pending.

## State and recovery

Selection is validated before showing a local preview. Object URLs are released on
replacement, decode failure, removal and unmount. Private reads abort on unmount;
the host pages reset their keyed complaint state on account changes.

The evidence editor locks competing note/status/refresh actions while it owns a
selected file, confirmation or unresolved operation. Note forms and the evidence
editor do not register competing navigation blockers. Leaving an unsaved operation
requires explicit acknowledgement; pending writes cannot be cancelled by navigating.
No files or retry data are persisted to localStorage.

After a network/provider/malformed-acknowledgement failure, retry uses the identical
image ID, file bytes/type or removal target. A state check refreshes the complaint,
history and evidence without losing retry details. Unknown retry details can be
discarded explicitly only after this check. A confirmed conflict requires refreshed,
reviewed state before a new operation. Three-image limits never block an exact
retry that merely acknowledges an already attached image.

Acknowledged mutation success is shown separately from a failed subsequent refresh.
R2-disabled/provider failures have retry states; metadata and removal can still work
when storage reads/uploads are disabled. Missing or undecodable individual images
do not hide the rest of the gallery. Session/setup/access failures clear private
complaint content through the existing parent-page authorization flow.

## Live acceptance to record

1. With eligible student test accounts, upload valid JPEG and PNG images to pending
   complaints and verify private display through R2-backed authenticated reads.
2. Upload three images, reject a fourth, remove one deliberately and upload another;
   compare complaint versions and chronological history with staff views.
3. Check another student's IDs and denied staff categories cannot reveal images.
4. Move a complaint to in_progress/resolved and reopen it; confirm evidence stays
   read only. Test a competing staff change while an upload is pending.
5. Exercise storage outages, unknown writes, identical retries, missing/invalid images,
   account switch/logout, navigation guards and cleanup.
6. Verify keyboard focus and 320px/375px layouts and record peer review. Mocked
   automated tests do not establish actual R2 connectivity or live permissions.
