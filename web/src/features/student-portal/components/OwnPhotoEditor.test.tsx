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
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from 'vitest';
import OwnPhotoEditor from './OwnPhotoEditor';
import {
  uploadOwnPhoto,
  removeOwnPhoto,
  OwnPhotoInputError,
} from '../api/own-photo.api';
import {
  getOwnProfile,
  getOwnPhoto,
  StudentPortalError,
} from '../api/student-portal.api';
import { validateStudentImage } from '../../students/student-image';
import { ownStudentProfile as profile } from '../../../test/fixtures/ownStudentProfile';
vi.mock('../api/own-photo.api', async (original) => ({
  ...(await original<typeof import('../api/own-photo.api')>()),
  uploadOwnPhoto: vi.fn(),
  removeOwnPhoto: vi.fn(),
}));
vi.mock('../api/student-portal.api', async (original) => ({
  ...(await original<typeof import('../api/student-portal.api')>()),
  getOwnProfile: vi.fn(),
  getOwnPhoto: vi.fn(),
}));
vi.mock('../../students/student-image', async (original) => ({
  ...(await original<typeof import('../../students/student-image')>()),
  validateStudentImage: vi.fn(),
}));
const saved = vi.fn(),
  denied = vi.fn(),
  close = vi.fn();
const NativeURL = URL;
const show = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  'showModal',
);
const hide = Object.getOwnPropertyDescriptor(
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
  if (hide) Object.defineProperty(HTMLDialogElement.prototype, 'close', hide);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal(
    'URL',
    class extends NativeURL {
      static createObjectURL = vi.fn(() => 'blob:private-preview');
      static revokeObjectURL = vi.fn();
    },
  );
  vi.mocked(validateStudentImage).mockResolvedValue();
  vi.mocked(uploadOwnPhoto).mockResolvedValue();
  vi.mocked(removeOwnPhoto).mockResolvedValue();
  vi.mocked(getOwnProfile).mockResolvedValue({
    ...profile,
    profile_image_url: '/api/v1/me/student-profile/image',
  });
  vi.mocked(getOwnPhoto).mockResolvedValue(
    new Blob(['bytes'], { type: 'image/png' }),
  );
});
afterEach(() => vi.unstubAllGlobals());
function open(hasPhoto = false) {
  return render(
    <OwnPhotoEditor
      uid="student"
      profile={{
        ...profile,
        profile_image_url: hasPhoto ? '/api/v1/me/student-profile/image' : null,
      }}
      onClose={close}
      onSaved={saved}
      onAccessError={denied}
    />,
  );
}
async function select() {
  const file = new File(['bytes'], 'selected.png', { type: 'image/png' });
  await userEvent.upload(screen.getByLabelText('Choose profile photo'), file);
  await screen.findByAltText('Selected profile photo preview');
  return file;
}
it('previews privately and uploads only after explicit confirmation, then reloads metadata', async () => {
  const view = open();
  const file = await select();
  await waitFor(() =>
    expect(
      screen.getByAltText('Selected profile photo preview'),
    ).toHaveAttribute('src', 'blob:private-preview'),
  );
  expect(uploadOwnPhoto).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Upload photo' }));
  expect(uploadOwnPhoto).toHaveBeenCalledWith(
    file,
    profile.student_id,
    'student',
    expect.any(AbortSignal),
  );
  await waitFor(() =>
    expect(saved).toHaveBeenCalledWith(
      expect.objectContaining({
        profile_image_url: '/api/v1/me/student-profile/image',
      }),
      expect.stringContaining('saved'),
    ),
  );
  view.unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:private-preview');
});
it('requires confirmation before removal and preserves the photo when dismissed', async () => {
  open(true);
  await userEvent.click(screen.getByRole('button', { name: 'Remove photo' }));
  expect(removeOwnPhoto).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Keep photo' }));
  expect(removeOwnPhoto).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Remove photo' }));
  vi.mocked(getOwnProfile).mockResolvedValue({
    ...profile,
    profile_image_url: null,
  });
  await userEvent.click(
    screen.getByRole('button', { name: 'Confirm removal' }),
  );
  await waitFor(() =>
    expect(saved).toHaveBeenCalledWith(
      expect.objectContaining({ profile_image_url: null }),
      expect.stringContaining('removed'),
    ),
  );
});
it('rejects invalid file dimensions before preview or upload', async () => {
  vi.mocked(validateStudentImage).mockRejectedValue(
    new Error('Photo dimensions exceed the limit.'),
  );
  open();
  await userEvent.upload(
    screen.getByLabelText('Choose profile photo'),
    new File(['bytes'], 'large.png', { type: 'image/png' }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent('dimensions');
  expect(uploadOwnPhoto).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Upload photo' })).toBeDisabled();
});
it('locks writes after an uncertain response until an explicit profile read', async () => {
  vi.mocked(uploadOwnPhoto).mockRejectedValue(
    new StudentPortalError('unavailable', 'Storage unavailable'),
  );
  open();
  await select();
  await userEvent.click(screen.getByRole('button', { name: 'Upload photo' }));
  await screen.findByRole('button', { name: 'Check current profile' });
  expect(screen.getByRole('button', { name: 'Upload photo' })).toBeDisabled();
  expect(screen.getByLabelText('Choose profile photo')).toBeDisabled();
  expect(getOwnProfile).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole('button', { name: 'Check current profile' }),
  );
  await waitFor(() => expect(saved).toHaveBeenCalled());
  expect(uploadOwnPhoto).toHaveBeenCalledOnce();
});
it('keeps a server-rejected file editable and propagates access denial', async () => {
  vi.mocked(uploadOwnPhoto)
    .mockRejectedValueOnce(new OwnPhotoInputError('Invalid image'))
    .mockRejectedValueOnce(new StudentPortalError('forbidden', 'Denied'));
  open();
  await select();
  await userEvent.click(screen.getByRole('button', { name: 'Upload photo' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Invalid image');
  expect(screen.getByLabelText('Choose profile photo')).toBeEnabled();
  await userEvent.click(screen.getByRole('button', { name: 'Upload photo' }));
  await waitFor(() =>
    expect(denied).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'forbidden' }),
    ),
  );
});
it('prevents duplicate writes and ignores responses after unmount', async () => {
  let finish!: () => void;
  vi.mocked(uploadOwnPhoto).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = open();
  await select();
  await userEvent.dblClick(
    screen.getByRole('button', { name: 'Upload photo' }),
  );
  expect(uploadOwnPhoto).toHaveBeenCalledOnce();
  expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled();
  const controller = vi.mocked(uploadOwnPhoto).mock.calls[0][3];
  view.unmount();
  expect(controller.aborted).toBe(true);
  await act(async () => finish());
  expect(saved).not.toHaveBeenCalled();
  expect(getOwnProfile).not.toHaveBeenCalled();
});
it('handles preview decoding errors without enabling upload', async () => {
  open();
  await select();
  fireEvent.error(screen.getByAltText('Selected profile photo preview'));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'could not be displayed',
  );
  expect(screen.getByRole('button', { name: 'Upload photo' })).toBeDisabled();
});
