import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import StudentNavigation from '../components/StudentNavigation';
import OwnProfileEditor from '../components/OwnProfileEditor';
import OwnPhotoEditor from '../components/OwnPhotoEditor';
import NavigationIcon from '../../../layouts/components/NavigationIcon';
import { routePaths } from '../../../app/router/routePaths';
import useAuth from '../../auth/hooks/useAuth';
import Button from '../../../shared/components/ui/Button';
import AppFooter from '../../../layouts/components/AppFooter';
import {
  getOwnProfile,
  portalError,
  isAccessError,
} from '../api/student-portal.api';
import { StudentPortalError } from '../api/student-portal.api';
import type { OwnStudentProfile } from '../student-portal.types';
import OwnStudentPhoto from '../components/OwnStudentPhoto';
import OwnStudentQR from '../components/OwnStudentQR';
import StudentAccountMenu from '../components/StudentAccountMenu';
import OwnAttendanceHistory from '../components/OwnAttendanceHistory';
import OwnComplaintList from '../components/OwnComplaintList';
import OwnComplaintForm from '../components/OwnComplaintForm';
import OwnComplaintDetail from '../components/OwnComplaintDetail';
import AnnouncementList from '../../announcements/components/AnnouncementList';
import AnnouncementDetail from '../../announcements/components/AnnouncementDetail';
import NotificationsPage from '../../notifications/pages/NotificationsPage';
import NotificationBadge from '../../notifications/components/NotificationBadge';
import type { AnnouncementError } from '../../announcements/api/announcements.api';
import OwnLeaveList from '../components/OwnLeaveList';
import OwnLeaveForm from '../components/OwnLeaveForm';
import OwnLeaveDetail from '../components/OwnLeaveDetail';
import OwnLateAccessList from '../components/OwnLateAccessList';
import OwnLateAccessForm from '../components/OwnLateAccessForm';
import OwnLateAccessDetail from '../components/OwnLateAccessDetail';
import '../../../styles/student-portal.css';

const shown = (text: string) => text || 'Not provided';
const date = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
function Details({ items }: { items: [string, string][] }) {
  return (
    <dl className="portal-details">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export type StudentView =
  | 'overview'
  | 'profile'
  | 'accommodation'
  | 'qr'
  | 'attendance'
  | 'announcements'
  | 'notifications'
  | 'announcement-detail'
  | 'complaints'
  | 'complaint-new'
  | 'complaint-detail'
  | 'leaves'
  | 'leave-new'
  | 'leave-detail'
  | 'access'
  | 'access-new'
  | 'access-detail';
export default function StudentHomePage({
  view = 'overview',
}: {
  view?: StudentView;
}) {
  const title = {
    overview: 'Overview',
    profile: 'My profile',
    accommodation: 'Accommodation',
    qr: 'My QR code',
    attendance: 'Attendance',
    announcements: 'Announcements',
    notifications: 'Notifications',
    'announcement-detail': 'Announcement',
    complaints: 'Complaints',
    'complaint-new': 'New complaint',
    'complaint-detail': 'Complaint details',
    leaves: 'Leave requests',
    'leave-new': 'New leave request',
    'leave-detail': 'Leave request',
    access: 'Access requests',
    'access-new': 'New access request',
    'access-detail': 'Access request',
  }[view];
  const { account, signOut, retry: verifySession } = useAuth();
  const uid = account?.firebase_uid ?? '';
  const [attempt, setAttempt] = useState(0);
  const [editing, setEditing] = useState<string>();
  const [photoEditing, setPhotoEditing] = useState<string>();
  const [photoVersion, setPhotoVersion] = useState(0);
  const [profileNotice, setProfileNotice] = useState('');
  const [result, setResult] = useState<{
    uid: string;
    attempt: number;
    data?: OwnStudentProfile;
    error?: StudentPortalError;
  }>();
  const request = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
    heading.current?.scrollIntoView?.({ block: 'start', behavior: 'auto' });
  }, [view]);
  useEffect(() => {
    const controller = new AbortController();
    request.current = controller;
    getOwnProfile(uid, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setResult({ uid, attempt, data });
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setResult({ uid, attempt, error: portalError(reason) });
      });
    return () => controller.abort();
  }, [uid, attempt]);
  const invalidate = useCallback(
    (error: StudentPortalError) => {
      request.current?.abort();
      setResult((previous) => ({
        uid,
        attempt: previous?.attempt ?? 0,
        error,
      }));
    },
    [uid],
  );
  const invalidateAnnouncement = useCallback(
    (error: AnnouncementError) => {
      if (
        error.kind === 'session' ||
        error.kind === 'setup' ||
        error.kind === 'forbidden'
      )
        invalidate(new StudentPortalError(error.kind, error.message));
    },
    [invalidate],
  );
  const current =
    result?.uid === uid && result.attempt === attempt ? result : undefined;
  const data = current?.data;
  const error = current?.error;
  const loading = !current;
  const editingCurrent = editing === `${uid}:${data?.student_id}`;
  const editingPhoto = photoEditing === `${uid}:${data?.student_id}`;
  const refresh = () => setAttempt((n) => n + 1);
  return (
    <div className="portal-shell">
      <a className="skip-link" href="#student-content">
        Skip to content
      </a>
      <header className="portal-header">
        <Link to={routePaths.studentHome} className="brand">
          Hostel<span className="brand__accent">Hive</span>
        </Link>
        <span className="portal-workspace">Student portal</span>
        <NotificationBadge />
      </header>
      <div className="portal-body">
        <aside className="portal-sidebar">
          <StudentNavigation key={view} />
          <StudentAccountMenu
            key={uid}
            name={data?.full_name}
            email={account?.email ?? ''}
            signOut={signOut}
          />
        </aside>
        <main id="student-content" className="portal-main" tabIndex={-1}>
          <div className="portal-page-heading">
            <div>
              <p className="portal-kicker">Student / {title}</p>
              <h1 ref={heading} tabIndex={-1}>
                {view === 'overview' ? (
                  <>
                    Welcome to <em>HostelHive.</em>
                  </>
                ) : (
                  title
                )}
              </h1>
              <p className="portal-muted">
                {
                  {
                    overview:
                      'Your profile, accommodation and hostel access in one place.',
                    profile: 'Your personal and guardian details.',
                    accommodation: 'Your current hostel block, room and bed.',
                    qr: 'Your student identification code for the hostel scanner.',
                    attendance: 'Your recorded hostel entries and exits.',
                    announcements: 'Published hostel notices for all students.',
                    notifications: 'Your updates and unread notifications.',
                    'announcement-detail':
                      'Read the published hostel announcement.',
                    complaints: 'Report concerns and track staff responses.',
                    'complaint-new':
                      'Submit a maintenance or disciplinary concern.',
                    'complaint-detail':
                      'Your complaint, staff responses and update history.',
                    leaves: 'Request leave and follow your approval status.',
                    'leave-new':
                      'Submit your planned time away for staff review.',
                    'leave-detail':
                      'Your leave dates, reason and recorded decision.',
                    access:
                      'Request an early exit or late entry and track staff decisions.',
                    'access-new':
                      'Submit a planned movement for hostel staff review.',
                    'access-detail':
                      'Your planned movement, decision and recorded permission use.',
                  }[view]
                }
              </p>
            </div>
            {![
              'attendance',
              'announcements',
              'notifications',
              'announcement-detail',
              'complaints',
              'complaint-new',
              'complaint-detail',
              'leaves',
              'leave-new',
              'leave-detail',
              'access',
              'access-new',
              'access-detail',
            ].includes(view) && (
              <Button
                size="sm"
                variant="secondary"
                onClick={refresh}
                disabled={
                  loading ||
                  editingCurrent ||
                  editingPhoto ||
                  Boolean(error && isAccessError(error))
                }
              >
                {loading
                  ? 'Refreshing…'
                  : view === 'overview'
                    ? 'Refresh dashboard'
                    : 'Refresh'}
              </Button>
            )}
          </div>
          {loading && (
            <div className="portal-card" role="status">
              Loading your student dashboard…
            </div>
          )}
          {error && (
            <section
              className="portal-card"
              aria-labelledby="portal-error-title"
            >
              <h2 id="portal-error-title">
                {error.kind === 'not-found'
                  ? 'Student profile unavailable'
                  : isAccessError(error)
                    ? 'Student access needs verification'
                    : 'Unable to load your dashboard'}
              </h2>
              <p role="alert">{error.message}</p>
              <div className="portal-actions">
                {isAccessError(error) ? (
                  <>
                    <Button onClick={() => void verifySession()}>
                      Verify account access
                    </Button>
                    <Button variant="secondary" onClick={() => void signOut()}>
                      Sign in again
                    </Button>
                  </>
                ) : (
                  <Button onClick={refresh}>Retry dashboard</Button>
                )}
              </div>
            </section>
          )}
          {data && (
            <>
              {view === 'overview' && (
                <>
                  <section
                    className="portal-summary"
                    aria-label="Hostel summary"
                  >
                    <article className="portal-stat">
                      <NavigationIcon name="students" />
                      <p>Student ID</p>
                      <strong>{shown(data.index_no)}</strong>
                      <span>
                        {shown(data.faculty)} · Year {data.year}
                      </span>
                    </article>
                    <article className="portal-stat">
                      <NavigationIcon name="building" />
                      <p>Current accommodation</p>
                      <strong>
                        {data.accommodation
                          ? `${data.accommodation.block_name} · ${data.accommodation.room_no}`
                          : 'Not assigned'}
                      </strong>
                      <span>
                        {data.accommodation
                          ? `Bed ${data.accommodation.bed_no}`
                          : 'Contact staff for an allocation'}
                      </span>
                    </article>
                    <article className="portal-stat">
                      <NavigationIcon name="attendance" />
                      <p>Last recorded presence</p>
                      <strong
                        className={`portal-presence portal-presence--${data.presence.status.toLowerCase()}`}
                      >
                        {data.presence.status === 'IN'
                          ? 'In hostel'
                          : data.presence.status === 'OUT'
                            ? 'Outside hostel'
                            : 'Unknown'}
                      </strong>
                      <span>
                        {data.presence.updated_at
                          ? date(data.presence.updated_at)
                          : 'No scan recorded yet'}
                      </span>
                    </article>
                  </section>
                  <section
                    className="portal-shortcuts"
                    aria-label="Student pages"
                  >
                    <Link
                      className="portal-card"
                      to={routePaths.ownStudentProfile}
                    >
                      <NavigationIcon name="profile" />
                      <h2>View profile</h2>
                      <p className="portal-muted">
                        Personal, contact and guardian details.
                      </p>
                    </Link>
                    <Link
                      className="portal-card"
                      to={routePaths.ownStudentAccommodation}
                    >
                      <NavigationIcon name="building" />
                      <h2>View accommodation</h2>
                      <p className="portal-muted">
                        Your current block, room and bed.
                      </p>
                    </Link>
                    <Link className="portal-card" to={routePaths.ownStudentQR}>
                      <NavigationIcon name="qr" />
                      <h2>Open QR code</h2>
                      <p className="portal-muted">
                        Show your identification code when needed.
                      </p>
                    </Link>
                  </section>
                </>
              )}
              <div className="portal-page-content">
                {view === 'notifications' && <NotificationsPage embedded />}
                {view === 'announcements' && (
                  <AnnouncementList
                    key={uid}
                    uid={uid}
                    basePath={routePaths.ownAnnouncements}
                    onAccessError={invalidateAnnouncement}
                  />
                )}
                {view === 'announcement-detail' && (
                  <AnnouncementDetail
                    key={uid}
                    uid={uid}
                    basePath={routePaths.ownAnnouncements}
                    onAccessError={invalidateAnnouncement}
                  />
                )}
                {view === 'complaints' && (
                  <OwnComplaintList
                    key={uid + ':' + data.student_id}
                    uid={uid}
                    studentID={data.student_id}
                    onAccessError={invalidate}
                  />
                )}
                {view === 'complaint-new' && (
                  <OwnComplaintForm
                    key={uid + ':' + data.student_id}
                    uid={uid}
                    studentID={data.student_id}
                    onAccessError={invalidate}
                  />
                )}
                {view === 'complaint-detail' && (
                  <OwnComplaintDetail
                    key={uid + ':' + data.student_id}
                    uid={uid}
                    studentID={data.student_id}
                    onAccessError={invalidate}
                  />
                )}
                {view === 'access' && (
                  <OwnLateAccessList
                    key={uid + ':' + data.student_id}
                    uid={uid}
                    studentID={data.student_id}
                    onAccessError={invalidate}
                  />
                )}
                {view === 'access-new' && (
                  <OwnLateAccessForm
                    key={uid + ':' + data.student_id}
                    uid={uid}
                    studentID={data.student_id}
                    onAccessError={invalidate}
                  />
                )}
                {view === 'access-detail' && (
                  <OwnLateAccessDetail
                    key={uid + ':' + data.student_id}
                    uid={uid}
                    studentID={data.student_id}
                    onAccessError={invalidate}
                  />
                )}
                {view === 'leaves' && (
                  <OwnLeaveList
                    key={uid + ':' + data.student_id}
                    uid={uid}
                    studentID={data.student_id}
                    onAccessError={invalidate}
                  />
                )}
                {view === 'leave-new' && (
                  <OwnLeaveForm
                    key={uid + ':' + data.student_id}
                    uid={uid}
                    studentID={data.student_id}
                    onAccessError={invalidate}
                  />
                )}
                {view === 'leave-detail' && (
                  <OwnLeaveDetail
                    key={uid + ':' + data.student_id}
                    uid={uid}
                    studentID={data.student_id}
                    onAccessError={invalidate}
                  />
                )}
                {view === 'attendance' && (
                  <OwnAttendanceHistory
                    key={uid + ':' + attempt}
                    uid={uid}
                    onAccessError={invalidate}
                  />
                )}
                {(view === 'profile' || view === 'accommodation') && (
                  <div className="portal-stack">
                    {view === 'profile' && (
                      <section
                        id="my-profile"
                        className="portal-card portal-profile-card"
                        aria-labelledby="own-profile-title"
                      >
                        <p className="portal-kicker">Personal details</p>
                        <h2 id="own-profile-title">My profile</h2>
                        <Button
                          className="portal-profile-edit"
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setProfileNotice('');
                            setEditing(`${uid}:${data.student_id}`);
                          }}
                        >
                          <svg
                            aria-hidden="true"
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="m16 3 5 5-12 12-6 1 1-6z M14 5l5 5" />
                          </svg>
                          Edit profile
                        </Button>
                        {profileNotice && (
                          <p className="portal-profile-notice" role="status">
                            {profileNotice}
                          </p>
                        )}
                        <div className="portal-identity">
                          {data.profile_image_url ? (
                            <OwnStudentPhoto
                              key={`${uid}:${data.student_id}:${attempt}:${photoVersion}`}
                              uid={uid}
                              name={data.full_name}
                              onAccessError={invalidate}
                            />
                          ) : (
                            <div
                              className="portal-avatar"
                              aria-label="No profile photo"
                            >
                              {data.full_name
                                .trim()
                                .split(/\s+/)
                                .slice(0, 2)
                                .map((part) => part[0])
                                .join('') || 'S'}
                            </div>
                          )}
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={editingCurrent}
                            onClick={() => {
                              setProfileNotice('');
                              setPhotoEditing(`${uid}:${data.student_id}`);
                            }}
                          >
                            {data.profile_image_url
                              ? 'Change photo'
                              : 'Add photo'}
                          </Button>
                          <div>
                            <h3>{shown(data.full_name)}</h3>
                            <p className="portal-muted">
                              {shown(data.index_no)}
                            </p>
                          </div>
                        </div>
                        <Details
                          items={[
                            ['Email', shown(data.email)],
                            ['Phone', shown(data.contact_phone)],
                            ['Faculty', shown(data.faculty)],
                            ['Academic year', String(data.year)],
                          ]}
                        />
                        <div className="portal-guardians">
                          <h3>Guardian details</h3>
                          {data.guardians.length ? (
                            data.guardians.map((g) => (
                              <div
                                className="portal-guardian"
                                key={g.guardian_id}
                              >
                                <strong>{shown(g.name)}</strong>
                                <span>{shown(g.relationship)}</span>
                                <span>{shown(g.contact_phone)}</span>
                              </div>
                            ))
                          ) : (
                            <p className="portal-muted">
                              No guardian details recorded.
                            </p>
                          )}
                        </div>
                        <p className="portal-caption">
                          You can edit your phone and guardian details. Contact
                          your hostel administrator to correct your name,
                          registration number, email, faculty or academic year.
                        </p>
                        {editingPhoto && (
                          <OwnPhotoEditor
                            key={`${uid}:${data.student_id}`}
                            uid={uid}
                            profile={data}
                            onClose={() => {
                              setPhotoEditing(undefined);
                              refresh();
                            }}
                            onSaved={(profile, message) => {
                              setResult({ uid, attempt, data: profile });
                              setPhotoEditing(undefined);
                              setPhotoVersion((n) => n + 1);
                              setProfileNotice(message);
                            }}
                            onAccessError={(failure) => {
                              setPhotoEditing(undefined);
                              invalidate(failure);
                            }}
                          />
                        )}
                        {editingCurrent && (
                          <OwnProfileEditor
                            key={`${uid}:${data.student_id}`}
                            uid={uid}
                            profile={data}
                            onClose={() => {
                              setEditing(undefined);
                              refresh();
                            }}
                            onSaved={(profile, message) => {
                              setResult({ uid, attempt, data: profile });
                              setEditing(undefined);
                              setProfileNotice(message);
                            }}
                            onAccessError={(failure) => {
                              setEditing(undefined);
                              invalidate(failure);
                            }}
                          />
                        )}
                      </section>
                    )}
                    {view === 'accommodation' && (
                      <section
                        id="my-accommodation"
                        className="portal-card portal-accommodation-card"
                        aria-labelledby="own-accommodation-title"
                      >
                        <p className="portal-kicker">Your space</p>
                        <h2 id="own-accommodation-title">My accommodation</h2>
                        {data.accommodation ? (
                          <Details
                            items={[
                              ['Block', shown(data.accommodation.block_name)],
                              ['Room', shown(data.accommodation.room_no)],
                              ['Bed', shown(data.accommodation.bed_no)],
                              [
                                'Allocated since',
                                date(data.accommodation.started_at),
                              ],
                            ]}
                          />
                        ) : (
                          <div className="portal-empty-state">
                            <NavigationIcon name="building" />
                            <p className="portal-muted">
                              No bed is currently assigned to you. Contact your
                              hostel administrator for accommodation details.
                            </p>
                          </div>
                        )}
                      </section>
                    )}
                  </div>
                )}
                {view !== 'profile' && (
                  <div className="portal-stack">
                    {view === 'qr' && (
                      <OwnStudentQR
                        key={uid + ':' + data.student_id + ':' + attempt}
                        uid={uid}
                        name={data.full_name}
                        onAccessError={invalidate}
                      />
                    )}
                    {(view === 'overview' || view === 'accommodation') && (
                      <section
                        className="portal-card portal-note"
                        aria-labelledby="presence-note-title"
                      >
                        <h2 id="presence-note-title">About your presence</h2>
                        <p className="portal-muted">
                          Presence shows your last recorded scanner event. It
                          does not confirm your current location or grant
                          permission to leave or enter.
                        </p>
                        <p className="portal-caption">
                          Times are shown in your device’s timezone. Use Refresh
                          dashboard after a scan or an allocation change.
                        </p>
                      </section>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
          <AppFooter />
        </main>
      </div>
    </div>
  );
}
