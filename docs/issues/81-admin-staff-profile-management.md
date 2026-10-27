# [DDP-#81] feat(admin): add staff profile management

## User Story

As an administrator, I want to view and update staff profiles
so that HostelHive maintains accurate staff identity and professional details.

## Background / Context

- The backend provides Admin-only staff listing, detail and profile update APIs.
- Ticket #79 manages account roles and access; this ticket manages staff profile details.
- SDS reference: confirm the actual staff administration section before publishing.

## Scope

- Add an Admin-only Staff management page and sidebar link.
- List existing staff profiles using backend-supported pagination.
- Add staff profile detail screens addressed by account UUID.
- Allow editing full name and designation with backend-aligned validation.
- Display email, role and access status as read-only information.
- Handle loading, empty results, failures, uncertain outcomes and retries.
- Support desktop, small screens and keyboard navigation.

## Acceptance Criteria

### AC1: Staff directory

Given an administrator is signed in,
when Staff management is opened,
then staff profiles appear with their available identity and professional details.

### AC2: Profile details

Given a staff profile exists,
when the administrator selects it,
then its details appear on a dedicated screen and the directory page is preserved in the return link.

### AC3: Edit profile

Given the administrator enters valid changes,
when they save the profile,
then the backend-confirmed full name and designation appear with a success message.

### AC4: Validation and recovery

Given input is invalid or saving fails,
when the result is displayed,
then the interface explains the problem and preserves entered values where safe.

Given a save outcome is uncertain,
when recovery is offered,
then the administrator can check the saved profile before submitting again.

### AC5: Restricted access

Given a user is not an active Admin,
when they attempt to open Staff management,
then staff management data and controls are not displayed.

### AC6: Responsive and accessible controls

Given a small screen or keyboard-only navigation,
when the administrator browses or edits profiles,
then navigation, forms and feedback remain usable and unsaved changes are protected.

## Technical Notes

- Reuse existing authentication, Admin guards, layout, form controls and authorized requests.
- The backend list supports only `limit` and `offset`; do not invent search or role filters.
- Page size is 20 and the backend offset ceiling is 100,000.
- Detail/update paths use `user_id`, not `staff_id`.
- Only full name (up to 200 Unicode code points) and designation (up to 120) are editable; both are required and cannot contain control characters.
- Keep role changes and activation/deactivation in User management.
- Prevent duplicate saves; protect dirty drafts against close, navigation and browser unload.
- Clear private data on session/permission loss and ignore aborted or stale requests.
- No backend/database changes.

## Test Requirements

- Directory loading, populated, empty and failure states.
- Supported pagination, invalid parameters and preserved return links.
- Profile detail loading, account-ID addressing and missing profiles.
- Required fields, Unicode limits, control characters and successful updates.
- Failed and uncertain save recovery with drafts preserved.
- Duplicate submission prevention and unsaved-change handling.
- Admin-only routes, active navigation and denied-role redirects.
- Keyboard interaction, focus management and request cleanup.

## Definition of Done

- Acceptance criteria verified.
- Tests pass; new logic meets the 80% coverage target.
- Lint, formatting and build checks pass.
- CHANGELOG.md updated.
- PR targets develop and references this issue.
- At least one approving peer review.
- Review blockers resolved by their reviewers.
- CI passes.
- Staging smoke test completed.

## Estimate

Estimated: 8–12 hours.

## Dependencies

- Existing staff dashboard layout and Admin authentication.
- Existing backend staff profile APIs.
- Ticket #79 for the separate account-management workflow.

## Boundary

No staff account/profile creation or deletion, role changes, account activation/deactivation, or Warden/Sub-warden/Security self-service profile editing.

## Implementation

- Branch: `feature/81-admin-staff-profile-management`.
- Routes: `/dashboard/staff` and `/dashboard/staff/{userID}`.
- See the [staff management guide](../admin-staff-profile-management.md) for the API contract, recovery behavior and verification.
- This is the local issue description. GitHub issue publication, PR review, CI and staging verification are separate steps.
