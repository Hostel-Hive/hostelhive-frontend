import { StudentRequestError, studentResponse } from './students.api';
import {
  MAX_CSV_BYTES,
  parseImportReport,
  STUDENT_CSV_COLUMNS,
} from '../student-import';
import type { ImportReport } from '../student-import';

export async function getStudentImportTemplate(
  uid: string,
  signal: AbortSignal,
): Promise<Blob> {
  const response = await studentResponse('/import/template', uid, signal);
  if (
    response.status !== 200 ||
    response.headers.get('Content-Type')?.split(';')[0].trim() !== 'text/csv'
  )
    throw new Error('Template unavailable.');
  const text = await response.text();
  if (text.trim() !== STUDENT_CSV_COLUMNS.join(','))
    throw new Error('Template unavailable.');
  return new Blob([text], { type: 'text/csv;charset=utf-8' });
}
export async function importStudents(
  file: File,
  uid: string,
  signal: AbortSignal,
): Promise<ImportReport> {
  if (!file.size || file.size > MAX_CSV_BYTES)
    throw new StudentRequestError(
      'invalid',
      'Choose a non-empty CSV up to 2 MiB.',
    );
  const response = await studentResponse('/import', uid, signal, {
    method: 'POST',
    body: file,
    contentType: 'text/csv; charset=utf-8',
  });
  if (response.status !== 200)
    throw new Error('The import result could not be verified.');
  return parseImportReport(await response.json());
}
