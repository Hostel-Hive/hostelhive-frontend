export interface LoginInput {
  email: string;
  password: string;
  rememberMe: boolean;
}

export interface StaffAccount {
  user_id: string;
  firebase_uid: string;
  email: string;
  role: 'admin' | 'warden';
  is_active: true;
}
