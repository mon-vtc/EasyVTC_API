import { supabaseAdmin } from '../../database/supabase/client.js';
import { sendManagerAccessEmail } from '../../utils/email.service.js';
import type {
  CreateManagerDto, UpdateManagerDto, ChangeManagerStatusDto, ManagerListFilters,
  ClientListFilters, ClientListResult, ClientWithStats,
  ClientGlobalStats, ClientTripsResult, ClientTripItem,
  SetManagerPermissionsDto, ManagerPermissionsResult, ManagerPermission,
  AdminStats,
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

    const clientsWithStats: ClientWithStats[] = (clients ?? []).map(c => {
      const s = statsMap.get(c.id);
      const cancellationRate = s && s.total_trips > 0
        ? Math.round((s.cancelled / s.total_trips) * 100)
        : 0;
      return {
        ...(c as any),
        total_trips:       s?.total_trips        ?? 0,
        total_spent:       Math.round((s?.total_spent ?? 0) * 100) / 100,
        last_trip_date:    s?.last_trip_date      ?? null,
        avg_rating:        null,
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

    return {
      ...(client as any),
      total_trips,
      total_spent:       Math.round(total_spent * 100) / 100,
      last_trip_date,
      avg_rating:        null,
      cancellation_rate: total_trips > 0 ? Math.round((cancelled / total_trips) * 100) : 0,
    };
  }

  // ── GET /admin/stats — Tableau de bord statistiques ────────────────────────
  async getStats(): Promise<AdminStats> {
    const [
      { data: reservations },
      { data: drivers },
      { count: totalClients },
      { count: activeClients },
    ] = await Promise.all([
      supabaseAdmin
        .from('reservations')
        .select('status, price_final, price_estimated, country, vehicle_type'),
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

    for (const r of rows) {
      by_status[r.status] = (by_status[r.status] ?? 0) + 1;

      if (r.status === 'completed') {
        const amount = Number(r.price_final ?? r.price_estimated ?? 0);
        if (r.country === 'senegal') total_xof += amount;
        else                         total_eur += amount;

        if (r.vehicle_type) {
          vehicleDist[r.vehicle_type] = (vehicleDist[r.vehicle_type] ?? 0) + 1;
        }
      }
    }

    // Chauffeurs — décompte par statut
    const driverRows = drivers ?? [];
    const totalDrivers  = driverRows.length;
    const activeDrivers = driverRows.filter(d => d.status === 'active').length;
    const onlineDrivers = driverRows.filter(d => d.is_online === true).length;
    const onTripDrivers = driverRows.filter(d => d.status === 'on_trip').length;

    return {
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
        rating:            null,
      };
    });

    const total = count ?? 0;
    return { trips: tripItems, total, page, limit, total_pages: Math.ceil(total / limit) };
  }
}

export const adminService = new AdminService();
