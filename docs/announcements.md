# Announcements

Ticket #62 provides staff publication and student reading through existing APIs.

## Routes and permissions

- `/dashboard/announcements`: Admin/Warden feed and publication link.
- `/dashboard/announcements/new`: review and publish a new announcement.
- `/dashboard/announcements/:announcementID`: staff content and delivery summary.
- `/student/announcements`: eligible student's read-only feed.
- `/student/announcements/:announcementID`: student content without staff counters.

Student routes reuse the portal session/setup guard and existing profile shell.
Staff routes use the existing protected dashboard. Current backend role/account
checks are authoritative. No backend, database or storage changes are required.

## API integration

All calls use the existing authenticated Firebase Bearer transport with no-store,
timeouts, aborts and account identity checks. There is no public announcement URL.

- `GET /api/v1/announcements?limit=20&offset=...`: newest-first paginated feed.
- `GET /api/v1/announcements/:id`: full immutable publication.
- `POST /api/v1/announcements`: request_id, title, content and all_students audience.
- `GET /api/v1/announcements/:id/delivery-summary`: staff-only source counters.

The client validates IDs, response models, expected target/publisher, pagination,
unique row IDs, timestamps and delivery invariants. No unsupported query filters
are sent. Refresh returns to the first page; separate requests are not a frozen export.
Dates follow the existing web portal's explicit device-timezone display. These APIs
do not return a configured hostel timezone.

## Publication and recovery

Title: trimmed, single line, 1–160 Unicode characters. Content: trimmed, 1–5000
Unicode characters, with supported line breaks/tabs. Unsupported controls are rejected.
Content is rendered as React text, never HTML. No rich text/editor markup is sent.

Staff review the exact normalized text and confirm publication to all students.
Published announcements cannot be edited/deleted/scheduled/unpublished. Corrections
require an explicit new announcement. Drafts remain in component memory, with
navigation/unload protection; no private draft is persisted to browser storage.

A lost/503/malformed acknowledgement may represent a committed publication. The
form locks its original UUID, publisher and normalized fields for an identical retry.
First publication returns 201/replayed=false; exact replay returns 200/replayed=true.
Confirmed invalid/conflicting requests preserve text and explain recovery; no retry
is generated automatically. Successful publication opens its authoritative detail.

## Delivery and read state

Staff see recipients_total, delivered, pending_delivery, read and unread.
delivered + pending_delivery = recipients_total; read + unread = delivered.
Counts describe original recipients, including later-inactive accounts. Later eligible
students can read historical content without receiving backfilled old notifications.
Inbox delivery is asynchronous and may lag a successful publication. These counters
do not prove comprehension, email delivery or phone receipt.

Summary errors have independent retry and do not hide readable content. Session,
setup or permission loss clears private content via the existing access flow. Student
components never request staff summary endpoints. Opening a publication never
marks notifications read. The owned inbox in [ticket #66](notifications.md) marks
one notification read when the user explicitly opens it there.

## Live acceptance to record

1. Sign in as Admin and Warden, review/publish test notices and compare feed/detail
   content with an eligible student's read-only view.
2. Verify Unicode, line breaks, narrow screens, keyboard focus and draft warnings.
3. Simulate uncertain publication and retry the same operation without duplicate rows.
4. Compare real delivery counters with the original recipient snapshot and allow
   asynchronous delivery to settle. Do not infer email/phone receipt.
5. Check account revocation, setup requirements, role changes, service failure and
   logout/account-switch cleanup. Record peer review. Mocked checks do not establish
   live notification delivery or deployed-backend availability.
