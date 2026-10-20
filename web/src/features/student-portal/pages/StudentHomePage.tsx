import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { routePaths } from '../../../app/router/routePaths';
import useAuth from '../../auth/hooks/useAuth';
import Button from '../../../shared/components/ui/Button';
import AppFooter from '../../../layouts/components/AppFooter';
import {
  getOwnProfile,
  portalError,
  isAccessError,
} from '../api/student-portal.api';
import type { StudentPortalError } from '../api/student-portal.api';
import type { OwnStudentProfile } from '../student-portal.types';
import OwnStudentPhoto from '../components/OwnStudentPhoto';
import OwnStudentQR from '../components/OwnStudentQR';
import StudentAccountMenu from '../components/StudentAccountMenu';
import OwnAttendanceHistory from '../components/OwnAttendanceHistory';
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
  'overview' | 'profile' | 'accommodation' | 'qr' | 'attendance';
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
  }[view];
  const { account, signOut, retry: verifySession } = useAuth();
  const uid = account?.firebase_uid ?? '';
  const [attempt, setAttempt] = useState(0);
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
  const current =
    result?.uid === uid && result.attempt === attempt ? result : undefined;
  const data = current?.data;
  const error = current?.error;
  const loading = !current;
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
      </header>
      <div className="portal-body">
        <aside className="portal-sidebar">
          <p className="portal-nav-heading">My workspace</p>
          <nav aria-label="Student navigation">
            <NavLink end to={routePaths.studentHome}>
              Overview
            </NavLink>
            <NavLink to={routePaths.ownStudentAccommodation}>
              Accommodation
            </NavLink>
            <NavLink to={routePaths.ownStudentQR}>My QR code</NavLink>
            <NavLink to={routePaths.ownStudentAttendance}>Attendance</NavLink>
          </nav>
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
                  }[view]
                }
              </p>
            </div>
            {view !== 'attendance' && (
              <Button
                size="sm"
                variant="secondary"
                onClick={refresh}
                disabled={loading || Boolean(error && isAccessError(error))}
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
                      <p>Student ID</p>
                      <strong>{shown(data.index_no)}</strong>
                      <span>
                        {shown(data.faculty)} · Year {data.year}
                      </span>
                    </article>
                    <article className="portal-stat">
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
                      <h2>View profile</h2>
                      <p className="portal-muted">
                        Personal, contact and guardian details.
                      </p>
                    </Link>
                    <Link
                      className="portal-card"
                      to={routePaths.ownStudentAccommodation}
                    >
                      <h2>View accommodation</h2>
                      <p className="portal-muted">
                        Your current block, room and bed.
                      </p>
                    </Link>
                    <Link className="portal-card" to={routePaths.ownStudentQR}>
                      <h2>Open QR code</h2>
                      <p className="portal-muted">
                        Show your identification code when needed.
                      </p>
                    </Link>
                  </section>
                </>
              )}
              <div className="portal-page-content">
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
                        className="portal-card"
                        aria-labelledby="own-profile-title"
                      >
                        <p className="portal-kicker">Personal details</p>
                        <h2 id="own-profile-title">My profile</h2>
                        <div className="portal-identity">
                          {data.profile_image_url ? (
                            <OwnStudentPhoto
                              key={uid + ':' + data.student_id + ':' + attempt}
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
                          Contact your hostel administrator to correct profile
                          or guardian details.
                        </p>
                      </section>
                    )}
                    {view === 'accommodation' && (
                      <section
                        id="my-accommodation"
                        className="portal-card"
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
                          <p className="portal-muted">
                            No bed is currently assigned to you. Contact your
                            hostel administrator for accommodation details.
                          </p>
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
