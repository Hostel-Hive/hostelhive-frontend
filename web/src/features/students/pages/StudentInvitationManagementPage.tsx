import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../../../shared/components/ui/Button';
import NavigationIcon from '../../../layouts/components/NavigationIcon';
import { routePaths } from '../../../app/router/routePaths';
import useAuth from '../../auth/hooks/useAuth';
import {
  invitationAccessDenied,
  listStudentInvitations,
  type InvitationPage,
} from '../api/invitation-management.api';
import InvitationDialog from '../components/InvitationDialog';
import '../../../styles/student-invitations.css';

export default function StudentInvitationManagementPage() {
  const { account } = useAuth();
  if (account?.role !== 'admin')
    return (
      <p role="alert">
        Student invitation management is available to administrators only.
      </p>
    );
  return (
    <InvitationDirectory
      key={account.firebase_uid}
      uid={account.firebase_uid}
    />
  );
}
function InvitationDirectory({ uid }: { uid: string }) {
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [response, setResponse] = useState<{
    key: string;
    page?: InvitationPage;
    error?: string;
  }>();
  const [denied, setDenied] = useState('');
  const [selected, setSelected] = useState<string>();
  const key = `${offset}:${revision}`;
  const current = response?.key === key ? response : undefined;
  const page = !denied ? current?.page : undefined;
  const handleDenied = useCallback((message: string) => {
    setDenied(message);
    setSelected(undefined);
    setResponse(undefined);
  }, []);
  useEffect(() => {
    if (denied) return;
    const controller = new AbortController();
    void listStudentInvitations(uid, offset, controller.signal)
      .then((page) => {
        if (!controller.signal.aborted) setResponse({ key, page });
      })
      .catch((e) => {
        if (controller.signal.aborted) return;
        if (invitationAccessDenied(e)) handleDenied(e.message);
        else
          setResponse({
            key,
            error: 'Unable to load student invitations. Please try again.',
          });
      });
    return () => controller.abort();
  }, [uid, offset, revision, key, denied, handleDenied]);
  function refresh() {
    setRevision((v) => v + 1);
  }
  return (
    <section className="invitations-page" aria-labelledby="invitations-title">
      <Link className="invitation-back" to={routePaths.students}>
        ← Back to students
      </Link>
      <p className="eyebrow">Directory / Students / Invitations</p>
      <h1 id="invitations-title">Student invitations</h1>
      <p className="page-description">
        Track account setup invitations and request delivery again when needed.
      </p>
      <div className="invitations-panel">
        <div className="invitations-toolbar">
          <div className="invitations-heading">
            <span className="invitation-icon">
              <NavigationIcon name="students" />
            </span>
            <div>
              <h2>Invitation directory</h2>
              <p>Registered students and their email delivery progress.</p>
            </div>
          </div>
          <Button
            variant="secondary"
            disabled={!!selected || !!denied}
            onClick={() => {
              setOffset(0);
              refresh();
            }}
          >
            Refresh invitations
          </Button>
        </div>
        <p className="invitation-notice">
          Invitations are delivered in the background. Sent means the email
          provider accepted the request; account setup is tracked separately.
        </p>
        {denied ? (
          <p role="alert" className="invitation-error">
            {denied}
          </p>
        ) : current?.error ? (
          <div role="alert" className="invitation-error">
            <p>{current.error}</p>
            <Button variant="secondary" onClick={refresh}>
              Retry invitations
            </Button>
          </div>
        ) : !page ? (
          <p role="status" className="invitation-empty">
            Loading invitations…
          </p>
        ) : (
          <>
            {page.items.length ? (
              <div
                className="invitations-table-wrap"
                role="region"
                aria-label="Student invitations"
                tabIndex={0}
              >
                <table>
                  <caption>
                    {page.total}{' '}
                    {page.total === 1 ? 'invitation' : 'invitations'} · Newest
                    registrations first
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Student email</th>
                      <th scope="col">Email delivery</th>
                      <th scope="col">Account setup</th>
                      <th scope="col">Last requested</th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {page.items.map((row) => (
                      <tr key={row.invitation_id}>
                        <th scope="row">
                          <Link to={`${routePaths.students}/${row.student_id}`}>
                            {row.email}
                          </Link>
                          <span className="invitation-row-caption">
                            {row.attempts} / 8 delivery attempts
                          </span>
                        </th>
                        <td>
                          <span
                            className={`invitation-badge invitation-badge-${row.delivery_status}`}
                          >
                            {
                              {
                                pending: 'Pending',
                                sent: 'Sent',
                                failed: 'Failed',
                                skipped: 'Skipped',
                              }[row.delivery_status]
                            }
                          </span>
                        </td>
                        <td>
                          <span
                            className={`invitation-badge ${row.setup_completed_at ? 'invitation-badge-complete' : ''}`}
                          >
                            {row.setup_completed_at
                              ? 'Completed'
                              : 'Awaiting student'}
                          </span>
                        </td>
                        <td>
                          <time dateTime={row.last_requested_at}>
                            {new Date(row.last_requested_at).toLocaleString()}
                          </time>
                        </td>
                        <td>
                          <Button
                            variant="secondary"
                            size="sm"
                            aria-label={`View invitation for ${row.email}`}
                            onClick={() => setSelected(row.invitation_id)}
                          >
                            View invitation <span aria-hidden="true">↗</span>
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="invitation-empty">
                <h3>No invitations on this page</h3>
                <p>
                  {offset
                    ? 'Return to the previous page to view invitations.'
                    : 'New student registrations will appear here.'}
                </p>
                {!offset && (
                  <Link
                    className="button-link"
                    to={`${routePaths.students}/new`}
                  >
                    Register a student
                  </Link>
                )}
              </div>
            )}
            <div className="invitation-pagination">
              <Button
                variant="secondary"
                disabled={!offset || !!selected}
                onClick={() => setOffset((v) => Math.max(0, v - 20))}
              >
                Previous
              </Button>
              <span>Page {offset / 20 + 1}</span>
              <Button
                variant="secondary"
                disabled={!page.has_more || offset >= 1000000 || !!selected}
                onClick={() => setOffset((v) => v + 20)}
              >
                Next
              </Button>
            </div>
            <p className="invitation-caption">
              Times use your device timezone. Refresh to check the latest
              delivery and setup status.
            </p>
          </>
        )}
      </div>
      {selected && !denied && (
        <InvitationDialog
          key={selected}
          id={selected}
          uid={uid}
          onDenied={handleDenied}
          onClose={() => {
            setSelected(undefined);
            refresh();
          }}
        />
      )}
    </section>
  );
}
