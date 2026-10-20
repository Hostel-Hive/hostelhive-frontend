# [DDP-#62] feat(announcements): add publishing and student announcement feeds

## Objective

Let Admin/Warden publish hostel announcements and let eligible students read them
using the existing backend announcement APIs.

## Scope

- Add Announcements to staff and student navigation, with paginated feeds and details.
- Allow Admin/Warden to review and confirm immediate publication to all students.
- Validate a single-line title of 1–160 Unicode characters and content of 1–5000.
- Render escaped plain text and preserve content line breaks.
- Preserve the same publication UUID and normalized fields for uncertain retries.
- Protect unsaved drafts, prevent duplicate submission and clear private state on
  account change, logout or access loss.
- Show staff-only delivery summary counters from the backend, with independent retry.
- Handle loading, empty feeds, missing resources, conflicts, validation, setup,
  session/access failures and service outages.
- Support responsive layouts, keyboard access and automated checks.

## Permissions and boundaries

Admin/Warden can publish, read and view delivery summaries. Students can read only.
Backend authorization remains authoritative. Sub-Warden/Security have no announcement
permissions. Frontend changes only; reuse the shared authenticated request helper.
No targeting, priority selection, drafts on the server, scheduling, edit, delete,
unpublish or notification mark-read calls are introduced. Inbox work belongs to #63.

## Acceptance criteria

- [x] Staff and students can browse paginated announcements and details.
- [x] Staff review and explicitly confirm immediate publication to all students.
- [x] Invalid input is explained and failed draft values are preserved.
- [x] Unknown writes retain exact retry IDs/fields and prevent duplicate clicks.
- [x] Students cannot access publication controls or delivery summary requests.
- [x] Staff counters come from the backend and retain original-recipient meaning.
- [x] Content is escaped and account changes clear pending private state.
- [x] Full test suite, focused coverage, type checking, lint, formatting and build pass.
- [ ] Live keyboard/narrow-screen acceptance and peer review are recorded.

This local description does not create or update a GitHub issue.

Full verification: all 1270 tests passed across 64 files, including 74 new tests.
The 114-test focused run covers announcements, app routing and the existing student
portal. Coverage for the seven new API/UI/hook files:
98.52% lines, 94.69% statements, 93.99% branches and 93.33% functions.
Type checking, lint, production build and repository formatting with Windows
line-ending handling (`--end-of-line auto`) passed. Live acceptance and peer
review remain pending.
