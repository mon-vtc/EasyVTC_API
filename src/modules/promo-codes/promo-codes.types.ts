// ══════════════════════════════════════════════════════════════════════════════
// TYPES — Module Codes Promo
// Sprint 6 — EazyVTC
// ══════════════════════════════════════════════════════════════════════════════

export type DiscountType = 'percent' | 'fixed';
export type ConditionType = 'none' | 'pickup_location';

// ── Entité BDD ────────────────────────────────────────────────────────────────
export interface PromoCode {
  id: string;
  code: string;
  discount_type: DiscountType;
  discount_value: number;
  valid_from: string | null;
  valid_until: string | null;
  max_uses: number | null;
  uses_count: number;
  min_order_amount: number | null;
  is_active: boolean;
  // Condition géographique optionnelle (ex : départ dans un rayon autour d'un lieu)
  condition_type: ConditionType;
  condition_label: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  pickup_radius_meters: number | null;
  created_at: string;
  updated_at: string;
}

// ── DTOs ──────────────────────────────────────────────────────────────────────
export interface CreatePromoCodeDto {
  code: string;
  discount_type: DiscountType;
  discount_value: number;
  valid_from?: string;
  valid_until?: string;
  max_uses?: number;
  min_order_amount?: number;
  condition_type?: ConditionType;
  condition_label?: string;
  pickup_lat?: number;
  pickup_lng?: number;
  pickup_radius_meters?: number;
}

export interface UpdatePromoCodeDto {
  code?: string;
  discount_type?: DiscountType;
  discount_value?: number;
  valid_from?: string | null;
  valid_until?: string | null;
  max_uses?: number | null;
  min_order_amount?: number | null;
  is_active?: boolean;
  condition_type?: ConditionType;
  condition_label?: string | null;
  pickup_lat?: number | null;
  pickup_lng?: number | null;
  pickup_radius_meters?: number | null;
}

// ── Résultat de validation (endpoint client) ──────────────────────────────────
export interface PromoCodeValidationResult {
  promo_code_id: string;
  code: string;
  discount_type: DiscountType;
  discount_value: number;
  discount_amount: number;
  final_price: number;
}

// ── Filtres & pagination ──────────────────────────────────────────────────────
export interface PromoCodeListFilters {
  is_active?: boolean;
  page: number;
  limit: number;
}

export interface PromoCodeListResult {
  promo_codes: PromoCode[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}
