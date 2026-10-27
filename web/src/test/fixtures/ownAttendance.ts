import type { OwnHistoryPage } from '../../features/student-portal/api/own-attendance.api';

export function ownHistoryPage(offset = 0, total = 2): OwnHistoryPage {
  return {
    items: Array.from(
      { length: Math.min(20, Math.max(0, total - offset)) },
      (_, i) => ({
        movement_id: (offset + i + 1).toString(16).padStart(64, '0'),
        // The same event ID can occur at multiple scanners; movement_id is the key.
        event_id: '10000000-0000-0000-0000-000000000001',
        direction: (offset + i) % 2 ? 'OUT' : 'IN',
        occurred_at: new Date(
          Date.parse('2026-10-19T18:45:00Z') - (offset + i) * 60000,
        ).toISOString(),
      }),
    ),
    total,
    limit: 20,
    offset,
    has_more: offset + 20 < total,
    timezone: 'Asia/Colombo',
    from: null,
    to: null,
  };
}
