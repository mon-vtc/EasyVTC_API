// ══════════════════════════════════════════════════════════════════════════════
// SERVICE — Module Drivers
// Sprint 3 — EazyVTC
// ══════════════════════════════════════════════════════════════════════════════

import { supabaseAdmin } from '../../database/supabase/client.js';
import { vehicleTypesService } from '../vehicle-types/vehicle-types.service.js';
import type {
  DriverWithUser,
  UpdateDriverDto,
  ChangeDriverStatusDto,
  AdminUpdateDriverDto,
  DriverListFilters,
  DriverListResult,
  PlanningPeriod,
  DriverPlanningResult,
  RevenuesPeriod,
  DriverRevenuesResult,
  DriverUnavailability,
  CreateUnavailabilityDto,
  DriverAvailabilityResult,
  DayOfWeek,
  WeeklyScheduleResult,
  SetScheduleDto,
} from './drivers.types.js';

// ── Colonnes du join drivers + user ──────────────────────────────────────────
const DRIVER_WITH_USER_SELECT = `
  id, user_id, status, vehicle_type, siret, tva_rate, is_online, zone, status_reason, created_at, updated_at,
  user:users!inner (
    id, email, first_name, last_name, phone, profile_photo_url, status, created_at
  )
`;

// ══════════════════════════════════════════════════════════════════════════════
// SERVICE
// ══════════════════════════════════════════════════════════════════════════════

export class DriversService {

  // ────────────────────────────────────────────────────────────────────────────
  // Résoudre le driver_id depuis user_id (helper interne)
  // ────────────────────────────────────────────────────────────────────────────
  private async resolveDriverId(userId: string): Promise<string> {
    const { data, error } = await supabaseAdmin
      .from('drivers')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      throw { status: 404, message: 'Profil chauffeur non trouvé' };
    }

    return data.id;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CHAUFFEUR — Endpoints self
  // ══════════════════════════════════════════════════════════════════════════

  // ────────────────────────────────────────────────────────────────────────────
  // GET /drivers/me
  // ────────────────────────────────────────────────────────────────────────────
  async getMyProfile(userId: string): Promise<DriverWithUser> {
    const { data, error } = await supabaseAdmin
      .from('drivers')
      .select(DRIVER_WITH_USER_SELECT)
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      throw { status: 404, message: 'Profil chauffeur non trouvé' };
    }

    return data as unknown as DriverWithUser;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // PATCH /drivers/me — siret, zone, vehicle_type
  // ────────────────────────────────────────────────────────────────────────────
  async updateMyProfile(userId: string, dto: UpdateDriverDto): Promise<DriverWithUser> {
    if (dto.vehicle_type) {
      await vehicleTypesService.validateCode(dto.vehicle_type);
    }

    const { data, error } = await supabaseAdmin
      .from('drivers')
      .update({ ...dto, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .select(DRIVER_WITH_USER_SELECT)
      .single();

    if (error || !data) {
      console.error('[Drivers] Update profile error:', error);
      throw { status: 500, message: 'Erreur lors de la mise à jour du profil' };
    }

    return data as unknown as DriverWithUser;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // PATCH /drivers/me/online — passer en ligne / hors ligne
  // ────────────────────────────────────────────────────────────────────────────
  async setOnlineStatus(userId: string, isOnline: boolean): Promise<DriverWithUser> {
    // Seul un chauffeur avec statut 'active' peut modifier sa disponibilité en ligne
    const { data: driver } = await supabaseAdmin
      .from('drivers')
      .select('status')
      .eq('user_id', userId)
      .single();

    if (!driver) {
      throw { status: 404, message: 'Profil chauffeur non trouvé' };
    }

    if (driver.status === 'on_trip') {
      throw {
        status: 403,
        message: 'Vous ne pouvez pas modifier votre disponibilité en cours de mission',
      };
    }

    if (isOnline && driver.status !== 'active') {
      throw {
        status: 403,
        message: 'Votre profil chauffeur doit être validé avant de pouvoir passer en ligne',
      };
    }

    const { data, error } = await supabaseAdmin
      .from('drivers')
      .update({ is_online: isOnline, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .select(DRIVER_WITH_USER_SELECT)
      .single();

    if (error || !data) {
      console.error('[Drivers] Toggle online error:', error);
      throw { status: 500, message: 'Erreur lors de la mise à jour du statut en ligne' };
    }

    return data as unknown as DriverWithUser;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ADMIN — Endpoints d'administration
  // ══════════════════════════════════════════════════════════════════════════

  // ────────────────────────────────────────────────────────────────────────────
  // GET /admin/drivers — liste paginée avec filtres
  // ────────────────────────────────────────────────────────────────────────────
  async listDrivers(filters: DriverListFilters): Promise<DriverListResult> {
    const page  = filters.page  ?? 1;
    const limit = filters.limit ?? 20;
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('drivers')
      .select(DRIVER_WITH_USER_SELECT, { count: 'exact' })
      .eq('users.role', 'driver');

    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    if (filters.zone) {
      query = query.eq('zone', filters.zone);
    }
    if (filters.vehicle_type) {
      query = query.eq('vehicle_type', filters.vehicle_type);
    }
    if (filters.is_online !== undefined) {
      query = query.eq('is_online', filters.is_online);
    }
    if (filters.search) {
      const term = `%${filters.search}%`;
      query = query.or(
        `email.ilike.${term},first_name.ilike.${term},last_name.ilike.${term}`,
        { foreignTable: 'users' }
      );
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('[Drivers] List error:', error);
      throw { status: 500, message: 'Erreur lors de la récupération des chauffeurs' };
    }

    const total = count ?? 0;

    return {
      drivers: (data ?? []) as unknown as DriverWithUser[],
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit),
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // GET /admin/drivers/:id
  // ────────────────────────────────────────────────────────────────────────────
  async getDriverById(driverId: string): Promise<DriverWithUser> {
    const { data, error } = await supabaseAdmin
      .from('drivers')
      .select(DRIVER_WITH_USER_SELECT)
      .eq('id', driverId)
      .single();

    if (error || !data) {
      throw { status: 404, message: 'Chauffeur non trouvé' };
    }

    return data as unknown as DriverWithUser;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // PATCH /admin/drivers/:id/status — valider / rejeter / suspendre
  // ────────────────────────────────────────────────────────────────────────────
  async changeDriverStatus(driverId: string, dto: ChangeDriverStatusDto): Promise<DriverWithUser> {
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('drivers')
      .select('id, status')
      .eq('id', driverId)
      .single();

    if (fetchError || !existing) {
      throw { status: 404, message: 'Chauffeur non trouvé' };
    }

    // Empêcher les transitions sans sens
    if (existing.status === dto.status) {
      throw { status: 400, message: `Le chauffeur est déjà au statut "${dto.status}"` };
    }
    if (existing.status === 'rejected' && dto.status !== 'active') {
      throw { status: 400, message: 'Un chauffeur rejeté ne peut être que réactivé (active)' };
    }
    if (existing.status === 'on_trip' && dto.status !== 'suspended') {
      throw { status: 400, message: 'Un chauffeur en mission ne peut être que suspendu (urgence)' };
    }
    if (existing.status === 'suspended' && dto.status === 'rejected') {
      throw { status: 400, message: 'Un chauffeur suspendu ne peut pas être directement rejeté. Réactivez-le d\'abord (active).' };
    }

    // Si on suspend ou rejette un chauffeur, le passer hors ligne
    const extraFields = (dto.status === 'suspended' || dto.status === 'rejected')
      ? { is_online: false }
      : {};

    const { data, error } = await supabaseAdmin
      .from('drivers')
      .update({
        status:        dto.status,
        status_reason: dto.reason,
        ...extraFields,
        updated_at: new Date().toISOString(),
      })
      .eq('id', driverId)
      .select(DRIVER_WITH_USER_SELECT)
      .single();

    if (error || !data) {
      console.error('[Drivers] Change status error:', error);
      throw { status: 500, message: 'Erreur lors du changement de statut' };
    }

    return data as unknown as DriverWithUser;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // PRIVÉ — Logique commune planning (partagée self + admin)
  // ────────────────────────────────────────────────────────────────────────────
  private async _fetchPlanning(
    driverId: string,
    period:   PlanningPeriod,
    date?:    string,
  ): Promise<DriverPlanningResult> {
    const { dateFrom, dateTo } = this._computeDateRange(period, date);

    const { data, error } = await supabaseAdmin
      .from('reservations')
      .select(`
        id, status, scheduled_at,
        pickup_address, dest_address, vehicle_type,
        price_estimated, price_final, country,
        client:users!client_id(first_name, last_name, phone),
        trip:trips!reservation_id(id, started_at, ended_at, actual_distance_km, actual_duration_min)
      `)
      .eq('driver_id', driverId)
      .neq('status', 'cancelled')
      .gte('scheduled_at', dateFrom)
      .lte('scheduled_at', dateTo)
      .order('scheduled_at', { ascending: true });

    if (error) {
      console.error('[Drivers] _fetchPlanning error:', error);
      throw { status: 500, message: 'Erreur lors de la récupération du planning' };
    }

    const reservations = (data ?? []).map((r: any) => ({
      id:              r.id,
      status:          r.status,
      scheduled_at:    r.scheduled_at,
      pickup_address:  r.pickup_address,
      dest_address:    r.dest_address,
      vehicle_type:    r.vehicle_type,
      price_estimated: r.price_estimated,
      price_final:     r.price_final ?? null,
      country:         r.country,
      client:          r.client ?? null,
      trip:            Array.isArray(r.trip) ? (r.trip[0] ?? null) : (r.trip ?? null),
    }));

    return { period, date_from: dateFrom, date_to: dateTo, reservations, total: reservations.length };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // PRIVÉ — Logique commune revenus (partagée self + admin)
  // ────────────────────────────────────────────────────────────────────────────
  private async _fetchRevenues(
    driverId: string,
    period:   RevenuesPeriod,
    date?:    string,
  ): Promise<DriverRevenuesResult> {
    let dateFrom: string | null = null;
    let dateTo:   string | null = null;

    if (period !== 'all') {
      const range = this._computeDateRange(period as PlanningPeriod, date);
      dateFrom = range.dateFrom;
      dateTo   = range.dateTo;
    }

    // 1. Réservations terminées avec infos client
    let query = supabaseAdmin
      .from('reservations')
      .select('id, scheduled_at, pickup_address, dest_address, price_final, price_adjusted, country, client_id, client:users!client_id(first_name, last_name)')
      .eq('driver_id', driverId)
      .eq('status', 'completed')
      .order('scheduled_at', { ascending: false });

    if (dateFrom) query = query.gte('scheduled_at', dateFrom);
    if (dateTo)   query = query.lte('scheduled_at', dateTo);

    const { data, error } = await query;

    if (error) {
      console.error('[Drivers] _fetchRevenues error:', error);
      throw { status: 500, message: 'Erreur lors de la récupération des revenus' };
    }

    const rows = data ?? [];
    if (rows.length === 0) {
      return {
        period, date_from: dateFrom, date_to: dateTo,
        total_trips: 0, total_gross: 0, total_commission: 0, total_net: 0,
        total_revenue: 0, currency: 'EUR',
        revenue_by_currency: { EUR: 0, XOF: 0 },
        trips: [],
      };
    }

    // 2. Commissions + ratings en parallèle
    const reservationIds = rows.map((r: any) => r.id);
    const [{ data: commData }, { data: ratingsData }] = await Promise.all([
      supabaseAdmin
        .from('commissions')
        .select('reservation_id, commission_amount, driver_net_amount')
        .in('reservation_id', reservationIds),
      supabaseAdmin
        .from('ratings')
        .select('reservation_id, note')
        .in('reservation_id', reservationIds),
    ]);

    const commMap = new Map<string, { commission_amount: number; driver_net_amount: number }>();
    for (const c of (commData ?? [])) {
      commMap.set(c.reservation_id, {
        commission_amount: Number(c.commission_amount),
        driver_net_amount: Number(c.driver_net_amount),
      });
    }

    const ratingMap = new Map<string, number>();
    for (const rt of (ratingsData ?? [])) {
      ratingMap.set(rt.reservation_id, rt.note);
    }

    let grossEur = 0, grossXof = 0;
    let commEur  = 0, commXof  = 0;
    let netEur   = 0, netXof   = 0;

    const trips = rows.map((r: any) => {
      const gross    = Number(r.price_adjusted ?? r.price_final ?? 0);
      const currency = r.country === 'senegal' ? 'XOF' : 'EUR';
      const comm     = commMap.get(r.id);
      const commissionAmount = comm ? comm.commission_amount : 0;
      const netAmount        = comm ? comm.driver_net_amount : gross;

      if (currency === 'XOF') {
        grossXof += gross;
        commXof  += commissionAmount;
        netXof   += netAmount;
      } else {
        grossEur += gross;
        commEur  += commissionAmount;
        netEur   += netAmount;
      }

      return {
        reservation_id:    r.id,
        scheduled_at:      r.scheduled_at,
        pickup_address:    r.pickup_address,
        dest_address:      r.dest_address,
        price_final:       gross,
        commission_amount: commissionAmount,
        net_amount:        netAmount,
        currency,
        client_first_name: (r.client as any)?.first_name ?? null,
        client_last_name:  (r.client as any)?.last_name  ?? null,
        rating:            ratingMap.get(r.id) ?? null,
      };
    });

    const primaryIsXof = grossEur === 0 && grossXof > 0;
    const round2       = (n: number) => Math.round(n * 100) / 100;

    const totalGross = primaryIsXof ? Math.round(grossXof) : round2(grossEur);
    const totalComm  = primaryIsXof ? Math.round(commXof)  : round2(commEur);
    const totalNet   = primaryIsXof ? Math.round(netXof)   : round2(netEur);

    return {
      period,
      date_from:           dateFrom,
      date_to:             dateTo,
      total_trips:         trips.length,
      total_gross:         totalGross,
      total_commission:    totalComm,
      total_net:           totalNet,
      total_revenue:       totalNet,           // alias rétro-compatibilité
      currency:            primaryIsXof ? 'XOF' : 'EUR',
      revenue_by_currency: {
        EUR: round2(netEur),
        XOF: Math.round(netXof),
      },
      trips,
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // GET /drivers/me/planning — chauffeur voit son propre planning
  // ────────────────────────────────────────────────────────────────────────────
  async getPlanning(userId: string, period: PlanningPeriod, date?: string): Promise<DriverPlanningResult> {
    const driverId = await this.resolveDriverId(userId);
    return this._fetchPlanning(driverId, period, date);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // GET /admin/drivers/:id/planning — admin voit le planning d'un chauffeur
  // ────────────────────────────────────────────────────────────────────────────
  async getPlanningAdmin(driverId: string, period: PlanningPeriod, date?: string): Promise<DriverPlanningResult> {
    const { data: driver, error } = await supabaseAdmin
      .from('drivers')
      .select('id')
      .eq('id', driverId)
      .single();

    if (error || !driver) {
      throw { status: 404, message: 'Chauffeur non trouvé' };
    }

    return this._fetchPlanning(driverId, period, date);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // GET /drivers/me/revenues — chauffeur voit ses propres revenus
  // ────────────────────────────────────────────────────────────────────────────
  async getRevenues(userId: string, period: RevenuesPeriod, date?: string): Promise<DriverRevenuesResult> {
    const driverId = await this.resolveDriverId(userId);
    return this._fetchRevenues(driverId, period, date);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // GET /admin/drivers/:id/revenues — admin voit les revenus d'un chauffeur
  // ────────────────────────────────────────────────────────────────────────────
  async getRevenuesAdmin(driverId: string, period: RevenuesPeriod, date?: string): Promise<DriverRevenuesResult> {
    const { data: driver, error } = await supabaseAdmin
      .from('drivers')
      .select('id')
      .eq('id', driverId)
      .single();

    if (error || !driver) {
      throw { status: 404, message: 'Chauffeur non trouvé' };
    }

    return this._fetchRevenues(driverId, period, date);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // PRIVÉ — Calcul des bornes de date selon la période
  // ────────────────────────────────────────────────────────────────────────────
  private _computeDateRange(
    period: PlanningPeriod,
    date?:  string,
  ): { dateFrom: string; dateTo: string } {
    const ref = date ? new Date(`${date}T00:00:00.000Z`) : new Date();

    if (period === 'week') {
      // Lundi–dimanche de la semaine contenant la date de référence
      const day = ref.getUTCDay(); // 0 = dimanche
      const diffToMonday = day === 0 ? -6 : 1 - day;
      const monday = new Date(ref);
      monday.setUTCDate(ref.getUTCDate() + diffToMonday);
      monday.setUTCHours(0, 0, 0, 0);

      const sunday = new Date(monday);
      sunday.setUTCDate(monday.getUTCDate() + 6);
      sunday.setUTCHours(23, 59, 59, 999);

      return {
        dateFrom: monday.toISOString(),
        dateTo:   sunday.toISOString(),
      };
    }

    // Mois complet
    const firstDay = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 1));
    const lastDay  = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + 1, 0, 23, 59, 59, 999));

    return {
      dateFrom: firstDay.toISOString(),
      dateTo:   lastDay.toISOString(),
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DISPONIBILITÉ — Vue planning étendue (réservations + indisponibilités)
  // ══════════════════════════════════════════════════════════════════════════

  // ────────────────────────────────────────────────────────────────────────────
  // GET /drivers/me/availability — chauffeur voit sa disponibilité
  // ────────────────────────────────────────────────────────────────────────────
  async getAvailability(userId: string, period: PlanningPeriod, date?: string): Promise<DriverAvailabilityResult> {
    const driverId = await this.resolveDriverId(userId);
    return this._fetchAvailability(driverId, period, date);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // GET /admin/drivers/:id/availability — admin voit la disponibilité d'un chauffeur
  // ────────────────────────────────────────────────────────────────────────────
  async getAvailabilityAdmin(driverId: string, period: PlanningPeriod, date?: string): Promise<DriverAvailabilityResult> {
    const { data: driver, error } = await supabaseAdmin
      .from('drivers')
      .select('id')
      .eq('id', driverId)
      .single();

    if (error || !driver) throw { status: 404, message: 'Chauffeur non trouvé' };

    return this._fetchAvailability(driverId, period, date);
  }

  // ── PRIVÉ — merge planning + indisponibilités ─────────────────────────────
  private async _fetchAvailability(
    driverId: string,
    period:   PlanningPeriod,
    date?:    string,
  ): Promise<DriverAvailabilityResult> {
    const planning = await this._fetchPlanning(driverId, period, date);

    const { data: unavailData, error: unavailError } = await supabaseAdmin
      .from('driver_unavailability')
      .select('id, driver_id, reason, label, starts_at, ends_at, created_by, created_at, updated_at')
      .eq('driver_id', driverId)
      .lte('starts_at', planning.date_to)
      .gte('ends_at',   planning.date_from)
      .order('starts_at', { ascending: true });

    if (unavailError) {
      console.error('[Drivers] _fetchAvailability unavailability error:', unavailError);
      throw { status: 500, message: 'Erreur lors de la récupération des indisponibilités' };
    }

    const unavailabilities = (unavailData ?? []) as DriverUnavailability[];

    return {
      period,
      date_from:              planning.date_from,
      date_to:                planning.date_to,
      reservations:           planning.reservations,
      unavailabilities,
      total_reservations:     planning.total,
      total_unavailabilities: unavailabilities.length,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // INDISPONIBILITÉS — CRUD
  // ══════════════════════════════════════════════════════════════════════════

  // ────────────────────────────────────────────────────────────────────────────
  // POST /drivers/me/unavailability
  // ────────────────────────────────────────────────────────────────────────────
  async createUnavailability(
    userId:    string,
    dto:       CreateUnavailabilityDto,
  ): Promise<DriverUnavailability> {
    const driverId = await this.resolveDriverId(userId);
    return this._insertUnavailability(driverId, dto, userId);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // POST /admin/drivers/:id/unavailability
  // ────────────────────────────────────────────────────────────────────────────
  async createUnavailabilityAdmin(
    driverId:  string,
    dto:       CreateUnavailabilityDto,
    createdBy: string,
  ): Promise<DriverUnavailability> {
    const { data: driver, error } = await supabaseAdmin
      .from('drivers')
      .select('id')
      .eq('id', driverId)
      .single();

    if (error || !driver) throw { status: 404, message: 'Chauffeur non trouvé' };

    return this._insertUnavailability(driverId, dto, createdBy);
  }

  // ── PRIVÉ — insertion avec vérification de chevauchement ─────────────────
  private async _insertUnavailability(
    driverId:  string,
    dto:       CreateUnavailabilityDto,
    createdBy: string,
  ): Promise<DriverUnavailability> {
    // Avertissement chevauchement avec réservation confirmée
    const { data: overlap } = await supabaseAdmin
      .from('reservations')
      .select('id, scheduled_at')
      .eq('driver_id', driverId)
      .in('status', ['confirmed', 'assigned', 'arriving', 'in_progress'])
      .lte('scheduled_at', dto.ends_at)
      .gte('scheduled_at', dto.starts_at)
      .limit(1)
      .maybeSingle();

    if (overlap) {
      throw {
        status: 409,
        message: `Ce créneau chevauche une réservation confirmée (${overlap.id}). Annulez d'abord la réservation ou choisissez un autre créneau.`,
      };
    }

    const { data, error } = await supabaseAdmin
      .from('driver_unavailability')
      .insert({
        driver_id:  driverId,
        reason:     dto.reason,
        label:      dto.label ?? null,
        starts_at:  dto.starts_at,
        ends_at:    dto.ends_at,
        created_by: createdBy,
      })
      .select('*')
      .single();

    if (error || !data) {
      console.error('[Drivers] createUnavailability error:', error);
      throw { status: 500, message: 'Erreur lors de la création de l\'indisponibilité' };
    }

    return data as DriverUnavailability;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // GET /drivers/me/unavailability — lister ses propres indisponibilités
  // ────────────────────────────────────────────────────────────────────────────
  async listUnavailability(userId: string): Promise<DriverUnavailability[]> {
    const driverId = await this.resolveDriverId(userId);
    return this._queryUnavailability(driverId);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // GET /admin/drivers/:id/unavailability
  // ────────────────────────────────────────────────────────────────────────────
  async listUnavailabilityAdmin(driverId: string): Promise<DriverUnavailability[]> {
    const { data: driver, error } = await supabaseAdmin
      .from('drivers')
      .select('id')
      .eq('id', driverId)
      .single();

    if (error || !driver) throw { status: 404, message: 'Chauffeur non trouvé' };

    return this._queryUnavailability(driverId);
  }

  private async _queryUnavailability(driverId: string): Promise<DriverUnavailability[]> {
    const { data, error } = await supabaseAdmin
      .from('driver_unavailability')
      .select('*')
      .eq('driver_id', driverId)
      .order('starts_at', { ascending: true });

    if (error) {
      console.error('[Drivers] listUnavailability error:', error);
      throw { status: 500, message: 'Erreur lors de la récupération des indisponibilités' };
    }

    return (data ?? []) as DriverUnavailability[];
  }

  // ────────────────────────────────────────────────────────────────────────────
  // DELETE /drivers/me/unavailability/:unavailId
  // ────────────────────────────────────────────────────────────────────────────
  async deleteUnavailability(userId: string, unavailId: string): Promise<void> {
    const driverId = await this.resolveDriverId(userId);
    await this._removeUnavailability(unavailId, driverId);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // DELETE /admin/drivers/:id/unavailability/:unavailId
  // ────────────────────────────────────────────────────────────────────────────
  async deleteUnavailabilityAdmin(driverId: string, unavailId: string): Promise<void> {
    const { data: driver, error } = await supabaseAdmin
      .from('drivers')
      .select('id')
      .eq('id', driverId)
      .single();

    if (error || !driver) throw { status: 404, message: 'Chauffeur non trouvé' };

    await this._removeUnavailability(unavailId, driverId);
  }

  private async _removeUnavailability(unavailId: string, driverId: string): Promise<void> {
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('driver_unavailability')
      .select('id, starts_at, driver_id')
      .eq('id', unavailId)
      .single();

    if (fetchError || !existing) throw { status: 404, message: 'Indisponibilité introuvable' };

    if (existing.driver_id !== driverId) {
      throw { status: 403, message: 'Cette indisponibilité n\'appartient pas à ce chauffeur' };
    }

    if (new Date(existing.starts_at) <= new Date()) {
      throw { status: 400, message: 'Impossible de supprimer une indisponibilité déjà commencée ou passée' };
    }

    const { error } = await supabaseAdmin
      .from('driver_unavailability')
      .delete()
      .eq('id', unavailId);

    if (error) {
      console.error('[Drivers] deleteUnavailability error:', error);
      throw { status: 500, message: 'Erreur lors de la suppression de l\'indisponibilité' };
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // INTERNE — Basculer le statut on_trip (appelé par le module reservations)
  //   onTrip = true  → active → on_trip  (affectation d'une course)
  //   onTrip = false → on_trip → active  (course terminée / annulée)
  // ────────────────────────────────────────────────────────────────────────────
  async setOnTripStatus(driverId: string, onTrip: boolean): Promise<void> {
    const { data: driver, error: fetchError } = await supabaseAdmin
      .from('drivers')
      .select('id, status')
      .eq('id', driverId)
      .single();

    if (fetchError || !driver) {
      throw { status: 404, message: 'Chauffeur non trouvé' };
    }

    if (onTrip && driver.status !== 'active') {
      throw {
        status: 400,
        message: `Impossible de mettre en mission un chauffeur au statut "${driver.status}"`,
      };
    }

    if (!onTrip && driver.status !== 'on_trip') {
      // Pas en mission — rien à faire (idempotent)
      return;
    }

    const newStatus = onTrip ? 'on_trip' : 'active';

    const { error } = await supabaseAdmin
      .from('drivers')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', driverId);

    if (error) {
      console.error('[Drivers] setOnTripStatus error:', error);
      throw { status: 500, message: 'Erreur lors de la mise à jour du statut de mission' };
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // PATCH /admin/drivers/:id — mise à jour admin (tva_rate, siret, zone, etc.)
  // ────────────────────────────────────────────────────────────────────────────
  async adminUpdateDriver(driverId: string, dto: AdminUpdateDriverDto): Promise<DriverWithUser> {
    if (dto.vehicle_type) {
      await vehicleTypesService.validateCode(dto.vehicle_type);
    }

    const { data: existing } = await supabaseAdmin
      .from('drivers')
      .select('id')
      .eq('id', driverId)
      .single();

    if (!existing) {
      throw { status: 404, message: 'Chauffeur non trouvé' };
    }

    const { data, error } = await supabaseAdmin
      .from('drivers')
      .update({ ...dto, updated_at: new Date().toISOString() })
      .eq('id', driverId)
      .select(DRIVER_WITH_USER_SELECT)
      .single();

    if (error || !data) {
      console.error('[Drivers] Admin update error:', error);
      throw { status: 500, message: 'Erreur lors de la mise à jour' };
    }

    return data as unknown as DriverWithUser;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PLANNING HEBDOMADAIRE RÉCURRENT — GET + PUT /drivers/me/schedule
  // ════════════════════════════════════════════════════════════════════════════

  private static readonly DAYS_ORDER: DayOfWeek[] = [
    'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  ];

  private _buildScheduleResult(driverId: string, rows: Array<Record<string, unknown>>): WeeklyScheduleResult {
    const rowMap = new Map(rows.map((r) => [r.day_of_week as DayOfWeek, r]));
    const schedule = DriversService.DAYS_ORDER.map((day) => {
      const row = rowMap.get(day);
      return {
        day,
        is_available: (row?.is_available as boolean) ?? false,
        start_time:   (row?.start_time   as string | null) ?? null,
        end_time:     (row?.end_time     as string | null) ?? null,
      };
    });
    return { driver_id: driverId, schedule };
  }

  // ── GET /drivers/me/schedule ─────────────────────────────────────────────────
  async getSchedule(userId: string): Promise<WeeklyScheduleResult> {
    const driverId = await this.resolveDriverId(userId);

    const { data, error } = await supabaseAdmin
      .from('driver_weekly_schedule')
      .select('day_of_week, is_available, start_time, end_time')
      .eq('driver_id', driverId);

    if (error) {
      console.error('[Drivers] getSchedule error:', error);
      throw { status: 500, message: 'Erreur lors de la récupération du planning hebdomadaire' };
    }

    return this._buildScheduleResult(driverId, (data ?? []) as Array<Record<string, unknown>>);
  }

  // ── PUT /drivers/me/schedule ─────────────────────────────────────────────────
  async setSchedule(userId: string, dto: SetScheduleDto): Promise<WeeklyScheduleResult> {
    const driverId = await this.resolveDriverId(userId);

    // Suppression des lignes existantes puis réinsertion complète
    const { error: delError } = await supabaseAdmin
      .from('driver_weekly_schedule')
      .delete()
      .eq('driver_id', driverId);

    if (delError) {
      console.error('[Drivers] setSchedule delete error:', delError);
      throw { status: 500, message: 'Erreur lors de la mise à jour du planning' };
    }

    const rows = dto.schedule.map((day) => ({
      driver_id:    driverId,
      day_of_week:  day.day,
      is_available: day.is_available,
      start_time:   day.is_available ? (day.start_time ?? null) : null,
      end_time:     day.is_available ? (day.end_time   ?? null) : null,
    }));

    if (rows.length > 0) {
      const { error: insError } = await supabaseAdmin
        .from('driver_weekly_schedule')
        .insert(rows);

      if (insError) {
        console.error('[Drivers] setSchedule insert error:', insError);
        throw { status: 500, message: 'Erreur lors de la sauvegarde du planning' };
      }
    }

    return this.getSchedule(userId);
  }

  // ── GET /admin/drivers/:id/schedule ──────────────────────────────────────────
  async getScheduleAdmin(driverId: string): Promise<WeeklyScheduleResult> {
    const { data: driver, error: driverError } = await supabaseAdmin
      .from('drivers')
      .select('id')
      .eq('id', driverId)
      .single();

    if (driverError || !driver) throw { status: 404, message: 'Chauffeur introuvable' };

    const { data, error } = await supabaseAdmin
      .from('driver_weekly_schedule')
      .select('day_of_week, is_available, start_time, end_time')
      .eq('driver_id', driverId);

    if (error) {
      console.error('[Drivers] getScheduleAdmin error:', error);
      throw { status: 500, message: 'Erreur lors de la récupération du planning hebdomadaire' };
    }

    return this._buildScheduleResult(driverId, (data ?? []) as Array<Record<string, unknown>>);
  }
}

export const driversService = new DriversService();
