# [DDP-#104] feat(students): integrate invitation-based student registration

Admin staff register a student with their university email, registration/index number, name, faculty, year, phone and guardians. The backend creates the linked account/profile and queues the private password-setup invitation. No account UUID or password is entered in this workflow.

## API and permissions

- `POST /api/v1/student-invitations`: Admin only. JSON contains `request_id`, `email`, `index_no`, `full_name`, `faculty`, `year`, `contact_phone`, and `guardians[]` (`name`, `relationship`, `contact_phone`). Email is trimmed/lowercased; profile fields are trimmed. Approved email domains are configured on the backend, never hardcoded in the frontend.
- First registration returns HTTP 201 `{invitation, replayed:false}`. An exact request replay returns HTTP 200 `{invitation, replayed:true}`.
- `GET /api/v1/student-invitations/{invitation_id}`: Admin status refresh. The profile opened after registration displays queued, accepted, failed, skipped or completed setup status. Firebase accepting a sending request does not prove mailbox receipt.
- The returned `student_id` opens the existing profile and accommodation controls. Internal IDs are not displayed by the invitation form/status panel.
- Warden permissions remain unchanged: Wardens can create a profile for an existing eligible account, but cannot register invitations. Admins can explicitly choose the same existing-account profile workflow. That separate legacy form still requires the account ID because its API requires `user_id`; it does not silently create or adopt accounts.
- Existing profile editing, CSV profile import, bed allocation and Student activation APIs remain unchanged. This ticket integrates individual invitation registration, not bulk invitation upload or resend controls.

## Recovery and session handling

Generate a request UUID for a normalized registration and preserve it when resubmitting identical details. Disable duplicate submissions while pending. For network/server errors or malformed success responses, retain the original payload and request UUID, lock edits and offer **Retry same registration**. Do not generate a new registration after an unknown result.

For a definitive validation/conflict response, preserve the form for corrections. Changed normalized details receive a new request UUID. Conflicts may involve an email, index number, reserved identity or reused request ID: inspect existing records instead of assuming an account can be linked by email. Only the backend decides eligibility.

Session expiry and forbidden responses lock further writes. Requests use the existing current-user Firebase transport, abort on unmount, and ignore responses after leaving. Invitation metadata in navigation state is bound to the initiating staff UID and returned profile; it is validated before display. No passwords, reset links, tokens or profile drafts are saved to local/session storage. Browser history retains only the safe invitation metadata returned by the backend for the initiating navigation.

Leaving/reloading abandons the in-memory retry payload. Check the directory before starting another registration if the previous result was uncertain. The status panel is available on the initiating profile navigation; reopening a profile without that metadata does not infer or create an invitation. Refreshing status never registers or resends an invitation.

## Backend setup

Use a compatible backend containing #95, with migration 26 (and subsequent migrations) applied. Configure `STUDENT_INVITATIONS_ENABLED=true`, approved university email domains, Firebase credentials and the invitation worker/email delivery settings according to the backend student invitation guide. Frontend environment variables contain public configuration only; never copy service-account credentials into Vite variables.

An unavailable feature/backend may return HTTP 503. The frontend does not claim registration succeeded or email was delivered in that situation.

## Automated verification

From `web/`, use Node 22.16.0 and `npm ci`, then run the existing lint, formatting, coverage and production build commands. Shared UI assertions allow up to five seconds for asynchronous/lazy panels, with a 15-second test deadline; assertions and coverage thresholds remain unchanged. The shared setup explicitly enables and restores the React act environment because Vitest global hooks are disabled. On constrained machines, `npm run test:coverage -- --maxWorkers=1` avoids worker contention. CI already discovers the new tests through `npm run test:coverage`; no new job or external credentials are needed. Tests cover the authorized API contract, malformed responses, safe replay, normalized payloads, duplicate prevention, errors, role restrictions, existing-profile regression behavior and invitation status refresh.

## Live acceptance checks

1. Sign in as Admin and open Students > Add student. Confirm university email/index/profile/guardian fields, with no UUID/password field.
2. Register a dedicated test student using an approved mailbox. Verify one linked profile, the queued status and navigation to that profile. Allocate a bed with existing controls if needed.
3. Refresh invitation status. Verify accepted status is described accurately; check the actual mailbox separately. Complete the private setup link and confirm completed status after refreshing.
4. Submit a duplicate email or index number. Confirm the form remains usable and clearly reports the conflict.
5. Interrupt a test response in a controlled environment. Retry the same registration and verify one backend registration and an identical request UUID/payload.
6. Sign in as Warden. Verify the existing-account profile workflow works and invitation registration is not offered. Confirm the backend also rejects a direct Warden invitation request.
7. Edit an existing profile, use its guardian/photo/QR/accommodation controls and exercise the existing CSV import to confirm their contracts are preserved.

Live Firebase sending and mailbox receipt require configured backend/test accounts and are separate from mocked automated tests.
