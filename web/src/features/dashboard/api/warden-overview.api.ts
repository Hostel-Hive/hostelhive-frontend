import {
  emptyIncidentFilters,
  listIncidents,
} from '../../attendance/api/staff-attendance.api';
import type { Incident } from '../../attendance/api/staff-attendance.api';
export interface RecentIncidentsPage {
  items: Incident[];
  total: number;
}
export async function getRecentIncidents(
  uid: string,
  signal: AbortSignal,
): Promise<RecentIncidentsPage> {
  // The existing API validates a newest-first page. Fetch only the first page;
  // its full total is not a count of today's incidents or unresolved cases.
  const page = await listIncidents(uid, signal, emptyIncidentFilters, 0);
  return { items: page.items.slice(0, 5), total: page.total };
}
