import { beforeAll, beforeEach, afterAll, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import FacultyManagementPage from './FacultyManagementPage';
import useAuth from '../../auth/hooks/useAuth';
import {
  changeFaculty,
  listFaculties,
  FacultyError,
} from '../api/faculties.api';
import { faculty, facultyPage } from '../../../test/fixtures/faculties';
vi.mock('../../auth/hooks/useAuth', () => ({ default: vi.fn() }));
vi.mock('../api/faculties.api', async (original) => ({
  ...(await original<typeof import('../api/faculties.api')>()),
  listFaculties: vi.fn(),
  changeFaculty: vi.fn(),
}));
const list = vi.mocked(listFaculties);
const change = vi.mocked(changeFaculty);
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
  list.mockResolvedValue(facultyPage);
  change.mockResolvedValue(faculty);
});
function mount() {
  const router = createMemoryRouter([
    { path: '/', element: <FacultyManagementPage /> },
  ]);
  return { ...render(<RouterProvider router={router} />), router };
}
it('shows the directory to Wardens without mutation controls', async () => {
  vi.mocked(useAuth).mockReturnValue(auth('warden'));
  mount();
  await screen.findByRole('rowheader', { name: 'Science' });
  expect(
    screen.queryByRole('button', { name: /Add faculty/ }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: /Rename/ }),
  ).not.toBeInTheDocument();
  expect(change).not.toHaveBeenCalled();
});
it('denies students without fetching faculty records', () => {
  vi.mocked(useAuth).mockReturnValue(auth('student'));
  mount();
  expect(screen.getByRole('alert')).toBeVisible();
  expect(list).not.toHaveBeenCalled();
});
it('validates and creates a faculty, then refreshes the directory', async () => {
  mount();
  await screen.findByRole('rowheader', { name: 'Science' });
  await userEvent.click(screen.getByRole('button', { name: /Add faculty/ }));
  const dialog = screen.getByRole('dialog');
  await userEvent.click(
    within(dialog).getByRole('button', { name: 'Add faculty' }),
  );
  expect(within(dialog).getByRole('alert')).toHaveTextContent(
    'Enter a faculty name',
  );
  expect(change).not.toHaveBeenCalled();
  await userEvent.type(
    within(dialog).getByLabelText('Faculty name'),
    'Science',
  );
  await userEvent.click(
    within(dialog).getByRole('button', { name: 'Add faculty' }),
  );
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
  expect(change).toHaveBeenCalledWith(
    'create',
    'admin',
    expect.any(AbortSignal),
    undefined,
    'Science',
  );
  expect(list).toHaveBeenCalledTimes(2);
});
it.each(['rename', 'deactivate', 'activate'] as const)(
  'confirms the %s action before writing',
  async (action) => {
    list.mockResolvedValue({
      ...facultyPage,
      items: [{ ...faculty, is_active: action !== 'activate' }],
    });
    mount();
    await screen.findByRole('rowheader', { name: 'Science' });
    const label = action[0].toUpperCase() + action.slice(1);
    await userEvent.click(
      screen.getByRole('button', { name: label + ' Science' }),
    );
    expect(change).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog');
    if (action === 'rename') {
      await userEvent.clear(within(dialog).getByLabelText('Faculty name'));
      await userEvent.type(
        within(dialog).getByLabelText('Faculty name'),
        'Applied Science',
      );
    }
    await userEvent.click(
      within(dialog).getByRole('button', { name: label + ' faculty' }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(change.mock.calls[0][0]).toBe(action);
    expect(change.mock.calls[0][3]).toBe(faculty.faculty_id);
  },
);
it('keeps duplicate errors editable and prevents unsafe retries after an unknown result', async () => {
  change
    .mockRejectedValueOnce(new FacultyError('conflict', 'Name reserved'))
    .mockRejectedValueOnce(new FacultyError('unavailable', 'Unknown'));
  mount();
  await screen.findByRole('rowheader', { name: 'Science' });
  await userEvent.click(screen.getByRole('button', { name: /Add faculty/ }));
  const dialog = screen.getByRole('dialog');
  await userEvent.type(
    within(dialog).getByLabelText('Faculty name'),
    'Science',
  );
  await userEvent.click(
    within(dialog).getByRole('button', { name: 'Add faculty' }),
  );
  await screen.findByText('Name reserved');
  expect(within(dialog).getByLabelText('Faculty name')).toBeEnabled();
  await userEvent.click(
    within(dialog).getByRole('button', { name: 'Add faculty' }),
  );
  await screen.findByText(/This change may have completed/);
  expect(
    within(dialog).getByRole('button', { name: 'Add faculty' }),
  ).toBeDisabled();
  await userEvent.click(
    within(dialog).getByRole('button', { name: 'Close and refresh' }),
  );
  await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  expect(change).toHaveBeenCalledTimes(2);
});
it('clears private records when a refresh denies access', async () => {
  mount();
  await screen.findByRole('rowheader', { name: 'Science' });
  list.mockRejectedValue(new FacultyError('forbidden', 'Access denied'));
  await userEvent.click(
    screen.getByRole('button', { name: 'Refresh faculties' }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent('Access denied');
  expect(
    screen.queryByRole('rowheader', { name: 'Science' }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Add faculty/ })).toBeDisabled();
});
it('supports status filters and pagination with the applied filter', async () => {
  list.mockImplementation(async (_uid, _signal, _filter, offset = 0) => ({
    ...facultyPage,
    offset,
    has_more: offset === 0,
  }));
  mount();
  await screen.findByRole('rowheader', { name: 'Science' });
  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  await waitFor(() =>
    expect(list).toHaveBeenLastCalledWith(
      'admin',
      expect.any(AbortSignal),
      'all',
      20,
    ),
  );
  await userEvent.selectOptions(screen.getByLabelText('Status'), 'false');
  await waitFor(() =>
    expect(list).toHaveBeenLastCalledWith(
      'admin',
      expect.any(AbortSignal),
      'false',
      0,
    ),
  );
});
it('prevents duplicate submission while pending and aborts requests on unmount', async () => {
  let resolve!: (value: typeof faculty) => void;
  change.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const view = mount();
  await screen.findByRole('rowheader', { name: 'Science' });
  await userEvent.click(screen.getByRole('button', { name: /Add faculty/ }));
  const dialog = screen.getByRole('dialog');
  await userEvent.type(
    within(dialog).getByLabelText('Faculty name'),
    'Science',
  );
  await userEvent.dblClick(
    within(dialog).getByRole('button', { name: 'Add faculty' }),
  );
  expect(change).toHaveBeenCalledTimes(1);
  expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
  const signal = change.mock.calls[0][2];
  view.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => resolve(faculty));
});
