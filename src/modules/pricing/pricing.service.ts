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
  PricingConfigResult,
  PricingConfigCommission,
  PricingConfigUpdateDto,
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

/**
 * Détermine si une heure ISO 8601 tombe dans la plage nocturne.
 * Utilise l'heure UTC du timestamp.
 * Gère le cas où la plage franchit minuit (ex: 19:00 → 07:00).
 */
function isNightTime(scheduledAt: string, nightStart: string, nightEnd: string): boolean {
  const date    = new Date(scheduledAt);
  const hhmm    = `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`;
  const start   = nightStart.substring(0, 5); // "HH:MM" depuis "HH:MM:SS" Postgres
  const end     = nightEnd.substring(0, 5);
  if (start > end) {
    // Plage franchit minuit (ex: 19:00 → 07:00)
    return hhmm >= start || hhmm < end;
  }
  return hhmm >= start && hhmm < end;
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

      const nb_passengers = dto.nb_passengers ?? 1;

      // Surcharge par passager au-delà du premier (0 si non configurée sur le forfait).
      const pickup_surcharge_per_person = flatRate.pickup_surcharge ?? 0;
      const pickup_surcharge_total = roundPrice(
        Math.max(0, nb_passengers - 1) * pickup_surcharge_per_person,
        flatRate.currency,
      );

      const amount_ttc = roundPrice(flatRate.price + pickup_surcharge_total, flatRate.currency);

      const breakdown: PriceBreakdown = {
        flat_rate_id:    flatRate.id,
        flat_rate_label: flatRate.label,
        nb_passengers,
        pickup_surcharge_per_person,
        pickup_surcharge_total,
        tva_rate:   0,
        tva_amount: 0,
        amount_ht:  amount_ttc,
        amount_ttc,
      };

      return {
        pricing_type: 'flat_rate',
        country:      dto.country,
        currency:     flatRate.currency,
        final_price:  amount_ttc,
        amount_ht:    amount_ttc,
        tva_amount:   0,
        amount_ttc,
        breakdown,
      };
    }

    // ── MODE FORMULE ──────────────────────────────────────────────────────────
    const distance_km  = dto.distance_km!;
    const duration_min = dto.duration_min!;

    const grid = await this.getActiveGrid(dto.country);

    // Récupère le base_price propre au type de véhicule si fourni.
    // Remplace grid.base_price dans la formule (le VTC à la demande facture
    // un montant de prise en charge différent selon le standing du véhicule).
    let vehicle_base_price = grid.base_price;
    let vehicle_type_code: string | undefined;

    if (dto.vehicle_type) {
      const { data: vt } = await supabaseAdmin
        .from('vehicle_types')
        .select('base_price_france, base_price_senegal')
        .eq('code', dto.vehicle_type)
        .eq('is_active', true)
        .single();

      if (vt) {
        const raw    = dto.country === 'senegal' ? vt.base_price_senegal : vt.base_price_france;
        const parsed = Number(raw);
        if (!isNaN(parsed) && parsed > 0) {
          vehicle_base_price = parsed;
          vehicle_type_code  = dto.vehicle_type;
        }
      }
    }

    const km_cost  = roundPrice(grid.price_per_km  * distance_km,  grid.currency);
    const min_cost = roundPrice(grid.price_per_min * duration_min, grid.currency);
    const subtotal = roundPrice(vehicle_base_price + km_cost + min_cost, grid.currency);

    const minimum_applied   = subtotal < grid.minimum_price;
    const effective_subtotal = minimum_applied ? grid.minimum_price : subtotal;

    // ── Supplément aéroport ───────────────────────────────────────────────────
    const is_airport = dto.is_airport ?? false;
    const airport_supplement_amount = is_airport
      ? roundPrice(grid.airport_supplement ?? 0, grid.currency)
      : 0;

    // ── Supplément nocturne ───────────────────────────────────────────────────
    const night_rate = grid.night_supplement_rate ?? 0;
    const is_night   = dto.scheduled_at && night_rate > 0
      ? isNightTime(dto.scheduled_at, grid.night_start ?? '19:00', grid.night_end ?? '07:00')
      : false;
    const night_supplement_amount = is_night
      ? roundPrice(effective_subtotal * night_rate, grid.currency)
      : 0;

    // ── Montant HT + TVA + TTC ────────────────────────────────────────────────
    const amount_ht  = roundPrice(effective_subtotal + airport_supplement_amount + night_supplement_amount, grid.currency);
    const tva_rate   = grid.tva_rate ?? 0;
    const tva_amount = roundPrice(amount_ht * tva_rate, grid.currency);
    const amount_ttc = roundPrice(amount_ht + tva_amount, grid.currency);

    const breakdown: PriceBreakdown = {
      base_price:          grid.base_price,
      ...(vehicle_type_code && {
        vehicle_type:       vehicle_type_code,
        vehicle_base_price: vehicle_base_price,
      }),
      distance_km,
      duration_min,
      price_per_km:        grid.price_per_km,
      price_per_min:       grid.price_per_min,
      km_cost,
      min_cost,
      subtotal,
      minimum_applied,
      is_airport,
      airport_supplement_amount,
      is_night:                  is_night as boolean,
      night_supplement_rate:     night_rate,
      night_supplement_amount,
      tva_rate,
      tva_amount,
      amount_ht,
      amount_ttc,
    };

    return {
      pricing_type: 'formula',
      country:      dto.country,
      currency:     grid.currency,
      final_price:  amount_ttc,
      amount_ht,
      tva_amount,
      amount_ttc,
      breakdown,
    };
  }

  /**
   * Expose le moteur tarifaire pour usage interne (ex: module réservations).
   */
  async computePrice(dto: PriceEstimateDto): Promise<{ final_price: number; amount_ht: number; tva_amount: number; amount_ttc: number; currency: string; breakdown: PriceBreakdown }> {
    const result = await this.calculatePrice(dto);
    return {
      final_price: result.final_price,
      amount_ht:   result.amount_ht,
      tva_amount:  result.tva_amount,
      amount_ttc:  result.amount_ttc,
      currency:    result.currency,
      breakdown:   result.breakdown,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CONFIG UNIFIÉE — GET + PATCH /pricing/config
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Retourne la config tarifaire complète d'un pays :
   * grille active + commission générique + exemple de calcul (15 km / 25 min).
   */
  async getPricingConfig(country: PricingCountry): Promise<PricingConfigResult> {
    const grid = await this.getActiveGrid(country);

    const { data: commData } = await supabaseAdmin
      .from('commission_settings')
      .select('id, label, zone, rate_type, rate_value, tva_rate, is_active')
      .eq('zone', country)
      .is('vehicle_type', null)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    const commission = commData ? (commData as PricingConfigCommission) : null;

    // Exemple fixe : 15 km, 25 min (sans supplément, sans TVA sur l'exemple si non configurée)
    const exKm  = 15;
    const exMin = 25;
    const exKmCost  = roundPrice(grid.price_per_km  * exKm,  grid.currency);
    const exMinCost = roundPrice(grid.price_per_min * exMin, grid.currency);
    const exRaw     = roundPrice(grid.base_price + exKmCost + exMinCost, grid.currency);
    const exBase    = Math.max(exRaw, grid.minimum_price);
    const tvRate    = grid.tva_rate ?? 0;
    const exTva     = roundPrice(exBase * tvRate, grid.currency);
    const exTtc     = roundPrice(exBase + exTva, grid.currency);

    let commRate    = 0;
    let commHt      = 0;
    let commTvaRate = 0;
    let commTva     = 0;
    let commTtc     = 0;

    if (commission) {
      commRate    = commission.rate_value;
      commTvaRate = commission.tva_rate ?? 0;
      commHt      = commission.rate_type === 'percentage'
        ? roundPrice(exBase * (commRate / 100), grid.currency)
        : roundPrice(commRate, grid.currency);
      commTva  = roundPrice(commHt * commTvaRate, grid.currency);
      commTtc  = roundPrice(commHt + commTva, grid.currency);
    }

    return {
      country,
      grid,
      commission,
      example: {
        distance_km:          exKm,
        duration_min:         exMin,
        base_price:           grid.base_price,
        km_cost:              exKmCost,
        min_cost:             exMinCost,
        subtotal_ht:          exBase,
        tva_rate:             tvRate,
        tva_amount:           exTva,
        amount_ttc:           exTtc,
        commission_rate:      commRate,
        commission_ht:        commHt,
        commission_tva_rate:  commTvaRate,
        commission_tva_amount: commTva,
        commission_ttc:       commTtc,
        driver_net_ttc:       roundPrice(exTtc - commTtc, grid.currency),
      },
    };
  }

  /**
   * Met à jour la config tarifaire d'un pays en une seule opération atomique.
   * Modifie la grille active existante et/ou la commission générique active.
   * Retourne la config mise à jour.
   */
  async updatePricingConfig(dto: PricingConfigUpdateDto, adminId: string): Promise<PricingConfigResult> {
    const { country, commission_rate, commission_tva_rate, ...gridFields } = dto;

    // Mise à jour de la grille ────────────────────────────────────────────────
    const gridUpdates = Object.fromEntries(
      Object.entries(gridFields).filter(([, v]) => v !== undefined),
    );

    if (Object.keys(gridUpdates).length > 0) {
      const { data: activeGrid } = await supabaseAdmin
        .from('pricing_grids')
        .select('id')
        .eq('country', country)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (!activeGrid) {
        throw { status: 404, message: `Aucune grille tarifaire active pour ${country}. Créez d'abord une grille via POST /pricing/grids.` };
      }

      const { error: gridErr } = await supabaseAdmin
        .from('pricing_grids')
        .update({ ...gridUpdates, updated_at: new Date().toISOString() })
        .eq('id', activeGrid.id);

      if (gridErr) throw { status: 500, message: 'Erreur lors de la mise à jour de la grille tarifaire' };
    }

    // Mise à jour de la commission générique ──────────────────────────────────
    const commUpdates: Record<string, number> = {};
    if (commission_rate      !== undefined) commUpdates['rate_value'] = commission_rate;
    if (commission_tva_rate  !== undefined) commUpdates['tva_rate']   = commission_tva_rate;

    if (Object.keys(commUpdates).length > 0) {
      const { data: activeSetting } = await supabaseAdmin
        .from('commission_settings')
        .select('id')
        .eq('zone', country)
        .is('vehicle_type', null)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (activeSetting) {
        const { error: commErr } = await supabaseAdmin
          .from('commission_settings')
          .update({ ...commUpdates, updated_at: new Date().toISOString() })
          .eq('id', activeSetting.id);

        if (commErr) throw { status: 500, message: 'Erreur lors de la mise à jour de la commission' };
      }
      // Si aucune commission générique active : on ignore silencieusement
    }

    void adminId; // l'audit est géré dans le controller

    return this.getPricingConfig(country);
  }
}

export const pricingService = new PricingService();