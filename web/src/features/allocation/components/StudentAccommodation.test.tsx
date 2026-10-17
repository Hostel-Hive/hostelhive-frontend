import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from 'vitest';
import StudentAccommodation from './StudentAccommodation';
import {
  AllocationError,
  listAllocations,
  changeAllocation,
} from '../api/allocation.api';
import {
  listInventory,
  InventoryError,
} from '../../inventory/api/inventory.api';
import { AuthorizedRequestError } from '../../auth/api/authorized-request';
import {
  allocationFixture,
  newAllocationFixture,
  allocationPage,
  blockFixture,
  roomFixture,
  bedFixture,
} from '../../../test/fixtures/allocation';
import { studentFixture } from '../../../test/fixtures/student';
const { signOut } = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock('../../auth/hooks/useAuth', () => ({ default: () => ({ signOut }) }));
vi.mock('../api/allocation.api', async (original) => ({
  ...(await original<typeof import('../api/allocation.api')>()),
  listAllocations: vi.fn(),
  changeAllocation: vi.fn(),
}));
vi.mock('../../inventory/api/inventory.api', async (original) => ({
  ...(await original<typeof import('../../inventory/api/inventory.api')>()),
  listInventory: vi.fn(),
}));
const originalShow = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  'showModal',
);
const originalClose = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  'close',
);
beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    },
  });
});
afterAll(() => {
  if (originalShow)
    Object.defineProperty(
      HTMLDialogElement.prototype,
      'showModal',
      originalShow,
    );
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  if (originalClose)
    Object.defineProperty(HTMLDialogElement.prototype, 'close', originalClose);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listAllocations).mockResolvedValue(allocationPage());
  vi.mocked(changeAllocation).mockResolvedValue(newAllocationFixture);
  vi.mocked(listInventory).mockImplementation(
    async (kind, _uid, _signal, offset = 0) => ({
      items: [
        kind === 'blocks'
          ? blockFixture
          : kind === 'rooms'
            ? roomFixture
            : bedFixture,
      ],
      total: 1,
      limit: 20,
      offset,
    }),
  );
});
afterEach(() => vi.restoreAllMocks());
function renderCard(eligible = true) {
  return render(
    <StudentAccommodation
      studentID={studentFixture.student_id}
      studentName={studentFixture.full_name}
      eligible={eligible}
      uid="staff-uid"
    />,
  );
}
async function load() {
  await userEvent.click(
    screen.getByRole('button', { name: 'Load accommodation' }),
  );
  await screen.findByRole('heading', { name: 'Current assignment' });
}
function current() {
  vi.mocked(listAllocations).mockImplementation(
    async (_id, _uid, _signal, offset = 0) =>
      allocationPage([allocationFixture], offset),
  );
}
async function chooseBed() {
  await userEvent.click(await screen.findByRole('button', { name: 'North' }));
  await userEvent.click(
    await screen.findByRole('button', { name: 'Room 101' }),
  );
  await userEvent.click(
    await screen.findByRole('button', { name: 'Select bed 2' }),
  );
}
it('loads current assignment and history on demand without changing student data', async () => {
  renderCard();
  expect(listAllocations).not.toHaveBeenCalled();
  await load();
  expect(screen.getByText('No active bed allocation.')).toBeInTheDocument();
  expect(screen.getByText('No allocation history.')).toBeInTheDocument();
  expect(listAllocations).toHaveBeenCalledWith(
    studentFixture.student_id,
    'staff-uid',
    expect.any(AbortSignal),
    0,
    true,
  );
  expect(changeAllocation).not.toHaveBeenCalled();
});
it('assigns only after choosing an available bed and confirming the named student', async () => {
  renderCard();
  await load();
  await userEvent.click(screen.getByRole('button', { name: 'Assign bed' }));
  const dialog = screen.getByRole('dialog');
  expect(dialog).toHaveTextContent('Alex Morgan');
  expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
  expect(
    screen.getByRole('button', { name: 'Confirm assignment' }),
  ).toBeDisabled();
  await chooseBed();
  expect(dialog).toHaveTextContent('North / Room 101 / Bed 2');
  current();
  await userEvent.click(
    screen.getByRole('button', { name: 'Confirm assignment' }),
  );
  await screen.findByText('Bed assigned.');
  await screen.findByRole('button', { name: 'Transfer bed' });
  expect(changeAllocation).toHaveBeenCalledWith(
    'assign',
    studentFixture.student_id,
    'staff-uid',
    expect.any(AbortSignal),
    undefined,
    bedFixture.bed_id,
  );
});
it('transfers a current allocation using its allocation ID and refreshes history', async () => {
  current();
  renderCard();
  await load();
  await userEvent.click(screen.getByRole('button', { name: 'Transfer bed' }));
  await chooseBed();
  await userEvent.click(
    screen.getByRole('button', { name: 'Confirm transfer' }),
  );
  await screen.findByText('Bed transferred.');
  expect(changeAllocation).toHaveBeenCalledWith(
    'transfer',
    studentFixture.student_id,
    'staff-uid',
    expect.any(AbortSignal),
    allocationFixture.allocation_id,
    bedFixture.bed_id,
  );
});
it('keeps inactive allocations visible and allows explicit revocation only', async () => {
  current();
  vi.mocked(changeAllocation).mockResolvedValue({
    ...allocationFixture,
    ended_at: '2026-10-02T00:00:00Z',
    end_reason: 'revoked',
  });
  renderCard(false);
  await load();
  expect(
    screen.queryByRole('button', { name: 'Transfer bed' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Assign bed' }),
  ).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole('button', { name: 'Revoke allocation' }),
  );
  expect(screen.getByRole('dialog')).toHaveTextContent(
    'history and the student account are kept',
  );
  expect(listInventory).not.toHaveBeenCalled();
  vi.mocked(listAllocations).mockResolvedValue(allocationPage());
  await userEvent.click(
    screen.getByRole('button', { name: 'Confirm revocation' }),
  );
  await screen.findByText('Allocation revoked.');
  await screen.findByText('No active bed allocation.');
  expect(changeAllocation).toHaveBeenCalledWith(
    'revoke',
    studentFixture.student_id,
    'staff-uid',
    expect.any(AbortSignal),
    allocationFixture.allocation_id,
    undefined,
  );
});
it('cancels via Escape without mutating and restores focus', async () => {
  renderCard();
  await load();
  const button = screen.getByRole('button', { name: 'Assign bed' });
  await userEvent.click(button);
  fireEvent(
    screen.getByRole('dialog'),
    new Event('cancel', { cancelable: true }),
  );
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(button).toHaveFocus();
  expect(changeAllocation).not.toHaveBeenCalled();
});
it('locks duplicate submissions and dismissal while saving', async () => {
  let finish!: (value: typeof newAllocationFixture) => void;
  vi.mocked(changeAllocation).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  renderCard();
  await load();
  await userEvent.click(screen.getByRole('button', { name: 'Assign bed' }));
  await chooseBed();
  const confirm = screen.getByRole('button', { name: 'Confirm assignment' });
  fireEvent.click(confirm);
  fireEvent.click(confirm);
  expect(changeAllocation).toHaveBeenCalledOnce();
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  fireEvent(
    screen.getByRole('dialog'),
    new Event('cancel', { cancelable: true }),
  );
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  const unload = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(unload);
  expect(unload.defaultPrevented).toBe(true);
  await act(async () => finish(newAllocationFixture));
  await screen.findByText('Bed assigned.');
});
it.each(['conflict', 'ineligible', 'not-found', 'unavailable'] as const)(
  'requires a fresh read after %s rather than retrying a mutation blindly',
  async (kind) => {
    current();
    vi.mocked(changeAllocation).mockRejectedValue(
      new AllocationError(kind, 'Refresh accommodation.'),
    );
    renderCard();
    await load();
    await userEvent.click(screen.getByRole('button', { name: 'Transfer bed' }));
    await chooseBed();
    await userEvent.click(
      screen.getByRole('button', { name: 'Confirm transfer' }),
    );
    await screen.findByRole('alert');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Transfer bed' }),
    ).not.toBeInTheDocument();
    expect(changeAllocation).toHaveBeenCalledOnce();
    await userEvent.click(
      screen.getByRole('button', { name: 'Refresh accommodation' }),
    );
    await screen.findByRole('button', { name: 'Transfer bed' });
    expect(changeAllocation).toHaveBeenCalledOnce();
  },
);
it('keeps acknowledged success distinct from a failed refresh', async () => {
  renderCard();
  await load();
  await userEvent.click(screen.getByRole('button', { name: 'Assign bed' }));
  await chooseBed();
  vi.mocked(listAllocations).mockRejectedValue(new Error('offline'));
  await userEvent.click(
    screen.getByRole('button', { name: 'Confirm assignment' }),
  );
  expect(
    await screen.findByText(
      /Change saved, but accommodation could not be refreshed/,
    ),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Assign bed' }),
  ).not.toBeInTheDocument();
  expect(changeAllocation).toHaveBeenCalledOnce();
});
it.each(['session', 'forbidden'] as const)(
  'clears accommodation controls after %s failure',
  async (kind) => {
    vi.mocked(listAllocations).mockRejectedValue(
      new AllocationError(kind, 'Access unavailable.'),
    );
    renderCard();
    await userEvent.click(
      screen.getByRole('button', { name: 'Load accommodation' }),
    );
    await screen.findByRole('alert');
    expect(
      screen.queryByRole('button', { name: 'Refresh accommodation' }),
    ).not.toBeInTheDocument();
    if (kind === 'session') {
      await userEvent.click(
        screen.getByRole('button', { name: 'Sign in again' }),
      );
      expect(signOut).toHaveBeenCalledOnce();
    }
  },
);
it('paginates history independently of the current allocation and retains ended statuses', async () => {
  vi.mocked(listAllocations).mockImplementation(
    async (_id, _uid, _signal, offset = 0, active = false) =>
      active
        ? allocationPage([allocationFixture])
        : allocationPage(
            [
              {
                ...allocationFixture,
                ended_at: '2026-10-03T00:00:00Z',
                end_reason: offset ? 'revoked' : 'transferred',
              },
            ],
            offset,
            11,
          ),
  );
  renderCard();
  await load();
  expect(
    screen.getByRole('region', { name: 'Allocation history' }),
  ).toHaveTextContent('Transferred');
  await userEvent.click(
    screen.getByRole('button', { name: 'Next allocations' }),
  );
  expect(await screen.findByText('Revoked')).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Next allocations' }),
  ).toBeDisabled();
  await userEvent.click(
    screen.getByRole('button', { name: 'Previous allocations' }),
  );
  await screen.findByText('Transferred');
});
it('handles empty inventories and retries inventory failure without writing', async () => {
  vi.mocked(listInventory).mockRejectedValueOnce(new Error('offline'));
  renderCard();
  await load();
  await userEvent.click(screen.getByRole('button', { name: 'Assign bed' }));
  await screen.findByRole('alert');
  await userEvent.click(
    screen.getByRole('button', { name: 'Retry inventory' }),
  );
  await userEvent.click(await screen.findByRole('button', { name: 'North' }));
  await userEvent.click(
    await screen.findByRole('button', { name: 'Room 101' }),
  );
  await userEvent.click(
    await screen.findByRole('button', { name: 'Change room' }),
  );
  await userEvent.click(
    await screen.findByRole('button', { name: 'Change block' }),
  );
  expect(
    await screen.findByRole('button', { name: 'North' }),
  ).toBeInTheDocument();
  expect(changeAllocation).not.toHaveBeenCalled();
});
it.each([
  new InventoryError('forbidden', 'denied'),
  new AuthorizedRequestError('session', 'expired'),
])(
  'closes the picker and blocks mutations when inventory access is lost',
  async (failure) => {
    vi.mocked(listInventory).mockRejectedValue(failure);
    renderCard();
    await load();
    await userEvent.click(screen.getByRole('button', { name: 'Assign bed' }));
    await screen.findByRole('alert');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Assign bed' }),
    ).not.toBeInTheDocument();
    expect(changeAllocation).not.toHaveBeenCalled();
  },
);
it('offers no available-bed confirmation for an empty room', async () => {
  vi.mocked(listInventory).mockImplementation(
    async (kind, _uid, _signal, offset = 0) => ({
      items:
        kind === 'beds' ? [] : [kind === 'blocks' ? blockFixture : roomFixture],
      total: kind === 'beds' ? 0 : 1,
      limit: 20,
      offset,
    }),
  );
  renderCard();
  await load();
  await userEvent.click(screen.getByRole('button', { name: 'Assign bed' }));
  await userEvent.click(await screen.findByRole('button', { name: 'North' }));
  await userEvent.click(
    await screen.findByRole('button', { name: 'Room 101' }),
  );
  await screen.findByText('No available beds on this page.');
  expect(
    screen.getByRole('button', { name: 'Confirm assignment' }),
  ).toBeDisabled();
});
it('paginates inventory options', async () => {
  vi.mocked(listInventory).mockImplementation(
    async (_kind, _uid, _signal, offset = 0) => ({
      items: [blockFixture],
      total: 21,
      limit: 20,
      offset,
    }),
  );
  renderCard();
  await load();
  await userEvent.click(screen.getByRole('button', { name: 'Assign bed' }));
  await screen.findByRole('button', { name: 'North' });
  await userEvent.click(
    screen.getByRole('button', { name: 'Next inventory page' }),
  );
  await screen.findByRole('button', { name: 'North' });
  expect(listInventory).toHaveBeenLastCalledWith(
    'blocks',
    'staff-uid',
    expect.any(AbortSignal),
    20,
    undefined,
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Previous inventory page' }),
  );
  await screen.findByRole('button', { name: 'North' });
});
it('aborts pending reads on unmount and ignores late results', async () => {
  let finish!: (value: ReturnType<typeof allocationPage>) => void;
  vi.mocked(listAllocations).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const view = renderCard();
  fireEvent.click(screen.getByRole('button', { name: 'Load accommodation' }));
  const signal = vi.mocked(listAllocations).mock.calls[0][2];
  view.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => finish(allocationPage()));
  expect(changeAllocation).not.toHaveBeenCalled();
});
