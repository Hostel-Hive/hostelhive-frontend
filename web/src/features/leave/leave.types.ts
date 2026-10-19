export type LeaveStatus = 'pending' | 'approved' | 'rejected';
export type LeaveDecision = Exclude<LeaveStatus, 'pending'>;
export interface LeaveRequest {
  leave_id: string;
  request_id: string;
  student_id: string;
  submitted_by: string;
  starts_at: string;
  ends_at: string;
  reason: string;
  status: LeaveStatus;
  created_at: string;
  decided_at: string | null;
  decided_by: string | null;
  decision_note: string;
}
export interface LeavePage {
  items: LeaveRequest[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}
