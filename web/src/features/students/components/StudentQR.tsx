import { useEffect, useRef, useState } from 'react';
import Button from '../../../shared/components/ui/Button';
import useAuth from '../../auth/hooks/useAuth';
import { getStudentQR } from '../api/student-qr.api';
import { studentError } from '../api/students.api';
import type { StudentRequestError } from '../api/students.api';
import type { Student } from '../student.types';

function QRImage({
  blob,
  name,
  failed,
}: {
  blob: Blob;
  name: string;
  failed: () => void;
}) {
  const image = useRef<HTMLImageElement>(null);
  const link = useRef<HTMLAnchorElement>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const img = image.current!;
    const download = link.current!;
    const url = URL.createObjectURL(blob);
    img.src = url;
    download.href = url;
    return () => {
      img.removeAttribute('src');
      download.removeAttribute('href');
      URL.revokeObjectURL(url);
    };
  }, [blob]);
  return (
    <div className="student-qr-result">
      <img
        ref={image}
        className="student-qr-image"
        width={320}
        height={320}
        alt={`Student identification QR code for ${name}`}
        onLoad={() => setLoaded(true)}
        onError={failed}
      />
      {!loaded && <p role="status">Preparing QR image…</p>}
      <a
        ref={link}
        className="button-link"
        download="student-qr.png"
        hidden={!loaded}
      >
        Download QR PNG
      </a>
      <p className="student-form-help">
        This is a stable student identifier. Displaying or downloading it does
        not record an entry, exit, or attendance event. Saved images do not
        prove current access eligibility.
      </p>
    </div>
  );
}

function QRControls({ student, uid }: { student: Student; uid: string }) {
  const { signOut } = useAuth();
  const [blob, setBlob] = useState<Blob | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<StudentRequestError | null>(null);
  const [notice, setNotice] = useState('');
  const [generation, setGeneration] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const operation = useRef(false);
  const showButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    function clear() {
      if (document.visibilityState !== 'hidden') return;
      controller.current?.abort();
      controller.current = null;
      operation.current = false;
      setBlob(null);
      setPending(false);
      setNotice('QR hidden. Show it again when needed.');
    }
    document.addEventListener('visibilitychange', clear);
    return () => {
      document.removeEventListener('visibilitychange', clear);
      controller.current?.abort();
      controller.current = null;
    };
  }, []);
  const blocked = error?.kind === 'session' || error?.kind === 'forbidden';
  useEffect(() => {
    if (notice === 'QR hidden.') showButton.current?.focus();
  }, [notice]);
  function hide() {
    controller.current?.abort();
    controller.current = null;
    operation.current = false;
    setBlob(null);
    setPending(false);
    setNotice('QR hidden.');
  }
  async function show() {
    if (operation.current || blocked || document.visibilityState === 'hidden')
      return;
    operation.current = true;
    const abort = new AbortController();
    controller.current = abort;
    setBlob(null);
    setError(null);
    setNotice('');
    setPending(true);
    try {
      const image = await getStudentQR(student.student_id, uid, abort.signal);
      if (abort.signal.aborted || controller.current !== abort) return;
      setGeneration((current) => current + 1);
      setBlob(image);
    } catch (reason) {
      if (!abort.signal.aborted && controller.current === abort)
        setError(studentError(reason));
    } finally {
      if (controller.current === abort) {
        operation.current = false;
        setPending(false);
      }
    }
  }
  const message =
    error?.kind === 'session'
      ? 'Your session has expired. Sign in again to view student QR codes.'
      : error?.kind === 'forbidden'
        ? 'You no longer have permission to view this student QR code.'
        : error?.kind === 'not-found'
          ? 'QR unavailable for this profile. It may be inactive, archived, or no longer linked to a student account.'
          : error
            ? 'Unable to display the student QR code. Please try again.'
            : '';
  return (
    <>
      <p className="student-form-help">
        Show the code only when needed for student identification. The backend
        checks current eligibility and issues the code on first retrieval.
      </p>
      <div className="student-form-actions">
        {!blocked && (
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
        )}
        {(blob || pending) && (
          <Button variant="secondary" size="sm" onClick={hide}>
            Hide QR code
          </Button>
        )}
        {error?.kind === 'session' && (
          <Button variant="secondary" size="sm" onClick={() => void signOut()}>
            Sign in again
          </Button>
        )}
      </div>
      {pending && <p role="status">Loading authorized QR code…</p>}
      {notice && <p role="status">{notice}</p>}
      {message && <p role="alert">{message}</p>}
      {blob && (
        <QRImage
          key={generation}
          blob={blob}
          name={student.full_name}
          failed={() => {
            setBlob(null);
            setError(studentError(new Error('Invalid QR image')));
          }}
        />
      )}
    </>
  );
}

export default function StudentQR({
  student,
  uid,
}: {
  student: Student;
  uid: string;
}) {
  return (
    <section
      className="student-card student-qr"
      aria-labelledby="student-qr-title"
    >
      <h2 id="student-qr-title">Student QR code</h2>
      {student.account_active ? (
        <QRControls
          key={`${uid}:${student.student_id}`}
          student={student}
          uid={uid}
        />
      ) : (
        <p role="status">
          QR unavailable while this student account is inactive.
        </p>
      )}
    </section>
  );
}
