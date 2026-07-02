// ══════════════════════════════════════════════════════════════════════════════
// SERVICE — Module Codes Promo
// Sprint 6 — EazyVTC
// ══════════════════════════════════════════════════════════════════════════════

import { supabaseAdmin } from '../../database/supabase/client.js';
import { sendPromoCodeEmail } from '../../utils/email.service.js';
import type {
  PromoCode,
  CreatePromoCodeDto,
  UpdatePromoCodeDto,
  BulkAssignDto,
  BulkAssignResult,
  PromoCodeValidationResult,
  PromoCodeListFilters,
  PromoCodeListResult,
  UserPromoCodeItem,
  UserPromoCodesResult,
} from './promo-codes.types.js';

// Caractères autorisés pour le suffixe auto-généré (sans I, O, 0, 1 pour éviter les confusions)
const SUFFIX_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SUFFIX_LEN   = 6;
const MAX_RETRIES  = 5;

export class PromoCodesService {

  // ══════════════════════════════════════════════════════════════════════════
  // CRUD Admin
  // ══════════════════════════════════════════════════════════════════════════

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
  //
  // Deux modes :
  //   • Code public  : dto.code fourni, assigned_user_id absent
  //   • Code assigné : dto.code_radical + dto.assigned_user_id fournis, code auto-généré
  // ────────────────────────────────────────────────────────────────────────────
  async create(dto: CreatePromoCodeDto): Promise<PromoCode> {
    let finalCode: string;
    const isAssigned = !!dto.assigned_user_id;

    if (isAssigned) {
      // Génère un code unique : RADICAL-XXXXXX
      finalCode = await this._generateUniqueCode(dto.code_radical!);
    } else {
      finalCode = dto.code!.toUpperCase();

      // Vérification d'unicité pour les codes publics
      const { data: existing } = await supabaseAdmin
        .from('promo_codes')
        .select('id')
        .eq('code', finalCode)
        .maybeSingle();

      if (existing) {
        throw { status: 409, message: `Le code "${finalCode}" est déjà utilisé` };
      }
    }

    const { data, error } = await supabaseAdmin
      .from('promo_codes')
      .insert({
        code:             finalCode,
        name:             dto.name             ?? null,
        description:      dto.description      ?? null,
        code_radical:     dto.code_radical     ?? null,
        assigned_user_id: dto.assigned_user_id ?? null,
        discount_type:    dto.discount_type,
        discount_value:   dto.discount_value,
        valid_from:       dto.valid_from        ?? null,
        valid_until:      dto.valid_until       ?? null,
        // Les codes assignés ont max_uses=1 par défaut (un usage par personne)
        // Les codes assignés ont max_uses=1 et max_uses_per_user non applicable (déjà user-specific)
        max_uses:          dto.max_uses ?? (isAssigned ? 1 : null),
        max_uses_per_user: isAssigned ? null : (dto.max_uses_per_user ?? null),
        min_order_amount:  dto.min_order_amount  ?? null,
        is_active:        true,
        condition_type:   dto.condition_type    ?? 'none',
        condition_label:  dto.condition_label   ?? null,
        pickup_lat:       dto.pickup_lat        ?? null,
        pickup_lng:       dto.pickup_lng        ?? null,
        pickup_radius_meters: dto.pickup_radius_meters ?? null,
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
  // POST /admin/promo-codes/:id/bulk-assign
  //
  // Génère un code unique par utilisateur à partir du code_radical du promo-code source.
  // Copie tous les paramètres tarifaires et de validité du code source.
  // ────────────────────────────────────────────────────────────────────────────
  async bulkAssign(templateId: string, dto: BulkAssignDto): Promise<BulkAssignResult> {
    const template = await this.getById(templateId);

    if (!template.code_radical) {
      throw {
        status: 422,
        message: 'Ce code promo n\'a pas de radical défini. Impossible de générer des codes assignés.',
      };
    }

    // Dédoublonnage des user_ids
    const uniqueUserIds = [...new Set(dto.user_ids)];

    // Vérifier que les utilisateurs n'ont pas déjà un code pour ce radical
    const { data: existingAssignments } = await supabaseAdmin
      .from('promo_codes')
      .select('assigned_user_id')
      .eq('code_radical', template.code_radical)
      .in('assigned_user_id', uniqueUserIds);

    const alreadyAssigned = new Set(
      ((existingAssignments ?? []) as Array<{ assigned_user_id: string }>)
        .map((r) => r.assigned_user_id),
    );

    const newUserIds = uniqueUserIds.filter((id) => !alreadyAssigned.has(id));

    if (newUserIds.length === 0) {
      throw {
        status: 409,
        message: 'Tous les utilisateurs sélectionnés ont déjà un code pour ce radical.',
      };
    }

    // Calcul de la date d'expiration finale pour cette assignation
    // Priorité : valid_until explicite > validity_days > valid_until du template
    let finalValidUntil: string | null = template.valid_until;
    if (dto.valid_until) {
      finalValidUntil = dto.valid_until;
    } else if (dto.validity_days) {
      const exp = new Date();
      exp.setDate(exp.getDate() + dto.validity_days);
      finalValidUntil = exp.toISOString();
    }

    // Génération code par code (retry géré dans _generateUniqueCode)
    const rows: Array<Record<string, unknown>> = [];

    for (const userId of newUserIds) {
      const code = await this._generateUniqueCode(template.code_radical);
      rows.push({
        code,
        name:              template.name,
        description:       template.description,
        code_radical:      template.code_radical,
        assigned_user_id:  userId,
        discount_type:     template.discount_type,
        discount_value:    template.discount_value,
        valid_from:        template.valid_from,
        valid_until:       finalValidUntil,
        max_uses:          1,    // un usage par personne
        max_uses_per_user: null, // non applicable pour les codes assignés
        min_order_amount:  template.min_order_amount,
        is_active:         template.is_active,
        condition_type:    template.condition_type,
        condition_label:   template.condition_label,
        pickup_lat:        template.pickup_lat,
        pickup_lng:        template.pickup_lng,
        pickup_radius_meters: template.pickup_radius_meters,
      });
    }

    const { data, error } = await supabaseAdmin
      .from('promo_codes')
      .insert(rows)
      .select('*');

    if (error || !data) {
      console.error('[PromoCodes] bulkAssign error:', error);
      throw { status: 500, message: 'Erreur lors de la création des codes assignés' };
    }

    const created = (data as PromoCode[]);

    // Email de notification à chaque bénéficiaire (fire-and-forget)
    this._notifyPromoCodeAssignees(created);

    return {
      created: created.length,
      codes:   created,
    };
  }

  /**
   * Envoie un email à chaque utilisateur ayant reçu un nouveau code promo assigné.
   * Fire-and-forget — un échec d'envoi ne doit jamais faire échouer l'attribution.
   */
  private _notifyPromoCodeAssignees(codes: PromoCode[]): void {
    (async () => {
      const userIds = codes.map((c) => c.assigned_user_id).filter(Boolean) as string[];
      if (userIds.length === 0) return;

      const { data: users } = await supabaseAdmin
        .from('users')
        .select('id, email, first_name')
        .in('id', userIds);

      const userById = new Map(
        ((users ?? []) as Array<{ id: string; email: string; first_name: string }>)
          .map((u) => [u.id, u]),
      );

      for (const promoCode of codes) {
        const user = promoCode.assigned_user_id ? userById.get(promoCode.assigned_user_id) : undefined;
        if (!user) continue;

        const discountLabel = promoCode.discount_type === 'percent'
          ? `${promoCode.discount_value}% de réduction`
          : `${promoCode.discount_value} € de réduction`;
        const validUntil = promoCode.valid_until
          ? new Date(promoCode.valid_until).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
          : null;

        sendPromoCodeEmail(user.email, user.first_name, promoCode.code, discountLabel, validUntil)
          .catch((err) => console.error('[PromoCodes] Erreur envoi email code promo:', err));
      }
    })().catch((err: unknown) => console.error('[PromoCodes] Erreur _notifyPromoCodeAssignees:', err));
  }

  async update(id: string, dto: UpdatePromoCodeDto): Promise<PromoCode> {
    await this.getById(id);

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

  async delete(id: string): Promise<void> {
    await this.getById(id);

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
  //
  // userId : obligatoire pour les codes assignés — doit correspondre à assigned_user_id.
  // ────────────────────────────────────────────────────────────────────────────
  async validateCode(
    code: string,
    orderAmount: number,
    pickupLat?: number,
    pickupLng?: number,
    userId?: string,
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

    // Vérification de l'assignation utilisateur
    if (promo.assigned_user_id) {
      if (!userId) {
        throw { status: 403, message: 'Ce code promo est réservé à un utilisateur spécifique' };
      }
      if (promo.assigned_user_id !== userId) {
        // Message neutre : on ne révèle pas à qui est assigné le code
        throw { status: 403, message: 'Ce code promo n\'est pas valable pour votre compte' };
      }
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

    // Vérification du plafond par utilisateur (codes publics avec max_uses_per_user)
    if (promo.max_uses_per_user !== null && userId) {
      const { count: userUseCount } = await supabaseAdmin
        .from('reservations')
        .select('id', { count: 'exact', head: true })
        .eq('promo_code_id', promo.id)
        .eq('client_id', userId);

      if ((userUseCount ?? 0) >= promo.max_uses_per_user) {
        throw {
          status: 422,
          message: `Vous avez déjà utilisé ce code promo ${promo.max_uses_per_user === 1 ? 'une fois' : `${promo.max_uses_per_user} fois`}. Il n'est plus disponible pour votre compte.`,
        };
      }
    }

    if (promo.min_order_amount !== null && orderAmount < promo.min_order_amount) {
      throw {
        status: 422,
        message: `Le montant minimum pour utiliser ce code est de ${promo.min_order_amount}`,
      };
    }

    if (promo.condition_type === 'pickup_location') {
      if (pickupLat == null || pickupLng == null) {
        throw { status: 422, message: 'Les coordonnées du point de départ sont requises pour ce code promo' };
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
  // VUE CLIENT — Écran "Mes codes promo"
  // ══════════════════════════════════════════════════════════════════════════

  // GET /promo-codes/mine
  //
  // Retourne les codes promo accessibles au client connecté :
  //   - codes assignés à l'utilisateur (assigned_user_id = userId)
  //   - codes publics (assigned_user_id IS NULL)
  // Partitionnés en actifs / expirés + économies totales depuis l'inscription.
  async getMine(userId: string): Promise<UserPromoCodesResult> {
    // 1. Récupérer tous les codes accessibles à cet utilisateur
    const { data: codes, error } = await supabaseAdmin
      .from('promo_codes')
      .select('id, code, name, description, discount_type, discount_value, valid_until, is_active, assigned_user_id')
      .or(`assigned_user_id.eq.${userId},assigned_user_id.is.null`)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[PromoCodes] getMine error:', error);
      throw { status: 500, message: 'Erreur lors de la récupération des codes promo' };
    }

    const now = new Date();

    const active: UserPromoCodeItem[] = [];
    const expired: UserPromoCodeItem[] = [];

    for (const row of (codes ?? []) as Array<{
      id: string;
      code: string;
      name: string | null;
      description: string | null;
      discount_type: string;
      discount_value: number;
      valid_until: string | null;
      is_active: boolean;
      assigned_user_id: string | null;
    }>) {
      const isExpired = !row.is_active || (!!row.valid_until && new Date(row.valid_until) < now);

      const item: UserPromoCodeItem = {
        id:             row.id,
        code:           row.code,
        name:           row.name,
        description:    row.description,
        discount_type:  row.discount_type as import('./promo-codes.types.js').DiscountType,
        discount_value: row.discount_value,
        valid_until:    row.valid_until,
        is_active:      row.is_active,
        is_expired:     isExpired,
      };

      if (isExpired) {
        expired.push(item);
      } else {
        active.push(item);
      }
    }

    // 2. Économies totales : somme des discount_amount sur les réservations du client
    const { data: savingsData, error: savingsError } = await supabaseAdmin
      .from('reservations')
      .select('discount_amount')
      .eq('client_id', userId)
      .not('discount_amount', 'is', null);

    if (savingsError) {
      console.error('[PromoCodes] getMine savings error:', savingsError);
    }

    const totalSavings = ((savingsData ?? []) as Array<{ discount_amount: number }>)
      .reduce((sum, r) => sum + (r.discount_amount ?? 0), 0);

    return {
      stats: {
        active_count:  active.length,
        total_savings: Math.round(totalSavings * 100) / 100,
      },
      active,
      expired,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // INTERNE
  // ══════════════════════════════════════════════════════════════════════════

  async incrementUsage(promoCodeId: string): Promise<void> {
    const { error } = await supabaseAdmin.rpc('increment_promo_uses', { p_id: promoCodeId });
    if (error) {
      console.error('[PromoCodes] incrementUsage error:', error);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PRIVÉ
  // ══════════════════════════════════════════════════════════════════════════

  // Génère un code unique "RADICAL-XXXXXX" avec vérification DB et retry
  private async _generateUniqueCode(radical: string): Promise<string> {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const suffix = Array.from(
        { length: SUFFIX_LEN },
        () => SUFFIX_CHARS[Math.floor(Math.random() * SUFFIX_CHARS.length)],
      ).join('');
      const candidate = `${radical.toUpperCase()}-${suffix}`;

      const { data } = await supabaseAdmin
        .from('promo_codes')
        .select('id')
        .eq('code', candidate)
        .maybeSingle();

      if (!data) return candidate; // Pas de collision
    }
    throw { status: 500, message: 'Impossible de générer un code unique après plusieurs tentatives' };
  }

  private _computeDiscount(promo: PromoCode, orderAmount: number): number {
    if (promo.discount_type === 'percent') {
      return Math.round((orderAmount * promo.discount_value / 100) * 100) / 100;
    }
    return Math.min(promo.discount_value, orderAmount);
  }

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
