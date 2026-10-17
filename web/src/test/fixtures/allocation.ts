import type {
  Allocation,
  AllocationPage,
} from '../../features/allocation/allocation.types';
import { studentFixture } from './student';
export const allocationFixture: Allocation = {
  allocation_id: '55555555-5555-4555-8555-555555555555',
  student_id: studentFixture.student_id,
  bed_id: '44444444-4444-4444-8444-444444444444',
  started_at: '2026-10-01T10:00:00Z',
  ended_at: null,
  started_by: studentFixture.user_id,
  ended_by: null,
  end_reason: null,
};
export const blockFixture = {
  block_id: '66666666-6666-4666-8666-666666666666',
  name: 'North',
};
export const roomFixture = {
  room_id: '77777777-7777-4777-8777-777777777777',
  block_id: blockFixture.block_id,
  room_no: '101',
};
export const bedFixture = {
  bed_id: '88888888-8888-4888-8888-888888888888',
  room_id: roomFixture.room_id,
  block_id: blockFixture.block_id,
  bed_no: '2',
  available: true,
};
export const newAllocationFixture: Allocation = {
  ...allocationFixture,
  allocation_id: '99999999-9999-4999-8999-999999999999',
  bed_id: bedFixture.bed_id,
};
export const allocationPage = (
  items: Allocation[] = [],
  offset = 0,
  total = items.length,
): AllocationPage => ({ items, offset, total, limit: 10 });
