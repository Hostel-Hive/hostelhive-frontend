import { useEffect, useState } from 'react';
import {
  getStudentInvitation,
  type StudentInvitation,
} from '../api/student-invitations.api';
import Button from '../../../shared/components/ui/Button';

export default function StudentInvitationStatus({
  initial,
  uid,
}: {
  initial: StudentInvitation;
  uid: string;
}) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState({
    invitation: initial,
    attempt: -1,
    error: false,
  });
  useEffect(() => {
    const controller = new AbortController();
    getStudentInvitation(initial.invitation_id, uid, controller.signal)
      .then((invitation) => {
        if (!controller.signal.aborted)
          setResult({ invitation, attempt, error: false });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setResult((previous) => ({ ...previous, attempt, error: true }));
      });
    return () => controller.abort();
  }, [initial.invitation_id, uid, attempt]);
  const { invitation } = result;
  const pending = result.attempt !== attempt;
  const message = invitation.setup_completed_at
    ? 'The student has completed account setup.'
    : {
        pending:
          'Account setup invitation queued. Delivery is being processed in the background.',
        sent: 'Firebase accepted the setup email request. This does not confirm receipt in the student mailbox.',
        failed:
          'The invitation could not be sent. Contact an administrator to review or retry delivery.',
        skipped:
          'Invitation delivery was skipped. An administrator should review account eligibility and setup status.',
      }[invitation.delivery_status];
  return (
    <section className="student-card" aria-labelledby="invitation-title">
      <h2 id="invitation-title">Account setup invitation</h2>
      <p role="status">{message}</p>
      {pending && <p>Checking current invitation status…</p>}
      {!pending && result.error && (
        <p role="alert">
          Unable to refresh invitation status. The status above is the last
          known result. Check your session and try again.
        </p>
      )}
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() => setAttempt((value) => value + 1)}
      >
        Refresh invitation status
      </Button>
    </section>
  );
}
