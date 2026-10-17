export const STUDENT_CSV_COLUMNS = [
  'user_id',
  'index_no',
  'full_name',
  'faculty',
  'year',
  'contact_phone',
  'guardians',
] as const;
export const MAX_CSV_BYTES = 2 * 1024 * 1024;
export interface CSVRecord {
  record: number;
  line: number;
  values: Record<(typeof STUDENT_CSV_COLUMNS)[number], string>;
}
export interface StudentCSV {
  file: File;
  records: CSVRecord[];
}

// Strict quoted CSV, including escaped quotes, multiline fields and CRLF.
// This checks document structure only; the server validates each row's fields.
export function parseStudentCSV(source: string): CSVRecord[] {
  const text = source
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r$/, '');
  const rows: { line: number; fields: string[] }[] = [];
  let fields: string[] = [],
    field = '',
    mode: 'plain' | 'quoted' | 'closed' = 'plain';
  let line = 1,
    start = 1,
    started = false;
  function finish() {
    if (started || fields.length || field) {
      rows.push({ line: start, fields: [...fields, field] });
      if (rows.length > 501)
        throw new Error('A CSV can contain at most 500 student records.');
    }
    fields = [];
    field = '';
    started = false;
    mode = 'plain';
  }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (mode === 'quoted') {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else mode = 'closed';
      } else {
        field += ch;
        if (ch === '\n') line++;
      }
      continue;
    }
    if (ch === ',' || ch === '\n') {
      if (ch === ',') {
        fields.push(field);
        field = '';
        mode = 'plain';
        started = true;
      } else {
        finish();
        line++;
        start = line;
      }
    } else if (ch === '"' && mode === 'plain' && field === '') {
      mode = 'quoted';
      started = true;
    } else {
      if (ch === '"' || mode === 'closed')
        throw new Error(`Invalid CSV quoting at line ${line}.`);
      field += ch;
      started = true;
    }
  }
  if (mode === 'quoted')
    throw new Error(`Unclosed CSV quote at line ${start}.`);
  finish();
  const header = rows.shift()?.fields ?? [];
  if (
    header.length !== 7 ||
    new Set(header).size !== 7 ||
    !STUDENT_CSV_COLUMNS.every((column) => header.includes(column))
  )
    throw new Error(
      'Use the template headers exactly once, with no extra or missing columns.',
    );
  if (!rows.length)
    throw new Error('Add at least one student record below the header.');
  return rows.map((row, i) => {
    if (row.fields.length !== 7)
      throw new Error(
        `Expected 7 fields at line ${row.line}. Check commas and quoted guardian JSON.`,
      );
    const values = Object.fromEntries(
      header.map((column, index) => [column, row.fields[index]]),
    ) as CSVRecord['values'];
    return { record: i + 1, line: row.line, values };
  });
}
export async function readStudentCSV(file: File): Promise<StudentCSV> {
  if (!file.name.toLowerCase().endsWith('.csv'))
    throw new Error('Choose a .csv file.');
  if (!file.size || file.size > MAX_CSV_BYTES)
    throw new Error('Choose a non-empty CSV up to 2 MiB.');
  const bytes = await file.arrayBuffer();
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('Save the CSV with UTF-8 encoding.');
  }
  return { file, records: parseStudentCSV(text) };
}

export const IMPORT_ERRORS = {
  invalid_input: 'Student or guardian details are invalid.',
  duplicate_in_file: 'Duplicate account or student ID in this file.',
  duplicate_student:
    'An existing or archived profile already uses this account or student ID.',
  active_student_account_required:
    'An existing active student account is required.',
  forbidden: 'Administrator access changed. Further imports were stopped.',
  student_profiles_unavailable:
    'Student service unavailable; check the directory before retrying.',
  import_interrupted:
    'Import interrupted; check the directory before retrying.',
} as const;
export type ImportErrorCode = keyof typeof IMPORT_ERRORS;
export interface ImportRow {
  record: number;
  line: number;
  status: 'created' | 'rejected' | 'not_attempted';
  student_id?: string;
  error?: ImportErrorCode;
}
export interface ImportReport {
  total: number;
  created: number;
  rejected: number;
  not_attempted: number;
  stopped_reason?: ImportErrorCode;
  rows: ImportRow[];
}

export function parseImportReport(value: unknown): ImportReport {
  const invalid = () => {
    throw new Error(
      'The import result could not be verified. Check the directory before retrying.',
    );
  };
  if (!value || typeof value !== 'object') return invalid();
  const report = value as ImportReport;
  const count = (n: unknown) =>
    Number.isInteger(n) && Number(n) >= 0 && Number(n) <= 500;
  const known = (code: unknown): code is ImportErrorCode =>
    typeof code === 'string' && Object.hasOwn(IMPORT_ERRORS, code);
  if (
    ![
      report.total,
      report.created,
      report.rejected,
      report.not_attempted,
    ].every(count) ||
    !report.total ||
    report.created + report.rejected + report.not_attempted !== report.total ||
    !Array.isArray(report.rows) ||
    report.rows.length !== report.total ||
    (report.stopped_reason !== undefined &&
      ![
        'forbidden',
        'student_profiles_unavailable',
        'import_interrupted',
      ].includes(report.stopped_reason))
  )
    return invalid();
  const counts = { created: 0, rejected: 0, not_attempted: 0 };
  let previousLine = 1;
  for (const [index, row] of report.rows.entries()) {
    if (
      !row ||
      row.record !== index + 1 ||
      !Number.isInteger(row.line) ||
      row.line <= previousLine ||
      !Object.hasOwn(counts, row.status)
    )
      return invalid();
    previousLine = row.line;
    if (row.status === 'created') {
      if (
        typeof row.student_id !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          row.student_id,
        ) ||
        row.error !== undefined
      )
        return invalid();
    } else if (
      !known(row.error) ||
      row.student_id !== undefined ||
      (row.status === 'not_attempted' &&
        (!report.stopped_reason || row.error !== report.stopped_reason))
    )
      return invalid();
    counts[row.status]++;
  }
  if (
    Object.entries(counts).some(
      ([status, n]) => report[status as keyof typeof counts] !== n,
    )
  )
    return invalid();
  // Copy only the documented fields. Never render or export arbitrary response text.
  return {
    total: report.total,
    ...counts,
    ...(report.stopped_reason ? { stopped_reason: report.stopped_reason } : {}),
    rows: report.rows.map(({ record, line, status, student_id, error }) => ({
      record,
      line,
      status,
      ...(student_id ? { student_id } : {}),
      ...(error ? { error } : {}),
    })),
  };
}
export function importReportCSV(report: ImportReport): string {
  return (
    [
      'record,line,status,student_id,error',
      ...report.rows.map((row) =>
        [
          row.record,
          row.line,
          row.status,
          row.student_id ?? '',
          row.error ?? '',
        ].join(','),
      ),
    ].join('\r\n') + '\r\n'
  );
}
