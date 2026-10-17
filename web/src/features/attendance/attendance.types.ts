export type PresenceStatus = 'IN' | 'OUT' | 'UNKNOWN';
export interface StudentPresence {
  student_id: string;
  status: PresenceStatus;
  updated_at: string | null;
}
export type ScanOutcome =
  'recorded' | 'cooldown' | 'already_in' | 'already_out';
export type AccessResult =
  'approved' | 'unapproved' | 'not_required' | 'not_evaluated';
export interface AttendanceScan {
  student_id: string;
  event_id: string;
  device_id: string;
  direction: 'IN' | 'OUT';
  outcome: ScanOutcome;
  occurred_at: string;
  access_result?: AccessResult;
  late_access_id?: string;
  incident_id?: string;
}
export interface ScanPage {
  items: AttendanceScan[];
  limit: number;
  offset: number;
  has_more: boolean;
}
