import {
  ownResponse,
  portalError,
  StudentPortalError,
} from './student-portal.api';

export interface HistoryFilters {
  from: string;
  to: string;
  direction: '' | 'IN' | 'OUT';
}
export interface OwnMovement {
  movement_id: string;
  event_id: string;
  direction: 'IN' | 'OUT';
  occurred_at: string;
}
export interface OwnHistoryPage {
  items: OwnMovement[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
  timezone: string;
  from: string | null;
  to: string | null;
}
export const historyPageSize = 20;
export const emptyHistoryFilters: HistoryFilters = {
  from: '',
  to: '',
  direction: '',
};

function calendarDate(value: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value < '0001-01-01' ||
    value > '9998-12-31'
  )
    return NaN;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) &&
    new Date(time).toISOString().slice(0, 10) === value
    ? time
    : NaN;
}
export function validateHistoryFilters(filters: HistoryFilters): string {
  if (!['', 'IN', 'OUT'].includes(filters.direction))
    return 'Choose a valid movement direction.';
  if (!filters.from && !filters.to) return '';
  if (!filters.from || !filters.to)
    return 'Enter both the From date and To date.';
  const start = calendarDate(filters.from);
  const end = calendarDate(filters.to);
  if (!Number.isFinite(start) || !Number.isFinite(end))
    return 'Enter valid calendar dates between years 0001 and 9998.';
  if (end < start) return 'To date must be on or after From date.';
  if (end - start > 365 * 86400000)
    return 'Choose a date range of no more than 366 days, including both dates.';
  return '';
}
const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const timestamp = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?(?:Z|[+-]\d\d:\d\d)$/.test(
    value,
  ) &&
  Number.isFinite(Date.parse(value));
function validMovement(
  value: unknown,
  filters: HistoryFilters,
): value is OwnMovement {
  return (
    record(value) &&
    typeof value.movement_id === 'string' &&
    /^[0-9a-f]{64}$/.test(value.movement_id) &&
    typeof value.event_id === 'string' &&
    /^(?!00000000-0000-0000-0000-000000000000)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value.event_id,
    ) &&
    (value.direction === 'IN' || value.direction === 'OUT') &&
    (!filters.direction || value.direction === filters.direction) &&
    timestamp(value.occurred_at)
  );
}
export async function getOwnAttendance(
  uid: string,
  signal: AbortSignal,
  filters: HistoryFilters = emptyHistoryFilters,
  offset = 0,
): Promise<OwnHistoryPage> {
  try {
    const invalid = validateHistoryFilters(filters);
    if (
      invalid ||
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset > 1000000
    )
      throw new StudentPortalError(
        'unavailable',
        invalid || 'Invalid attendance page.',
      );
    const query = new URLSearchParams({
      limit: String(historyPageSize),
      offset: String(offset),
    });
    if (filters.from) {
      query.set('from', filters.from);
      query.set('to', filters.to);
    }
    if (filters.direction) query.set('direction', filters.direction);
    const response = await ownResponse(
      `/api/v1/me/attendance/events?${query}`,
      uid,
      signal,
    );
    const value: unknown = await response.json();
    if (
      !record(value) ||
      !Array.isArray(value.items) ||
      !value.items.every((row) => validMovement(row, filters)) ||
      !Number.isSafeInteger(value.total) ||
      (value.total as number) < 0 ||
      value.limit !== historyPageSize ||
      value.offset !== offset ||
      value.items.length !==
        Math.min(
          historyPageSize,
          Math.max(0, (value.total as number) - offset),
        ) ||
      value.has_more !==
        offset + value.items.length < (value.total as number) ||
      value.from !== (filters.from || null) ||
      value.to !== (filters.to || null) ||
      typeof value.timezone !== 'string' ||
      !value.timezone ||
      new Set(value.items.map((row) => row.movement_id)).size !==
        value.items.length ||
      value.items.some(
        (row, i, rows) =>
          i > 0 &&
          Date.parse(row.occurred_at) > Date.parse(rows[i - 1].occurred_at),
      )
    )
      throw new Error('Invalid history response');
    // Reject unsupported timezones rather than silently showing the wrong local dates.
    new Intl.DateTimeFormat(undefined, { timeZone: value.timezone }).format();
    if (signal.aborted) throw new Error('Aborted');
    return {
      items: value.items.map(
        ({ movement_id, event_id, direction, occurred_at }) => ({
          movement_id,
          event_id,
          direction,
          occurred_at,
        }),
      ),
      total: value.total as number,
      limit: historyPageSize,
      offset,
      has_more: value.has_more as boolean,
      timezone: value.timezone,
      from: value.from as string | null,
      to: value.to as string | null,
    };
  } catch (reason) {
    throw portalError(reason);
  }
}
