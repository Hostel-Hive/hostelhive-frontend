import { createContext } from 'react';
import type { LoginInput, AuthAccount } from './auth.types';

export interface AuthState {
  status: 'checking' | 'authenticated' | 'anonymous' | 'error';
  account: AuthAccount | null;
  message: string;
  verifiedPath: string;
}
export interface AuthContextValue extends AuthState {
  busy: boolean;
  signIn: (input: LoginInput) => Promise<AuthAccount>;
  signOut: () => Promise<void>;
  retry: () => Promise<void>;
}
export const AuthContext = createContext<AuthContextValue | null>(null);
