export type LateAccessStatus = 'pending' | 'approved' | 'rejected';
export type LateAccessDecision = Exclude<LateAccessStatus, 'pending'>;
export interface LateAccessRequest {
  late_access_id: string;
  request_id: string;
  student_id: string;
  submitted_by: string;
  direction: 'IN' | 'OUT';
  expected_at: string;
  reason: string;
  status: LateAccessStatus;
  created_at: string;
  decided_at: string | null;
  decided_by: string | null;
  decision_note: string;
  consumed_at?: string;
  consumed_device_id?: string;
  consumed_event_id?: string;
}
export interface LateAccessPage {
  items: LateAccessRequest[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}
