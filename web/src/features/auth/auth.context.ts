import { createContext } from 'react';
import type { LoginInput, StaffAccount } from './auth.types';

export interface AuthState {
  status: 'checking' | 'authenticated' | 'anonymous' | 'error';
  account: StaffAccount | null;
  message: string;
  verifiedPath: string;
}
export interface AuthContextValue extends AuthState {
  busy: boolean;
  signIn: (input: LoginInput) => Promise<StaffAccount>;
  signOut: () => Promise<void>;
  retry: () => Promise<void>;
}
export const AuthContext = createContext<AuthContextValue | null>(null);
