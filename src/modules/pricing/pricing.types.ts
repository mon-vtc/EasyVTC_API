// ══════════════════════════════════════════════════════════════════════════════
// TYPES — Module Tarification
// Sprint 3 — EasyVTC
// ══════════════════════════════════════════════════════════════════════════════

// ── Géographie ───────────────────────────────────────────────────────────────
export type PricingCountry = 'france' | 'senegal';

// ── Type de tarif ─────────────────────────────────────────────────────────────
export type PricingType = 'formula' | 'flat_rate';

// ── Labels ───────────────────────────────────────────────────────────────────
export const PRICING_COUNTRY_LABELS: Record<PricingCountry, string> = {
  france:  'France',
  senegal: 'Sénégal',
};

export const PRICING_TYPE_LABELS: Record<PricingType, string> = {
  formula:   'Tarif à la formule (km + min)',
  flat_rate: 'Forfait itinéraire',
};

// ══════════════════════════════════════════════════════════════════════════════
// ENTITÉS BDD
// ══════════════════════════════════════════════════════════════════════════════

// ── Grille tarifaire (formule) ────────────────────────────────────────────────
// Table : pricing_grids
// Une grille active par pays — contient les paramètres de la formule
export interface PricingGrid {
  id: string;
  country: PricingCountry;
  base_price: number;        // Prix de prise en charge
  price_per_km: number;      // Prix par kilomètre
  price_per_min: number;     // Prix par minute
  minimum_price: number;     // Prix minimum garanti
  currency: string;          // 'EUR' ou 'XOF'
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string;        // ID admin
}

// ── Forfait itinéraire ────────────────────────────────────────────────────────
// Table : pricing_flat_rates
// Prix fixe pour un trajet prédéfini (ex: Massy → Orly = 37€)
export interface PricingFlatRate {
  id: string;
  country: PricingCountry;
  label: string;             // Ex: "Massy → Orly"
  origin_label: string;
  destination_label: string;
  price: number;
  pickup_surcharge: number;  // Surcharge par passager supplémentaire (0 = aucune)
  currency: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string;
}

// ══════════════════════════════════════════════════════════════════════════════
// DTOs — Création / Mise à jour
// ══════════════════════════════════════════════════════════════════════════════

export interface CreatePricingGridDto {
  country: PricingCountry;
  base_price: number;
  price_per_km: number;
  price_per_min: number;
  minimum_price: number;
  currency: string;
}

export interface UpdatePricingGridDto {
  base_price?: number;
  price_per_km?: number;
  price_per_min?: number;
  minimum_price?: number;
  is_active?: boolean;
}

export interface CreateFlatRateDto {
  country: PricingCountry;
  label: string;
  origin_label: string;
  destination_label: string;
  price: number;
  pickup_surcharge?: number; // Surcharge par passager supp. (défaut 0)
  currency: string;
}

export interface UpdateFlatRateDto {
  label?: string;
  origin_label?: string;
  destination_label?: string;
  price?: number;
  pickup_surcharge?: number;
  is_active?: boolean;
}

// ══════════════════════════════════════════════════════════════════════════════
// CALCUL DE PRIX
// ══════════════════════════════════════════════════════════════════════════════

// ── Requête de calcul ─────────────────────────────────────────────────────────
export interface PriceEstimateDto {
  country: PricingCountry;
  distance_km?: number;   // Requis uniquement si pas de flat_rate_id
  duration_min?: number;  // Requis uniquement si pas de flat_rate_id
  flat_rate_id?: string;  // Si fourni → retourne le forfait, ignore distance/durée
  nb_passengers?: number; // Nombre de passagers (pour calcul surcharge pick-up, défaut 1)
  vehicle_type?: string;  // Code du type de véhicule — utilisé pour appliquer le base_price propre au véhicule
}

// ── Résultat public (CDC p.26 : jamais de formule sur les PDFs) ───────────────
export interface PriceEstimateResult {
  pricing_type: PricingType;
  country: PricingCountry;
  currency: string;
  final_price: number;   // Seul montant exposé côté PDF/bon de commande
  breakdown: PriceBreakdown; // Stocké en BDD, usage interne uniquement
}

// ── Détail interne (stockage BDD, JAMAIS affiché sur documents) ───────────────
export interface PriceBreakdown {
  base_price?: number;
  vehicle_type?: string;
  vehicle_base_price?: number;
  distance_km?: number;
  duration_min?: number;
  price_per_km?: number;
  price_per_min?: number;
  km_cost?: number;
  min_cost?: number;
  subtotal?: number;
  minimum_applied?: boolean;
  flat_rate_id?: string;
  flat_rate_label?: string;
  nb_passengers?: number;
  pickup_surcharge_per_person?: number;
  pickup_surcharge_total?: number;
}

// ── Filtres liste forfaits ────────────────────────────────────────────────────
export interface FlatRateListFilters {
  country?: PricingCountry;
  is_active?: boolean;
  page?: number;
  limit?: number;
}