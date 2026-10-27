import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { routePaths } from '../../../app/router/routePaths';
import Button from '../../../shared/components/ui/Button';
import { getRecentIncidents } from '../api/warden-overview.api';
import type { OverviewError } from '../api/admin-overview.api';
import useOverviewRead from '../hooks/useOverviewRead';

export default function RecentIncidents({
  uid,
  revision,
  denied,
}: {
  uid: string;
  revision: number;
  denied: (error: OverviewError) => void;
}) {
  const load = useCallback(
    (signal: AbortSignal) => getRecentIncidents(uid, signal),
    [uid],
  );
  const request = useOverviewRead(
    `${uid}:recent-incidents:${revision}`,
    load,
    denied,
  );
  return (
    <section
      className="admin-overview-panel overview-recent-panel"
      aria-labelledby="recent-incidents-title"
    >
      <p className="eyebrow">Recorded incidents</p>
      <h2 id="recent-incidents-title">Recent attendance incidents</h2>
      <p className="admin-overview-caption">
        Latest recorded incidents, newest first. These are historical scanner
        records, not a list of unresolved cases or proof of current location.
      </p>
      {request.loading ? (
        <p role="status">Loading recent incidents…</p>
      ) : request.error ? (
        <>
          <p role="alert">{request.error.message}</p>
          <Button size="sm" variant="secondary" onClick={request.retry}>
            Retry recent incidents
          </Button>
        </>
      ) : (
        request.data && (
          <>
            <p>
              {request.data.total} recorded incidents. Showing the latest{' '}
              {request.data.items.length}.
            </p>
            {request.data.items.length ? (
              <ol className="overview-recent-incidents">
                {request.data.items.map((incident) => (
                  <li key={incident.incident_id}>
                    <h3>
                      <Link
                        to={`${routePaths.attendanceIncidents}/${incident.incident_id}`}
                      >
                        {incident.incident_type === 'early_exit'
                          ? 'Early exit without permission'
                          : 'Late entry without permission'}
                      </Link>
                    </h3>
                    <p>
                      {incident.direction} ·{' '}
                      <time dateTime={incident.occurred_at}>
                        {new Date(incident.occurred_at).toLocaleString()}
                      </time>
                    </p>
                    <Link to={`${routePaths.students}/${incident.student_id}`}>
                      View student profile
                    </Link>
                  </li>
                ))}
              </ol>
            ) : (
              <p>No attendance incidents have been recorded.</p>
            )}
            <p className="admin-overview-caption">
              Times use your device timezone (
              {Intl.DateTimeFormat().resolvedOptions().timeZone}). Fetched{' '}
              {new Date(request.fetchedAt!).toLocaleTimeString(undefined, {
                hour: '2-digit',
                minute: '2-digit',
              })}
              .
            </p>
          </>
        )
      )}
      <Link to={routePaths.attendanceIncidents}>
        View all attendance incidents
      </Link>
    </section>
  );
}
