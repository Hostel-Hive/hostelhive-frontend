# Faculty management

Open **System → Faculties** (`/dashboard/faculties`). Admins can add, rename,
activate and deactivate faculties. Wardens have read-only access. Students do
not have catalogue access. The backend remains authoritative for permissions.

The directory supports active/inactive/all filters, paging and refresh. Create,
rename and lifecycle changes use a confirmation dialog. Unknown save results
require checking a refreshed directory before another attempt; create requests
are not automatically retried because this endpoint has no request UUID.

Student creation, registration and profile editing select active catalogue
names. Editing retains an existing inactive or legacy faculty without forcing
a reassignment. Faculty-targeted announcements also select active faculties.
Selectors follow every active-list page and offer retry on a read failure.
Payloads still send `faculty` as a name, rather than a faculty ID.

## Backend requirements

Use backend code with faculty routes and migration 34 (including its preceding
migrations). Migration 34 imports existing student and announcement faculty
names and does not invent default faculties. Deploy backend and migrations
before deploying this frontend change.

- GET `/api/v1/faculties?active=all&limit=20&offset=0`
- GET `/api/v1/faculties/{facultyID}` (validated API helper)
- POST `/api/v1/faculties` with `{ "name": "Science" }`
- PATCH `/api/v1/faculties/{facultyID}` with `{ "name": "Applied Science" }`
- POST `/api/v1/faculties/{facultyID}/activate` (no body)
- POST `/api/v1/faculties/{facultyID}/deactivate` (no body)

Names use 1–120 Unicode characters and are trimmed. Current and historical
names remain reserved by the backend. Renaming updates matching student labels;
deactivation retains records and removes the faculty from new choices. Backend
validation handles catalogue changes made after a form was loaded.

## Verification

Faculty tests cover role restrictions, route/navigation access, pagination,
mutation confirmation, response validation, duplicate names, uncertain saves,
request cancellation and catalogue selection. Student form and announcement
regressions exercise the shared selector through their existing workflows.
No backend source changes are required. Live deployment testing is separate
from these local automated checks.
