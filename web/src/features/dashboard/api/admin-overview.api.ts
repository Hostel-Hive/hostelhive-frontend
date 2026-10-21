import { AuthorizedRequestError } from '../../auth/api/authorized-request';
import { AttendanceError } from '../../attendance/api/student-attendance.api';
import {
  ComplaintError,
  listComplaints,
} from '../../complaints/api/complaints.api';
import {
  InventoryManagementError,
  browseInventory,
} from '../../inventory/api/inventory-management.api';
import { LeaveError, listLeaves } from '../../leave/api/leave.api';
import {
  LateAccessError,
  listLateAccessRequests,
} from '../../late-access/api/late-access.api';

export type OverviewMetric =
  'leaves' | 'access' | 'pendingComplaints' | 'progressComplaints';
export class OverviewError extends Error {
  constructor(
    public readonly kind: 'session' | 'forbidden' | 'unavailable',
    message: string,
  ) {
    super(message);
  }
}
export function overviewError(reason: unknown): OverviewError {
  if (reason instanceof OverviewError) return reason;
  if (
    reason instanceof AuthorizedRequestError ||
    reason instanceof AttendanceError ||
    reason instanceof ComplaintError ||
    reason instanceof InventoryManagementError ||
    reason instanceof LeaveError ||
    reason instanceof LateAccessError
  ) {
    if (reason.kind === 'session')
      return new OverviewError(
        'session',
        'Your session has expired. Sign in again.',
      );
    if (reason.kind === 'forbidden')
      return new OverviewError(
        'forbidden',
        'Your account can no longer access this overview.',
      );
  }
  return new OverviewError(
    'unavailable',
    'This summary could not be loaded. Please retry.',
  );
}
export async function getOverviewCount(
  metric: OverviewMetric,
  uid: string,
  signal: AbortSignal,
): Promise<number> {
  const params = new URLSearchParams({
    status: metric === 'progressComplaints' ? 'in_progress' : 'pending',
  });
  const result =
    metric === 'leaves'
      ? await listLeaves(params, uid, signal)
      : metric === 'access'
        ? await listLateAccessRequests(params, uid, signal)
        : await listComplaints(params, uid, signal);
  // Feature APIs validate responses. Use the full backend total, not page length.
  return result.total;
}
export interface OverviewBlock {
  block_id: string;
  name: string;
  room_count: number;
  capacity: number;
  occupied_beds: number;
  available_beds: number;
}
export interface OverviewBlocks {
  items: OverviewBlock[];
  total: number;
  offset: number;
}
export async function getOverviewBlocks(
  uid: string,
  signal: AbortSignal,
  offset = 0,
): Promise<OverviewBlocks> {
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset > 100000 ||
    offset % 20
  )
    throw overviewError(null);
  const page = await browseInventory({ offset }, uid, signal);
  return {
    total: page.total,
    offset,
    items: page.items.map((block) => ({
      block_id: block.block_id,
      name: block.name!,
      room_count: block.room_count!,
      capacity: block.capacity!,
      occupied_beds: block.occupied_beds!,
      available_beds: block.available_beds!,
    })),
  };
}
