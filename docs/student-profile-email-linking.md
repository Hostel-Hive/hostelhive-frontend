# Create existing student profiles by university email

Wardens enter University email on Add student. The form creates a profile for an existing active Student account; it does not create a Firebase login or send an invitation. Admins retain university-email registration through the invitation API and may separately create profiles for existing accounts.

The profile form submits an authorized `POST /api/v1/students` with `email` and the profile/guardian details, without `user_id`. Email is trimmed and lowercased. The returned profile must match that email and an active account. Unknown, inactive, and non-student accounts receive the same eligibility error. Year choices and form validation are limited to 1–5; reading historical records and legacy UUID/CSV clients remains compatible.

## Deployment order

1. Deploy the backend email-selector support on Render first. It accepts exactly one of `email` or legacy `user_id` and resolves email in the existing authority-checked creation transaction. No migration is required.
2. Deploy the frontend on Vercel.
3. As a Warden, create a profile for a disposable existing Student account by email. Confirm unknown/inactive/staff accounts are rejected and that no new login or invitation is created. As an Admin, verify the invitation registration path still works.

Deploying this frontend against an older backend will cause profile creation by email to return 400. Local tests do not establish that either hosted service has this version.
