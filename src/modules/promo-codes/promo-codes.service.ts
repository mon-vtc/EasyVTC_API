// ══════════════════════════════════════════════════════════════════════════════
// SERVICE — Module Codes Promo
// Sprint 6 — EazyVTC
// ══════════════════════════════════════════════════════════════════════════════

import { supabaseAdmin } from '../../database/supabase/client.js';
import type {
  PromoCode,
  CreatePromoCodeDto,
  UpdatePromoCodeDto,
  PromoCodeValidationResult,
  PromoCodeListFilters,
  PromoCodeListResult,
} from './promo-codes.types.js';

export class PromoCodesService {

  // ══════════════════════════════════════════════════════════════════════════
  // CRUD Admin
  // ══════════════════════════════════════════════════════════════════════════

  // ────────────────────────────────────────────────────────────────────────────
  // GET /admin/promo-codes
  // ────────────────────────────────────────────────────────────────────────────
  async list(filters: PromoCodeListFilters): Promise<PromoCodeListResult> {
    const offset = (filters.page - 1) * filters.limit;

    let query = supabaseAdmin
      .from('promo_codes')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (filters.is_active !== undefined) query = query.eq('is_active', filters.is_active);

    const { data, error, count } = await query.range(offset, offset + filters.limit - 1);

    if (error) {
      console.error('[PromoCodes] list error:', error);
      throw { status: 500, message: 'Erreur lors de la récupération des codes promo' };
    }

    const total = count ?? 0;
    return {
      promo_codes:  (data ?? []) as PromoCode[],
      total,
      page:         filters.page,
      limit:        filters.limit,
      total_pages:  Math.ceil(total / filters.limit),
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // GET /admin/promo-codes/:id
  // ────────────────────────────────────────────────────────────────────────────
  async getById(id: string): Promise<PromoCode> {
    const { data, error } = await supabaseAdmin
      .from('promo_codes')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) throw { status: 404, message: 'Code promo introuvable' };

    return data as PromoCode;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // POST /admin/promo-codes
  // ────────────────────────────────────────────────────────────────────────────
  async create(dto: CreatePromoCodeDto): Promise<PromoCode> {
    // Vérifier l'unicité du code (code est normalisé en majuscules par le validator)
    const { data: existing } = await supabaseAdmin
      .from('promo_codes')
      .select('id')
      .eq('code', dto.code)
      .maybeSingle();

    if (existing) {
      throw { status: 409, message: `Le code "${dto.code}" est déjà utilisé` };
    }

    const { data, error } = await supabaseAdmin
      .from('promo_codes')
      .insert({
        code:             dto.code,
        discount_type:    dto.discount_type,
        discount_value:   dto.discount_value,
        valid_from:       dto.valid_from   ?? null,
        valid_until:      dto.valid_until  ?? null,
        max_uses:         dto.max_uses     ?? null,
        min_order_amount: dto.min_order_amount ?? null,
        is_active:        true,
      })
      .select('*')
      .single();

    if (error || !data) {
      console.error('[PromoCodes] create error:', error);
      if (error?.code === '23505') {
        throw { status: 409, message: 'Ce code promo existe déjà' };
      }
      throw { status: 500, message: 'Erreur lors de la création du code promo' };
    }

    return data as PromoCode;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // PATCH /admin/promo-codes/:id
  // ────────────────────────────────────────────────────────────────────────────
  async update(id: string, dto: UpdatePromoCodeDto): Promise<PromoCode> {
    await this.getById(id); // 404 si inexistant

    // Si le code est modifié, vérifier qu'il n'est pas déjà utilisé par un autre
    if (dto.code) {
      const { data: existing } = await supabaseAdmin
        .from('promo_codes')
        .select('id')
        .eq('code', dto.code)
        .neq('id', id)
        .maybeSingle();

      if (existing) {
        throw { status: 409, message: `Le code "${dto.code}" est déjà utilisé par un autre code promo` };
      }
    }

    const { data, error } = await supabaseAdmin
      .from('promo_codes')
      .update({ ...dto, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();

    if (error || !data) {
      console.error('[PromoCodes] update error:', error);
      if (error?.code === '23505') {
        throw { status: 409, message: 'Ce code est déjà utilisé' };
      }
      throw { status: 500, message: 'Erreur lors de la mise à jour du code promo' };
    }

    return data as PromoCode;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // DELETE /admin/promo-codes/:id
  // ────────────────────────────────────────────────────────────────────────────
  async delete(id: string): Promise<void> {
    await this.getById(id); // 404 si inexistant

    // Bloquer si des réservations l'utilisent (historique à préserver)
    const { count } = await supabaseAdmin
      .from('reservations')
      .select('id', { count: 'exact', head: true })
      .eq('promo_code_id', id);

    if ((count ?? 0) > 0) {
      throw {
        status: 409,
        message: 'Ce code promo est utilisé sur des réservations existantes. Désactivez-le via PATCH is_active=false plutôt que de le supprimer.',
      };
    }

    const { error } = await supabaseAdmin
      .from('promo_codes')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[PromoCodes] delete error:', error);
      throw { status: 500, message: 'Erreur lors de la suppression du code promo' };
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VALIDATION — Endpoint client
  // ══════════════════════════════════════════════════════════════════════════

  // ────────────────────────────────────────────────────────────────────────────
  // POST /promo-codes/validate
  // Vérifie la validité d'un code et retourne le détail de la remise.
  // Ne modifie pas la base (pas d'incrémentation ici).
  // pickup_lat / pickup_lng : requis si le code a une condition géographique.
  // ────────────────────────────────────────────────────────────────────────────
  async validateCode(
    code: string,
    orderAmount: number,
    pickupLat?: number,
    pickupLng?: number,
  ): Promise<PromoCodeValidationResult> {
    const { data, error } = await supabaseAdmin
      .from('promo_codes')
      .select('*')
      .eq('code', code.toUpperCase())
      .maybeSingle();

    if (error || !data) {
      throw { status: 404, message: 'Code promo introuvable ou invalide' };
    }

    const promo = data as PromoCode;

    if (!promo.is_active) {
      throw { status: 422, message: 'Ce code promo n\'est plus actif' };
    }

    const now = new Date();

    if (promo.valid_from && new Date(promo.valid_from) > now) {
      throw { status: 422, message: 'Ce code promo n\'est pas encore valide' };
    }

    if (promo.valid_until && new Date(promo.valid_until) < now) {
      throw { status: 422, message: 'Ce code promo a expiré' };
    }

    if (promo.max_uses !== null && promo.uses_count >= promo.max_uses) {
      throw { status: 422, message: 'Ce code promo a atteint son nombre maximum d\'utilisations' };
    }

    if (promo.min_order_amount !== null && orderAmount < promo.min_order_amount) {
      throw {
        status: 422,
        message: `Le montant minimum pour utiliser ce code est de ${promo.min_order_amount}`,
      };
    }

    // Vérification de la condition géographique
    if (promo.condition_type === 'pickup_location') {
      if (pickupLat == null || pickupLng == null) {
        throw {
          status: 422,
          message: 'Les coordonnées du point de départ sont requises pour ce code promo',
        };
      }
      if (
        promo.pickup_lat != null &&
        promo.pickup_lng != null &&
        promo.pickup_radius_meters != null
      ) {
        const distanceM = this._haversineMeters(pickupLat, pickupLng, promo.pickup_lat, promo.pickup_lng);
        if (distanceM > promo.pickup_radius_meters) {
          throw {
            status: 422,
            message: promo.condition_label
              ? `Ce code promo n'est valable qu'au départ de : ${promo.condition_label}`
              : 'Votre point de départ ne correspond pas à la condition de ce code promo',
          };
        }
      }
    }

    const discountAmount = this._computeDiscount(promo, orderAmount);
    const finalPrice = Math.max(0, Math.round((orderAmount - discountAmount) * 100) / 100);

    return {
      promo_code_id:   promo.id,
      code:            promo.code,
      discount_type:   promo.discount_type,
      discount_value:  promo.discount_value,
      discount_amount: discountAmount,
      final_price:     finalPrice,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // INTERNE — Appelé depuis reservations.service après création réservation
  // ══════════════════════════════════════════════════════════════════════════

  // ────────────────────────────────────────────────────────────────────────────
  // Incrémente uses_count de manière atomique via une fonction SQL.
  // Fire-and-forget : ne bloque jamais la réservation.
  // ────────────────────────────────────────────────────────────────────────────
  async incrementUsage(promoCodeId: string): Promise<void> {
    const { error } = await supabaseAdmin.rpc('increment_promo_uses', { p_id: promoCodeId });
    if (error) {
      console.error('[PromoCodes] incrementUsage error:', error);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PRIVÉ
  // ══════════════════════════════════════════════════════════════════════════

  private _computeDiscount(promo: PromoCode, orderAmount: number): number {
    if (promo.discount_type === 'percent') {
      return Math.round((orderAmount * promo.discount_value / 100) * 100) / 100;
    }
    return Math.min(promo.discount_value, orderAmount);
  }

  // Distance en mètres entre deux coordonnées GPS (formule de Haversine)
  private _haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6_371_000;
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}

export const promoCodesService = new PromoCodesService();
