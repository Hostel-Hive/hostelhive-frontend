# Student login and portal entry

Students use `/login`; Admin and Warden use `/staff/login`. The homepage opens
student login, and the former `/student/login` address redirects to `/login`.
Both portals share the existing Firebase project, persistence settings and backend
identity verification. There is no public signup, role selector or client-side
email domain restriction. The backend's invitation allowlist applies when an Admin
registers an invitation, not when an approved account signs in.

## Backend prerequisites

Use the backend revision containing issue #95 student invitations, apply migration
26, and configure Firebase Email/Password authentication. Account setup completion
also requires `STUDENT_INVITATIONS_ENABLED=true`. No backend files or database
records are changed by this frontend implementation.

Firebase must authorize the frontend hostname for password recovery continue URLs.
Student recovery uses `/student/forgot-password` and passes the current origin plus
`/login` as the Firebase continue URL. The shared reset handler recognizes
that exact continue URL to return to the student login. `/student/reset-password`
is also supported. These routes do not change the Firebase email-template action
URL or replace the invitation's provider-hosted password setup process.

## Flow and access boundaries

1. Firebase email/password sign-in obtains a token. The frontend calls
   `GET /api/v1/me` and checks the UID, active state and role.
2. Explicit student sign-in accepts only `student`; explicit staff sign-in accepts
   only `admin` or `warden`. Unsupported or rejected accounts are signed out.
3. A restored valid session is directed to its own portal. Every staff dashboard
   route excludes student accounts; student routes exclude staff accounts.
4. A student with `setup_required:true` is sent to `/student/setup`, never the
   student landing page or staff features. An omitted setup flag means false,
   matching the backend's legacy account contract.
5. The setup page explains the invitation email/password flow. Its verification
   button sends `POST /api/v1/me/setup/complete` with no body through the existing
   authenticated request helper. Duplicate clicks are blocked.
6. After a verified completion response, refresh `/me`. Only that refreshed
   account can unlock `/student`. A 409 keeps setup locked and asks the student to
   finish the email link and freshly sign in. Token refresh alone does not replace
   the backend's recent password sign-in requirement.
7. Logout and expired student sessions return to `/login`. Temporary
   verification failures show retry/logout controls. Routine focus checks keep an
   already verified page, or an anonymous login draft, visible while checking;
   rejected sessions clear protected content.

The `/student` page is a protected welcome screen. Full student dashboard and
module screens remain separate work.

## Live acceptance checklist

Automated tests mock Firebase and backend responses. Live delivery, account setup
and independent peer review must be checked separately with approved test accounts:

- Sign in with an active legacy student; refresh `/student`, switch tabs and log out.
- Follow an invited student's actual email link, set their password, sign in at
  `/login`, and verify setup. Check the setup flag clears through `/me`.
- Confirm unverified/stale setup stays blocked and allows a fresh password sign-in.
- Attempt student access to `/dashboard/students` and staff access to `/student`.
- Test student recovery email and return to student login; test staff recovery too.
- Check keyboard password visibility, narrow layouts, expired sessions, service
  failures and retry. Do not treat mocked tests as proof of email delivery.
