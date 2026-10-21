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
import WardenDashboardPage from './WardenDashboardPage';
import useAuth from '../../auth/hooks/useAuth';
import { getPresenceSummary } from '../../attendance/api/staff-attendance.api';
import { AttendanceError } from '../../attendance/api/student-attendance.api';
import { getOverviewBlocks, getOverviewCount } from '../api/admin-overview.api';
import { getRecentIncidents } from '../api/warden-overview.api';
import type { RecentIncidentsPage } from '../api/warden-overview.api';
import { inventoryBlock } from '../../../test/fixtures/inventory';
import {
  staffSummary,
  incidentFixture,
} from '../../../test/fixtures/staffAttendance';
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
vi.mock('../api/warden-overview.api', () => ({ getRecentIncidents: vi.fn() }));
const verify = vi.fn();
const signOut = vi.fn();
function auth(
  uid = 'warden-uid',
  role: 'admin' | 'warden' | 'student' = 'warden',
) {
  vi.mocked(useAuth).mockReturnValue({
    account: {
      user_id: 'staff-id',
      firebase_uid: uid,
      email: 'warden@example.edu',
      role,
      is_active: true,
    },
    status: 'authenticated',
    busy: false,
    message: '',
    verifiedPath: '/dashboard/warden',
    signIn: vi.fn(),
    retry: verify,
    signOut,
  });
}
const incident = {
  ...incidentFixture,
  incident_id: '77777777-7777-4777-8777-777777777777',
  incident_type: 'late_entry' as const,
  direction: 'IN' as const,
};
beforeEach(() => {
  vi.resetAllMocks();
  auth();
  verify.mockResolvedValue(undefined);
  signOut.mockResolvedValue(undefined);
  vi.mocked(getPresenceSummary).mockResolvedValue(staffSummary);
  vi.mocked(getOverviewBlocks).mockResolvedValue({
    items: [inventoryBlock],
    total: 1,
    offset: 0,
  });
  vi.mocked(getOverviewCount).mockImplementation(
    async (kind) =>
      ({
        leaves: 31,
        access: 22,
        pendingComplaints: 13,
        progressComplaints: 4,
      })[kind],
  );
  vi.mocked(getRecentIncidents).mockResolvedValue({
    items: [incidentFixture, incident],
    total: 2,
  });
});
const element = () => (
  <MemoryRouter>
    <WardenDashboardPage />
  </MemoryRouter>
);
async function open() {
  const view = render(element());
  await screen.findByRole('link', { name: 'Late entry without permission' });
  return view;
}
const recent = () =>
  within(screen.getByRole('region', { name: 'Recent attendance incidents' }));
it('shows a Warden operations overview with pending work before the general summaries', async () => {
  await open();
  expect(screen.getByText('Staff / Operations')).toBeVisible();
  expect(
    screen.getByRole('heading', { name: 'Warden dashboard' }),
  ).toHaveFocus();
  const cards = within(
    screen.getByRole('region', { name: 'Overview metrics' }),
  ).getAllByRole('article');
  expect(cards.map((card) => card.getAttribute('aria-label'))).toEqual([
    'Pending leave requests',
    'Pending access requests',
    'Pending complaints',
    'Complaints in progress',
    'Active students',
    'Hostel blocks',
  ]);
  expect(within(cards[0]).getByText('31')).toBeVisible();
  expect(within(cards[1]).getByText('22')).toBeVisible();
  expect(screen.getByLabelText('Recorded presence counts')).toHaveTextContent(
    'IN6OUT3UNKNOWN1',
  );
  expect(getOverviewCount).toHaveBeenCalledWith(
    'leaves',
    'warden-uid',
    expect.any(AbortSignal),
  );
  expect(
    screen.queryByRole('button', { name: 'Enable live updates' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('textbox', { name: 'Search name or Student ID' }),
  ).not.toBeInTheDocument();
});
it('offers Warden-authorized shortcuts and no Admin-only import action', async () => {
  await open();
  expect(
    screen.queryByRole('link', { name: 'Import student profiles' }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('navigation', { name: 'Warden operations shortcuts' }),
  ).toBeVisible();
  for (const [name, href] of [
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
    ['View student directory', '/dashboard/students'],
    ['Open attendance dashboard', '/dashboard/attendance'],
    ['Open reports and exports', '/dashboard/reports'],
    ['Browse inventory', '/dashboard/inventory'],
    ['Manage announcements', '/dashboard/announcements'],
  ])
    expect(screen.getByRole('link', { name })).toHaveAttribute('href', href);
});
it('shows recorded incident types, original timestamps and safe detail/profile links', async () => {
  await open();
  expect(
    recent().getByRole('link', { name: 'Early exit without permission' }),
  ).toHaveAttribute(
    'href',
    `/dashboard/attendance/incidents/${incidentFixture.incident_id}`,
  );
  expect(
    recent().getAllByRole('link', { name: 'View student profile' })[0],
  ).toHaveAttribute(
    'href',
    `/dashboard/students/${incidentFixture.student_id}`,
  );
  expect(
    recent().getByRole('link', { name: 'View all attendance incidents' }),
  ).toHaveAttribute('href', '/dashboard/attendance/incidents');
  const time = recent().getAllByRole('listitem')[0].querySelector('time');
  expect(time).toHaveAttribute('dateTime', incidentFixture.occurred_at);
  expect(recent().getByText(/historical scanner records/)).toBeVisible();
  expect(recent().getByText(/Times use your device timezone/)).toBeVisible();
});
it('labels the limited preview separately from the full historical total', async () => {
  vi.mocked(getRecentIncidents).mockResolvedValue({
    items: Array.from({ length: 5 }, (_, i) => ({
      ...incidentFixture,
      incident_id: `11111111-1111-4111-8111-${String(i + 1).padStart(12, '0')}`,
    })),
    total: 42,
  });
  render(element());
  expect(
    await screen.findByText('42 recorded incidents. Showing the latest 5.'),
  ).toBeVisible();
  expect(recent().getAllByRole('listitem')).toHaveLength(5);
});
it('shows an empty recent-incidents state while retaining other summaries', async () => {
  vi.mocked(getRecentIncidents).mockResolvedValue({ items: [], total: 0 });
  render(element());
  expect(
    await screen.findByText('No attendance incidents have been recorded.'),
  ).toBeVisible();
  expect(
    screen.getByRole('article', { name: 'Pending leave requests' }),
  ).toHaveTextContent('31');
});
it('keeps pending work visible while recent incidents are still loading', async () => {
  vi.mocked(getRecentIncidents).mockImplementation(() => new Promise(() => {}));
  render(element());
  await waitFor(() =>
    expect(
      screen.getByRole('article', { name: 'Pending leave requests' }),
    ).toHaveTextContent('31'),
  );
  expect(recent().getByRole('status')).toHaveTextContent(
    'Loading recent incidents',
  );
  expect(recent().queryByText(/0 recorded incidents/)).not.toBeInTheDocument();
});
it('retries incidents independently without resetting the pending-work metrics', async () => {
  vi.mocked(getRecentIncidents).mockRejectedValueOnce(
    new Error('private provider detail'),
  );
  render(element());
  fireEvent.click(
    await screen.findByRole('button', { name: 'Retry recent incidents' }),
  );
  expect(
    await screen.findByRole('link', { name: 'Late entry without permission' }),
  ).toBeVisible();
  expect(getRecentIncidents).toHaveBeenCalledTimes(2);
  expect(getOverviewCount).toHaveBeenCalledTimes(4);
  expect(getPresenceSummary).toHaveBeenCalledTimes(1);
});
it('refreshes incidents, counts and accommodation together', async () => {
  await open();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh overview' }));
  await screen.findByRole('link', { name: 'Late entry without permission' });
  expect(getRecentIncidents).toHaveBeenCalledTimes(2);
  expect(getPresenceSummary).toHaveBeenCalledTimes(2);
  expect(getOverviewBlocks).toHaveBeenCalledTimes(2);
  expect(getOverviewCount).toHaveBeenCalledTimes(8);
});
it('shows per-block accommodation and preserves the paging focus behavior', async () => {
  vi.mocked(getOverviewBlocks).mockImplementation(
    async (_uid, _signal, offset = 0) => ({
      items: [
        { ...inventoryBlock, name: offset ? 'Next block' : 'First block' },
      ],
      offset,
      total: 21,
    }),
  );
  await open();
  fireEvent.click(screen.getByRole('button', { name: 'Next blocks' }));
  await screen.findByRole('link', { name: 'Next block' });
  await waitFor(() =>
    expect(
      screen.getByRole('region', { name: 'Accommodation results' }),
    ).toHaveFocus(),
  );
  expect(getOverviewBlocks).toHaveBeenLastCalledWith(
    'warden-uid',
    expect.any(AbortSignal),
    20,
  );
  expect(getRecentIncidents).toHaveBeenCalledTimes(1);
});
it.each(['session', 'forbidden'] as const)(
  'clears all private results on incident %s denial',
  async (kind) => {
    vi.mocked(getRecentIncidents).mockRejectedValueOnce(
      new AttendanceError(kind, 'private source text'),
    );
    render(element());
    expect(await screen.findByRole('alert')).not.toHaveTextContent(
      'private source text',
    );
    expect(
      screen.queryByRole('article', { name: 'Pending leave requests' }),
    ).not.toBeInTheDocument();
    expect(vi.mocked(getOverviewBlocks).mock.calls[0][1].aborted).toBe(true);
    fireEvent.click(
      screen.getByRole('button', { name: 'Verify account access' }),
    );
    expect(
      await screen.findByRole('link', {
        name: 'Late entry without permission',
      }),
    ).toBeVisible();
  },
);
it.each(['admin', 'student'] as const)(
  'does not fetch a Warden overview for %s',
  (role) => {
    auth('other', role);
    render(element());
    expect(screen.getByRole('alert')).toHaveTextContent('Warden access');
    expect(getRecentIncidents).not.toHaveBeenCalled();
    expect(getOverviewCount).not.toHaveBeenCalled();
  },
);
it('does not fetch for a signed-out account', () => {
  const current = vi.mocked(useAuth).getMockImplementation()!();
  vi.mocked(useAuth).mockReturnValue({ ...current, account: null });
  render(element());
  expect(getRecentIncidents).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toHaveTextContent('Warden access');
});
it('resets on UID change and ignores a previous user’s late incident result', async () => {
  let resolve!: (value: RecentIncidentsPage) => void;
  vi.mocked(getRecentIncidents).mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const view = render(element());
  await screen.findByRole('link', { name: inventoryBlock.name });
  const oldSignal = vi.mocked(getRecentIncidents).mock.calls[0][1];
  auth('new-warden');
  view.rerender(element());
  await screen.findByRole('link', { name: 'Late entry without permission' });
  expect(oldSignal.aborted).toBe(true);
  await act(async () => resolve({ items: [], total: 777 }));
  expect(screen.queryByText(/777 recorded incidents/)).not.toBeInTheDocument();
  expect(getRecentIncidents).toHaveBeenLastCalledWith(
    'new-warden',
    expect.any(AbortSignal),
  );
});
it('aborts work when role access changes without a UID change', async () => {
  const view = await open();
  const signal = vi.mocked(getRecentIncidents).mock.calls[0][1];
  auth('warden-uid', 'admin');
  view.rerender(element());
  expect(signal.aborted).toBe(true);
  expect(
    screen.queryByRole('region', { name: 'Recent attendance incidents' }),
  ).not.toBeInTheDocument();
});
it('aborts reads and ignores late rejection after navigation', async () => {
  let reject!: (reason: unknown) => void;
  vi.mocked(getRecentIncidents).mockImplementationOnce(
    () =>
      new Promise((_resolve, r) => {
        reject = r;
      }),
  );
  const view = render(element());
  await screen.findByRole('link', { name: inventoryBlock.name });
  const signal = vi.mocked(getRecentIncidents).mock.calls[0][1];
  view.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => reject(new AttendanceError('forbidden', 'Late error')));
  expect(screen.queryByText('Late error')).not.toBeInTheDocument();
});
