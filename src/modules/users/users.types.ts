import type { UserRole } from '../auth/auth.types.js';

// ── Enum des statuts utilisateur ─────────────────────────────────────────────
export type UserStatus = 'active' | 'inactive' | 'locked';

// ── Profil utilisateur complet ───────────────────────────────────────────────
export interface UserProfile {
  id: string;
  email: string;
  role: UserRole;
  first_name: string;
  last_name: string;
  phone: string | null;
  profile_photo_url: string | null;
  status: UserStatus;
  status_changed_by: string | null;
  status_changed_at: string | null;
  status_reason: string | null;
  coverage_zone: string | null;
  priority_level: number | null;
  rgpd_consent: boolean;
  rgpd_consent_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

// ── DTO pour mise à jour du profil (par l'utilisateur lui-même) ──────────────
export interface UpdateProfileDto {
  first_name?: string;
  last_name?: string;
  phone?: string;
}

// ── DTO pour changement de statut (par l'admin) ──────────────────────────────
export interface ChangeUserStatusDto {
  status: UserStatus;
  reason: string; // Motif obligatoire
}

// ── Résultat de l'upload d'avatar ────────────────────────────────────────────
export interface UploadAvatarResult {
  profile_photo_url: string;
}

// ── Liste paginée des utilisateurs (pour admin) ──────────────────────────────
export interface UserListFilters {
  role?: UserRole;
  status?: UserStatus;
  search?: string; // Recherche sur email, first_name, last_name
  page?: number;
  limit?: number;
}

export interface UserListResult {
  users: UserProfile[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}