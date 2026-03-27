// ══════════════════════════════════════════════════════════════════════════════
// TYPES — Module Drivers
// Sprint 3 — EazyVTC
// ══════════════════════════════════════════════════════════════════════════════

import type { DriverStatus, VehicleType, ZoneType } from '../auth/auth.types.js';

export type { DriverStatus, VehicleType, ZoneType };

// ── Profil chauffeur complet avec infos utilisateur joint ─────────────────────
export interface DriverWithUser {
  id: string;
  user_id: string;
  status: DriverStatus;
  vehicle_type: VehicleType | null;
  siret: string | null;
  tva_rate: number;
  is_online: boolean;
  zone: ZoneType;
  created_at: string;
  updated_at: string;
  user: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    phone: string | null;
    profile_photo_url: string | null;
    status: string;
    created_at: string;
  };
}

// ── DTO mise à jour profil chauffeur (par le chauffeur lui-même) ──────────────
export interface UpdateDriverDto {
  siret?: string;
  zone?: ZoneType;
  vehicle_type?: VehicleType;
}

// ── DTO changement de statut (par l'admin) ────────────────────────────────────
export interface ChangeDriverStatusDto {
  status: 'active' | 'rejected' | 'suspended';
  reason: string;
}

// ── DTO mise à jour admin (tva_rate, etc.) ────────────────────────────────────
export interface AdminUpdateDriverDto {
  tva_rate?: number;
  siret?: string;
  zone?: ZoneType;
  vehicle_type?: VehicleType;
}

// ── Filtres liste chauffeurs (admin) ──────────────────────────────────────────
export interface DriverListFilters {
  status?: DriverStatus;
  zone?: ZoneType;
  vehicle_type?: VehicleType;
  is_online?: boolean;
  search?: string; // sur email, first_name, last_name
  page?: number;
  limit?: number;
}

// ── Résultat paginé ───────────────────────────────────────────────────────────
export interface DriverListResult {
  drivers: DriverWithUser[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}
