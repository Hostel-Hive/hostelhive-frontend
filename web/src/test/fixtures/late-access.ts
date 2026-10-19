import type {
  LateAccessPage,
  LateAccessRequest,
} from '../../features/late-access/late-access.types';
export const lateAccessFixture: LateAccessRequest = {
  late_access_id: '11111111-1111-4111-8111-111111111111',
  request_id: '22222222-2222-4222-8222-222222222222',
  student_id: '33333333-3333-4333-8333-333333333333',
  submitted_by: '44444444-4444-4444-8444-444444444444',
  expected_at: '2027-03-01T16:00:00Z',
  direction: 'IN',
  created_at: '2027-02-20T10:00:00Z',
  reason: 'Travel delay',
  status: 'pending',
  decided_at: null,
  decided_by: null,
  decision_note: '',
};
export const decidedLateAccess = (
  status: 'approved' | 'rejected' = 'approved',
  note = 'Reviewed',
): LateAccessRequest => ({
  ...lateAccessFixture,
  status,
  decision_note: note,
  decided_at: '2027-02-21T10:00:00Z',
  decided_by: '55555555-5555-4555-8555-555555555555',
});
export const lateAccessPage = (
  items: LateAccessRequest[] = [lateAccessFixture],
  offset = 0,
  total = items.length,
): LateAccessPage => ({
  items,
  offset,
  total,
  limit: 20,
  has_more: offset + items.length < total,
});
export const consumedLateAccess: LateAccessRequest = {
  ...decidedLateAccess(),
  consumed_at: '2027-03-01T16:10:00Z',
  consumed_device_id: '66666666-6666-4666-8666-666666666666',
  consumed_event_id: '77777777-7777-4777-8777-777777777777',
};
