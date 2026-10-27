# [DDP-#60] feat(student): add complaint submission and status tracking

## Objective

Let students submit maintenance or disciplinary complaints, track staff responses
and add notes through the existing complaint APIs.

## Scope

- Add Complaints to the student sidebar, with owned list, new and detail routes.
- Filter by status/category and paginate complaints and chronological updates.
- Submit a category and description of 1–2000 Unicode characters.
- Show status, original description, timestamps, staff responses and history.
- Allow notes on unresolved complaints using a stable request ID and expected version.
- Preserve failed values, prevent duplicate submissions and keep uncertain retries
  identical. Require a reload and explicit review before a new action after a conflict.
- Handle loading, empty results, missing records, service failures, expired sessions,
  denied access and setup requirements.
- Protect unsaved drafts and clear private state across navigation/account changes.

## Boundaries

Frontend only. Reuse the authenticated transport and existing complaint POST,
list/detail GET, updates GET and notes POST endpoints. The backend derives ownership;
no student/account selectors are sent. Students cannot change status or edit/delete
the original complaint. Evidence image management belongs to #61. No new title,
severity, category, backend or database fields are introduced. #52 remains pending.

## Acceptance criteria

- [x] Students can submit complaints and browse only their owned records.
- [x] Status/category filters, pagination and chronological history work.
- [x] Unresolved complaint notes preserve version and request-ID semantics.
- [x] Failed values and uncertain write payloads are preserved.
- [x] Conflicts require reviewed state before a new note action.
- [x] Private data is cleared on account changes and access loss.
- [x] Full test suite, focused coverage, type checking, lint and build pass.
- [ ] Live keyboard/narrow-screen acceptance and peer review are recorded.

This local ticket description does not create or update a GitHub issue.

Validation: all 1138 tests passed across 59 files. The 192-test focused regression run
includes 62 new API, component and protected route tests. Focused coverage across
the four new API/UI files: 95.47% lines,
91.83% statements, 91.71% branches and 87.30% functions. Type checking, lint and
production bundling passed. Live account acceptance and peer review remain pending.

The default repository formatting check flags 48 unchanged CRLF checkout files;
this ticket does not reformat those unrelated files. Verify canonical formatting
with the Windows line-ending-aware check (`--end-of-line auto`), which passed.
