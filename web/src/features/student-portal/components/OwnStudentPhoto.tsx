import { useEffect, useState } from 'react';
import Button from '../../../shared/components/ui/Button';
import {
  getOwnPhoto,
  isAccessError,
  portalError,
} from '../api/student-portal.api';
import type { StudentPortalError } from '../api/student-portal.api';
import PrivateStudentImage from './PrivateStudentImage';

export default function OwnStudentPhoto({
  uid,
  name,
  onAccessError,
}: {
  uid: string;
  name: string;
  onAccessError: (error: StudentPortalError) => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    attempt: number;
    blob?: Blob;
    error?: string;
  }>();
  useEffect(() => {
    const controller = new AbortController();
    getOwnPhoto(uid, controller.signal)
      .then((blob) => {
        if (!controller.signal.aborted) setResult({ attempt, blob });
      })
      .catch((reason) => {
        if (controller.signal.aborted) return;
        const error = portalError(reason);
        if (isAccessError(error)) onAccessError(error);
        else
          setResult({
            attempt,
            error:
              error.kind === 'not-found'
                ? 'Profile photo is no longer available.'
                : 'Unable to load your profile photo.',
          });
      });
    return () => controller.abort();
  }, [uid, attempt, onAccessError]);
  const current = result?.attempt === attempt ? result : undefined;
  if (!current) return <p role="status">Loading profile photo…</p>;
  if (current.error)
    return (
      <div>
        <p role="alert">{current.error}</p>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setAttempt((n) => n + 1)}
        >
          Retry photo
        </Button>
      </div>
    );
  return current.blob ? (
    <PrivateStudentImage
      key={attempt}
      blob={current.blob}
      alt={`Profile photo of ${name}`}
      onError={() =>
        setResult({ attempt, error: 'Unable to display your profile photo.' })
      }
    />
  ) : null;
}
