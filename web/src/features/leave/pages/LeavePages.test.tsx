import { act } from 'react';
import { beforeAll, afterAll, beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
async function openDecision(
  user: ReturnType<typeof userEvent.setup>,
  reject = false,
) {
  await user.click(
    await screen.findByRole('button', {
      name: reject ? 'Reject request' : 'Approve request',
    }),
  );
}
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
it('requires a rejection note and confirmation before submitting', async () => {
  decide.mockResolvedValue(decidedLeave('rejected', 'Not eligible'));
  get
    .mockResolvedValueOnce(row)
    .mockResolvedValue(decidedLeave('rejected', 'Not eligible'));
  const { user } = mount(detail);
  await openDecision(user, true);
  expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  await user.click(screen.getByRole('button', { name: 'Review decision' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Enter a reason');
  expect(decide).not.toHaveBeenCalled();
  await user.type(
    screen.getByLabelText('Decision note (required)'),
    'Not eligible',
  );
  await user.click(screen.getByRole('button', { name: 'Review decision' }));
  expect(decide).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Confirm rejection' }));
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
  expect(decide).toHaveBeenCalledWith(
    row,
    'rejected',
    'Not eligible',
    'staff-uid',
    expect.any(AbortSignal),
  );
  expect(
    await screen.findByText('Decision saved. Refreshing the request.'),
  ).toBeVisible();
  expect(get).toHaveBeenCalledTimes(2);
});
it('permits an empty approval note and editing before confirmation', async () => {
  const { user } = mount(detail);
  await openDecision(user);
  await user.click(screen.getByRole('button', { name: 'Review decision' }));
  await user.click(screen.getByRole('button', { name: 'Edit note' }));
  expect(screen.getByLabelText('Decision note (optional)')).toBeEnabled();
  await user.click(screen.getByRole('button', { name: 'Review decision' }));
  await user.click(screen.getByRole('button', { name: 'Confirm approval' }));
  await waitFor(() => expect(decide).toHaveBeenCalledTimes(1));
  expect(decide.mock.calls[0][2]).toBe('');
});
it('validates note length before confirmation', async () => {
  const { user } = mount(detail);
  await openDecision(user);
  fireEvent.change(screen.getByLabelText('Decision note (optional)'), {
    target: { value: 'a'.repeat(1001) },
  });
  await user.click(screen.getByRole('button', { name: 'Review decision' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('1000 characters');
  expect(decide).not.toHaveBeenCalled();
});
it.each([
  new LeaveError('conflict', 'Another decision exists.'),
  new LeaveError('ineligible', 'Student is ineligible.'),
  new Error('Lost response'),
])(
  'requires checking the request after an uncertain or conflicting decision %#',
  async (error) => {
    decide.mockRejectedValueOnce(error).mockResolvedValue(decidedLeave());
    const { user } = mount(detail);
    await openDecision(user);
    await user.type(
      screen.getByLabelText('Decision note (optional)'),
      'Reviewed',
    );
    await user.click(screen.getByRole('button', { name: 'Review decision' }));
    await user.click(screen.getByRole('button', { name: 'Confirm approval' }));
    await screen.findByRole('button', { name: 'Check current status' });
    expect(
      screen.getByRole('button', { name: 'Review decision' }),
    ).toBeDisabled();
    expect(screen.getByLabelText('Decision note (optional)')).toHaveValue(
      'Reviewed',
    );
    expect(decide).toHaveBeenCalledTimes(1);
    await user.click(
      screen.getByRole('button', { name: 'Check current status' }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Review decision' }),
      ).toBeEnabled(),
    );
    await user.click(screen.getByRole('button', { name: 'Review decision' }));
    await user.click(screen.getByRole('button', { name: 'Confirm approval' }));
    await waitFor(() => expect(decide).toHaveBeenCalledTimes(2));
  },
);
it('shows a competing finalized decision after checking without another write', async () => {
  get
    .mockResolvedValueOnce(row)
    .mockResolvedValue(decidedLeave('rejected', 'Other reviewer'));
  decide.mockRejectedValue(new LeaveError('conflict', 'Changed'));
  const { user } = mount(detail);
  await openDecision(user);
  await user.click(screen.getByRole('button', { name: 'Review decision' }));
  await user.click(screen.getByRole('button', { name: 'Confirm approval' }));
  await user.click(
    await screen.findByRole('button', { name: 'Check current status' }),
  );
  expect(await screen.findByText('Other reviewer')).toBeVisible();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(decide).toHaveBeenCalledTimes(1);
});
it.each(['session', 'forbidden', 'not-found'] as const)(
  'removes draft and details on write %s',
  async (kind) => {
    decide.mockRejectedValue(new LeaveError(kind, 'Access or resource lost'));
    const { user } = mount(detail);
    await openDecision(user);
    await user.click(screen.getByRole('button', { name: 'Review decision' }));
    await user.click(screen.getByRole('button', { name: 'Confirm approval' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Access or resource lost',
    );
    expect(screen.queryByText('Family visit')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  },
);
it('retains editable input after server validation fails', async () => {
  decide.mockRejectedValue(new LeaveError('invalid', 'Check your note'));
  const { user } = mount(detail);
  await openDecision(user, true);
  await user.type(screen.getByLabelText('Decision note (required)'), 'Reason');
  await user.click(screen.getByRole('button', { name: 'Review decision' }));
  await user.click(screen.getByRole('button', { name: 'Confirm rejection' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Check your note');
  expect(screen.getByLabelText('Decision note (required)')).toHaveValue(
    'Reason',
  );
});
it('blocks duplicate writes, cancellation and navigation while saving', async () => {
  let finish!: (value: typeof row) => void;
  decide.mockImplementation(
    () =>
      new Promise((done) => {
        finish = done;
      }),
  );
  const { user, router } = mount(detail);
  await openDecision(user);
  await user.click(screen.getByRole('button', { name: 'Review decision' }));
  await user.dblClick(screen.getByRole('button', { name: 'Confirm approval' }));
  expect(decide).toHaveBeenCalledTimes(1);
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
    await screen.findByText('Wait for the current operation before leaving.'),
  ).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Stay here' }));
  await act(async () => finish(decidedLeave()));
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
});
it('warns on leaving a dirty draft and permits explicit discard', async () => {
  const { user, router } = mount(detail);
  await openDecision(user);
  await user.type(screen.getByLabelText('Decision note (optional)'), 'Draft');
  await act(async () => {
    await router.navigate('/elsewhere');
  });
  await user.click(
    await screen.findByRole('button', { name: 'Discard and leave' }),
  );
  expect(await screen.findByText('Other page')).toBeVisible();
  expect(decide).not.toHaveBeenCalled();
});
it('restores focus after Escape closes an idle decision dialog', async () => {
  const { user } = mount(detail);
  await openDecision(user);
  fireEvent(
    screen.getByRole('dialog'),
    new Event('cancel', { bubbles: true, cancelable: true }),
  );
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Approve request' })).toHaveFocus();
});
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
it('keeps an uncertain decision locked when the status recheck fails', async () => {
  get
    .mockResolvedValueOnce(row)
    .mockRejectedValueOnce(new Error('Service down'))
    .mockResolvedValue(row);
  decide.mockRejectedValue(new Error('Lost response'));
  const { user } = mount(detail);
  await openDecision(user);
  await user.type(
    screen.getByLabelText('Decision note (optional)'),
    'Keep this draft',
  );
  await user.click(screen.getByRole('button', { name: 'Review decision' }));
  await user.click(screen.getByRole('button', { name: 'Confirm approval' }));
  await user.click(
    await screen.findByRole('button', { name: 'Check current status' }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent('unavailable');
  expect(
    screen.getByRole('button', { name: 'Review decision' }),
  ).toBeDisabled();
  expect(screen.getByLabelText('Decision note (optional)')).toHaveValue(
    'Keep this draft',
  );
  expect(decide).toHaveBeenCalledTimes(1);
  await user.click(
    screen.getByRole('button', { name: 'Check current status' }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Review decision' }),
    ).toBeEnabled(),
  );
});
it('retains confirmation of a successful decision when the subsequent detail read fails', async () => {
  get.mockResolvedValueOnce(row).mockRejectedValue(new Error('Read failed'));
  const { user } = mount(detail);
  await openDecision(user);
  await user.click(screen.getByRole('button', { name: 'Review decision' }));
  await user.click(screen.getByRole('button', { name: 'Confirm approval' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('unavailable');
  expect(
    screen.getByText('Decision saved. Refreshing the request.'),
  ).toBeVisible();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(decide).toHaveBeenCalledTimes(1);
});
