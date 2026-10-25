import { useEffect, useRef, useState } from 'react';
import { useBlocker, useNavigate } from 'react-router-dom';
import Button from '../../../shared/components/ui/Button';
import Input from '../../../shared/components/ui/Input';
import useAuth from '../../auth/hooks/useAuth';
import {
  listAllocations,
  allocationError,
  type AllocationError,
} from '../../allocation/api/allocation.api';
import type { Allocation } from '../../allocation/allocation.types';
import {
  checkoutStudent,
  checkoutError,
  checkoutReasons,
  type CheckoutInput,
  type CheckoutResult,
  type CheckoutError,
} from '../api/student-checkout.api';
import type { Student } from '../student.types';
import { routePaths } from '../../../app/router/routePaths';
import '../../../styles/student-checkout.css';

interface SavedCheckout {
  input: CheckoutInput | null;
  uncertain: boolean;
  allocation: Allocation | null | undefined;
}

function CheckoutDialog({
  student,
  uid,
  initial,
  updateSaved,
  close,
  finished,
}: {
  student: Student;
  uid: string;
  initial: SavedCheckout;
  updateSaved: (value: SavedCheckout) => void;
  close: () => void;
  finished: (result: CheckoutResult, archived: boolean) => void;
}) {
  const { signOut } = useAuth();
  const saved = useRef<SavedCheckout>({ ...initial });
  const dialog = useRef<HTMLDialogElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const active = useRef(false);
  const busy = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const [current, setCurrent] = useState<Allocation | null | undefined>(
    initial.uncertain ? initial.allocation : undefined,
  );
  const [loading, setLoading] = useState(!initial.uncertain);
  const [loadError, setLoadError] = useState<AllocationError>();
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [reason, setReason] = useState<keyof typeof checkoutReasons | ''>(
    initial.input?.reason ?? '',
  );
  const [notes, setNotes] = useState(initial.input?.notes ?? '');
  const [access, setAccess] = useState<'' | 'deactivate' | 'keep'>(
    initial.input
      ? initial.input.deactivate_account
        ? 'deactivate'
        : 'keep'
      : '',
  );
  const [confirmed, setConfirmed] = useState(Boolean(initial.input));
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(initial.uncertain);
  const [error, setError] = useState<CheckoutError>();
  const [result, setResult] = useState<CheckoutResult>();
  const blocker = useBlocker(() => busy.current || saved.current.uncertain);
  useEffect(() => {
    active.current = true;
    const element = dialog.current!;
    const previous = document.activeElement as HTMLElement | null;
    element.showModal();
    cancelButton.current?.focus();
    return () => {
      active.current = false;
      controller.current?.abort();
      element.close();
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  useEffect(() => {
    if (saved.current.uncertain) return;
    const abort = new AbortController();
    listAllocations(student.student_id, uid, abort.signal, 0, true)
      .then((page) => {
        if (!abort.signal.aborted) {
          const allocation = page.items[0] ?? null;
          saved.current.allocation = allocation;
          updateSaved({ ...saved.current });
          setCurrent(allocation);
          setLoading(false);
        }
      })
      .catch((problem) => {
        if (!abort.signal.aborted) {
          setLoadError(allocationError(problem));
          setLoading(false);
        }
      });
    return () => abort.abort();
  }, [student.student_id, uid, loadAttempt, updateSaved]);
  useEffect(() => {
    if (!pending && !uncertain) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [pending, uncertain]);
  useEffect(() => {
    if (result && dialog.current) {
      dialog.current.scrollTop = 0;
      dialog.current.querySelector<HTMLHeadingElement>('h2')?.focus();
    }
    if (result && blocker.state === 'blocked') blocker.reset();
  }, [result, blocker]);
  const blocked = Boolean(error && error.kind !== 'unavailable');
  const locked = pending || uncertain || (blocked && error?.kind !== 'invalid');
  function edit() {
    if (!busy.current && !saved.current.uncertain) {
      saved.current.input = null;
      setError(undefined);
    }
  }
  async function submit() {
    if (
      busy.current ||
      loading ||
      loadError ||
      current === undefined ||
      !reason ||
      !access ||
      !confirmed ||
      blocked
    )
      return;
    busy.current = true;
    setPending(true);
    setError(undefined);
    controller.current = new AbortController();
    if (!saved.current.input)
      saved.current.input = {
        request_id: crypto.randomUUID(),
        reason,
        notes: notes.trim(),
        deactivate_account: access === 'deactivate',
        confirmed: true,
      };
    try {
      const response = await checkoutStudent(
        student.student_id,
        student.user_id,
        uid,
        saved.current.input,
        controller.current.signal,
      );
      if (active.current) {
        saved.current.uncertain = false;
        updateSaved({ ...saved.current });
        setUncertain(false);
        setResult(response);
      }
    } catch (problem) {
      if (active.current) {
        const failure = checkoutError(problem);
        setError(failure);
        if (failure.kind === 'unavailable') {
          saved.current.uncertain = true;
          updateSaved({ ...saved.current });
          setUncertain(true);
        }
      }
    } finally {
      busy.current = false;
      if (active.current) setPending(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="student-discard student-checkout-dialog"
      aria-labelledby="checkout-title"
      aria-describedby="checkout-description"
      aria-busy={pending}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy.current) {
          if (result) finished(result, true);
          else close();
        }
      }}
    >
      <p className="eyebrow">Permanent departure</p>
      <h2 id="checkout-title" tabIndex={-1}>
        {result
          ? result.replayed
            ? 'Original checkout confirmed'
            : 'Hostel stay ended'
          : 'End hostel stay'}
      </h2>
      <p className="checkout-student">
        <strong>{student.full_name}</strong> · {student.index_no}
      </p>
      <p id="checkout-description">
        {result
          ? 'The confirmed operation is recorded below.'
          : 'This releases the current bed and archives the student profile. Use this only for a permanent departure, not trips home or a temporary suspension.'}
      </p>
      {result ? (
        <>
          {result.replayed && (
            <p className="checkout-warning">
              This is the result of your original request. No new checkout was
              performed. Check the directory for the student’s current status.
            </p>
          )}
          <dl className="checkout-summary">
            <div>
              <dt>Departure reason</dt>
              <dd>
                {
                  checkoutReasons[
                    result.checkout.reason as keyof typeof checkoutReasons
                  ]
                }
              </dd>
            </div>
            <div>
              <dt>Bed released by this checkout</dt>
              <dd className="student-id">
                {result.checkout.released_bed_id ?? 'No bed was allocated'}
              </dd>
            </div>
            <div>
              <dt>Account access after this checkout</dt>
              <dd>
                {result.checkout.account_active_after
                  ? 'Kept active'
                  : 'Inactive — local access blocked'}
              </dd>
            </div>
            <div>
              <dt>Profile</dt>
              <dd>Archived by this checkout</dd>
            </div>
            <div>
              <dt>Completed</dt>
              <dd>{new Date(result.checkout.performed_at).toLocaleString()}</dd>
            </div>
          </dl>
          {result.revocation_pending && (
            <p role="status" className="checkout-warning">
              Firebase session revocation is still pending. Local account access
              is already blocked if deactivation was requested. The backend will
              retry automatically.
            </p>
          )}
          <p role="status">
            {result.replayed
              ? 'Original checkout confirmed.'
              : 'Hostel stay ended successfully.'}
          </p>
          <div className="student-form-actions">
            <Button variant="secondary" onClick={() => finished(result, false)}>
              View current students
            </Button>
            <Button onClick={() => finished(result, true)}>
              View archived students
            </Button>
          </div>
        </>
      ) : (
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="checkout-bed-review">
            <h3>
              {uncertain ? 'Previously reviewed bed' : 'Current accommodation'}
            </h3>
            {loading ? (
              <p role="status">Checking the current bed allocation…</p>
            ) : loadError ? (
              <>
                <p role="alert">
                  {loadError.message} The bed must be checked before checkout.
                </p>
                {loadError.kind === 'unavailable' && (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setLoading(true);
                      setLoadError(undefined);
                      setLoadAttempt((n) => n + 1);
                    }}
                  >
                    Retry accommodation check
                  </Button>
                )}
                {loadError.kind === 'session' && (
                  <Button onClick={() => void signOut()}>Sign in again</Button>
                )}
              </>
            ) : current ? (
              <>
                <p>
                  Bed to release{' '}
                  <span className="student-id">{current.bed_id}</span>
                </p>
                <p className="checkout-help">
                  The backend releases the student’s current allocation when you
                  confirm. The confirmed result shows the bed actually released.
                </p>
              </>
            ) : (
              <p>
                No bed is currently allocated. The profile can still be checked
                out.
              </p>
            )}
          </div>
          <fieldset
            disabled={locked || loading || Boolean(loadError)}
            className="checkout-fields"
          >
            <label htmlFor="checkout-reason">Reason for leaving</label>
            <select
              id="checkout-reason"
              className="ui-input"
              value={reason}
              onChange={(event) => {
                edit();
                setReason(event.target.value as typeof reason);
              }}
              required
            >
              <option value="">Select a departure reason</option>
              {Object.entries(checkoutReasons).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <label htmlFor="checkout-notes">Departure notes (optional)</label>
            <Input
              id="checkout-notes"
              value={notes}
              maxLength={1000}
              onChange={(event) => {
                edit();
                setNotes(event.target.value);
              }}
            />
            <fieldset className="checkout-access">
              <legend>Account access</legend>
              <label>
                <input
                  type="radio"
                  name="checkout-access"
                  value="deactivate"
                  checked={access === 'deactivate'}
                  onChange={() => {
                    edit();
                    setAccess('deactivate');
                  }}
                />
                Deactivate account — block HostelHive access
              </label>
              <label>
                <input
                  type="radio"
                  name="checkout-access"
                  value="keep"
                  checked={access === 'keep'}
                  onChange={() => {
                    edit();
                    setAccess('keep');
                  }}
                />
                Keep current account access
              </label>
              <p className="checkout-help">
                {student.account_active
                  ? 'Choose explicitly whether login access should end.'
                  : 'This account is currently inactive. Keeping its access state will not reactivate it.'}
              </p>
            </fieldset>
            <label className="checkout-confirm">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => {
                  edit();
                  setConfirmed(event.target.checked);
                }}
              />
              I confirm this student is permanently ending their hostel stay.
            </label>
          </fieldset>
          {(error || uncertain) && (
            <p role="alert" className="checkout-error">
              {error?.message ??
                'The original checkout is still unconfirmed. Retry the same operation safely.'}
              {uncertain &&
                ' Your original details are locked and will be reused. Closing and reopening this form keeps the same operation while you remain on this profile.'}
            </p>
          )}
          {pending && (
            <p role="status">Ending hostel stay. Keep this page open…</p>
          )}
          <div className="student-form-actions">
            <Button
              ref={cancelButton}
              variant="secondary"
              disabled={pending}
              onClick={close}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="danger"
              disabled={
                pending ||
                loading ||
                Boolean(loadError) ||
                blocked ||
                !reason ||
                !access ||
                !confirmed
              }
            >
              {pending
                ? 'Ending stay…'
                : uncertain
                  ? 'Retry same checkout'
                  : 'Confirm end hostel stay'}
            </Button>
            {error?.kind === 'session' && (
              <Button onClick={() => void signOut()}>Sign in again</Button>
            )}
          </div>
        </form>
      )}
      {blocker.state === 'blocked' && (
        <div className="checkout-warning" role="alert">
          <p>
            The checkout may still complete. Stay to confirm its result before
            starting another operation.
          </p>
          <Button variant="secondary" onClick={() => blocker.reset()}>
            Stay on this page
          </Button>
          <Button
            disabled={pending}
            onClick={() => {
              saved.current.uncertain = false;
              blocker.proceed();
            }}
          >
            Leave and check directory
          </Button>
        </div>
      )}
    </dialog>
  );
}

export default function StudentCheckoutAction({
  student,
  search,
}: {
  student: Student;
  search: string;
}) {
  const { account } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<SavedCheckout>({
    input: null,
    uncertain: false,
    allocation: undefined,
  });
  if (account?.role !== 'admin') return null;
  function finished(result: CheckoutResult, archived: boolean) {
    const params = new URLSearchParams(search);
    params.delete('offset');
    if (archived) params.set('status', 'archived');
    else params.delete('status');
    navigate(`${routePaths.students}${params.size ? `?${params}` : ''}`, {
      replace: true,
      state: {
        checkoutNotice: result.replayed
          ? 'Original checkout confirmed.'
          : 'Hostel stay ended successfully.',
        checkoutActor: account!.firebase_uid,
      },
    });
  }
  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>
        {saved.uncertain ? 'Resume checkout' : 'End hostel stay'}
      </Button>
      {!open && saved.uncertain && (
        <p role="alert">
          Checkout remains unconfirmed. Resume it to retry the original
          operation, or check the directory before starting another departure.
        </p>
      )}
      {open && (
        <CheckoutDialog
          student={student}
          uid={account.firebase_uid}
          initial={saved}
          updateSaved={setSaved}
          close={() => setOpen(false)}
          finished={finished}
        />
      )}
    </>
  );
}
