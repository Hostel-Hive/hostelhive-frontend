import { afterEach, expect, it, vi } from 'vitest';
import { MAX_PHOTO_BYTES, validateStudentImage } from './student-image';

afterEach(() => vi.unstubAllGlobals());
function decoder(width: number, height: number, failed = false) {
  const revoke = vi.fn();
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:local'),
    revokeObjectURL: revoke,
  });
  vi.stubGlobal(
    'Image',
    class {
      naturalWidth = width;
      naturalHeight = height;
      onload?: () => void;
      onerror?: () => void;
      set src(_value: string) {
        queueMicrotask(() => (failed ? this.onerror?.() : this.onload?.()));
      }
    },
  );
  return revoke;
}
it('rejects unsupported, empty and oversized files before decoding', async () => {
  await expect(
    validateStudentImage(new File(['svg'], 'x.svg', { type: 'image/svg+xml' })),
  ).rejects.toThrow('JPEG or PNG');
  await expect(
    validateStudentImage(new File([], 'x.png', { type: 'image/png' })),
  ).rejects.toThrow('non-empty');
  const file = new File(['x'], 'x.png', { type: 'image/png' });
  Object.defineProperty(file, 'size', { value: MAX_PHOTO_BYTES + 1 });
  await expect(validateStudentImage(file)).rejects.toThrow('5 MiB');
});
it.each([
  [4096, 2000],
  [3000, 4000],
])(
  'accepts valid dimensions %s × %s and releases the decoding URL',
  async (w, h) => {
    const revoke = decoder(w, h);
    await validateStudentImage(
      new File(['png'], 'photo.png', { type: 'image/png' }),
    );
    expect(revoke).toHaveBeenCalledWith('blob:local');
  },
);
it.each([
  [0, 10],
  [4097, 10],
  [10, 4097],
  [4000, 4000],
])('rejects dimensions %s × %s and releases the URL', async (w, h) => {
  const revoke = decoder(w, h);
  await expect(
    validateStudentImage(new File(['png'], 'photo.png', { type: 'image/png' })),
  ).rejects.toThrow('dimensions');
  expect(revoke).toHaveBeenCalledOnce();
});
it('rejects corrupt images and releases the decoding URL', async () => {
  const revoke = decoder(0, 0, true);
  await expect(
    validateStudentImage(
      new File(['bad'], 'photo.jpg', { type: 'image/jpeg' }),
    ),
  ).rejects.toThrow('could not be read');
  expect(revoke).toHaveBeenCalledOnce();
});
