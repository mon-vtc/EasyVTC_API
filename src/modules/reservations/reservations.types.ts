// ══════════════════════════════════════════════════════════════════════════════
// TYPES — Module Réservations
// Sprint 3 — EazyVTC
// ══════════════════════════════════════════════════════════════════════════════

import type { PricingCountry, PricingType, PriceBreakdown } from '../pricing/pricing.types.js';

// ── Énumérations ──────────────────────────────────────────────────────────────

export type ReservationStatus =
  | 'pending'          // Créée par le client — en attente d'affectation
  | 'assigned'         // Chauffeur assigné — en attente de départ
  | 'driver_arrived'   // Chauffeur arrivé au point de pickup — en attente de démarrage
  | 'in_progress'      // Course démarrée
  | 'completed'        // Course terminée
  | 'cancelled';       // Annulée (client, admin ou système)

export type VehicleType = 'standard' | 'berline' | 'van';

// ── Entités BDD ───────────────────────────────────────────────────────────────

export interface Reservation {
  id: string;
  client_id: string;
  driver_id: string | null;
  assigned_by: string | null;
  status: ReservationStatus;

  // Localisation
  pickup_address: string;
  pickup_lat: number | null;
  pickup_lng: number | null;
  dest_address: string;
  dest_lat: number | null;
  dest_lng: number | null;

  // Véhicule & pays
  vehicle_type: VehicleType;
  country: PricingCountry;

  // Tarification
  pricing_type: PricingType | null;
  flat_rate_id: string | null;
  price_estimated: number;
  price_final: number | null;
  price_adjusted: number | null;
  price_breakdown: PriceBreakdown;

  // Métriques
  distance_km: number | null;
  duration_min: number | null;

  // Planification
  scheduled_at: string;
  nb_passengers: number;
  driver_arrived_at: string | null;
  comment: string | null;

  promo_code_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Vue enrichie retournée par l'API (jointures client + chauffeur) */
export interface ReservationWithRelations extends Reservation {
  client?: {
    id: string;
    first_name: string;
    last_name: string;
    phone: string | null;
    profile_photo_url: string | null;
  };
  driver?: AvailableDriverDto | null;
}

// ── DTOs — Création ───────────────────────────────────────────────────────────

export interface CreateReservationDto {
  pickup_address: string;
  pickup_lat?: number;
  pickup_lng?: number;
  dest_address: string;
  dest_lat?: number;
  dest_lng?: number;
  vehicle_type: VehicleType;
  country: PricingCountry;
  scheduled_at: string;           // ISO 8601
  nb_passengers?: number;         // Nombre de passagers (défaut : 1)
  comment?: string;

  // Tarification — le serveur calcule le prix
  distance_km?: number;           // Distance estimée (côté client via maps)
  duration_min?: number;          // Durée estimée
  flat_rate_id?: string;          // Prioritaire sur distance/durée si fourni
}

// ── DTOs — Actions ────────────────────────────────────────────────────────────

export interface AssignDriverDto {
  /** ID du record dans public.drivers (pas users.id) */
  driver_id: string;
}

export interface CompleteReservationDto {
  /** Distance réelle parcourue en km */
  actual_distance_km?: number;
  /** Durée réelle en minutes */
  actual_duration_min?: number;
  /** Note du chauffeur sur la course */
  driver_notes?: string;
  /** Prix ajusté par le chauffeur ou l'admin (ex: attente, péage) */
  price_adjusted?: number;
}

export interface CancelReservationDto {
  reason?: string;
}

// ── Filtres liste ─────────────────────────────────────────────────────────────

export interface ReservationListFilters {
  status?: ReservationStatus;
  country?: PricingCountry;
  driver_id?: string;
  client_id?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  limit?: number;
}

// ── Résultat paginé ───────────────────────────────────────────────────────────

export interface ReservationListResult {
  reservations: ReservationWithRelations[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

// ── Chauffeurs disponibles (pour l'assignation admin) ─────────────────────────

export interface AvailableDriverDto {
  id:           string;           // drivers.id — passé à assign()
  rating:       number | null;    // null jusqu'au module ratings (Sprint 6)
  is_online:    boolean;
  status:       string;
  vehicle_type: string | null;
  zone:         string | null;
  user: {
    id:                string;
    first_name:        string;
    last_name:         string;
    phone:             string | null;
    email:             string;
    profile_photo_url: string | null;
  };
  vehicle: {
    id:           string;
    model:        string;
    plate_number: string;
    brand:        string;
    color:        string | null;
    type:         string;
    photo_url:    string | null;
  } | null;
}
