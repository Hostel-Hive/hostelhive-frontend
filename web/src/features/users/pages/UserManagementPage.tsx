import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { routePaths } from '../../../app/router/routePaths';
import useAuth from '../../auth/hooks/useAuth';
import Button from '../../../shared/components/ui/Button';
import AccountDialog from '../components/AccountDialog';
import {
  listUsers,
  roleLabels,
  userOffset,
  UserManagementError,
  type UserPage,
  type ManagedUser,
  type AccountAction,
} from '../api/users.api';
import '../../../styles/user-management.css';

export default function UserManagementPage() {
  const { account } = useAuth();
  if (!account || account.role !== 'admin' || !account.is_active)
    return (
      <p role="alert">User management requires an active Admin account.</p>
    );
  return (
    <Workspace
      key={`${account.firebase_uid}:${account.user_id}:${account.role}`}
      uid={account.firebase_uid}
    />
  );
}
function Workspace({ uid }: { uid: string }) {
  const { retry, signOut } = useAuth();
  const [params, setParams] = useSearchParams();
  const offset = userOffset(params);
  const [revision, setRevision] = useState(0);
  const key = `${offset}:${revision}`;
  const [result, setResult] = useState<{
    key: string;
    page?: UserPage;
    error?: string;
    denied?: boolean;
  }>();
  const [selection, setSelection] = useState<{
    user: ManagedUser;
    kind: AccountAction['kind'];
  }>();
  const [denial, setDenial] = useState('');
  const [notice, setNotice] = useState('');
  const [checking, setChecking] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const mounted = useRef(false);
  const recoveryBusy = useRef(false);
  const current = result?.key === key ? result : undefined;
  const denied = denial || (current?.denied ? current.error : '');
  const page = denied ? undefined : current?.page;
  useEffect(() => {
    mounted.current = true;
    heading.current?.focus();
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (offset === null || denial) return;
    const controller = new AbortController();
    void listUsers(uid, controller.signal, offset)
      .then((page) => {
        if (!controller.signal.aborted) setResult({ key, page });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setResult({
            key,
            error:
              error instanceof Error
                ? error.message
                : 'Accounts could not be loaded. Please try again.',
            denied:
              error instanceof UserManagementError &&
              ['session', 'forbidden'].includes(error.kind),
          });
      });
    return () => controller.abort();
  }, [uid, offset, key, denial]);
  function refresh() {
    setSelection(undefined);
    setRevision((value) => value + 1);
  }
  function deny(message: string) {
    setSelection(undefined);
    setResult(undefined);
    setDenial(message);
    heading.current?.focus();
  }
  async function checkAccess() {
    if (recoveryBusy.current) return;
    recoveryBusy.current = true;
    setChecking(true);
    try {
      await retry();
      if (mounted.current) {
        setResult(undefined);
        setDenial('');
        setRevision((value) => value + 1);
      }
    } catch {
      if (mounted.current)
        setDenial('Access could not be verified. Try again or sign out.');
    } finally {
      recoveryBusy.current = false;
      if (mounted.current) setChecking(false);
    }
  }
  return (
    <section className="users-page" aria-labelledby="users-title">
      <p className="eyebrow">Admin / Accounts</p>
      <h1 id="users-title" ref={heading} tabIndex={-1}>
        User management
      </h1>
      <p>
        Manage account roles and access. Account deactivation is separate from
        student profile archiving.
      </p>
      {denied ? (
        <div className="account-panel">
          <p role="alert">{denied}</p>
          <div className="account-actions">
            <Button disabled={checking} onClick={() => void checkAccess()}>
              Check access again
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                void signOut().catch(() => {
                  if (mounted.current)
                    setDenial(
                      'Sign out could not be confirmed. Please try again.',
                    );
                });
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      ) : offset === null ? (
        <div>
          <p role="alert">
            Invalid page. User management supports pagination only.
          </p>
          <Button onClick={() => setParams({})}>Return to first page</Button>
        </div>
      ) : (
        <div className="account-panel" aria-busy={!current}>
          <Button
            variant="secondary"
            onClick={() => {
              setNotice('');
              refresh();
            }}
          >
            Refresh accounts
          </Button>
          {notice && <p role="status">{notice} Refreshing the account list.</p>}
          {!current ? (
            <p role="status">Loading accounts…</p>
          ) : current.error ? (
            <>
              <p role="alert">{current.error}</p>
              <Button onClick={refresh}>Retry accounts</Button>
            </>
          ) : (
            page && (
              <>
                {page.users.length === 0 ? (
                  <p role="status">
                    {offset
                      ? 'No accounts on this page. Return to a previous page.'
                      : 'No accounts found.'}
                  </p>
                ) : (
                  <div
                    className="accounts-table-wrap"
                    role="region"
                    aria-label="User accounts"
                    tabIndex={0}
                  >
                    <table>
                      <caption>Account access and roles</caption>
                      <thead>
                        <tr>
                          <th scope="col">Account</th>
                          <th scope="col">Role</th>
                          <th scope="col">Access</th>
                          <th scope="col">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {page.users.map((user) => (
                          <tr key={user.user_id}>
                            <th scope="row">
                              {user.full_name && (
                                <span className="account-name">
                                  {user.full_name}
                                </span>
                              )}
                              <span>{user.email}</span>
                              {user.firebase_uid === uid && <span> (you)</span>}
                              <small>{user.user_id}</small>
                              {user.designation && (
                                <small>{user.designation}</small>
                              )}
                            </th>
                            <td>{roleLabels[user.role]}</td>
                            <td>{user.is_active ? 'Active' : 'Inactive'}</td>
                            <td>
                              <div className="account-actions">
                                {user.role !== 'student' && (
                                  <Link
                                    to={routePaths.staffNew}
                                    state={{
                                      staffAccount: user,
                                      staffActor: uid,
                                    }}
                                    aria-label={`Set up staff profile for ${user.email}`}
                                  >
                                    Set up staff profile
                                  </Link>
                                )}
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  aria-label={`Change role for ${user.email}`}
                                  onClick={() =>
                                    setSelection({ user, kind: 'role' })
                                  }
                                >
                                  Change role
                                </Button>
                                <Button
                                  variant={
                                    user.is_active ? 'danger' : 'secondary'
                                  }
                                  size="sm"
                                  aria-label={`${user.is_active ? 'Deactivate' : 'Activate'} ${user.email}`}
                                  onClick={() =>
                                    setSelection({
                                      user,
                                      kind: user.is_active
                                        ? 'deactivate'
                                        : 'activate',
                                    })
                                  }
                                >
                                  {user.is_active ? 'Deactivate' : 'Activate'}
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <nav
                  className="account-actions account-pagination"
                  aria-label="Account pages"
                >
                  <Button
                    variant="secondary"
                    disabled={offset === 0}
                    onClick={() => {
                      setNotice('');
                      setParams(
                        offset > 20 ? { offset: String(offset - 20) } : {},
                      );
                    }}
                  >
                    Previous
                  </Button>
                  <span role="status">Page {Math.floor(offset / 20) + 1}</span>
                  <Button
                    variant="secondary"
                    disabled={!page.has_more || offset + 20 > 1000000}
                    onClick={() => {
                      setNotice('');
                      setParams({ offset: String(offset + 20) });
                    }}
                  >
                    Next
                  </Button>
                </nav>
              </>
            )
          )}
        </div>
      )}
      {selection && page && (
        <AccountDialog
          user={selection.user}
          kind={selection.kind}
          uid={uid}
          onClose={() => setSelection(undefined)}
          onRefresh={() => {
            setNotice(
              'Review the refreshed account state before making another change.',
            );
            refresh();
          }}
          onDenied={deny}
          onSaved={(message, selfChanged) => {
            if (selfChanged) {
              deny(
                `${message} Your account access has changed. Check access again.`,
              );
              return;
            }
            setNotice(message);
            refresh();
          }}
        />
      )}
    </section>
  );
}
