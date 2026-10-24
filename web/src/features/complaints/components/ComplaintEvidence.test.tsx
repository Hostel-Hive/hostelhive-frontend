import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ComplaintEvidence from './ComplaintEvidence';
import {
  EvidenceError,
  getComplaintImage,
  listComplaintImages,
  removeComplaintImage,
  uploadComplaintImage,
} from '../api/complaint-images.api';
import { validateStudentImage } from '../../students/student-image';
import { complaintFixture as row } from '../../../test/fixtures/complaints';
import {
  evidenceFixture as image,
  pngBytes,
} from '../../../test/fixtures/complaintImages';
vi.mock('../api/complaint-images.api', async (original) => ({
  ...(await original<typeof import('../api/complaint-images.api')>()),
  listComplaintImages: vi.fn(),
  getComplaintImage: vi.fn(),
  removeComplaintImage: vi.fn(),
  uploadComplaintImage: vi.fn(),
}));
vi.mock('../../students/student-image', async (original) => ({
  ...(await original<typeof import('../../students/student-image')>()),
  validateStudentImage: vi.fn(),
}));
const denied = vi.fn();
const changed = vi.fn();
const lock = vi.fn();
const review = vi.fn();
const NativeURL = URL;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal(
    'URL',
    class extends NativeURL {
      static createObjectURL = vi.fn(() => 'blob:private-evidence');
      static revokeObjectURL = vi.fn();
    },
  );
  vi.mocked(listComplaintImages).mockResolvedValue({ items: [], version: 1 });
  vi.mocked(getComplaintImage).mockResolvedValue(
    new Blob([pngBytes], { type: 'image/png' }),
  );
  vi.mocked(uploadComplaintImage).mockResolvedValue({
    image,
    version: 2,
    replayed: false,
  });
  vi.mocked(removeComplaintImage).mockResolvedValue({
    image_id: image.image_id,
    removed: true,
    version: 2,
    replayed: false,
  });
  vi.mocked(validateStudentImage).mockResolvedValue();
  review.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllGlobals());
function open(options: Partial<Parameters<typeof ComplaintEvidence>[0]> = {}) {
  const router = createMemoryRouter([
    {
      path: '/',
      element: (
        <ComplaintEvidence
          row={row}
          uid="student"
          editable
          onDenied={denied}
          onChanged={changed}
          onLockChange={lock}
          onReview={review}
          {...options}
        />
      ),
    },
    { path: '/away', element: <p>Other page</p> },
  ]);
  return { ...render(<RouterProvider router={router} />), router };
}
async function select() {
  const input = await screen.findByLabelText('Choose evidence image');
  await waitFor(() => expect(input).toBeEnabled());
  const file = new File([pngBytes], 'photo.png', { type: 'image/png' });
  fireEvent.change(input, { target: { files: [file] } });
  await screen.findByAltText('Selected evidence preview');
  return file;
}
it('shows empty evidence and allows students to select an image', async () => {
  open();
  expect(await screen.findByText('No evidence images attached.')).toBeVisible();
  const selected = await select();
  expect(validateStudentImage).toHaveBeenCalledWith(selected);
  expect(screen.getByText('photo.png')).toBeVisible();
  expect(lock).toHaveBeenLastCalledWith(true);
});
it('displays private images for staff without mutation controls or public URLs', async () => {
  vi.mocked(listComplaintImages).mockResolvedValue({
    items: [image],
    version: 1,
  });
  open({ editable: false, uid: 'staff' });
  // The image mounts before its effect attaches the private object URL.
  await waitFor(() =>
    expect(screen.getByAltText('Complaint evidence 1')).toHaveAttribute(
      'src',
      'blob:private-evidence',
    ),
  );
  expect(
    screen.queryByLabelText('Choose evidence image'),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: /Remove image|Upload/ }),
  ).not.toBeInTheDocument();
});
it('disables a fourth upload at the three-image limit', async () => {
  vi.mocked(listComplaintImages).mockResolvedValue({
    items: [
      image,
      { ...image, image_id: row.student_id },
      { ...image, image_id: row.request_id },
    ],
    version: 1,
  });
  open();
  expect(await screen.findByLabelText('Choose evidence image')).toBeDisabled();
  expect(
    screen.getByText('The three-image limit has been reached.'),
  ).toBeVisible();
});
it.each(['in_progress', 'resolved'] as const)(
  'keeps evidence read-only for %s complaints',
  async (status) => {
    open({ row: { ...row, status } });
    await screen.findByText('No evidence images attached.');
    expect(
      screen.queryByLabelText('Choose evidence image'),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Reopening does not unlock images/)).toBeVisible();
  },
);
it('validates files before creating an upload operation', async () => {
  vi.mocked(validateStudentImage).mockRejectedValue(
    new Error('Choose a JPEG or PNG photo.'),
  );
  open();
  const input = await screen.findByLabelText('Choose evidence image');
  fireEvent.change(input, {
    target: { files: [new File(['x'], 'x.svg', { type: 'image/svg+xml' })] },
  });
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Choose a JPEG or PNG',
  );
  expect(uploadComplaintImage).not.toHaveBeenCalled();
  expect(
    screen.queryByAltText('Selected evidence preview'),
  ).not.toBeInTheDocument();
});
it('uploads only after explicit selection and preserves the original file bytes', async () => {
  open();
  const file = await select();
  expect(uploadComplaintImage).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole('button', { name: 'Upload evidence' }),
  );
  await waitFor(() =>
    expect(changed).toHaveBeenCalledWith(
      'Evidence uploaded. Refreshing complaint and history.',
    ),
  );
  expect(uploadComplaintImage).toHaveBeenCalledWith(
    row.complaint_id,
    expect.any(String),
    file,
    'student',
    expect.any(AbortSignal),
  );
});
it('locks duplicate clicks while an upload is pending', async () => {
  vi.mocked(uploadComplaintImage).mockReturnValue(new Promise(() => {}));
  open();
  await select();
  const upload = screen.getByRole('button', { name: 'Upload evidence' });
  fireEvent.click(upload);
  fireEvent.click(upload);
  await waitFor(() => expect(upload).toBeDisabled());
  expect(uploadComplaintImage).toHaveBeenCalledTimes(1);
});
it('retains the image ID and original file for an unknown-outcome upload retry', async () => {
  vi.mocked(uploadComplaintImage).mockRejectedValueOnce(
    new EvidenceError('unavailable', 'Offline'),
  );
  open();
  const file = await select();
  await userEvent.click(
    screen.getByRole('button', { name: 'Upload evidence' }),
  );
  await userEvent.click(
    await screen.findByRole('button', { name: 'Retry identical upload' }),
  );
  await waitFor(() => expect(changed).toHaveBeenCalled());
  const calls = vi.mocked(uploadComplaintImage).mock.calls;
  expect(calls[1].slice(0, 4)).toEqual(calls[0].slice(0, 4));
  expect(calls[1][2]).toBe(file);
});
it('checks complaint/history after conflict and preserves the selected file', async () => {
  vi.mocked(uploadComplaintImage).mockRejectedValueOnce(
    new EvidenceError('conflict', 'Changed'),
  );
  open();
  await select();
  await userEvent.click(
    screen.getByRole('button', { name: 'Upload evidence' }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent('Changed');
  expect(
    screen.getByRole('button', { name: 'Upload evidence' }),
  ).toBeDisabled();
  await userEvent.click(
    screen.getByRole('button', {
      name: 'Check current complaint and evidence',
    }),
  );
  expect(
    await screen.findByText(/Current complaint and history checked/),
  ).toBeVisible();
  expect(review).toHaveBeenCalledWith(expect.any(AbortSignal));
  expect(screen.getByText('photo.png')).toBeVisible();
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Upload evidence' }),
    ).toBeEnabled(),
  );
});
it('requires checking when image-list and complaint versions differ', async () => {
  vi.mocked(listComplaintImages).mockResolvedValue({ items: [], version: 2 });
  open();
  expect(await screen.findByLabelText('Choose evidence image')).toBeDisabled();
  expect(
    screen.getByRole('button', {
      name: 'Check current complaint and evidence',
    }),
  ).toBeVisible();
});
it('confirms removal and refreshes after its acknowledged success', async () => {
  vi.mocked(listComplaintImages).mockResolvedValue({
    items: [image],
    version: 1,
  });
  open();
  await userEvent.click(
    await screen.findByRole('button', { name: 'Remove image 1' }),
  );
  expect(removeComplaintImage).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Keep image' }));
  expect(
    screen.queryByRole('button', { name: 'Confirm removal' }),
  ).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Remove image 1' }));
  await userEvent.click(
    screen.getByRole('button', { name: 'Confirm removal' }),
  );
  expect(removeComplaintImage).toHaveBeenCalledWith(
    row.complaint_id,
    image.image_id,
    'student',
    expect.any(AbortSignal),
  );
  await waitFor(() =>
    expect(changed).toHaveBeenCalledWith(
      'Evidence removed. Refreshing complaint and history.',
    ),
  );
});
it('retries an uncertain removal with the same image ID', async () => {
  vi.mocked(listComplaintImages).mockResolvedValue({
    items: [image],
    version: 1,
  });
  vi.mocked(removeComplaintImage).mockRejectedValueOnce(
    new EvidenceError('unavailable', 'Offline'),
  );
  open();
  await userEvent.click(
    await screen.findByRole('button', { name: 'Remove image 1' }),
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Confirm removal' }),
  );
  await userEvent.click(
    await screen.findByRole('button', { name: 'Retry identical removal' }),
  );
  await waitFor(() => expect(changed).toHaveBeenCalled());
  const calls = vi.mocked(removeComplaintImage).mock.calls;
  expect(calls[1].slice(0, 3)).toEqual(calls[0].slice(0, 3));
});
it('permits discarding unknown retry details only after an authoritative check', async () => {
  vi.mocked(uploadComplaintImage).mockRejectedValue(
    new EvidenceError('unavailable', 'Offline'),
  );
  open();
  await select();
  await userEvent.click(
    screen.getByRole('button', { name: 'Upload evidence' }),
  );
  await screen.findByRole('button', { name: 'Retry identical upload' });
  expect(
    screen.queryByRole('button', { name: 'Discard retry details' }),
  ).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole('button', {
      name: 'Check current complaint and evidence',
    }),
  );
  await userEvent.click(
    await screen.findByRole('button', { name: 'Discard retry details' }),
  );
  expect(screen.queryByText('photo.png')).not.toBeInTheDocument();
});
it('supports metadata failures and explicit retry', async () => {
  vi.mocked(listComplaintImages).mockRejectedValueOnce(
    new EvidenceError('unavailable', 'Storage unavailable'),
  );
  open();
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Storage unavailable',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Retry evidence' }));
  expect(await screen.findByText('No evidence images attached.')).toBeVisible();
});
it('handles image decode failure and reloads private bytes', async () => {
  vi.mocked(listComplaintImages).mockResolvedValue({
    items: [image],
    version: 1,
  });
  open({ editable: false });
  const img = await screen.findByAltText('Complaint evidence 1');
  fireEvent.error(img);
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'could not be displayed',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Retry image 1' }));
  expect(await screen.findByAltText('Complaint evidence 1')).toBeVisible();
  expect(getComplaintImage).toHaveBeenCalledTimes(2);
});
it('prevents uploading an unreadable selected preview', async () => {
  open();
  await select();
  fireEvent.error(screen.getByAltText('Selected evidence preview'));
  expect(
    screen.getByRole('button', { name: 'Upload evidence' }),
  ).toBeDisabled();
  await userEvent.click(
    screen.getByRole('button', { name: 'Discard selected image' }),
  );
  expect(
    screen.queryByAltText('Selected evidence preview'),
  ).not.toBeInTheDocument();
  expect(URL.revokeObjectURL).toHaveBeenCalled();
});
it.each(['session', 'setup', 'forbidden'] as const)(
  'propagates %s access loss from metadata reads',
  async (kind) => {
    vi.mocked(listComplaintImages).mockRejectedValue(
      new EvidenceError(kind, 'Verify account'),
    );
    open();
    await waitFor(() =>
      expect(denied).toHaveBeenCalledWith(expect.objectContaining({ kind })),
    );
  },
);
it('propagates access loss from private image reads', async () => {
  vi.mocked(listComplaintImages).mockResolvedValue({
    items: [image],
    version: 1,
  });
  vi.mocked(getComplaintImage).mockRejectedValue(
    new EvidenceError('forbidden', 'Denied'),
  );
  open({ editable: false });
  await waitFor(() => expect(denied).toHaveBeenCalled());
});
it('protects selected evidence from navigation and supports explicit discard', async () => {
  const { router } = open();
  await select();
  await act(async () => {
    void router.navigate('/away');
  });
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Discard the selected evidence',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Stay here' }));
  expect(screen.getByText('photo.png')).toBeVisible();
  await act(async () => {
    void router.navigate('/away');
  });
  await userEvent.click(
    screen.getByRole('button', { name: 'Discard and leave' }),
  );
  expect(await screen.findByText('Other page')).toBeVisible();
});
it('revokes image URLs and aborts private requests on unmount', async () => {
  vi.mocked(listComplaintImages).mockResolvedValue({
    items: [image],
    version: 1,
  });
  const view = open({ editable: false });
  await screen.findByAltText('Complaint evidence 1');
  const requestSignal = vi.mocked(getComplaintImage).mock.calls[0][2];
  view.unmount();
  expect(requestSignal.aborted).toBe(true);
  expect(URL.revokeObjectURL).toHaveBeenCalled();
});
it('ignores a metadata response arriving after unmount', async () => {
  let finish!: (value: { items: (typeof image)[]; version: number }) => void;
  vi.mocked(listComplaintImages).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const view = open();
  view.unmount();
  await act(async () => finish({ items: [image], version: 1 }));
  expect(getComplaintImage).not.toHaveBeenCalled();
});
