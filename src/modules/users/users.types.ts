import type { UserRole } from '../auth/auth.types.js';

export interface UserProfile {
  id: string;
  email: string;
  role: UserRole;
  first_name: string;
  last_name: string;
  phone: string | null;
  profile_photo_url: string | null;
  rgpd_consent: boolean;
  rgpd_consent_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpdateProfileDto {
  first_name?: string;
  last_name?: string;
  phone?: string;
}

export interface UploadAvatarResult {
  profile_photo_url: string;
}