import {
  registerStudentInvitation,
  getStudentInvitation,
} from '../api/student-invitations.api';
import { invitationFixture } from '../../../test/fixtures/student-invitation';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import App from '../../../app/App';
import {
  restoreStaffSession,
  subscribeStaffSession,
  logout,
} from '../../auth/api/auth.api';
import {
  createStudentByEmail,
  updateStudent,
  getStudent,
  listStudents,
  StudentRequestError,
} from '../api/students.api';
import {
  studentFixture,
  studentPageFixture,
} from '../../../test/fixtures/student';
vi.mock('../../auth/api/auth.api', async (original) => ({
  ...(await original<typeof import('../../auth/api/auth.api')>()),
  restoreStaffSession: vi.fn(),
  subscribeStaffSession: vi.fn(),
  logout: vi.fn(),
}));
vi.mock('../api/students.api', async (original) => ({
  ...(await original<typeof import('../api/students.api')>()),
  createStudentByEmail: vi.fn(),
  updateStudent: vi.fn(),
  getStudent: vi.fn(),
  listStudents: vi.fn(),
}));
vi.mock('../api/student-invitations.api', async (original) => ({
  ...(await original<typeof import('../api/student-invitations.api')>()),
  registerStudentInvitation: vi.fn(),
  getStudentInvitation: vi.fn(),
}));
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
  if (show)
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', show);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  if (close) Object.defineProperty(HTMLDialogElement.prototype, 'close', close);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(restoreStaffSession).mockResolvedValue({
    user_id: 'staff',
    firebase_uid: 'staff-uid',
    email: 'staff@example.com',
    role: 'admin',
    is_active: true,
  });
  vi.mocked(subscribeStaffSession).mockImplementation((change) => {
    let active = true;
    queueMicrotask(() => {
      if (active) change(true);
    });
    return () => {
      active = false;
    };
  });
  vi.mocked(logout).mockImplementation(async () => {
    vi.mocked(restoreStaffSession).mockResolvedValue(null);
  });
  vi.mocked(getStudent).mockResolvedValue({
    ...studentFixture,
    email: invitationFixture.email,
  });
  vi.mocked(registerStudentInvitation).mockImplementation(async (input) => ({
    invitation: { ...invitationFixture, request_id: input.request_id },
    replayed: false,
  }));
  vi.mocked(getStudentInvitation).mockResolvedValue(invitationFixture);
  vi.mocked(listStudents).mockResolvedValue(studentPageFixture);
  vi.mocked(createStudentByEmail).mockResolvedValue(studentFixture);
  vi.mocked(updateStudent).mockResolvedValue(studentFixture);
});
function renderAt(path = '/dashboard/students/new') {
  window.history.replaceState({}, '', path);
  return render(<App />);
}
async function fillCreate() {
  await screen.findByLabelText('University email');
  for (const [label, value] of [
    ['University email', '  ALEX@STUDENTS.EXAMPLE.EDU  '],
    ['University registration / index number', studentFixture.index_no],
    ['Full name', studentFixture.full_name],
    ['Faculty', studentFixture.faculty],
    ['Contact phone', studentFixture.contact_phone],
    ['Guardian 1 name', 'Robin Morgan'],
    ['Guardian 1 relationship', 'Parent'],
    ['Guardian 1 phone', '+94771111111'],
    ['Year', '2'],
  ])
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
describe('Admin invitation registration', () => {
  it('keeps new account registration Admin-only while allowing Warden existing-account linking', async () => {
    vi.mocked(restoreStaffSession).mockResolvedValue({
      user_id: 'staff',
      firebase_uid: 'staff-uid',
      email: 'staff@example.com',
      role: 'warden',
      is_active: true,
    });
    renderAt();
    expect(await screen.findByLabelText('University email')).toBeVisible();
    expect(
      screen.queryByLabelText('Student account ID'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Register student' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', {
        name: 'Register with a university email instead',
      }),
    ).not.toBeInTheDocument();
    await fillCreate();
    await userEvent.click(
      screen.getByRole('button', { name: 'Create profile' }),
    );
    await waitFor(() =>
      expect(createStudentByEmail).toHaveBeenCalledWith(
        expect.objectContaining({ email: invitationFixture.email }),
        'staff-uid',
        expect.any(AbortSignal),
      ),
    );
    expect(registerStudentInvitation).not.toHaveBeenCalled();
  });
  it('registers without a manual UUID and keeps directory filters', async () => {
    renderAt('/dashboard/students/new?q=Alex');
    await fillCreate();
    expect(
      screen.queryByLabelText('Student account ID'),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Register student' }),
    );
    expect(
      await screen.findByText(/Account setup invitation queued/),
    ).toBeVisible();
    expect(registerStudentInvitation).toHaveBeenCalledTimes(1);
    const [body, uid] = vi.mocked(registerStudentInvitation).mock.calls[0];
    expect(body).toMatchObject({
      email: 'alex@students.example.edu',
      index_no: studentFixture.index_no,
      full_name: 'Alex Morgan',
      guardians: [
        {
          name: 'Robin Morgan',
          relationship: 'Parent',
          contact_phone: '+94771111111',
        },
      ],
    });
    expect(body.request_id).toMatch(/^[a-f0-9-]{36}$/);
    expect(body).not.toHaveProperty('user_id');
    expect(body).not.toHaveProperty('password');
    expect(uid).toBe('staff-uid');
    expect(createStudentByEmail).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe(
      '/dashboard/students/' + invitationFixture.student_id,
    );
    expect(window.location.search).toBe('?q=Alex');
  });
  it('reuses the exact request and locks edits after an uncertain save', async () => {
    vi.mocked(registerStudentInvitation).mockRejectedValueOnce(
      new StudentRequestError('unavailable', 'Unable to confirm registration.'),
    );
    renderAt();
    await fillCreate();
    await userEvent.click(
      screen.getByRole('button', { name: 'Register student' }),
    );
    expect(
      await screen.findByRole('button', { name: 'Retry same registration' }),
    ).toBeEnabled();
    expect(screen.getByLabelText('University email')).toBeDisabled();
    expect(screen.getByLabelText('Guardian 1 name')).toBeDisabled();
    await userEvent.click(
      screen.getByRole('button', { name: 'Retry same registration' }),
    );
    await screen.findByText(/Account setup invitation queued/);
    expect(registerStudentInvitation).toHaveBeenCalledTimes(2);
    expect(vi.mocked(registerStudentInvitation).mock.calls[0][0]).toEqual(
      vi.mocked(registerStudentInvitation).mock.calls[1][0],
    );
  });
  it('permits correcting a definitive duplicate and generates a new request', async () => {
    vi.mocked(registerStudentInvitation).mockRejectedValueOnce(
      new StudentRequestError('duplicate', 'Duplicate registration.'),
    );
    renderAt();
    await fillCreate();
    await userEvent.click(
      screen.getByRole('button', { name: 'Register student' }),
    );
    expect(await screen.findByText('Duplicate registration.')).toBeVisible();
    expect(screen.getByLabelText('University email')).toBeEnabled();
    fireEvent.change(screen.getByLabelText('University email'), {
      target: { value: 'other@students.example.edu' },
    });
    await userEvent.click(
      screen.getByRole('button', { name: 'Register student' }),
    );
    await waitFor(() =>
      expect(registerStudentInvitation).toHaveBeenCalledTimes(2),
    );
    const calls = vi.mocked(registerStudentInvitation).mock.calls;
    expect(calls[1][0].request_id).not.toBe(calls[0][0].request_id);
  });
  it('validates email and profile details before requesting registration', async () => {
    renderAt();
    await screen.findByLabelText('University email');
    await userEvent.click(
      screen.getByRole('button', { name: 'Register student' }),
    );
    expect(
      await screen.findByText('Enter a valid university email.'),
    ).toBeVisible();
    expect(registerStudentInvitation).not.toHaveBeenCalled();
  });
  it.each(['forbidden', 'session'] as const)(
    'locks registration after %s',
    async (kind) => {
      vi.mocked(registerStudentInvitation).mockRejectedValue(
        new StudentRequestError(kind, 'Registration denied.'),
      );
      renderAt();
      await fillCreate();
      await userEvent.click(
        screen.getByRole('button', { name: 'Register student' }),
      );
      expect(await screen.findByText('Registration denied.')).toBeVisible();
      expect(
        screen.getByRole('button', { name: 'Register student' }),
      ).toBeDisabled();
      if (kind === 'session')
        expect(
          screen.getByRole('button', { name: 'Sign in again' }),
        ).toBeVisible();
    },
  );
  it('prevents double submission and aborts the request on unmount', async () => {
    vi.mocked(registerStudentInvitation).mockImplementation(
      () => new Promise(() => {}),
    );
    const view = renderAt();
    await fillCreate();
    const button = screen.getByRole('button', { name: 'Register student' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(registerStudentInvitation).toHaveBeenCalledTimes(1);
    const signal = vi.mocked(registerStudentInvitation).mock.calls[0][2];
    expect(button).toBeDisabled();
    view.unmount();
    expect(signal.aborted).toBe(true);
  });
  it('keeps legacy account linking behind a separate Admin choice', async () => {
    renderAt();
    await userEvent.click(
      await screen.findByRole('link', {
        name: 'Create a profile for an existing account instead',
      }),
    );
    expect(await screen.findByLabelText('University email')).toBeVisible();
    expect(
      screen.queryByLabelText('Student account ID'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Create profile' }),
    ).toBeVisible();
    expect(registerStudentInvitation).not.toHaveBeenCalled();
  });
  it('shows accepted email status without claiming delivery and retains it after refresh failure', async () => {
    vi.mocked(getStudentInvitation).mockResolvedValue({
      ...invitationFixture,
      delivery_status: 'sent',
      last_sent_at: '2026-10-19T12:05:00Z',
    });
    renderAt();
    await fillCreate();
    await userEvent.click(
      screen.getByRole('button', { name: 'Register student' }),
    );
    expect(
      await screen.findByText(/Firebase accepted the setup email request/),
    ).toBeVisible();
    vi.mocked(getStudentInvitation).mockRejectedValue(new Error('offline'));
    await userEvent.click(
      screen.getByRole('button', { name: 'Refresh invitation status' }),
    );
    expect(
      await screen.findByText(/Unable to refresh invitation status/),
    ).toBeVisible();
    expect(
      screen.getByText(/Firebase accepted the setup email request/),
    ).toBeVisible();
  });
  it.each([
    ['failed', 'The invitation could not be sent.'],
    ['skipped', 'Invitation delivery was skipped.'],
    ['complete', 'The student has completed account setup.'],
  ])('shows %s status', async (status, message) => {
    vi.mocked(getStudentInvitation).mockResolvedValue({
      ...invitationFixture,
      delivery_status:
        status === 'complete' ? 'sent' : (status as 'failed' | 'skipped'),
      setup_completed_at: status === 'complete' ? '2026-10-19T12:10:00Z' : null,
    });
    renderAt();
    await fillCreate();
    await userEvent.click(
      screen.getByRole('button', { name: 'Register student' }),
    );
    expect(await screen.findByText(new RegExp(message))).toBeVisible();
  });
});
