import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import useAuth from '../../auth/hooks/useAuth';
import Button from '../../../shared/components/ui/Button';
import { routePaths } from '../../../app/router/routePaths';
import { getPresenceSummary } from '../../attendance/api/staff-attendance.api';
import { getOverviewBlocks, getOverviewCount } from '../api/admin-overview.api';
import type { OverviewError, OverviewMetric } from '../api/admin-overview.api';
import useOverviewRead from '../hooks/useOverviewRead';
import type { OverviewRead } from '../hooks/useOverviewRead';
import '../../../styles/admin-overview.css';

const metrics = {
  leaves: {
    label: 'Pending leave requests',
    link: `${routePaths.leaves}?status=pending`,
    action: 'Review pending leave requests',
  },
  access: {
    label: 'Pending access requests',
    link: `${routePaths.lateAccess}?status=pending`,
    action: 'Review pending access requests',
  },
  pendingComplaints: {
    label: 'Pending complaints',
    link: `${routePaths.complaints}?status=pending`,
    action: 'Review pending complaints',
  },
  progressComplaints: {
    label: 'Complaints in progress',
    link: `${routePaths.complaints}?status=in_progress`,
    action: 'Review complaints in progress',
  },
} as const;
export default function AdminDashboardPage() {
  const { account } = useAuth();
  if (!account || account.role !== 'admin' || !account.is_active)
    return <p role="alert">Admin access is required.</p>;
  return <Workspace key={account.firebase_uid} uid={account.firebase_uid} />;
}
function Workspace({ uid }: { uid: string }) {
  const { retry, signOut } = useAuth();
  const [denied, setDenied] = useState<OverviewError>();
  const [recovery, setRecovery] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  return (
    <section className="admin-overview">
      <p className="eyebrow">Staff / Overview</p>
      <h1 ref={heading} tabIndex={-1}>
        Admin dashboard
      </h1>
      <p className="page-description">
        Your hostel at a glance. Review outstanding work and open the tools you
        need.
      </p>
      {denied ? (
        <section className="admin-overview-panel">
          <p role="alert">{denied.message}</p>
          {recovery && <p role="alert">{recovery}</p>}
          <div className="admin-overview-actions">
            <Button
              size="sm"
              onClick={() =>
                void retry()
                  .then(() => {
                    setDenied(undefined);
                    setRecovery('');
                  })
                  .catch(() =>
                    setRecovery(
                      'Account access could not be verified. Try again.',
                    ),
                  )
              }
            >
              Verify account access
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                void signOut().catch(() =>
                  setRecovery('Sign-out could not be completed. Try again.'),
                )
              }
            >
              Sign in again
            </Button>
          </div>
        </section>
      ) : (
        <Overview uid={uid} denied={setDenied} />
      )}
    </section>
  );
}
function ReadStatus<T>({
  request,
  label,
}: {
  request: OverviewRead<T>;
  label: string;
}) {
  if (request.loading)
    return <p role="status">Loading {label.toLowerCase()}…</p>;
  if (request.error)
    return (
      <div>
        <p role="alert">{request.error.message}</p>
        <Button size="sm" variant="secondary" onClick={request.retry}>
          Retry {label.toLowerCase()}
        </Button>
      </div>
    );
  return request.fetchedAt ? (
    <p className="admin-overview-caption">
      Fetched{' '}
      <time dateTime={request.fetchedAt}>
        {new Date(request.fetchedAt).toLocaleTimeString(undefined, {
          hour: '2-digit',
          minute: '2-digit',
        })}
      </time>{' '}
      (device time).
    </p>
  ) : null;
}
function Metric<T>({
  label,
  value,
  request,
  link,
  action,
  caption,
}: {
  label: string;
  value?: number;
  request: OverviewRead<T>;
  link: string;
  action: string;
  caption?: string;
}) {
  return (
    <article className="admin-overview-metric" aria-label={label}>
      <h3>{label}</h3>
      <strong
        className="admin-overview-number"
        aria-label={value === undefined ? 'Count unavailable' : undefined}
      >
        {value === undefined ? '—' : value.toLocaleString()}
      </strong>
      <ReadStatus request={request} label={label} />
      {caption && <p className="admin-overview-caption">{caption}</p>}
      <Link to={link}>{action}</Link>
    </article>
  );
}
function CountMetric({
  kind,
  uid,
  revision,
  denied,
}: {
  kind: OverviewMetric;
  uid: string;
  revision: number;
  denied: (error: OverviewError) => void;
}) {
  const load = useCallback(
    (signal: AbortSignal) => getOverviewCount(kind, uid, signal),
    [kind, uid],
  );
  const request = useOverviewRead(`${uid}:${kind}:${revision}`, load, denied);
  return <Metric {...metrics[kind]} request={request} value={request.data} />;
}
function Overview({
  uid,
  denied,
}: {
  uid: string;
  denied: (error: OverviewError) => void;
}) {
  const [revision, setRevision] = useState(0);
  const [offset, setOffset] = useState(0);
  const loadPresence = useCallback(
    (signal: AbortSignal) => getPresenceSummary(uid, signal),
    [uid],
  );
  const loadBlocks = useCallback(
    (signal: AbortSignal) => getOverviewBlocks(uid, signal, offset),
    [uid, offset],
  );
  const presence = useOverviewRead(
    `${uid}:presence:${revision}`,
    loadPresence,
    denied,
  );
  const blocks = useOverviewRead(
    `${uid}:blocks:${offset}:${revision}`,
    loadBlocks,
    denied,
  );
  const blockRegion = useRef<HTMLDivElement>(null);
  const pageFocus = useRef(false);
  useEffect(() => {
    if (!blocks.loading && pageFocus.current) {
      pageFocus.current = false;
      blockRegion.current?.focus();
    }
  }, [blocks.loading]);
  return (
    <>
      <div className="admin-overview-toolbar">
        <h2>Overview</h2>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            setOffset(0);
            setRevision((n) => n + 1);
          }}
        >
          Refresh overview
        </Button>
      </div>
      <p className="admin-overview-caption">
        Each section is fetched separately and can reflect a different moment.
        Refresh reloads all summaries and returns accommodation to page 1.
        Missing data is shown as unavailable, never as zero.
      </p>
      <section className="admin-overview-grid" aria-label="Overview metrics">
        <Metric
          label="Active students"
          value={presence.data?.total}
          request={presence}
          link={routePaths.students}
          action="Manage students"
          caption="Active student accounts with non-archived profiles; not a count of every directory record."
        />
        <Metric
          label="Hostel blocks"
          value={blocks.data?.total}
          request={blocks}
          link={routePaths.inventory}
          action="Browse inventory"
        />
        {(Object.keys(metrics) as OverviewMetric[]).map((kind) => (
          <CountMetric
            key={kind}
            kind={kind}
            uid={uid}
            revision={revision}
            denied={denied}
          />
        ))}
      </section>
      <div className="admin-overview-columns">
        <section
          className="admin-overview-panel"
          aria-labelledby="overview-presence-title"
        >
          <p className="eyebrow">Attendance snapshot</p>
          <h2 id="overview-presence-title">Recorded presence</h2>
          <ReadStatus request={presence} label="Recorded presence" />
          {presence.data && (
            <dl
              className="admin-overview-presence"
              aria-label="Recorded presence counts"
            >
              {(['in', 'out', 'unknown'] as const).map((key) => (
                <div key={key}>
                  <dt>{key.toUpperCase()}</dt>
                  <dd>{presence.data![key].toLocaleString()}</dd>
                </div>
              ))}
            </dl>
          )}
          <p>
            Presence is the last accepted scanner movement, not proof of
            physical location. UNKNOWN does not mean outside.
          </p>
          <Link to={routePaths.attendance}>Open attendance dashboard</Link>
          <p className="admin-overview-caption">
            Use Attendance for live updates, search, filters and incidents. This
            overview refreshes on request.
          </p>
        </section>
        <section
          className="admin-overview-panel"
          aria-labelledby="overview-shortcuts-title"
        >
          <p className="eyebrow">Workspace</p>
          <h2 id="overview-shortcuts-title">Management shortcuts</h2>
          <nav
            className="admin-overview-shortcuts"
            aria-label="Admin management shortcuts"
          >
            <Link to={routePaths.studentImport}>Import student profiles</Link>
            <Link to={routePaths.attendanceIncidents}>
              Review attendance incidents
            </Link>
            <Link to={routePaths.reports}>Open reports and exports</Link>
            <Link to={routePaths.announcements}>Manage announcements</Link>
            <Link to={routePaths.notifications}>
              Open your notification inbox
            </Link>
          </nav>
        </section>
      </div>
      <section
        className="admin-overview-panel"
        aria-labelledby="overview-blocks-title"
      >
        <p className="eyebrow">Accommodation</p>
        <h2 id="overview-blocks-title">Accommodation by block</h2>
        <p className="admin-overview-caption">
          Figures belong to each block. This paginated list is not a hostel-wide
          bed total. Availability describes current allocations, not recorded
          presence.
        </p>
        <div
          ref={blockRegion}
          role="region"
          aria-label="Accommodation results"
          tabIndex={-1}
          aria-busy={blocks.loading}
        >
          <ReadStatus request={blocks} label="Accommodation" />
          {blocks.data && (
            <>
              <p>
                {blocks.data.total} hostel blocks.{' '}
                {blocks.data.items.length > 0 &&
                  `Showing ${offset + 1}–${offset + blocks.data.items.length}.`}
              </p>
              {blocks.data.items.length ? (
                <ul className="admin-overview-blocks">
                  {blocks.data.items.map((block) => (
                    <li key={block.block_id}>
                      <h3>
                        <Link
                          to={`${routePaths.inventory}?${new URLSearchParams({ block_id: block.block_id })}`}
                        >
                          {block.name}
                        </Link>
                      </h3>
                      <dl>
                        {(
                          [
                            ['Rooms', block.room_count],
                            ['Beds', block.capacity],
                            ['Occupied beds', block.occupied_beds],
                            ['Available beds', block.available_beds],
                          ] as const
                        ).map(([label, value]) => (
                          <div key={label}>
                            <dt>{label}</dt>
                            <dd>{value.toLocaleString()}</dd>
                          </div>
                        ))}
                      </dl>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>
                  {offset
                    ? 'No blocks on this page. Use Previous blocks or refresh the overview.'
                    : 'No accommodation blocks have been created yet.'}
                </p>
              )}
              <nav
                className="admin-overview-actions"
                aria-label="Accommodation pages"
              >
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={offset === 0}
                  onClick={() => {
                    setOffset((n) => Math.max(0, n - 20));
                    pageFocus.current = true;
                  }}
                >
                  Previous blocks
                </Button>
                <span>Page {offset / 20 + 1}</span>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={
                    !blocks.data.items.length ||
                    offset + blocks.data.items.length >= blocks.data.total ||
                    offset >= 100000
                  }
                  onClick={() => {
                    setOffset((n) => n + 20);
                    pageFocus.current = true;
                  }}
                >
                  Next blocks
                </Button>
              </nav>
            </>
          )}
        </div>
      </section>
    </>
  );
}
