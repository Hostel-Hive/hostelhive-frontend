import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from '../../../app/App';
import {
  restoreStaffSession,
  subscribeStaffSession,
  SessionRejectedError,
} from '../../auth/api/auth.api';
import type { StaffAccount } from '../../auth/auth.types';
import { getStudent } from '../api/students.api';
import { getStudentImage, uploadStudentImage } from '../api/student-images.api';
import { validateStudentImage } from '../student-image';
import { studentFixture } from '../../../test/fixtures/student';
vi.mock('../../auth/api/auth.api', async (original) => ({
  ...(await original<typeof import('../../auth/api/auth.api')>()),
  restoreStaffSession: vi.fn(),
  subscribeStaffSession: vi.fn(),
}));
vi.mock('../api/students.api', async (original) => ({
  ...(await original<typeof import('../api/students.api')>()),
  getStudent: vi.fn(),
}));
vi.mock('../api/student-images.api', () => ({
  getStudentImage: vi.fn(),
  uploadStudentImage: vi.fn(),
  removeStudentImage: vi.fn(),
}));
vi.mock('../student-image', () => ({ validateStudentImage: vi.fn() }));
const staff: StaffAccount = {
  user_id: 'staff',
  firebase_uid: 'staff-uid',
  role: 'admin',
  email: 'staff@example.com',
  is_active: true,
};
const NativeURL = URL;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal(
    'URL',
    class extends NativeURL {
      static createObjectURL = vi.fn(() => 'blob:photo');
      static revokeObjectURL = vi.fn();
    },
  );
  vi.mocked(restoreStaffSession).mockResolvedValue(staff);
  vi.mocked(subscribeStaffSession).mockImplementation((change) => {
    let active = true;
    queueMicrotask(() => {
      if (active) change(true);
    });
    return () => {
      active = false;
    };
  });
  vi.mocked(getStudent).mockResolvedValue(studentFixture);
  vi.mocked(validateStudentImage).mockResolvedValue(undefined);
  vi.mocked(uploadStudentImage).mockResolvedValue({
    ...studentFixture,
    profile_image_url: '/api/v1/students/photo/image',
  });
  vi.mocked(getStudentImage).mockResolvedValue(
    new Blob(['image'], { type: 'image/png' }),
  );
  window.history.replaceState(
    {},
    '',
    `/dashboard/students/${studentFixture.student_id}`,
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const preview = () =>
  screen.getByRole('img', {
    name: `Selected photo preview for ${studentFixture.full_name}`,
  });
it.each(['focus', 'visibilitychange'])(
  'keeps the new student form visible and editable during a pending %s check',
  async (event) => {
    window.history.replaceState({}, '', '/dashboard/students/new');
    render(<App />);
    const name = await screen.findByLabelText('Full name');
    const user = userEvent.setup();
    await user.type(name, 'Draft student');
    let verify!: (account: StaffAccount) => void;
    vi.mocked(restoreStaffSession).mockReturnValueOnce(
      new Promise((resolve) => {
        verify = resolve;
      }),
    );
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    await act(async () => {
      (event === 'focus' ? window : document).dispatchEvent(new Event(event));
    });
    expect(restoreStaffSession).toHaveBeenCalledTimes(2);
    expect(
      screen.queryByText('Checking your session…'),
    ).not.toBeInTheDocument();
    expect(name).toBeVisible();
    expect(name).toHaveValue('Draft student');
    await user.type(name, ' name');
    await act(async () => verify(staff));
    expect(screen.getByLabelText('Full name')).toBe(name);
    expect(name).toHaveValue('Draft student name');
  },
);
it('keeps the page and file selection visible while checking the session after the chooser', async () => {
  render(<App />);
  const input = await screen.findByLabelText('Choose profile photo');
  let verify!: (account: StaffAccount) => void;
  let decoded!: () => void;
  vi.mocked(restoreStaffSession).mockReturnValueOnce(
    new Promise((resolve) => {
      verify = resolve;
    }),
  );
  vi.mocked(validateStudentImage).mockReturnValueOnce(
    new Promise((resolve) => {
      decoded = resolve;
    }),
  );
  await act(async () => {
    window.dispatchEvent(new Event('focus'));
  });
  expect(screen.queryByText('Checking your session…')).not.toBeInTheDocument();
  expect(input).toBeVisible();
  expect(input.closest('[inert]')).toBeNull();
  const file = new File(['image'], 'profile.png', { type: 'image/png' });
  fireEvent.change(input, { target: { files: [file] } });
  await act(async () => decoded());
  expect(preview()).toBeVisible();
  await act(async () => verify(staff));
  expect(preview()).toBeVisible();
  expect(screen.getByLabelText('Choose profile photo')).toBe(input);
  expect(getStudent).toHaveBeenCalledTimes(1);
  expect(uploadStudentImage).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Upload photo' }));
  await waitFor(() =>
    expect(uploadStudentImage).toHaveBeenCalledWith(
      studentFixture.student_id,
      file,
      'staff-uid',
      expect.any(AbortSignal),
    ),
  );
});
it.each(['focus', 'visibilitychange'])(
  'preserves a selected preview across a successful %s session check',
  async (event) => {
    render(<App />);
    const input = await screen.findByLabelText('Choose profile photo');
    await userEvent.upload(
      input,
      new File(['image'], 'profile.png', { type: 'image/png' }),
    );
    const image = preview();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    await act(async () => {
      (event === 'focus' ? window : document).dispatchEvent(new Event(event));
    });
    expect(preview()).toBe(image);
    expect(preview()).toBeVisible();
    expect(getStudent).toHaveBeenCalledTimes(1);
  },
);
it.each(['rejected', 'unavailable', 'different-user', 'different-role'])(
  'discards photo state after %s verification',
  async (outcome) => {
    render(<App />);
    const input = await screen.findByLabelText('Choose profile photo');
    await userEvent.upload(
      input,
      new File(['image'], 'profile.png', { type: 'image/png' }),
    );
    preview();
    if (outcome === 'rejected')
      vi.mocked(restoreStaffSession)
        .mockRejectedValueOnce(new SessionRejectedError('Access rejected'))
        .mockResolvedValue(null);
    else if (outcome === 'unavailable')
      vi.mocked(restoreStaffSession).mockRejectedValueOnce(
        new Error('Unavailable'),
      );
    else
      vi.mocked(restoreStaffSession).mockResolvedValue({
        ...staff,
        ...(outcome === 'different-user'
          ? { firebase_uid: 'other-uid' }
          : { role: 'warden' }),
      });
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(
      screen.queryByRole('img', {
        name: `Selected photo preview for ${studentFixture.full_name}`,
      }),
    ).not.toBeInTheDocument();
    expect(uploadStudentImage).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  },
);
