export interface Allocation {
  allocation_id: string;
  student_id: string;
  bed_id: string;
  started_at: string;
  ended_at: string | null;
  started_by: string | null;
  ended_by: string | null;
  end_reason: 'revoked' | 'transferred' | null;
}
export interface AllocationPage {
  items: Allocation[];
  total: number;
  limit: number;
  offset: number;
}
export type AllocationAction = 'assign' | 'transfer' | 'revoke';
