export type ReportKind = 'attendance' | 'daily' | 'leaves' | 'complaints';
export type ExportFormat = 'pdf' | 'xlsx';
export interface ReportFilters {
  from: string;
  to: string;
  studentID: string;
  direction: string;
  status: string;
  category: string;
}
export const emptyReportFilters: ReportFilters = {
  from: '',
  to: '',
  studentID: '',
  direction: '',
  status: '',
  category: '',
};
export interface Movement {
  event_id: string;
  device_id: string;
  student_id: string;
  direction: 'IN' | 'OUT';
  occurred_at: string;
  access_result?: string | null;
  late_access_id?: string | null;
  incident_id?: string | null;
}
export interface AttendanceTotals {
  entries: number;
  exits: number;
  distinct_students: number;
}
export interface DailyRecord extends AttendanceTotals {
  date: string;
}
export interface ReportLeave {
  leave_id: string;
  request_id: string;
  student_id: string;
  submitted_by: string;
  starts_at: string;
  ends_at: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  created_at: string;
  decided_at: string | null;
  decided_by: string | null;
  decision_note: string;
  cancelled_at?: string | null;
  cancelled_by?: string | null;
}
export interface ReportComplaint {
  complaint_id: string;
  request_id: string;
  student_id: string;
  submitted_by: string;
  category: 'maintenance' | 'disciplinary';
  description: string;
  status: 'pending' | 'in_progress' | 'resolved';
  version: number;
  created_at: string;
  updated_at: string;
  resolution: {
    update_id: string;
    resolved_at: string;
    resolved_by: string;
    note: string;
  } | null;
}
export interface ReportMetadata {
  from: string;
  to: string;
  timezone: string;
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}
export interface LeaveTotals {
  pending: number;
  approved: number;
  rejected: number;
  cancelled: number;
}
export interface ComplaintTotals {
  by_status: { pending: number; in_progress: number; resolved: number };
  by_category: { maintenance: number; disciplinary: number };
}
export type ReportPage = ReportMetadata &
  (
    | { kind: 'attendance'; items: Movement[]; summary: AttendanceTotals }
    | { kind: 'daily'; items: DailyRecord[]; summary: AttendanceTotals }
    | { kind: 'leaves'; items: ReportLeave[]; summary: LeaveTotals }
    | { kind: 'complaints'; items: ReportComplaint[]; summary: ComplaintTotals }
  );
export const reportTitles: Record<ReportKind, string> = {
  attendance: 'Attendance movements',
  daily: 'Daily attendance',
  leaves: 'Leave requests',
  complaints: 'Complaints',
};
