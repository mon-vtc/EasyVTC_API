// ══════════════════════════════════════════════════════════════════════════════
// SERVICE — Module Tarification
// Sprint 3 — EasyVTC
// ══════════════════════════════════════════════════════════════════════════════

import { supabaseAdmin } from '../../database/supabase/client.js';
import type {
  PricingGrid,
  PricingFlatRate,
  CreatePricingGridDto,
  UpdatePricingGridDto,
  CreateFlatRateDto,
  UpdateFlatRateDto,
  PriceEstimateDto,
  PriceEstimateResult,
  PriceBreakdown,
  FlatRateListFilters,
  PricingCountry,
} from './pricing.types.js';

// ══════════════════════════════════════════════════════════════════════════════
// HELPERS — Arrondi monétaire
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Arrondi à 2 décimales pour EUR, 0 décimale pour XOF (pas de centimes).
 */
function roundPrice(amount: number, currency: string): number {
  return currency === 'XOF'
    ? Math.round(amount)
    : Math.round(amount * 100) / 100;
}

// ══════════════════════════════════════════════════════════════════════════════
// SERVICE
// ══════════════════════════════════════════════════════════════════════════════

export class PricingService {

  // ──────────────────────────────────────────────────────────────────────────
  // GRILLES TARIFAIRES (formule)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Récupère la grille active pour un pays.
   * Il ne peut y avoir qu'une seule grille active par pays à la fois.
   */
  async getActiveGrid(country: PricingCountry): Promise<PricingGrid> {
    const { data, error } = await supabaseAdmin
      .from('pricing_grids')
      .select('*')
      .eq('country', country)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      throw { status: 404, message: `Aucune grille tarifaire active pour ${country}` };
    }

    return data as PricingGrid;
  }

  /**
   * Toutes les grilles (admin) — historique inclus.
   */
  async getAllGrids(country?: PricingCountry): Promise<PricingGrid[]> {
    let query = supabaseAdmin
      .from('pricing_grids')
      .select('*')
      .order('country')
      .order('created_at', { ascending: false });

    if (country) query = query.eq('country', country);

    const { data, error } = await query;

    if (error) throw { status: 500, message: 'Erreur lors de la récupération des grilles' };

    return (data ?? []) as PricingGrid[];
  }

  /**
   * Crée une nouvelle grille.
   * Si is_active est implicitement true, désactive l'ancienne pour ce pays.
   */
  async createGrid(adminId: string, dto: CreatePricingGridDto): Promise<PricingGrid> {
    // Désactiver la grille active existante pour ce pays
    await supabaseAdmin
      .from('pricing_grids')
      .update({ is_active: false })
      .eq('country', dto.country)
      .eq('is_active', true);

    const { data, error } = await supabaseAdmin
      .from('pricing_grids')
      .insert({
        ...dto,
        is_active:  true,
        created_by: adminId,
      })
      .select()
      .single();

    if (error || !data) {
      throw { status: 500, message: 'Erreur lors de la création de la grille tarifaire' };
    }

    return data as PricingGrid;
  }

  /**
   * Mise à jour partielle d'une grille.
   */
  async updateGrid(id: string, dto: UpdatePricingGridDto): Promise<PricingGrid> {
    const { data: existing } = await supabaseAdmin
      .from('pricing_grids')
      .select('id, country')
      .eq('id', id)
      .single();

    if (!existing) throw { status: 404, message: 'Grille tarifaire introuvable' };

    // Si on réactive cette grille, on désactive les autres du même pays
    if (dto.is_active === true) {
      await supabaseAdmin
        .from('pricing_grids')
        .update({ is_active: false })
        .eq('country', existing.country)
        .neq('id', id);
    }

    const { data, error } = await supabaseAdmin
      .from('pricing_grids')
      .update({ ...dto, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error || !data) {
      throw { status: 500, message: 'Erreur lors de la mise à jour de la grille tarifaire' };
    }

    return data as PricingGrid;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // FORFAITS ITINÉRAIRES (flat rates)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Liste des forfaits avec filtres et pagination.
   */
  async listFlatRates(filters: FlatRateListFilters): Promise<{
    flat_rates: PricingFlatRate[];
    total: number;
    page: number;
    limit: number;
    total_pages: number;
  }> {
    const page  = filters.page  ?? 1;
    const limit = filters.limit ?? 20;
    const from  = (page - 1) * limit;
    const to    = from + limit - 1;

    let query = supabaseAdmin
      .from('pricing_flat_rates')
      .select('*', { count: 'exact' })
      .order('country')
      .order('label')
      .range(from, to);

    if (filters.country   !== undefined) query = query.eq('country', filters.country);
    if (filters.is_active !== undefined) query = query.eq('is_active', filters.is_active);

    const { data, error, count } = await query;

    if (error) throw { status: 500, message: 'Erreur lors de la récupération des forfaits' };

    const total = count ?? 0;

    return {
      flat_rates:  (data ?? []) as PricingFlatRate[],
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit),
    };
  }

  /**
   * Récupère un forfait par ID.
   */
  async getFlatRateById(id: string): Promise<PricingFlatRate> {
    const { data, error } = await supabaseAdmin
      .from('pricing_flat_rates')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) throw { status: 404, message: 'Forfait introuvable' };

    return data as PricingFlatRate;
  }

  /**
   * Crée un forfait.
   */
  async createFlatRate(adminId: string, dto: CreateFlatRateDto): Promise<PricingFlatRate> {
    // Vérifier les doublons (même libellé, même pays)
    const { data: existing } = await supabaseAdmin
      .from('pricing_flat_rates')
      .select('id')
      .eq('country', dto.country)
      .ilike('label', dto.label)
      .limit(1)
      .single();

    if (existing) {
      throw {
        status: 409,
        message: `Un forfait "${dto.label}" existe déjà pour ${dto.country}`,
      };
    }

    const { data, error } = await supabaseAdmin
      .from('pricing_flat_rates')
      .insert({ ...dto, is_active: true, created_by: adminId })
      .select()
      .single();

    if (error || !data) {
      throw { status: 500, message: 'Erreur lors de la création du forfait' };
    }

    return data as PricingFlatRate;
  }

  /**
   * Mise à jour partielle d'un forfait.
   */
  async updateFlatRate(id: string, dto: UpdateFlatRateDto): Promise<PricingFlatRate> {
    const { data: existing } = await supabaseAdmin
      .from('pricing_flat_rates')
      .select('id')
      .eq('id', id)
      .single();

    if (!existing) throw { status: 404, message: 'Forfait introuvable' };

    const { data, error } = await supabaseAdmin
      .from('pricing_flat_rates')
      .update({ ...dto, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error || !data) {
      throw { status: 500, message: 'Erreur lors de la mise à jour du forfait' };
    }

    return data as PricingFlatRate;
  }

  /**
   * Suppression logique d'un forfait (is_active = false).
   */
  async deactivateFlatRate(id: string): Promise<void> {
    const { data: existing } = await supabaseAdmin
      .from('pricing_flat_rates')
      .select('id')
      .eq('id', id)
      .single();

    if (!existing) throw { status: 404, message: 'Forfait introuvable' };

    const { error } = await supabaseAdmin
      .from('pricing_flat_rates')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw { status: 500, message: 'Erreur lors de la désactivation du forfait' };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CALCUL DE PRIX — Moteur tarifaire
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Calcule le prix d'une course.
   *
   * Deux modes :
   *  1. flat_rate_id fourni → retourne le prix fixe du forfait
   *  2. distance_km + duration_min → applique la formule :
   *     prix_base + (price_per_km × dist) + (price_per_min × durée)
   *     puis applique le minimum garanti.
   *
   * ⚠️  CDC p.26 : le breakdown ne doit JAMAIS apparaître sur les PDFs/bons.
   *     Seul final_price est affiché côté client. Le breakdown est stocké
   *     en BDD dans la table reservations (colonne price_breakdown jsonb).
   */
  async calculatePrice(dto: PriceEstimateDto): Promise<PriceEstimateResult> {

    // ── MODE FORFAIT ──────────────────────────────────────────────────────────
    if (dto.flat_rate_id) {
      const flatRate = await this.getFlatRateById(dto.flat_rate_id);

      if (!flatRate.is_active) {
        throw { status: 400, message: 'Ce forfait n\'est plus actif' };
      }
      if (flatRate.country !== dto.country) {
        throw { status: 400, message: 'Ce forfait n\'est pas disponible pour ce pays' };
      }

      const nb_passengers           = dto.nb_passengers ?? 1;
      const nb_extra                = Math.max(0, nb_passengers - 1);
      const pickup_surcharge_total  = roundPrice(nb_extra * (flatRate.pickup_surcharge ?? 0), flatRate.currency);
      const final_price             = roundPrice(flatRate.price + pickup_surcharge_total, flatRate.currency);

      const breakdown: PriceBreakdown = {
        flat_rate_id:              flatRate.id,
        flat_rate_label:           flatRate.label,
        nb_passengers,
        pickup_surcharge_per_person: flatRate.pickup_surcharge ?? 0,
        pickup_surcharge_total,
      };

      return {
        pricing_type: 'flat_rate',
        country:      dto.country,
        currency:     flatRate.currency,
        final_price,
        breakdown,
      };
    }

    // ── MODE FORMULE ──────────────────────────────────────────────────────────
    const distance_km  = dto.distance_km!;
    const duration_min = dto.duration_min!;

    const grid = await this.getActiveGrid(dto.country);

    const km_cost  = roundPrice(grid.price_per_km  * distance_km,  grid.currency);
    const min_cost = roundPrice(grid.price_per_min * duration_min, grid.currency);
    const subtotal = roundPrice(grid.base_price + km_cost + min_cost, grid.currency);

    const minimum_applied = subtotal < grid.minimum_price;
    const final_price = minimum_applied
      ? grid.minimum_price
      : subtotal;

    const breakdown: PriceBreakdown = {
      base_price:       grid.base_price,
      distance_km,
      duration_min,
      price_per_km:     grid.price_per_km,
      price_per_min:    grid.price_per_min,
      km_cost,
      min_cost,
      subtotal,
      minimum_applied,
    };

    return {
      pricing_type: 'formula',
      country:      dto.country,
      currency:     grid.currency,
      final_price:  roundPrice(final_price, grid.currency),
      breakdown,
    };
  }

  /**
   * Expose le moteur tarifaire pour usage interne (ex: module réservations).
   * Retourne uniquement final_price + breakdown — pas de couche HTTP.
   */
  async computePrice(dto: PriceEstimateDto): Promise<{ final_price: number; currency: string; breakdown: PriceBreakdown }> {
    const result = await this.calculatePrice(dto);
    return {
      final_price: result.final_price,
      currency:    result.currency,
      breakdown:   result.breakdown,
    };
  }
}

export const pricingService = new PricingService();