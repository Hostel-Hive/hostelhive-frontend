import { useEffect, useRef, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import Button from '../../../shared/components/ui/Button';
import { validateStudentImage } from '../../students/student-image';
import {
  evidenceAccessError,
  evidenceError,
  getComplaintImage,
  listComplaintImages,
  removeComplaintImage,
  uploadComplaintImage,
} from '../api/complaint-images.api';
import type {
  ComplaintImage,
  ComplaintImages,
  EvidenceError,
} from '../api/complaint-images.api';
import type { Complaint } from '../complaints.types';
import '../../../styles/complaint-evidence.css';

function PrivateImage({
  blob,
  alt,
  onError,
}: {
  blob: Blob;
  alt: string;
  onError: () => void;
}) {
  const element = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const img = element.current!;
    const url = URL.createObjectURL(blob);
    img.src = url;
    return () => {
      img.removeAttribute('src');
      URL.revokeObjectURL(url);
    };
  }, [blob]);
  return <img ref={element} alt={alt} onError={onError} />;
}
function EvidencePhoto({
  image,
  uid,
  index,
  onDenied,
}: {
  image: ComplaintImage;
  uid: string;
  index: number;
  onDenied: (error: EvidenceError) => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    attempt: number;
    blob?: Blob;
    error?: string;
  }>();
  useEffect(() => {
    const controller = new AbortController();
    getComplaintImage(image, uid, controller.signal)
      .then((blob) => {
        if (!controller.signal.aborted) setResult({ attempt, blob });
      })
      .catch((reason) => {
        if (controller.signal.aborted) return;
        const error = evidenceError(reason);
        if (evidenceAccessError(error)) onDenied(error);
        else setResult({ attempt, error: error.message });
      });
    return () => controller.abort();
  }, [image, uid, attempt, onDenied]);
  const current = result?.attempt === attempt ? result : undefined;
  return (
    <>
      {current?.blob ? (
        <PrivateImage
          blob={current.blob}
          alt={`Complaint evidence ${index + 1}`}
          onError={() =>
            setResult({ attempt, error: 'This image could not be displayed.' })
          }
        />
      ) : current?.error ? (
        <div>
          <p role="alert">{current.error}</p>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Retry image {index + 1}
          </Button>
        </div>
      ) : (
        <p role="status">Loading image {index + 1}…</p>
      )}
    </>
  );
}
type Operation =
  { kind: 'upload'; id: string; file: File } | { kind: 'remove'; id: string };
interface Props {
  row: Complaint;
  uid: string;
  editable?: boolean;
  disabled?: boolean;
  onDenied: (error: EvidenceError) => void;
  onLockChange: (locked: boolean) => void;
  onChanged: (message: string) => void;
  onReview: (signal: AbortSignal) => Promise<void>;
}
export default function ComplaintEvidence({
  row,
  uid,
  editable = false,
  disabled = false,
  onDenied,
  onLockChange,
  onChanged,
  onReview,
}: Props) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    data?: ComplaintImages;
    error?: string;
  }>();
  const [file, setFile] = useState<File>();
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState<Operation>();
  const [reviewRequired, setReviewRequired] = useState(false);
  const [checked, setChecked] = useState(false);
  const [confirmRemoval, setConfirmRemoval] = useState<string>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [previewFailed, setPreviewFailed] = useState(false);
  const busy = useRef(false);
  const finished = useRef(false);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const message = useRef<HTMLParagraphElement>(null);
  const key = `${uid}:${row.complaint_id}:${row.version}:${attempt}`;
  const data = result?.key === key ? result.data : undefined;
  const loadError = result?.key === key ? result.error : undefined;
  const dirty = Boolean(file || uncertain || pending || confirmRemoval);
  useEffect(() => {
    const request = new AbortController();
    listComplaintImages(row.complaint_id, uid, request.signal)
      .then((data) => {
        if (!request.signal.aborted) setResult({ key, data });
      })
      .catch((reason) => {
        if (request.signal.aborted) return;
        const failure = evidenceError(reason);
        if (evidenceAccessError(failure)) onDenied(failure);
        else setResult({ key, error: failure.message });
      });
    return () => request.abort();
  }, [key, row.complaint_id, uid, onDenied]);
  useEffect(() => {
    onLockChange(dirty || reviewRequired);
    const prevent = (event: BeforeUnloadEvent) => event.preventDefault();
    if (dirty) window.addEventListener('beforeunload', prevent);
    return () => {
      onLockChange(false);
      window.removeEventListener('beforeunload', prevent);
    };
  }, [dirty, reviewRequired, onLockChange]);
  useEffect(
    () => () => {
      generation.current++;
      controller.current?.abort();
    },
    [],
  );
  useEffect(() => {
    if (error) message.current?.focus();
  }, [error]);
  async function select(selected?: File) {
    if (busy.current || uncertain) return;
    const selectedGeneration = ++generation.current;
    setFile(undefined);
    setError('');
    setPreviewFailed(false);
    setConfirmRemoval(undefined);
    if (!selected) return;
    busy.current = true;
    setPending(true);
    try {
      await validateStudentImage(selected);
      if (generation.current === selectedGeneration) setFile(selected);
    } catch (reason) {
      if (generation.current === selectedGeneration)
        setError(
          reason instanceof Error ? reason.message : 'Choose a valid image.',
        );
    } finally {
      if (generation.current === selectedGeneration) {
        busy.current = false;
        setPending(false);
      }
    }
  }
  async function run(operation: Operation) {
    if (
      busy.current ||
      disabled ||
      reviewRequired ||
      (!uncertain &&
        (!data || row.status !== 'pending' || data.version !== row.version))
    )
      return;
    busy.current = true;
    setPending(true);
    setError('');
    setNotice('');
    const request = new AbortController();
    controller.current = request;
    try {
      if (operation.kind === 'upload')
        await uploadComplaintImage(
          row.complaint_id,
          operation.id,
          operation.file,
          uid,
          request.signal,
        );
      else
        await removeComplaintImage(
          row.complaint_id,
          operation.id,
          uid,
          request.signal,
        );
      if (request.signal.aborted) return;
      finished.current = true;
      setFile(undefined);
      setUncertain(undefined);
      setConfirmRemoval(undefined);
      onChanged(
        operation.kind === 'upload'
          ? 'Evidence uploaded. Refreshing complaint and history.'
          : 'Evidence removed. Refreshing complaint and history.',
      );
    } catch (reason) {
      if (request.signal.aborted) return;
      const failure = evidenceError(reason);
      if (evidenceAccessError(failure)) {
        onDenied(failure);
        return;
      }
      setChecked(false);
      if (failure.kind === 'unavailable') {
        setUncertain(operation);
        setError(
          'The evidence change may already be saved. Check current evidence or retry the exact operation. The original image ID and file are preserved.',
        );
      } else {
        setUncertain(undefined);
        setReviewRequired(
          failure.kind === 'conflict' || failure.kind === 'not-found',
        );
        setConfirmRemoval(undefined);
        setError(failure.message);
      }
    } finally {
      if (!request.signal.aborted) {
        busy.current = false;
        setPending(false);
      }
    }
  }
  async function review() {
    if (busy.current || disabled) return;
    busy.current = true;
    setPending(true);
    setError('');
    const request = new AbortController();
    controller.current = request;
    try {
      await onReview(request.signal);
      // A new row version changes the gallery key; normal mount loading retrieves
      // metadata after the complaint/history refresh without dropping retry details.
      if (!request.signal.aborted) {
        setAttempt((value) => value + 1);
        setReviewRequired(false);
        setChecked(true);
        setNotice(
          'Current complaint and history checked. Review the evidence before continuing.',
        );
      }
    } catch (reason) {
      if (!request.signal.aborted) {
        const failure = evidenceError(reason);
        if (evidenceAccessError(failure)) onDenied(failure);
        else setError(failure.message);
      }
    } finally {
      if (!request.signal.aborted) {
        busy.current = false;
        setPending(false);
      }
    }
  }
  function discard() {
    setFile(undefined);
    setUncertain(undefined);
    setConfirmRemoval(undefined);
    setPreviewFailed(false);
    setError('');
    if (input.current) input.current.value = '';
  }
  function renderContent() {
    const canEdit = editable && row.status === 'pending';
    const locked = pending || disabled || Boolean(uncertain) || reviewRequired;
    return (
      <section
        className="complaint-evidence"
        aria-labelledby="complaint-evidence-title"
      >
        <h2 id="complaint-evidence-title">Evidence images</h2>
        <p>
          Up to three private JPEG or PNG images, each up to 5 MiB, 4096 pixels
          per side and 12 million pixels.
        </p>
        {!editable && <p>Evidence is read-only for staff.</p>}
        {editable && !canEdit && (
          <p>
            Evidence is frozen once staff begin reviewing a complaint. Reopening
            does not unlock images.
          </p>
        )}
        {loadError ? (
          <>
            <p role="alert">{loadError}</p>
            <Button size="sm" onClick={() => setAttempt((value) => value + 1)}>
              Retry evidence
            </Button>
          </>
        ) : !data ? (
          <p role="status">Loading evidence…</p>
        ) : (
          <>
            <p>{data.items.length}/3 images attached</p>
            {data.version !== row.version && (
              <p role="status">
                The complaint changed. Check the current complaint before
                changing evidence.
              </p>
            )}
            {!data.items.length && <p>No evidence images attached.</p>}
            <ul className="evidence-grid">
              {data.items.map((image, index) => (
                <li key={image.image_id}>
                  <EvidencePhoto
                    image={image}
                    uid={uid}
                    index={index}
                    onDenied={onDenied}
                  />
                  <p>
                    Image {index + 1} · {image.width} × {image.height}
                  </p>
                  {canEdit && (
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={
                        locked || Boolean(file) || data.version !== row.version
                      }
                      onClick={() => setConfirmRemoval(image.image_id)}
                    >
                      Remove image {index + 1}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            {canEdit && (
              <label className="evidence-file">
                Choose evidence image
                <input
                  ref={input}
                  type="file"
                  accept="image/jpeg,image/png"
                  disabled={
                    locked ||
                    data.items.length >= 3 ||
                    data.version !== row.version
                  }
                  onChange={(event) => void select(event.target.files?.[0])}
                />
              </label>
            )}
            {canEdit && data.items.length >= 3 && (
              <p>The three-image limit has been reached.</p>
            )}
          </>
        )}
        {file && (
          <div className="evidence-preview">
            <h3>Selected image preview</h3>
            {!previewFailed ? (
              <PrivateImage
                blob={file}
                alt="Selected evidence preview"
                onError={() => {
                  setPreviewFailed(true);
                  setError(
                    'This image could not be displayed. Choose another valid image.',
                  );
                }}
              />
            ) : (
              <p>Preview unavailable.</p>
            )}
            <p>{file.name}</p>
          </div>
        )}
        <p ref={message} tabIndex={-1} role={error ? 'alert' : undefined}>
          {error}
        </p>
        {notice && <p role="status">{notice}</p>}
        {confirmRemoval && !uncertain && (
          <div
            className="evidence-warning"
            role="region"
            aria-label="Confirm evidence removal"
          >
            <p>
              Remove this image? The change is recorded in complaint history.
            </p>
            <div className="evidence-actions">
              <Button
                size="sm"
                variant="secondary"
                disabled={pending}
                onClick={() => setConfirmRemoval(undefined)}
              >
                Keep image
              </Button>
              <Button
                size="sm"
                variant="danger"
                disabled={pending}
                onClick={() => void run({ kind: 'remove', id: confirmRemoval })}
              >
                Confirm removal
              </Button>
            </div>
          </div>
        )}
        <div className="evidence-actions">
          {file && !uncertain && canEdit && (
            <Button
              size="sm"
              disabled={
                locked ||
                !data ||
                data.items.length >= 3 ||
                data.version !== row.version ||
                previewFailed
              }
              onClick={() => {
                try {
                  void run({ kind: 'upload', id: crypto.randomUUID(), file });
                } catch {
                  setError(
                    'Unable to prepare upload. Keep your file and try again.',
                  );
                }
              }}
            >
              Upload evidence
            </Button>
          )}
          {file && !uncertain && (
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={discard}
            >
              Discard selected image
            </Button>
          )}
          {(reviewRequired ||
            uncertain ||
            (data && data.version !== row.version)) && (
            <Button
              size="sm"
              variant="secondary"
              disabled={pending || disabled}
              onClick={() => void review()}
            >
              Check current complaint and evidence
            </Button>
          )}
          {uncertain && (
            <Button
              size="sm"
              disabled={pending || disabled}
              onClick={() => void run(uncertain)}
            >
              Retry identical{' '}
              {uncertain.kind === 'upload' ? 'upload' : 'removal'}
            </Button>
          )}
          {uncertain && checked && (
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={discard}
            >
              Discard retry details
            </Button>
          )}
        </div>
        {pending && <p role="status">Processing evidence…</p>}
      </section>
    );
  }
  return (
    <>
      {renderContent()}
      {editable && !disabled && (
        <EvidenceNavigationGuard
          dirty={dirty}
          pending={pending}
          uncertain={Boolean(uncertain)}
          finishedRef={finished}
          onLeave={() => {
            finished.current = true;
          }}
        />
      )}
    </>
  );
}

function EvidenceNavigationGuard({
  dirty,
  pending,
  uncertain,
  finishedRef,
  onLeave,
}: {
  dirty: boolean;
  pending: boolean;
  uncertain: boolean;
  finishedRef: { current: boolean };
  onLeave: () => void;
}) {
  const blocker = useBlocker(() => !finishedRef.current && dirty);
  return blocker.state === 'blocked' ? (
    <div className="evidence-warning" role="alert">
      <p>
        {pending
          ? 'Wait for the evidence operation to finish.'
          : uncertain
            ? 'The evidence change may already be saved. Leaving loses the exact retry details. Check the complaint before another upload.'
            : 'Discard the selected evidence and leave?'}
      </p>
      <div className="evidence-actions">
        <Button size="sm" onClick={() => blocker.reset()}>
          Stay here
        </Button>
        <Button
          size="sm"
          variant="danger"
          disabled={pending}
          onClick={() => {
            onLeave();
            blocker.proceed();
          }}
        >
          Discard and leave
        </Button>
      </div>
    </div>
  ) : null;
}
