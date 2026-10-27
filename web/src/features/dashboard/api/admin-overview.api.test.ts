import { beforeEach, expect, it, vi } from 'vitest';
import {
  getOverviewBlocks,
  getOverviewCount,
  overviewError,
  OverviewError,
} from './admin-overview.api';
import { AuthorizedRequestError } from '../../auth/api/authorized-request';
import { AttendanceError } from '../../attendance/api/student-attendance.api';
import { listLeaves, LeaveError } from '../../leave/api/leave.api';
import {
  listLateAccessRequests,
  LateAccessError,
} from '../../late-access/api/late-access.api';
import {
  listComplaints,
  ComplaintError,
} from '../../complaints/api/complaints.api';
import {
  browseInventory,
  InventoryManagementError,
} from '../../inventory/api/inventory-management.api';
import {
  inventoryBlock,
  inventoryPage,
} from '../../../test/fixtures/inventory';
import { leavePage } from '../../../test/fixtures/leave';
import { lateAccessPage } from '../../../test/fixtures/late-access';
import {
  complaintPage,
  complaintFixture,
} from '../../../test/fixtures/complaints';
vi.mock('../../leave/api/leave.api', async (original) => ({
  ...(await original<typeof import('../../leave/api/leave.api')>()),
  listLeaves: vi.fn(),
}));
vi.mock('../../late-access/api/late-access.api', async (original) => ({
  ...(await original<typeof import('../../late-access/api/late-access.api')>()),
  listLateAccessRequests: vi.fn(),
}));
vi.mock('../../complaints/api/complaints.api', async (original) => ({
  ...(await original<typeof import('../../complaints/api/complaints.api')>()),
  listComplaints: vi.fn(),
}));
vi.mock('../../inventory/api/inventory-management.api', async (original) => ({
  ...(await original<
    typeof import('../../inventory/api/inventory-management.api')
  >()),
  browseInventory: vi.fn(),
}));
const signal = () => new AbortController().signal;
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listLeaves).mockResolvedValue({ ...leavePage(), total: 25 });
  vi.mocked(listLateAccessRequests).mockResolvedValue({
    ...lateAccessPage(),
    total: 26,
  });
  vi.mocked(listComplaints).mockResolvedValue({
    ...complaintPage([complaintFixture]),
    total: 27,
  });
  vi.mocked(browseInventory).mockResolvedValue(inventoryPage());
});
it.each([
  ['leaves', 'pending', 25],
  ['access', 'pending', 26],
  ['pendingComplaints', 'pending', 27],
  ['progressComplaints', 'in_progress', 27],
] as const)(
  'uses the full authorized %s total with the intended status filter',
  async (kind, status, total) => {
    const controller = new AbortController();
    expect(await getOverviewCount(kind, 'uid', controller.signal)).toBe(total);
    const called =
      kind === 'leaves'
        ? listLeaves
        : kind === 'access'
          ? listLateAccessRequests
          : listComplaints;
    const [params, uid, sentSignal] = vi.mocked(called).mock.calls[0];
    expect([...params]).toEqual([['status', status]]);
    expect(uid).toBe('uid');
    expect(sentSignal).toBe(controller.signal);
    expect(listLeaves).toHaveBeenCalledTimes(kind === 'leaves' ? 1 : 0);
    expect(listLateAccessRequests).toHaveBeenCalledTimes(
      kind === 'access' ? 1 : 0,
    );
  },
);
it('accepts a genuine zero without substituting another metric', async () => {
  vi.mocked(listLeaves).mockResolvedValue(leavePage([]));
  expect(await getOverviewCount('leaves', 'uid', signal())).toBe(0);
});
it('passes upstream failure to the resource error handler', async () => {
  vi.mocked(listLeaves).mockRejectedValue(
    new LeaveError('forbidden', 'private message'),
  );
  await expect(
    getOverviewCount('leaves', 'uid', signal()),
  ).rejects.toMatchObject({ kind: 'forbidden' });
});
it('fetches one block page and preserves per-block values without inventing global bed counts', async () => {
  vi.mocked(browseInventory).mockResolvedValue(
    inventoryPage([inventoryBlock], 20, 21),
  );
  const result = await getOverviewBlocks('uid', signal(), 20);
  expect(browseInventory).toHaveBeenCalledWith(
    { offset: 20 },
    'uid',
    expect.any(AbortSignal),
  );
  expect(result).toEqual({ items: [inventoryBlock], offset: 20, total: 21 });
  expect(result).not.toHaveProperty('capacity');
  expect(result).not.toHaveProperty('available_beds');
});
it('accepts an empty block page and strips unnecessary response fields', async () => {
  vi.mocked(browseInventory).mockResolvedValue(inventoryPage([]));
  expect(await getOverviewBlocks('uid', signal())).toEqual({
    items: [],
    total: 0,
    offset: 0,
  });
});
it.each([-1, 1, 100020, 1.5, NaN, Infinity])(
  'rejects unsupported block offset %s before requesting',
  async (offset) => {
    await expect(
      getOverviewBlocks('uid', signal(), offset),
    ).rejects.toMatchObject({ kind: 'unavailable' });
    expect(browseInventory).not.toHaveBeenCalled();
  },
);
it.each([
  new AuthorizedRequestError('session', 'private'),
  new AttendanceError('session', 'private'),
  new LeaveError('session', 'private'),
  new LateAccessError('session', 'private'),
  new ComplaintError('session', 'private'),
])(
  'normalizes session rejection without showing provider details %#',
  (error) => {
    expect(overviewError(error)).toMatchObject({
      kind: 'session',
      message: 'Your session has expired. Sign in again.',
    });
  },
);
it.each([
  new AttendanceError('forbidden', 'private'),
  new LeaveError('forbidden', 'private'),
  new LateAccessError('forbidden', 'private'),
  new ComplaintError('forbidden', 'private'),
  new InventoryManagementError('forbidden', 'private'),
])('normalizes resource access denial %#', (error) => {
  expect(overviewError(error)).toMatchObject({ kind: 'forbidden' });
  expect(overviewError(error).message).not.toContain('private');
});
it.each([
  null,
  new Error('secret body'),
  new AuthorizedRequestError('unavailable', 'private'),
  new LeaveError('unavailable', 'private'),
])('uses safe unavailable messages %#', (error) => {
  expect(overviewError(error)).toMatchObject({
    kind: 'unavailable',
    message: 'This summary could not be loaded. Please retry.',
  });
});
it('preserves an already normalized error', () => {
  const error = new OverviewError('unavailable', 'Retry this section');
  expect(overviewError(error)).toBe(error);
});
