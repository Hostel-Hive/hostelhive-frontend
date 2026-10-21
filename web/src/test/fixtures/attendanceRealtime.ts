import type {
  AttendanceProjection,
  PublicationStatus,
  RealtimeSession,
} from '../../features/attendance/api/attendance-realtime.api';
export const realtimeSession = (): RealtimeSession => ({
  database_url:
    'https://hostelhive-test-default-rtdb.asia-southeast1.firebasedatabase.app',
  path: 'hostelhive/attendance',
  expires_at: new Date(Date.now() + 300000).toISOString(),
  renew_after_seconds: 120,
});
export const publicationStatus = (): PublicationStatus => ({
  enabled: true,
  pending: false,
  version: 100,
  published_version: 100,
  changed_at: new Date().toISOString(),
  published_at: new Date().toISOString(),
  attempts: 0,
  pending_grants: 0,
});
export const liveProjection = (version = 100): AttendanceProjection => ({
  version,
  changed_at: Date.now() - 1000,
  published_at: Date.now(),
  summary: { total: 10, in: 6, out: 3, unknown: 1 },
});
