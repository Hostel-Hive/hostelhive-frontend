import { beforeEach, expect, it, vi } from 'vitest';
import { authorizedRequest } from '../../auth/api/authorized-request';
import { declareGoingHome } from './going-home.api';
vi.mock('../../auth/api/authorized-request', async (original) => ({
  ...(await original<typeof import('../../auth/api/authorized-request')>()),
  authorizedRequest: vi.fn(),
}));
const request = vi.mocked(authorizedRequest);
const id = '11111111-1111-4111-8111-111111111111';
const signal = new AbortController().signal;
const declaration = {
  going_home_id: id,
  request_id: id,
  student_id: id,
  submitted_by: id,
  status: 'declared',
  declared_at: '2026-10-30T10:00:00Z',
  departed_at: null,
  departure_device_id: null,
  departure_event_id: null,
};
beforeEach(() => vi.resetAllMocks());
it.each([200, 201])(
  'accepts a replay or first declaration (%i) and sends only the request ID',
  async (status) => {
    request.mockResolvedValue(Response.json(declaration, { status }));
    await expect(declareGoingHome('student', id, id, signal)).resolves.toEqual(
      declaration,
    );
    expect(request).toHaveBeenCalledWith(
      '/api/v1/going-home',
      'student',
      signal,
      {
        method: 'POST',
        contentType: 'application/json',
        body: JSON.stringify({ request_id: id }),
      },
    );
  },
);
it('accepts a departure returned by an exact retry', async () => {
  request.mockResolvedValue(
    Response.json({
      ...declaration,
      status: 'departed',
      departed_at: declaration.declared_at,
      departure_device_id: id,
      departure_event_id: id,
    }),
  );
  await expect(
    declareGoingHome('student', id, id, signal),
  ).resolves.toMatchObject({ status: 'departed' });
});
it.each([
  'already_outside',
  'presence_unknown',
  'going_home_pending',
  'active_student_required',
  'going_home_conflict',
])('handles %s without suggesting an uncertain retry', async (error) => {
  request.mockResolvedValue(Response.json({ error }, { status: 409 }));
  await expect(
    declareGoingHome('student', id, id, signal),
  ).rejects.toMatchObject({ uncertain: false });
});
it.each([
  [401, 'session'],
  [403, 'forbidden'],
])('propagates access denial %i', async (status, kind) => {
  request.mockResolvedValue(new Response(null, { status }));
  await expect(
    declareGoingHome('student', id, id, signal),
  ).rejects.toMatchObject({ kind });
});
it('treats a lost response or mismatched student as unconfirmed', async () => {
  request.mockRejectedValueOnce(new TypeError('network'));
  await expect(
    declareGoingHome('student', id, id, signal),
  ).rejects.toMatchObject({ uncertain: true });
  request.mockResolvedValueOnce(
    Response.json({
      ...declaration,
      student_id: '22222222-2222-4222-8222-222222222222',
    }),
  );
  await expect(
    declareGoingHome('student', id, id, signal),
  ).rejects.toMatchObject({ uncertain: true });
});
