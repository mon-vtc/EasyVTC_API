// ══════════════════════════════════════════════════════════════════════════════
// TYPES — Module Codes Promo
// Sprint 6 — EazyVTC
// ══════════════════════════════════════════════════════════════════════════════

export type DiscountType   = 'percent' | 'fixed';
export type ConditionType  = 'none' | 'pickup_location';

// ── Entité BDD ────────────────────────────────────────────────────────────────
export interface PromoCode {
  id: string;
  code: string;
  // Radical lisible défini par l'admin — suffixe unique auto-généré pour les codes assignés
  code_radical: string | null;
  // Si renseigné : code réservé à cet utilisateur uniquement
  assigned_user_id: string | null;
  discount_type: DiscountType;
  discount_value: number;
  valid_from: string | null;
  valid_until: string | null;
  max_uses: number | null;
  max_uses_per_user: number | null;
  uses_count: number;
  min_order_amount: number | null;
  is_active: boolean;
  condition_type: ConditionType;
  condition_label: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  pickup_radius_meters: number | null;
  created_at: string;
  updated_at: string;
}

// ── DTOs ──────────────────────────────────────────────────────────────────────

// Cas A : code public  → fournir `code` (pas de `assigned_user_id`)
// Cas B : code assigné → fournir `code_radical` + `assigned_user_id` (le code est auto-généré)
export interface CreatePromoCodeDto {
  code?: string;
  code_radical?: string;
  assigned_user_id?: string;
  discount_type: DiscountType;
  discount_value: number;
  valid_from?: string;
  valid_until?: string;
  max_uses?: number;
  max_uses_per_user?: number;
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
  max_uses_per_user?: number | null;
  min_order_amount?: number | null;
  is_active?: boolean;
  condition_type?: ConditionType;
  condition_label?: string | null;
  pickup_lat?: number | null;
  pickup_lng?: number | null;
  pickup_radius_meters?: number | null;
}

// ── Assignation en masse ──────────────────────────────────────────────────────
export interface BulkAssignDto {
  user_ids: string[];
  // Surcharge la valid_until du template pour cette assignation seulement
  valid_until?: string;
  // Equivalent pratique à valid_until = maintenant + N jours
  validity_days?: number;
}

export interface BulkAssignResult {
  created: number;
  codes: PromoCode[];
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
