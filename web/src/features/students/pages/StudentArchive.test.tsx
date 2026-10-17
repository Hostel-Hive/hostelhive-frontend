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
  archiveStudent,
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
  archiveStudent: vi.fn(),
  getStudent: vi.fn(),
  listStudents: vi.fn(),
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
  vi.mocked(getStudent).mockResolvedValue(studentFixture);
  vi.mocked(listStudents).mockResolvedValue({
    ...studentPageFixture,
    students: [],
    offset: 20,
  });
  vi.mocked(archiveStudent).mockResolvedValue(undefined);
});
function renderProfile() {
  window.history.replaceState(
    {},
    '',
    `/dashboard/students/${studentFixture.student_id}?q=Alex&faculty=Science&year=2&offset=20`,
  );
  return render(<App />);
}
async function openDialog() {
  await userEvent.click(
    await screen.findByRole(
      'button',
      { name: 'Archive student profile' },
      { timeout: 5000 },
    ),
  );
  return screen.getByRole('alertdialog');
}
describe('student profile archival', () => {
  it.each(['admin', 'warden'] as const)(
    'allows %s archival and returns to refreshed filtered directory',
    async (role) => {
      vi.mocked(restoreStaffSession).mockResolvedValue({
        user_id: 'staff',
        firebase_uid: 'staff-uid',
        email: 'staff@example.com',
        role,
        is_active: true,
      });
      renderProfile();
      const dialog = await openDialog();
      expect(within(dialog).getByText('Alex Morgan')).toBeVisible();
      expect(within(dialog).getByText('STU-1042')).toBeVisible();
      expect(dialog).toHaveTextContent('login account will not be deactivated');
      expect(dialog).toHaveTextContent(
        'bed will not be released automatically',
      );
      expect(dialog).toHaveTextContent('preserves historical records');
      expect(archiveStudent).not.toHaveBeenCalled();
      await userEvent.click(
        within(dialog).getByRole('button', { name: 'Archive profile' }),
      );
      expect(
        await screen.findByText('Student profile archived.'),
      ).toBeVisible();
      expect(window.location.pathname).toBe('/dashboard/students');
      expect(window.location.search).toBe(
        '?q=Alex&faculty=Science&year=2&offset=20',
      );
      expect(archiveStudent).toHaveBeenCalledWith(
        studentFixture.student_id,
        'staff-uid',
        expect.any(AbortSignal),
      );
      await waitFor(() => expect(listStudents).toHaveBeenCalled());
      expect(
        screen.queryByRole('link', { name: 'View Alex Morgan' }),
      ).not.toBeInTheDocument();
    },
  );
  it('cancels without a request, focuses Cancel and restores trigger focus', async () => {
    renderProfile();
    await openDialog();
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    expect(cancel).toHaveFocus();
    await userEvent.click(cancel);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Archive student profile' }),
    ).toHaveFocus();
    expect(archiveStudent).not.toHaveBeenCalled();
    const dialog = await openDialog();
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(archiveStudent).not.toHaveBeenCalled();
  });
  it('prevents duplicate clicks and dismissal while pending', async () => {
    let resolve!: () => void;
    vi.mocked(archiveStudent).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    renderProfile();
    const dialog = await openDialog();
    await userEvent.dblClick(
      within(dialog).getByRole('button', { name: 'Archive profile' }),
    );
    expect(archiveStudent).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(dialog).toBeVisible();
    await act(async () => resolve());
    await screen.findByText('Student profile archived.');
  });
  it('requires an explicit read after uncertain failure, even after closing and reopening', async () => {
    vi.mocked(archiveStudent).mockRejectedValueOnce(
      new Error('private network details'),
    );
    renderProfile();
    await openDialog();
    await userEvent.click(
      screen.getByRole('button', { name: 'Archive profile' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'could not confirm',
    );
    expect(
      screen.queryByText('Student profile archived.'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Archive profile' }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await openDialog();
    expect(
      screen.queryByRole('button', { name: 'Archive profile' }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Check profile' }),
    );
    expect(
      await screen.findByText(
        'The profile still exists. Review the details before confirming another archive request.',
      ),
    ).toBeVisible();
    expect(archiveStudent).toHaveBeenCalledOnce();
    await userEvent.click(
      screen.getByRole('button', { name: 'Archive profile' }),
    );
    await screen.findByText('Student profile archived.');
    expect(archiveStudent).toHaveBeenCalledTimes(2);
  });
  it('handles an already missing profile without claiming a new archival success', async () => {
    vi.mocked(archiveStudent).mockRejectedValue(
      new StudentRequestError('not-found', 'Student profile not found.'),
    );
    renderProfile();
    await openDialog();
    await userEvent.click(
      screen.getByRole('button', { name: 'Archive profile' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No new archival success has been confirmed',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Return to students' }),
    );
    await screen.findByRole('heading', { name: 'Students' });
    expect(
      screen.queryByText('Student profile archived.'),
    ).not.toBeInTheDocument();
  });
  it('rechecks uncertain outcomes safely and allows GET retries without repeating DELETE', async () => {
    vi.mocked(archiveStudent).mockRejectedValue(new Error('timeout'));
    renderProfile();
    await openDialog();
    await userEvent.click(
      screen.getByRole('button', { name: 'Archive profile' }),
    );
    await screen.findByRole('alert');
    vi.mocked(getStudent).mockRejectedValueOnce(new Error('still offline'));
    await userEvent.click(
      screen.getByRole('button', { name: 'Check profile' }),
    );
    await screen.findByRole('alert');
    expect(archiveStudent).toHaveBeenCalledOnce();
    vi.mocked(getStudent).mockRejectedValueOnce(
      new StudentRequestError('not-found', 'Not found.'),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Check profile' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'no longer available',
    );
    expect(
      screen.queryByRole('button', { name: 'Archive profile' }),
    ).not.toBeInTheDocument();
  });
  it.each(['session', 'forbidden', 'invalid'] as const)(
    'blocks further archive attempts after %s',
    async (kind) => {
      vi.mocked(archiveStudent).mockRejectedValue(
        new StudentRequestError(kind, 'Access rejected.'),
      );
      renderProfile();
      await openDialog();
      await userEvent.click(
        screen.getByRole('button', { name: 'Archive profile' }),
      );
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Access rejected.',
      );
      expect(
        screen.queryByRole('button', { name: 'Archive profile' }),
      ).not.toBeInTheDocument();
      if (kind === 'session') {
        await userEvent.click(
          screen.getByRole('button', { name: 'Sign in again' }),
        );
        await screen.findByRole('heading', { name: 'Sign in to HostelHive.' });
      }
    },
  );
  it('aborts on unmount and ignores a late response', async () => {
    let resolve!: () => void;
    vi.mocked(archiveStudent).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const view = renderProfile();
    await openDialog();
    await userEvent.click(
      screen.getByRole('button', { name: 'Archive profile' }),
    );
    const signal = vi.mocked(archiveStudent).mock.calls[0][2];
    view.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => resolve());
    expect(
      screen.queryByText('Student profile archived.'),
    ).not.toBeInTheDocument();
  });
});
