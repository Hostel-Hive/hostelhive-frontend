import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import AdminDashboardPage from './AdminDashboardPage';
import useAuth from '../../auth/hooks/useAuth';
import { getPresenceSummary } from '../../attendance/api/staff-attendance.api';
import { AttendanceError } from '../../attendance/api/student-attendance.api';
import {
  getOverviewBlocks,
  getOverviewCount,
  OverviewError,
} from '../api/admin-overview.api';
import type { OverviewBlocks } from '../api/admin-overview.api';
import { inventoryBlock } from '../../../test/fixtures/inventory';
import { staffSummary } from '../../../test/fixtures/staffAttendance';
vi.mock('../../auth/hooks/useAuth', () => ({ default: vi.fn() }));
vi.mock('../../attendance/api/staff-attendance.api', async (original) => ({
  ...(await original<
    typeof import('../../attendance/api/staff-attendance.api')
  >()),
  getPresenceSummary: vi.fn(),
}));
vi.mock('../api/admin-overview.api', async (original) => ({
  ...(await original<typeof import('../api/admin-overview.api')>()),
  getOverviewBlocks: vi.fn(),
  getOverviewCount: vi.fn(),
}));
const verify = vi.fn();
const signOut = vi.fn();
function auth(uid = 'uid', role: 'admin' | 'warden' | 'student' = 'admin') {
  vi.mocked(useAuth).mockReturnValue({
    account: {
      firebase_uid: uid,
      user_id: 'admin-id',
      email: 'admin@example.edu',
      role,
      is_active: true,
    },
    status: 'authenticated',
    busy: false,
    message: '',
    verifiedPath: '/dashboard/admin',
    signIn: vi.fn(),
    retry: verify,
    signOut,
  });
}
const blocks = (): OverviewBlocks => ({
  items: [inventoryBlock],
  offset: 0,
  total: 1,
});
beforeEach(() => {
  vi.resetAllMocks();
  auth();
  verify.mockResolvedValue(undefined);
  signOut.mockResolvedValue(undefined);
  vi.mocked(getPresenceSummary).mockResolvedValue(staffSummary);
  vi.mocked(getOverviewBlocks).mockResolvedValue(blocks());
  vi.mocked(getOverviewCount).mockImplementation(
    async (kind) =>
      ({
        leaves: 31,
        access: 22,
        pendingComplaints: 13,
        progressComplaints: 4,
      })[kind],
  );
});
const element = () => (
  <MemoryRouter>
    <AdminDashboardPage />
  </MemoryRouter>
);
async function open() {
  const view = render(element());
  await screen.findByRole('link', { name: inventoryBlock.name });
  return view;
}
function card(label: string) {
  return within(screen.getByRole('article', { name: label }));
}
it('shows a distinct Admin overview with six backend metrics and a compact presence snapshot', async () => {
  await open();
  expect(screen.getByText('Staff / Overview')).toBeVisible();
  expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
  for (const [label, value] of [
    ['Active students', '10'],
    ['Hostel blocks', '1'],
    ['Pending leave requests', '31'],
    ['Pending access requests', '22'],
    ['Pending complaints', '13'],
    ['Complaints in progress', '4'],
  ])
    expect(card(label).getByText(value)).toBeVisible();
  expect(screen.getByLabelText('Recorded presence counts')).toHaveTextContent(
    'IN6OUT3UNKNOWN1',
  );
  expect(
    screen.queryByRole('button', { name: 'Enable live updates' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('textbox', { name: 'Search name or Student ID' }),
  ).not.toBeInTheDocument();
  expect(screen.getByText(/UNKNOWN does not mean outside/)).toBeVisible();
});
it('links metrics to the intended filtered workflows and exposes management shortcuts', async () => {
  await open();
  for (const [name, href] of [
    ['Manage students', '/dashboard/students'],
    ['Browse inventory', '/dashboard/inventory'],
    ['Review pending leave requests', '/dashboard/leaves?status=pending'],
    [
      'Review pending access requests',
      '/dashboard/late-access-requests?status=pending',
    ],
    ['Review pending complaints', '/dashboard/complaints?status=pending'],
    [
      'Review complaints in progress',
      '/dashboard/complaints?status=in_progress',
    ],
    ['Open attendance dashboard', '/dashboard/attendance'],
    ['Open reports and exports', '/dashboard/reports'],
    ['Import student profiles', '/dashboard/students/import'],
    ['Review attendance incidents', '/dashboard/attendance/incidents'],
    ['Manage announcements', '/dashboard/announcements'],
    ['Open your notification inbox', '/dashboard/notifications'],
  ])
    expect(screen.getByRole('link', { name })).toHaveAttribute('href', href);
  expect(
    screen.getByRole('link', { name: inventoryBlock.name }),
  ).toHaveAttribute(
    'href',
    `/dashboard/inventory?block_id=${inventoryBlock.block_id}`,
  );
});
it('uses per-block accommodation values without claiming global bed occupancy', async () => {
  await open();
  const region = screen.getByRole('region', { name: 'Accommodation results' });
  expect(region).toHaveTextContent('Rooms1Beds2Occupied beds1Available beds1');
  expect(screen.getByText(/not a hostel-wide bed total/)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Next blocks' })).toBeDisabled();
  expect(
    screen.getByRole('button', { name: 'Previous blocks' }),
  ).toBeDisabled();
});
it('loads sections independently without showing unresolved data as zero', async () => {
  vi.mocked(getOverviewCount).mockImplementation((kind) =>
    kind === 'leaves' ? new Promise(() => {}) : Promise.resolve(7),
  );
  await open();
  expect(card('Pending leave requests').getByRole('status')).toHaveTextContent(
    'Loading',
  );
  expect(
    card('Pending leave requests').getByLabelText('Count unavailable'),
  ).toHaveTextContent('—');
  expect(
    card('Pending leave requests').queryByText('0'),
  ).not.toBeInTheDocument();
  expect(card('Pending complaints').getByText('7')).toBeVisible();
});
it('renders genuine zero totals and an empty accommodation state', async () => {
  vi.mocked(getPresenceSummary).mockResolvedValue({
    total: 0,
    in: 0,
    out: 0,
    unknown: 0,
  });
  vi.mocked(getOverviewBlocks).mockResolvedValue({
    items: [],
    offset: 0,
    total: 0,
  });
  vi.mocked(getOverviewCount).mockResolvedValue(0);
  render(element());
  expect(
    await screen.findByText('No accommodation blocks have been created yet.'),
  ).toBeVisible();
  expect(card('Active students').getByText('0')).toBeVisible();
  expect(card('Pending leave requests').getByText('0')).toBeVisible();
});
it('retries only a failed metric while retaining other successful summaries', async () => {
  vi.mocked(getOverviewCount).mockImplementation(async (kind) => {
    if (kind === 'leaves') throw new Error('private body');
    return 4;
  });
  await open();
  expect(
    card('Pending leave requests').getByRole('alert'),
  ).not.toHaveTextContent('private body');
  expect(card('Active students').getByText('10')).toBeVisible();
  vi.mocked(getOverviewCount).mockResolvedValue(8);
  fireEvent.click(
    screen.getByRole('button', { name: 'Retry pending leave requests' }),
  );
  expect(await card('Pending leave requests').findByText('8')).toBeVisible();
  expect(getPresenceSummary).toHaveBeenCalledTimes(1);
  expect(getOverviewBlocks).toHaveBeenCalledTimes(1);
  expect(getOverviewCount).toHaveBeenCalledTimes(5);
});
it('allows retrying the shared attendance summary from its snapshot panel', async () => {
  vi.mocked(getPresenceSummary).mockRejectedValueOnce(new Error('unavailable'));
  await open();
  expect(
    card('Active students').getByLabelText('Count unavailable'),
  ).toBeVisible();
  fireEvent.click(
    screen.getByRole('button', { name: 'Retry recorded presence' }),
  );
  expect(await card('Active students').findByText('10')).toBeVisible();
  expect(getPresenceSummary).toHaveBeenCalledTimes(2);
});
it('retries accommodation failure without refetching unrelated metrics', async () => {
  vi.mocked(getOverviewBlocks).mockRejectedValueOnce(new Error('unavailable'));
  render(element());
  fireEvent.click(
    await screen.findByRole('button', { name: 'Retry accommodation' }),
  );
  expect(
    await screen.findByRole('link', { name: inventoryBlock.name }),
  ).toBeVisible();
  expect(getOverviewBlocks).toHaveBeenCalledTimes(2);
  expect(getOverviewCount).toHaveBeenCalledTimes(4);
});
it('paginates only accommodation and restores focus after the page loads', async () => {
  vi.mocked(getOverviewBlocks).mockImplementation(
    async (_uid, _signal, offset = 0) => ({
      items: [{ ...inventoryBlock, name: offset ? 'Block B' : 'Block A' }],
      offset,
      total: 21,
    }),
  );
  render(element());
  await screen.findByRole('link', { name: 'Block A' });
  fireEvent.click(screen.getByRole('button', { name: 'Next blocks' }));
  await screen.findByRole('link', { name: 'Block B' });
  await waitFor(() =>
    expect(
      screen.getByRole('region', { name: 'Accommodation results' }),
    ).toHaveFocus(),
  );
  expect(getOverviewBlocks).toHaveBeenLastCalledWith(
    'uid',
    expect.any(AbortSignal),
    20,
  );
  expect(getOverviewCount).toHaveBeenCalledTimes(4);
  expect(getPresenceSummary).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Previous blocks' }));
  expect(await screen.findByRole('link', { name: 'Block A' })).toBeVisible();
});
it('refreshes all summaries together and returns accommodation to page one', async () => {
  vi.mocked(getOverviewBlocks).mockResolvedValue({ ...blocks(), total: 21 });
  await open();
  fireEvent.click(screen.getByRole('button', { name: 'Next blocks' }));
  await screen.findByText('Page 2');
  fireEvent.click(screen.getByRole('button', { name: 'Refresh overview' }));
  await screen.findByText('Page 1');
  await waitFor(() => expect(getOverviewCount).toHaveBeenCalledTimes(8));
  expect(getPresenceSummary).toHaveBeenCalledTimes(2);
  expect(getOverviewBlocks).toHaveBeenLastCalledWith(
    'uid',
    expect.any(AbortSignal),
    0,
  );
});
it('recovers an empty later page without asserting that the entire hostel has no blocks', async () => {
  vi.mocked(getOverviewBlocks).mockImplementation(
    async (_uid, _signal, offset = 0) => ({
      items: offset ? [] : [inventoryBlock],
      offset,
      total: offset ? 1 : 21,
    }),
  );
  await open();
  fireEvent.click(screen.getByRole('button', { name: 'Next blocks' }));
  expect(await screen.findByText(/No blocks on this page/)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Previous blocks' })).toBeEnabled();
});
it.each(['session', 'forbidden'] as const)(
  'hides all overview data and aborts work on %s denial',
  async (kind) => {
    vi.mocked(getOverviewCount).mockImplementation(async (metric) => {
      if (metric === 'leaves') throw new OverviewError(kind, 'Access changed');
      return 8;
    });
    render(element());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Access changed',
    );
    expect(
      screen.queryByRole('article', { name: 'Active students' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: inventoryBlock.name }),
    ).not.toBeInTheDocument();
    expect(vi.mocked(getPresenceSummary).mock.calls[0][1].aborted).toBe(true);
    expect(vi.mocked(getOverviewBlocks).mock.calls[0][1].aborted).toBe(true);
  },
);
it('can verify access and reload, with recovery feedback when verification/sign-out fails', async () => {
  vi.mocked(getPresenceSummary).mockRejectedValueOnce(
    new AttendanceError('forbidden', 'denied'),
  );
  render(element());
  await screen.findByRole('button', { name: 'Verify account access' });
  verify.mockRejectedValueOnce(new Error('offline'));
  fireEvent.click(
    screen.getByRole('button', { name: 'Verify account access' }),
  );
  expect(
    await screen.findByText(/Account access could not be verified/),
  ).toBeVisible();
  signOut.mockRejectedValueOnce(new Error('offline'));
  fireEvent.click(screen.getByRole('button', { name: 'Sign in again' }));
  expect(
    await screen.findByText(/Sign-out could not be completed/),
  ).toBeVisible();
  fireEvent.click(
    screen.getByRole('button', { name: 'Verify account access' }),
  );
  expect(
    await screen.findByRole('link', { name: inventoryBlock.name }),
  ).toBeVisible();
});
it.each(['warden', 'student'] as const)(
  'does not fetch Admin data for a %s',
  (role) => {
    auth('uid', role);
    render(element());
    expect(screen.getByRole('alert')).toHaveTextContent('Admin access');
    expect(getOverviewCount).not.toHaveBeenCalled();
    expect(getPresenceSummary).not.toHaveBeenCalled();
  },
);
it('does not fetch for a signed-out account', () => {
  auth();
  const current = vi.mocked(useAuth).getMockImplementation()!();
  vi.mocked(useAuth).mockReturnValue({ ...current, account: null });
  render(element());
  expect(screen.getByRole('alert')).toHaveTextContent('Admin access');
  expect(getOverviewCount).not.toHaveBeenCalled();
});
it('clears results on UID/role changes and ignores late responses from a previous account', async () => {
  let resolve!: (value: number) => void;
  vi.mocked(getOverviewCount).mockImplementation((kind, uid) =>
    uid === 'uid' && kind === 'leaves'
      ? new Promise((r) => {
          resolve = r;
        })
      : Promise.resolve(9),
  );
  const view = await open();
  const oldSignal = vi.mocked(getPresenceSummary).mock.calls[0][1];
  auth('other');
  view.rerender(element());
  await waitFor(() =>
    expect(card('Pending leave requests').getByText('9')).toBeVisible(),
  );
  expect(oldSignal.aborted).toBe(true);
  await act(async () => resolve(777));
  expect(screen.queryByText('777')).not.toBeInTheDocument();
  auth('other', 'warden');
  view.rerender(element());
  expect(screen.queryByText('9')).not.toBeInTheDocument();
});
it('aborts and ignores late completion after navigation', async () => {
  let reject!: (reason: unknown) => void;
  vi.mocked(getOverviewCount).mockImplementation((kind) =>
    kind === 'leaves'
      ? new Promise((_resolve, r) => {
          reject = r;
        })
      : Promise.resolve(0),
  );
  const view = await open();
  const signal = vi.mocked(getOverviewBlocks).mock.calls[0][1];
  view.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => reject(new OverviewError('forbidden', 'Late denial')));
  expect(screen.queryByText('Late denial')).not.toBeInTheDocument();
});
