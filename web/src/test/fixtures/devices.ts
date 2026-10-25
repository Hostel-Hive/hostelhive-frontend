import type {
  ScannerDevice,
  DevicePage,
} from '../../features/devices/api/devices.api';
export const scanner: ScannerDevice = {
  device_id: '11111111-1111-4111-8111-111111111111',
  name: 'Main gate',
  direction: null,
  is_active: true,
  credential_version: 1,
  created_at: '2026-10-01T10:00:00Z',
  updated_at: '2026-10-01T10:00:00Z',
  created_by: '22222222-2222-4222-8222-222222222222',
  updated_by: '22222222-2222-4222-8222-222222222222',
};
export const scannerPage: DevicePage = {
  items: [scanner],
  limit: 20,
  offset: 0,
  has_more: false,
};
// Synthetic credential for mocked tests only.
export const issuedCredential = `hhd1.${scanner.device_id}.${'x'.repeat(43)}`;
