import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  createMemoryRouter,
  MemoryRouter,
  RouterProvider,
} from 'react-router-dom';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import OwnLeaveList from './OwnLeaveList';
import OwnLeaveDetail from './OwnLeaveDetail';
import OwnLeaveForm from './OwnLeaveForm';
import {
  listOwnLeaves,
  getOwnLeave,
  submitOwnLeave,
  OwnLeaveError,
} from '../api/own-leave.api';
import type { OwnLeave } from '../api/own-leave.api';
import {
  ownLeaveFixture as row,
  ownLeavePage,
  studentLeaveFixture,
} from '../../../test/fixtures/ownLeave';
vi.mock('../api/own-leave.api', async (original) => ({
  ...(await original<typeof import('../api/own-leave.api')>()),
  listOwnLeaves: vi.fn(),
  getOwnLeave: vi.fn(),
  submitOwnLeave: vi.fn(),
}));
const denied = vi.fn();
const showDialog = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  'showModal',
);
const closeDialog = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  'close',
);
beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.removeAttribute('open');
    },
  });
});
afterAll(() => {
  if (showDialog)
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', showDialog);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  if (closeDialog)
    Object.defineProperty(HTMLDialogElement.prototype, 'close', closeDialog);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
});
const props = {
  uid: 'student',
  studentID: studentLeaveFixture.student_id,
  onAccessError: denied,
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listOwnLeaves).mockResolvedValue(ownLeavePage());
  vi.mocked(getOwnLeave).mockResolvedValue(row);
  vi.mocked(submitOwnLeave).mockResolvedValue(row);
});
function open(mode: 'list' | 'new' | 'detail' = 'list') {
  const initial =
    mode === 'new'
      ? '/student/leaves/new'
      : mode === 'detail'
        ? `/student/leaves/${row.leave_id}`
        : '/student/leaves';
  const router = createMemoryRouter(
    [
      {
        path: '/student/leaves',
        element:
          mode === 'new' ? <p>Leave listing</p> : <OwnLeaveList {...props} />,
      },
      { path: '/student/leaves/new', element: <OwnLeaveForm {...props} /> },
      {
        path: '/student/leaves/:leaveID',
        element: <OwnLeaveDetail {...props} />,
      },
      { path: '/login', element: <p>Student sign in</p> },
    ],
    { initialEntries: [initial] },
  );
  return { ...render(<RouterProvider router={router} />), router };
}
async function fill() {
  fireEvent.change(screen.getByLabelText('Start date and time'), {
    target: { value: '2099-03-01T10:00' },
  });
  fireEvent.change(screen.getByLabelText('End date and time'), {
    target: { value: '2099-03-03T10:00' },
  });
  await userEvent.type(
    screen.getByLabelText('Reason for leave'),
    ' Family visit ',
  );
}
it('shows owned list statuses, dates, details and a create link without staff controls', async () => {
  const view = open();
  expect(screen.getByText('Loading your leave requests…')).toBeVisible();
  await screen.findByText('Family visit');
  expect(listOwnLeaves).toHaveBeenCalledWith(
    'student',
    props.studentID,
    expect.any(AbortSignal),
    '',
    0,
  );
  expect(
    screen.getByRole('link', { name: 'New leave request' }),
  ).toHaveAttribute('href', '/student/leaves/new');
  await userEvent.click(screen.getByRole('link', { name: /View request/ }));
  await screen.findByText('Waiting for a hostel staff decision.');
  expect(view.router.state.location.pathname).toBe(
    `/student/leaves/${row.leave_id}`,
  );
  expect(
    screen.queryByRole('button', { name: /approve|reject|cancel|delete/i }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByText(studentLeaveFixture.submitted_by),
  ).not.toBeInTheDocument();
});
it('filters status, paginates and refreshes to page 1', async () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({
    ...row,
    leave_id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  }));
  vi.mocked(listOwnLeaves).mockResolvedValue(ownLeavePage(rows, 0, 21));
  open();
  await screen.findByText('Page 1');
  await userEvent.selectOptions(screen.getByLabelText('Status'), 'pending');
  await waitFor(() => expect(listOwnLeaves).toHaveBeenCalledTimes(2));
  vi.mocked(listOwnLeaves).mockResolvedValue(ownLeavePage([row], 20, 21));
  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByText('Page 2');
  expect(listOwnLeaves).toHaveBeenLastCalledWith(
    'student',
    props.studentID,
    expect.any(AbortSignal),
    'pending',
    20,
  );
  expect(
    screen.getByRole('region', { name: 'Your leave request results' }),
  ).toHaveFocus();
  vi.mocked(listOwnLeaves).mockResolvedValue(ownLeavePage(rows, 0, 21));
  await userEvent.click(screen.getByRole('button', { name: 'Previous' }));
  await screen.findByText('Page 1');
  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  await waitFor(() =>
    expect(listOwnLeaves).toHaveBeenLastCalledWith(
      'student',
      props.studentID,
      expect.any(AbortSignal),
      'pending',
      20,
    ),
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Refresh requests' }),
  );
  await waitFor(() =>
    expect(listOwnLeaves).toHaveBeenLastCalledWith(
      'student',
      props.studentID,
      expect.any(AbortSignal),
      'pending',
      0,
    ),
  );
});
it('handles empty lists, safe errors and retry without stale results', async () => {
  vi.mocked(listOwnLeaves).mockResolvedValueOnce(ownLeavePage([], 0, 0));
  open();
  await screen.findByText('No leave requests found for this status.');
  vi.mocked(listOwnLeaves).mockRejectedValueOnce(new Error('private details'));
  await userEvent.click(
    screen.getByRole('button', { name: 'Refresh requests' }),
  );
  expect(await screen.findByRole('alert')).not.toHaveTextContent(
    'private details',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Retry requests' }));
  await screen.findByText('Family visit');
});
it.each(['session', 'forbidden', 'setup'] as const)(
  'clears list access and delegates %s to the portal',
  async (kind) => {
    vi.mocked(listOwnLeaves).mockRejectedValueOnce(
      new OwnLeaveError(kind, 'Verify access'),
    );
    open();
    await screen.findByRole('alert');
    expect(denied).toHaveBeenCalledWith(expect.objectContaining({ kind }));
    expect(
      screen.getByRole('button', { name: 'Refresh requests' }),
    ).toBeDisabled();
  },
);
it.each(['approved', 'rejected'] as const)(
  'shows the %s decision note and refreshes details',
  async (status) => {
    vi.mocked(getOwnLeave).mockResolvedValue({
      ...row,
      status,
      decided_at: '2027-02-21T10:00:00Z',
      decision_note: 'Staff reviewed this request',
    });
    open('detail');
    await screen.findByText('Staff reviewed this request');
    expect(
      screen.getByText(
        status === 'rejected' ? 'Rejection reason' : 'Decision note',
      ),
    ).toBeVisible();
    await userEvent.click(
      screen.getByRole('button', { name: 'Refresh request' }),
    );
    await waitFor(() => expect(getOwnLeave).toHaveBeenCalledTimes(2));
  },
);
it('shows missing detail errors and lets the owner retry without staff decisions', async () => {
  vi.mocked(getOwnLeave).mockRejectedValueOnce(
    new OwnLeaveError('not-found', 'Request not found'),
  );
  open('detail');
  expect(await screen.findByRole('alert')).toHaveTextContent('not found');
  await userEvent.click(
    screen.getByRole('button', { name: 'Refresh request' }),
  );
  await screen.findByText('Waiting for a hostel staff decision.');
});
it('validates the form before posting and preserves entered values', async () => {
  open('new');
  await userEvent.click(
    screen.getByRole('button', { name: 'Submit leave request' }),
  );
  expect(screen.getByRole('alert')).toHaveTextContent('valid start');
  await fill();
  fireEvent.change(screen.getByLabelText('End date and time'), {
    target: { value: '2099-03-01T09:00' },
  });
  await userEvent.click(
    screen.getByRole('button', { name: 'Submit leave request' }),
  );
  expect(screen.getByRole('alert')).toHaveTextContent('after');
  expect(screen.getByRole('alert')).toHaveFocus();
  expect(screen.getByLabelText('Reason for leave')).toHaveValue(
    ' Family visit ',
  );
  expect(submitOwnLeave).not.toHaveBeenCalled();
});
it('submits once, prevents double click and opens the saved request after success', async () => {
  let finish!: (value: OwnLeave) => void;
  vi.mocked(submitOwnLeave).mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const view = open('new');
  await fill();
  await userEvent.dblClick(
    screen.getByRole('button', { name: 'Submit leave request' }),
  );
  expect(submitOwnLeave).toHaveBeenCalledTimes(1);
  expect(
    screen.getByRole('button', { name: 'Submitting request…' }),
  ).toBeDisabled();
  expect(screen.getByLabelText('Reason for leave')).toBeDisabled();
  await act(async () => finish(row));
  expect(view.router.state.location.pathname).toBe(
    `/student/leaves/${row.leave_id}`,
  );
  expect(
    await screen.findByText(/Your leave request was submitted/),
  ).toBeVisible();
  expect(submitOwnLeave).toHaveBeenCalledWith(
    expect.objectContaining({
      reason: 'Family visit',
      request_id: expect.any(String),
    }),
    'student',
    props.studentID,
    expect.any(AbortSignal),
  );
});
it('locks an uncertain submission and retries the exact payload and request ID', async () => {
  vi.mocked(submitOwnLeave).mockRejectedValueOnce(new Error('network failed'));
  open('new');
  await fill();
  await userEvent.click(
    screen.getByRole('button', { name: 'Submit leave request' }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'may already be saved',
  );
  const first = vi.mocked(submitOwnLeave).mock.calls[0][0];
  expect(screen.getByLabelText('Start date and time')).toBeDisabled();
  await userEvent.click(
    screen.getByRole('button', { name: 'Retry same request' }),
  );
  await screen.findByText(/Your leave request was submitted/);
  expect(vi.mocked(submitOwnLeave).mock.calls[1][0]).toEqual(first);
});
it.each(['invalid', 'conflict', 'ineligible'] as const)(
  'preserves an editable draft after a definite %s rejection',
  async (kind) => {
    vi.mocked(submitOwnLeave).mockRejectedValueOnce(
      new OwnLeaveError(kind, 'Please review your request'),
    );
    open('new');
    await fill();
    await userEvent.click(
      screen.getByRole('button', { name: 'Submit leave request' }),
    );
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Reason for leave')).toHaveValue(
      ' Family visit ',
    );
    expect(screen.getByLabelText('Reason for leave')).toBeEnabled();
  },
);
it('protects drafts during navigation, lets students keep editing or leave, and clears unload listeners', async () => {
  open('new');
  await fill();
  const unload = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(unload);
  expect(unload.defaultPrevented).toBe(true);
  await userEvent.click(
    screen.getByRole('link', { name: 'Back to my leave requests' }),
  );
  const dialog = await screen.findByRole('dialog', {
    name: 'Discard this leave draft?',
  });
  await userEvent.click(
    within(dialog).getByRole('button', { name: 'Stay on form' }),
  );
  expect(screen.getByLabelText('Reason for leave')).toHaveValue(
    ' Family visit ',
  );
  await userEvent.click(
    screen.getByRole('link', { name: 'Back to my leave requests' }),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Leave form' }));
  await screen.findByText('Leave listing');
  const clean = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(clean);
  expect(clean.defaultPrevented).toBe(false);
});
it('warns before abandoning an unconfirmed submission and does not block logout', async () => {
  vi.mocked(submitOwnLeave).mockRejectedValueOnce(new Error('timeout'));
  const view = open('new');
  await fill();
  await userEvent.click(
    screen.getByRole('button', { name: 'Submit leave request' }),
  );
  await screen.findByRole('alert');
  await userEvent.click(screen.getByRole('link', { name: 'View my requests' }));
  expect(
    await screen.findByRole('dialog', {
      name: 'Leave an unconfirmed submission?',
    }),
  ).toHaveTextContent('may already be saved');
  await userEvent.click(screen.getByRole('button', { name: 'Stay on form' }));
  await act(async () => {
    await view.router.navigate('/login');
  });
  expect(screen.getByText('Student sign in')).toBeVisible();
});
it('aborts pending submissions on unmount and ignores late denials', async () => {
  let fail!: (error: Error) => void;
  vi.mocked(submitOwnLeave).mockReturnValueOnce(
    new Promise((_resolve, reject) => {
      fail = reject;
    }),
  );
  const view = open('new');
  await fill();
  await userEvent.click(
    screen.getByRole('button', { name: 'Submit leave request' }),
  );
  const signal = vi.mocked(submitOwnLeave).mock.calls[0][3];
  view.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => fail(new OwnLeaveError('forbidden', 'Late denial')));
  expect(denied).not.toHaveBeenCalled();
});
it('aborts old list requests on identity changes and suppresses old records', async () => {
  let finish!: (value: ReturnType<typeof ownLeavePage>) => void;
  vi.mocked(listOwnLeaves)
    .mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    )
    .mockResolvedValueOnce(ownLeavePage([], 0, 0));
  const view = render(<OwnLeaveList {...props} />, { wrapper: MemoryRouter });
  const first = vi.mocked(listOwnLeaves).mock.calls[0][2];
  view.rerender(<OwnLeaveList {...props} uid="second" />);
  expect(first.aborted).toBe(true);
  await screen.findByText('No leave requests found for this status.');
  await act(async () => finish(ownLeavePage()));
  expect(screen.queryByText('Family visit')).not.toBeInTheDocument();
});
