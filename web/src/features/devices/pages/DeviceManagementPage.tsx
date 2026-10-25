import { useEffect, useState } from 'react';
import Button from '../../../shared/components/ui/Button';
import NavigationIcon from '../../../layouts/components/NavigationIcon';
import useAuth from '../../auth/hooks/useAuth';
import { AuthorizedRequestError } from '../../auth/api/authorized-request';
import {
  listDevices,
  DeviceError,
  type DevicePage,
  type DeviceAction,
  type ScannerDevice,
} from '../api/devices.api';
import DeviceDialog from '../components/DeviceDialog';
import '../../../styles/devices.css';

export default function DeviceManagementPage() {
  const { account } = useAuth();
  if (account?.role !== 'admin')
    return (
      <p role="alert">Device management is available to administrators only.</p>
    );
  return (
    <DeviceDirectory key={account.firebase_uid} uid={account.firebase_uid} />
  );
}
function DeviceDirectory({ uid }: { uid: string }) {
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [response, setResponse] = useState<{
    key: string;
    page?: DevicePage;
    error?: string;
  }>();
  const [denied, setDenied] = useState('');
  const [editor, setEditor] = useState<{
    action: DeviceAction;
    device?: ScannerDevice;
  }>();
  const [notice, setNotice] = useState('');
  const key = `${offset}:${revision}`;
  const current = response?.key === key ? response : undefined;
  const page = !denied ? current?.page : undefined;
  useEffect(() => {
    if (denied) return;
    const controller = new AbortController();
    void listDevices(uid, offset, controller.signal)
      .then((page) => {
        if (!controller.signal.aborted) setResponse({ key, page });
      })
      .catch((failure) => {
        if (controller.signal.aborted) return;
        if (
          (failure instanceof AuthorizedRequestError &&
            failure.kind === 'session') ||
          (failure instanceof DeviceError && failure.kind === 'forbidden')
        ) {
          setDenied(failure.message);
          setEditor(undefined);
          setResponse(undefined);
        } else
          setResponse({
            key,
            error: 'Unable to load scanner devices. Please try again.',
          });
      });
    return () => controller.abort();
  }, [uid, offset, revision, key, denied]);
  function refresh() {
    setRevision((value) => value + 1);
  }
  function open(action: DeviceAction, device?: ScannerDevice) {
    setNotice('');
    setEditor({ action, device });
  }
  return (
    <section className="devices-page" aria-labelledby="devices-title">
      <div className="devices-header">
        <div>
          <p className="eyebrow">System / Devices</p>
          <h1 id="devices-title">Device management</h1>
          <p className="page-description">
            Manage gate scanners, scan direction and secure device credentials.
          </p>
        </div>
        <span className="device-admin-label">Admin access</span>
      </div>
      <div className="devices-panel">
        <div className="devices-toolbar">
          <div className="devices-title-group">
            <span className="device-icon">
              <NavigationIcon name="device" />
            </span>
            <div>
              <h2>Scanner directory</h2>
              <p>Registered entry and exit devices for your hostel.</p>
            </div>
          </div>
          <div className="device-actions">
            <Button
              variant="secondary"
              disabled={Boolean(editor) || Boolean(denied)}
              onClick={refresh}
            >
              Refresh devices
            </Button>
            <Button
              disabled={Boolean(editor) || !page}
              onClick={() => open('register')}
            >
              <span aria-hidden="true">＋</span> Register device
            </Button>
          </div>
        </div>
        <p className="device-callout">
          Device credentials are separate from staff accounts. Active status
          indicates whether authentication is allowed; it does not indicate a
          live connection.
        </p>
        {notice && (
          <p role="status" className="device-callout">
            {notice}
          </p>
        )}
        {denied ? (
          <p role="alert" className="device-error">
            {denied}
          </p>
        ) : current?.error ? (
          <div role="alert" className="device-error">
            <p>{current.error}</p>
            <Button variant="secondary" onClick={refresh}>
              Retry loading devices
            </Button>
          </div>
        ) : !page ? (
          <p role="status" className="device-empty">
            Loading scanner devices…
          </p>
        ) : (
          <>
            {!page.items.length ? (
              <div className="device-empty">
                <span className="device-icon">
                  <NavigationIcon name="device" />
                </span>
                <h3>
                  {offset
                    ? 'No devices on this page'
                    : 'No scanner devices yet'}
                </h3>
                <p>
                  {offset
                    ? 'Return to the previous page to view registered scanners.'
                    : 'Register your first gate scanner, save its credential, then configure its direction.'}
                </p>
                {!offset && (
                  <Button onClick={() => open('register')}>
                    Register your first device
                  </Button>
                )}
              </div>
            ) : (
              <div
                className="devices-table-wrap"
                role="region"
                aria-label="Scanner devices"
                tabIndex={0}
              >
                <table>
                  <caption>
                    {page.items.length} devices on this page · Updated times use
                    your device timezone
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Device</th>
                      <th scope="col">Direction</th>
                      <th scope="col">Status</th>
                      <th scope="col">Credential</th>
                      <th scope="col">Last updated</th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {page.items.map((device) => (
                      <tr key={device.device_id}>
                        <th scope="row">
                          <div className="devices-title-group">
                            <span className="device-icon">
                              <NavigationIcon name="device" />
                            </span>
                            <div>
                              <strong>{device.name}</strong>
                              <span className="device-reference">
                                {device.device_id}
                              </span>
                            </div>
                          </div>
                        </th>
                        <td>
                          <span
                            className={`device-badge ${device.direction ? '' : 'device-badge--warning'}`}
                          >
                            {device.direction === 'IN'
                              ? '↘ Entry (IN)'
                              : device.direction === 'OUT'
                                ? '↗ Exit (OUT)'
                                : 'Not configured'}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`device-badge ${device.is_active ? 'device-badge--active' : 'device-badge--inactive'}`}
                          >
                            {device.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td>
                          <span className="device-version">
                            Version {device.credential_version}
                          </span>
                        </td>
                        <td>
                          <time dateTime={device.updated_at}>
                            {new Date(device.updated_at).toLocaleDateString(
                              undefined,
                              {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              },
                            )}
                            <span className="device-reference">
                              {new Date(device.updated_at).toLocaleTimeString(
                                undefined,
                                { hour: '2-digit', minute: '2-digit' },
                              )}
                            </span>
                          </time>
                        </td>
                        <td>
                          <div className="device-row-actions">
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={Boolean(editor)}
                              aria-label={`Configure direction for ${device.name}`}
                              onClick={() => open('direction', device)}
                            >
                              Configure
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={Boolean(editor)}
                              aria-label={`Rotate credential for ${device.name}`}
                              onClick={() => open('rotate', device)}
                            >
                              Rotate credential
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="device-danger-action"
                              disabled={!device.is_active || Boolean(editor)}
                              aria-label={`Deactivate ${device.name}`}
                              onClick={() => open('deactivate', device)}
                            >
                              Deactivate
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <nav className="device-pagination" aria-label="Device pagination">
              <span>Page {Math.floor(offset / 20) + 1}</span>
              <Button
                variant="secondary"
                size="sm"
                disabled={!offset || Boolean(editor)}
                onClick={() => {
                  setNotice('');
                  setOffset(Math.max(0, offset - 20));
                }}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={
                  !page.has_more || offset + 20 > 1000000 || Boolean(editor)
                }
                onClick={() => {
                  setNotice('');
                  setOffset(offset + 20);
                }}
              >
                Next
              </Button>
            </nav>
          </>
        )}
      </div>
      {!denied && editor && (
        <DeviceDialog
          action={editor.action}
          device={editor.device}
          uid={uid}
          onClose={(changed) => {
            setEditor(undefined);
            if (changed) {
              setNotice(
                'Review the refreshed directory for the latest device settings.',
              );
              refresh();
            }
          }}
          onDenied={(message) => {
            setEditor(undefined);
            setResponse(undefined);
            setDenied(message);
          }}
        />
      )}
    </section>
  );
}
