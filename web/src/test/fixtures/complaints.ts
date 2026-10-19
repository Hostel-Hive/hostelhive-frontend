import type {
  Complaint,
  ComplaintAction,
  ComplaintPage,
  ComplaintUpdate,
} from '../../features/complaints/complaints.types';
export const complaintFixture: Complaint = {
  complaint_id: '11111111-1111-4111-8111-111111111111',
  request_id: '22222222-2222-4222-8222-222222222222',
  student_id: '33333333-3333-4333-8333-333333333333',
  submitted_by: '44444444-4444-4444-8444-444444444444',
  category: 'maintenance',
  description: 'Window latch needs repair',
  status: 'pending',
  version: 1,
  created_at: '2026-10-19T10:00:00Z',
  updated_at: '2026-10-19T10:00:00Z',
};
export const complaintActionID = '55555555-5555-4555-8555-555555555555';
export const createdUpdate: ComplaintUpdate = {
  update_id: '66666666-6666-4666-8666-666666666666',
  complaint_id: complaintFixture.complaint_id,
  request_id: complaintFixture.request_id,
  actor_id: complaintFixture.submitted_by,
  action: 'created',
  previous_status: null,
  new_status: 'pending',
  previous_version: 0,
  version: 1,
  text: complaintFixture.description,
  occurred_at: complaintFixture.created_at,
};
export const noteInput: ComplaintAction = {
  request_id: complaintActionID,
  expected_version: 1,
  text: 'Repair assigned',
};
export const noteUpdate: ComplaintUpdate = {
  ...createdUpdate,
  update_id: '77777777-7777-4777-8777-777777777777',
  request_id: complaintActionID,
  actor_id: '88888888-8888-4888-8888-888888888888',
  action: 'note',
  previous_status: 'pending',
  previous_version: 1,
  version: 2,
  text: noteInput.text,
  occurred_at: '2026-10-19T11:00:00Z',
};
export const complaintPage = <T>(
  items: T[],
  offset = 0,
  total = items.length,
): ComplaintPage<T> => ({
  items,
  offset,
  total,
  limit: 20,
  has_more: offset + items.length < total,
});
