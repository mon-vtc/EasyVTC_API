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
  base_price: number;              // Prix de prise en charge
  price_per_km: number;            // Prix par kilomètre
  price_per_min: number;           // Prix par minute
  minimum_price: number;           // Prix minimum garanti
  currency: string;                // 'EUR' ou 'XOF'
  tva_rate: number;                // 0.10 = 10 %, 0 = pas de TVA
  airport_supplement: number;      // Montant fixe supplément aéroport
  night_supplement_rate: number;   // 0.15 = +15 %, 0 = désactivé
  night_start: string;             // "HH:MM:SS" début plage nocturne
  night_end: string;               // "HH:MM:SS" fin plage nocturne
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string;              // ID admin
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
  tva_rate?: number;
  airport_supplement?: number;
  night_supplement_rate?: number;
  night_start?: string;
  night_end?: string;
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
  is_airport?: boolean;   // true → applique le supplément aéroport de la grille
  scheduled_at?: string;  // ISO 8601 — détermine si la plage nocturne s'applique
}

// ── Résultat public (CDC p.26 : jamais de formule sur les PDFs) ───────────────
export interface PriceEstimateResult {
  pricing_type: PricingType;
  country: PricingCountry;
  currency: string;
  final_price: number;   // = amount_ttc — seul montant exposé côté PDF/bon de commande
  amount_ht: number;     // Montant hors taxes
  tva_amount: number;    // Montant TVA (0 si tva_rate = 0)
  amount_ttc: number;    // Montant toutes taxes comprises
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
  // Suppléments et TVA (mode formule)
  is_airport?: boolean;
  airport_supplement_amount?: number;
  is_night?: boolean;
  night_supplement_rate?: number;
  night_supplement_amount?: number;
  tva_rate?: number;
  tva_amount?: number;
  amount_ht?: number;
  amount_ttc?: number;
}

// ══════════════════════════════════════════════════════════════════════════════
// CONFIG UNIFIÉE (GET + PATCH /pricing/config)
// ══════════════════════════════════════════════════════════════════════════════

// Subset de CommissionSetting utilisé dans la réponse config — évite l'import croisé
export interface PricingConfigCommission {
  id: string;
  label: string;
  zone: string;
  rate_type: 'percentage' | 'flat';
  rate_value: number;
  tva_rate: number;
  is_active: boolean;
}

export interface PricingConfigExample {
  distance_km: number;
  duration_min: number;
  base_price: number;
  km_cost: number;
  min_cost: number;
  subtotal_ht: number;
  tva_rate: number;
  tva_amount: number;
  amount_ttc: number;
  commission_rate: number;
  commission_ht: number;
  commission_tva_rate: number;
  commission_tva_amount: number;
  commission_ttc: number;
  driver_net_ttc: number;
}

export interface PricingConfigResult {
  country: PricingCountry;
  grid: PricingGrid;
  commission: PricingConfigCommission | null;
  example: PricingConfigExample;
}

export interface PricingConfigUpdateDto {
  country: PricingCountry;
  // Champs grille
  base_price?: number;
  price_per_km?: number;
  price_per_min?: number;
  minimum_price?: number;
  tva_rate?: number;
  airport_supplement?: number;
  night_supplement_rate?: number;
  night_start?: string;
  night_end?: string;
  // Champs commission générique (vehicle_type = NULL)
  commission_rate?: number;
  commission_tva_rate?: number;
}

// ── Filtres liste forfaits ────────────────────────────────────────────────────
export interface FlatRateListFilters {
  country?: PricingCountry;
  is_active?: boolean;
  page?: number;
  limit?: number;
}