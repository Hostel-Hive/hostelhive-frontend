import { useEffect, useState } from 'react';
import useAuth from '../../features/auth/hooks/useAuth';
import StudentAccountMenu from '../../features/student-portal/components/StudentAccountMenu';
import { getStaff } from '../../features/staff/api/staff.api';
import { routePaths } from '../../app/router/routePaths';

export default function StaffAccountMenu() {
  const { account, signOut } = useAuth();
  const [identity, setIdentity] = useState<{ uid: string; name: string }>();
  useEffect(() => {
    if (!account || account.role !== 'admin') return;
    const controller = new AbortController();
    void getStaff(account.user_id, account.firebase_uid, controller.signal)
      .then((profile) => {
        if (!controller.signal.aborted)
          setIdentity({ uid: account.firebase_uid, name: profile.full_name });
      })
      .catch(() => {
        /* The account menu also works without a staff profile. */
      });
    return () => controller.abort();
  }, [account]);
  if (!account || account.role === 'student') return null;
  return (
    <StudentAccountMenu
      key={account.firebase_uid}
      name={identity?.uid === account.firebase_uid ? identity.name : undefined}
      email={account.email}
      roleLabel={account.role === 'admin' ? 'Admin' : 'Warden'}
      profilePath={
        account.role === 'admin'
          ? `${routePaths.staff}/${account.user_id}`
          : null
      }
      signOut={signOut}
    />
  );
}
