import Button from '../../../shared/components/ui/Button';
import useAuth from '../../auth/hooks/useAuth';
import type { LeaveError } from '../api/leave.api';
export default function LeaveRequestState({
  error,
  retry,
}: {
  error?: LeaveError;
  retry: () => void;
}) {
  const { signOut } = useAuth();
  if (!error) return <p role="status">Loading leave requests…</p>;
  const denied = error.kind === 'session' || error.kind === 'forbidden';
  return (
    <div className="leave-state" role="alert">
      <p>{error.message}</p>
      {denied ? (
        <Button
          onClick={() => {
            void signOut().catch(() => {
              /* AuthProvider presents sign-out failures. */
            });
          }}
        >
          Sign out
        </Button>
      ) : (
        error.kind !== 'not-found' &&
        error.kind !== 'invalid' && <Button onClick={retry}>Retry</Button>
      )}
    </div>
  );
}
