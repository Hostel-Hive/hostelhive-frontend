import { useEffect, useRef, useState } from 'react';
import Button from '../../../shared/components/ui/Button';
import {
  getOwnQR,
  isAccessError,
  portalError,
} from '../api/student-portal.api';
import type { StudentPortalError } from '../api/student-portal.api';
import PrivateStudentImage from './PrivateStudentImage';

export default function OwnStudentQR({
  uid,
  name,
  onAccessError,
}: {
  uid: string;
  name: string;
  onAccessError: (error: StudentPortalError) => void;
}) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  const showButton = useRef<HTMLButtonElement>(null);
  function hide() {
    controller.current?.abort();
    controller.current = null;
    setBlob(null);
    setPending(false);
    setError('');
    setMessage('QR hidden. Show it again when needed.');
  }
  useEffect(() => {
    const visibility = () => {
      if (document.visibilityState === 'hidden') hide();
    };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      controller.current?.abort();
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
  async function show() {
    if (controller.current || document.visibilityState === 'hidden') return;
    const abort = new AbortController();
    controller.current = abort;
    setPending(true);
    setBlob(null);
    setError('');
    setMessage('');
    try {
      const image = await getOwnQR(uid, abort.signal);
      if (!abort.signal.aborted) setBlob(image);
    } catch (reason) {
      if (abort.signal.aborted) return;
      const failure = portalError(reason);
      if (isAccessError(failure)) onAccessError(failure);
      else
        setError(
          failure.kind === 'not-found'
            ? 'Your QR code is unavailable. Contact your hostel administrator.'
            : 'Unable to load your QR code. Please retry.',
        );
    } finally {
      if (!abort.signal.aborted) {
        controller.current = null;
        setPending(false);
      }
    }
  }
  return (
    <section id="my-qr" className="portal-card" aria-labelledby="own-qr-title">
      <p className="portal-kicker">Gate identification</p>
      <h2 id="own-qr-title">My QR code</h2>
      <p className="portal-muted">
        Show your code at the hostel scanner when requested. Loading it does not
        record an entry, exit, or attendance event.
      </p>
      <div className="portal-actions">
        <Button
          ref={showButton}
          size="sm"
          disabled={pending}
          onClick={() => void show()}
        >
          {pending
            ? 'Loading QR code…'
            : blob
              ? 'Refresh QR code'
              : error
                ? 'Retry QR code'
                : 'Show QR code'}
        </Button>
        {(blob || pending) && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              hide();
              showButton.current?.focus();
            }}
          >
            Hide QR code
          </Button>
        )}
      </div>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
      {blob && (
        <PrivateStudentImage
          key={blob.size + ':' + blob.type}
          blob={blob}
          alt={`Your student QR code, ${name}`}
          qr
          onError={() => {
            setBlob(null);
            setError('Unable to display your QR code. Please retry.');
          }}
        />
      )}
      <p className="portal-caption">
        A saved QR image identifies your account; the scanner checks current
        access eligibility. The code is hidden when you leave this tab.
      </p>
    </section>
  );
}
