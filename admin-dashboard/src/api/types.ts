// Types mirror the backend responses in backend/src/modules/{auth,admin,tutors}.

export type Role = 'PARENT' | 'TUTOR' | 'ADMIN';
export type UserStatus = 'ACTIVE' | 'BLOCKED' | 'DELETED';
export type VerificationStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED';
export type DocumentStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type DocumentType = 'QUALIFICATION' | 'EXPERIENCE' | 'ID_PROOF' | 'OTHER';
export type RequirementStatus = 'OPEN' | 'FULFILLED' | 'CLOSED';
export type RequirementMode = 'ONLINE' | 'HOME' | 'EITHER';
export type TeachingMode = 'ONLINE' | 'OFFLINE' | 'BOTH';
export type Gender = 'MALE' | 'FEMALE' | 'OTHER';

export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

// ---------- Auth ----------

export interface AuthUser {
  id: string;
  role: Role;
  fullName: string;
  phone: string;
  email: string | null;
  phoneVerified: boolean;
  status: UserStatus;
  photoUrl: string | null;
  tutorVerificationStatus: VerificationStatus | null;
  profileComplete: boolean;
  createdAt: string;
}

export interface LoginOtpResponse {
  otpSentTo: string;
  expiresInSeconds: number;
  devOtp?: string;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  user: AuthUser;
}

// ---------- Admin ----------

export interface SignupDay {
  date: string; // YYYY-MM-DD
  parents: number;
  tutors: number;
}

export interface AdminStats {
  parents: number;
  tutors: number;
  students: number;
  approvedTutors: number;
  pendingTutors: number;
  openRequirements: number;
  fulfilledRequirements: number;
  applications: number;
  acceptedApplications: number;
  blockedUsers: number;
  openComplaints: number;
  revenuePaise: number;
  signups: SignupDay[];
}

export interface TutorListItem {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  accountStatus: UserStatus;
  photoUrl: string | null;
  city: string | null;
  experienceYears: number | null;
  verificationStatus: VerificationStatus;
  submittedAt: string | null;
  verifiedAt: string | null;
  createdAt: string;
  documentCount: number;
}

export interface NamedRef {
  id: number;
  name: string;
}

export interface BoardRef extends NamedRef {
  code: string;
}

export interface Qualification {
  id: string;
  degree: string;
  institution: string | null;
  year: number | null;
}

export interface AvailabilitySlot {
  id: string;
  dayOfWeek: number; // 0 = Sunday
  startTime: string; // HH:mm
  endTime: string;
}

export interface TutorDocument {
  id: string;
  docType: DocumentType;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  status: DocumentStatus;
  reviewNote: string | null;
  uploadedAt: string;
}

export interface TutorProfile {
  id: string;
  fullName: string;
  photoUrl: string | null;
  headline: string | null;
  bio: string | null;
  gender: Gender | null;
  experienceYears: number | null;
  experienceDetails: string | null;
  monthlyFee: number | null;
  teachingMode: TeachingMode;
  locality: string | null;
  city: string | null;
  pincode: string | null;
  serviceRadiusKm: number | null;
  isAvailable: boolean;
  isFeatured: boolean;
  avgRating: number;
  reviewCount: number;
  phone: string;
  email: string | null;
  accountStatus: UserStatus;
  locationId: number | null;
  latitude: number | null;
  longitude: number | null;
  verificationStatus: VerificationStatus;
  verificationNote: string | null;
  submittedAt: string | null;
  verifiedAt: string | null;
  subjects: NamedRef[];
  classes: NamedRef[];
  boards: BoardRef[];
  qualifications: Qualification[];
  availability: AvailabilitySlot[];
  documents: TutorDocument[];
}

export interface DocumentReviewResult {
  id: string;
  tutorId: string;
  status: DocumentStatus;
}

export interface AdminUser {
  id: string;
  role: Role;
  fullName: string;
  phone: string;
  email: string | null;
  status: UserStatus;
  blockedReason: string | null;
  phoneVerified: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface AdminRequirement {
  id: string;
  status: RequirementStatus;
  city: string | null;
  locality: string | null;
  pincode: string | null;
  mode: RequirementMode;
  monthlyBudget: number;
  className: string;
  parentName: string;
  parentPhone: string;
  createdAt: string;
  subjects: string | null; // comma-separated subject names
  applicationCount: number;
}
