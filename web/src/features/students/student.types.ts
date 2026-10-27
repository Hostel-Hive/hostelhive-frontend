export interface Guardian {
  guardian_id: string;
  name: string;
  relationship: string;
  contact_phone: string;
}
export interface Student {
  student_id: string;
  user_id: string;
  index_no: string;
  full_name: string;
  faculty: string;
  year: number;
  contact_phone: string;
  email: string;
  account_active: boolean;
  profile_image_url?: string;
  guardians?: Guardian[];
  created_at: string;
  updated_at: string;
}
export interface StudentPage {
  students: Student[];
  limit: number;
  offset: number;
  has_more: boolean;
}
export interface StudentDetails {
  index_no: string;
  full_name: string;
  faculty: string;
  year: number;
  contact_phone: string;
  guardians: Omit<Guardian, 'guardian_id'>[];
}
export interface CreateStudentInput extends StudentDetails {
  user_id: string;
}
export interface CreateStudentByEmailInput extends StudentDetails {
  email: string;
}
