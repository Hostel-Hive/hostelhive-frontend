# #134 — Clarify account access and student profile lifecycle actions

Account access, the student profile and accommodation are separate states.

- **Deactivate account:** The confirmation explains that access is suspended while the profile and reserved bed remain unchanged. Permanent departures should use End hostel stay.
- **Activate account:** An archived-profile warning appears when the Admin account list reports an archived profile. Activation does not restore that profile or assign accommodation. The dialog links to Archived students. Missing metadata is shown as unavailable rather than treated as a current profile.
- **Restore profile:** After the restore response is confirmed, the interface checks active allocations. It reports assigned, unassigned or unverified accommodation and links to the restored profile. A failed allocation read does not turn a successful restoration into a failed mutation or submit it again.
- **Archive profile:** The dialog recommends End hostel stay for permanent departure. Admins can open that confirmation directly without submitting either action. Wardens receive guidance to ask an Admin. The existing archive confirmation remains available and explains bed, account and photo effects.

Permissions remain unchanged: account changes, restoration and End hostel stay are Admin-only; existing Admin/Warden archival remains available. No automatic activation, restoration or allocation is introduced. End hostel stay keeps its existing explicit account choice and safe-retry contract.

The backend adds optional `student_profile_id`, `student_profile_archived` and `student_has_active_bed` fields to Admin `GET /api/v1/users` results. Older responses without these fields remain supported. The values are a snapshot; existing mutation eligibility checks remain authoritative.

No migration is added for #134. The earlier restoration and checkout migrations must already be applied, and the backend must restart to serve the new account metadata.

Automated coverage includes archived-profile activation, deactivation with a reserved bed, all three post-restoration accommodation results, the Archive-to-End-hostel-stay shortcut, and validation of optional account metadata. Live staff acceptance and deployment are separate steps.
