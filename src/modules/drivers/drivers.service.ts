// ══════════════════════════════════════════════════════════════════════════════
// SERVICE — Module Drivers
// Sprint 3 — EazyVTC
// ══════════════════════════════════════════════════════════════════════════════

import { supabaseAdmin } from '../../database/supabase/client.js';
import type {
  DriverWithUser,
  UpdateDriverDto,
  ChangeDriverStatusDto,
  AdminUpdateDriverDto,
  DriverListFilters,
  DriverListResult,
} from './drivers.types.js';

// ── Colonnes du join drivers + user ──────────────────────────────────────────
const DRIVER_WITH_USER_SELECT = `
  id, user_id, status, vehicle_type, siret, tva_rate, is_online, zone, created_at, updated_at,
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
    // Seul un chauffeur avec statut 'active' peut passer en ligne
    const { data: driver } = await supabaseAdmin
      .from('drivers')
      .select('status')
      .eq('user_id', userId)
      .single();

    if (!driver) {
      throw { status: 404, message: 'Profil chauffeur non trouvé' };
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

    // Si on suspend ou rejette un chauffeur en ligne, le passer hors ligne
    const extraFields = (dto.status === 'suspended' || dto.status === 'rejected')
      ? { is_online: false }
      : {};

    const { data, error } = await supabaseAdmin
      .from('drivers')
      .update({
        status: dto.status,
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
  // PATCH /admin/drivers/:id — mise à jour admin (tva_rate, siret, zone, etc.)
  // ────────────────────────────────────────────────────────────────────────────
  async adminUpdateDriver(driverId: string, dto: AdminUpdateDriverDto): Promise<DriverWithUser> {
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
