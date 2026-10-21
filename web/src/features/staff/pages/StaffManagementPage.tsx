import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { routePaths } from '../../../app/router/routePaths';
import Button from '../../../shared/components/ui/Button';
import useAuth from '../../auth/hooks/useAuth';
import { roleLabels } from '../../users/api/users.api';
import {
  listStaff,
  getStaff,
  staffOffset,
  staffUUID,
  staffAccessError,
  type StaffPage,
  type StaffProfile,
} from '../api/staff.api';
import StaffEditor from '../components/StaffEditor';
import '../../../styles/staff-management.css';

export default function StaffManagementPage() {
  const { account } = useAuth();
  if (!account || account.role !== 'admin' || !account.is_active)
    return (
      <p role="alert">Staff management requires an active Admin account.</p>
    );
  return (
    <Workspace
      key={`${account.firebase_uid}:${account.user_id}`}
      uid={account.firebase_uid}
    />
  );
}
function Workspace({ uid }: { uid: string }) {
  const { retry, signOut } = useAuth();
  const { userID } = useParams();
  const [params, setParams] = useSearchParams();
  const offset = staffOffset(params);
  const invalid =
    offset === null || (userID !== undefined && !staffUUID(userID));
  const [revision, setRevision] = useState(0);
  const key = `${userID ?? 'list'}:${offset}:${revision}`;
  const [result, setResult] = useState<{
    key: string;
    page?: StaffPage;
    profile?: StaffProfile;
    error?: string;
    denied?: boolean;
  }>();
  const [editor, setEditor] = useState<{ key: string; userID: string }>();
  const [denial, setDenial] = useState('');
  const [notice, setNotice] = useState('');
  const [checking, setChecking] = useState(false);
  const busy = useRef(false);
  const mounted = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const current = result?.key === key ? result : undefined;
  const denied = denial || (current?.denied ? current.error : '');
  const profile = denied ? undefined : current?.profile;
  const page = denied ? undefined : current?.page;
  const editingProfile =
    editor?.key === key && !denied
      ? [profile, ...(page?.staff ?? [])].find(
          (row) => row?.user_id === editor.userID && row.role !== 'student',
        )
      : undefined;
  const back = `${routePaths.staff}${offset ? `?offset=${offset}` : ''}`;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    heading.current?.focus();
  }, [userID]);
  useEffect(() => {
    if (invalid || denial || offset === null) return;
    const controller = new AbortController();
    void (
      userID
        ? getStaff(userID, uid, controller.signal).then((profile) => ({
            profile,
          }))
        : listStaff(uid, controller.signal, offset).then((page) => ({ page }))
    )
      .then((value) => {
        if (!controller.signal.aborted) setResult({ key, ...value });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setResult({
            key,
            error:
              error instanceof Error
                ? error.message
                : 'Staff profiles are unavailable. Please try again.',
            denied: staffAccessError(error),
          });
      });
    return () => controller.abort();
  }, [uid, userID, offset, key, invalid, denial]);
  function refresh() {
    setEditor(undefined);
    setNotice('');
    setRevision((value) => value + 1);
  }
  async function checkAccess() {
    if (busy.current) return;
    busy.current = true;
    setChecking(true);
    try {
      await retry();
      if (mounted.current) {
        setResult(undefined);
        setDenial('');
        refresh();
      }
    } catch {
      if (mounted.current)
        setDenial('Access could not be verified. Try again or sign out.');
    } finally {
      busy.current = false;
      if (mounted.current) setChecking(false);
    }
  }
  return (
    <section className="staff-page" aria-labelledby="staff-title">
      <p className="eyebrow">Admin / Staff</p>
      <h1 id="staff-title" ref={heading} tabIndex={-1}>
        {userID ? 'Staff profile' : 'Staff management'}
      </h1>
      <p>
        Maintain staff names and designations. Manage account roles and access
        in <Link to={routePaths.users}>User management</Link>.
      </p>
      {userID && <Link to={back}>Back to staff directory</Link>}
      {!userID && !denied && (
        <Link className="button-link" to={routePaths.staffNew}>
          Add staff member
        </Link>
      )}
      {denied ? (
        <div className="staff-panel">
          <p role="alert">{denied}</p>
          <div className="staff-actions">
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
      ) : invalid ? (
        <div className="staff-panel">
          <p role="alert">
            Invalid staff address. Only a valid account ID and supported
            pagination can be used.
          </p>
          {userID ? (
            <Link to={routePaths.staff}>Return to staff directory</Link>
          ) : (
            <Button onClick={() => setParams({})}>Return to first page</Button>
          )}
        </div>
      ) : (
        <div className="staff-panel" aria-busy={!current}>
          <Button variant="secondary" onClick={refresh}>
            {userID ? 'Refresh profile' : 'Refresh staff directory'}
          </Button>
          {notice && <p role="status">{notice}</p>}
          {!current ? (
            <p role="status">
              Loading staff {userID ? 'profile' : 'directory'}…
            </p>
          ) : current.error ? (
            <>
              <p role="alert">{current.error}</p>
              <Button onClick={refresh}>
                Retry staff {userID ? 'profile' : 'directory'}
              </Button>
            </>
          ) : profile ? (
            <>
              <h2>{profile.full_name || 'Staff member'}</h2>
              <dl className="staff-details">
                {[
                  ['Full name', profile.full_name],
                  ['Designation', profile.designation],
                  ['Email', profile.email],
                  ['Account role', roleLabels[profile.role]],
                  ['Account access', profile.is_active ? 'Active' : 'Inactive'],
                  ['Account ID', profile.user_id],
                  ['Staff profile ID', profile.staff_id],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value || 'Not provided'}</dd>
                  </div>
                ))}
                <div>
                  <dt>Last updated</dt>
                  <dd>
                    <time dateTime={profile.updated_at}>
                      {new Date(profile.updated_at).toLocaleString()}
                    </time>
                  </dd>
                </div>
              </dl>
              <p>
                Times use your device’s timezone. Role and access status are
                read-only here.
              </p>
              {profile.role === 'student' ? (
                <p>
                  This account no longer has a staff role. Review its role in
                  User management before updating the profile.
                </p>
              ) : (
                <Button
                  onClick={() => setEditor({ key, userID: profile.user_id })}
                >
                  Edit profile
                </Button>
              )}
            </>
          ) : (
            page && (
              <>
                {page.staff.length === 0 ? (
                  <p role="status">
                    {offset
                      ? 'No staff profiles on this page. Return to a previous page.'
                      : 'No staff profiles found.'}
                  </p>
                ) : (
                  <div
                    className="staff-table-wrap"
                    role="region"
                    aria-label="Staff directory"
                    tabIndex={0}
                  >
                    <table>
                      <caption>Staff profiles</caption>
                      <thead>
                        <tr>
                          <th scope="col">Staff member</th>
                          <th scope="col">Designation</th>
                          <th scope="col">Account role</th>
                          <th scope="col">Account access</th>
                          <th scope="col">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {page.staff.map((row) => (
                          <tr key={row.staff_id}>
                            <th scope="row">
                              <Link
                                to={`${routePaths.staff}/${row.user_id}${offset ? `?offset=${offset}` : ''}`}
                              >
                                {row.full_name || row.email}
                              </Link>
                              <small>{row.email}</small>
                            </th>
                            <td>{row.designation || 'Not provided'}</td>
                            <td>{roleLabels[row.role]}</td>
                            <td>{row.is_active ? 'Active' : 'Inactive'}</td>
                            <td>
                              {row.role === 'student' ? (
                                <span>Review role in User management</span>
                              ) : (
                                <Button
                                  variant="secondary"
                                  aria-label={`Edit profile for ${row.full_name || row.email}`}
                                  onClick={() =>
                                    setEditor({ key, userID: row.user_id })
                                  }
                                >
                                  Edit profile
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <nav
                  className="staff-actions staff-pagination"
                  aria-label="Staff pages"
                >
                  <Button
                    variant="secondary"
                    disabled={offset === 0}
                    onClick={() => {
                      setNotice('');
                      setParams(
                        offset! > 20 ? { offset: String(offset! - 20) } : {},
                      );
                    }}
                  >
                    Previous
                  </Button>
                  <span role="status">Page {Math.floor(offset! / 20) + 1}</span>
                  <Button
                    variant="secondary"
                    disabled={!page.has_more || offset! + 20 > 100000}
                    onClick={() => {
                      setNotice('');
                      setParams({ offset: String(offset! + 20) });
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
      {editingProfile && (
        <StaffEditor
          key={`${uid}:${editingProfile.user_id}`}
          uid={uid}
          profile={editingProfile}
          onClose={() => setEditor(undefined)}
          onRefresh={refresh}
          onDenied={(message) => {
            setEditor(undefined);
            setResult(undefined);
            setDenial(message);
          }}
          onSaved={(saved) => {
            setEditor(undefined);
            setResult(
              page
                ? {
                    key,
                    page: {
                      ...page,
                      staff: page.staff.map((row) =>
                        row.user_id === saved.user_id ? saved : row,
                      ),
                    },
                  }
                : { key, profile: saved },
            );
            setNotice('Staff profile saved and confirmed.');
          }}
        />
      )}
    </section>
  );
}
