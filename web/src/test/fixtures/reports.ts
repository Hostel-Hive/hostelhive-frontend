import type {
  ReportFilters,
  ReportKind,
  ReportPage,
} from '../../features/reports/reports.types';
export const reportFilters: ReportFilters = {
  from: '2026-10-19',
  to: '2026-10-20',
  studentID: '',
  direction: '',
  status: '',
  category: '',
};
export const reportID = '11111111-1111-4111-8111-111111111111';
export const otherReportID = '22222222-2222-4222-8222-222222222222';
export const reportMovement = {
  event_id: reportID,
  device_id: otherReportID,
  student_id: reportID,
  direction: 'IN' as const,
  occurred_at: '2026-10-20T08:00:00Z',
};
export const reportLeave = {
  leave_id: reportID,
  request_id: otherReportID,
  student_id: reportID,
  submitted_by: otherReportID,
  starts_at: '2026-10-22T08:00:00Z',
  ends_at: '2026-10-23T08:00:00Z',
  reason: 'Visit family',
  status: 'pending' as const,
  created_at: '2026-10-20T08:00:00Z',
  decided_at: null,
  decided_by: null,
  decision_note: '',
  cancelled_at: null,
  cancelled_by: null,
};
export const reportComplaint = {
  complaint_id: reportID,
  request_id: otherReportID,
  student_id: reportID,
  submitted_by: otherReportID,
  category: 'maintenance' as const,
  description: 'Window needs repair',
  status: 'pending' as const,
  version: 1,
  created_at: '2026-10-20T08:00:00Z',
  updated_at: '2026-10-20T08:00:00Z',
  resolution: null,
};
export function reportFixture(
  kind: ReportKind = 'attendance',
  offset = 0,
): ReportPage {
  const base = {
    from: reportFilters.from,
    to: reportFilters.to,
    timezone: 'Asia/Colombo',
    total: 1,
    limit: 20,
    offset,
    has_more: false,
  };
  const summary = { entries: 1, exits: 0, distinct_students: 1 };
  if (kind === 'attendance')
    return { ...base, kind, summary, items: offset ? [] : [reportMovement] };
  if (kind === 'daily')
    return {
      ...base,
      total: 2,
      kind,
      summary,
      items: offset
        ? []
        : [
            { date: '2026-10-20', ...summary },
            { date: '2026-10-19', entries: 0, exits: 0, distinct_students: 0 },
          ],
    };
  if (kind === 'leaves')
    return {
      ...base,
      kind,
      summary: { pending: 1, approved: 0, rejected: 0, cancelled: 0 },
      items: offset ? [] : [reportLeave],
    };
  return {
    ...base,
    kind,
    summary: {
      by_status: { pending: 1, in_progress: 0, resolved: 0 },
      by_category: { maintenance: 1, disciplinary: 0 },
    },
    items: offset ? [] : [reportComplaint],
  };
}
