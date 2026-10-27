import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { ReportPage } from '../reports.types';
import { routePaths } from '../../../app/router/routePaths';

function Time({
  value,
  zone,
}: {
  value: string | null | undefined;
  zone: string;
}) {
  if (!value) return <>Not recorded</>;
  let shown: string;
  try {
    shown = new Date(value).toLocaleString(undefined, {
      timeZone: zone,
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    shown = `${new Date(value).toLocaleString()} (device time; stored timezone unavailable)`;
  }
  return <time dateTime={value}>{shown}</time>;
}
function Student({ id }: { id: string }) {
  return <Link to={`${routePaths.students}/${id}`}>{id}</Link>;
}
function Metrics({ items }: { items: [string, number][] }) {
  return (
    <dl className="report-metrics">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label.replaceAll('_', ' ')}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
function Table({
  headers,
  children,
}: {
  headers: string[];
  children: ReactNode;
}) {
  return (
    <div
      className="report-table-scroll"
      role="region"
      aria-label="Report table"
      tabIndex={0}
    >
      <table>
        <thead>
          <tr>
            {headers.map((title) => (
              <th scope="col" key={title}>
                {title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
export default function ReportResults({ page }: { page: ReportPage }) {
  const zone = page.timezone;
  return (
    <>
      <div className="report-applied">
        <strong>Applied dates:</strong> {page.from} to {page.to} inclusive ·{' '}
        <strong>Hostel timezone:</strong> {zone}
      </div>
      <h3>Full filtered period summary</h3>
      {page.kind === 'attendance' || page.kind === 'daily' ? (
        <>
          <Metrics items={Object.entries(page.summary)} />
          <p className="report-caption">
            Counts are recorded movements. Distinct students counts each student
            once across the period; daily distinct counts must not be added to
            obtain the period total. These are not absence or physical-location
            counts.
          </p>
        </>
      ) : page.kind === 'leaves' ? (
        <Metrics items={Object.entries(page.summary)} />
      ) : (
        <>
          <h4>By current status</h4>
          <Metrics items={Object.entries(page.summary.by_status)} />
          <h4>By category</h4>
          <Metrics items={Object.entries(page.summary.by_category)} />
          <p className="report-caption">
            Status and category are independent breakdowns of the same
            complaints.
          </p>
        </>
      )}
      <p role="status">
        {page.total} matching{' '}
        {page.kind === 'daily' ? 'calendar dates' : 'records'}.
        {page.items.length > 0 &&
          ` Showing ${page.offset + 1}–${page.offset + page.items.length}.`}
      </p>
      {!page.items.length ? (
        <p>
          {page.offset
            ? 'No results on this page. Use Previous or refresh.'
            : 'No records match the applied filters.'}
        </p>
      ) : page.kind === 'attendance' ? (
        <Table
          headers={[
            'Student profile',
            'Direction',
            'Movement time',
            'Permission assessment',
            'References',
          ]}
        >
          {page.items.map((row) => (
            <tr key={`${row.device_id}:${row.event_id}`}>
              <td>
                <Student id={row.student_id} />
              </td>
              <td>{row.direction}</td>
              <td>
                <Time value={row.occurred_at} zone={zone} />
              </td>
              <td>
                {row.access_result
                  ? row.access_result.replaceAll('_', ' ')
                  : 'Not specified (legacy record)'}
              </td>
              <td>
                <details>
                  <summary>Movement references</summary>
                  <dl>
                    <dt>Scanner</dt>
                    <dd>{row.device_id}</dd>
                    <dt>Event</dt>
                    <dd>{row.event_id}</dd>
                    {row.late_access_id && (
                      <>
                        <dt>Permission</dt>
                        <dd>
                          <Link
                            to={`${routePaths.lateAccess}/${row.late_access_id}`}
                          >
                            {row.late_access_id}
                          </Link>
                        </dd>
                      </>
                    )}
                    {row.incident_id && (
                      <>
                        <dt>Incident</dt>
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
        </Table>
      ) : page.kind === 'daily' ? (
        <Table
          headers={[
            'Hostel calendar date',
            'Entries',
            'Exits',
            'Distinct students',
          ]}
        >
          {page.items.map((row) => (
            <tr key={row.date}>
              <th scope="row">{row.date}</th>
              <td>{row.entries}</td>
              <td>{row.exits}</td>
              <td>{row.distinct_students}</td>
            </tr>
          ))}
        </Table>
      ) : page.kind === 'leaves' ? (
        <Table
          headers={[
            'Leave request',
            'Student profile',
            'Planned leave',
            'Current status',
            'Submission and decision',
          ]}
        >
          {page.items.map((row) => (
            <tr key={row.leave_id}>
              <td>
                {row.status === 'cancelled' ? (
                  <span>{row.leave_id}</span>
                ) : (
                  <Link to={`${routePaths.leaves}/${row.leave_id}`}>
                    {row.leave_id}
                  </Link>
                )}
                <p className="report-prose">{row.reason}</p>
              </td>
              <td>
                <Student id={row.student_id} />
              </td>
              <td>
                <Time value={row.starts_at} zone={zone} />
                <br />
                to <Time value={row.ends_at} zone={zone} />
              </td>
              <td>{row.status}</td>
              <td>
                <Time value={row.created_at} zone={zone} />
                <details>
                  <summary>Decision / cancellation details</summary>
                  <dl>
                    <dt>Submitted by</dt>
                    <dd>{row.submitted_by}</dd>
                    <dt>Decided at</dt>
                    <dd>
                      <Time value={row.decided_at} zone={zone} />
                    </dd>
                    <dt>Decided by</dt>
                    <dd>{row.decided_by ?? 'Not recorded'}</dd>
                    <dt>Decision note</dt>
                    <dd className="report-prose">
                      {row.decision_note || 'Not recorded'}
                    </dd>
                    {row.status === 'cancelled' && (
                      <>
                        <dt>Cancelled at</dt>
                        <dd>
                          <Time value={row.cancelled_at} zone={zone} />
                        </dd>
                        <dt>Cancelled by</dt>
                        <dd>{row.cancelled_by}</dd>
                      </>
                    )}
                  </dl>
                </details>
              </td>
            </tr>
          ))}
        </Table>
      ) : (
        <Table
          headers={[
            'Complaint',
            'Student profile',
            'Category',
            'Current status',
            'Submission and resolution',
          ]}
        >
          {page.items.map((row) => (
            <tr key={row.complaint_id}>
              <td>
                <Link to={`${routePaths.complaints}/${row.complaint_id}`}>
                  {row.complaint_id}
                </Link>
                <p className="report-prose">{row.description}</p>
              </td>
              <td>
                <Student id={row.student_id} />
              </td>
              <td>{row.category}</td>
              <td>{row.status.replaceAll('_', ' ')}</td>
              <td>
                <Time value={row.created_at} zone={zone} />
                <details>
                  <summary>Resolution details</summary>
                  {row.resolution ? (
                    <dl>
                      <dt>Resolved at</dt>
                      <dd>
                        <Time value={row.resolution.resolved_at} zone={zone} />
                      </dd>
                      <dt>Resolved by</dt>
                      <dd>{row.resolution.resolved_by}</dd>
                      <dt>Resolution note</dt>
                      <dd className="report-prose">
                        {row.resolution.note || 'Not recorded'}
                      </dd>
                    </dl>
                  ) : (
                    <p>
                      No recorded resolution. Legacy resolved records may have
                      no retained resolution update.
                    </p>
                  )}
                </details>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
