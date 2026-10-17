import { render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import App from '../../../app/App';
import {
  restoreStaffSession,
  subscribeStaffSession,
} from '../../auth/api/auth.api';
import { browseInventory } from '../api/inventory-management.api';
import { inventoryPage } from '../../../test/fixtures/inventory';
vi.mock('../../auth/api/auth.api', async (original) => ({
  ...(await original<typeof import('../../auth/api/auth.api')>()),
  restoreStaffSession: vi.fn(),
  subscribeStaffSession: vi.fn(),
}));
vi.mock('../api/inventory-management.api', async (original) => ({
  ...(await original<typeof import('../api/inventory-management.api')>()),
  browseInventory: vi.fn(),
}));
const staff = {
  user_id: 'staff',
  firebase_uid: 'staff-uid',
  email: 'staff@example.com',
  role: 'admin' as const,
  is_active: true as const,
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(restoreStaffSession).mockResolvedValue(staff);
  vi.mocked(subscribeStaffSession).mockImplementation((change) => {
    let active = true;
    queueMicrotask(() => {
      if (active) change(true);
    });
    return () => {
      active = false;
    };
  });
  vi.mocked(browseInventory).mockResolvedValue(inventoryPage());
  window.history.replaceState({}, '', '/dashboard/inventory');
});
it.each(['admin', 'warden'] as const)(
  'opens inventory through verified %s routing',
  async (role) => {
    vi.mocked(restoreStaffSession).mockResolvedValue({ ...staff, role });
    render(<App />);
    expect(await screen.findByText('North')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Inventory' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(browseInventory).toHaveBeenCalledWith(
      {
        blockID: undefined,
        roomID: undefined,
        available: undefined,
        offset: 0,
      },
      'staff-uid',
      expect.any(AbortSignal),
    );
  },
);
it('redirects signed-out visitors before reading inventory', async () => {
  vi.mocked(restoreStaffSession).mockResolvedValue(null);
  render(<App />);
  await screen.findByRole('heading', { name: 'Sign in to HostelHive.' });
  expect(browseInventory).not.toHaveBeenCalled();
});
