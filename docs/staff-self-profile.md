# Staff self-profile editing

Branch: `feature/staff-self-profile`.

Admin and Warden users open **My profile** from the account menu. The personal
route is `/dashboard/profile`, separate from Admin-only staff management.

GET `/api/v1/me` reads the signed-in staff account projection. Missing name and
designation fields are supported, allowing staff without a profile to add their
name. PUT `/api/v1/staff/me` sends only `{ "full_name": "..." }`. Ownership comes
from authentication; no target account ID or designation is submitted. The
backend preserves an Admin-assigned designation and can create the staff profile
with an empty designation. No backend changes are required.

The page edits only full name. Email, role and designation are displayed as
read-only details. Validation follows the backend's trimmed 1–200 Unicode
character limit and rejects control/invalid surrogate input. It does not expose
Sub-Warden or Security web portals that the frontend does not otherwise support.

A successful save refreshes the authenticated account projection while retaining
the current page. Account-menu names use that verified projection for both staff
roles, without Warden requests to Admin-only profile endpoints.

Network/server/invalid-response uncertainty freezes further saves until the
current profile is checked. If its name differs from the draft, the user reviews
the saved value before continuing. Unsaved navigation/cancellation requires an
explicit discard, and pending writes cannot be duplicated. Changes to account,
role or email discard stale page state; rejected access clears personal data and
offers account verification. No profile writes are retried automatically.

Tests cover role boundaries, endpoint ownership, name-only payloads, concurrent
designation changes, missing profiles, account-menu refresh, validation,
uncertain outcomes, draft protection, duplicate submission and abort cleanup.
Live backend acceptance remains separate from local automated validation.
