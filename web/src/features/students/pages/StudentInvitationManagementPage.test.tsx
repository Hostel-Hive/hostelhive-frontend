import { beforeAll, beforeEach, afterAll, expect, it, vi } from 'vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import StudentInvitationManagementPage from './StudentInvitationManagementPage';
import useAuth from '../../auth/hooks/useAuth';
import {
  listStudentInvitations,
  readStudentInvitation,
  resendStudentInvitation,
  InvitationError,
} from '../api/invitation-management.api';
import { invitationFixture } from '../../../test/fixtures/student-invitation';
vi.mock('../../auth/hooks/useAuth', () => ({ default: vi.fn() }));
vi.mock('../api/invitation-management.api', async (original) => ({
  ...(await original<typeof import('../api/invitation-management.api')>()),
  listStudentInvitations: vi.fn(),
  readStudentInvitation: vi.fn(),
  resendStudentInvitation: vi.fn(),
}));
const row = {
  ...invitationFixture,
  delivery_status: 'sent' as const,
  last_sent_at: invitationFixture.created_at,
};
const page = { items: [row], total: 1, limit: 20, offset: 0, has_more: false };
const auth = (role = 'admin', uid = 'admin') =>
  ({ account: { role, firebase_uid: uid } }) as ReturnType<typeof useAuth>;
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
  vi.mocked(useAuth).mockReturnValue(auth());
  vi.mocked(listStudentInvitations).mockResolvedValue(page);
  vi.mocked(readStudentInvitation).mockResolvedValue(row);
  vi.mocked(resendStudentInvitation).mockResolvedValue({
    ...row,
    delivery_status: 'pending',
  });
});
function mount() {
  return render(
    <RouterProvider
      router={createMemoryRouter([
        { path: '/', element: <StudentInvitationManagementPage /> },
      ])}
    />,
  );
}
async function openDetails() {
  await screen.findByRole('button', {
    name: `View invitation for ${row.email}`,
  });
  await userEvent.click(
    screen.getByRole('button', { name: `View invitation for ${row.email}` }),
  );
  await screen.findByRole('button', { name: 'Resend invitation' });
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Check status' })).toBeEnabled(),
  );
  return within(screen.getByRole('dialog'));
}
it.each(['warden', 'student'])('denies %s before requesting data', (role) => {
  vi.mocked(useAuth).mockReturnValue(auth(role));
  mount();
  expect(screen.getByRole('alert')).toHaveTextContent('administrators only');
  expect(listStudentInvitations).not.toHaveBeenCalled();
});
it('shows delivery and setup as separate states without pretending inbox receipt', async () => {
  mount();
  expect(await screen.findByRole('rowheader')).toHaveTextContent(row.email);
  expect(screen.getByText('Sent')).toBeVisible();
  expect(screen.getByText('Awaiting student')).toBeVisible();
  expect(
    screen.getByText(/Sent means the email provider accepted/),
  ).toBeVisible();
  expect(screen.getByRole('link', { name: row.email })).toHaveAttribute(
    'href',
    '/dashboard/students/' + row.student_id,
  );
});
it('requires explicit confirmation and refreshes after an accepted resend', async () => {
  mount();
  const dialog = await openDetails();
  await userEvent.click(
    dialog.getByRole('button', { name: 'Resend invitation' }),
  );
  expect(resendStudentInvitation).not.toHaveBeenCalled();
  await userEvent.click(dialog.getByRole('button', { name: 'Confirm resend' }));
  expect(await dialog.findByText(/Resend request accepted/)).toBeVisible();
  expect(resendStudentInvitation).toHaveBeenCalledWith(
    row.invitation_id,
    expect.stringMatching(/^[0-9a-f-]{36}$/),
    'admin',
    expect.any(AbortSignal),
  );
  await userEvent.click(dialog.getByRole('button', { name: 'Close' }));
  await waitFor(() => expect(listStudentInvitations).toHaveBeenCalledTimes(2));
});
it.each(['pending', 'complete'] as const)(
  'disables new resend for %s invitations',
  async (state) => {
    vi.mocked(readStudentInvitation).mockResolvedValue({
      ...row,
      ...(state === 'pending'
        ? { delivery_status: 'pending' }
        : { setup_completed_at: row.created_at }),
    });
    mount();
    const dialog = await openDetails();
    expect(
      dialog.getByRole('button', { name: 'Resend invitation' }),
    ).toBeDisabled();
    expect(resendStudentInvitation).not.toHaveBeenCalled();
  },
);
it('displays the local five-minute cooldown', async () => {
  vi.mocked(readStudentInvitation).mockResolvedValue({
    ...row,
    last_requested_at: new Date().toISOString(),
  });
  mount();
  const dialog = await openDetails();
  expect(dialog.getByText(/Resend available in/)).toBeVisible();
  expect(
    dialog.getByRole('button', { name: 'Resend invitation' }),
  ).toBeDisabled();
});
it('respects server cooldown and does not retry automatically', async () => {
  vi.mocked(resendStudentInvitation).mockRejectedValue(
    new InvitationError('cooldown', 'Wait before retrying', 300),
  );
  mount();
  const dialog = await openDetails();
  await userEvent.click(
    dialog.getByRole('button', { name: 'Resend invitation' }),
  );
  await userEvent.click(dialog.getByRole('button', { name: 'Confirm resend' }));
  expect(await dialog.findByRole('alert')).toHaveTextContent(
    'Wait before retrying',
  );
  expect(dialog.getByRole('button', { name: 'Confirm resend' })).toBeDisabled();
  expect(resendStudentInvitation).toHaveBeenCalledTimes(1);
});
it('retains the exact operation ID after an uncertain result and permits status checks', async () => {
  vi.mocked(resendStudentInvitation).mockRejectedValueOnce(
    new InvitationError('unavailable', 'Unknown'),
  );
  mount();
  const dialog = await openDetails();
  await userEvent.click(
    dialog.getByRole('button', { name: 'Resend invitation' }),
  );
  await userEvent.click(dialog.getByRole('button', { name: 'Confirm resend' }));
  await dialog.findByRole('button', { name: 'Retry identical resend' });
  const first = vi.mocked(resendStudentInvitation).mock.calls[0][1];
  await userEvent.click(dialog.getByRole('button', { name: 'Check status' }));
  await waitFor(() => expect(readStudentInvitation).toHaveBeenCalledTimes(2));
  await userEvent.click(
    dialog.getByRole('button', { name: 'Retry identical resend' }),
  );
  await dialog.findByText(/Resend request accepted/);
  expect(vi.mocked(resendStudentInvitation).mock.calls[1][1]).toBe(first);
});
it('clears private rows when a resend loses Admin authority', async () => {
  vi.mocked(resendStudentInvitation).mockRejectedValue(
    new InvitationError('forbidden', 'Admin access revoked'),
  );
  mount();
  const dialog = await openDetails();
  await userEvent.click(
    dialog.getByRole('button', { name: 'Resend invitation' }),
  );
  await userEvent.click(dialog.getByRole('button', { name: 'Confirm resend' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Admin access revoked',
  );
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.queryByRole('rowheader')).not.toBeInTheDocument();
});
it('prevents duplicate mutation requests and aborts on unmount', async () => {
  let resolve!: (value: typeof row) => void;
  vi.mocked(resendStudentInvitation).mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const view = mount();
  const dialog = await openDetails();
  await userEvent.click(
    dialog.getByRole('button', { name: 'Resend invitation' }),
  );
  const button = dialog.getByRole('button', { name: 'Confirm resend' });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(resendStudentInvitation).toHaveBeenCalledTimes(1);
  expect(dialog.getByRole('button', { name: 'Close' })).toBeDisabled();
  const signal = vi.mocked(resendStudentInvitation).mock.calls[0][3];
  view.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => resolve(row));
});
it('loads pages and returns to page one on refresh', async () => {
  vi.mocked(listStudentInvitations).mockImplementation(
    async (_uid, offset) => ({
      ...page,
      total: 21,
      offset,
      has_more: offset === 0,
    }),
  );
  mount();
  await screen.findByRole('rowheader');
  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  await waitFor(() =>
    expect(listStudentInvitations).toHaveBeenLastCalledWith(
      'admin',
      20,
      expect.any(AbortSignal),
    ),
  );
  await screen.findByRole('rowheader');
  await userEvent.click(
    screen.getByRole('button', { name: 'Refresh invitations' }),
  );
  await waitFor(() =>
    expect(listStudentInvitations).toHaveBeenLastCalledWith(
      'admin',
      0,
      expect.any(AbortSignal),
    ),
  );
});
it('recovers from list and detail read errors', async () => {
  vi.mocked(listStudentInvitations).mockRejectedValueOnce(new Error('Offline'));
  mount();
  await userEvent.click(
    await screen.findByRole('button', { name: 'Retry invitations' }),
  );
  vi.mocked(readStudentInvitation).mockRejectedValueOnce(new Error('Offline'));
  await userEvent.click(
    await screen.findByRole('button', {
      name: `View invitation for ${row.email}`,
    }),
  );
  await screen.findByText(/Unable to check this invitation/);
  await userEvent.click(screen.getByRole('button', { name: 'Check status' }));
  await screen.findByText(row.email, { selector: '.invitation-email' });
});

it('enables a new resend when the five-minute local cooldown expires', async () => {
  vi.useFakeTimers();
  try {
    vi.mocked(readStudentInvitation).mockResolvedValue({
      ...row,
      last_requested_at: new Date().toISOString(),
    });
    mount();
    await act(async () => {});
    fireEvent.click(
      screen.getByRole('button', { name: `View invitation for ${row.email}` }),
    );
    await act(async () => {});
    expect(
      screen.getByRole('button', { name: 'Resend invitation' }),
    ).toBeDisabled();
    await act(async () => {
      vi.advanceTimersByTime(301000);
    });
    expect(
      screen.getByRole('button', { name: 'Resend invitation' }),
    ).toBeEnabled();
    expect(resendStudentInvitation).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});
it('shows a backend eligibility conflict without starting another resend', async () => {
  vi.mocked(resendStudentInvitation).mockRejectedValue(
    new InvitationError('conflict', 'Account is no longer eligible'),
  );
  mount();
  const dialog = await openDetails();
  await userEvent.click(
    dialog.getByRole('button', { name: 'Resend invitation' }),
  );
  await userEvent.click(dialog.getByRole('button', { name: 'Confirm resend' }));
  expect(await dialog.findByRole('alert')).toHaveTextContent(
    'no longer eligible',
  );
  expect(dialog.getByRole('button', { name: 'Confirm resend' })).toBeDisabled();
  expect(resendStudentInvitation).toHaveBeenCalledTimes(1);
});
