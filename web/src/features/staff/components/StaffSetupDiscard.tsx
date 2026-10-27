import { useEffect, useRef } from 'react';
import Button from '../../../shared/components/ui/Button';
export default function StaffSetupDiscard({
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
    const element = ref.current!;
    const previous = document.activeElement;
    element.showModal();
    element.querySelector<HTMLButtonElement>('button')?.focus();
    return () => {
      element.close();
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="staff-editor"
      role="alertdialog"
      aria-labelledby="staff-setup-leave-title"
      aria-describedby="staff-setup-leave-description"
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) keep();
      }}
    >
      <h2 id="staff-setup-leave-title">Leave this staff setup?</h2>
      <p id="staff-setup-leave-description">
        {pending
          ? 'A request is still processing. Wait for the result before leaving.'
          : 'Leaving discards the local password and unsaved edits. Any created account remains in the application. An incomplete account request keeps its saved recovery reference unless you explicitly reset it; leaving does not undo a saved account or profile.'}
      </p>
      <div className="staff-actions">
        <Button variant="secondary" disabled={pending} onClick={keep}>
          Keep working
        </Button>
        <Button variant="danger" disabled={pending} onClick={discard}>
          Continue
        </Button>
      </div>
    </dialog>
  );
}
