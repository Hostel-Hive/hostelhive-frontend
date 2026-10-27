import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import StudentHomePage from './StudentHomePage';
import type { StudentView } from './StudentHomePage';
import useAuth from '../../auth/hooks/useAuth';
import {
  getOwnProfile,
  getOwnPhoto,
  getOwnQR,
  StudentPortalError,
} from '../api/student-portal.api';
import { ownStudentProfile as profile } from '../../../test/fixtures/ownStudentProfile';
import type { AuthContextValue } from '../../auth/auth.context';
import { getOwnAttendance } from '../api/own-attendance.api';
import { ownHistoryPage } from '../../../test/fixtures/ownAttendance';
vi.mock('../api/own-attendance.api', async (original) => ({
  ...(await original<typeof import('../api/own-attendance.api')>()),
  getOwnAttendance: vi.fn(),
}));
vi.mock('../../auth/hooks/useAuth', () => ({ default: vi.fn() }));
vi.mock('../api/student-portal.api', async (original) => ({
  ...(await original<typeof import('../api/student-portal.api')>()),
  getOwnProfile: vi.fn(),
  getOwnPhoto: vi.fn(),
  getOwnQR: vi.fn(),
}));
const NativeURL = URL;
const auth: AuthContextValue = {
  account: {
    user_id: 'user-id',
    firebase_uid: 'student-uid',
    email: profile.email,
    role: 'student',
    is_active: true,
  },
  status: 'authenticated',
  verifiedPath: '/student',
  message: '',
  busy: false,
  signIn: vi.fn(),
  signOut: vi.fn(),
  retry: vi.fn(),
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(useAuth).mockReturnValue(auth);
  vi.mocked(getOwnProfile).mockResolvedValue(profile);
  vi.mocked(getOwnAttendance).mockResolvedValue(ownHistoryPage());
  vi.mocked(getOwnPhoto).mockResolvedValue(
    new Blob(['photo'], { type: 'image/png' }),
  );
  vi.mocked(getOwnQR).mockResolvedValue(
    new Blob(['qr'], { type: 'image/png' }),
  );
  vi.stubGlobal(
    'URL',
    class extends NativeURL {
      static createObjectURL = vi.fn(() => 'blob:private-image');
      static revokeObjectURL = vi.fn();
    },
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function renderPage(view: StudentView = 'overview') {
  return render(<StudentHomePage view={view} />, { wrapper: MemoryRouter });
}
it('opens photo management from My profile and refreshes when it closes', async () => {
  const show = Object.getOwnPropertyDescriptor(
    HTMLDialogElement.prototype,
    'showModal',
  );
  const close = Object.getOwnPropertyDescriptor(
    HTMLDialogElement.prototype,
    'close',
  );
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
  const view = renderPage('profile');
  try {
    await userEvent.click(
      await screen.findByRole('button', { name: 'Add photo' }),
    );
    expect(
      await screen.findByRole('dialog', { name: 'Profile photo' }),
    ).toBeVisible();
    expect(screen.getByLabelText('Choose profile photo')).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(getOwnProfile).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  } finally {
    view.unmount();
    if (show)
      Object.defineProperty(HTMLDialogElement.prototype, 'showModal', show);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
    if (close)
      Object.defineProperty(HTMLDialogElement.prototype, 'close', close);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
  }
});
it('loads owned attendance on its page and marks the sidebar route active', async () => {
  render(<StudentHomePage view="attendance" />, {
    wrapper: ({ children }) => (
      <MemoryRouter initialEntries={['/student/attendance']}>
        {children}
      </MemoryRouter>
    ),
  });
  await screen.findByRole('table');
  expect(screen.getByRole('link', { name: 'Attendance' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  expect(getOwnAttendance).toHaveBeenCalledWith(
    'student-uid',
    expect.any(AbortSignal),
    { from: '', to: '', direction: '' },
    0,
  );
  expect(getOwnQR).not.toHaveBeenCalled();
  expect(getOwnPhoto).not.toHaveBeenCalled();
});
it('clears private portal content when attendance access is denied', async () => {
  vi.mocked(getOwnAttendance).mockRejectedValueOnce(
    new StudentPortalError('forbidden', 'Access denied'),
  );
  renderPage('attendance');
  await screen.findByRole('heading', {
    name: 'Student access needs verification',
  });
  expect(
    screen.queryByRole('region', { name: 'Attendance and movement history' }),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole('button', { name: 'Verify account access' }),
  );
  expect(auth.retry).toHaveBeenCalled();
});
async function ready(page: StudentView = 'qr') {
  const view = renderPage(page);
  await screen.findByRole('button', { name: /^Refresh(?: dashboard)?$/ });
  return view;
}
it('loads the owned profile and guardian details on the profile page', async () => {
  renderPage('profile');
  expect(screen.getByText('Loading your student dashboard…')).toBeVisible();
  await screen.findByRole('heading', { name: profile.full_name });
  expect(getOwnProfile).toHaveBeenCalledWith(
    'student-uid',
    expect.any(AbortSignal),
  );
  expect(screen.getByText('Example Guardian')).toBeVisible();
  expect(
    screen.queryByRole('region', { name: 'My accommodation' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Show QR code' }),
  ).not.toBeInTheDocument();
  expect(getOwnQR).not.toHaveBeenCalled();
  expect(getOwnPhoto).not.toHaveBeenCalled();
});
it('shows accommodation details on their own page', async () => {
  await ready('accommodation');
  const accommodation = screen.getByRole('region', {
    name: 'My accommodation',
  });
  expect(within(accommodation).getByText('Block A')).toBeVisible();
  expect(within(accommodation).getByText('101')).toBeVisible();
  expect(within(accommodation).getByText('B1')).toBeVisible();
  expect(
    screen.getByRole('navigation', { name: 'Student navigation' }),
  ).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Edit profile' }),
  ).not.toBeInTheDocument();
  expect(getOwnQR).not.toHaveBeenCalled();
  expect(getOwnPhoto).not.toHaveBeenCalled();
});
it('shows honest empty accommodation, guardians, photo and unknown presence states', async () => {
  vi.mocked(getOwnProfile).mockResolvedValue({
    ...profile,
    guardians: [],
    accommodation: null,
    presence: { status: 'UNKNOWN', updated_at: null },
  });
  const profileView = await ready('profile');
  expect(screen.getByText('No guardian details recorded.')).toBeVisible();
  expect(screen.getByLabelText('No profile photo')).toBeVisible();
  profileView.unmount();
  await ready('overview');
  expect(screen.getByText('Not assigned')).toBeVisible();
  expect(screen.getByText('Unknown')).toBeVisible();
  expect(screen.getByText('No scan recorded yet')).toBeVisible();
});
it('refreshes the backend snapshot and discards the previous allocation', async () => {
  await ready('overview');
  vi.mocked(getOwnProfile).mockResolvedValue({
    ...profile,
    accommodation: null,
    presence: { status: 'OUT', updated_at: '2026-10-20T11:00:00Z' },
  });
  await userEvent.click(
    screen.getByRole('button', { name: 'Refresh dashboard' }),
  );
  expect(await screen.findByText('Outside hostel')).toBeVisible();
  expect(screen.queryByText('Block A')).not.toBeInTheDocument();
  expect(getOwnProfile).toHaveBeenCalledTimes(2);
});
it.each(['not-found', 'unavailable'] as const)(
  'supports a clear %s profile state and retry',
  async (kind) => {
    vi.mocked(getOwnProfile).mockRejectedValueOnce(
      new StudentPortalError(kind, 'Profile could not be loaded.'),
    );
    renderPage('profile');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Profile could not be loaded',
    );
    expect(
      screen.queryByRole('button', { name: 'Show QR code' }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Retry dashboard' }),
    );
    expect(
      await screen.findByRole('heading', { name: 'My profile', level: 2 }),
    ).toBeVisible();
  },
);
it.each(['session', 'forbidden', 'setup'] as const)(
  'offers account verification and sign-in after %s denial',
  async (kind) => {
    vi.mocked(getOwnProfile).mockRejectedValue(
      new StudentPortalError(kind, 'Check your account access.'),
    );
    renderPage();
    await screen.findByRole('alert');
    expect(
      screen.queryByRole('heading', { name: 'My profile' }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Verify account access' }),
    );
    expect(auth.retry).toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole('button', { name: 'Sign in again' }),
    );
    expect(auth.signOut).toHaveBeenCalled();
  },
);
it('reveals, downloads and hides the authenticated QR, revoking its object URL', async () => {
  await ready();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Show QR code' }));
  const image = await screen.findByRole('img', {
    name: `Your student QR code, ${profile.full_name}`,
  });
  expect(getOwnQR).toHaveBeenCalledWith('student-uid', expect.any(AbortSignal));
  fireEvent.load(image);
  expect(screen.getByRole('link', { name: 'Download QR PNG' })).toHaveAttribute(
    'href',
    'blob:private-image',
  );
  await user.click(screen.getByRole('button', { name: 'Hide QR code' }));
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Show QR code' })).toHaveFocus();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:private-image');
});
it('hides the QR when the tab is hidden and does not automatically re-fetch it', async () => {
  await ready();
  await userEvent.click(screen.getByRole('button', { name: 'Show QR code' }));
  await screen.findByRole('img');
  const visibility = vi
    .spyOn(document, 'visibilityState', 'get')
    .mockReturnValue('hidden');
  fireEvent(document, new Event('visibilitychange'));
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  visibility.mockReturnValue('visible');
  fireEvent(document, new Event('visibilitychange'));
  expect(getOwnQR).toHaveBeenCalledTimes(1);
});
it('prevents duplicate QR reads and ignores a hidden pending request', async () => {
  await ready();
  let finish!: (value: Blob) => void;
  vi.mocked(getOwnQR).mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  await userEvent.dblClick(
    screen.getByRole('button', { name: 'Show QR code' }),
  );
  expect(getOwnQR).toHaveBeenCalledTimes(1);
  const signal = vi.mocked(getOwnQR).mock.calls[0][1];
  await userEvent.click(screen.getByRole('button', { name: 'Hide QR code' }));
  expect(signal.aborted).toBe(true);
  await act(async () => finish(new Blob(['late'])));
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
});
it('shows QR errors and permits retry after invalid image decoding', async () => {
  vi.mocked(getOwnQR).mockRejectedValueOnce(
    new StudentPortalError('unavailable', 'Unavailable'),
  );
  await ready();
  await userEvent.click(screen.getByRole('button', { name: 'Show QR code' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Unable to load your QR code',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Retry QR code' }));
  fireEvent.error(await screen.findByRole('img'));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Unable to display your QR code',
  );
  expect(URL.revokeObjectURL).toHaveBeenCalled();
});
it('clears previously loaded private information when QR access is revoked', async () => {
  await ready();
  vi.mocked(getOwnQR).mockRejectedValue(
    new StudentPortalError('forbidden', 'Access denied.'),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Show QR code' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Access denied');
  expect(screen.queryByText(profile.full_name)).not.toBeInTheDocument();
  expect(screen.queryByText('Example Guardian')).not.toBeInTheDocument();
});
it('loads a private photo, supports retry, and revokes image URLs on unmount', async () => {
  vi.mocked(getOwnProfile).mockResolvedValue({
    ...profile,
    profile_image_url: '/api/v1/me/student-profile/image',
  });
  vi.mocked(getOwnPhoto).mockRejectedValueOnce(
    new StudentPortalError('unavailable', 'Unavailable'),
  );
  const view = await ready('profile');
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Unable to load your profile photo',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Retry photo' }));
  const image = await screen.findByRole('img', {
    name: `Profile photo of ${profile.full_name}`,
  });
  expect(getOwnPhoto).toHaveBeenCalledWith(
    'student-uid',
    expect.any(AbortSignal),
  );
  fireEvent.load(image);
  view.unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalled();
});
it('clears profile data and pending QR work when the account changes', async () => {
  const view = await ready();
  let finish!: (value: Blob) => void;
  vi.mocked(getOwnQR).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Show QR code' }));
  const signal = vi.mocked(getOwnQR).mock.calls[0][1];
  vi.mocked(useAuth).mockReturnValue({
    ...auth,
    account: { ...auth.account!, firebase_uid: 'other-student' },
  });
  vi.mocked(getOwnProfile).mockReturnValue(new Promise(() => {}));
  view.rerender(<StudentHomePage view="qr" />);
  expect(screen.queryByText(profile.full_name)).not.toBeInTheDocument();
  expect(signal.aborted).toBe(true);
  await act(async () => finish(new Blob(['late'])));
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
});
it('aborts profile work on unmount and does not apply late results', async () => {
  let finish!: (value: typeof profile) => void;
  vi.mocked(getOwnProfile).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const view = renderPage();
  const signal = vi.mocked(getOwnProfile).mock.calls[0][1];
  view.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => finish(profile));
  await waitFor(() =>
    expect(screen.queryByText(profile.full_name)).not.toBeInTheDocument(),
  );
});
