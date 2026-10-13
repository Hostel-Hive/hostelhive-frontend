import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../../app/App';
import {
  restoreStaffSession,
  subscribeStaffSession,
  logout,
} from '../../auth/api/auth.api';
import {
  listStudents,
  getStudent,
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
  listStudents: vi.fn(),
  getStudent: vi.fn(),
}));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(restoreStaffSession).mockResolvedValue({
    user_id: 'staff-1',
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
  vi.mocked(listStudents).mockResolvedValue(studentPageFixture);
  vi.mocked(getStudent).mockResolvedValue(studentFixture);
});
function renderAt(path = '/dashboard/students') {
  window.history.replaceState({}, '', path);
  return render(<App />);
}
describe('student directory and profiles', () => {
  it.each(['admin', 'warden'] as const)(
    'allows verified %s accounts to browse real-response fields',
    async (role) => {
      vi.mocked(restoreStaffSession).mockResolvedValue({
        user_id: 'staff',
        firebase_uid: 'staff-uid',
        email: 'staff@example.com',
        role,
        is_active: true,
      });
      renderAt();
      expect(
        await screen.findByRole(
          'link',
          { name: 'View Alex Morgan' },
          { timeout: 5000 },
        ),
      ).toBeVisible();
      expect(screen.getByRole('link', { name: 'Students' })).toHaveAttribute(
        'aria-current',
        'page',
      );
      expect(screen.getByText('STU-1042')).toBeVisible();
      expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
      expect(listStudents).toHaveBeenCalledWith(
        expect.any(URLSearchParams),
        'staff-uid',
        expect.any(AbortSignal),
      );
      expect(screen.queryByText('Attendance')).not.toBeInTheDocument();
    },
  );
  it('redirects signed-out access without fetching private records', async () => {
    vi.mocked(restoreStaffSession).mockResolvedValue(null);
    renderAt(`/dashboard/students/${studentFixture.student_id}`);
    expect(
      await screen.findByRole('heading', { name: 'Sign in to HostelHive.' }),
    ).toBeVisible();
    expect(listStudents).not.toHaveBeenCalled();
    expect(getStudent).not.toHaveBeenCalled();
  });
  it('applies filters, paginates, preserves the URL through a profile and clears filters', async () => {
    const user = userEvent.setup();
    vi.mocked(listStudents).mockImplementation(async (params) => ({
      ...studentPageFixture,
      offset: Number(params.get('offset') ?? 0),
      has_more: true,
    }));
    renderAt();
    await screen.findByRole('link', { name: 'View Alex Morgan' });
    await user.type(screen.getByLabelText('Search students'), 'Alex');
    await user.type(screen.getByLabelText('Faculty'), 'Science');
    await user.selectOptions(screen.getByLabelText('Year'), '2');
    await user.click(screen.getByRole('button', { name: 'Apply filters' }));
    await user.click(await screen.findByRole('button', { name: 'Next' }));
    await screen.findByText('Page 2');
    expect(window.location.search).toContain('offset=20');
    await user.click(screen.getByRole('link', { name: 'View Alex Morgan' }));
    expect(
      await screen.findByRole('heading', { name: 'Alex Morgan' }),
    ).toBeVisible();
    expect(screen.getByText('Robin Morgan')).toBeVisible();
    expect(screen.getByText('alex@example.com')).toBeVisible();
    await user.click(screen.getByRole('link', { name: 'Back to students' }));
    await screen.findByRole('link', { name: 'View Alex Morgan' });
    expect(screen.getByLabelText('Search students')).toHaveValue('Alex');
    expect(screen.getByLabelText('Faculty')).toHaveValue('Science');
    expect(screen.getByLabelText('Year')).toHaveValue('2');
    expect(screen.getByText('Page 2')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Previous' }));
    await screen.findByText('Page 1');
    expect(window.location.search).not.toContain('offset');
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(window.location.search).toBe(''));
  });
  it.each([
    ['', 'No student records yet.'],
    ['?q=unmatched', 'No students match these filters.'],
    [
      '?offset=20',
      'No students on this page. Go to the previous page or clear filters.',
    ],
  ])('shows the appropriate empty state for %s', async (search, message) => {
    vi.mocked(listStudents).mockResolvedValue({
      ...studentPageFixture,
      students: [],
      offset: search.includes('offset') ? 20 : 0,
    });
    renderAt(`/dashboard/students${search}`);
    expect(await screen.findByText(message)).toBeVisible();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
  it('shows loading and lets the user retry a service failure', async () => {
    const user = userEvent.setup();
    let reject!: (error: Error) => void;
    vi.mocked(listStudents).mockReturnValueOnce(
      new Promise((_, no) => {
        reject = no;
      }),
    );
    renderAt();
    expect(await screen.findByText('Loading student records…')).toBeVisible();
    await act(async () => reject(new Error('private response')));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to load student records',
    );
    await user.click(screen.getByRole('button', { name: 'Retry loading' }));
    expect(
      await screen.findByRole('link', { name: 'View Alex Morgan' }),
    ).toBeVisible();
  });
  it('shows access denied without exposing a table or offering a blind retry', async () => {
    vi.mocked(listStudents).mockRejectedValue(
      new StudentRequestError(
        'forbidden',
        'You do not have permission to view these student records.',
      ),
    );
    renderAt();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'do not have permission',
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Retry loading' }),
    ).not.toBeInTheDocument();
  });
  it('clears the session through the existing sign-out flow after a rejected token', async () => {
    const user = userEvent.setup();
    vi.mocked(listStudents).mockRejectedValue(
      new StudentRequestError(
        'session',
        'Your session has expired. Please sign in again.',
      ),
    );
    renderAt();
    await user.click(
      await screen.findByRole('button', { name: 'Sign in again' }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Sign in to HostelHive.' }),
    ).toBeVisible();
    expect(logout).toHaveBeenCalledOnce();
  });
  it('handles invalid URL filters without claiming an empty directory', async () => {
    vi.mocked(listStudents).mockRejectedValue(
      new StudentRequestError(
        'invalid',
        'These directory filters are invalid. Clear the filters and try again.',
      ),
    );
    renderAt('/dashboard/students?year=999');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'filters are invalid',
    );
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeVisible();
  });
  it('handles profile not found and provides a safe directory return', async () => {
    vi.mocked(getStudent).mockRejectedValue(
      new StudentRequestError('not-found', 'Student profile not found.'),
    );
    renderAt('/dashboard/students/not-an-id?q=Alex');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Student profile not found',
    );
    expect(
      screen.getByRole('link', { name: 'Back to students' }),
    ).toHaveAttribute('href', '/dashboard/students?q=Alex');
  });
  it('renders inactive account and missing optional contact/guardian information', async () => {
    vi.mocked(getStudent).mockResolvedValue({
      ...studentFixture,
      account_active: false,
      guardians: undefined,
      contact_phone: '',
      faculty: '',
      email: '',
    });
    renderAt(`/dashboard/students/${studentFixture.student_id}`);
    await screen.findByRole('heading', { name: 'Alex Morgan' });
    expect(screen.getByText('Inactive')).toBeVisible();
    expect(screen.getAllByText('Not provided')).toHaveLength(3);
    expect(screen.getByText('No guardian details provided.')).toBeVisible();
  });
  it('ignores superseded requests and aborts them on filter change', async () => {
    const user = userEvent.setup();
    let resolve!: (data: typeof studentPageFixture) => void;
    let previousSignal!: AbortSignal;
    vi.mocked(listStudents).mockImplementationOnce((_params, _uid, signal) => {
      previousSignal = signal;
      return new Promise((done) => {
        resolve = done;
      });
    });
    renderAt();
    await screen.findByText('Loading student records…');
    await user.type(screen.getByLabelText('Search students'), 'Alex');
    await user.click(screen.getByRole('button', { name: 'Apply filters' }));
    await screen.findByRole('link', { name: 'View Alex Morgan' });
    expect(previousSignal.aborted).toBe(true);
    await act(async () =>
      resolve({
        ...studentPageFixture,
        students: [{ ...studentFixture, full_name: 'Stale Resident' }],
      }),
    );
    expect(screen.queryByText('Stale Resident')).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('table')).getByText('Alex Morgan'),
    ).toBeVisible();
  });
});
