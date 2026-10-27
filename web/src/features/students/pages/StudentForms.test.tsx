import { StrictMode } from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
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
    role: 'warden',
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
  vi.mocked(listStudents).mockResolvedValue(studentPageFixture);
  vi.mocked(createStudentByEmail).mockResolvedValue(studentFixture);
  vi.mocked(updateStudent).mockResolvedValue(studentFixture);
});
function renderAt(path = '/dashboard/students/new?registration=existing') {
  window.history.replaceState({}, '', path);
  return render(<App />);
}
async function fillCreate() {
  await screen.findByLabelText('University email');
  for (const [label, value] of [
    ['University email', studentFixture.email],
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
describe('add and edit student profiles', () => {
  it('offers only Years 1 to 5 in the year selector', async () => {
    renderAt();
    const year = await screen.findByLabelText('Year');
    expect(
      Array.from(
        year.querySelectorAll('option'),
        (option) => option.textContent,
      ),
    ).toEqual([
      'Select year',
      'Year 1',
      'Year 2',
      'Year 3',
      'Year 4',
      'Year 5',
    ]);
  });
  it('protects browser back navigation and remains usable in StrictMode', async () => {
    window.history.replaceState({}, '', '/dashboard/students');
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    await userEvent.click(
      await screen.findByRole('link', { name: 'Add student' }),
    );
    await fillCreate();
    await act(async () => {
      window.history.back();
    });
    expect(await screen.findByRole('alertdialog')).toBeVisible();
    await userEvent.click(
      screen.getByRole('button', { name: 'Discard changes' }),
    );
    expect(
      await screen.findByRole('link', { name: 'View Alex Morgan' }),
    ).toBeVisible();
    expect(createStudentByEmail).not.toHaveBeenCalled();
  });
  it.each(['admin', 'warden'] as const)(
    'allows %s creation without provisioning credentials',
    async (role) => {
      vi.mocked(restoreStaffSession).mockResolvedValue({
        user_id: 'staff',
        firebase_uid: 'staff-uid',
        email: 'staff@example.com',
        role,
        is_active: true,
      });
      renderAt('/dashboard/students/new?registration=existing&q=Alex');
      await fillCreate();
      await userEvent.click(
        screen.getByRole('button', { name: 'Create profile' }),
      );
      expect(await screen.findByText('Student profile created.')).toBeVisible();
      expect(window.location.search).toBe('?q=Alex');
      expect(createStudentByEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          email: studentFixture.email,
          full_name: 'Alex Morgan',
          guardians: [
            {
              name: 'Robin Morgan',
              relationship: 'Parent',
              contact_phone: '+94771111111',
            },
          ],
        }),
        'staff-uid',
        expect.any(AbortSignal),
      );
      expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
    },
  );
  it('prefills edits and submits only editable details', async () => {
    renderAt(`/dashboard/students/${studentFixture.student_id}/edit?year=2`);
    expect(await screen.findByLabelText('Full name')).toHaveValue(
      'Alex Morgan',
    );
    expect(screen.getByLabelText('Guardian 1 name')).toHaveValue(
      'Robin Morgan',
    );
    expect(screen.queryByLabelText('University email')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Full name'), {
      target: { value: 'Alex Updated' },
    });
    vi.mocked(getStudent).mockResolvedValue({
      ...studentFixture,
      full_name: 'Alex Updated',
    });
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Student profile updated.')).toBeVisible();
    expect(
      await screen.findByRole('heading', { name: 'Alex Updated' }),
    ).toBeVisible();
    const body = vi.mocked(updateStudent).mock.calls[0][1];
    expect(body).not.toHaveProperty('user_id');
    expect(body).not.toHaveProperty('email');
    expect(body.guardians[0]).not.toHaveProperty('guardian_id');
  });
  it('blocks invalid forms, focuses the first error and makes no API call', async () => {
    renderAt();
    await screen.findByLabelText('University email');
    await userEvent.click(
      screen.getByRole('button', { name: 'Create profile' }),
    );
    expect(screen.getByLabelText('University email')).toHaveFocus();
    expect(screen.getByLabelText('University email')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.getByText('Choose a year between 1 and 5.')).toBeVisible();
    expect(createStudentByEmail).not.toHaveBeenCalled();
  });
  it('adds/removes guardians while retaining at least one and enforcing ten', async () => {
    renderAt();
    await screen.findByLabelText('University email');
    expect(
      screen.getByRole('button', { name: 'Remove guardian 1' }),
    ).toBeDisabled();
    for (let i = 1; i < 10; i++)
      await userEvent.click(
        screen.getByRole('button', { name: 'Add guardian' }),
      );
    expect(screen.getByRole('button', { name: 'Add guardian' })).toBeDisabled();
    await userEvent.click(
      screen.getByRole('button', { name: 'Remove guardian 2' }),
    );
    expect(screen.getByRole('button', { name: 'Add guardian' })).toBeEnabled();
  });
  it.each([
    ['duplicate', 'Already exists'],
    ['account', 'Active account required'],
    ['unavailable', 'Unable to save'],
  ])(
    'preserves values after %s and allows correction/resubmission',
    async (kind, message) => {
      vi.mocked(createStudentByEmail).mockRejectedValueOnce(
        new StudentRequestError(
          kind as 'duplicate' | 'account' | 'unavailable',
          message,
        ),
      );
      renderAt();
      await fillCreate();
      await userEvent.click(
        screen.getByRole('button', { name: 'Create profile' }),
      );
      await screen.findByRole('alert');
      expect(screen.getByLabelText('Full name')).toHaveValue('Alex Morgan');
      await userEvent.click(
        screen.getByRole('button', { name: 'Create profile' }),
      );
      expect(await screen.findByText('Student profile created.')).toBeVisible();
    },
  );
  it('prevents repeated pending saves', async () => {
    let resolve!: (value: typeof studentFixture) => void;
    vi.mocked(createStudentByEmail).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    renderAt();
    await fillCreate();
    await userEvent.dblClick(
      screen.getByRole('button', { name: 'Create profile' }),
    );
    expect(createStudentByEmail).toHaveBeenCalledOnce();
    expect(screen.getByLabelText('Full name')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await act(async () => resolve(studentFixture));
    await screen.findByText('Student profile created.');
  });
  it('warns before Cancel and internal navigation; keeps changes until discarded', async () => {
    renderAt();
    await fillCreate();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('alertdialog')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByLabelText('Full name')).toHaveValue('Alex Morgan');
    await userEvent.click(screen.getByRole('link', { name: 'Students' }));
    expect(await screen.findByRole('alertdialog')).toBeVisible();
    await userEvent.click(
      screen.getByRole('button', { name: 'Discard changes' }),
    );
    await screen.findByRole('link', { name: 'View Alex Morgan' });
    expect(createStudentByEmail).not.toHaveBeenCalled();
  });
  it('warns on browser refresh and cancels a clean edit without saving', async () => {
    const view = renderAt();
    await fillCreate();
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    view.unmount();
    renderAt(`/dashboard/students/${studentFixture.student_id}/edit`);
    await screen.findByLabelText('Full name');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(
      await screen.findByRole('heading', { name: 'Alex Morgan' }),
    ).toBeVisible();
    expect(updateStudent).not.toHaveBeenCalled();
  });
  it('handles a missing edit profile and signed-out access', async () => {
    vi.mocked(getStudent).mockRejectedValue(
      new StudentRequestError('not-found', 'Student profile not found.'),
    );
    const view = renderAt('/dashboard/students/not-an-id/edit');
    expect(await screen.findByRole('alert')).toHaveTextContent('not found');
    expect(screen.queryByLabelText('Full name')).not.toBeInTheDocument();
    view.unmount();
    vi.mocked(restoreStaffSession).mockResolvedValue(null);
    renderAt();
    await screen.findByRole('heading', { name: 'Sign in to HostelHive.' });
    expect(createStudentByEmail).not.toHaveBeenCalled();
  });
  it.each(['forbidden', 'session'] as const)(
    'blocks saving after %s rejection',
    async (kind) => {
      vi.mocked(createStudentByEmail).mockRejectedValue(
        new StudentRequestError(kind, 'Access rejected.'),
      );
      renderAt();
      await fillCreate();
      await userEvent.click(
        screen.getByRole('button', { name: 'Create profile' }),
      );
      await screen.findByRole('alert');
      expect(
        screen.getByRole('button', { name: 'Create profile' }),
      ).toBeDisabled();
      if (kind === 'session') {
        await userEvent.click(
          screen.getByRole('button', { name: 'Sign in again' }),
        );
        await screen.findByRole('heading', { name: 'Sign in to HostelHive.' });
      }
    },
  );
  it('ignores late save results after unmount', async () => {
    let resolve!: (value: typeof studentFixture) => void;
    vi.mocked(createStudentByEmail).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const view = renderAt();
    await fillCreate();
    await userEvent.click(
      screen.getByRole('button', { name: 'Create profile' }),
    );
    const signal = vi.mocked(createStudentByEmail).mock.calls[0][2];
    view.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => resolve(studentFixture));
    await waitFor(() =>
      expect(
        screen.queryByText('Student profile created.'),
      ).not.toBeInTheDocument(),
    );
  });
});
