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
import { beforeAll, afterAll, beforeEach, expect, it, vi } from 'vitest';
import StaffManagementPage from './StaffManagementPage';
import { AuthContext, type AuthContextValue } from '../../auth/auth.context';
import { getStaff, listStaff, saveStaff, StaffError } from '../api/staff.api';
import {
  staffProfile as profile,
  staffPage as page,
} from '../../../test/fixtures/staffProfiles';
vi.mock('../api/staff.api', async (original) => ({
  ...(await original<typeof import('../api/staff.api')>()),
  getStaff: vi.fn(),
  listStaff: vi.fn(),
  saveStaff: vi.fn(),
}));
const get = vi.mocked(getStaff);
const list = vi.mocked(listStaff);
const save = vi.mocked(saveStaff);
const verify = vi.fn();
const signOut = vi.fn();
let auth: AuthContextValue;
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
  auth = {
    account: {
      firebase_uid: 'admin-uid',
      user_id: 'admin-id',
      email: 'admin@example.edu',
      role: 'admin',
      is_active: true,
    },
    status: 'authenticated',
    busy: false,
    message: '',
    verifiedPath: '/dashboard/staff',
    retry: verify,
    signOut,
    signIn: vi.fn(),
  };
  verify.mockResolvedValue(undefined);
  signOut.mockResolvedValue(undefined);
  get.mockResolvedValue(profile);
  list.mockResolvedValue(page());
  save.mockImplementation(async (_, details) => ({ ...profile, ...details }));
});
const detailURL = `/dashboard/staff/${profile.user_id}`;
function mount(path = '/dashboard/staff') {
  const router = createMemoryRouter(
    [
      { path: '/dashboard/staff', element: <StaffManagementPage /> },
      { path: '/dashboard/staff/:userID', element: <StaffManagementPage /> },
      { path: '/elsewhere', element: <h1>Other page</h1> },
    ],
    { initialEntries: [path] },
  );
  const tree = () => (
    <AuthContext.Provider value={auth}>
      <RouterProvider router={router} />
    </AuthContext.Provider>
  );
  const view = render(tree());
  return { ...view, router, updateAuth: () => view.rerender(tree()) };
}
async function edit() {
  const button = await screen.findByRole('button', { name: 'Edit profile' });
  button.focus();
  fireEvent.click(button);
  return screen.getByRole('dialog');
}
const changeName = (name = 'Updated Warden') =>
  fireEvent.change(screen.getByLabelText('Full name'), {
    target: { value: name },
  });
const escape = (dialog: HTMLElement) =>
  fireEvent(dialog, new Event('cancel', { bubbles: true, cancelable: true }));
it('shows a real directory with backend account roles and access', async () => {
  mount();
  expect(screen.getByRole('status')).toHaveTextContent(
    'Loading staff directory',
  );
  expect(
    await screen.findByRole('link', { name: profile.full_name }),
  ).toHaveAttribute('href', detailURL);
  expect(
    screen.getByRole('region', { name: 'Staff directory' }),
  ).toHaveTextContent('Senior Warden');
  expect(screen.getByText('Active', { exact: true })).toBeVisible();
  expect(list).toHaveBeenCalledWith('admin-uid', expect.any(AbortSignal), 0);
});
it('edits the selected directory row and keeps pagination and other rows', async () => {
  const other = {
    ...profile,
    staff_id: '60000000-0000-4000-8000-000000000002',
    user_id: '70000000-0000-4000-8000-000000000002',
    full_name: 'Another Warden',
  };
  list.mockResolvedValue(page([other, profile], 20));
  const { router } = mount('/dashboard/staff?offset=20');
  fireEvent.click(
    await screen.findByRole('button', {
      name: `Edit profile for ${profile.full_name}`,
    }),
  );
  expect(screen.getByLabelText('Full name')).toHaveValue(profile.full_name);
  changeName('Updated Warden');
  fireEvent.click(screen.getByText('Save changes'));
  await screen.findByText('Staff profile saved and confirmed.');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Updated Warden' })).toHaveAttribute(
    'href',
    `${detailURL}?offset=20`,
  );
  expect(screen.getByRole('link', { name: other.full_name })).toBeVisible();
  expect(router.state.location.search).toBe('?offset=20');
  expect(save).toHaveBeenCalledWith(
    profile,
    { full_name: 'Updated Warden', designation: profile.designation },
    'admin-uid',
    expect.any(AbortSignal),
  );
});
it('does not offer directory editing for a historical student-role profile', async () => {
  list.mockResolvedValue(page([{ ...profile, role: 'student' }]));
  mount();
  await screen.findByRole('link', { name: profile.full_name });
  expect(
    screen.queryByRole('button', { name: /Edit profile/ }),
  ).not.toBeInTheDocument();
  expect(screen.getByText('Review role in User management')).toBeVisible();
});
it.each(['warden', 'student'] as const)(
  'denies %s without reading profiles',
  (role) => {
    auth = { ...auth, account: { ...auth.account!, role } };
    mount();
    expect(screen.getByRole('alert')).toHaveTextContent('active Admin');
    expect(list).not.toHaveBeenCalled();
  },
);
it('denies signed-out users', () => {
  auth = { ...auth, account: null };
  mount();
  expect(list).not.toHaveBeenCalled();
});
it('rejects invalid directory filters and resets pagination', async () => {
  mount('/dashboard/staff?q=unsupported');
  expect(list).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Return to first page'));
  await screen.findByText(profile.full_name);
});
it('rejects invalid target IDs without requests', () => {
  mount('/dashboard/staff/me');
  expect(get).not.toHaveBeenCalled();
  expect(
    screen.getByRole('link', { name: 'Return to staff directory' }),
  ).toHaveAttribute('href', '/dashboard/staff');
});
it.each([0, 20])('shows an empty page at %s', async (offset) => {
  list.mockResolvedValue(page([], offset));
  mount(`/dashboard/staff?offset=${offset}`);
  expect(
    await screen.findByText(
      offset ? /No staff profiles on this page/ : 'No staff profiles found.',
    ),
  ).toBeVisible();
  expect(screen.getByText('Next')).toBeDisabled();
});
it('paginates and preserves the directory page in profile links and the return link', async () => {
  list
    .mockResolvedValueOnce(page([profile], 0, true))
    .mockResolvedValueOnce(page([profile], 20))
    .mockResolvedValueOnce(page());
  const { router } = mount();
  fireEvent.click(await screen.findByText('Next'));
  await screen.findByText('Page 2');
  fireEvent.click(screen.getByRole('link', { name: profile.full_name }));
  await screen.findByRole('heading', { name: 'Staff profile' });
  expect(get).toHaveBeenCalledWith(
    profile.user_id,
    'admin-uid',
    expect.any(AbortSignal),
  );
  expect(
    screen.getByRole('link', { name: 'Back to staff directory' }),
  ).toHaveAttribute('href', '/dashboard/staff?offset=20');
  fireEvent.click(screen.getByText('Back to staff directory'));
  await screen.findByText('Page 2');
  fireEvent.click(screen.getByText('Previous'));
  await waitFor(() => expect(router.state.location.search).toBe(''));
  expect(list).toHaveBeenLastCalledWith(
    'admin-uid',
    expect.any(AbortSignal),
    0,
  );
});
it('retries failed reads and refreshes manually', async () => {
  list.mockRejectedValueOnce(new Error('Offline'));
  mount();
  fireEvent.click(await screen.findByText('Retry staff directory'));
  await screen.findByText(profile.full_name);
  fireEvent.click(screen.getByText('Refresh staff directory'));
  await waitFor(() => expect(list).toHaveBeenCalledTimes(3));
});
it('shows details with read-only account information and timestamps', async () => {
  mount(detailURL);
  expect(
    await screen.findByRole('heading', { name: profile.full_name }),
  ).toBeVisible();
  expect(screen.getByText(profile.user_id)).toBeVisible();
  expect(screen.getByText(profile.staff_id)).toBeVisible();
  expect(document.querySelector('time')).toHaveAttribute(
    'dateTime',
    profile.updated_at,
  );
  const dialog = await edit();
  expect(within(dialog).getByLabelText('Full name')).toHaveFocus();
  expect(within(dialog).getAllByRole('textbox')).toHaveLength(2);
  expect(within(dialog).getByText('Save changes')).toBeDisabled();
  fireEvent.click(within(dialog).getByText('Cancel'));
  expect(screen.getByText('Edit profile')).toHaveFocus();
  expect(save).not.toHaveBeenCalled();
});
it('shows inactive historical profiles without offering edits to student accounts', async () => {
  get.mockResolvedValue({
    ...profile,
    role: 'student',
    is_active: false,
    full_name: '',
    designation: '',
  });
  mount(detailURL);
  expect(
    await screen.findByRole('heading', { name: 'Staff member' }),
  ).toBeVisible();
  expect(screen.getByText('Inactive')).toBeVisible();
  expect(screen.queryByText('Edit profile')).not.toBeInTheDocument();
  expect(screen.getByText(/no longer has a staff role/)).toBeVisible();
});
it('provides missing profile recovery', async () => {
  get.mockRejectedValueOnce(
    new StaffError('missing', 'Staff profile not found.'),
  );
  mount(detailURL);
  expect(await screen.findByRole('alert')).toHaveTextContent('not found');
  fireEvent.click(screen.getByText('Retry staff profile'));
  await screen.findByText('Edit profile');
});
it('validates required fields and focuses the first error', async () => {
  mount(detailURL);
  await edit();
  changeName('');
  fireEvent.change(screen.getByLabelText('Designation'), {
    target: { value: ' ' },
  });
  fireEvent.click(screen.getByText('Save changes'));
  expect(screen.getAllByRole('alert')).toHaveLength(2);
  expect(screen.getByLabelText('Full name')).toHaveFocus();
  expect(save).not.toHaveBeenCalled();
});
it('saves confirmed fields and displays the server response', async () => {
  mount(detailURL);
  await edit();
  changeName();
  fireEvent.click(screen.getByText('Save changes'));
  await screen.findByText('Staff profile saved and confirmed.');
  expect(screen.getByRole('heading', { name: 'Updated Warden' })).toBeVisible();
  expect(save).toHaveBeenCalledWith(
    profile,
    { full_name: 'Updated Warden', designation: profile.designation },
    'admin-uid',
    expect.any(AbortSignal),
  );
});
it('preserves values after a known validation failure', async () => {
  save.mockRejectedValueOnce(new StaffError('invalid', 'Input rejected'));
  mount(detailURL);
  await edit();
  changeName();
  fireEvent.click(screen.getByText('Save changes'));
  await screen.findByText('Input rejected');
  expect(screen.getByLabelText('Full name')).toHaveValue('Updated Warden');
  changeName('Corrected Warden');
  expect(screen.queryByText('Input rejected')).not.toBeInTheDocument();
});
it('prevents duplicate saves and closing while pending', async () => {
  let resolve!: (value: typeof profile) => void;
  save.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  mount(detailURL);
  const dialog = await edit();
  changeName();
  fireEvent.click(screen.getByText('Save changes'));
  fireEvent.submit(dialog.querySelector('form')!);
  escape(dialog);
  expect(save).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Cancel')).toBeDisabled();
  await act(async () => resolve({ ...profile, full_name: 'Updated Warden' }));
  await screen.findByText('Staff profile saved and confirmed.');
});
it('protects dirty cancellation, Escape and browser unload', async () => {
  mount(detailURL);
  const dialog = await edit();
  changeName();
  const unload = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(unload);
  expect(unload.defaultPrevented).toBe(true);
  fireEvent.click(screen.getByText('Cancel'));
  expect(screen.getByText('Keep editing')).toHaveFocus();
  escape(dialog);
  expect(screen.getByLabelText('Full name')).toHaveValue('Updated Warden');
  escape(dialog);
  fireEvent.click(screen.getByText('Discard changes'));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(save).not.toHaveBeenCalled();
});
it('blocks route navigation until changes are explicitly discarded', async () => {
  const { router } = mount(detailURL);
  await edit();
  changeName();
  await act(async () => {
    await router.navigate('/elsewhere');
  });
  expect(
    screen.getByRole('heading', { name: 'Discard unsaved changes?' }),
  ).toBeVisible();
  fireEvent.click(screen.getByText('Keep editing'));
  expect(router.state.location.pathname).toBe(detailURL);
  await act(async () => {
    await router.navigate('/elsewhere');
  });
  fireEvent.click(screen.getByText('Discard changes'));
  await screen.findByText('Other page');
});
it('requires a profile check after an uncertain save, then confirms a matching saved profile', async () => {
  save.mockRejectedValue(new StaffError('unavailable', 'Unavailable'));
  mount(detailURL);
  await edit();
  changeName();
  fireEvent.click(screen.getByText('Save changes'));
  await screen.findByText('Check current profile');
  expect(screen.getByLabelText('Full name')).toBeDisabled();
  expect(screen.queryByText('Save changes')).not.toBeInTheDocument();
  get.mockResolvedValue({ ...profile, full_name: 'Updated Warden' });
  fireEvent.click(screen.getByText('Check current profile'));
  await screen.findByText('Staff profile saved and confirmed.');
  expect(save).toHaveBeenCalledTimes(1);
});
it('preserves a draft and shows differing current values before allowing another save', async () => {
  save.mockRejectedValueOnce(new Error('Network'));
  mount(detailURL);
  await edit();
  changeName();
  fireEvent.click(screen.getByText('Save changes'));
  await screen.findByText('Check current profile');
  get.mockResolvedValue({ ...profile, full_name: 'Concurrent edit' });
  fireEvent.click(screen.getByText('Check current profile'));
  await screen.findByText('Concurrent edit');
  expect(screen.getByLabelText('Full name')).toHaveValue('Updated Warden');
  expect(screen.getByText('Save changes')).toBeEnabled();
  fireEvent.click(screen.getByText('Save changes'));
  await screen.findByText('Staff profile saved and confirmed.');
});
it('keeps the draft locked if checking an uncertain save fails', async () => {
  save.mockRejectedValue(new Error('Network'));
  mount(detailURL);
  await edit();
  changeName();
  fireEvent.click(screen.getByText('Save changes'));
  await screen.findByText('Check current profile');
  get.mockRejectedValue(new Error('Offline'));
  fireEvent.click(screen.getByText('Check current profile'));
  await screen.findByText(/current profile could not be checked/);
  expect(screen.getByLabelText('Full name')).toBeDisabled();
});
it.each(['missing', 'conflict'] as const)(
  'requires a refresh after %s',
  async (kind) => {
    save.mockRejectedValue(new StaffError(kind, 'Profile no longer editable'));
    mount(detailURL);
    await edit();
    changeName();
    fireEvent.click(screen.getByText('Save changes'));
    await screen.findByText('Profile no longer editable');
    fireEvent.click(screen.getByText('Close and refresh profile'));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  },
);
it('handles a changed target role during uncertain-result verification', async () => {
  save.mockRejectedValue(new Error('Network'));
  mount(detailURL);
  await edit();
  changeName();
  fireEvent.click(screen.getByText('Save changes'));
  await screen.findByText('Check current profile');
  get.mockResolvedValue({ ...profile, role: 'student' });
  fireEvent.click(screen.getByText('Check current profile'));
  await screen.findByText(/no longer has a staff role\. Close/);
  expect(screen.queryByText('Save changes')).not.toBeInTheDocument();
});
it('explains uncertain saves when discarding and refreshes the profile', async () => {
  save.mockRejectedValue(new Error('Network'));
  mount(detailURL);
  await edit();
  changeName();
  fireEvent.click(screen.getByText('Save changes'));
  await screen.findByText('Check current profile');
  fireEvent.click(screen.getByText('Cancel'));
  expect(screen.getByText(/does not undo a saved change/)).toBeVisible();
  fireEvent.click(screen.getByText('Discard changes'));
  await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
});
it.each(['session', 'forbidden'] as const)(
  'hides all profile data on mutation %s and offers verification',
  async (kind) => {
    save.mockRejectedValue(new StaffError(kind, 'Access denied'));
    mount(detailURL);
    await edit();
    changeName();
    fireEvent.click(screen.getByText('Save changes'));
    await screen.findByText('Access denied');
    expect(screen.queryByText(profile.email)).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Check access again'));
    await screen.findByText('Edit profile');
    expect(verify).toHaveBeenCalledTimes(1);
  },
);
it('handles access-check and sign-out failures with data hidden', async () => {
  list.mockRejectedValue(new StaffError('forbidden', 'Denied'));
  verify.mockRejectedValue(new Error('Offline'));
  mount();
  fireEvent.click(await screen.findByText('Check access again'));
  await screen.findByText(/Access could not be verified/);
  signOut.mockRejectedValueOnce(new Error('Offline'));
  fireEvent.click(screen.getByText('Sign out'));
  await screen.findByText(/Sign out could not be confirmed/);
  fireEvent.click(screen.getByText('Sign out'));
  await waitFor(() => expect(signOut).toHaveBeenCalledTimes(2));
});
it('clears profile data immediately on actor changes and ignores late reads', async () => {
  let resolve!: (value: typeof profile) => void;
  get.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const view = mount(detailURL);
  const signal = get.mock.calls[0][2];
  auth = {
    ...auth,
    account: { ...auth.account!, firebase_uid: 'another-admin' },
  };
  view.updateAuth();
  await screen.findByText('Edit profile');
  expect(signal.aborted).toBe(true);
  await act(async () =>
    resolve({ ...profile, full_name: 'Stale identity data' }),
  );
  expect(screen.queryByText('Stale identity data')).not.toBeInTheDocument();
  auth = { ...auth, account: { ...auth.account!, role: 'warden' } };
  view.updateAuth();
  expect(screen.queryByText(profile.email)).not.toBeInTheDocument();
});
it('aborts in-flight saves on unmount and ignores late completion', async () => {
  let resolve!: (value: typeof profile) => void;
  save.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const view = mount(detailURL);
  await edit();
  changeName();
  fireEvent.click(screen.getByText('Save changes'));
  const signal = save.mock.calls[0][3];
  view.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => resolve({ ...profile, full_name: 'Updated Warden' }));
  expect(get).toHaveBeenCalledTimes(1);
});
it('supports keyboard editing and clean Escape cancellation', async () => {
  const keyboard = userEvent.setup();
  mount(detailURL);
  const dialog = await edit();
  await keyboard.tab();
  expect(screen.getByLabelText('Designation')).toHaveFocus();
  escape(dialog);
  expect(screen.getByText('Edit profile')).toHaveFocus();
});
