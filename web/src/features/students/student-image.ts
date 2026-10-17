export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export async function validateStudentImage(file: File): Promise<void> {
  if (!['image/jpeg', 'image/png'].includes(file.type))
    throw new Error('Choose a JPEG or PNG photo.');
  if (!file.size || file.size > MAX_PHOTO_BYTES)
    throw new Error('Choose a non-empty photo up to 5 MiB.');
  const url = URL.createObjectURL(file);
  try {
    await new Promise<void>((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const width = image.naturalWidth;
        const height = image.naturalHeight;
        if (
          !width ||
          !height ||
          width > 4096 ||
          height > 4096 ||
          width * height > 12000000
        )
          reject(
            new Error(
              'Photo dimensions must be at most 4096 × 4096 and 12 million pixels.',
            ),
          );
        else resolve();
      };
      image.onerror = () =>
        reject(
          new Error(
            'This photo could not be read. Choose a valid JPEG or PNG.',
          ),
        );
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
