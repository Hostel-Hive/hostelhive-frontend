import type {
  CheckoutInput,
  CheckoutResult,
} from '../../features/students/api/student-checkout.api';
import { studentFixture } from './student';
import { allocationFixture } from './allocation';

export const checkoutInputFixture: CheckoutInput = {
  request_id: '12121212-1212-4212-8212-121212121212',
  reason: 'graduated',
  notes: 'Completed clearance',
  deactivate_account: true,
  confirmed: true,
};
export function checkoutResultFixture(
  input: CheckoutInput = checkoutInputFixture,
): CheckoutResult {
  return {
    replayed: false,
    revocation_pending: input.deactivate_account,
    checkout: {
      checkout_id: '13131313-1313-4313-8313-131313131313',
      request_id: input.request_id,
      student_id: studentFixture.student_id,
      user_id: studentFixture.user_id,
      reason: input.reason,
      notes: input.notes,
      deactivate_account: input.deactivate_account,
      account_active_after: !input.deactivate_account,
      profile_was_archived: false,
      archived_at: '2026-10-25T15:00:00Z',
      released_allocation_id: allocationFixture.allocation_id,
      released_bed_id: allocationFixture.bed_id,
      performed_by: '14141414-1414-4414-8414-141414141414',
      performed_at: '2026-10-25T15:00:00Z',
    },
  };
}
