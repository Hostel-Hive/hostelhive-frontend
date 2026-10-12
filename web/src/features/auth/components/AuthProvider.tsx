import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { AuthContext } from '../auth.context';
import type { AuthState } from '../auth.context';
import type { LoginInput } from '../auth.types';
import {
  isSessionRejected,
  login,
  loginErrorMessage,
  logout,
  restoreStaffSession,
  subscribeStaffSession,
} from '../api/auth.api';

export default function AuthProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [state, setState] = useState<AuthState>({
    status: 'checking',
    account: null,
    message: '',
    verifiedPath: '',
  });
  const generation = useRef(0);
  const [busy, setBusy] = useState(false);
  const operation = useRef(false);
  const mounted = useRef(false);
  const latestPath = useRef(pathname);
  const latestRetry = useRef<() => Promise<void>>(async () => {});
  const invalidate = useCallback(() => {
    ++generation.current;
  }, []);

  const retry = useCallback(async () => {
    if (operation.current) return;
    const current = ++generation.current;
    setState({
      status: 'checking',
      account: null,
      message: '',
      verifiedPath: pathname,
    });
    try {
      const account = await restoreStaffSession();
      if (mounted.current && current === generation.current) {
        setState({
          status: account ? 'authenticated' : 'anonymous',
          account,
          message: '',
          verifiedPath: pathname,
        });
      }
    } catch (error) {
      if (mounted.current && current === generation.current) {
        setState({
          status: isSessionRejected(error) ? 'anonymous' : 'error',
          account: null,
          message: loginErrorMessage(error),
          verifiedPath: pathname,
        });
      }
    }
  }, [pathname]);

  useEffect(() => {
    mounted.current = true;
    latestPath.current = pathname;
    latestRetry.current = retry;
    let active = true;
    let unsubscribe = () => {};
    const onError = (error: unknown) => {
      if (!active) return;
      ++generation.current;
      setState({
        status: 'error',
        account: null,
        message: loginErrorMessage(error),
        verifiedPath: pathname,
      });
    };
    try {
      unsubscribe = subscribeStaffSession((signedIn) => {
        if (!active || operation.current) return;
        if (signedIn) void retry();
        else {
          ++generation.current;
          setState({
            status: 'anonymous',
            account: null,
            message: '',
            verifiedPath: pathname,
          });
        }
      }, onError);
    } catch (error) {
      onError(error);
    }
    const handleFocus = () => {
      void retry();
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void retry();
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      active = false;
      mounted.current = false;
      invalidate();
      unsubscribe();
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [pathname, retry, invalidate]);

  async function signIn(input: LoginInput) {
    if (operation.current)
      throw new Error('Authentication is already in progress.');
    const current = ++generation.current;
    operation.current = true;
    setBusy(true);
    try {
      const account = await login(input);
      if (mounted.current && current === generation.current)
        setState({
          status: 'authenticated',
          account,
          message: '',
          verifiedPath: pathname,
        });
      return account;
    } catch (error) {
      if (mounted.current && current === generation.current)
        setState({
          status: 'anonymous',
          account: null,
          message: '',
          verifiedPath: pathname,
        });
      throw error;
    } finally {
      operation.current = false;
      if (mounted.current) setBusy(false);
      if (mounted.current && current !== generation.current)
        void latestRetry.current();
    }
  }

  async function signOut() {
    if (operation.current) return;
    ++generation.current;
    operation.current = true;
    setState({
      status: 'checking',
      account: null,
      message: '',
      verifiedPath: pathname,
    });
    try {
      await logout();
      if (mounted.current)
        setState({
          status: 'anonymous',
          account: null,
          message: '',
          verifiedPath: latestPath.current,
        });
    } catch {
      if (mounted.current)
        setState({
          status: 'error',
          account: null,
          message: 'Unable to sign out. Please retry signing out.',
          verifiedPath: latestPath.current,
        });
    } finally {
      operation.current = false;
    }
  }

  return (
    <AuthContext.Provider value={{ ...state, busy, retry, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
