import { useEffect, useRef, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import Button from '../../../shared/components/ui/Button';
import {
  changeFaculty,
  facultyAccessDenied,
  facultyNameError,
  FacultyError,
  type Faculty,
  type FacultyAction,
} from '../api/faculties.api';
export default function FacultyDialog({
  action,
  faculty,
  uid,
  onClose,
  onDenied,
}: {
  action: FacultyAction;
  faculty?: Faculty;
  uid: string;
  onClose: (changed: boolean) => void;
  onDenied: (message: string) => void;
}) {
  const [name, setName] = useState(faculty?.name ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const controller = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const blocker = useBlocker(() => busy.current);
  const named = action === 'create' || action === 'rename';
  const title = {
    create: 'Add faculty',
    rename: 'Rename faculty',
    activate: 'Activate faculty',
    deactivate: 'Deactivate faculty',
  }[action];
  useEffect(() => {
    const previous = document.activeElement;
    const element = dialog.current!;
    element.showModal();
    return () => {
      controller.current?.abort();
      element.close();
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    if (pending) window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [pending]);
  function close() {
    if (!busy.current) onClose(uncertain);
  }
  async function submit() {
    if (busy.current || uncertain) return;
    const invalid = named ? facultyNameError(name) : undefined;
    if (invalid) {
      setError(invalid);
      return;
    }
    busy.current = true;
    setPending(true);
    setError('');
    const request = new AbortController();
    controller.current = request;
    try {
      await changeFaculty(
        action,
        uid,
        request.signal,
        faculty?.faculty_id,
        name,
      );
      if (!request.signal.aborted) onClose(true);
    } catch (failure) {
      if (request.signal.aborted) return;
      if (facultyAccessDenied(failure)) {
        onDenied(failure instanceof Error ? failure.message : 'Access denied.');
        return;
      }
      const unknown =
        !(failure instanceof FacultyError) || failure.kind === 'unavailable';
      setUncertain(unknown);
      setError(
        unknown
          ? 'This change may have completed. Close and refresh the directory to check the result before trying again.'
          : failure.message,
      );
    } finally {
      if (!request.signal.aborted) {
        busy.current = false;
        setPending(false);
      }
    }
  }
  return (
    <dialog
      ref={dialog}
      className="faculty-dialog"
      aria-labelledby="faculty-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        aria-busy={pending}
      >
        <p className="eyebrow">Faculty catalogue</p>
        <h2 id="faculty-dialog-title">{title}</h2>
        {faculty && (
          <p className="faculty-current">
            <strong>{faculty.name}</strong>
          </p>
        )}
        <p>
          {action === 'create'
            ? 'Add a faculty for student profiles and targeted announcements.'
            : action === 'rename'
              ? 'Matching student records will use the new name. Previous faculty names remain reserved.'
              : action === 'deactivate'
                ? 'This faculty will be removed from active choices. Existing student records are retained.'
                : 'This faculty will be available for selection again.'}
        </p>
        {named && (
          <label>
            Faculty name
            <input
              className="ui-input"
              autoFocus
              value={name}
              disabled={pending || uncertain}
              onChange={(event) => {
                setName(event.target.value);
                setError('');
              }}
              required
              aria-describedby="faculty-name-help"
            />
          </label>
        )}
        {named && (
          <p id="faculty-name-help" className="muted">
            Up to 120 characters. Names must be unique, including reserved
            names.
          </p>
        )}
        {error && (
          <p role="alert" className="faculty-error">
            {error}
          </p>
        )}
        {blocker.state === 'blocked' && (
          <p role="alert">
            Wait for this change to finish.
            <Button variant="secondary" onClick={() => blocker.reset()}>
              Stay on this page
            </Button>
          </p>
        )}
        <div className="faculty-dialog-footer">
          <Button variant="secondary" disabled={pending} onClick={close}>
            {uncertain ? 'Close and refresh' : 'Cancel'}
          </Button>
          <Button
            type="submit"
            variant={action === 'deactivate' ? 'danger' : 'primary'}
            disabled={
              pending ||
              uncertain ||
              (action === 'rename' && name.trim() === faculty?.name)
            }
          >
            {pending ? 'Saving…' : title}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
