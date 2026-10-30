import { beforeEach, expect, it, vi } from 'vitest';
import { authorizedRequest } from '../../auth/api/authorized-request';
import { changeDevice, listDevices, deviceNameError } from './devices.api';
import {
  scanner,
  scannerPage,
  issuedCredential,
} from '../../../test/fixtures/devices';
vi.mock('../../auth/api/authorized-request', async (original) => ({
  ...(await original<typeof import('../../auth/api/authorized-request')>()),
  authorizedRequest: vi.fn(),
}));
const request = vi.mocked(authorizedRequest);
const signal = new AbortController().signal;
beforeEach(() => vi.resetAllMocks());
it('lists devices with backend pagination and no credentials', async () => {
  request.mockResolvedValue(Response.json(scannerPage));
  await expect(listDevices('admin', 0, signal)).resolves.toEqual(scannerPage);
  expect(request).toHaveBeenCalledWith(
    '/api/v1/scanner-devices?limit=20&offset=0',
    'admin',
    signal,
  );
});
it.each([
  ['register', '', 'POST', { name: 'Main gate' }],
  ['direction', `/${scanner.device_id}/direction`, 'PUT', { direction: 'OUT' }],
  ['rotate', `/${scanner.device_id}/rotate-credential`, 'POST', undefined],
  ['deactivate', `/${scanner.device_id}/deactivate`, 'POST', undefined],
] as const)(
  'uses the exact %s contract',
  async (action, suffix, method, body) => {
    const issued = action === 'register' || action === 'rotate';
    request.mockResolvedValue(
      Response.json(
        issued ? { device: scanner, credential: issuedCredential } : scanner,
      ),
    );
    await changeDevice(action, 'admin', signal, {
      name: ' Main gate ',
      deviceID: scanner.device_id,
      direction: 'OUT',
    });
    expect(request).toHaveBeenCalledWith(
      `/api/v1/scanner-devices${suffix}`,
      'admin',
      signal,
      body
        ? {
            method,
            contentType: 'application/json',
            body: JSON.stringify(body),
          }
        : { method },
    );
  },
);
it.each([
  [401, 'session'],
  [403, 'forbidden'],
  [400, 'invalid'],
  [404, 'missing'],
  [409, 'conflict'],
  [503, 'unavailable'],
] as const)(
  'handles HTTP %i without leaking response text',
  async (status, kind) => {
    request.mockResolvedValue(
      new Response('private backend details', { status }),
    );
    await expect(listDevices('admin', 0, signal)).rejects.toMatchObject({
      kind,
    });
  },
);
it('rejects malformed lists and credentials bound to another device', async () => {
  request.mockResolvedValueOnce(
    Response.json({
      ...scannerPage,
      items: [{ ...scanner, direction: 'SIDE' }],
    }),
  );
  await expect(listDevices('admin', 0, signal)).rejects.toMatchObject({
    kind: 'unavailable',
  });
  request.mockResolvedValueOnce(
    Response.json({ device: scanner, credential: 'hhd1.other.secret' }),
  );
  await expect(
    changeDevice('rotate', 'admin', signal, { deviceID: scanner.device_id }),
  ).rejects.toMatchObject({ kind: 'unavailable' });
});
it('validates names, IDs and directions before sending mutations', async () => {
  expect(deviceNameError('  ')).toBeTruthy();
  expect(deviceNameError('a'.repeat(121))).toBeTruthy();
  expect(deviceNameError('gate\n')).toBeTruthy();
  expect(deviceNameError(' Gate 01 ')).toBeUndefined();
  await expect(
    changeDevice('direction', 'admin', signal, {
      deviceID: scanner.device_id,
      direction: 'SIDE',
    }),
  ).rejects.toMatchObject({ kind: 'invalid' });
  await expect(
    changeDevice('rotate', 'admin', signal, { deviceID: '../other' }),
  ).rejects.toMatchObject({ kind: 'invalid' });
  expect(request).not.toHaveBeenCalled();
});
