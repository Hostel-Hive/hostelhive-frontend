import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => {
  const user = { uid: 'firebase-1', getIdToken: vi.fn() };
  return {
    user,
    auth: { authStateReady: vi.fn(), currentUser: null as null | typeof user },
    getApps: vi.fn(),
    initializeApp: vi.fn(),
    getAuth: vi.fn(),
    setPersistence: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
    onIdTokenChanged: vi.fn(),
  };
});
vi.mock('firebase/app', () => ({
  getApps: sdk.getApps,
  initializeApp: sdk.initializeApp,
}));
vi.mock('firebase/auth', () => ({
  browserLocalPersistence: 'local',
  browserSessionPersistence: 'session',
  getAuth: sdk.getAuth,
  setPersistence: sdk.setPersistence,
  signInWithEmailAndPassword: sdk.signIn,
  signOut: sdk.signOut,
  onIdTokenChanged: sdk.onIdTokenChanged,
}));
import {
  login,
  loginErrorMessage,
  restoreStaffSession,
  subscribeStaffSession,
  logout,
  isSessionRejected,
} from './auth.api';

const input = {
  email: ' staff@example.com ',
  password: 'password',
  rememberMe: false,
};
const account = {
  user_id: 'staff-1',
  firebase_uid: 'firebase-1',
  email: 'staff@example.com',
  role: 'admin',
  is_active: true,
};
const fetchMock = vi.fn();
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('VITE_FIREBASE_API_KEY', 'test-public-key');
  vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN', 'test.firebaseapp.com');
  vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'test-project');
  vi.stubEnv('VITE_API_BASE_URL', 'http://127.0.0.1:18080');
  vi.stubEnv('DEV', true);
  vi.stubGlobal('fetch', fetchMock);
  sdk.getApps.mockReturnValue([]);
  sdk.getAuth.mockReturnValue(sdk.auth);
  sdk.auth.currentUser = null;
  sdk.auth.authStateReady.mockResolvedValue(undefined);
  sdk.setPersistence.mockResolvedValue(undefined);
  sdk.signIn.mockResolvedValue({ user: sdk.user });
  sdk.user.getIdToken.mockResolvedValue('test-token');
  sdk.signOut.mockResolvedValue(undefined);
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify(account), { status: 200 }),
  );
});

describe('Firebase sign-in and backend account verification', () => {
  it.each([false, true])(
    'verifies identity with selected persistence %s',
    async (rememberMe) => {
      expect(await login({ ...input, rememberMe })).toEqual(account);
      expect(sdk.setPersistence).toHaveBeenCalledWith(
        sdk.auth,
        rememberMe ? 'local' : 'session',
      );
      expect(sdk.signIn).toHaveBeenCalledWith(
        sdk.auth,
        'staff@example.com',
        'password',
      );
      expect(fetchMock).toHaveBeenCalledWith(
        '/backend-api/api/v1/me',
        expect.objectContaining({
          headers: { Authorization: 'Bearer test-token' },
          credentials: 'omit',
          cache: 'no-store',
        }),
      );
    },
  );
  it('uses the configured production API and reuses its named Firebase app', async () => {
    vi.stubEnv('DEV', false);
    sdk.getApps.mockReturnValue([{ name: 'hostelhive-web' }]);
    await login(input);
    expect(sdk.initializeApp).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:18080/api/v1/me',
      expect.any(Object),
    );
  });
  it('does not contact Firebase when configuration is missing', async () => {
    vi.stubEnv('VITE_FIREBASE_API_KEY', '');
    await expect(login(input)).rejects.toThrow('Sign-in is not configured yet');
    expect(await restoreStaffSession()).toBeNull();
    expect(sdk.signIn).not.toHaveBeenCalled();
  });
  it.each([401, 403, 503])(
    'rejects backend status %s and clears credentials',
    async (status) => {
      fetchMock.mockResolvedValue(new Response('{}', { status }));
      await expect(login(input)).rejects.toThrow();
      expect(sdk.signOut).toHaveBeenCalledWith(sdk.auth);
    },
  );
  it.each([
    null,
    {},
    { ...account, user_id: '' },
    { ...account, email: 123 },
    { ...account, firebase_uid: 'someone-else' },
    { ...account, is_active: false },
    { ...account, role: 'student' },
    { ...account, role: 'sub_warden' },
  ])(
    'denies malformed, inactive, mismatched or unsupported accounts %#',
    async (body) => {
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify(body), { status: 200 }),
      );
      await expect(login(input)).rejects.toThrow(
        'cannot access the staff portal',
      );
      expect(sdk.signOut).toHaveBeenCalled();
    },
  );
  it('handles backend network failure and clears credentials even if sign-out fails', async () => {
    fetchMock.mockRejectedValue(new Error('private network details'));
    sdk.signOut.mockRejectedValue(new Error('private signout details'));
    await expect(login(input)).rejects.toThrow(
      'Unable to reach the hostel service',
    );
  });
  it('rejects Firebase failure without calling the backend', async () => {
    sdk.signIn.mockRejectedValue({ code: 'auth/invalid-credential' });
    await expect(login(input)).rejects.toEqual({
      code: 'auth/invalid-credential',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('returns null when there is no saved user', async () => {
    expect(await restoreStaffSession()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('revalidates a saved session against the backend', async () => {
    sdk.auth.currentUser = sdk.user;
    expect(await restoreStaffSession()).toEqual(account);
    expect(sdk.signIn).not.toHaveBeenCalled();
  });
  it('clears a saved session rejected by the backend', async () => {
    sdk.auth.currentUser = sdk.user;
    fetchMock.mockResolvedValue(new Response('{}', { status: 403 }));
    sdk.signOut.mockRejectedValue(new Error('private details'));
    await expect(restoreStaffSession()).rejects.toThrow(
      'cannot access the staff portal',
    );
    expect(sdk.signOut).toHaveBeenCalled();
  });
});

describe('student account verification', () => {
  it.each([undefined, false, true])(
    'accepts student setup state %s on student login and session restoration',
    async (setup) => {
      const student = {
        ...account,
        role: 'student',
        ...(setup === undefined ? {} : { setup_required: setup }),
      };
      fetchMock.mockImplementation(
        async () => new Response(JSON.stringify(student)),
      );
      expect(await login({ ...input, portal: 'student' })).toEqual(student);
      sdk.auth.currentUser = sdk.user;
      expect(await restoreStaffSession()).toEqual(student);
    },
  );
  it.each(['admin', 'warden', 'sub_warden', 'security_staff'])(
    'rejects %s accounts on student sign in',
    async (role) => {
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ ...account, role })),
      );
      await expect(login({ ...input, portal: 'student' })).rejects.toThrow(
        'cannot access the student portal',
      );
      expect(sdk.signOut).toHaveBeenCalled();
    },
  );
  it.each(['true', null, 1])(
    'rejects malformed setup state %s',
    async (setup_required) => {
      fetchMock.mockResolvedValue(
        new Response(
          JSON.stringify({ ...account, role: 'student', setup_required }),
        ),
      );
      await expect(login({ ...input, portal: 'student' })).rejects.toThrow(
        'cannot access',
      );
    },
  );
});

describe('safe error messages', () => {
  it.each([
    'auth/invalid-credential',
    'auth/invalid-login-credentials',
    'auth/user-not-found',
    'auth/wrong-password',
    'auth/invalid-email',
  ])('does not disclose account existence for %s', (code) => {
    expect(loginErrorMessage({ code })).toBe(
      'Unable to sign in. Check your email and password.',
    );
  });
  it.each([
    'auth/too-many-requests',
    'auth/network-request-failed',
    'auth/user-disabled',
  ])('maps %s to a helpful message', (code) => {
    expect(loginErrorMessage({ code })).not.toContain(code);
  });
  it('does not disclose arbitrary exception messages', () => {
    expect(loginErrorMessage(new Error('secret'))).not.toContain('secret');
    expect(loginErrorMessage(null)).toContain('unavailable');
  });
  it('preserves application-authored safe errors', () => {
    const error = new Error('Safe message');
    error.name = 'LoginError';
    expect(loginErrorMessage(error)).toBe('Safe message');
  });
});

describe('shared session lifecycle', () => {
  it('preserves Firebase credentials on temporary backend failures so retry can recover', async () => {
    sdk.auth.currentUser = sdk.user;
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    await expect(restoreStaffSession()).rejects.toThrow('Unable to reach');
    expect(sdk.signOut).not.toHaveBeenCalled();
    expect(await restoreStaffSession()).toEqual(account);
  });
  it('clears expired restored sessions', async () => {
    sdk.auth.currentUser = sdk.user;
    sdk.user.getIdToken.mockRejectedValue({ code: 'auth/user-token-expired' });
    await expect(restoreStaffSession()).rejects.toEqual({
      code: 'auth/user-token-expired',
    });
    expect(sdk.signOut).toHaveBeenCalled();
    expect(isSessionRejected(null)).toBe(false);
    expect(isSessionRejected({ code: 'auth/user-disabled' })).toBe(true);
  });
  it('observes token changes and forwards errors with SDK cleanup', () => {
    const unsubscribe = vi.fn();
    sdk.onIdTokenChanged.mockReturnValue(unsubscribe);
    const change = vi.fn();
    const error = vi.fn();
    const dispose = subscribeStaffSession(change, error);
    const [auth, callback, onError] = sdk.onIdTokenChanged.mock.calls[0];
    expect(auth).toBe(sdk.auth);
    callback(sdk.user);
    expect(change).toHaveBeenLastCalledWith(true);
    callback(null);
    expect(change).toHaveBeenLastCalledWith(false);
    onError('safe-test-error');
    expect(error).toHaveBeenCalledWith('safe-test-error');
    dispose();
    expect(unsubscribe).toHaveBeenCalled();
  });
  it('reports signed-out configuration and cancels queued notifications on cleanup', async () => {
    vi.stubEnv('VITE_FIREBASE_API_KEY', '');
    const change = vi.fn();
    subscribeStaffSession(change, vi.fn());
    await Promise.resolve();
    expect(change).toHaveBeenCalledWith(false);
    change.mockClear();
    const dispose = subscribeStaffSession(change, vi.fn());
    dispose();
    await Promise.resolve();
    expect(change).not.toHaveBeenCalled();
    await logout();
    expect(sdk.signOut).not.toHaveBeenCalled();
  });
  it('signs out the configured Firebase session and exposes failure to the provider', async () => {
    await logout();
    expect(sdk.signOut).toHaveBeenCalledWith(sdk.auth);
    sdk.signOut.mockRejectedValueOnce(new Error('logout-failed'));
    await expect(logout()).rejects.toThrow('logout-failed');
  });
});
