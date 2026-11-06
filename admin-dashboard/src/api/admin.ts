import { api, apiBlob } from './client';
import type {
  AdminRequirement,
  AdminStats,
  AdminUser,
  DocumentReviewResult,
  Paged,
  RequirementStatus,
  Role,
  TutorListItem,
  TutorProfile,
  UserStatus,
  VerificationStatus,
} from './types';

export interface PageParams {
  page?: number;
  pageSize?: number;
}

const id = (v: string) => encodeURIComponent(v);

export const adminApi = {
  stats: (signal?: AbortSignal) => api<AdminStats>('/admin/stats', { signal }),

  tutors: (p: PageParams & { status?: VerificationStatus; q?: string }, signal?: AbortSignal) =>
    api<Paged<TutorListItem>>('/admin/tutors', { query: { ...p }, signal }),
  tutor: (tutorId: string, signal?: AbortSignal) => api<TutorProfile>(`/admin/tutors/${id(tutorId)}`, { signal }),
  approveTutor: (tutorId: string, note?: string) =>
    api<TutorProfile>(`/admin/tutors/${id(tutorId)}/approve`, { method: 'POST', body: note ? { note } : {} }),
  rejectTutor: (tutorId: string, note: string) =>
    api<TutorProfile>(`/admin/tutors/${id(tutorId)}/reject`, { method: 'POST', body: { note } }),

  documentFile: (docId: string) => apiBlob(`/admin/documents/${id(docId)}/file`),
  reviewDocument: (docId: string, status: 'APPROVED' | 'REJECTED', note?: string) =>
    api<DocumentReviewResult>(`/admin/documents/${id(docId)}/review`, {
      method: 'POST',
      body: note ? { status, note } : { status },
    }),

  users: (p: PageParams & { role?: Role; status?: UserStatus; q?: string }, signal?: AbortSignal) =>
    api<Paged<AdminUser>>('/admin/users', { query: { ...p }, signal }),
  blockUser: (userId: string, reason: string) =>
    api<{ id: string; status: 'BLOCKED' }>(`/admin/users/${id(userId)}/block`, { method: 'POST', body: { reason } }),
  unblockUser: (userId: string) =>
    api<{ id: string; status: 'ACTIVE' }>(`/admin/users/${id(userId)}/unblock`, { method: 'POST', body: {} }),

  requirements: (p: PageParams & { status?: RequirementStatus }, signal?: AbortSignal) =>
    api<Paged<AdminRequirement>>('/admin/requirements', { query: { ...p }, signal }),
  closeRequirement: (reqId: string) =>
    api<{ id: string; status: 'CLOSED' }>(`/admin/requirements/${id(reqId)}/close`, { method: 'POST', body: {} }),
};
