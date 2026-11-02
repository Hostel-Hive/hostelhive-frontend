import { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '../../../shared/components/ui/Button';
import NavigationIcon from '../../../layouts/components/NavigationIcon';
import useAuth from '../../auth/hooks/useAuth';
import type { StaffAccount } from '../../auth/auth.types';
import { StaffError, staffAccessError } from '../api/staff.api';
import { getOwnStaffProfile, type OwnStaffProfile } from '../api/own-staff.api';
import OwnStaffNameEditor from '../components/OwnStaffNameEditor';
import '../../../styles/own-staff-profile.css';
export default function OwnStaffProfilePage() {
  const { account, retry, signOut } = useAuth();
  if (!account || account.role === 'student')
    return (
      <p role="alert">
        Staff self-service is available to Admins and Wardens only.
      </p>
    );
  return (
    <StaffProfile
      key={`${account.firebase_uid}:${account.user_id}:${account.role}:${account.email}`}
      uid={account.firebase_uid}
      userID={account.user_id}
      email={account.email}
      role={account.role}
      verify={() => retry(true)}
      signOut={signOut}
    />
  );
}
function StaffProfile({
  uid,
  userID,
  email,
  role,
  verify,
  signOut,
}: {
  uid: string;
  userID: string;
  email: string;
  role: StaffAccount['role'];
  verify: () => Promise<void>;
  signOut: () => Promise<void>;
}) {
  const account = useMemo<StaffAccount>(
    () => ({
      firebase_uid: uid,
      user_id: userID,
      email,
      role,
      is_active: true,
    }),
    [uid, userID, email, role],
  );
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    revision: number;
    data?: OwnStaffProfile;
    error?: string;
  }>();
  const [editing, setEditing] = useState(false);
  const [denied, setDenied] = useState('');
  const [notice, setNotice] = useState('');
  const data =
    !denied && result?.revision === revision ? result.data : undefined;
  const error = result?.revision === revision ? result.error : undefined;
  const onDenied = useCallback((message: string) => {
    setDenied(message);
    setEditing(false);
    setResult(undefined);
    setNotice('');
  }, []);
  useEffect(() => {
    if (denied) return;
    const controller = new AbortController();
    void getOwnStaffProfile(account, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setResult({ revision, data });
      })
      .catch((e) => {
        if (controller.signal.aborted) return;
        if (staffAccessError(e)) {
          onDenied((e as StaffError).message);
        } else
          setResult({
            revision,
            error: 'Unable to load your staff profile. Please try again.',
          });
      });
    return () => controller.abort();
  }, [account, revision, denied, onDenied]);
  function refresh() {
    setNotice('');
    setRevision((v) => v + 1);
  }
  return (
    <section className="own-staff-page" aria-labelledby="own-staff-title">
      <p className="eyebrow">My account / Profile</p>
      <div className="own-staff-page-heading">
        <div>
          <h1 id="own-staff-title">My profile</h1>
          <p className="page-description">
            View your staff account and keep your name up to date.
          </p>
        </div>
        <Button
          variant="secondary"
          disabled={editing || !!denied || (!data && !error)}
          onClick={refresh}
        >
          Refresh profile
        </Button>
      </div>
      {denied ? (
        <div className="own-staff-card">
          <p role="alert" className="own-staff-error">
            {denied}
          </p>
          <div className="own-staff-actions">
            <Button onClick={() => void verify()}>Verify account access</Button>
            <Button variant="secondary" onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
        </div>
      ) : error ? (
        <div className="own-staff-card">
          <p role="alert" className="own-staff-error">
            {error}
          </p>
          <Button variant="secondary" onClick={refresh}>
            Retry profile
          </Button>
        </div>
      ) : !data ? (
        <p role="status" className="own-staff-card">
          Loading your profile…
        </p>
      ) : (
        <>
          {notice && (
            <p role="status" className="own-staff-notice">
              {notice}
            </p>
          )}
          <div className="own-staff-grid">
            <aside className="own-staff-card own-staff-identity">
              <span className="own-staff-avatar" aria-hidden="true">
                {data.full_name ? (
                  data.full_name
                    .trim()
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((p) => p[0])
                    .join('')
                ) : (
                  <NavigationIcon name="profile" />
                )}
              </span>
              <h2>{data.full_name || 'Add your name'}</h2>
              <span className="own-staff-role">
                {role === 'admin' ? 'Admin' : 'Warden'}
              </span>
              <p>{data.designation || 'Designation not assigned'}</p>
              <p className="own-staff-caption">
                Your designation is descriptive. Your assigned role determines
                access.
              </p>
            </aside>
            <div className="own-staff-card">
              {editing ? (
                <OwnStaffNameEditor
                  account={account}
                  profile={data}
                  onDenied={onDenied}
                  onClose={(check) => {
                    setEditing(false);
                    if (check) refresh();
                  }}
                  onSaved={(value, message) => {
                    setResult({ revision, data: value });
                    setNotice(message);
                    setEditing(false);
                    void verify();
                  }}
                />
              ) : (
                <>
                  <div className="own-staff-card-heading">
                    <div>
                      <p className="eyebrow">Account information</p>
                      <h2>Staff details</h2>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => {
                        setNotice('');
                        setEditing(true);
                      }}
                    >
                      <NavigationIcon name="profile" />
                      {data.full_name ? 'Edit name' : 'Add name'}
                    </Button>
                  </div>
                  <dl className="own-staff-details">
                    <div>
                      <dt>Full name</dt>
                      <dd>{data.full_name || 'Not provided'}</dd>
                    </div>
                    <div>
                      <dt>Email</dt>
                      <dd>{data.email}</dd>
                    </div>
                    <div>
                      <dt>Role</dt>
                      <dd>{data.role === 'admin' ? 'Admin' : 'Warden'}</dd>
                    </div>
                    <div>
                      <dt>Designation</dt>
                      <dd>{data.designation || 'Not assigned'}</dd>
                    </div>
                  </dl>
                  <p className="own-staff-caption">
                    You can update your full name here. Contact an administrator
                    to correct your email, designation or role.
                  </p>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
