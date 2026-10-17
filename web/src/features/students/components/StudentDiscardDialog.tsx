import { useEffect, useRef } from 'react';
import Button from '../../../shared/components/ui/Button';
export default function StudentDiscardDialog({
  pending,
  keep,
  discard,
}: {
  pending: boolean;
  keep: () => void;
  discard: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    dialog.showModal();
    dialog.querySelector<HTMLButtonElement>('button')?.focus();
    return () => {
      dialog.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="student-discard"
      role="alertdialog"
      aria-labelledby="discard-title"
      aria-describedby="discard-description"
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) keep();
      }}
    >
      <h2 id="discard-title">Discard unsaved changes?</h2>
      <p id="discard-description">Your changes have not been saved.</p>
      <div className="student-form-actions">
        <Button variant="secondary" disabled={pending} onClick={keep}>
          Keep editing
        </Button>
        <Button variant="danger" disabled={pending} onClick={discard}>
          Discard changes
        </Button>
      </div>
    </dialog>
  );
}
