# Changelog

## [Unreleased]

### Fixed

- Simplified the staff header by retaining desktop sign-out in the account menu and mobile sign-out inside navigation; aligned workspace labels, notification controls and compact header spacing across portals.

- Refined bed assignment, transfer and revocation dialogs with selection steps, responsive inventory cards, clear selected-bed feedback and a consistent confirmation footer.

- Standardized the student portal for #90 with grouped icon navigation, accessible mobile controls, full-width content, consistent profile/accommodation/QR cards, attendance filters, request forms and details, complaint evidence and shared communication screens.

- Preserved the verified dashboard shell during background navigation session checks to remove the full-page verification flash; initial checks and verification failures still block access.

- Grouped staff sidebar routes by purpose with consistent line icons, compact navigation, clear active states and scrollable mobile navigation.

- Reorganized complaint details into complaint/evidence and staff-action panels, with compact dates, expandable references, clearer image retry states and consistent update history.

- Aligned the staff complaint directory with management pages using grouped responsive filters, student profile links, compact local dates, clear status badges and consistent row actions and pagination.

- Refined the owned notification inbox with a compact count/filter bar, distinct read/unread rows, clear source/timestamp metadata and consistent detail actions and pagination.

- Refined announcement reading and delivery-summary views with clear publication metadata, readable notice content, compact navigation and consistent metric cards.

- Refined announcements with a balanced toolbar, responsive notice cards, clear publication metadata and audience labels, explicit read actions and consistent form/pagination styling.

- Replaced the oversized staff account-confirmation banner with a compact identity card, status badges, expandable reference and clear profile navigation.

- Refined the existing staff-account picker with identity avatars, role/access badges, compact selection actions and consistent pagination.

- Standardized staff creation with grouped account-mode controls, responsive profile/access fields, compact guidance and a separate submission footer.

- Restructured access-request details around movement/time and reason, with a separate decision/permission-use column and expandable record references.

- Matched Access requests to leave-request directory styling with grouped filters, student profile links, compact timezone-aware dates and consistent status/actions/pagination.

- Refined student edit/registration forms with consistent section hierarchy, grouped guardian cards, compact fields and a distinct save/cancel footer.

- Reorganized staff student profiles around personal/guardian details with responsive photo/QR tools, grouped profile actions and consistent upload controls.

- Restructured leave request details into a responsive leave-period/reason panel and decision panel, with compact navigation and expandable record references.

- Aligned leave requests with management directory styling, including grouped filters/actions, student profile links, compact timezone-aware dates, decision badges and pagination.

- Aligned Reports with management navigation, grouped filter/export actions, a clear initial state, expandable export guidance and consistent summary/table/pagination styling.

- Standardized staff attendance navigation, live-update panels, filters, presence summaries/tables and incident list/detail styling with the management workspace.

- Aligned hostel inventory with management directory styling: consistent panel spacing, hierarchy navigation, compact actions, inventory icons, availability counts and right-aligned pagination.

- Standardized student directory heading spacing, grouped creation/import actions, and aligned student identities, status badges, profile links and pagination with staff directories.

- Aligned Staff management with the dashboard directory styles, including grouped toolbar actions, staff avatars, role/access badges and consistent pagination.

- Improved user management with a clear directory toolbar, account avatars, role/access badges, expandable account IDs and consistently styled actions.

- Kept the staff header/sidebar visible during scrolling, with independently scrollable navigation and a bottom account menu reusing the accessible student portal control.

- Improved overview metric hierarchy with contextual icons, prominent counts and separate timestamp/action footers.

- Refined accommodation block cards with responsive columns, clear inventory links, grouped statistics and a distinct availability cell.

- Removed the shared dashboard section width limit that left unused space on wide screens, and refined Admin/Warden overview card density, spacing and shortcut navigation.

- Made staff profile editing directly accessible from each eligible directory row, preserving pagination and displaying confirmed saved details.

- Stabilized asynchronous UI checks for lazy routes on Windows and under coverage, with bounded waits and explicit React act-environment setup for imported Vitest hooks. Assertions and coverage gates are unchanged.

### Added

- Admin staff account/profile creation and missing-profile setup for existing
  accounts, with password visibility, stable provisioning keys, credential-free
  session recovery, partial-completion checks and protected navigation (issue #83).

- Admin-only staff profile directory, account-ID detail screens and name/designation
  editing with supported pagination, unsaved-change protection, uncertain-save
  verification, access recovery and private request cleanup (issue #81).

- Admin-only user account listing, role changes and activation/deactivation with
  confirmation dialogs, supported pagination, backend conflict explanations,
  uncertain-result recovery and private-data cleanup (issue #79).

- Dedicated Warden operations overview with pending-work metrics, recent recorded
  incidents, per-block accommodation, permitted shortcuts and shared overview
  loading/access recovery, separated from detailed/live attendance (issue #77).

- Dedicated Admin overview with backend student/presence and pending-work counts,
  per-block accommodation, filtered management links, independent retry and
  private-data cleanup, separated from detailed/live attendance (issue #75).

- Opt-in live Admin/Warden attendance updates using authorized Firebase grants,
  version-triggered REST refresh, connection/freshness indicators, grant renewal
  and visibility/account cleanup while preserving filters, rows and focus (issue #73).

- Admin/Warden attendance movement/daily, leave and complaint reports with backend
  filters, summaries, pagination, timezone metadata and authenticated PDF/XLSX
  downloads with export-limit recovery and private file cleanup (issue #71).

- Admin/Warden attendance dashboards, searched/status-filtered presence lists,
  incident lists/details with recorded policy snapshots and incident navigation
  from notifications and student scan history (issue #69).

- Owned student/staff notification inboxes, unread filtering and badges,
  deliberate mark-read, source navigation and safe recovery (issue #66).

- Admin/Warden announcement review/publication, safe replay, staff delivery summaries
  and read-only student feeds/details (issue #62).

- Private complaint evidence gallery for students/staff, validated student upload/removal,
  local previews, confirmation, stable image retries and conflict recovery (issue #61).

- Student-owned complaint submission, status/category filters, paginated details/history,
  notes, version-conflict review and identical uncertain-write retries (issue #60).

- Admin student registration by university email through the invitation API, including normalized profile/guardian details, safe request replay, delivery/setup status refresh and a separate existing-account profile workflow (issue #104).

- Admin/Warden complaint tracking with category/status/student/date filters, chronological history, student-visible notes, confirmed resolution/reopening, version checks and idempotent recovery after uncertain writes (issue #43).

- Staff early-exit/late-entry request review with status/student filters, pagination, direction/expected-time details, recorded permission use, confirmed Admin/Warden decisions and conflict/uncertain-response recovery (issue #41).

- Staff leave request browsing and details with status/student filters, pagination, Admin/Warden approval and rejection, decision confirmation, validation, draft guards and status checks after uncertain or conflicting outcomes (issue #39).

- Hostel inventory browsing for Admin/Warden with block → room → bed navigation, server occupancy counts, availability filters and pagination; Admin-only creation/renaming with validation, draft protection and explicit recovery after uncertain saves (issue #37).

- Read-only student presence and movement/scan history for Admin/Warden, with independent retries, explicit recorded/ignored outcomes, legacy permission labels, pagination and access-loss cleanup (issue #29).

- Student accommodation integration for Admin/Warden: current bed assignment, paginated allocation history, available block/room/bed selection, confirmed assign/transfer/revoke, and explicit refresh after conflicts or uncertain outcomes (issue #28).

- Student, allocation and inventory requests share the authentication module's current-session transport; feature APIs retain their own response validation and error handling.

- Authorized student QR display for Admin/Warden profiles, explicit retrieval, PNG download, eligibility/error recovery and private image cleanup on hide, tab hiding and navigation (issue #27).

- Admin-only student CSV import with authenticated template download, UTF-8/size/record/structure checks, a review step, partial row reports, safe CSV report download, and explicit recovery after uncertain outcomes (issue #26).

- Private student profile photo display, validated JPEG/PNG upload and replacement, confirmed removal, and explicit status checks after uncertain writes. Photo controls use the existing authorized backend endpoints.

- Student profile archival with confirmation, authorized empty-body DELETE, filter-preserving directory refresh and explicit recovery for uncertain outcomes (issue #24).

- Student profile creation and editing through the existing authorized APIs, including guardian management, backend-aligned validation, save recovery, and unsaved-navigation protection.

- Student directory and read-only profiles for Admin/Warden accounts, backed by Firebase-authorized student APIs (issue #19).
- URL-preserved name/ID search, exact faculty and year filters, offset pagination, contact and guardian details, and request recovery states.

- Firebase password recovery, generic request confirmation, resend cooldown, reset-link validation and policy-driven reset form (issue #14).
- Reset success, invalid/expired-link recovery and service retry states using the shared authentication layout.
- Password-flow SDK, form interaction and reset-request parsing tests.
- Protected dashboard routes, role-specific access, shared authentication state and Firebase session observation (issue #11).
- Sign-out, role-filtered navigation, verification loading/retry states and stale-response protection.
- Direct-route, restored-session, service-failure, role-change and sign-out regression tests.
- Institution-neutral branding and full Figma tonal palette; login cyan accents now use cyan-500.
- Reusable Button and Input controls under shared/components/ui, used by login and mobile navigation.
- Shared Figma authentication layout and login page with accessible validation, loading/error states and password recovery assistance route (issue #7).
- Firebase email/password sign-in and persisted-session restoration, verified against the backend active-account and role response before dashboard redirects.
- Login interaction and Firebase/backend contract tests; development API proxy.
- Figma colour/type tokens and locally bundled Plus Jakarta Sans, Instrument Serif and JetBrains Mono fonts (issue #5).
- Indigo dashboard sidebar, cyan active navigation and updated responsive shell, cards and recovery page styling.
- Application routing, admin/warden landing pages and shared responsive dashboard layout (issue #3).
- Active navigation, keyboard-accessible mobile menu and Not Found recovery.
- Route and mobile navigation interaction tests.

- React and TypeScript web foundation using Vite (issue #1).
- Validated public API base URL configuration.
- ESLint, Prettier, unit/component tests and an 80% coverage gate.
- GitHub Actions web quality checks and dependency security scan.
