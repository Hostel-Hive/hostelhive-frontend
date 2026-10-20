export interface LoginInput {
  email: string;
  password: string;
  rememberMe: boolean;
  portal?: 'staff' | 'student';
}

export interface StaffAccount {
  user_id: string;
  firebase_uid: string;
  email: string;
  role: 'admin' | 'warden';
  is_active: true;
}

export interface StudentAccount extends Omit<StaffAccount, 'role'> {
  role: 'student';
  setup_required?: boolean;
}

export type AuthAccount = StaffAccount | StudentAccount;
