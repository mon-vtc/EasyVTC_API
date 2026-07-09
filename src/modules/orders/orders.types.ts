// ══════════════════════════════════════════════════════════════════════════════
// TYPES — Module Bons de commande (Orders)
// Sprint 4 — EasyVTC
//
// Le bon de commande affiche le montant estimé de la course (Désignation /
// Quantité / Montant TTC), que la tarification soit au forfait ou au compteur
// (km) — cf. maquette de référence. Seule la formule de calcul détaillée
// (grille tarifaire, suppléments) ne doit jamais apparaître.
// ══════════════════════════════════════════════════════════════════════════════

import type { VehicleType } from '../reservations/reservations.types.js';
import type { PricingCountry, PricingType } from '../pricing/pricing.types.js';

// ── Snapshots (données figées à la génération du bon) ────────────────────────

/** Données chauffeur figées au moment de l'assignation */
export interface DriverSnapshot {
  first_name: string;
  last_name: string;
  phone: string | null;
  siret: string | null;
}

/** Données passager/client figées au moment de l'assignation */
export interface PassengerSnapshot {
  first_name: string;
  last_name: string;
  phone: string | null;
}

/** Données de course figées au moment de l'assignation du chauffeur. */
export interface TripSnapshot {
  pickup_address: string;
  dest_address: string;
  vehicle_type: VehicleType;
  country: PricingCountry;
  scheduled_at: string;             // ISO 8601
  nb_passengers: number;
  comment: string | null;
  via: string;                      // Canal/source, ex: "EasyVTC"
  pricing_type: PricingType;
  /** Montant estimé de la course (forfait ou estimation au compteur) */
  final_price: number | null;
  /** Distance estimée en km (tarification au compteur uniquement) */
  distance_km: number | null;
  currency: string;
}

// ── Entité BDD ────────────────────────────────────────────────────────────────

export interface Order {
  id: string;
  reservation_id: string;
  /** Numéro unique lisible — format : BC-YYYY-NNNNNN  ex: BC-2026-000042 */
  order_number: string;
  /** Chemin Supabase Storage — null si PDF non encore généré */
  pdf_url: string | null;
  driver_snapshot: DriverSnapshot;
  passenger_snapshot: PassengerSnapshot;
  trip_snapshot: TripSnapshot;
  issued_at: string;
  created_at: string;
}

/** Vue enrichie retournée par l'API */
export interface OrderWithReservation extends Order {
  reservation?: {
    id: string;
    status: string;
    client_id: string;
    driver_id: string | null;
  };
}

// ── DTOs ──────────────────────────────────────────────────────────────────────

/** Utilisé en interne pour créer un bon depuis une réservation assignée */
export interface CreateOrderFromReservationDto {
  reservation_id: string;
}

// ── Filtres liste ─────────────────────────────────────────────────────────────

export interface OrderListFilters {
  reservation_id?: string;
  page?: number;
  limit?: number;
}

// ── Résultat paginé ───────────────────────────────────────────────────────────

export interface OrderListResult {
  orders: Order[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}
