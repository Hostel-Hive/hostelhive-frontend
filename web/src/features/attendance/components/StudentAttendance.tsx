import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { routePaths } from '../../../app/router/routePaths';
import Button from '../../../shared/components/ui/Button';
import useAuth from '../../auth/hooks/useAuth';
import {
  getStudentPresence,
  getStudentScans,
} from '../api/student-attendance.api';
import type { AttendanceError } from '../api/student-attendance.api';
import type { AccessResult, ScanOutcome } from '../attendance.types';
import useAttendanceRequest from '../hooks/useAttendanceRequest';
const outcomes: Record<ScanOutcome, string> = {
  recorded: 'Recorded movement',
  cooldown: 'Ignored: cooldown',
  already_in: 'Ignored: already IN',
  already_out: 'Ignored: already OUT',
};
const access: Record<AccessResult, string> = {
  approved: 'Approved',
  unapproved: 'Unapproved',
  not_required: 'Not required',
  not_evaluated: 'Not evaluated',
};
function DateTime({ value }: { value: string }) {
  return <time dateTime={value}>{new Date(value).toLocaleString()}</time>;
}
interface Props {
  studentID: string;
  uid: string;
}
function AttendanceControls({
  studentID,
  uid,
  denied,
}: Props & { denied: (error: AttendanceError) => void }) {
  const [opened, setOpened] = useState(false);
  const [offset, setOffset] = useState(0);
  const presenceLoad = useCallback(
    (signal: AbortSignal) => getStudentPresence(studentID, uid, signal),
    [studentID, uid],
  );
  const scanLoad = useCallback(
    (signal: AbortSignal, page: number) =>
      getStudentScans(studentID, uid, signal, page),
    [studentID, uid],
  );
  const presence = useAttendanceRequest(presenceLoad, denied);
  const scans = useAttendanceRequest(scanLoad, denied);
  function refresh() {
    setOpened(true);
    setOffset(0);
    void presence.run();
    void scans.run(0);
  }
  function page(next: number) {
    setOffset(next);
    void scans.run(next);
  }
  return (
    <>
      <p className="student-form-help">
        Read-only recorded presence and scan history. Only recorded movements
        establish presence; ignored attempts do not change it. These records do
        not prove physical occupancy.
      </p>
      <Button
        size="sm"
        variant="secondary"
        disabled={presence.pending || scans.pending}
        onClick={refresh}
      >
        {opened ? 'Refresh attendance' : 'Load attendance'}
      </Button>
      {opened && (
        <div className="attendance-sections">
          <section aria-labelledby="student-presence-title">
            <h3 id="student-presence-title">Recorded presence</h3>
            {presence.pending && (
              <p role="status">Loading recorded presence…</p>
            )}
            {presence.error && (
              <>
                <p role="alert">{presence.error.message}</p>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void presence.run()}
                >
                  Retry presence
                </Button>
              </>
            )}
            {presence.data && (
              <>
                <p>
                  <span
                    className={`student-badge attendance-presence attendance-presence--${presence.data.status.toLowerCase()}`}
                  >
                    {presence.data.status}
                  </span>
                </p>
                {presence.data.updated_at ? (
                  <p>
                    Last recorded change:{' '}
                    <DateTime value={presence.data.updated_at} />
                  </p>
                ) : (
                  <p>
                    No recorded movement has established presence. UNKNOWN does
                    not mean OUT.
                  </p>
                )}
              </>
            )}
          </section>
          <section aria-labelledby="student-scans-title">
            <h3 id="student-scans-title">Movement and scan history</h3>
            <p className="student-form-help">
              Times are shown in your browser’s local time. Only rows marked
              Recorded movement count as movements. Permission assessment is
              reported separately; missing legacy assessments are not assumed
              approved.
            </p>
            {scans.pending && (
              <p role="status">Loading movement and scan history…</p>
            )}
            {scans.error && (
              <>
                <p role="alert">{scans.error.message}</p>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void scans.run(offset)}
                >
                  Retry scan history
                </Button>
              </>
            )}
            {scans.data && (
              <>
                {!scans.data.items.length ? (
                  <p role="status">
                    {offset
                      ? 'No scans on this page. Use Previous to return.'
                      : 'No scan history for this student.'}
                  </p>
                ) : (
                  <div
                    className="student-table-wrap"
                    role="region"
                    aria-label="Student movement and scan history"
                    tabIndex={0}
                  >
                    <table className="student-table">
                      <caption>
                        Recorded and ignored scans · newest first ·{' '}
                        {scans.data.items.length} on this page
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">Time</th>
                          <th scope="col">Scan direction</th>
                          <th scope="col">Result</th>
                          <th scope="col">Permission assessment</th>
                          <th scope="col">Reference</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scans.data.items.map((row) => (
                          <tr key={`${row.device_id}:${row.event_id}`}>
                            <td>
                              <DateTime value={row.occurred_at} />
                            </td>
                            <td>{row.direction}</td>
                            <td>
                              <span
                                className={`student-badge ${row.outcome === 'recorded' ? 'student-badge--active' : ''}`}
                              >
                                {outcomes[row.outcome]}
                              </span>
                            </td>
                            <td>
                              {row.access_result
                                ? access[row.access_result]
                                : 'Not specified'}
                            </td>
                            <td>
                              <details>
                                <summary>Scan reference</summary>
                                <dl className="attendance-reference">
                                  <dt>Event ID</dt>
                                  <dd>{row.event_id}</dd>
                                  <dt>Scanner ID</dt>
                                  <dd>{row.device_id}</dd>
                                  {row.late_access_id && (
                                    <>
                                      <dt>Permission ID</dt>
                                      <dd>{row.late_access_id}</dd>
                                    </>
                                  )}
                                  {row.incident_id && (
                                    <>
                                      <dt>Incident ID</dt>
                                      <dd>
                                        <Link
                                          to={`${routePaths.attendanceIncidents}/${row.incident_id}`}
                                        >
                                          {row.incident_id}
                                        </Link>
                                      </dd>
                                    </>
                                  )}
                                </dl>
                              </details>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <nav
                  className="student-pagination"
                  aria-label="Student scan history pagination"
                >
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={scans.pending || offset === 0}
                    onClick={() => page(Math.max(0, offset - 20))}
                  >
                    Previous scans
                  </Button>
                  <span>Page {Math.floor(offset / 20) + 1}</span>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={
                      scans.pending ||
                      !scans.data.has_more ||
                      offset + 20 > 1000000
                    }
                    onClick={() => page(offset + 20)}
                  >
                    Next scans
                  </Button>
                </nav>
              </>
            )}
          </section>
          <p className="student-form-help">
            Presence and history are separate server snapshots. Refresh resets
            history to page 1 and retrieves both again. This page does not
            submit scans, correct records, or update attendance automatically.
          </p>
        </div>
      )}
    </>
  );
}
function AttendanceSession(props: Props) {
  const { signOut } = useAuth();
  const [blocked, setBlocked] = useState<AttendanceError | null>(null);
  const denied = useCallback((error: AttendanceError) => setBlocked(error), []);
  if (blocked)
    return (
      <>
        <p role="alert">{blocked.message}</p>
        {blocked.kind === 'session' && (
          <Button size="sm" variant="secondary" onClick={() => void signOut()}>
            Sign in again
          </Button>
        )}
      </>
    );
  return <AttendanceControls {...props} denied={denied} />;
}
export default function StudentAttendance(props: Props) {
  return (
    <section
      className="student-card student-attendance"
      aria-labelledby="student-attendance-title"
    >
      <h2 id="student-attendance-title">Presence and movements</h2>
      <AttendanceSession key={`${props.uid}:${props.studentID}`} {...props} />
    </section>
  );
}
