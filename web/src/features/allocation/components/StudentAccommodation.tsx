import { useCallback, useEffect, useRef, useState } from 'react';
import Button from '../../../shared/components/ui/Button';
import useAuth from '../../auth/hooks/useAuth';
import {
  allocationError,
  changeAllocation,
  listAllocations,
} from '../api/allocation.api';
import type { AllocationError } from '../api/allocation.api';
import type {
  Allocation,
  AllocationAction,
  AllocationPage,
} from '../allocation.types';
import AvailableBedPicker from './AvailableBedPicker';
import type { BedChoice } from './AvailableBedPicker';
import NavigationIcon from '../../../layouts/components/NavigationIcon';

function EditAllocation({
  action,
  studentName,
  uid,
  current,
  pending,
  cancel,
  confirm,
  denied,
}: {
  action: AllocationAction;
  studentName: string;
  uid: string;
  current: Allocation | null;
  pending: boolean;
  cancel: () => void;
  confirm: (bed: BedChoice | null) => void;
  denied: (reason: unknown) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const [chosen, setChosen] = useState<BedChoice | null>(null);
  useEffect(() => {
    const element = dialog.current!;
    const previous = document.activeElement as HTMLElement | null;
    element.showModal();
    cancelButton.current?.focus();
    return () => {
      element.close();
      previous?.focus();
    };
  }, []);
  const verb =
    action === 'assign'
      ? 'Assign bed'
      : action === 'transfer'
        ? 'Transfer bed'
        : 'Revoke allocation';
  return (
    <dialog
      ref={dialog}
      className="student-discard allocation-dialog"
      aria-labelledby="allocation-confirm-title"
      aria-describedby="allocation-guidance"
      aria-busy={pending}
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) cancel();
      }}
    >
      <div className="allocation-dialog-heading">
        <span className="allocation-heading-icon" aria-hidden="true">
          <NavigationIcon name="building" />
        </span>
        <div>
          <p className="allocation-eyebrow">Accommodation</p>
          <h2 id="allocation-confirm-title">
            {verb} for {studentName}?
          </h2>
        </div>
      </div>
      {current && (
        <p className="allocation-current">
          Current bed ID: <span className="student-id">{current.bed_id}</span>
        </p>
      )}
      <p id="allocation-guidance" className="allocation-guidance">
        {action === 'revoke'
          ? 'This ends the current allocation and releases the bed. Allocation history and the student account are kept.'
          : action === 'transfer'
            ? 'Choose a new available bed. The transfer is saved as one change; if the selected bed is occupied, the current assignment is kept.'
            : 'Choose a block, room and available bed. Student eligibility and bed availability are checked again when you confirm.'}
      </p>
      {action !== 'revoke' && (
        <fieldset
          disabled={pending}
          className="allocation-picker allocation-picker-container"
        >
          <AvailableBedPicker
            uid={uid}
            chosen={chosen}
            choose={setChosen}
            denied={denied}
          />
        </fieldset>
      )}
      {chosen && (
        <p className="allocation-selection" aria-live="polite">
          Selected: <strong>{chosen.label}</strong>
          <br />
          <span className="student-id">{chosen.id}</span>
        </p>
      )}
      {pending && <p role="status">Saving allocation. Keep this page open…</p>}
      <div className="allocation-dialog-footer">
        <span className="allocation-footer-hint">
          {action !== 'revoke' && !chosen
            ? 'Choose a bed to continue.'
            : 'Review the allocation before confirming.'}
        </span>
        <div className="allocation-footer-actions">
          <Button
            ref={cancelButton}
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={cancel}
          >
            Cancel
          </Button>
          <Button
            variant={action === 'revoke' ? 'danger' : 'primary'}
            disabled={pending || (action !== 'revoke' && !chosen)}
            onClick={() => confirm(chosen)}
          >
            {pending
              ? 'Saving…'
              : action === 'assign'
                ? 'Confirm assignment'
                : action === 'transfer'
                  ? 'Confirm transfer'
                  : 'Confirm revocation'}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
function timestamp(value: string) {
  return new Date(value).toLocaleString();
}
interface Snapshot {
  current: Allocation | null;
  history: AllocationPage;
}

function AccommodationControls({
  studentID,
  studentName,
  eligible,
  uid,
}: {
  studentID: string;
  studentName: string;
  eligible: boolean;
  uid: string;
}) {
  const { signOut } = useAuth();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<AllocationError | null>(null);
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState<'read' | 'write' | null>(null);
  const [action, setAction] = useState<AllocationAction | null>(null);
  const [opened, setOpened] = useState(false);
  const busy = useRef(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      controller.current?.abort();
      controller.current = null;
    },
    [],
  );
  useEffect(() => {
    if (pending !== 'write') return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [pending]);
  const denied = useCallback((reason: unknown) => {
    setError(allocationError(reason));
    setSnapshot(null);
    setAction(null);
  }, []);
  const blocked = error?.kind === 'session' || error?.kind === 'forbidden';
  async function read(offset = 0) {
    if (busy.current || blocked) return;
    busy.current = true;
    setOpened(true);
    setPending('read');
    setError(null);
    setSnapshot(null);
    const abort = new AbortController();
    controller.current = abort;
    try {
      const [active, history] = await Promise.all([
        listAllocations(studentID, uid, abort.signal, 0, true),
        listAllocations(studentID, uid, abort.signal, offset),
      ]);
      if (!abort.signal.aborted && controller.current === abort)
        setSnapshot({ current: active.items[0] ?? null, history });
    } catch (reason) {
      if (!abort.signal.aborted && controller.current === abort)
        setError(allocationError(reason));
    } finally {
      if (controller.current === abort) {
        busy.current = false;
        setPending(null);
      }
    }
  }
  async function save(bed: BedChoice | null) {
    if (
      busy.current ||
      !snapshot ||
      !action ||
      blocked ||
      (action !== 'revoke' && (!eligible || !bed))
    )
      return;
    busy.current = true;
    setPending('write');
    setError(null);
    setNotice('');
    const abort = new AbortController();
    controller.current = abort;
    let acknowledged = false;
    try {
      await changeAllocation(
        action,
        studentID,
        uid,
        abort.signal,
        snapshot.current?.allocation_id,
        bed?.id,
      );
      if (abort.signal.aborted || controller.current !== abort) return;
      acknowledged = true;
      setNotice(
        action === 'assign'
          ? 'Bed assigned.'
          : action === 'transfer'
            ? 'Bed transferred.'
            : 'Allocation revoked.',
      );
      setAction(null);
      setSnapshot(null);
      const [active, history] = await Promise.all([
        listAllocations(studentID, uid, abort.signal, 0, true),
        listAllocations(studentID, uid, abort.signal),
      ]);
      if (!abort.signal.aborted && controller.current === abort)
        setSnapshot({ current: active.items[0] ?? null, history });
    } catch (reason) {
      if (!abort.signal.aborted && controller.current === abort) {
        const failure = allocationError(reason);
        setError(failure);
        setSnapshot(null);
        setAction(null);
        if (failure.kind !== 'session' && failure.kind !== 'forbidden')
          setNotice(
            acknowledged
              ? 'Change saved, but accommodation could not be refreshed. Refresh before another change.'
              : 'The change was not confirmed. It may have completed. Refresh accommodation and review the current assignment before retrying.',
          );
      }
    } finally {
      if (controller.current === abort) {
        busy.current = false;
        setPending(null);
      }
    }
  }
  return (
    <>
      <p className="student-form-help">
        View the current bed assignment and retained history. Allocation changes
        are separate from account activation and profile archival.
      </p>
      {!blocked && (
        <Button
          size="sm"
          variant="secondary"
          disabled={Boolean(pending)}
          onClick={() => {
            setNotice('');
            void read();
          }}
        >
          {opened ? 'Refresh accommodation' : 'Load accommodation'}
        </Button>
      )}
      {pending === 'read' && <p role="status">Loading accommodation…</p>}
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error.message}</p>}
      {error?.kind === 'session' && (
        <Button size="sm" variant="secondary" onClick={() => void signOut()}>
          Sign in again
        </Button>
      )}
      {snapshot && !blocked && (
        <>
          <h3>Current assignment</h3>
          {snapshot.current ? (
            <dl className="student-details">
              <div>
                <dt>Bed ID</dt>
                <dd className="student-id">{snapshot.current.bed_id}</dd>
              </div>
              <div>
                <dt>Assigned</dt>
                <dd>{timestamp(snapshot.current.started_at)}</dd>
              </div>
            </dl>
          ) : (
            <p role="status">No active bed allocation.</p>
          )}
          {!eligible && (
            <p>
              Inactive student accounts cannot be assigned or transferred. An
              existing allocation can still be revoked.
            </p>
          )}
          <div className="student-form-actions">
            {eligible && (
              <Button
                size="sm"
                disabled={Boolean(pending)}
                onClick={() =>
                  setAction(snapshot.current ? 'transfer' : 'assign')
                }
              >
                {snapshot.current ? 'Transfer bed' : 'Assign bed'}
              </Button>
            )}
            {snapshot.current && (
              <Button
                size="sm"
                variant="danger"
                disabled={Boolean(pending)}
                onClick={() => setAction('revoke')}
              >
                Revoke allocation
              </Button>
            )}
          </div>
          <h3>Allocation history</h3>
          {!snapshot.history.items.length ? (
            <p role="status">
              {snapshot.history.offset
                ? 'No allocations on this page. Use Previous to return.'
                : 'No allocation history.'}
            </p>
          ) : (
            <div
              className="student-table-wrap"
              role="region"
              aria-label="Allocation history"
              tabIndex={0}
            >
              <table className="student-table">
                <caption>
                  {snapshot.history.total} allocation records · dates shown in
                  your local time
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Bed ID</th>
                    <th scope="col">Started</th>
                    <th scope="col">Ended</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.history.items.map((row) => (
                    <tr key={row.allocation_id}>
                      <th scope="row" className="student-id">
                        {row.bed_id}
                      </th>
                      <td>{timestamp(row.started_at)}</td>
                      <td>{row.ended_at ? timestamp(row.ended_at) : '—'}</td>
                      <td>
                        {!row.ended_at
                          ? 'Active'
                          : row.end_reason === 'transferred'
                            ? 'Transferred'
                            : row.end_reason === 'revoked'
                              ? 'Revoked'
                              : 'Ended'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <nav
            className="student-pagination"
            aria-label="Allocation history pagination"
          >
            <Button
              size="sm"
              variant="secondary"
              disabled={Boolean(pending) || snapshot.history.offset === 0}
              onClick={() =>
                void read(Math.max(0, snapshot.history.offset - 10))
              }
            >
              Previous allocations
            </Button>
            <span>Page {Math.floor(snapshot.history.offset / 10) + 1}</span>
            <Button
              size="sm"
              variant="secondary"
              disabled={
                Boolean(pending) ||
                snapshot.history.offset + 10 >= snapshot.history.total
              }
              onClick={() => void read(snapshot.history.offset + 10)}
            >
              Next allocations
            </Button>
          </nav>
        </>
      )}
      {action && snapshot && (
        <EditAllocation
          action={action}
          studentName={studentName}
          uid={uid}
          current={snapshot.current}
          pending={pending === 'write'}
          cancel={() => {
            if (!busy.current) setAction(null);
          }}
          confirm={(bed) => void save(bed)}
          denied={denied}
        />
      )}
    </>
  );
}
export default function StudentAccommodation(props: {
  studentID: string;
  studentName: string;
  eligible: boolean;
  uid: string;
}) {
  return (
    <section
      className="student-card student-accommodation"
      aria-labelledby="accommodation-title"
    >
      <h2 id="accommodation-title">Accommodation</h2>
      <AccommodationControls
        key={`${props.uid}:${props.studentID}:${props.eligible}`}
        {...props}
      />
    </section>
  );
}
