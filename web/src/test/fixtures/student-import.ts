import { studentFixture } from './student';
import { STUDENT_CSV_COLUMNS } from '../../features/students/student-import';
import type { ImportReport } from '../../features/students/student-import';
export const csvRow = [
  'alex@students.example.edu',
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

export const registrationReportFixture = {
  total: 3,
  queued: 1,
  replayed: 0,
  rejected: 1,
  not_attempted: 1,
  retry_required: 0,
  stopped_reason: 'import_interrupted',
  rows: [
    {
      record: 1,
      line: 2,
      status: 'queued',
      invitation_id: '00000000-0000-4000-8000-000000000001',
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
