// ══════════════════════════════════════════════════════════════════════════════
// SERVICE — Module Commission Settings
// Sprint 6 — EasyVTC
// ══════════════════════════════════════════════════════════════════════════════

import { supabaseAdmin } from '../../database/supabase/client.js';
import type {
  CommissionSetting,
  CommissionDetail,
  CommissionSummary,
  CreateCommissionSettingDto,
  UpdateCommissionSettingDto,
  CalculateCommissionInput,
} from './commission-settings.types.js';

type PeriodType = 'week' | 'month' | 'all';

// ══════════════════════════════════════════════════════════════════════════════
// SERVICE
// ══════════════════════════════════════════════════════════════════════════════

export class CommissionSettingsService {

  // ══════════════════════════════════════════════════════════════════════════
  // CRUD — Paramétrage
  // ══════════════════════════════════════════════════════════════════════════

  // ────────────────────────────────────────────────────────────────────────────
  // GET /admin/commission-settings
  // ────────────────────────────────────────────────────────────────────────────
  async listSettings(filters: { zone?: string; is_active?: boolean }): Promise<CommissionSetting[]> {
    let query = supabaseAdmin
      .from('commission_settings')
      .select('*')
      .order('zone')
      .order('vehicle_type', { nullsFirst: true })
      .order('created_at', { ascending: false });

    if (filters.zone)                query = query.eq('zone', filters.zone);
    if (filters.is_active !== undefined) query = query.eq('is_active', filters.is_active);

    const { data, error } = await query;

    if (error) {
      console.error('[CommissionSettings] listSettings error:', error);
      throw { status: 500, message: 'Erreur lors de la récupération des paramètrages' };
    }

    return (data ?? []) as CommissionSetting[];
  }

  // ────────────────────────────────────────────────────────────────────────────
  // GET /admin/commission-settings/:id
  // ────────────────────────────────────────────────────────────────────────────
  async getSettingById(id: string): Promise<CommissionSetting> {
    const { data, error } = await supabaseAdmin
      .from('commission_settings')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) throw { status: 404, message: 'Paramétrage de commission introuvable' };

    return data as CommissionSetting;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // POST /admin/commission-settings
  // ────────────────────────────────────────────────────────────────────────────
  async createSetting(dto: CreateCommissionSettingDto, createdBy: string): Promise<CommissionSetting> {
    // Vérifier l'unicité : un seul taux actif par (zone, vehicle_type)
    await this._checkUniquenessOrThrow(dto.zone, dto.vehicle_type ?? null, null);

    const { data, error } = await supabaseAdmin
      .from('commission_settings')
      .insert({
        label:        dto.label,
        zone:         dto.zone,
        vehicle_type: dto.vehicle_type ?? null,
        rate_type:    dto.rate_type,
        rate_value:   dto.rate_value,
        is_active:    true,
        created_by:   createdBy,
      })
      .select('*')
      .single();

    if (error || !data) {
      console.error('[CommissionSettings] createSetting error:', error);
      // Contrainte unique violée (index partiel sur is_active=true)
      if (error?.code === '23505') {
        throw { status: 409, message: 'Un taux actif existe déjà pour cette combinaison zone / type de véhicule' };
      }
      throw { status: 500, message: 'Erreur lors de la création du paramétrage' };
    }

    return data as CommissionSetting;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // PATCH /admin/commission-settings/:id
  // ────────────────────────────────────────────────────────────────────────────
  async updateSetting(id: string, dto: UpdateCommissionSettingDto): Promise<CommissionSetting> {
    await this.getSettingById(id); // 404 si inexistant

    // Si on active ce paramétrage, vérifier qu'aucun autre n'est déjà actif pour la même combinaison
    if (dto.is_active === true) {
      const existing = await this.getSettingById(id);
      await this._checkUniquenessOrThrow(
        dto.zone ?? existing.zone,
        dto.vehicle_type !== undefined ? dto.vehicle_type : existing.vehicle_type,
        id,
      );
    }

    const { data, error } = await supabaseAdmin
      .from('commission_settings')
      .update({ ...dto, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();

    if (error || !data) {
      console.error('[CommissionSettings] updateSetting error:', error);
      if (error?.code === '23505') {
        throw { status: 409, message: 'Un taux actif existe déjà pour cette combinaison zone / type de véhicule' };
      }
      throw { status: 500, message: 'Erreur lors de la mise à jour du paramétrage' };
    }

    return data as CommissionSetting;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // DELETE /admin/commission-settings/:id
  // ────────────────────────────────────────────────────────────────────────────
  async deleteSetting(id: string): Promise<void> {
    await this.getSettingById(id); // 404 si inexistant

    // Vérifier qu'aucune commission n'a déjà utilisé ce paramétrage
    const { count } = await supabaseAdmin
      .from('commissions')
      .select('id', { count: 'exact', head: true })
      .eq('commission_setting_id', id);

    if ((count ?? 0) > 0) {
      // Désactiver au lieu de supprimer pour préserver l'auditabilité
      throw {
        status: 409,
        message: 'Ce paramétrage est déjà utilisé sur des courses passées. Désactivez-le via PATCH is_active=false plutôt que de le supprimer.',
      };
    }

    const { error } = await supabaseAdmin
      .from('commission_settings')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[CommissionSettings] deleteSetting error:', error);
      throw { status: 500, message: 'Erreur lors de la suppression du paramétrage' };
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CALCUL — Appelé en interne depuis reservations.completeTrip
  // ══════════════════════════════════════════════════════════════════════════

  // ────────────────────────────────────────────────────────────────────────────
  // Trouve le taux applicable le plus précis (zone + vehicle_type exact, puis zone seule)
  // ────────────────────────────────────────────────────────────────────────────
  async findApplicableSetting(
    zone: string,
    vehicleType: string | null,
  ): Promise<CommissionSetting | null> {
    // Priorité 1 : taux actif correspondant exactement à zone + vehicle_type
    if (vehicleType) {
      const { data: specific } = await supabaseAdmin
        .from('commission_settings')
        .select('*')
        .eq('zone', zone)
        .eq('vehicle_type', vehicleType)
        .eq('is_active', true)
        .limit(1)
        .single();

      if (specific) return specific as CommissionSetting;
    }

    // Priorité 2 : taux actif générique pour la zone (vehicle_type = NULL)
    const { data: generic } = await supabaseAdmin
      .from('commission_settings')
      .select('*')
      .eq('zone', zone)
      .is('vehicle_type', null)
      .eq('is_active', true)
      .limit(1)
      .single();

    return generic ? (generic as CommissionSetting) : null;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Calcule et enregistre la commission d'une course terminée.
  // Idempotent : ne crée pas de doublon si appelé plusieurs fois.
  // ────────────────────────────────────────────────────────────────────────────
  async calculateAndRecord(input: CalculateCommissionInput): Promise<void> {
    // Idempotence : vérifier qu'il n'y a pas déjà une commission pour cette course
    const { data: existing } = await supabaseAdmin
      .from('commissions')
      .select('id')
      .eq('reservation_id', input.reservation_id)
      .maybeSingle();

    if (existing) return; // Déjà calculée — on ne recalcule pas

    const setting = await this.findApplicableSetting(input.zone, input.vehicle_type);

    let commissionAmount    = 0;
    let commissionTvaAmount = 0;
    let commissionTtcAmount = 0;
    let rateType  = 'none';
    let rateValue = 0;
    let settingId: string | null = null;

    if (setting) {
      rateType  = setting.rate_type;
      rateValue = setting.rate_value;
      settingId = setting.id;

      if (setting.rate_type === 'percentage') {
        commissionAmount = input.gross_amount * (setting.rate_value / 100);
      } else {
        commissionAmount = setting.rate_value;
      }

      commissionAmount = input.currency === 'XOF'
        ? Math.round(commissionAmount)
        : Math.round(commissionAmount * 100) / 100;

      commissionAmount = Math.min(commissionAmount, input.gross_amount);

      // TVA sur la commission (snapshot du taux configuré)
      const tvRate = setting.tva_rate ?? 0;
      commissionTvaAmount = input.currency === 'XOF'
        ? Math.round(commissionAmount * tvRate)
        : Math.round(commissionAmount * tvRate * 100) / 100;
      commissionTtcAmount = input.currency === 'XOF'
        ? Math.round(commissionAmount + commissionTvaAmount)
        : Math.round((commissionAmount + commissionTvaAmount) * 100) / 100;
    }

    // Le chauffeur reçoit le brut moins la commission TTC (plateforme encaisse comm + TVA comm)
    const driverNet = input.currency === 'XOF'
      ? Math.round(input.gross_amount - commissionTtcAmount)
      : Math.round((input.gross_amount - commissionTtcAmount) * 100) / 100;

    const { error } = await supabaseAdmin
      .from('commissions')
      .insert({
        reservation_id:        input.reservation_id,
        driver_id:             input.driver_id,
        commission_setting_id: settingId,
        zone:                  input.zone,
        rate_type:             rateType,
        rate_value:            rateValue,
        gross_amount:          input.gross_amount,
        commission_amount:     commissionAmount,
        commission_tva_amount: commissionTvaAmount,
        commission_ttc_amount: commissionTtcAmount,
        driver_net_amount:     driverNet,
        currency:              input.currency,
      });

    if (error) {
      console.error('[CommissionSettings] calculateAndRecord error:', error);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // REPORTING — Endpoints admin
  // ══════════════════════════════════════════════════════════════════════════

  // ────────────────────────────────────────────────────────────────────────────
  // GET /admin/commissions?period=month&date=YYYY-MM-DD&zone=france
  // ────────────────────────────────────────────────────────────────────────────
  async listCommissions(filters: {
    period: PeriodType;
    date?: string;
    zone?: string;
    driver_id?: string;
    page: number;
    limit: number;
  }): Promise<{ commissions: CommissionDetail[]; total: number; page: number; limit: number; total_pages: number }> {
    const { dateFrom, dateTo } = this._computeDateRange(filters.period, filters.date);
    const offset = (filters.page - 1) * filters.limit;

    let query = supabaseAdmin
      .from('commissions')
      .select(`
        *,
        reservation:reservations!reservation_id(scheduled_at, pickup_address, dest_address, vehicle_type),
        driver:drivers!driver_id(user:users!user_id(first_name, last_name))
      `, { count: 'exact' })
      .order('calculated_at', { ascending: false });

    if (dateFrom) query = query.gte('calculated_at', dateFrom);
    if (dateTo)   query = query.lte('calculated_at', dateTo);
    if (filters.zone)      query = query.eq('zone', filters.zone);
    if (filters.driver_id) query = query.eq('driver_id', filters.driver_id);

    const { data, error, count } = await query.range(offset, offset + filters.limit - 1);

    if (error) {
      console.error('[CommissionSettings] listCommissions error:', error);
      throw { status: 500, message: 'Erreur lors de la récupération des commissions' };
    }

    const commissions = (data ?? []).map((c: any) => ({
      ...c,
      reservation: c.reservation ?? null,
      driver: c.driver?.user
        ? { first_name: c.driver.user.first_name, last_name: c.driver.user.last_name }
        : null,
    }));

    const total = count ?? 0;
    return { commissions, total, page: filters.page, limit: filters.limit, total_pages: Math.ceil(total / filters.limit) };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // GET /admin/commissions/summary?period=month&date=YYYY-MM-DD
  // ────────────────────────────────────────────────────────────────────────────
  async getSummary(period: PeriodType, date?: string): Promise<CommissionSummary> {
    const { dateFrom, dateTo } = this._computeDateRange(period, date);

    let query = supabaseAdmin
      .from('commissions')
      .select(`
        *,
        reservation:reservations!reservation_id(scheduled_at, pickup_address, dest_address, vehicle_type),
        driver:drivers!driver_id(user:users!user_id(first_name, last_name))
      `)
      .order('calculated_at', { ascending: false });

    if (dateFrom) query = query.gte('calculated_at', dateFrom);
    if (dateTo)   query = query.lte('calculated_at', dateTo);

    const { data, error } = await query;

    if (error) {
      console.error('[CommissionSettings] getSummary error:', error);
      throw { status: 500, message: 'Erreur lors du calcul du résumé des commissions' };
    }

    const rows = data ?? [];
    let totalGrossEur = 0, totalCommEur = 0, totalNetEur = 0;
    let totalGrossXof = 0, totalCommXof = 0, totalNetXof = 0;

    const commissions: CommissionDetail[] = rows.map((c: any) => {
      if (c.currency === 'XOF') {
        totalGrossXof += Number(c.gross_amount);
        totalCommXof  += Number(c.commission_amount);
        totalNetXof   += Number(c.driver_net_amount);
      } else {
        totalGrossEur += Number(c.gross_amount);
        totalCommEur  += Number(c.commission_amount);
        totalNetEur   += Number(c.driver_net_amount);
      }
      return {
        ...c,
        reservation: c.reservation ?? null,
        driver: c.driver?.user
          ? { first_name: c.driver.user.first_name, last_name: c.driver.user.last_name }
          : null,
      };
    });

    return {
      period,
      date_from: dateFrom,
      date_to:   dateTo,
      total_rides:          rows.length,
      total_gross_eur:      Math.round(totalGrossEur * 100) / 100,
      total_commission_eur: Math.round(totalCommEur  * 100) / 100,
      total_net_eur:        Math.round(totalNetEur   * 100) / 100,
      total_gross_xof:      Math.round(totalGrossXof),
      total_commission_xof: Math.round(totalCommXof),
      total_net_xof:        Math.round(totalNetXof),
      commissions,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PRIVÉ — Helpers
  // ══════════════════════════════════════════════════════════════════════════

  private async _checkUniquenessOrThrow(
    zone: string,
    vehicleType: string | null,
    excludeId: string | null,
  ): Promise<void> {
    let query = supabaseAdmin
      .from('commission_settings')
      .select('id')
      .eq('zone', zone)
      .eq('is_active', true);

    if (vehicleType) {
      query = query.eq('vehicle_type', vehicleType);
    } else {
      query = query.is('vehicle_type', null);
    }

    if (excludeId) query = query.neq('id', excludeId);

    const { data } = await query.limit(1).maybeSingle();

    if (data) {
      throw {
        status: 409,
        message: 'Un taux actif existe déjà pour cette combinaison zone / type de véhicule. Désactivez-le d\'abord.',
      };
    }
  }

  private _computeDateRange(period: PeriodType, date?: string): { dateFrom: string | null; dateTo: string | null } {
    if (period === 'all') return { dateFrom: null, dateTo: null };

    const ref = date ? new Date(`${date}T00:00:00.000Z`) : new Date();

    if (period === 'week') {
      const day = ref.getUTCDay();
      const diffToMonday = day === 0 ? -6 : 1 - day;
      const monday = new Date(ref);
      monday.setUTCDate(ref.getUTCDate() + diffToMonday);
      monday.setUTCHours(0, 0, 0, 0);
      const sunday = new Date(monday);
      sunday.setUTCDate(monday.getUTCDate() + 6);
      sunday.setUTCHours(23, 59, 59, 999);
      return { dateFrom: monday.toISOString(), dateTo: sunday.toISOString() };
    }

    // month
    const firstDay = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 1));
    const lastDay  = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + 1, 0, 23, 59, 59, 999));
    return { dateFrom: firstDay.toISOString(), dateTo: lastDay.toISOString() };
  }
}

export const commissionSettingsService = new CommissionSettingsService();
