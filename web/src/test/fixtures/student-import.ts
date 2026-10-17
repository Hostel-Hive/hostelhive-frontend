import { studentFixture } from './student';
import { STUDENT_CSV_COLUMNS } from '../../features/students/student-import';
import type { ImportReport } from '../../features/students/student-import';
export const csvRow = [
  studentFixture.user_id,
  studentFixture.index_no,
  studentFixture.full_name,
  studentFixture.faculty,
  '2',
  studentFixture.contact_phone,
  JSON.stringify(
    studentFixture.guardians!.map(({ name, relationship, contact_phone }) => ({
      name,
      relationship,
      contact_phone,
    })),
  ),
];
export const makeCSV = (
  rows = [csvRow],
  header: readonly string[] = STUDENT_CSV_COLUMNS,
) =>
  [header, ...rows]
    .map((fields) =>
      fields.map((field) => `"${field.replace(/"/g, '""')}"`).join(','),
    )
    .join('\r\n') + '\r\n';
export const importReportFixture: ImportReport = {
  total: 3,
  created: 1,
  rejected: 1,
  not_attempted: 1,
  stopped_reason: 'import_interrupted',
  rows: [
    {
      record: 1,
      line: 2,
      status: 'created',
      student_id: studentFixture.student_id,
    },
    { record: 2, line: 3, status: 'rejected', error: 'invalid_input' },
    {
      record: 3,
      line: 4,
      status: 'not_attempted',
      error: 'import_interrupted',
    },
  ],
};
