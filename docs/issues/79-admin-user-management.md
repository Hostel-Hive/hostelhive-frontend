# [DDP-#79] feat(admin): add user account and role management

## User Story

As an administrator, I want to manage user roles and account access
so that only authorized users can access the appropriate HostelHive features.

## Background / Context

- The backend provides account listing, role changes and activation/deactivation.
- The frontend needs an Admin-only interface within the staff workspace.
- Account access management is separate from student profile archiving.
- SDS reference: confirm the actual user administration/access control section before publishing.

## Scope

- Add an Admin-only User management page and sidebar link.
- List account identity, role and active status with supported pagination.
- Allow supported role changes and activation/deactivation after confirmation.
- Explain backend conflicts, including protection of the last active Admin.
- Handle loading, empty results, failures, uncertain outcomes and retries.
- Support responsive layouts, keyboard interaction and automated checks.

## Acceptance Criteria

### AC1: Account list

Given an administrator is signed in,
when User management is opened,
then accounts appear with their identity, role and active status.

### AC2: Role changes

Given a role change is permitted by the backend,
when the administrator selects a supported role and confirms,
then the confirmed change is reported and the list is refreshed.

### AC3: Account access

Given an account can be activated or deactivated,
when the administrator confirms the action,
then its confirmed access status is reported, including pending external revocation when applicable.

### AC4: Restricted access

Given a user is not an active Admin,
when they attempt to open User management,
then account data and management controls are not displayed.

### AC5: Failure handling

Given an operation fails or its outcome cannot be confirmed,
when the result is displayed,
then the interface explains the failure and offers safe recovery without claiming success.

### AC6: Responsive and accessible controls

Given a small screen or keyboard-only navigation,
when the administrator uses the list and confirmation dialogs,
then the controls remain usable with accessible names and managed focus.

## Technical Notes

- Reuse authentication, Admin role guards, dashboard layout and authorized requests.
- The existing list API supports `limit` and `offset` only. Do not invent search or role filters.
- Accept the five backend roles; Sub-warden/Security staff have no dedicated web portal yet.
- Backend rules decide whether an account change is permitted; the page does not infer the last Admin from a partial list.
- Prevent duplicate pending submissions. Require a fresh list after an uncertain mutation before another action.
- Clear private results on access denial, identity/role changes and unmount.
- No backend/database changes, account deletion or student profile archiving.

## Test Requirements

- Verify loading, populated, empty and failed account lists.
- Verify valid pagination and reject unsupported/invalid parameters.
- Verify role selection, confirmation and refreshed server state.
- Verify activation, deactivation and pending revocation messaging.
- Verify cancelling sends no mutation and pending submissions cannot be duplicated.
- Verify conflict, missing-account, denied-access and uncertain-result recovery.
- Verify non-Admins cannot access the route or navigation link.
- Verify identity changes/unmount abort requests and ignore late results.
- Verify keyboard controls and dialog focus restoration.

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

- Existing staff layout and Admin authentication/role guards.
- Existing account-management APIs available in the target environment.

## Implementation

- Branch: `feature/79-admin-user-management`.
- Route: `/dashboard/users`.
- See [user management guide](../admin-user-management.md) for contracts and verification.
- This file is the local ticket description; it does not create a GitHub issue or confirm external review/CI/staging completion.
