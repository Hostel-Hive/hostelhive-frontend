export interface OwnStudentProfile {
  student_id: string;
  index_no: string;
  full_name: string;
  faculty: string;
  year: number;
  contact_phone: string;
  email: string;
  guardians: {
    guardian_id: string;
    name: string;
    relationship: string;
    contact_phone: string;
  }[];
  profile_image_url: string | null;
  accommodation: {
    allocation_id: string;
    block_id: string;
    block_name: string;
    room_id: string;
    room_no: string;
    bed_id: string;
    bed_no: string;
    started_at: string;
  } | null;
  presence: { status: 'IN' | 'OUT' | 'UNKNOWN'; updated_at: string | null };
}
