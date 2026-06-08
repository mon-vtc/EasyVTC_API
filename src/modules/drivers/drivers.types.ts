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
  status_reason: string | null;
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

// ── Planning ──────────────────────────────────────────────────────────────────

export type PlanningPeriod = 'week' | 'month';

export interface PlanningReservation {
  id: string;
  status: string;
  scheduled_at: string;
  pickup_address: string;
  dest_address: string;
  vehicle_type: VehicleType | null;
  price_final: number | null;
  price_estimated: number;
  country: string;
  client: {
    first_name: string;
    last_name: string;
    phone: string | null;
  } | null;
  trip: {
    id: string;
    started_at: string | null;
    ended_at: string | null;
    actual_distance_km: number | null;
    actual_duration_min: number | null;
  } | null;
}

export interface DriverPlanningResult {
  period: PlanningPeriod;
  date_from: string;
  date_to: string;
  reservations: PlanningReservation[];
  total: number;
}

// ── Indisponibilités ──────────────────────────────────────────────────────────

export type UnavailabilityReason =
  | 'conge'
  | 'visite_medicale'
  | 'formation'
  | 'panne_vehicule'
  | 'autre';

export interface DriverUnavailability {
  id:         string;
  driver_id:  string;
  reason:     UnavailabilityReason;
  label:      string | null;
  starts_at:  string;
  ends_at:    string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateUnavailabilityDto {
  reason:    UnavailabilityReason;
  label?:    string;
  starts_at: string;
  ends_at:   string;
}

// ── Vue disponibilité (planning étendu) ───────────────────────────────────────

export interface DriverAvailabilityResult {
  period:                  PlanningPeriod;
  date_from:               string;
  date_to:                 string;
  reservations:            PlanningReservation[];
  unavailabilities:        DriverUnavailability[];
  total_reservations:      number;
  total_unavailabilities:  number;
}

// ── Revenus ───────────────────────────────────────────────────────────────────

export type RevenuesPeriod = 'week' | 'month' | 'all';

export interface RevenueTrip {
  reservation_id:    string;
  scheduled_at:      string;
  pickup_address:    string;
  dest_address:      string;
  price_final:       number;       // montant brut (ce que le client a payé)
  commission_amount: number;       // part plateforme (0 si non configuré)
  net_amount:        number;       // ce que le chauffeur perçoit = price_final - commission
  currency:          string;
  client_first_name: string | null;
  client_last_name:  string | null;
  rating:            number | null; // note étoiles si la course a été évaluée
}

export interface DriverRevenuesResult {
  period: RevenuesPeriod;
  date_from: string | null;
  date_to: string | null;
  total_trips: number;
  total_gross: number;         // total brut avant commission
  total_commission: number;    // total prélevé par la plateforme
  total_net: number;           // ce que le chauffeur perçoit réellement
  total_revenue: number;       // alias de total_net (rétro-compatibilité)
  currency: string;
  revenue_by_currency: { EUR: number; XOF: number };
  trips: RevenueTrip[];
}
