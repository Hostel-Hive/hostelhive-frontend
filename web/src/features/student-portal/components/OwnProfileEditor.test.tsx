import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import OwnProfileEditor from './OwnProfileEditor';
import {
  patchOwnProfile,
  OwnProfileInputError,
} from '../api/own-profile-edit.api';
import { getOwnProfile, StudentPortalError } from '../api/student-portal.api';
import { ownStudentProfile as profile } from '../../../test/fixtures/ownStudentProfile';
vi.mock('../api/own-profile-edit.api', async (original) => ({
  ...(await original<typeof import('../api/own-profile-edit.api')>()),
  patchOwnProfile: vi.fn(),
}));
vi.mock('../api/student-portal.api', async (original) => ({
  ...(await original<typeof import('../api/student-portal.api')>()),
  getOwnProfile: vi.fn(),
}));
const onClose = vi.fn(),
  onSaved = vi.fn(),
  onAccessError = vi.fn();
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
  if (show)
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', show);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  if (close) Object.defineProperty(HTMLDialogElement.prototype, 'close', close);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(patchOwnProfile).mockResolvedValue(profile);
  vi.mocked(getOwnProfile).mockResolvedValue(profile);
});
function open(data = profile) {
  return render(
    <RouterProvider
      router={createMemoryRouter([
        {
          path: '/',
          element: (
            <OwnProfileEditor
              profile={data}
              uid="student"
              onClose={onClose}
              onSaved={onSaved}
              onAccessError={onAccessError}
            />
          ),
        },
      ])}
    />,
  );
}
function changePhone(value = '0779999999') {
  fireEvent.change(screen.getByLabelText('Contact phone'), {
    target: { value },
  });
}
it('edits only contact fields and preserves guardians for a phone-only update', async () => {
  open();
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  expect(
    screen.queryByLabelText(/Faculty|Academic year|Email|Full name/),
  ).not.toBeInTheDocument();
  changePhone();
  await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(patchOwnProfile).toHaveBeenCalledWith(
    { contact_phone: '0779999999' },
    profile.student_id,
    'student',
    expect.any(AbortSignal),
  );
  expect(onSaved).toHaveBeenCalledWith(profile, expect.any(String));
});
it('supports phone-only editing without existing guardians', async () => {
  open({ ...profile, guardians: [] });
  changePhone();
  await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(patchOwnProfile).toHaveBeenCalledWith(
    { contact_phone: '0779999999' },
    profile.student_id,
    'student',
    expect.any(AbortSignal),
  );
});
it('submits only the complete edited guardian list without stored IDs', async () => {
  open();
  fireEvent.change(screen.getByLabelText('Guardian name'), {
    target: { value: 'Updated Guardian' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(patchOwnProfile).toHaveBeenCalledWith(
    {
      guardians: [
        {
          name: 'Updated Guardian',
          relationship: profile.guardians[0].relationship,
          contact_phone: profile.guardians[0].contact_phone,
        },
      ],
    },
    profile.student_id,
    'student',
    expect.any(AbortSignal),
  );
});
it('validates phone and guardian details without sending invalid writes', async () => {
  open();
  changePhone('abc');
  await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'at least 7 digits',
  );
  expect(patchOwnProfile).not.toHaveBeenCalled();
});
it('confirms discarding unsaved changes and allows keeping them', async () => {
  open();
  changePhone();
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(onClose).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByLabelText('Contact phone')).toHaveValue('0779999999');
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await userEvent.click(
    screen.getByRole('button', { name: 'Discard changes' }),
  );
  expect(onClose).toHaveBeenCalledOnce();
});
it('requires a current-profile read after an uncertain write', async () => {
  vi.mocked(patchOwnProfile).mockRejectedValue(
    new StudentPortalError('unavailable', 'Unconfirmed'),
  );
  open();
  changePhone();
  await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await screen.findByRole('button', { name: 'Check current profile' });
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  expect(screen.getByLabelText('Contact phone')).toBeDisabled();
  await userEvent.click(
    screen.getByRole('button', { name: 'Check current profile' }),
  );
  expect(getOwnProfile).toHaveBeenCalledOnce();
  expect(patchOwnProfile).toHaveBeenCalledOnce();
  expect(onSaved).toHaveBeenCalledWith(
    profile,
    expect.stringContaining('reloaded'),
  );
});
it('keeps a rejected draft editable and propagates access denial', async () => {
  vi.mocked(patchOwnProfile)
    .mockRejectedValueOnce(new OwnProfileInputError('Invalid phone'))
    .mockRejectedValueOnce(new StudentPortalError('forbidden', 'Denied'));
  open();
  changePhone();
  await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Invalid phone');
  expect(screen.getByLabelText('Contact phone')).toBeEnabled();
  await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() =>
    expect(onAccessError).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'forbidden' }),
    ),
  );
});
it('prevents duplicate saves and aborts pending work on unmount', async () => {
  let finish!: (value: typeof profile) => void;
  vi.mocked(patchOwnProfile).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = open();
  changePhone();
  await userEvent.dblClick(
    screen.getByRole('button', { name: 'Save changes' }),
  );
  expect(patchOwnProfile).toHaveBeenCalledOnce();
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  const signal = vi.mocked(patchOwnProfile).mock.calls[0][3];
  view.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => finish(profile));
  expect(onSaved).not.toHaveBeenCalled();
});
