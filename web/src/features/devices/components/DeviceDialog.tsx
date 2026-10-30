import { useEffect, useRef, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import Button from '../../../shared/components/ui/Button';
import NavigationIcon from '../../../layouts/components/NavigationIcon';
import { AuthorizedRequestError } from '../../auth/api/authorized-request';
import {
  changeDevice,
  DeviceError,
  deviceNameError,
  type DeviceAction,
  type DeviceResult,
  type ScannerDevice,
} from '../api/devices.api';

export default function DeviceDialog({
  action,
  device,
  uid,
  onClose,
  onDenied,
}: {
  action: DeviceAction;
  device?: ScannerDevice;
  uid: string;
  onClose: (changed: boolean) => void;
  onDenied: (message: string) => void;
}) {
  const [name, setName] = useState('');
  const [direction, setDirection] = useState(device?.direction ?? 'IN');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const [result, setResult] = useState<DeviceResult>();
  const [copied, setCopied] = useState('');
  const [stored, setStored] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const busy = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const blocker = useBlocker(() => busy.current || Boolean(result?.credential));
  const title = result
    ? 'Save your device credential'
    : {
        register: 'Register scanner device',
        direction: 'Configure scan direction',
        rotate: 'Rotate device credential',
        deactivate: 'Deactivate device',
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
    const prevent = (event: BeforeUnloadEvent) => event.preventDefault();
    if (pending || result?.credential)
      window.addEventListener('beforeunload', prevent);
    return () => window.removeEventListener('beforeunload', prevent);
  }, [pending, result]);
  function close() {
    if (!busy.current && (!result?.credential || stored))
      onClose(Boolean(result) || uncertain);
  }
  async function submit() {
    if (busy.current || uncertain || result) return;
    if (action === 'register') {
      const validation = deviceNameError(name);
      if (validation) {
        setError(validation);
        return;
      }
    }
    busy.current = true;
    setPending(true);
    setError('');
    const request = new AbortController();
    controller.current = request;
    try {
      const value = await changeDevice(action, uid, request.signal, {
        deviceID: device?.device_id,
        name,
        direction,
      });
      if (request.signal.aborted) return;
      if (value.credential) setResult(value);
      else onClose(true);
    } catch (failure) {
      if (request.signal.aborted) return;
      if (
        (failure instanceof AuthorizedRequestError &&
          failure.kind === 'session') ||
        (failure instanceof DeviceError && failure.kind === 'forbidden')
      ) {
        onDenied(failure.message);
        return;
      }
      if (!(failure instanceof DeviceError) || failure.kind === 'unavailable') {
        setUncertain(true);
        setError(
          action === 'rotate'
            ? 'The rotation result is unknown. The previous credential may no longer work. Refresh the directory, then rotate again if you did not receive a new credential.'
            : 'The result is unknown. Close and refresh the directory before trying again. If registration succeeded without a credential, use Rotate credential on that device.',
        );
      } else setError(failure.message);
    } finally {
      busy.current = false;
      if (!request.signal.aborted) setPending(false);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(result!.credential!);
      if (!controller.current?.signal.aborted)
        setCopied('Credential copied. Store it securely.');
    } catch {
      setCopied('Copy unavailable. Select and copy the credential below.');
    }
  }
  return (
    <dialog
      ref={dialog}
      className="device-dialog"
      aria-labelledby="device-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <header className="device-dialog-heading">
          <span className="device-icon">
            <NavigationIcon name="device" />
          </span>
          <div>
            <p className="eyebrow">Scanner management</p>
            <h2 id="device-dialog-title">{title}</h2>
          </div>
        </header>
        {result?.credential ? (
          <>
            <p className="device-callout">
              This credential is shown only once. Save it securely and configure
              it on <strong>{result.device.name}</strong>. It cannot be
              retrieved later.
            </p>
            <label className="device-field">
              Device credential
              <textarea
                className="ui-input device-secret"
                readOnly
                value={result.credential}
                rows={3}
                spellCheck={false}
              />
            </label>
            <Button variant="secondary" onClick={() => void copy()}>
              Copy credential
            </Button>
            {copied && <p role="status">{copied}</p>}
            {action === 'register' && (
              <p className="device-help">
                Next, configure this scanner as Entry or Exit before submitting
                scans.
              </p>
            )}
            <label className="device-check">
              <input
                type="checkbox"
                checked={stored}
                onChange={(event) => setStored(event.target.checked)}
              />
              I have saved this credential securely.
            </label>
          </>
        ) : (
          <>
            {device && (
              <div className="device-selected">
                <strong>{device.name}</strong>
                <span>{device.device_id}</span>
              </div>
            )}
            {action === 'register' && (
              <>
                <p className="device-help">
                  Add a gate scanner and generate its authentication credential.
                </p>
                <label className="device-field">
                  Device name
                  <input
                    autoFocus
                    className="ui-input"
                    placeholder="e.g. Main gate entry"
                    value={name}
                    disabled={pending || uncertain}
                    onChange={(event) => setName(event.target.value)}
                    aria-describedby="device-name-help"
                  />
                </label>
                <p id="device-name-help" className="device-help">
                  Unique name, up to 120 characters. Inactive device names
                  remain reserved.
                </p>
              </>
            )}
            {action === 'direction' && (
              <>
                <p className="device-help">
                  Choose the movement recorded by this scanner. Changing
                  direction affects future scans.
                </p>
                <label className="device-field">
                  Scan direction
                  <select
                    className="ui-input"
                    value={direction}
                    disabled={pending || uncertain}
                    onChange={(event) =>
                      setDirection(event.target.value as 'IN' | 'OUT')
                    }
                  >
                    <option value="IN">Entry (IN)</option>
                    <option value="OUT">Exit (OUT)</option>
                  </select>
                </label>
              </>
            )}
            {action === 'rotate' && (
              <p className="device-callout device-callout--warning">
                The current credential will stop working immediately. Install
                the new credential on the scanner to restore authentication.
                Rotation does not reactivate an inactive device.
              </p>
            )}
            {action === 'deactivate' && (
              <p className="device-callout device-callout--warning">
                This scanner will no longer be able to authenticate or submit
                new scans. Its history is retained. Reactivation is not
                currently supported.
              </p>
            )}
          </>
        )}
        {error && (
          <p className="device-error" role="alert">
            {error}
          </p>
        )}
        {blocker.state === 'blocked' && (
          <p role="alert" className="device-callout">
            Finish this action and save any issued credential before leaving.
            <Button
              variant="secondary"
              size="sm"
              onClick={() => blocker.reset()}
            >
              Stay on this page
            </Button>
          </p>
        )}
        <footer className="device-dialog-footer">
          <Button
            variant="secondary"
            disabled={pending || (Boolean(result?.credential) && !stored)}
            onClick={close}
          >
            {result ? 'Done' : uncertain ? 'Close and refresh' : 'Cancel'}
          </Button>
          {!result && !uncertain && (
            <Button
              type="submit"
              variant={action === 'deactivate' ? 'danger' : 'primary'}
              disabled={pending}
            >
              {pending
                ? 'Saving…'
                : {
                    register: 'Register device',
                    direction: 'Save direction',
                    rotate: 'Rotate credential',
                    deactivate: 'Deactivate device',
                  }[action]}
            </Button>
          )}
        </footer>
      </form>
    </dialog>
  );
}
