import useAuth from '../../features/auth/hooks/useAuth';
import StudentAccountMenu from '../../features/student-portal/components/StudentAccountMenu';
import { routePaths } from '../../app/router/routePaths';
export default function StaffAccountMenu() {
  const { account, signOut } = useAuth();
  if (!account || account.role === 'student') return null;
  return (
    <StudentAccountMenu
      key={account.firebase_uid}
      name={account.full_name}
      email={account.email}
      roleLabel={account.role === 'admin' ? 'Admin' : 'Warden'}
      profilePath={routePaths.ownStaffProfile}
      signOut={signOut}
    />
  );
}
