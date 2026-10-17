import {
  StudentRequestError,
  studentResponse,
  validStudent,
} from './students.api';
import type { Student } from '../student.types';

function imagePath(id: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    throw new StudentRequestError('not-found', 'Student profile not found.');
  // Always derive the destination locally; never send a token to a response URL.
  return `/${id}/image`;
}
export async function getStudentImage(
  id: string,
  uid: string,
  signal: AbortSignal,
): Promise<Blob | null> {
  const path = imagePath(id);
  let response: Response;
  try {
    response = await studentResponse(path, uid, signal);
  } catch (error) {
    if (error instanceof StudentRequestError && error.kind === 'not-found')
      return null;
    throw error;
  }
  const type = response.headers.get('Content-Type')?.split(';')[0].trim();
  if (
    response.status !== 200 ||
    !['image/jpeg', 'image/png'].includes(type ?? '')
  )
    throw new StudentRequestError(
      'unavailable',
      'Unable to display this photo.',
    );
  const blob = await response.blob();
  if (!blob.size)
    throw new StudentRequestError(
      'unavailable',
      'Unable to display this photo.',
    );
  return blob;
}
export async function uploadStudentImage(
  id: string,
  file: File,
  uid: string,
  signal: AbortSignal,
): Promise<Student> {
  const response = await studentResponse(imagePath(id), uid, signal, {
    method: 'PUT',
    body: file,
    contentType: file.type,
  });
  const value: unknown = await response.json();
  if (
    response.status !== 200 ||
    !validStudent(value) ||
    value.student_id.toLowerCase() !== id.toLowerCase() ||
    !value.profile_image_url
  )
    throw new StudentRequestError(
      'unavailable',
      'Unable to confirm the photo update.',
    );
  return value;
}
export async function removeStudentImage(
  id: string,
  uid: string,
  signal: AbortSignal,
): Promise<void> {
  const response = await studentResponse(imagePath(id), uid, signal, {
    method: 'DELETE',
  });
  if (response.status !== 204)
    throw new StudentRequestError(
      'unavailable',
      'Unable to confirm photo removal.',
    );
}
