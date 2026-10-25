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
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from 'vitest';
import StudentPhoto from './StudentPhoto';
import { getStudent, StudentRequestError } from '../api/students.api';
import {
  getStudentImage,
  uploadStudentImage,
  removeStudentImage,
} from '../api/student-images.api';
import { validateStudentImage } from '../student-image';
import { studentFixture } from '../../../test/fixtures/student';

const { signOut } = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock('../../auth/hooks/useAuth', () => ({ default: () => ({ signOut }) }));
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
const profile = {
  ...studentFixture,
  profile_image_url: '/api/v1/students/private/image',
};
const blob = new Blob(['png'], { type: 'image/png' });
const createURL = vi.fn();
const revokeURL = vi.fn();
const originalShow = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  'showModal',
);
const originalClose = Object.getOwnPropertyDescriptor(
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
  if (originalShow)
    Object.defineProperty(
      HTMLDialogElement.prototype,
      'showModal',
      originalShow,
    );
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  if (originalClose)
    Object.defineProperty(HTMLDialogElement.prototype, 'close', originalClose);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('URL', {
    createObjectURL: createURL.mockReturnValue('blob:private-photo'),
    revokeObjectURL: revokeURL,
  });
  vi.mocked(getStudentImage).mockResolvedValue(blob);
  vi.mocked(getStudent).mockResolvedValue(profile);
  vi.mocked(uploadStudentImage).mockResolvedValue(profile);
  vi.mocked(removeStudentImage).mockResolvedValue(undefined);
  vi.mocked(validateStudentImage).mockResolvedValue(undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function show(hasPhoto = false) {
  return render(
    <StudentPhoto
      student={hasPhoto ? profile : studentFixture}
      uid="staff-uid"
    />,
  );
}
async function choose() {
  fireEvent.change(screen.getByLabelText(/Choose .*photo/), {
    target: { files: [new File(['png'], 'photo.png', { type: 'image/png' })] },
  });
  await screen.findByAltText(/Selected photo preview/);
}
it('shows the empty state without fetching and validates before uploading', async () => {
  show();
  expect(screen.getByText('No profile photo')).toBeInTheDocument();
  expect(getStudentImage).not.toHaveBeenCalled();
  await choose();
  expect(uploadStudentImage).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Upload photo' }));
  expect(await screen.findByText('Profile photo saved.')).toBeInTheDocument();
  expect(uploadStudentImage).toHaveBeenCalledWith(
    studentFixture.student_id,
    expect.any(File),
    'staff-uid',
    expect.any(AbortSignal),
  );
  await waitFor(() =>
    expect(screen.getByAltText(/Profile photo of/)).toHaveAttribute(
      'src',
      'blob:private-photo',
    ),
  );
});
it('fetches existing photos privately, previews replacements and revokes URLs on discard/unmount', async () => {
  const view = show(true);
  await waitFor(() =>
    expect(screen.getByAltText(/Profile photo of/)).toHaveAttribute(
      'src',
      'blob:private-photo',
    ),
  );
  expect(getStudentImage).toHaveBeenCalledWith(
    studentFixture.student_id,
    'staff-uid',
    expect.any(AbortSignal),
  );
  await choose();
  expect(screen.getByRole('button', { name: 'Replace photo' })).toBeEnabled();
  await userEvent.click(
    screen.getByRole('button', { name: 'Discard selection' }),
  );
  expect(screen.getByAltText(/Profile photo of/)).toBeInTheDocument();
  view.unmount();
  expect(revokeURL).toHaveBeenCalledWith('blob:private-photo');
});
it('keeps the saved photo when a selected file fails validation', async () => {
  vi.mocked(validateStudentImage).mockRejectedValue(
    new Error('Choose a JPEG or PNG photo.'),
  );
  show(true);
  await screen.findByAltText(/Profile photo of/);
  fireEvent.change(screen.getByLabelText('Choose replacement photo'), {
    target: { files: [new File(['x'], 'bad.png', { type: 'image/png' })] },
  });
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Choose a JPEG or PNG',
  );
  expect(screen.getByAltText(/Profile photo of/)).toBeInTheDocument();
  expect(uploadStudentImage).not.toHaveBeenCalled();
});
it('confirms removal, focuses Cancel, restores focus and removes only after confirmation', async () => {
  show(true);
  await screen.findByAltText(/Profile photo of/);
  const trigger = screen.getByRole('button', { name: 'Remove photo' });
  await userEvent.click(trigger);
  let dialog = screen.getByRole('dialog');
  expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
  expect(dialog).toHaveTextContent(studentFixture.full_name);
  await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  expect(trigger).toHaveFocus();
  expect(removeStudentImage).not.toHaveBeenCalled();
  await userEvent.click(trigger);
  dialog = screen.getByRole('dialog');
  await userEvent.click(
    within(dialog).getByRole('button', { name: 'Confirm removal' }),
  );
  expect(await screen.findByText('Profile photo removed.')).toBeInTheDocument();
  expect(screen.getByText('No profile photo')).toBeInTheDocument();
});
it('prevents duplicate writes while uploading', async () => {
  let finish!: (value: typeof profile) => void;
  vi.mocked(uploadStudentImage).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  show();
  await choose();
  const upload = screen.getByRole('button', { name: 'Upload photo' });
  fireEvent.click(upload);
  fireEvent.click(upload);
  expect(uploadStudentImage).toHaveBeenCalledOnce();
  expect(upload).toBeDisabled();
  await act(async () => finish(profile));
  await screen.findByText('Profile photo saved.');
});
it('checks the saved profile after an uncertain upload before permitting another write', async () => {
  vi.mocked(uploadStudentImage).mockRejectedValue(new Error('lost response'));
  show(true);
  await screen.findByAltText(/Profile photo of/);
  await choose();
  await userEvent.click(screen.getByRole('button', { name: 'Replace photo' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'could not be confirmed',
  );
  expect(screen.getByRole('button', { name: 'Replace photo' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Remove photo' })).toBeDisabled();
  await userEvent.click(
    screen.getByRole('button', { name: 'Check photo status' }),
  );
  await screen.findByText('Photo status checked.');
  expect(getStudent).toHaveBeenCalledOnce();
  expect(
    screen.queryByAltText(/Selected photo preview/),
  ).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Remove photo' })).toBeEnabled();
});
it('recovers from an uncertain removal when the status check confirms there is no photo', async () => {
  vi.mocked(removeStudentImage).mockRejectedValue(new Error('lost response'));
  vi.mocked(getStudent).mockResolvedValue(studentFixture);
  show(true);
  await screen.findByAltText(/Profile photo of/);
  await userEvent.click(screen.getByRole('button', { name: 'Remove photo' }));
  await userEvent.click(
    screen.getByRole('button', { name: 'Confirm removal' }),
  );
  await screen.findByRole('alert');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole('button', { name: 'Check photo status' }),
  );
  await screen.findByText('Photo status checked.');
  expect(screen.getByText('No profile photo')).toBeInTheDocument();
});
it.each(['session', 'forbidden', 'not-found'] as const)(
  'blocks photo controls after %s status failures',
  async (kind) => {
    vi.mocked(getStudent).mockRejectedValue(
      new StudentRequestError(kind, 'Sign in again.'),
    );
    show();
    await userEvent.click(
      screen.getByRole('button', { name: 'Check photo status' }),
    );
    await screen.findByRole('alert');
    expect(
      screen.queryByLabelText('Choose profile photo'),
    ).not.toBeInTheDocument();
    if (kind === 'session') {
      await userEvent.click(
        screen.getByRole('button', { name: 'Sign in again' }),
      );
      expect(signOut).toHaveBeenCalledOnce();
    }
  },
);
it('does not block student details or claim no photo when storage is unavailable', async () => {
  vi.mocked(getStudentImage).mockRejectedValue(new Error('503'));
  show(true);
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Photo service is unavailable',
  );
  expect(screen.getByText('Photo preview unavailable')).toBeInTheDocument();
  vi.mocked(getStudentImage).mockResolvedValue(null);
  await userEvent.click(
    screen.getByRole('button', { name: 'Check photo status' }),
  );
  await screen.findByText('Photo status checked.');
  expect(screen.getByText('No profile photo')).toBeInTheDocument();
});
it('separates upload success from a subsequent preview failure', async () => {
  vi.mocked(getStudentImage).mockRejectedValue(new Error('503'));
  show();
  await choose();
  await userEvent.click(screen.getByRole('button', { name: 'Upload photo' }));
  await screen.findByText('Profile photo saved.');
  await screen.findByRole('alert');
  expect(
    screen.queryByRole('button', { name: 'Upload photo' }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Remove photo' })).toBeEnabled();
});
it('shows server rejection without treating it as an uncertain commit', async () => {
  vi.mocked(uploadStudentImage).mockRejectedValue(
    new StudentRequestError('invalid', 'bad image'),
  );
  show();
  await choose();
  await userEvent.click(screen.getByRole('button', { name: 'Upload photo' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'photo was rejected',
  );
  expect(screen.getByRole('button', { name: 'Upload photo' })).toBeEnabled();
});
it('aborts initial private downloads on unmount and ignores late results', async () => {
  let finish!: (value: Blob) => void;
  vi.mocked(getStudentImage).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const view = show(true);
  const signal = vi.mocked(getStudentImage).mock.calls[0][2];
  view.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => finish(blob));
  expect(createURL).not.toHaveBeenCalled();
});
it('reports image decode failures and reloads on a status check', async () => {
  show(true);
  const image = await screen.findByAltText(/Profile photo of/);
  fireEvent.error(image);
  expect(screen.getByRole('alert')).toHaveTextContent('could not be displayed');
  await userEvent.click(
    screen.getByRole('button', { name: 'Check photo status' }),
  );
  await waitFor(() =>
    expect(screen.getByText('Photo status checked.')).toBeInTheDocument(),
  );
  fireEvent.load(screen.getByAltText(/Profile photo of/));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
