import { beforeAll, beforeEach, afterAll, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import DeviceManagementPage from './DeviceManagementPage';
import useAuth from '../../auth/hooks/useAuth';
import { changeDevice, listDevices, DeviceError } from '../api/devices.api';
import {
  scanner,
  scannerPage,
  issuedCredential,
} from '../../../test/fixtures/devices';
vi.mock('../../auth/hooks/useAuth', () => ({ default: vi.fn() }));
vi.mock('../api/devices.api', async (original) => ({
  ...(await original<typeof import('../api/devices.api')>()),
  listDevices: vi.fn(),
  changeDevice: vi.fn(),
}));
const list = vi.mocked(listDevices);
const change = vi.mocked(changeDevice);
const auth = (role = 'admin', uid = 'admin') =>
  ({ account: { role, firebase_uid: uid } }) as ReturnType<typeof useAuth>;
const show = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  'showModal',
);
const close = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  'close',
);
beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value() {
      this.setAttribute('open', '');
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value() {
      this.removeAttribute('open');
    },
  });
});
afterAll(() => {
  if (show)
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', show);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  if (close) Object.defineProperty(HTMLDialogElement.prototype, 'close', close);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(useAuth).mockReturnValue(auth());
  list.mockResolvedValue(scannerPage);
  change.mockResolvedValue({ device: scanner });
});
function mount() {
  const router = createMemoryRouter([
    { path: '/', element: <DeviceManagementPage /> },
    { path: '/other', element: <p>Other page</p> },
  ]);
  return {
    ...render(<RouterProvider router={router} />),
    router,
    user: userEvent.setup(),
  };
}
it('denies non-admin users before requesting device data', () => {
  vi.mocked(useAuth).mockReturnValue(auth('warden'));
  mount();
  expect(screen.getByRole('alert')).toHaveTextContent('administrators only');
  expect(list).not.toHaveBeenCalled();
});
it('registers a device, requires saving the one-time credential and clears it on dismissal', async () => {
  change.mockResolvedValue({ device: scanner, credential: issuedCredential });
  const { user, router } = mount();
  await user.click(
    await screen.findByRole('button', { name: /Register device/ }),
  );
  await user.type(
    screen.getByRole('textbox', { name: 'Device name' }),
    'Gate A',
  );
  await user.click(
    within(screen.getByRole('dialog')).getByRole('button', {
      name: 'Register device',
    }),
  );
  expect(
    await screen.findByRole('textbox', { name: 'Device credential' }),
  ).toHaveValue(issuedCredential);
  expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled();
  await act(async () => {
    await router.navigate('/other');
  });
  expect(screen.getByRole('alert')).toHaveTextContent('before leaving');
  await user.click(screen.getByRole('button', { name: 'Stay on this page' }));
  await user.click(screen.getByRole('checkbox'));
  await user.click(screen.getByRole('button', { name: 'Done' }));
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
  expect(screen.queryByDisplayValue(issuedCredential)).not.toBeInTheDocument();
  expect(change).toHaveBeenCalledTimes(1);
  expect(list).toHaveBeenCalledTimes(2);
});
it('configures direction and confirms deactivation before mutating', async () => {
  const { user } = mount();
  await user.click(
    await screen.findByRole('button', {
      name: 'Configure direction for Main gate',
    }),
  );
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Scan direction' }),
    'OUT',
  );
  await user.click(screen.getByRole('button', { name: 'Save direction' }));
  await waitFor(() =>
    expect(change).toHaveBeenCalledWith(
      'direction',
      'admin',
      expect.any(AbortSignal),
      expect.objectContaining({
        deviceID: scanner.device_id,
        direction: 'OUT',
      }),
    ),
  );
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
  await user.click(
    await screen.findByRole('button', { name: 'Deactivate Main gate' }),
  );
  expect(change).toHaveBeenCalledTimes(1);
  expect(
    screen.getByText(/Reactivation is not currently supported/),
  ).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Deactivate device' }));
  await waitFor(() => expect(change).toHaveBeenCalledTimes(2));
});
it('does not automatically repeat credential rotation when the result is uncertain', async () => {
  change.mockRejectedValue(new TypeError('Network lost'));
  const { user } = mount();
  await user.click(
    await screen.findByRole('button', {
      name: 'Rotate credential for Main gate',
    }),
  );
  await user.click(screen.getByRole('button', { name: 'Rotate credential' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'previous credential may no longer work',
  );
  expect(
    screen.queryByRole('button', { name: 'Rotate credential' }),
  ).not.toBeInTheDocument();
  expect(change).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole('button', { name: 'Close and refresh' }));
  await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
});
it('clears private device rows on denied refresh and prevents further actions', async () => {
  const { user } = mount();
  await screen.findByText('Main gate');
  list.mockRejectedValue(new DeviceError('forbidden', 'Access denied'));
  await user.click(screen.getByRole('button', { name: 'Refresh devices' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Access denied');
  expect(screen.queryByText('Main gate')).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: /Register device/ }),
  ).toBeDisabled();
});
it('paginates with has_more and disables deactivation for inactive devices', async () => {
  list
    .mockResolvedValueOnce({ ...scannerPage, has_more: true })
    .mockResolvedValueOnce({
      ...scannerPage,
      offset: 20,
      items: [{ ...scanner, is_active: false }],
    });
  const { user } = mount();
  await screen.findByText('Main gate');
  await user.click(screen.getByRole('button', { name: 'Next' }));
  expect(await screen.findByText('Inactive')).toBeInTheDocument();
  expect(list).toHaveBeenLastCalledWith('admin', 20, expect.any(AbortSignal));
  expect(
    screen.getByRole('button', { name: 'Deactivate Main gate' }),
  ).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
});
