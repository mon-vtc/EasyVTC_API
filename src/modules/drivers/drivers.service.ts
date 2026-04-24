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
      .select(DRIVER_WITH_USER_SELECT, { count: 'exact' });

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
        `user.email.ilike.${term},user.first_name.ilike.${term},user.last_name.ilike.${term}`
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
  // GET /drivers/me/planning — planning hebdo ou mensuel
  // ────────────────────────────────────────────────────────────────────────────
  async getPlanning(
    userId:  string,
    period:  PlanningPeriod,
    date?:   string,
  ): Promise<DriverPlanningResult> {
    const driverId = await this.resolveDriverId(userId);

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
      console.error('[Drivers] getPlanning error:', error);
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

    return {
      period,
      date_from:    dateFrom,
      date_to:      dateTo,
      reservations,
      total:        reservations.length,
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // GET /drivers/me/revenues — revenus sur la période
  // ────────────────────────────────────────────────────────────────────────────
  async getRevenues(
    userId:  string,
    period:  RevenuesPeriod,
    date?:   string,
  ): Promise<DriverRevenuesResult> {
    const driverId = await this.resolveDriverId(userId);

    let dateFrom: string | null = null;
    let dateTo:   string | null = null;

    if (period !== 'all') {
      const range = this._computeDateRange(period as PlanningPeriod, date);
      dateFrom = range.dateFrom;
      dateTo   = range.dateTo;
    }

    let query = supabaseAdmin
      .from('reservations')
      .select('id, scheduled_at, pickup_address, dest_address, price_final, price_adjusted, country')
      .eq('driver_id', driverId)
      .eq('status', 'completed')
      .order('scheduled_at', { ascending: false });

    if (dateFrom) query = query.gte('scheduled_at', dateFrom);
    if (dateTo)   query = query.lte('scheduled_at', dateTo);

    const { data, error } = await query;

    if (error) {
      console.error('[Drivers] getRevenues error:', error);
      throw { status: 500, message: 'Erreur lors de la récupération des revenus' };
    }

    const rows = data ?? [];

    // Devise : EUR si tout est France, sinon on indique la pluralité
    // Pour simplifier, on agrège en EUR (Sénégal reste en XOF séparé si besoin côté client)
    let totalRevenue = 0;
    const trips = rows.map((r: any) => {
      // Montant effectif : price_adjusted s'il existe, sinon price_final
      const amount   = Number(r.price_adjusted ?? r.price_final ?? 0);
      const currency = r.country === 'senegal' ? 'XOF' : 'EUR';
      if (currency === 'EUR') totalRevenue += amount;
      return {
        reservation_id: r.id,
        scheduled_at:   r.scheduled_at,
        pickup_address: r.pickup_address,
        dest_address:   r.dest_address,
        price_final:    amount,
        currency,
      };
    });

    return {
      period,
      date_from:     dateFrom,
      date_to:       dateTo,
      total_trips:   trips.length,
      total_revenue: Math.round(totalRevenue * 100) / 100,
      currency:      'EUR',
      trips,
    };
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
}

export const driversService = new DriversService();
