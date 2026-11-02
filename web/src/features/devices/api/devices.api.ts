import {
  authorizedRequest,
  AuthorizedRequestError,
} from '../../auth/api/authorized-request';

export interface ScannerDevice {
  device_id: string;
  name: string;
  direction: 'IN' | 'OUT' | null;
  is_active: boolean;
  credential_version: number;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
}
export interface DevicePage {
  items: ScannerDevice[];
  limit: number;
  offset: number;
  has_more: boolean;
}
export interface DeviceResult {
  device: ScannerDevice;
  credential?: string;
}
export type DeviceAction = 'register' | 'direction' | 'rotate' | 'deactivate';
export class DeviceError extends Error {
  constructor(
    public readonly kind:
      'forbidden' | 'invalid' | 'conflict' | 'missing' | 'unavailable',
    message: string,
  ) {
    super(message);
  }
}
const base = '/api/v1/scanner-devices';
const uuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
export function deviceNameError(name: string): string | undefined {
  if (!name.trim()) return 'Enter a device name.';
  if (Array.from(name.trim()).length > 120)
    return 'Use 120 characters or fewer.';
  if (/\p{Cc}/u.test(name)) return 'Control characters are not allowed.';
}
function validDevice(value: unknown): value is ScannerDevice {
  if (!value || typeof value !== 'object') return false;
  const d = value as ScannerDevice;
  return (
    uuid(d.device_id) &&
    typeof d.name === 'string' &&
    !deviceNameError(d.name) &&
    [null, 'IN', 'OUT'].includes(d.direction) &&
    typeof d.is_active === 'boolean' &&
    Number.isSafeInteger(d.credential_version) &&
    d.credential_version > 0 &&
    typeof d.created_at === 'string' &&
    Number.isFinite(Date.parse(d.created_at)) &&
    typeof d.updated_at === 'string' &&
    Number.isFinite(Date.parse(d.updated_at)) &&
    uuid(d.created_by) &&
    uuid(d.updated_by)
  );
}
async function read(response: Response): Promise<unknown> {
  if (response.status === 401)
    throw new AuthorizedRequestError(
      'session',
      'Your session has expired. Sign in again.',
    );
  if (response.status === 403)
    throw new DeviceError(
      'forbidden',
      'Your account no longer has permission to manage devices.',
    );
  if (response.status === 400)
    throw new DeviceError(
      'invalid',
      'Check the device name or direction and try again.',
    );
  if (response.status === 404)
    throw new DeviceError(
      'missing',
      'This device no longer exists. Refresh the directory.',
    );
  if (response.status === 409)
    throw new DeviceError(
      'conflict',
      'This device name is already in use, including inactive devices.',
    );
  if (!response.ok)
    throw new DeviceError(
      'unavailable',
      'Device management is unavailable. Please try again.',
    );
  try {
    return await response.json();
  } catch {
    throw new DeviceError(
      'unavailable',
      'The service returned an unexpected device response.',
    );
  }
}
export async function listDevices(
  uid: string,
  offset: number,
  signal: AbortSignal,
): Promise<DevicePage> {
  const value = await read(
    await authorizedRequest(`${base}?limit=20&offset=${offset}`, uid, signal),
  );
  const p = value as DevicePage | null;
  if (
    !p ||
    !Array.isArray(p.items) ||
    !p.items.every(validDevice) ||
    p.items.length > 20 ||
    p.limit !== 20 ||
    p.offset !== offset ||
    typeof p.has_more !== 'boolean'
  )
    throw new DeviceError(
      'unavailable',
      'The service returned an unexpected device list.',
    );
  return p;
}
export async function changeDevice(
  action: DeviceAction,
  uid: string,
  signal: AbortSignal,
  options: { deviceID?: string; name?: string; direction?: string },
): Promise<DeviceResult> {
  if (action !== 'register' && !uuid(options.deviceID))
    throw new DeviceError('invalid', 'Select a valid device.');
  if (
    action === 'register' &&
    (typeof options.name !== 'string' || deviceNameError(options.name))
  )
    throw new DeviceError('invalid', 'Enter a valid device name.');
  if (
    action === 'direction' &&
    !['IN', 'OUT'].includes(options.direction ?? '')
  )
    throw new DeviceError('invalid', 'Choose entry or exit.');
  const suffix =
    action === 'register'
      ? ''
      : `/${options.deviceID}/${action === 'rotate' ? 'rotate-credential' : action}`;
  const payload =
    action === 'register'
      ? { name: options.name!.trim() }
      : action === 'direction'
        ? { direction: options.direction }
        : undefined;
  const value = await read(
    await authorizedRequest(`${base}${suffix}`, uid, signal, {
      method: action === 'direction' ? 'PUT' : 'POST',
      ...(payload
        ? { body: JSON.stringify(payload), contentType: 'application/json' }
        : {}),
    }),
  );
  const issued = action === 'register' || action === 'rotate';
  const result = (issued ? value : { device: value }) as DeviceResult | null;
  if (
    !result ||
    !validDevice(result.device) ||
    (action !== 'register' && result.device.device_id !== options.deviceID) ||
    (issued &&
      (typeof result.credential !== 'string' ||
        !new RegExp(
          `^hhd1\\.${result.device.device_id}\\.[A-Za-z0-9_-]{43}$`,
        ).test(result.credential)))
  )
    throw new DeviceError(
      'unavailable',
      'The device update could not be confirmed. Refresh before trying again.',
    );
  return result;
}
