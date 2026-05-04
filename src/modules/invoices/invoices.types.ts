// ══════════════════════════════════════════════════════════════════════════════
// TYPES — Module Factures (Invoices)
// Sprint 4 — EazyVTC
//
// Règle CDC absolue : les formules de calcul ne doivent JAMAIS apparaître
// sur la facture. Seuls les montants finaux (HT, TVA, TTC) sont affichés.
// Modalité de paiement fixe : "Réglé hors application (espèces / CB fin de course)"
// ══════════════════════════════════════════════════════════════════════════════

import type { VehicleType } from '../reservations/reservations.types.js';
import type { PricingCountry } from '../pricing/pricing.types.js';

// ── Snapshots (données figées à l'émission) ───────────────────────────────────

/** Données de facturation du chauffeur figées à l'émission */
export interface DriverBillingSnapshot {
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  siret: string | null;
  /** Taux de TVA en % (ex: 10 pour 10%) — 0 si non assujetti */
  tva_rate: number;
  zone: PricingCountry;
}

/** Données client figées à l'émission */
export interface ClientInvoiceSnapshot {
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
}

/** Données de trajet figées à l'émission */
export interface TripInvoiceSnapshot {
  pickup_address: string;
  dest_address: string;
  vehicle_type: VehicleType;
  country: PricingCountry;
  scheduled_at: string;     // ISO 8601
  started_at: string | null;
  ended_at: string | null;
  actual_distance_km: number | null;
  actual_duration_min: number | null;
}

// ── Traçabilité des ajustements de prix ──────────────────────────────────────

export interface InvoiceAdjustment {
  adjusted_at: string;       // ISO 8601
  adjusted_by: string;       // user_id de l'admin
  adjusted_by_name: string;  // nom lisible pour l'affichage
  old_amount_ttc: number;
  new_amount_ttc: number;
  reason: string;
}

// ── Entité BDD ────────────────────────────────────────────────────────────────

export interface Invoice {
  id: string;
  trip_id: string;
  /** Numéro unique lisible — format : FA-YYYY-NNNNNN  ex: FA-2026-000042 */
  invoice_number: string;
  /** Chemin Supabase Storage — null si PDF non encore généré */
  pdf_url: string | null;
  driver_billing: DriverBillingSnapshot;
  client_snapshot: ClientInvoiceSnapshot;
  trip_snapshot: TripInvoiceSnapshot;
  amount_ht: number;
  tva_rate: number;
  amount_ttc: number;
  /** Tableau JSON des ajustements successifs (ordre chronologique) */
  adjustments: InvoiceAdjustment[];
  issued_at: string;
  created_at: string;
}

export interface InvoiceWithTrip extends Invoice {
  trip?: {
    id: string;
    reservation_id: string;
    started_at: string | null;
    ended_at: string | null;
    actual_distance_km: number | null;
    actual_duration_min: number | null;
  };
}

// ── DTOs ─────────────────────────────────────────────────────────────────────

export interface AdjustInvoicePriceDto {
  new_amount_ttc: number;
  reason: string;
}

// ── Filtres liste ─────────────────────────────────────────────────────────────

export interface InvoiceListFilters {
  page?: number;
  limit?: number;
}

// ── Résultat paginé ───────────────────────────────────────────────────────────

export interface InvoiceListResult {
  invoices: Invoice[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}
