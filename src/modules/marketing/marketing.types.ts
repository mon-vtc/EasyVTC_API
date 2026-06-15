// ══════════════════════════════════════════════════════════════════════════════
// TYPES — Module Marketing (Base clients + Campagnes)
// Sprint 6 — EazyVTC
// ══════════════════════════════════════════════════════════════════════════════

export type CampaignType   = 'email' | 'sms' | 'push';
export type CampaignStatus = 'draft' | 'sent';

// ── Entité Campagne ───────────────────────────────────────────────────────────
export interface MarketingCampaign {
  id: string;
  name: string;
  type: CampaignType;
  status: CampaignStatus;
  subject: string | null;
  body: string;
  sent_at: string | null;
  sent_count: number;
  open_rate: number;
  click_rate: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ── DTOs ──────────────────────────────────────────────────────────────────────
export interface CreateCampaignDto {
  name: string;
  type: CampaignType;
  subject?: string;
  body: string;
}

export interface UpdateCampaignDto {
  name?: string;
  subject?: string | null;
  body?: string;
}

// ── Statistiques base clients ─────────────────────────────────────────────────
export interface ClientBaseStats {
  total_clients: number;
  opt_in_email: number;
  opt_in_sms: number;
  opt_in_push: number;
}

// ── Résumé client pour la liste ───────────────────────────────────────────────
export interface ClientSummary {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  total_rides: number;
  total_spent: number;
  last_ride_date: string | null;
  marketing_email_opt_in: boolean;
  marketing_sms_opt_in: boolean;
  marketing_push_opt_in: boolean;
}

// ── Filtres ───────────────────────────────────────────────────────────────────
export interface ClientBaseFilters {
  search?: string;
  consent?: 'email' | 'sms' | 'push';
  page: number;
  limit: number;
}

export interface ClientBaseResult {
  stats: ClientBaseStats;
  clients: ClientSummary[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface CampaignListResult {
  campaigns: MarketingCampaign[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

// ── Consentements marketing d'un utilisateur ──────────────────────────────────
export interface MarketingConsents {
  marketing_email_opt_in: boolean;
  marketing_sms_opt_in:   boolean;
  marketing_push_opt_in:  boolean;
}
