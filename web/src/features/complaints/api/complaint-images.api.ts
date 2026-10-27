import {
  authorizedRequest,
  AuthorizedRequestError,
} from '../../auth/api/authorized-request';
import { uuid } from './complaints.api';
import { MAX_PHOTO_BYTES } from '../../students/student-image';

export interface ComplaintImage {
  image_id: string;
  complaint_id: string;
  content_type: 'image/jpeg' | 'image/png';
  size_bytes: number;
  width: number;
  height: number;
  uploaded_at: string;
}
export interface ComplaintImages {
  items: ComplaintImage[];
  version: number;
}
export class EvidenceError extends Error {
  constructor(
    public readonly kind:
      | 'invalid'
      | 'session'
      | 'setup'
      | 'forbidden'
      | 'not-found'
      | 'conflict'
      | 'unavailable',
    message: string,
  ) {
    super(message);
  }
}
export function evidenceError(error: unknown): EvidenceError {
  if (error instanceof EvidenceError) return error;
  if (error instanceof AuthorizedRequestError && error.kind === 'session')
    return new EvidenceError(
      'session',
      'Your session has expired. Sign in again.',
    );
  return new EvidenceError(
    'unavailable',
    'The evidence request could not be confirmed. Image storage may be unavailable.',
  );
}
export const evidenceAccessError = (error: EvidenceError) =>
  ['session', 'setup', 'forbidden'].includes(error.kind);
const integer = (value: unknown, min = 1): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min;
const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
function path(complaintID: string, imageID?: string) {
  if (
    !uuid(complaintID) ||
    complaintID === '00000000-0000-0000-0000-000000000000' ||
    (imageID !== undefined &&
      (!uuid(imageID) || imageID === '00000000-0000-0000-0000-000000000000'))
  )
    throw new EvidenceError('invalid', 'Choose a valid complaint image.');
  return `/api/v1/complaints/${complaintID.toLowerCase()}/images${imageID ? `/${imageID.toLowerCase()}` : ''}`;
}
function validImage(
  value: unknown,
  complaintID: string,
): value is ComplaintImage {
  if (!record(value)) return false;
  return (
    uuid(value.image_id) &&
    value.complaint_id === complaintID.toLowerCase() &&
    ['image/jpeg', 'image/png'].includes(String(value.content_type)) &&
    integer(value.size_bytes) &&
    value.size_bytes <= MAX_PHOTO_BYTES &&
    integer(value.width) &&
    integer(value.height) &&
    value.width <= 4096 &&
    value.height <= 4096 &&
    value.width * value.height <= 12000000 &&
    typeof value.uploaded_at === 'string' &&
    /^\d{4}-\d\d-\d\dT/.test(value.uploaded_at) &&
    Number.isFinite(Date.parse(value.uploaded_at))
  );
}
async function checked(response: Response, statuses: number[]) {
  if (statuses.includes(response.status)) return response;
  const body: unknown = await response.json().catch(() => null);
  const code = record(body) ? body.error : undefined;
  if (response.status === 401)
    throw new EvidenceError(
      'session',
      'Your session has expired. Sign in again.',
    );
  if (response.status === 403)
    throw new EvidenceError(
      code === 'setup_required' ? 'setup' : 'forbidden',
      code === 'setup_required'
        ? 'Complete your student setup before accessing evidence.'
        : 'Your account cannot access this evidence.',
    );
  if (response.status === 404)
    throw new EvidenceError(
      'not-found',
      'This complaint or image is unavailable. Check its current state.',
    );
  if (response.status === 409)
    throw new EvidenceError(
      'conflict',
      'Evidence changed, the three-image limit was reached, or the complaint no longer accepts changes. Check the current complaint and evidence before continuing.',
    );
  if ([400, 413, 415].includes(response.status))
    throw new EvidenceError(
      'invalid',
      'Choose a valid JPEG or PNG up to 5 MiB, 4096 pixels per side and 12 million pixels.',
    );
  throw evidenceError(null);
}
export async function listComplaintImages(
  complaintID: string,
  uid: string,
  signal: AbortSignal,
): Promise<ComplaintImages> {
  try {
    const response = await checked(
      await authorizedRequest(path(complaintID), uid, signal),
      [200],
    );
    const value: unknown = await response.json();
    if (
      !record(value) ||
      !integer(value.version) ||
      !Array.isArray(value.items) ||
      value.items.length > 3 ||
      !value.items.every((item) => validImage(item, complaintID)) ||
      new Set(value.items.map((item) => item.image_id)).size !==
        value.items.length ||
      signal.aborted
    )
      throw evidenceError(null);
    return { items: value.items, version: value.version };
  } catch (error) {
    throw evidenceError(error);
  }
}
export async function getComplaintImage(
  image: ComplaintImage,
  uid: string,
  signal: AbortSignal,
): Promise<Blob> {
  try {
    if (!validImage(image, image.complaint_id))
      throw new EvidenceError('invalid', 'Invalid image metadata.');
    const response = await checked(
      await authorizedRequest(
        path(image.complaint_id, image.image_id),
        uid,
        signal,
      ),
      [200],
    );
    if (
      response.headers.get('Content-Type')?.split(';')[0].trim() !==
      image.content_type
    )
      throw evidenceError(null);
    const blob = await response.blob();
    if (blob.size !== image.size_bytes || signal.aborted)
      throw evidenceError(null);
    const bytes = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
    const png = [137, 80, 78, 71, 13, 10, 26, 10];
    if (
      image.content_type === 'image/png'
        ? !png.every((byte, index) => bytes[index] === byte)
        : bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255
    )
      throw evidenceError(null);
    return blob;
  } catch (error) {
    throw evidenceError(error);
  }
}
export async function uploadComplaintImage(
  complaintID: string,
  imageID: string,
  file: File,
  uid: string,
  signal: AbortSignal,
): Promise<{ image: ComplaintImage; version: number; replayed: boolean }> {
  try {
    const destination = path(complaintID, imageID);
    if (
      !['image/jpeg', 'image/png'].includes(file.type) ||
      !file.size ||
      file.size > MAX_PHOTO_BYTES
    )
      throw new EvidenceError('invalid', 'Choose a JPEG or PNG up to 5 MiB.');
    const response = await checked(
      await authorizedRequest(destination, uid, signal, {
        method: 'PUT',
        contentType: file.type,
        body: file,
      }),
      [200, 201],
    );
    const value: unknown = await response.json();
    if (
      !record(value) ||
      !validImage(value.image, complaintID) ||
      value.image.image_id !== imageID.toLowerCase() ||
      value.image.content_type !== file.type ||
      !integer(value.version, 2) ||
      typeof value.replayed !== 'boolean' ||
      value.replayed !== (response.status === 200) ||
      signal.aborted
    )
      throw evidenceError(null);
    return {
      image: value.image,
      version: value.version,
      replayed: value.replayed,
    };
  } catch (error) {
    throw evidenceError(error);
  }
}
export async function removeComplaintImage(
  complaintID: string,
  imageID: string,
  uid: string,
  signal: AbortSignal,
): Promise<{
  image_id: string;
  removed: true;
  version: number;
  replayed: boolean;
}> {
  try {
    const response = await checked(
      await authorizedRequest(path(complaintID, imageID), uid, signal, {
        method: 'DELETE',
      }),
      [200],
    );
    const value: unknown = await response.json();
    // Removal returns JSON, including the original audit version on exact replay.
    if (
      !record(value) ||
      value.image_id !== imageID.toLowerCase() ||
      value.removed !== true ||
      !integer(value.version, 2) ||
      typeof value.replayed !== 'boolean' ||
      signal.aborted
    )
      throw evidenceError(null);
    return {
      image_id: value.image_id as string,
      removed: true,
      version: value.version,
      replayed: value.replayed,
    };
  } catch (error) {
    throw evidenceError(error);
  }
}
