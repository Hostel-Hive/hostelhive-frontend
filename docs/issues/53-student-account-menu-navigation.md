# [DDP-#53] feat(student): add account menu and reorganize portal navigation

## Objective

Separate hostel navigation from personal account actions in the student portal.

## Scope

- Keep Overview, Accommodation and My QR code in the main sidebar.
- Replace the sidebar email label with a clickable account row: initials/user
  icon, name, shortened email and chevron.
- Open a popup with full name/email, Student role, My profile and Sign out.
- Move My profile out of the main navigation and remove the duplicate header
  Sign out control. Keep the account menu accessible on mobile.
- Place the popup above the account row when space permits, otherwise below;
  keep it in the viewport and outside the sidebar's clipping/scroll container.
- Close on selection, outside interaction, Tab and Escape. Support arrow keys,
  Home/End and focus return. Prevent duplicate sign-out submissions.
- Use Refresh on individual pages and page-specific descriptions.
- Keep the desktop sidebar below the sticky header while the page scrolls, with
  independent sidebar scrolling when needed on short screens.
- Show only implemented actions; security and support screens are future work.

## Boundaries and dependencies

Frontend only; use existing authenticated profile navigation and logout. No new
backend endpoint, database change, profile write or R2 credential is introduced.
Ticket #50 supplies the student pages. Ticket #52's earlier uncommitted work is
preserved separately in the named Git stash
`ticket-52-sidebar-and-backend-dependency`. The requested sticky-sidebar fix is
also included here so it works with the new account menu.

## Acceptance criteria

- [ ] The account row and popup work on desktop and narrow screens.
- [ ] My profile opens the existing protected student profile page.
- [ ] Sign out ends the session and returns to student login.
- [ ] Keyboard, focus, dismissal and duplicate-submission handling work.
- [ ] Main navigation highlights only the active hostel page.
- [ ] Tests, lint, formatting and build pass.
- [ ] Live browser acceptance and peer review are recorded.

This file is the issue draft; it does not create or update a GitHub issue.
