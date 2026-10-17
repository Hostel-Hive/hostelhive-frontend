import { StudentRequestError, studentResponse } from './students.api';

export async function getStudentQR(
  id: string,
  uid: string,
  signal: AbortSignal,
): Promise<Blob> {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    throw new StudentRequestError('not-found', 'Student QR unavailable.');
  const response = await studentResponse(`/${id}/qr`, uid, signal);
  if (
    response.status !== 200 ||
    response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !==
      'image/png'
  )
    throw new StudentRequestError(
      'unavailable',
      'Unable to load the student QR code.',
    );
  const bytes = await response.arrayBuffer();
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (
    bytes.byteLength <= signature.length ||
    !signature.every((byte, i) => new Uint8Array(bytes)[i] === byte)
  )
    throw new StudentRequestError(
      'unavailable',
      'Unable to load the student QR code.',
    );
  if (signal.aborted) throw new DOMException('Request aborted', 'AbortError');
  return new Blob([bytes], { type: 'image/png' });
}
