// ══════════════════════════════════════════════════════════════════════════════
// TYPES — Module Bons de commande (Orders)
// Sprint 4 — EazyVTC
//
// Règle CDC absolue (p.26) : les formules de calcul et détails tarifaires
// ne doivent JAMAIS apparaître sur le bon de commande. Seul le montant final
// est affiché si c'est un forfait.
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

/**
 * Données de course figées.
 * IMPORTANT : le montant final est inclus UNIQUEMENT si c'est un forfait
 * (pricing_type === 'flat_rate'). Jamais de formule ni de détail de calcul.
 */
export interface TripSnapshot {
  pickup_address: string;
  dest_address: string;
  vehicle_type: VehicleType;
  country: PricingCountry;
  scheduled_at: string;             // ISO 8601
  comment: string | null;
  via: string;                      // Canal/source, ex: "EazyVTC"
  pricing_type: PricingType;
  /** Montant final affiché UNIQUEMENT pour les forfaits (jamais la formule) */
  final_price: number | null;
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
