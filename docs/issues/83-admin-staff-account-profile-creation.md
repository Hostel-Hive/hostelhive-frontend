# [DDP-#83] feat(admin): add staff account and profile creation

## User Story

As an administrator, I want to add a staff member with a login account and professional profile
so that they can access HostelHive with the appropriate permissions.

## Background / Context

- Ticket #79 provides account role and access management.
- Ticket #81 lists and edits existing staff profiles.
- The backend supports account creation and staff profile creation through separate requests.
- SDS reference: confirm the actual staff provisioning section before publishing.

## Scope

- Add an Admin-only Add staff member action.
- Collect full name, email, designation, staff role and initial password.
- Create the login account, then complete its staff profile.
- Allow creating a missing profile for an existing staff account.
- Handle validation, duplicate accounts, partial completion and retries.
- Support responsive layouts and keyboard navigation.

## Acceptance Criteria

### AC1: Staff creation form

Given an administrator is signed in,
when Add staff member is selected,
then a form collects the required account and profile details.

### AC2: Successful creation

Given valid details are submitted,
when both backend operations succeed,
then the confirmed staff profile appears with a success message and a link to its detail screen.

### AC3: Missing profile for an existing account

Given an existing account has a supported staff role but no staff profile,
when the administrator supplies valid profile details,
then its profile is created without creating another login account.

### AC4: Duplicate and invalid input

Given input is invalid or an email already belongs to an account,
when creation is attempted,
then an appropriate message appears without claiming success or creating a duplicate account.

### AC5: Partial completion

Given account creation succeeds but profile creation fails,
when recovery is displayed,
then the interface explains that the account exists and allows completing its profile without another account-creation request.

### AC6: Uncertain outcomes

Given a request result cannot be confirmed,
when the administrator retries or checks its state,
then the original account request key is preserved and duplicate creation is prevented. Existing profiles are read before a profile write and are not automatically overwritten.

### AC7: Restricted and accessible controls

Given a non-Admin attempts access,
then creation controls and provisioning data are not displayed.

Given keyboard-only navigation or a small screen,
then the form, password visibility control and recovery actions remain usable.

## Technical Notes

- Create accounts using `POST /api/v1/users` with an `Idempotency-Key`.
- Create missing profiles using `PUT /api/v1/staff/{userID}` with the confirmed account UUID.
- Restrict creation role choices to Admin, Warden, Sub-warden and Security staff.
- Validate initial passwords at 12–128 Unicode code points and profile fields against backend rules.
- Preserve the original operation key and account details for retries. Passwords stay in memory only; after reload an unconfirmed account request requires the original password again.
- Store only allowlisted recovery metadata in Admin-scoped session storage before starting a new account request.
- Treat account and profile creation as separate operations. Report partial completion and do not automatically delete, deactivate or change the role of a created account.
- Mask passwords by default with an accessible visibility toggle. Do not log passwords, store them in browser storage, or put them in URLs/history state.
- Explain that no staff setup invitation or automatic credential email is sent.
- No backend/database changes.

## Test Requirements

- Admin-only routes and creation actions.
- Required fields, supported roles and backend-aligned validation.
- Password masking and visibility toggle.
- Successful account-then-profile creation.
- Missing-profile setup for existing accounts, including User management links.
- Duplicate email and backend conflict handling.
- Partial completion without repeated account creation.
- Uncertain outcomes, reload recovery and reuse of the original operation key.
- Preservation of existing profiles instead of silently overwriting them.
- Duplicate submission prevention and unsaved-change protection.
- Session loss, request cleanup, keyboard interaction and focus management.

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

Estimated: 10–14 hours.

## Dependencies

- Ticket #79: User account management.
- Ticket #81: Staff profile management.
- Existing account-provisioning and staff profile APIs.
- Firebase account provisioning configured in the target environment.

## Boundary

No staff invitation emails, automatic credential delivery, account deletion, or dedicated Sub-warden/Security portals. No automatic rollback of a confirmed account when profile completion fails.

## Implementation

- Branch: `feature/83-admin-staff-creation`.
- Route: `/dashboard/staff/new`.
- See [staff creation guide](../admin-staff-creation.md) for the API contract and recovery behavior.
- This file is the local ticket description. GitHub publication, peer review, CI and staging smoke tests remain separate steps.
