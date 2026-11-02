import { act } from 'react';
import { beforeAll, afterAll, beforeEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import useAuth from '../../auth/hooks/useAuth';
import { AuthorizedRequestError } from '../../auth/api/authorized-request';
import {
  decideLeave,
  getLeave,
  LeaveError,
  listLeaves,
} from '../api/leave.api';
import LeaveListPage from './LeaveListPage';
import LeaveDetailPage from './LeaveDetailPage';
import {
  leaveFixture as row,
  decidedLeave,
  leavePage,
} from '../../../test/fixtures/leave';
vi.mock('../../auth/hooks/useAuth', () => ({ default: vi.fn() }));
vi.mock('../api/leave.api', async (original) => ({
  ...(await original<typeof import('../api/leave.api')>()),
  decideLeave: vi.fn(),
  getLeave: vi.fn(),
  listLeaves: vi.fn(),
}));
const list = vi.mocked(listLeaves);
const get = vi.mocked(getLeave);
const decide = vi.mocked(decideLeave);
const signOut = vi.fn();
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
  vi.mocked(useAuth).mockReturnValue({
    account: { firebase_uid: 'staff-uid', role: 'admin' },
    signOut,
  } as unknown as ReturnType<typeof useAuth>);
  signOut.mockResolvedValue(undefined);
  list.mockResolvedValue(leavePage());
  get.mockResolvedValue(row);
  decide.mockResolvedValue(decidedLeave());
});
function mount(path = '/dashboard/leaves') {
  const router = createMemoryRouter(
    [
      { path: '/dashboard/leaves', element: <LeaveListPage /> },
      { path: '/dashboard/leaves/:leaveID', element: <LeaveDetailPage /> },
      { path: '/elsewhere', element: <p>Other page</p> },
    ],
    { initialEntries: [path] },
  );
  const view = render(<RouterProvider router={router} />);
  return { ...view, router, user: userEvent.setup() };
}
const detail = `/dashboard/leaves/${row.leave_id}`;
it('filters the directory, resets pagination and preserves filters on detail/back links', async () => {
  const { user, router } = mount('/dashboard/leaves?offset=20');
  await screen.findByRole('table');
  await user.selectOptions(screen.getByLabelText('Status'), 'pending');
  await user.type(screen.getByLabelText('Student ID (UUID)'), row.student_id);
  await user.click(screen.getByRole('button', { name: 'Apply filters' }));
  await waitFor(() =>
    expect(router.state.location.search).toBe(
      `?status=pending&student_id=${row.student_id}`,
    ),
  );
  await user.click(
    await screen.findByRole('link', {
      name: `View leave request ${row.leave_id}`,
    }),
  );
  expect(await screen.findByText('Family visit')).toBeVisible();
  expect(
    screen.getByRole('link', { name: 'Back to leave requests' }),
  ).toHaveAttribute(
    'href',
    `/dashboard/leaves?offset=0&status=pending&student_id=${row.student_id}`,
  );
});
it('paginates and refreshes server totals', async () => {
  list.mockImplementation(async (params) =>
    leavePage([row], Number(params.get('offset') ?? 0), 21),
  );
  const { user } = mount();
  await user.click(await screen.findByRole('button', { name: 'Next' }));
  expect(await screen.findByText('Page 2 · 21 requests')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Previous' }));
  await screen.findByText('Page 1 · 21 requests');
  await user.click(screen.getByRole('button', { name: 'Clear filters' }));
  await user.click(screen.getByRole('button', { name: 'Refresh requests' }));
  expect(list.mock.calls.length).toBeGreaterThan(2);
});
it.each([
  ['', 'No leave requests yet.'],
  ['?status=pending', 'No leave requests match these filters.'],
  ['?offset=20', 'No requests on this page. Go to the previous page.'],
])('shows empty state for %s', async (query, text) => {
  list.mockResolvedValue(leavePage([], query.includes('offset=20') ? 20 : 0));
  mount(`/dashboard/leaves${query}`);
  expect(await screen.findByText(text)).toBeVisible();
});
it('handles loading, service failure and retry', async () => {
  list
    .mockRejectedValueOnce(new Error('Internal failure'))
    .mockResolvedValue(leavePage());
  const { user } = mount();
  expect(screen.getByRole('status')).toHaveTextContent('Loading');
  expect(await screen.findByRole('alert')).toHaveTextContent('unavailable');
  await user.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByRole('table')).toBeVisible();
});
it.each([
  new LeaveError('forbidden', 'Denied'),
  new AuthorizedRequestError('session', 'Expired'),
])('hides list controls on access loss %#', async (error) => {
  list.mockRejectedValue(error);
  const { user } = mount();
  await user.click(await screen.findByRole('button', { name: 'Sign out' }));
  expect(signOut).toHaveBeenCalled();
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Apply filters' }),
  ).not.toBeInTheDocument();
});
it.each(['approved', 'rejected'] as const)(
  'shows finalized %s decisions without controls',
  async (status) => {
    get.mockResolvedValue(decidedLeave(status));
    mount(detail);
    expect(await screen.findByText('Reviewed')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Approve request' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Reject request' }),
    ).not.toBeInTheDocument();
    expect(
      document.querySelector(`time[datetime="${row.starts_at}"]`),
    ).toBeVisible();
  },
);
it('ignores late detail responses after navigating to another request', async () => {
  let finish!: (value: typeof row) => void;
  get
    .mockImplementationOnce(
      () =>
        new Promise((done) => {
          finish = done;
        }),
    )
    .mockResolvedValue({
      ...row,
      leave_id: row.request_id,
      reason: 'New request',
    });
  const { router } = mount(detail);
  await act(async () => {
    await router.navigate(`/dashboard/leaves/${row.request_id}`);
  });
  await screen.findByText('New request');
  await act(async () => finish(row));
  expect(screen.queryByText('Family visit')).not.toBeInTheDocument();
});
it.each(['pending', 'approved', 'rejected', 'cancelled'] as const)(
  'keeps %s historical leave read-only',
  async (status) => {
    get.mockResolvedValue(
      status === 'cancelled'
        ? {
            ...row,
            status,
            cancelled_at: row.created_at,
            cancelled_by: row.submitted_by,
          }
        : status === 'pending'
          ? row
          : decidedLeave(status),
    );
    mount(detail);
    await screen.findByRole('heading', { name: 'Recorded decision' });
    expect(
      screen.queryByRole('button', { name: 'Approve request' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Reject request' }),
    ).not.toBeInTheDocument();
    expect(decide).not.toHaveBeenCalled();
  },
);
