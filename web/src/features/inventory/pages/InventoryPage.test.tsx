import { act } from 'react';
import { beforeAll, afterAll, beforeEach, expect, it, vi } from 'vitest';
import {
  render,
  screen,
  waitFor,
  fireEvent,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import InventoryPage from './InventoryPage';
import useAuth from '../../auth/hooks/useAuth';
import { AuthorizedRequestError } from '../../auth/api/authorized-request';
import {
  browseInventory,
  saveInventory,
  InventoryManagementError,
} from '../api/inventory-management.api';
import {
  inventoryBlock as block,
  inventoryRoom as room,
  inventoryBed as bed,
  inventoryPage,
} from '../../../test/fixtures/inventory';
vi.mock('../../auth/hooks/useAuth', () => ({ default: vi.fn() }));
vi.mock('../api/inventory-management.api', async (original) => ({
  ...(await original<typeof import('../api/inventory-management.api')>()),
  browseInventory: vi.fn(),
  saveInventory: vi.fn(),
}));
const browse = vi.mocked(browseInventory);
const save = vi.mocked(saveInventory);
const signOut = vi.fn();
const auth = (role = 'admin') =>
  ({
    account: { firebase_uid: 'staff', role },
    signOut,
  }) as unknown as ReturnType<typeof useAuth>;
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
  signOut.mockResolvedValue(undefined);
  vi.mocked(useAuth).mockReturnValue(auth());
  browse.mockResolvedValue(inventoryPage());
  save.mockResolvedValue(block);
});
function mount(query = '') {
  const router = createMemoryRouter(
    [
      { path: '/dashboard/inventory', element: <InventoryPage /> },
      { path: '/elsewhere', element: <p>Other page</p> },
    ],
    { initialEntries: [`/dashboard/inventory${query}`] },
  );
  const view = render(<RouterProvider router={router} />);
  return { ...view, router, user: userEvent.setup() };
}
const roomQuery = `?block_id=${block.block_id}`;
const bedQuery = `${roomQuery}&room_id=${room.room_id}`;
it('browses blocks, rooms and beds and preserves availability in pagination', async () => {
  browse.mockImplementation(async (filter) =>
    inventoryPage(
      filter.roomID ? [bed] : filter.blockID ? [room] : [block],
      filter.offset,
      21,
    ),
  );
  const { user, router } = mount();
  expect(await screen.findByText('North')).toBeVisible();
  await user.click(
    screen.getByRole('button', { name: 'View rooms for North' }),
  );
  await user.click(
    await screen.findByRole('button', { name: 'View beds for 101' }),
  );
  await screen.findByText('Available');
  await user.selectOptions(screen.getByLabelText('Availability'), 'false');
  await screen.findByText('Available');
  await user.click(screen.getByRole('button', { name: 'Next' }));
  await waitFor(() =>
    expect(browse).toHaveBeenLastCalledWith(
      {
        blockID: block.block_id,
        roomID: room.room_id,
        available: false,
        offset: 20,
      },
      'staff',
      expect.any(AbortSignal),
    ),
  );
  expect(router.state.location.search).toContain('available=false');
  await screen.findByText('Page 2 · 21 beds');
  await user.click(screen.getByRole('button', { name: 'Previous' }));
  await screen.findByText('Page 1 · 21 beds');
  await user.click(
    screen.getByRole('button', { name: 'Rooms in selected block' }),
  );
  await screen.findByText('101');
  await user.click(screen.getByRole('button', { name: 'All blocks' }));
  expect(await screen.findByText('North')).toBeVisible();
});
it.each(['', roomQuery, bedQuery])(
  'shows Warden read-only inventory at %s',
  async (query) => {
    vi.mocked(useAuth).mockReturnValue(auth('warden'));
    browse.mockResolvedValue(
      inventoryPage(query === bedQuery ? [bed] : query ? [room] : [block]),
    );
    mount(query);
    await screen.findByRole('table');
    expect(
      screen.queryByRole('button', { name: /^Create|^Rename/ }),
    ).not.toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  },
);
it('recovers malformed URL filters without making a request', async () => {
  const { user } = mount('?room_id=bad');
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Invalid inventory filters',
  );
  expect(browse).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Reset filters' }));
  expect(await screen.findByText('North')).toBeVisible();
});
it('shows loading, error, retry and empty inventory', async () => {
  browse
    .mockRejectedValueOnce(new Error('Service unavailable'))
    .mockResolvedValue(inventoryPage([]));
  const { user } = mount();
  expect(screen.getByRole('status')).toHaveTextContent('Loading inventory');
  await screen.findByText('Service unavailable');
  await user.click(screen.getByRole('button', { name: 'Retry inventory' }));
  expect(await screen.findByText('No blocks yet.')).toBeVisible();
});
it.each([
  [new InventoryManagementError('forbidden', 'Denied'), 'Access denied'],
  [
    new AuthorizedRequestError('session', 'Expired'),
    'Your session has expired',
  ],
])('clears inventory on read authorization failure %#', async (error, text) => {
  browse.mockRejectedValue(error);
  const { user } = mount();
  expect(await screen.findByRole('alert')).toHaveTextContent(text);
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Sign out' }));
  expect(signOut).toHaveBeenCalled();
});
it.each([
  ['', 'block', 'Block name', block],
  [roomQuery, 'room', 'Room label', room],
  [bedQuery, 'bed', 'Bed label', bed],
] as const)(
  'creates %s and refreshes the listing',
  async (query, singular, field, row) => {
    browse.mockResolvedValue(inventoryPage([row]));
    save.mockResolvedValue(row);
    const { user } = mount(query);
    await user.click(
      await screen.findByRole('button', { name: `Create ${singular}` }),
    );
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: `Create ${singular}`,
      }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Enter a name or label',
    );
    expect(save).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText(field), 'New');
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: `Create ${singular}`,
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][2]).toBe('New');
    expect(
      await screen.findByText(
        'Inventory saved. The listing is being refreshed.',
      ),
    ).toBeVisible();
    expect(browse).toHaveBeenCalledTimes(2);
  },
);
it('renames without moving a bed and retains a duplicate label for correction', async () => {
  browse.mockResolvedValue(inventoryPage([{ ...bed, available: false }]));
  save
    .mockRejectedValueOnce(
      new InventoryManagementError('conflict', 'This label already exists.'),
    )
    .mockResolvedValue({ ...bed, available: false, bed_no: '3' });
  const { user } = mount(bedQuery);
  await user.click(await screen.findByRole('button', { name: 'Rename 2' }));
  const input = screen.getByLabelText('Bed label');
  await user.clear(input);
  await user.type(input, '3');
  await user.click(screen.getByRole('button', { name: 'Save label' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('already exists');
  expect(input).toHaveValue('3');
  await user.click(screen.getByRole('button', { name: 'Save label' }));
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
  expect(save.mock.calls[1][5]).toMatchObject({ ...bed, available: false });
});
it('blocks uncertain create retries until the user explicitly reviews inventory', async () => {
  save.mockRejectedValue(new TypeError('Network failed'));
  const { user } = mount();
  await user.click(await screen.findByRole('button', { name: 'Create block' }));
  await user.type(screen.getByLabelText('Block name'), 'South');
  await user.click(
    within(screen.getByRole('dialog')).getByRole('button', {
      name: 'Create block',
    }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'may have been saved',
  );
  expect(
    within(screen.getByRole('dialog')).getByRole('button', {
      name: 'Create block',
    }),
  ).toBeDisabled();
  expect(screen.getByLabelText('Block name')).toHaveValue('South');
  expect(save).toHaveBeenCalledTimes(1);
  expect(
    screen.getByRole('link', { name: 'Review inventory in a new tab' }),
  ).toHaveAttribute('target', '_blank');
  await user.click(screen.getByRole('checkbox'));
  await user.click(
    within(screen.getByRole('dialog')).getByRole('button', {
      name: 'Create block',
    }),
  );
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
});
it.each([
  new InventoryManagementError('forbidden', 'Denied'),
  new AuthorizedRequestError('session', 'Expired'),
])('removes draft and inventory after a rejected write %#', async (error) => {
  save.mockRejectedValue(error);
  const { user } = mount();
  await user.click(await screen.findByRole('button', { name: 'Create block' }));
  await user.type(screen.getByLabelText('Block name'), 'South');
  await user.click(
    within(screen.getByRole('dialog')).getByRole('button', {
      name: 'Create block',
    }),
  );
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
  expect(screen.queryByText('North')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Create block' }),
  ).not.toBeInTheDocument();
});
it('locks a missing item until the user closes and refreshes', async () => {
  save.mockRejectedValue(
    new InventoryManagementError('not-found', 'Parent no longer exists.'),
  );
  const { user } = mount();
  await user.click(await screen.findByRole('button', { name: 'Rename North' }));
  await user.click(screen.getByRole('button', { name: 'Save label' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'no longer exists',
  );
  expect(screen.getByRole('button', { name: 'Save label' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  await user.click(screen.getByRole('button', { name: 'Refresh inventory' }));
  expect(await screen.findByText('North')).toBeVisible();
  expect(browse).toHaveBeenCalledTimes(2);
});
it('prevents duplicate saves and leaving during an in-flight write', async () => {
  let resolve!: (value: typeof block) => void;
  save.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const { user, router } = mount();
  await user.click(await screen.findByRole('button', { name: 'Create block' }));
  await user.type(screen.getByLabelText('Block name'), 'South');
  await user.dblClick(
    within(screen.getByRole('dialog')).getByRole('button', {
      name: 'Create block',
    }),
  );
  expect(save).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  fireEvent(
    screen.getByRole('dialog'),
    new Event('cancel', { bubbles: true, cancelable: true }),
  );
  expect(screen.getByRole('dialog')).toBeVisible();
  await act(async () => {
    await router.navigate('/elsewhere');
  });
  expect(
    await screen.findByText('Wait for this save to finish before leaving.'),
  ).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Stay here' }));
  await act(async () => resolve(block));
  expect(
    await screen.findByText('Inventory saved. The listing is being refreshed.'),
  ).toBeVisible();
});
it('protects an unsaved draft from navigation and permits explicit discard', async () => {
  const { user, router } = mount();
  await user.click(await screen.findByRole('button', { name: 'Create block' }));
  await user.type(screen.getByLabelText('Block name'), 'South');
  await act(async () => {
    await router.navigate('/elsewhere');
  });
  await user.click(
    await screen.findByRole('button', { name: 'Discard and leave' }),
  );
  expect(await screen.findByText('Other page')).toBeVisible();
  expect(save).not.toHaveBeenCalled();
});
it('restores focus after cancelling an editor', async () => {
  const { user } = mount();
  const trigger = await screen.findByRole('button', { name: 'Create block' });
  await user.click(trigger);
  fireEvent(
    screen.getByRole('dialog'),
    new Event('cancel', { bubbles: true, cancelable: true }),
  );
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});
it('returns to page one after creating from a later page without blocking the confirmed save', async () => {
  browse.mockImplementation(async (filter) =>
    inventoryPage([block], filter.offset, 21),
  );
  const { user, router } = mount('?offset=20');
  await user.click(await screen.findByRole('button', { name: 'Create block' }));
  await user.type(screen.getByLabelText('Block name'), 'South');
  await user.click(
    within(screen.getByRole('dialog')).getByRole('button', {
      name: 'Create block',
    }),
  );
  expect(await screen.findByText('Page 1 · 21 blocks')).toBeVisible();
  expect(router.state.location.search).toBe('');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
it('keeps confirmed save feedback when refreshing the list fails', async () => {
  browse
    .mockResolvedValueOnce(inventoryPage())
    .mockRejectedValue(new Error('Read failed'));
  const { user } = mount();
  await user.click(await screen.findByRole('button', { name: 'Rename North' }));
  await user.click(screen.getByRole('button', { name: 'Save label' }));
  expect(await screen.findByText('Read failed')).toBeVisible();
  expect(
    screen.getByText('Inventory saved. The listing is being refreshed.'),
  ).toBeVisible();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(save).toHaveBeenCalledTimes(1);
});
it('ignores stale responses after hierarchy navigation', async () => {
  let resolve!: (value: ReturnType<typeof inventoryPage>) => void;
  browse
    .mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    )
    .mockResolvedValue(inventoryPage([room]));
  const { router } = mount();
  await act(async () => {
    await router.navigate(`/dashboard/inventory${roomQuery}`);
  });
  await screen.findByText('101');
  await act(async () => resolve(inventoryPage()));
  expect(screen.queryByText('North')).not.toBeInTheDocument();
});
