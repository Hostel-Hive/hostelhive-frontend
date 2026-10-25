import { expect, it } from 'vitest';
import {
  parseStudentCSV,
  readStudentCSV,
  parseImportReport,
  importReportCSV,
  STUDENT_CSV_COLUMNS,
  MAX_CSV_BYTES,
} from './student-import';
import {
  csvRow,
  makeCSV,
  importReportFixture,
} from '../../test/fixtures/student-import';
it('parses BOM, CRLF, quoted guardian JSON and blank physical lines with record/line positions', () => {
  const rows = parseStudentCSV('\uFEFF\r\n' + makeCSV([csvRow, csvRow]));
  expect(rows).toHaveLength(2);
  expect(rows[0]).toMatchObject({
    record: 1,
    line: 3,
    values: { full_name: 'Alex Morgan', guardians: csvRow[6] },
  });
  expect(rows[1].line).toBe(4);
});
it('supports reordered headers, escaped quotes and multiline cells', () => {
  const row = [...csvRow];
  row[2] = 'Alex "Morgan"\nSecond line';
  const rows = parseStudentCSV(
    makeCSV(
      [row.slice().reverse(), csvRow.slice().reverse()],
      STUDENT_CSV_COLUMNS.slice().reverse(),
    ),
  );
  expect(rows[0].values.full_name).toBe(row[2]);
  expect(rows[1].line).toBe(4);
});
it('parses unquoted cells, trailing empty fields and EOF without a newline', () => {
  const rows = parseStudentCSV(
    STUDENT_CSV_COLUMNS.join(',') + '\n' + csvRow.slice(0, 6).join(',') + ',',
  );
  expect(rows[0].values.guardians).toBe('');
  expect(
    parseStudentCSV(
      STUDENT_CSV_COLUMNS.join(',') +
        '\n' +
        csvRow.slice(0, 6).join(',') +
        ',\r',
    )[0].values.guardians,
  ).toBe('');
});
it.each([
  ['', 'headers'],
  [STUDENT_CSV_COLUMNS.join(','), 'at least one'],
  [
    'user_id,index_no,full_name,faculty,year,contact_phone,extra\na,b,c,d,e,f,g',
    'headers',
  ],
  [
    'user_id,index_no,full_name,faculty,year,contact_phone,user_id\na,b,c,d,e,f,g',
    'headers',
  ],
  [STUDENT_CSV_COLUMNS.join(',') + '\na,b', '7 fields'],
  [STUDENT_CSV_COLUMNS.join(',') + '\n"unclosed', 'Unclosed'],
  [STUDENT_CSV_COLUMNS.join(',') + '\na"b,c,d,e,f,g,h', 'quoting'],
  [STUDENT_CSV_COLUMNS.join(',') + '\n"a"x,b,c,d,e,f,g', 'quoting'],
])('rejects structural errors before submission', (text, error) => {
  expect(() => parseStudentCSV(text)).toThrow(error);
});
it('accepts 100 records and rejects 101 before any request', () => {
  expect(
    parseStudentCSV(makeCSV(Array.from({ length: 100 }, () => csvRow))),
  ).toHaveLength(100);
  expect(() =>
    parseStudentCSV(makeCSV(Array.from({ length: 101 }, () => csvRow))),
  ).toThrow('100');
});
it('reads UTF-8 bytes and rejects invalid encoding, empty, oversized and non-CSV files', async () => {
  const file = new File([makeCSV()], 'students.CSV', {
    type: 'application/vnd.ms-excel',
  });
  Object.defineProperty(file, 'arrayBuffer', {
    value: async () => new TextEncoder().encode(makeCSV()).buffer,
  });
  expect((await readStudentCSV(file)).records).toHaveLength(1);
  const invalid = new File(['x'], 'invalid.csv');
  Object.defineProperty(invalid, 'arrayBuffer', {
    value: async () => new Uint8Array([0xff]).buffer,
  });
  await expect(readStudentCSV(invalid)).rejects.toThrow('UTF-8');
  await expect(readStudentCSV(new File(['x'], 'x.xlsx'))).rejects.toThrow(
    '.csv',
  );
  await expect(readStudentCSV(new File([], 'x.csv'))).rejects.toThrow(
    'non-empty',
  );
  const large = new File(['x'], 'x.csv');
  Object.defineProperty(large, 'size', { value: MAX_CSV_BYTES + 1 });
  await expect(readStudentCSV(large)).rejects.toThrow('2 MiB');
});
it('accepts partial reports and exports only safe record metadata', () => {
  const report = parseImportReport({
    ...importReportFixture,
    private_extra: 'secret',
    rows: importReportFixture.rows.map((row) => ({
      ...row,
      private_extra: 'secret',
    })),
  });
  expect(report).toEqual(importReportFixture);
  expect(importReportCSV(report)).toContain(
    '3,4,not_attempted,,import_interrupted\r\n',
  );
  expect(importReportCSV(report)).not.toContain('secret');
});
it('accepts fully created and rejected reports without a stop reason', () => {
  expect(
    parseImportReport({
      total: 1,
      created: 1,
      rejected: 0,
      not_attempted: 0,
      rows: [importReportFixture.rows[0]],
    }).created,
  ).toBe(1);
  expect(
    parseImportReport({
      total: 1,
      created: 0,
      rejected: 1,
      not_attempted: 0,
      rows: [
        { record: 1, line: 2, status: 'rejected', error: 'duplicate_student' },
      ],
    }).rejected,
  ).toBe(1);
});
it.each([
  null,
  {},
  { ...importReportFixture, total: 501 },
  { ...importReportFixture, total: 2 },
  { ...importReportFixture, stopped_reason: 'private server text' },
  { ...importReportFixture, stopped_reason: undefined },
  { ...importReportFixture, rows: [] },
  ...[
    {
      record: 9,
      line: 2,
      status: 'created',
      student_id: importReportFixture.rows[0].student_id,
    },
    {
      record: 1,
      line: 1,
      status: 'created',
      student_id: importReportFixture.rows[0].student_id,
    },
    { record: 1, line: 2, status: 'unknown' },
    { record: 1, line: 2, status: 'created', student_id: 'bad' },
    {
      record: 1,
      line: 2,
      status: 'created',
      student_id: importReportFixture.rows[0].student_id,
      error: 'invalid_input',
    },
    {
      record: 1,
      line: 2,
      status: 'rejected',
      error: 'raw personal information',
    },
    { record: 1, line: 2, status: 'not_attempted', error: 'invalid_input' },
  ].map((row) => ({
    ...importReportFixture,
    rows: [row, ...importReportFixture.rows.slice(1)],
  })),
  { ...importReportFixture, created: 0, rejected: 2 },
])('rejects malformed or inconsistent reports', (value) => {
  expect(() => parseImportReport(value)).toThrow('could not be verified');
});
