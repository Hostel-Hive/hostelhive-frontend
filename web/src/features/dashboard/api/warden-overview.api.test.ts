import { beforeEach, expect, it, vi } from 'vitest';
import { getRecentIncidents } from './warden-overview.api';
import {
  emptyIncidentFilters,
  listIncidents,
} from '../../attendance/api/staff-attendance.api';
import { AttendanceError } from '../../attendance/api/student-attendance.api';
import {
  incidentFixture,
  staffPage,
} from '../../../test/fixtures/staffAttendance';
vi.mock('../../attendance/api/staff-attendance.api', async (original) => ({
  ...(await original<
    typeof import('../../attendance/api/staff-attendance.api')
  >()),
  listIncidents: vi.fn(),
}));
beforeEach(() => vi.resetAllMocks());
const signal = () => new AbortController().signal;
it('uses the first authorized newest-first page and displays only five, preserving the full total', async () => {
  const items = Array.from({ length: 20 }, (_, i) => ({
    ...incidentFixture,
    incident_id: `11111111-1111-4111-8111-${String(i + 1).padStart(12, '0')}`,
    occurred_at: new Date(
      Date.parse(incidentFixture.occurred_at) - i * 60000,
    ).toISOString(),
  }));
  vi.mocked(listIncidents).mockResolvedValue(staffPage(items, 0, 42));
  const controller = new AbortController();
  expect(await getRecentIncidents('warden-uid', controller.signal)).toEqual({
    items: items.slice(0, 5),
    total: 42,
  });
  expect(listIncidents).toHaveBeenCalledExactlyOnceWith(
    'warden-uid',
    controller.signal,
    emptyIncidentFilters,
    0,
  );
});
it.each([0, 1, 4])(
  'supports %s recorded incidents without inventing extra records',
  async (count) => {
    const items = Array.from({ length: count }, (_, i) => ({
      ...incidentFixture,
      incident_id: `11111111-1111-4111-8111-${String(i + 1).padStart(12, '0')}`,
    }));
    vi.mocked(listIncidents).mockResolvedValue(staffPage(items));
    expect(await getRecentIncidents('uid', signal())).toEqual({
      items,
      total: count,
    });
  },
);
it.each(['session', 'forbidden', 'unavailable'] as const)(
  'preserves %s failures for the shared resource handler',
  async (kind) => {
    vi.mocked(listIncidents).mockRejectedValue(
      new AttendanceError(kind, 'Failed'),
    );
    await expect(getRecentIncidents('uid', signal())).rejects.toMatchObject({
      kind,
    });
  },
);
