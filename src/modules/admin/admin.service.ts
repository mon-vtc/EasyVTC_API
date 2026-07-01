import { supabaseAdmin } from '../../database/supabase/client.js';
import { sendManagerAccessEmail } from '../../utils/email.service.js';
import { ratingsService } from '../ratings/ratings.service.js';
import type {
  CreateManagerDto, UpdateManagerDto, ChangeManagerStatusDto, ManagerListFilters,
  ClientListFilters, ClientListResult, ClientWithStats,
  ClientGlobalStats, ClientTripsResult, ClientTripItem,
  SetManagerPermissionsDto, ManagerPermissionsResult, ManagerPermission,
  AdminStats, AdminStatsFilters,
  AdminDashboardPeriod, AdminDashboard,
  TopDriver, PopularRoute, PeakHourSlot, RevenueChartEntry,
} from './admin.types.js';
import type { UserProfile } from '../users/users.types.js';

const USER_PROFILE_COLUMNS = `
  id, email, role, first_name, last_name, phone,
  profile_photo_url, status, status_changed_by, status_changed_at, status_reason,
  coverage_zone, priority_level,
  rgpd_consent, rgpd_consent_at, deleted_at, created_at, updated_at
`;

export class AdminService {

  // ── Génère un mot de passe aléatoire sécurisé (12 chars) ───────────────────
  private generatePassword(): string {
    const lower  = 'abcdefghijklmnopqrstuvwxyz';
    const upper  = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const digits = '0123456789';
    const special = '!@#$%&*';
    const all    = lower + upper + digits + special;
    const rand   = (s: string) => s[Math.floor(Math.random() * s.length)];
    // Garantit la présence d'au moins un de chaque catégorie
    const base = rand(lower) + rand(upper) + rand(digits) + rand(special);
    const rest = Array.from({ length: 8 }, () => rand(all)).join('');
    return (base + rest).split('').sort(() => Math.random() - 0.5).join('');
  }

  // ── POST /admin/managers — Créer un compte gestionnaire ─────────────────────
  async createManager(dto: CreateManagerDto, _createdBy?: string): Promise<UserProfile> {
    const password = dto.password ?? this.generatePassword();
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email:         dto.email,
      password,
      email_confirm: true,
      user_metadata: {
        first_name:   dto.first_name,
        last_name:    dto.last_name,
        role:         'manager',
        rgpd_consent: false,
      },
    });

    if (authError) {
      if (
        authError.message.includes('already registered') ||
        authError.code === 'email_exists' ||
        authError.message.includes('already been registered')
      ) {
        throw { status: 409, message: 'Un compte existe déjà avec cet email' };
      }
      throw { status: 400, message: authError.message };
    }

    if (!authData.user) {
      throw { status: 500, message: 'Erreur lors de la création du compte gestionnaire' };
    }

    // Attendre que le trigger handle_new_user crée le profil dans public.users
    let profileExists = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('id', authData.user.id)
        .single();
      if (data) { profileExists = true; break; }
      await new Promise((r) => setTimeout(r, 400));
    }

    // Fallback : si le trigger n'a pas répondu à temps
    if (!profileExists) {
      console.warn('[Admin] Trigger handle_new_user timed out — fallback insert manuel');

      const { error: insertError } = await supabaseAdmin
        .from('users')
        .insert({
          id:         authData.user.id,
          email:      dto.email,
          first_name: dto.first_name,
          last_name:  dto.last_name,
          phone:      dto.phone ?? null,
          role:       'manager',
          rgpd_consent: false,
        });

      if (insertError) {
        console.error('[Admin] Fallback insert échoué:', insertError.message);
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
        throw { status: 500, message: 'Erreur lors de la création du profil gestionnaire' };
      }
    }

    const { data: profile, error: fetchError } = await supabaseAdmin
      .from('users')
      .select(USER_PROFILE_COLUMNS)
      .eq('id', authData.user.id)
      .single();

    if (fetchError || !profile) {
      throw { status: 500, message: 'Gestionnaire créé mais profil introuvable' };
    }

    sendManagerAccessEmail(dto.email, dto.first_name, password).catch((err) =>
      console.warn('[Email] Manager access email failed:', err)
    );

    return profile as UserProfile;
  }

  // ── GET /admin/managers — Liste paginée des gestionnaires ───────────────────
  async listManagers(filters?: ManagerListFilters) {
    const page  = filters?.page  ?? 1;
    const limit = filters?.limit ?? 20;
    const from  = (page - 1) * limit;
    const to    = from + limit - 1;

    let query = supabaseAdmin
      .from('users')
      .select(USER_PROFILE_COLUMNS, { count: 'exact' })
      .eq('role', 'manager')
      .is('deleted_at', null);

    if (filters?.status) query = query.eq('status', filters.status);
    if (filters?.search) {
      const s = filters.search;
      query = query.or(`email.ilike.%${s}%,first_name.ilike.%${s}%,last_name.ilike.%${s}%`);
    }

    const { data, error, count } = await query
      .range(from, to)
      .order('created_at', { ascending: false });

    if (error) throw { status: 500, message: error.message };

    const total = count ?? 0;
    return {
      managers:    (data ?? []) as UserProfile[],
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit),
    };
  }

  // ── GET /admin/managers/:id ─────────────────────────────────────────────────
  async getManagerById(id: string): Promise<UserProfile> {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select(USER_PROFILE_COLUMNS)
      .eq('id', id)
      .eq('role', 'manager')
      .is('deleted_at', null)
      .single();

    if (error || !data) throw { status: 404, message: 'Gestionnaire introuvable' };
    return data as UserProfile;
  }

  // ── PATCH /admin/managers/:id ───────────────────────────────────────────────
  async updateManager(id: string, dto: UpdateManagerDto): Promise<UserProfile> {
    await this.getManagerById(id);

    const { data, error } = await supabaseAdmin
      .from('users')
      .update({ ...dto, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(USER_PROFILE_COLUMNS)
      .single();

    if (error || !data) throw { status: 500, message: 'Erreur lors de la mise à jour' };
    return data as UserProfile;
  }

  // ── PATCH /admin/managers/:id/status ────────────────────────────────────────
  async changeManagerStatus(id: string, dto: ChangeManagerStatusDto, changedBy: string): Promise<UserProfile> {
    await this.getManagerById(id);

    const { data, error } = await supabaseAdmin
      .from('users')
      .update({
        status:             dto.status,
        status_reason:      dto.reason,
        status_changed_at:  new Date().toISOString(),
        status_changed_by:  changedBy,
      })
      .eq('id', id)
      .select(USER_PROFILE_COLUMNS)
      .single();

    if (error || !data) throw { status: 500, message: 'Erreur lors du changement de statut' };
    return data as UserProfile;
  }

  // ── GET /admin/managers/:id/permissions ─────────────────────────────────────
  async getManagerPermissions(managerId: string): Promise<ManagerPermissionsResult> {
    await this.getManagerById(managerId);

    const { data, error } = await supabaseAdmin
      .from('manager_permissions')
      .select('permission')
      .eq('manager_id', managerId);

    if (error) throw { status: 500, message: error.message };

    return {
      manager_id:  managerId,
      permissions: (data ?? []).map(r => r.permission as ManagerPermission),
    };
  }

  // ── PUT /admin/managers/:id/permissions ──────────────────────────────────────
  async setManagerPermissions(
    managerId: string,
    dto: SetManagerPermissionsDto,
    grantedBy: string,
  ): Promise<ManagerPermissionsResult> {
    await this.getManagerById(managerId);

    const { error: deleteError } = await supabaseAdmin
      .from('manager_permissions')
      .delete()
      .eq('manager_id', managerId);

    if (deleteError) throw { status: 500, message: deleteError.message };

    if (dto.permissions.length > 0) {
      const rows = dto.permissions.map(p => ({
        manager_id: managerId,
        permission:  p,
        granted_by:  grantedBy,
      }));

      const { error: insertError } = await supabaseAdmin
        .from('manager_permissions')
        .insert(rows);

      if (insertError) throw { status: 500, message: insertError.message };
    }

    return { manager_id: managerId, permissions: dto.permissions };
  }

  // ── DELETE /admin/managers/:id (soft delete) ────────────────────────────────
  async deleteManager(id: string): Promise<void> {
    await this.getManagerById(id);

    const { error } = await supabaseAdmin
      .from('users')
      .update({ deleted_at: new Date().toISOString(), status: 'inactive' })
      .eq('id', id);

    if (error) throw { status: 500, message: 'Erreur lors de la suppression' };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MODULE CLIENTS
  // ══════════════════════════════════════════════════════════════════════════

  private async getClientGlobalStats(): Promise<ClientGlobalStats> {
    const [
      { count: activeCount },
      { count: tripCount },
      { data: completedTrips },
    ] = await Promise.all([
      supabaseAdmin
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'client')
        .eq('status', 'active')
        .is('deleted_at', null),
      supabaseAdmin
        .from('reservations')
        .select('id', { count: 'exact', head: true }),
      supabaseAdmin
        .from('reservations')
        .select('price_final, price_estimated')
        .eq('status', 'completed'),
    ]);

    const totalRevenue = (completedTrips ?? []).reduce(
      (sum, r) => sum + (r.price_final ?? r.price_estimated ?? 0),
      0,
    );

    return {
      active_count:  activeCount ?? 0,
      total_trips:   tripCount   ?? 0,
      total_revenue: Math.round(totalRevenue * 100) / 100,
    };
  }

  // ── GET /admin/clients — Liste paginée avec stats ───────────────────────────
  async listClients(filters?: ClientListFilters): Promise<ClientListResult> {
    const page  = filters?.page  ?? 1;
    const limit = filters?.limit ?? 20;
    const from  = (page - 1) * limit;
    const to    = from + limit - 1;

    let query = supabaseAdmin
      .from('users')
      .select(USER_PROFILE_COLUMNS, { count: 'exact' })
      .eq('role', 'client')
      .is('deleted_at', null);

    if (filters?.status) query = query.eq('status', filters.status);
    if (filters?.search) {
      const s = filters.search;
      query = query.or(
        `email.ilike.%${s}%,first_name.ilike.%${s}%,last_name.ilike.%${s}%,phone.ilike.%${s}%`,
      );
    }

    const { data: clients, error, count } = await query
      .range(from, to)
      .order('created_at', { ascending: false });

    if (error) throw { status: 500, message: error.message };

    // Stats par client depuis les réservations
    const clientIds = (clients ?? []).map(c => c.id);
    const statsMap = new Map<string, {
      total_trips: number; total_spent: number;
      last_trip_date: string | null; cancelled: number;
    }>();

    if (clientIds.length > 0) {
      const { data: reservations } = await supabaseAdmin
        .from('reservations')
        .select('client_id, status, price_estimated, price_final, scheduled_at')
        .in('client_id', clientIds);

      for (const r of reservations ?? []) {
        const s = statsMap.get(r.client_id) ?? {
          total_trips: 0, total_spent: 0, last_trip_date: null, cancelled: 0,
        };
        s.total_trips++;
        if (r.status === 'completed') s.total_spent += r.price_final ?? r.price_estimated ?? 0;
        if (r.status === 'cancelled') s.cancelled++;
        if (!s.last_trip_date || r.scheduled_at > s.last_trip_date) s.last_trip_date = r.scheduled_at;
        statsMap.set(r.client_id, s);
      }
    }

    const avgRatingMap = new Map<string, number | null>();
    await Promise.all(
      clientIds.map(async (id: string) => {
        avgRatingMap.set(id, await ratingsService.computeAvgSubmittedByClient(id));
      }),
    );

    const clientsWithStats: ClientWithStats[] = (clients ?? []).map(c => {
      const s = statsMap.get((c as any).id);
      const cancellationRate = s && s.total_trips > 0
        ? Math.round((s.cancelled / s.total_trips) * 100)
        : 0;
      return {
        ...(c as any),
        total_trips:       s?.total_trips        ?? 0,
        total_spent:       Math.round((s?.total_spent ?? 0) * 100) / 100,
        last_trip_date:    s?.last_trip_date      ?? null,
        avg_rating:        avgRatingMap.get((c as any).id) ?? null,
        cancellation_rate: cancellationRate,
      };
    });

    const global_stats = await this.getClientGlobalStats();
    const total = count ?? 0;

    return {
      clients: clientsWithStats,
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit),
      global_stats,
    };
  }

  // ── GET /admin/clients/:id — Détail avec stats ──────────────────────────────
  async getClientById(id: string): Promise<ClientWithStats> {
    const { data: client, error } = await supabaseAdmin
      .from('users')
      .select(USER_PROFILE_COLUMNS)
      .eq('id', id)
      .eq('role', 'client')
      .is('deleted_at', null)
      .single();

    if (error || !client) throw { status: 404, message: 'Client introuvable' };

    const { data: reservations } = await supabaseAdmin
      .from('reservations')
      .select('status, price_estimated, price_final, scheduled_at')
      .eq('client_id', id);

    let total_trips = 0, total_spent = 0, cancelled = 0;
    let last_trip_date: string | null = null;

    for (const r of reservations ?? []) {
      total_trips++;
      if (r.status === 'completed') total_spent += r.price_final ?? r.price_estimated ?? 0;
      if (r.status === 'cancelled') cancelled++;
      if (!last_trip_date || r.scheduled_at > last_trip_date) last_trip_date = r.scheduled_at;
    }

    const avg_rating = await ratingsService.computeAvgSubmittedByClient(id);

    return {
      ...(client as any),
      total_trips,
      total_spent:       Math.round(total_spent * 100) / 100,
      last_trip_date,
      avg_rating,
      cancellation_rate: total_trips > 0 ? Math.round((cancelled / total_trips) * 100) : 0,
    };
  }

  // ── GET /admin/stats — Tableau de bord statistiques ────────────────────────
  async getStats(filters?: AdminStatsFilters): Promise<AdminStats> {
    const { dateFrom, dateTo } = this.normalizeStatsDateRange(filters);

    let reservationsQuery = supabaseAdmin
      .from('reservations')
      .select('status, price_final, price_estimated, country, driver_id');

    if (dateFrom) reservationsQuery = reservationsQuery.gte('scheduled_at', dateFrom);
    if (dateTo)   reservationsQuery = reservationsQuery.lte('scheduled_at', dateTo);

    const [
      { data: reservations },
      { data: drivers },
      { count: totalClients },
      { count: activeClients },
    ] = await Promise.all([
      reservationsQuery,
      supabaseAdmin
        .from('drivers')
        .select('status, is_online'),
      supabaseAdmin
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'client')
        .is('deleted_at', null),
      supabaseAdmin
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'client')
        .eq('status', 'active')
        .is('deleted_at', null),
    ]);

    // Réservations — totaux et répartition par statut
    const rows = reservations ?? [];
    const by_status: Record<string, number> = {};
    let total_eur = 0;
    let total_xof = 0;
    const vehicleDist: Record<string, number> = {};
    const completedDriverIds = new Set<string>();

    for (const r of rows) {
      by_status[r.status] = (by_status[r.status] ?? 0) + 1;

      if (r.status === 'completed') {
        const amount = Number(r.price_final ?? r.price_estimated ?? 0);
        if (r.country === 'senegal') total_xof += amount;
        else                         total_eur += amount;

        if (r.driver_id) {
          completedDriverIds.add(r.driver_id);
        }
      }
    }

    let reservationDriverTypes: Array<{ id: string; vehicle_type: string | null }> = [];
    if (completedDriverIds.size > 0) {
      const { data: driverTypes, error: driverTypesError } = await supabaseAdmin
        .from('drivers')
        .select('id, vehicle_type')
        .in('id', Array.from(completedDriverIds));

      if (driverTypesError) throw { status: 500, message: driverTypesError.message };
      reservationDriverTypes = driverTypes ?? [];
    }

    for (const driver of reservationDriverTypes) {
      if (!driver.vehicle_type) continue;
      vehicleDist[driver.vehicle_type] = (vehicleDist[driver.vehicle_type] ?? 0) + 1;
    }

    // Chauffeurs — décompte par statut
    const driverRows = drivers ?? [];
    const totalDrivers  = driverRows.length;
    const activeDrivers = driverRows.filter(d => d.status === 'active').length;
    const onlineDrivers = driverRows.filter(d => d.is_online === true).length;
    const onTripDrivers = driverRows.filter(d => d.status === 'on_trip').length;

    return {
      date_from: dateFrom,
      date_to:   dateTo,
      reservations: {
        total:     rows.length,
        by_status,
      },
      revenue: {
        total_eur: Math.round(total_eur * 100) / 100,
        total_xof: Math.round(total_xof),
      },
      drivers: {
        total:   totalDrivers,
        active:  activeDrivers,
        online:  onlineDrivers,
        on_trip: onTripDrivers,
      },
      clients: {
        total:  totalClients  ?? 0,
        active: activeClients ?? 0,
      },
      vehicle_type_distribution: vehicleDist,
    };
  }

  // ── GET /admin/clients/:id/trips — Historique des courses ──────────────────
  async getClientTrips(clientId: string, page = 1, limit = 20): Promise<ClientTripsResult> {
    const from = (page - 1) * limit;
    const to   = from + limit - 1;

    const { data: trips, error, count } = await supabaseAdmin
      .from('reservations')
      .select(
        'id, scheduled_at, pickup_address, dest_address, price_final, price_estimated, status, driver_id',
        { count: 'exact' },
      )
      .eq('client_id', clientId)
      .order('scheduled_at', { ascending: false })
      .range(from, to);

    if (error) throw { status: 500, message: error.message };

    // Résoudre les noms des chauffeurs (drivers.id → drivers.user_id → users)
    const driverIds = (trips ?? []).filter(t => t.driver_id).map(t => t.driver_id as string);
    const driverNameMap = new Map<string, { first_name: string; last_name: string }>();

    if (driverIds.length > 0) {
      const { data: drivers } = await supabaseAdmin
        .from('drivers')
        .select('id, user_id')
        .in('id', driverIds);

      const userIds = (drivers ?? []).map(d => d.user_id);

      if (userIds.length > 0) {
        const { data: driverUsers } = await supabaseAdmin
          .from('users')
          .select('id, first_name, last_name')
          .in('id', userIds);

        const userMap = new Map((driverUsers ?? []).map(u => [u.id, u]));
        for (const d of drivers ?? []) {
          const u = userMap.get(d.user_id);
          if (u) driverNameMap.set(d.id, { first_name: u.first_name, last_name: u.last_name });
        }
      }
    }

    const reservationIds = (trips ?? []).map(t => t.id);
    const ratingMap = new Map<string, number | null>();
    await Promise.all(
      reservationIds.map(async (id: string) => {
        ratingMap.set(id, await ratingsService.getRatingForReservation(id));
      }),
    );

    const tripItems: ClientTripItem[] = (trips ?? []).map(t => {
      const driver = t.driver_id ? driverNameMap.get(t.driver_id) : undefined;
      return {
        id:                t.id,
        scheduled_at:      t.scheduled_at,
        pickup_address:    t.pickup_address,
        dest_address:      t.dest_address,
        price_final:       t.price_final,
        price_estimated:   t.price_estimated,
        status:            t.status,
        driver_first_name: driver?.first_name ?? null,
        driver_last_name:  driver?.last_name  ?? null,
        rating:            ratingMap.get(t.id) ?? null,
      };
    });

    const total = count ?? 0;
    return { trips: tripItems, total, page, limit, total_pages: Math.ceil(total / limit) };
  }

  private normalizeStatsDateRange(filters?: AdminStatsFilters): { dateFrom: string | null; dateTo: string | null } {
    if (!filters) return { dateFrom: null, dateTo: null };
    if (filters.date_from || filters.date_to) {
      const dateFrom = filters.date_from ? this.toStartOfDay(filters.date_from) : null;
      const dateTo   = filters.date_to   ? this.toEndOfDay(filters.date_to)   : null;
      return { dateFrom, dateTo };
    }

    if (filters.date || filters.period) {
      const period = filters.period ?? 'day';
      const date   = filters.date;
      return this.computeDateRange(period, date);
    }

    return { dateFrom: null, dateTo: null };
  }

  private computeDateRange(period: 'all' | 'day' | 'week' | 'month', date?: string): { dateFrom: string | null; dateTo: string | null } {
    if (period === 'all') return { dateFrom: null, dateTo: null };

    const today = date ? new Date(`${date}T00:00:00.000Z`) : new Date();
    if (Number.isNaN(today.getTime())) throw { status: 400, message: 'Date invalide' };

    if (period === 'day') {
      return {
        dateFrom: this.toStartOfDay(date ?? today.toISOString().slice(0, 10)),
        dateTo:   this.toEndOfDay(date ?? today.toISOString().slice(0, 10)),
      };
    }

    if (period === 'week') {
      const day = today.getUTCDay();
      const diffToMonday = day === 0 ? -6 : 1 - day;
      const monday = new Date(today);
      monday.setUTCDate(today.getUTCDate() + diffToMonday);
      monday.setUTCHours(0, 0, 0, 0);

      const sunday = new Date(monday);
      sunday.setUTCDate(monday.getUTCDate() + 6);
      sunday.setUTCHours(23, 59, 59, 999);

      return {
        dateFrom: monday.toISOString(),
        dateTo:   sunday.toISOString(),
      };
    }

    const firstDay = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1, 0, 0, 0, 0));
    const lastDay = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0, 23, 59, 59, 999));

    return {
      dateFrom: firstDay.toISOString(),
      dateTo:   lastDay.toISOString(),
    };
  }

  // ── GET /admin/dashboard — Tableau de bord analytique avancé ───────────────
  async getDashboard(period: AdminDashboardPeriod, date?: string): Promise<AdminDashboard> {
    const { dateFrom, dateTo }         = this._dashboardRange(period, date);
    const { dateFrom: prevFrom,
            dateTo:   prevTo }         = this._previousPeriod(period, dateFrom, dateTo);
    const { dateFrom: yearFrom,
            dateTo:   yearTo }         = this._yearRange(dateFrom);

    const [
      { data: currRaw },
      { data: prevRaw },
      { data: yearRaw },
      { data: driversRaw },
      { count: totalClients },
      { count: activeClients },
      { data: ratingsRaw },
    ] = await Promise.all([
      supabaseAdmin
        .from('reservations')
        .select('status, price_final, price_estimated, country, driver_id, pickup_address, dest_address, scheduled_at')
        .gte('scheduled_at', dateFrom)
        .lte('scheduled_at', dateTo),
      supabaseAdmin
        .from('reservations')
        .select('status, price_final, price_estimated, country')
        .gte('scheduled_at', prevFrom)
        .lte('scheduled_at', prevTo),
      supabaseAdmin
        .from('reservations')
        .select('scheduled_at, price_final, price_estimated, country')
        .eq('status', 'completed')
        .gte('scheduled_at', yearFrom)
        .lte('scheduled_at', yearTo),
      supabaseAdmin
        .from('drivers')
        .select('status, is_online'),
      supabaseAdmin
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'client')
        .is('deleted_at', null),
      supabaseAdmin
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'client')
        .eq('status', 'active')
        .is('deleted_at', null),
      supabaseAdmin
        .from('ratings')
        .select('driver_id, note')
        .gte('created_at', dateFrom)
        .lte('created_at', dateTo),
    ]);

    const curr    = currRaw    ?? [];
    const prev    = prevRaw    ?? [];
    const yearRes = yearRaw    ?? [];
    const ratings = ratingsRaw ?? [];

    // ── Revenue ────────────────────────────────────────────────────────────
    const [currEur, currXof] = this._sumRevenue(curr);
    const [prevEur]          = this._sumRevenue(prev);
    const revTrend = prevEur > 0
      ? Math.round(((currEur - prevEur) / prevEur) * 1000) / 10
      : null;

    // ── Trips ──────────────────────────────────────────────────────────────
    const completed  = curr.filter(r => r.status === 'completed').length;
    const cancelled  = curr.filter(r => r.status === 'cancelled').length;
    const prevTotal  = prev.length;
    const tripsTrend = prevTotal > 0
      ? Math.round(((curr.length - prevTotal) / prevTotal) * 1000) / 10
      : null;
    const completionRate = (completed + cancelled) > 0
      ? Math.round((completed / (completed + cancelled)) * 1000) / 10
      : 0;

    // ── Revenue chart (12 mois de l'année) ────────────────────────────────
    const MONTH_LABELS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
    const chart: RevenueChartEntry[] = MONTH_LABELS.map(label => ({ label, eur: 0, xof: 0 }));
    for (const r of yearRes) {
      const m   = new Date(r.scheduled_at as string).getUTCMonth();
      const amt = Number(r.price_final ?? r.price_estimated ?? 0);
      if (r.country === 'senegal') chart[m]!.xof += amt;
      else                         chart[m]!.eur += amt;
    }
    for (const e of chart) {
      e.eur = Math.round(e.eur * 100) / 100;
      e.xof = Math.round(e.xof);
    }

    // ── Chauffeurs ─────────────────────────────────────────────────────────
    const driverRows    = driversRaw ?? [];
    const totalDrivers  = driverRows.length;
    const activeDrivers = driverRows.filter(d => d.status === 'active').length;

    // ── Note moyenne globale ───────────────────────────────────────────────
    const avgRating = ratings.length > 0
      ? Math.round((ratings.reduce((s, r) => s + (r.note as number), 0) / ratings.length) * 10) / 10
      : null;

    // ── Top 3 chauffeurs ───────────────────────────────────────────────────
    const completedRows = curr.filter(r => r.status === 'completed' && r.driver_id);
    const driverRevMap  = new Map<string, { rev: number; trips: number }>();
    for (const r of completedRows) {
      const id  = r.driver_id as string;
      const amt = Number(r.price_final ?? r.price_estimated ?? 0);
      const cur = driverRevMap.get(id) ?? { rev: 0, trips: 0 };
      driverRevMap.set(id, { rev: cur.rev + amt, trips: cur.trips + 1 });
    }

    const driverRatingMap = new Map<string, number[]>();
    for (const rt of ratings) {
      if (!rt.driver_id) continue;
      const arr = driverRatingMap.get(rt.driver_id as string) ?? [];
      arr.push(rt.note as number);
      driverRatingMap.set(rt.driver_id as string, arr);
    }

    const topIds = [...driverRevMap.entries()]
      .sort((a, b) => b[1].rev - a[1].rev)
      .slice(0, 3)
      .map(([id]) => id);

    const driverUserMap = new Map<string, { first_name: string; last_name: string }>();
    if (topIds.length > 0) {
      const { data: driverRecords } = await supabaseAdmin
        .from('drivers')
        .select('id, user_id')
        .in('id', topIds);
      if (driverRecords && driverRecords.length > 0) {
        const userIds = driverRecords.map(d => d.user_id as string);
        const { data: userRecords } = await supabaseAdmin
          .from('users')
          .select('id, first_name, last_name')
          .in('id', userIds);
        const uMap = new Map((userRecords ?? []).map(u => [u.id as string, u]));
        for (const d of driverRecords) {
          const u = uMap.get(d.user_id as string);
          if (u) driverUserMap.set(d.id as string, { first_name: u.first_name as string, last_name: u.last_name as string });
        }
      }
    }

    const topDrivers: TopDriver[] = topIds.map((id, idx) => {
      const { rev, trips } = driverRevMap.get(id)!;
      const user   = driverUserMap.get(id);
      const scores = driverRatingMap.get(id);
      return {
        rank:        idx + 1,
        driver_id:   id,
        first_name:  user?.first_name ?? '',
        last_name:   user?.last_name  ?? '',
        trip_count:  trips,
        avg_rating:  scores && scores.length > 0
          ? Math.round((scores.reduce((s, x) => s + x, 0) / scores.length) * 10) / 10
          : null,
        revenue_eur: Math.round(rev * 100) / 100,
      };
    });

    // ── Trajets populaires (top 5) ─────────────────────────────────────────
    const routeMap = new Map<string, number>();
    for (const r of curr) {
      if (!r.pickup_address || !r.dest_address) continue;
      const key = `${r.pickup_address as string}||${r.dest_address as string}`;
      routeMap.set(key, (routeMap.get(key) ?? 0) + 1);
    }
    const popularRoutes: PopularRoute[] = [...routeMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([key, count]) => {
        const sep = key.indexOf('||');
        return {
          pickup_address: key.slice(0, sep),
          dest_address:   key.slice(sep + 2),
          count,
        };
      });

    // ── Heures de pointe ───────────────────────────────────────────────────
    const SLOTS = [
      { slot: '6h-9h',   from: 6,  to: 8  },
      { slot: '9h-12h',  from: 9,  to: 11 },
      { slot: '12h-15h', from: 12, to: 14 },
      { slot: '15h-18h', from: 15, to: 17 },
      { slot: '18h-21h', from: 18, to: 20 },
    ];
    const slotCount = new Map(SLOTS.map(s => [s.slot, 0]));
    for (const r of curr) {
      const h = new Date(r.scheduled_at as string).getUTCHours();
      for (const s of SLOTS) {
        if (h >= s.from && h <= s.to) {
          slotCount.set(s.slot, (slotCount.get(s.slot) ?? 0) + 1);
          break;
        }
      }
    }
    const peakHours: PeakHourSlot[] = SLOTS.map(s => ({
      slot:  s.slot,
      count: slotCount.get(s.slot) ?? 0,
    }));

    return {
      period,
      date_from: dateFrom,
      date_to:   dateTo,
      revenue: {
        total_eur: Math.round(currEur * 100) / 100,
        total_xof: Math.round(currXof),
        trend_pct: revTrend,
        chart,
      },
      trips: {
        total:           curr.length,
        completed,
        cancelled,
        completion_rate: completionRate,
        trend_pct:       tripsTrend,
      },
      drivers: { total: totalDrivers,  active: activeDrivers },
      clients: { total: totalClients ?? 0, active: activeClients ?? 0 },
      avg_rating:     avgRating,
      top_drivers:    topDrivers,
      popular_routes: popularRoutes,
      peak_hours:     peakHours,
    };
  }

  private _sumRevenue(
    rows: Array<{ status: string; price_final: unknown; price_estimated: unknown; country: string }>,
  ): [number, number] {
    let eur = 0, xof = 0;
    for (const r of rows) {
      if (r.status !== 'completed') continue;
      const amt = Number(r.price_final ?? r.price_estimated ?? 0);
      if (r.country === 'senegal') xof += amt;
      else                         eur += amt;
    }
    return [eur, xof];
  }

  private _dashboardRange(period: AdminDashboardPeriod, date?: string): { dateFrom: string; dateTo: string } {
    const today = date ? new Date(`${date}T00:00:00.000Z`) : new Date();
    if (Number.isNaN(today.getTime())) throw { status: 400, message: 'Date invalide' };

    if (period === 'week') {
      const diff   = today.getUTCDay() === 0 ? -6 : 1 - today.getUTCDay();
      const monday = new Date(today);
      monday.setUTCDate(today.getUTCDate() + diff);
      monday.setUTCHours(0, 0, 0, 0);
      const sunday = new Date(monday);
      sunday.setUTCDate(monday.getUTCDate() + 6);
      sunday.setUTCHours(23, 59, 59, 999);
      return { dateFrom: monday.toISOString(), dateTo: sunday.toISOString() };
    }

    if (period === 'month') {
      const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1, 0, 0, 0, 0));
      const last  = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0, 23, 59, 59, 999));
      return { dateFrom: first.toISOString(), dateTo: last.toISOString() };
    }

    const first = new Date(Date.UTC(today.getUTCFullYear(), 0,  1, 0,  0,  0,   0));
    const last  = new Date(Date.UTC(today.getUTCFullYear(), 11, 31, 23, 59, 59, 999));
    return { dateFrom: first.toISOString(), dateTo: last.toISOString() };
  }

  private _previousPeriod(
    period: AdminDashboardPeriod,
    dateFrom: string,
    dateTo:   string,
  ): { dateFrom: string; dateTo: string } {
    if (period === 'week') {
      const f = new Date(dateFrom); f.setUTCDate(f.getUTCDate() - 7);
      const t = new Date(dateTo);   t.setUTCDate(t.getUTCDate() - 7);
      return { dateFrom: f.toISOString(), dateTo: t.toISOString() };
    }
    if (period === 'month') {
      const ref  = new Date(dateFrom);
      const year = ref.getUTCFullYear();
      const mon  = ref.getUTCMonth() - 1; // may be -1 → Dec of prev year
      const first = new Date(Date.UTC(year, mon, 1, 0, 0, 0, 0));
      const last  = new Date(Date.UTC(year, mon + 1, 0, 23, 59, 59, 999));
      return { dateFrom: first.toISOString(), dateTo: last.toISOString() };
    }
    const f = new Date(dateFrom); f.setUTCFullYear(f.getUTCFullYear() - 1);
    const t = new Date(dateTo);   t.setUTCFullYear(t.getUTCFullYear() - 1);
    return { dateFrom: f.toISOString(), dateTo: t.toISOString() };
  }

  private _yearRange(dateFrom: string): { dateFrom: string; dateTo: string } {
    const year = new Date(dateFrom).getUTCFullYear();
    return {
      dateFrom: new Date(Date.UTC(year, 0,  1, 0,  0,  0,   0)).toISOString(),
      dateTo:   new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)).toISOString(),
    };
  }

  private normalizeDateString(dateString: string): string {
    const trimmed = dateString.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    if (/^\d{2}-\d{2}-\d{4}$/.test(trimmed)) {
      const [day, month, year] = trimmed.split('-');
      return `${year}-${month}-${day}`;
    }
    throw { status: 400, message: 'Date invalide' };
  }

  private toStartOfDay(dateString: string): string {
    const normalized = this.normalizeDateString(dateString);
    const [year, month, day] = normalized.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    if (Number.isNaN(date.getTime())) throw { status: 400, message: 'Date invalide' };
    return date.toISOString();
  }

  private toEndOfDay(dateString: string): string {
    const normalized = this.normalizeDateString(dateString);
    const [year, month, day] = normalized.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
    if (Number.isNaN(date.getTime())) throw { status: 400, message: 'Date invalide' };
    return date.toISOString();
  }
}

export const adminService = new AdminService();
