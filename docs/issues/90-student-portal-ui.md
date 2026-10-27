# [DDP-#90] fix(ui): standardize student portal styling and navigation

## User Story

As a student, I want a consistent and accessible portal so that I can find information and complete tasks easily.

## Scope

- Align overview, profile, accommodation, QR, attendance, leave/access requests, complaints, announcements and notifications with the staff UI.
- Group sidebar links with icons and provide accessible small-screen navigation.
- Standardize spacing, typography, cards, forms, status badges, actions, pagination and loading/error states.
- Retain the shared authentication screens, API contracts, ownership checks, privacy and submission/retry workflows.

## Acceptance Criteria

- Student pages use the shared visual language and available width.
- Navigation identifies the active route; mobile controls support keyboard opening, closing and Escape.
- Existing student actions, session handling, private images and role restrictions behave as before.
- Relevant tests, formatting, lint and production build pass; changelog updated.

## Review

PR targets develop and references #90. Review desktop and mobile layouts with real student data before staging sign-off.
