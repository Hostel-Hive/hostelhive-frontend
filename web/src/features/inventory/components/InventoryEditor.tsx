import { useEffect, useRef, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import Button from '../../../shared/components/ui/Button';
import Input from '../../../shared/components/ui/Input';
import NavigationIcon from '../../../layouts/components/NavigationIcon';
import { AuthorizedRequestError } from '../../auth/api/authorized-request';
import {
  InventoryManagementError,
  inventoryLabel,
  labelError,
  saveInventory,
  type InventoryFilter,
  type InventoryKind,
  type InventoryRecord,
} from '../api/inventory-management.api';

interface Props {
  kind: InventoryKind;
  filter: InventoryFilter;
  row?: InventoryRecord;
  uid: string;
  reviewURL: string;
  onClose: () => void;
  onSaved: () => void;
  onDenied: (session: boolean) => void;
}
export default function InventoryEditor({
  kind,
  filter,
  row,
  uid,
  reviewURL,
  onClose,
  onSaved,
  onDenied,
}: Props) {
  const singular = kind.slice(0, -1);
  const initial = row ? inventoryLabel(row) : '';
  const [label, setLabel] = useState(initial);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [missing, setMissing] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const busy = useRef(false);
  const finished = useRef(false);
  const request = useRef<AbortController | null>(null);
  const blocker = useBlocker(
    () => !finished.current && (busy.current || label !== initial),
  );
  useEffect(() => {
    const previous = document.activeElement;
    const element = dialog.current!;
    element.showModal();
    cancel.current?.focus();
    return () => {
      request.current?.abort();
      element.close();
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);
  useEffect(() => {
    const prevent = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    if (pending || label !== initial)
      window.addEventListener('beforeunload', prevent);
    return () => window.removeEventListener('beforeunload', prevent);
  }, [pending, label, initial]);
  async function submit() {
    if (busy.current || missing || (uncertain && !reviewed)) return;
    const validation = labelError(kind, label);
    if (validation) {
      setError(validation);
      return;
    }
    busy.current = true;
    setPending(true);
    setError('');
    const controller = new AbortController();
    request.current = controller;
    try {
      await saveInventory(kind, filter, label, uid, controller.signal, row);
      if (!controller.signal.aborted) {
        finished.current = true;
        onSaved();
      }
    } catch (failure) {
      if (controller.signal.aborted) return;
      if (
        (failure instanceof AuthorizedRequestError &&
          failure.kind === 'session') ||
        (failure instanceof InventoryManagementError &&
          failure.kind === 'forbidden')
      ) {
        onDenied(failure instanceof AuthorizedRequestError);
        return;
      }
      const known = failure instanceof InventoryManagementError;
      if (known && failure.kind === 'not-found') setMissing(true);
      if (!known || failure.kind === 'unavailable') {
        setUncertain(true);
        setReviewed(false);
        setError(
          'The result could not be confirmed. The change may have been saved. Check the inventory before submitting again.',
        );
      } else setError(failure.message);
    } finally {
      busy.current = false;
      if (!controller.signal.aborted) setPending(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="inventory-dialog"
      aria-labelledby="inventory-editor-title"
      aria-describedby="inventory-editor-description"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy.current) onClose();
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
        <header className="inventory-editor-heading">
          <span className="inventory-editor-icon">
            <NavigationIcon name="building" />
          </span>
          <div>
            <p className="eyebrow">Accommodation / Inventory</p>
            <h2 id="inventory-editor-title">
              {row ? 'Rename' : 'Create'} {singular}
            </h2>
          </div>
        </header>
        <p
          id="inventory-editor-description"
          className="inventory-editor-description"
        >
          {kind === 'blocks'
            ? 'Block names must be unique.'
            : `Labels must be unique within this ${kind === 'rooms' ? 'block' : 'room'}. Parent assignments cannot be changed here.`}
        </p>
        <label htmlFor="inventory-label">
          {kind === 'blocks'
            ? 'Block name'
            : kind === 'rooms'
              ? 'Room label'
              : 'Bed label'}
        </label>
        <Input
          id="inventory-label"
          maxLength={kind === 'blocks' ? 120 : 32}
          value={label}
          disabled={pending || missing}
          aria-invalid={Boolean(error)}
          aria-describedby="inventory-label-help inventory-editor-error"
          onChange={(event) => setLabel(event.target.value)}
        />
        <p id="inventory-label-help">
          {kind === 'blocks' ? 120 : 32} characters maximum. Surrounding spaces
          are removed.
        </p>
        <p id="inventory-editor-error" role={error ? 'alert' : undefined}>
          {error}
        </p>
        {uncertain && (
          <div className="inventory-warning">
            <a href={reviewURL} target="_blank" rel="noopener noreferrer">
              Review inventory in a new tab
            </a>
            <p>
              Check all relevant pages and availability filters. If the item is
              already saved, close this form and refresh.
            </p>
            <label>
              <input
                type="checkbox"
                checked={reviewed}
                disabled={pending}
                onChange={(event) => setReviewed(event.target.checked)}
              />{' '}
              I checked the inventory and want to submit again.
            </label>
          </div>
        )}
        {pending && <p role="status">Saving {singular}…</p>}
        <div className="inventory-actions inventory-editor-footer">
          <Button
            ref={cancel}
            variant="secondary"
            disabled={pending}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={pending || missing || (uncertain && !reviewed)}
          >
            {row ? 'Save label' : `Create ${singular}`}
          </Button>
        </div>
        {blocker.state === 'blocked' && (
          <div role="alert" className="inventory-warning">
            <p>
              {pending
                ? 'Wait for this save to finish before leaving.'
                : 'Leave and discard your unsaved label?'}
            </p>
            <Button variant="secondary" onClick={() => blocker.reset()}>
              Stay here
            </Button>
            {!pending && (
              <Button variant="danger" onClick={() => blocker.proceed()}>
                Discard and leave
              </Button>
            )}
          </div>
        )}
      </form>
    </dialog>
  );
}
