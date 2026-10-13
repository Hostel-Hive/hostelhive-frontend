import Button from '../../../shared/components/ui/Button';
import useAuth from '../../auth/hooks/useAuth';
import type { StudentRequestError } from '../api/students.api';

export default function StudentRequestState({
  error,
  retry,
}: {
  error?: StudentRequestError;
  retry: () => void;
}) {
  const { signOut } = useAuth();
  if (!error)
    return (
      <p role="status" className="student-state">
        Loading student records…
      </p>
    );
  return (
    <div className="student-state">
      <p role="alert">{error.message}</p>
      {error.kind === 'unavailable' && (
        <Button onClick={retry}>Retry loading</Button>
      )}
      {error.kind === 'session' && (
        <Button onClick={() => void signOut()}>Sign in again</Button>
      )}
    </div>
  );
}
