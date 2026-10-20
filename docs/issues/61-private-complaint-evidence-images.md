# [DDP-#61] feat(complaints): add private evidence image management

## Objective

Let students attach and remove private complaint evidence, and let authorized staff
view it, using the existing backend image APIs and R2 storage workflow.

## Scope

- Add an evidence section to student and staff complaint details.
- Explain that text complaints are submitted before attaching images.
- Allow up to three JPEG/PNG images while a complaint is pending.
- Validate non-empty files up to 5 MiB, 4096 pixels per side and 12 million pixels.
- Show selected-file previews and authenticated private images.
- Confirm removal and handle JSON removal/version/replay responses.
- Keep the exact image ID and File for uncertain upload retries; preserve the target
  image ID for uncertain removal retries.
- Require checking current complaint/history/evidence after conflicts, before new writes.
- Refresh complaint details, evidence and history after acknowledged changes.
- Handle loading, empty data, validation, missing images, access loss, R2 failures and retries.
- Protect pending/unsaved operations and revoke temporary image URLs on cleanup.

## Permissions and boundaries

Student: attach/remove only while the owned complaint is pending. Staff: read only,
with backend authorization authoritative. Evidence remains frozen after review begins;
reopening returns to in_progress and does not unlock it. No backend/database changes,
R2 keys, public image URLs, multipart uploads or scanner actions are introduced.

## Acceptance criteria

- [x] Students can select, preview, upload and confirm removal of evidence.
- [x] Staff can view private evidence without mutation controls.
- [x] Limits, raw upload methods and backend replay responses are respected.
- [x] Uncertain retries keep original IDs/files; conflicts require state review.
- [x] Successful changes refresh complaint details and update history.
- [x] Object URLs/private requests are cleaned up on unmount or account switch.
- [x] Full test suite, focused coverage, type checking, lint, formatting and build pass.
- [ ] Live R2 acceptance, keyboard/narrow-screen verification and peer review are recorded.

This local description does not create or update a GitHub issue.

Automated verification: all 1196 tests passed across 61 files, including 58 new
API/gallery/editor tests. Focused coverage for the new API and evidence component:
95.81% lines, 92.50% statements, 89.74% branches and 98.30% functions. Type checking, lint, production build and
repository formatting with Windows line-ending handling (`--end-of-line auto`)
passed. Live R2 acceptance and peer review remain pending.
