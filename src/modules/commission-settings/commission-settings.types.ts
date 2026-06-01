// ══════════════════════════════════════════════════════════════════════════════
// TYPES — Module Commission Settings
// Sprint 6 — EazyVTC
// ══════════════════════════════════════════════════════════════════════════════

export type CommissionRateType = 'percentage' | 'flat';

// ── Paramétrage d'un taux de commission ───────────────────────────────────────
export interface CommissionSetting {
  id: string;
  label: string;
  zone: 'france' | 'senegal';
  vehicle_type: string | null;
  rate_type: CommissionRateType;
  rate_value: number;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ── DTOs ──────────────────────────────────────────────────────────────────────
export interface CreateCommissionSettingDto {
  label: string;
  zone: 'france' | 'senegal';
  vehicle_type?: string | null;
  rate_type: CommissionRateType;
  rate_value: number;
}

export interface UpdateCommissionSettingDto {
  label?: string;
  zone?: 'france' | 'senegal';
  vehicle_type?: string | null;
  rate_type?: CommissionRateType;
  rate_value?: number;
  is_active?: boolean;
}

// ── Commission calculée par course ────────────────────────────────────────────
export interface Commission {
  id: string;
  reservation_id: string;
  driver_id: string;
  commission_setting_id: string | null;
  zone: string;
  rate_type: string;
  rate_value: number;
  gross_amount: number;
  commission_amount: number;
  driver_net_amount: number;
  currency: string;
  calculated_at: string;
}

// ── Commission enrichie (avec infos réservation + chauffeur) ──────────────────
export interface CommissionDetail extends Commission {
  reservation: {
    scheduled_at: string;
    pickup_address: string;
    dest_address: string;
    vehicle_type: string | null;
  } | null;
  driver: {
    first_name: string;
    last_name: string;
  } | null;
}

// ── Résumé agrégé pour l'admin ────────────────────────────────────────────────
export interface CommissionSummary {
  period: string;
  date_from: string | null;
  date_to: string | null;
  total_rides: number;
  // EUR
  total_gross_eur: number;
  total_commission_eur: number;
  total_net_eur: number;
  // XOF
  total_gross_xof: number;
  total_commission_xof: number;
  total_net_xof: number;
  commissions: CommissionDetail[];
}

// ── Input du calcul automatique (appelé en interne depuis reservations) ────────
export interface CalculateCommissionInput {
  reservation_id: string;
  driver_id: string;
  gross_amount: number;
  zone: 'france' | 'senegal';
  vehicle_type: string | null;
  currency: string;
}
