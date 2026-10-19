export type ComplaintStatus = 'pending' | 'in_progress' | 'resolved';
export type ComplaintCategory = 'maintenance' | 'disciplinary';
export interface Complaint {
  complaint_id: string;
  request_id: string;
  student_id: string;
  submitted_by: string;
  category: ComplaintCategory;
  description: string;
  status: ComplaintStatus;
  version: number;
  created_at: string;
  updated_at: string;
}
export interface ComplaintUpdate {
  update_id: string;
  complaint_id: string;
  request_id: string;
  actor_id: string;
  action: 'created' | 'note' | 'status' | 'image_added' | 'image_removed';
  previous_status: ComplaintStatus | null;
  new_status: ComplaintStatus;
  previous_version: number;
  version: number;
  text: string;
  occurred_at: string;
  image_id?: string;
}
export interface ComplaintPage<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}
export interface ComplaintAction {
  request_id: string;
  expected_version: number;
  text: string;
  status?: 'in_progress' | 'resolved';
}
