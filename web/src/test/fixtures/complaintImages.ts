import type { ComplaintImage } from '../../features/complaints/api/complaint-images.api';
import { complaintFixture } from './complaints';
export const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
export const evidenceFixture: ComplaintImage = {
  image_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  complaint_id: complaintFixture.complaint_id,
  content_type: 'image/png',
  size_bytes: 8,
  width: 100,
  height: 100,
  uploaded_at: '2026-10-21T10:00:00Z',
};
