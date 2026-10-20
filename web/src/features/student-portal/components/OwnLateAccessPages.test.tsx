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
import OwnLateAccessList from './OwnLateAccessList';
import OwnLateAccessDetail from './OwnLateAccessDetail';
import OwnLateAccessForm from './OwnLateAccessForm';
import {
  listOwnLateAccess,
  getOwnLateAccess,
  submitOwnLateAccess,
  OwnLateAccessError,
} from '../api/own-late-access.api';
import type { OwnLateAccess } from '../api/own-late-access.api';
import {
  ownLateAccessFixture as row,
  ownLateAccessPage,
  studentAccessFixture,
} from '../../../test/fixtures/ownLateAccess';
vi.mock('../api/own-late-access.api', async (original) => ({
  ...(await original<typeof import('../api/own-late-access.api')>()),
  listOwnLateAccess: vi.fn(),
  getOwnLateAccess: vi.fn(),
  submitOwnLateAccess: vi.fn(),
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
  studentID: studentAccessFixture.student_id,
  onAccessError: denied,
};
it('shows recorded use separately from approval and omits scanner references', async () => {
  vi.mocked(getOwnLateAccess).mockResolvedValueOnce({
    ...row,
    status: 'approved',
    decided_at: '2027-02-21T10:00:00Z',
    consumed_at: '2027-03-01T16:10:00Z',
  });
  open('detail');
  await screen.findByText('Used at');
  expect(screen.getByText('approved')).toBeVisible();
  expect(screen.queryByText('completed')).not.toBeInTheDocument();
});
it('supports early-exit submission and shows no recorded use without claiming access', async () => {
  vi.mocked(submitOwnLateAccess).mockResolvedValueOnce({
    ...row,
    direction: 'OUT',
  });
  vi.mocked(getOwnLateAccess).mockResolvedValueOnce({
    ...row,
    direction: 'OUT',
    status: 'approved',
    decided_at: '2027-02-21T10:00:00Z',
    decision_note: '',
  });
  open('new');
  await fill();
  await userEvent.selectOptions(screen.getByLabelText('Movement'), 'OUT');
  await userEvent.click(
    screen.getByRole('button', { name: 'Submit access request' }),
  );
  expect(
    await screen.findByText('No use recorded for this permission.'),
  ).toBeVisible();
  expect(screen.getByText('Early exit (OUT)')).toBeVisible();
  expect(vi.mocked(submitOwnLateAccess).mock.calls[0][0].direction).toBe('OUT');
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listOwnLateAccess).mockResolvedValue(ownLateAccessPage());
  vi.mocked(getOwnLateAccess).mockResolvedValue(row);
  vi.mocked(submitOwnLateAccess).mockResolvedValue(row);
});
function open(mode: 'list' | 'new' | 'detail' = 'list') {
  const initial =
    mode === 'new'
      ? '/student/late-access-requests/new'
      : mode === 'detail'
        ? `/student/late-access-requests/${row.late_access_id}`
        : '/student/late-access-requests';
  const router = createMemoryRouter(
    [
      {
        path: '/student/late-access-requests',
        element:
          mode === 'new' ? (
            <p>Access listing</p>
          ) : (
            <OwnLateAccessList {...props} />
          ),
      },
      {
        path: '/student/late-access-requests/new',
        element: <OwnLateAccessForm {...props} />,
      },
      {
        path: '/student/late-access-requests/:lateAccessID',
        element: <OwnLateAccessDetail {...props} />,
      },
      { path: '/login', element: <p>Student sign in</p> },
    ],
    { initialEntries: [initial] },
  );
  return { ...render(<RouterProvider router={router} />), router };
}
async function fill() {
  await userEvent.selectOptions(screen.getByLabelText('Movement'), 'IN');
  fireEvent.change(screen.getByLabelText('Expected date and time'), {
    target: { value: '2099-03-01T21:00' },
  });
  await userEvent.type(
    screen.getByLabelText('Reason for access'),
    ' Travel delay ',
  );
}

it('shows owned list statuses, dates, details and a create link without staff controls', async () => {
  const view = open();
  expect(screen.getByText('Loading your access requests…')).toBeVisible();
  await screen.findByText('Travel delay');
  expect(listOwnLateAccess).toHaveBeenCalledWith(
    'student',
    props.studentID,
    expect.any(AbortSignal),
    '',
    0,
  );
  expect(
    screen.getByRole('link', { name: 'New access request' }),
  ).toHaveAttribute('href', '/student/late-access-requests/new');
  await userEvent.click(screen.getByRole('link', { name: /View request/ }));
  await screen.findByText('Waiting for a hostel staff decision.');
  expect(view.router.state.location.pathname).toBe(
    `/student/late-access-requests/${row.late_access_id}`,
  );
  expect(
    screen.queryByRole('button', { name: /approve|reject|cancel|delete/i }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByText(studentAccessFixture.submitted_by),
  ).not.toBeInTheDocument();
});
it('filters status, paginates and refreshes to page 1', async () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({
    ...row,
    late_access_id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  }));
  vi.mocked(listOwnLateAccess).mockResolvedValue(
    ownLateAccessPage(rows, 0, 21),
  );
  open();
  await screen.findByText('Page 1');
  await userEvent.selectOptions(screen.getByLabelText('Status'), 'pending');
  await waitFor(() => expect(listOwnLateAccess).toHaveBeenCalledTimes(2));
  vi.mocked(listOwnLateAccess).mockResolvedValue(
    ownLateAccessPage([row], 20, 21),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByText('Page 2');
  expect(listOwnLateAccess).toHaveBeenLastCalledWith(
    'student',
    props.studentID,
    expect.any(AbortSignal),
    'pending',
    20,
  );
  expect(
    screen.getByRole('region', { name: 'Your access request results' }),
  ).toHaveFocus();
  vi.mocked(listOwnLateAccess).mockResolvedValue(
    ownLateAccessPage(rows, 0, 21),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Previous' }));
  await screen.findByText('Page 1');
  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  await waitFor(() =>
    expect(listOwnLateAccess).toHaveBeenLastCalledWith(
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
    expect(listOwnLateAccess).toHaveBeenLastCalledWith(
      'student',
      props.studentID,
      expect.any(AbortSignal),
      'pending',
      0,
    ),
  );
});
it('handles empty lists, safe errors and retry without stale results', async () => {
  vi.mocked(listOwnLateAccess).mockResolvedValueOnce(
    ownLateAccessPage([], 0, 0),
  );
  open();
  await screen.findByText('No access requests found for this status.');
  vi.mocked(listOwnLateAccess).mockRejectedValueOnce(
    new Error('private details'),
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Refresh requests' }),
  );
  expect(await screen.findByRole('alert')).not.toHaveTextContent(
    'private details',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Retry requests' }));
  await screen.findByText('Travel delay');
});
it.each(['session', 'forbidden', 'setup'] as const)(
  'clears list access and delegates %s to the portal',
  async (kind) => {
    vi.mocked(listOwnLateAccess).mockRejectedValueOnce(
      new OwnLateAccessError(kind, 'Verify access'),
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
    vi.mocked(getOwnLateAccess).mockResolvedValue({
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
    await waitFor(() => expect(getOwnLateAccess).toHaveBeenCalledTimes(2));
  },
);
it('shows missing detail errors and lets the owner retry without staff decisions', async () => {
  vi.mocked(getOwnLateAccess).mockRejectedValueOnce(
    new OwnLateAccessError('not-found', 'Request not found'),
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
    screen.getByRole('button', { name: 'Submit access request' }),
  );
  expect(screen.getByRole('alert')).toHaveTextContent('Choose early');
  await fill();
  fireEvent.change(screen.getByLabelText('Expected date and time'), {
    target: { value: '2000-03-01T21:00' },
  });
  await userEvent.click(
    screen.getByRole('button', { name: 'Submit access request' }),
  );
  expect(screen.getByRole('alert')).toHaveTextContent('future');
  expect(screen.getByRole('alert')).toHaveFocus();
  expect(screen.getByLabelText('Reason for access')).toHaveValue(
    ' Travel delay ',
  );
  expect(submitOwnLateAccess).not.toHaveBeenCalled();
});
it('submits once, prevents double click and opens the saved request after success', async () => {
  let finish!: (value: OwnLateAccess) => void;
  vi.mocked(submitOwnLateAccess).mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const view = open('new');
  await fill();
  await userEvent.dblClick(
    screen.getByRole('button', { name: 'Submit access request' }),
  );
  expect(submitOwnLateAccess).toHaveBeenCalledTimes(1);
  expect(
    screen.getByRole('button', { name: 'Submitting request…' }),
  ).toBeDisabled();
  expect(screen.getByLabelText('Reason for access')).toBeDisabled();
  await act(async () => finish(row));
  expect(view.router.state.location.pathname).toBe(
    `/student/late-access-requests/${row.late_access_id}`,
  );
  expect(
    await screen.findByText(/Your access request was submitted/),
  ).toBeVisible();
  expect(submitOwnLateAccess).toHaveBeenCalledWith(
    expect.objectContaining({
      reason: 'Travel delay',
      request_id: expect.any(String),
    }),
    'student',
    props.studentID,
    expect.any(AbortSignal),
  );
});
it('locks an uncertain submission and retries the exact payload and request ID', async () => {
  vi.mocked(submitOwnLateAccess).mockRejectedValueOnce(
    new Error('network failed'),
  );
  open('new');
  await fill();
  await userEvent.click(
    screen.getByRole('button', { name: 'Submit access request' }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'may already be saved',
  );
  const first = vi.mocked(submitOwnLateAccess).mock.calls[0][0];
  expect(screen.getByLabelText('Expected date and time')).toBeDisabled();
  await userEvent.click(
    screen.getByRole('button', { name: 'Retry same request' }),
  );
  await screen.findByText(/Your access request was submitted/);
  expect(vi.mocked(submitOwnLateAccess).mock.calls[1][0]).toEqual(first);
});
it.each(['invalid', 'conflict', 'ineligible'] as const)(
  'preserves an editable draft after a definite %s rejection',
  async (kind) => {
    vi.mocked(submitOwnLateAccess).mockRejectedValueOnce(
      new OwnLateAccessError(kind, 'Please review your request'),
    );
    open('new');
    await fill();
    await userEvent.click(
      screen.getByRole('button', { name: 'Submit access request' }),
    );
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Reason for access')).toHaveValue(
      ' Travel delay ',
    );
    expect(screen.getByLabelText('Reason for access')).toBeEnabled();
  },
);
it('protects drafts during navigation, lets students keep editing or leave, and clears unload listeners', async () => {
  open('new');
  await fill();
  const unload = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(unload);
  expect(unload.defaultPrevented).toBe(true);
  await userEvent.click(
    screen.getByRole('link', { name: 'Back to my access requests' }),
  );
  const dialog = await screen.findByRole('dialog', {
    name: 'Discard this access draft?',
  });
  await userEvent.click(
    within(dialog).getByRole('button', { name: 'Stay on form' }),
  );
  expect(screen.getByLabelText('Reason for access')).toHaveValue(
    ' Travel delay ',
  );
  await userEvent.click(
    screen.getByRole('link', { name: 'Back to my access requests' }),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Leave form' }));
  await screen.findByText('Access listing');
  const clean = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(clean);
  expect(clean.defaultPrevented).toBe(false);
});
it('warns before abandoning an unconfirmed submission and does not block logout', async () => {
  vi.mocked(submitOwnLateAccess).mockRejectedValueOnce(new Error('timeout'));
  const view = open('new');
  await fill();
  await userEvent.click(
    screen.getByRole('button', { name: 'Submit access request' }),
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
  vi.mocked(submitOwnLateAccess).mockReturnValueOnce(
    new Promise((_resolve, reject) => {
      fail = reject;
    }),
  );
  const view = open('new');
  await fill();
  await userEvent.click(
    screen.getByRole('button', { name: 'Submit access request' }),
  );
  const signal = vi.mocked(submitOwnLateAccess).mock.calls[0][3];
  view.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () =>
    fail(new OwnLateAccessError('forbidden', 'Late denial')),
  );
  expect(denied).not.toHaveBeenCalled();
});
it('aborts old list requests on identity changes and suppresses old records', async () => {
  let finish!: (value: ReturnType<typeof ownLateAccessPage>) => void;
  vi.mocked(listOwnLateAccess)
    .mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    )
    .mockResolvedValueOnce(ownLateAccessPage([], 0, 0));
  const view = render(<OwnLateAccessList {...props} />, {
    wrapper: MemoryRouter,
  });
  const first = vi.mocked(listOwnLateAccess).mock.calls[0][2];
  view.rerender(<OwnLateAccessList {...props} uid="second" />);
  expect(first.aborted).toBe(true);
  await screen.findByText('No access requests found for this status.');
  await act(async () => finish(ownLateAccessPage()));
  expect(screen.queryByText('Travel delay')).not.toBeInTheDocument();
});
