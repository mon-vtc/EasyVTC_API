// ══════════════════════════════════════════════════════════════════════════════
// SERVICE — Module Admin
// Sprint 3 — EazyVTC
// ══════════════════════════════════════════════════════════════════════════════

import { supabaseAdmin }                  from '../../database/supabase/client.js';
import { sendManagerCredentialsEmail }    from '../../utils/email.service.js';
import { usersService }                   from '../users/users.service.js';
import { reservationsService }            from '../reservations/reservations.service.js';
import type { UserProfile, UserListResult } from '../users/users.types.js';
import type { ChangeUserStatusDto }        from '../users/users.types.js';
import type {
  ReservationListFilters,
  ReservationListResult,
  AssignDriverDto,
  AvailableDriverDto,
}                                          from '../reservations/reservations.types.js';
import type {
  CreateManagerDto,
  ChangeManagerStatusDto,
  ManagerListFilters,
  ManagerListResult,
  AdminUserListFilters,
  AdminStatsResult,
}                                          from './admin.types.js';

const USER_PROFILE_COLUMNS = `
  id, email, role, first_name, last_name, phone,
  profile_photo_url, status, status_changed_by, status_changed_at, status_reason,
  rgpd_consent, rgpd_consent_at, deleted_at, created_at, updated_at
`;

// ── Générateur de mot de passe temporaire ─────────────────────────────────────
function generateTempPassword(): string {
  const lower  = 'abcdefghijklmnopqrstuvwxyz';
  const upper  = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const digits = '0123456789';
  const all    = lower + upper + digits;
  const pick   = (s: string) => s[Math.floor(Math.random() * s.length)];

  const parts: string[] = [
    pick(upper), pick(upper),
    pick(lower), pick(lower), pick(lower),
    pick(digits), pick(digits), pick(digits),
    ...Array.from({ length: 4 }, () => pick(all)),
  ];

  // Fisher-Yates shuffle
  for (let i = parts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [parts[i], parts[j]] = [parts[j], parts[i]];
  }
  return parts.join('');
}

// ══════════════════════════════════════════════════════════════════════════════
export class AdminService {

  // ══════════════════════════════════════════════════════════════════════════
  // GESTIONNAIRES
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Crée un compte gestionnaire.
   * Si aucun mot de passe n'est fourni, un mot de passe temporaire est généré
   * et envoyé par email au gestionnaire avec ses identifiants de connexion.
   */
  async createManager(dto: CreateManagerDto, adminId: string): Promise<UserProfile> {
    const tempPassword = dto.password ?? generateTempPassword();
    const isTempPwd    = !dto.password;

    // 1. Création du compte auth
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email:         dto.email,
        password:      tempPassword,
        phone:         dto.phone,
        email_confirm: true,
        user_metadata: {
          first_name: dto.first_name,
          last_name:  dto.last_name,
          role:       'manager',
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
      throw { status: 500, message: 'Erreur lors de la création du compte' };
    }

    const userId = authData.user.id;

    // 2. Attendre le trigger handle_new_user (jusqu'à 5 tentatives × 400 ms)
    let profileExists = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('id', userId)
        .single();

      if (data) { profileExists = true; break; }
      await new Promise((r) => setTimeout(r, 400));
    }

    // 3. Fallback : insert manuel si le trigger n'a pas réagi
    if (!profileExists) {
      console.warn('[AdminService] Trigger handle_new_user timed out — fallback insert manuel');

      const { error: insertError } = await supabaseAdmin
        .from('users')
        .insert({
          id:                userId,
          email:             dto.email,
          first_name:        dto.first_name,
          last_name:         dto.last_name,
          phone:             dto.phone ?? null,
          role:              'manager',
          status:            'active',
          status_changed_by: adminId,
          status_changed_at: new Date().toISOString(),
          status_reason:     'Compte créé par un administrateur',
          rgpd_consent:      false,
        });

      if (insertError) {
        console.error('[AdminService] Fallback insert échoué :', insertError.message);
        await supabaseAdmin.auth.admin.deleteUser(userId);
        throw { status: 500, message: 'Erreur lors de la création du profil gestionnaire' };
      }
    }

    // 4. Récupérer le profil complet
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('users')
      .select(USER_PROFILE_COLUMNS)
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      throw { status: 500, message: 'Profil créé mais introuvable' };
    }

    // 5. Email avec les identifiants (prioritaire sur le welcome email générique)
    if (isTempPwd) {
      sendManagerCredentialsEmail(dto.email, dto.first_name, dto.email, tempPassword).catch((err) =>
        console.warn('[AdminService] Credentials email failed:', err),
      );
    } else {
      sendManagerCredentialsEmail(dto.email, dto.first_name, dto.email, tempPassword).catch((err) =>
        console.warn('[AdminService] Credentials email failed:', err),
      );
    }

    return profile as UserProfile;
  }

  // ── LISTER LES GESTIONNAIRES ──────────────────────────────────────────────

  async listManagers(filters: ManagerListFilters): Promise<ManagerListResult> {
    const page  = filters.page  ?? 1;
    const limit = filters.limit ?? 20;
    const from  = (page - 1) * limit;
    const to    = from + limit - 1;

    let query = supabaseAdmin
      .from('users')
      .select(USER_PROFILE_COLUMNS, { count: 'exact' })
      .eq('role', 'manager')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (filters.status) {
      query = query.eq('status', filters.status);
    }

    if (filters.search) {
      const s = `%${filters.search}%`;
      query = query.or(
        `email.ilike.${s},first_name.ilike.${s},last_name.ilike.${s}`,
      );
    }

    const { data, error, count } = await query;

    if (error) {
      throw { status: 500, message: 'Erreur lors de la récupération des gestionnaires' };
    }

    const total       = count ?? 0;
    const total_pages = Math.ceil(total / limit);

    return {
      managers: (data ?? []) as UserProfile[],
      total,
      page,
      limit,
      total_pages,
    };
  }

  // ── DÉTAIL D'UN GESTIONNAIRE ──────────────────────────────────────────────

  async getManagerById(managerId: string): Promise<UserProfile> {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select(USER_PROFILE_COLUMNS)
      .eq('id', managerId)
      .eq('role', 'manager')
      .is('deleted_at', null)
      .single();

    if (error || !data) {
      throw { status: 404, message: 'Gestionnaire introuvable' };
    }

    return data as UserProfile;
  }

  // ── CHANGER LE STATUT D'UN GESTIONNAIRE ──────────────────────────────────

  async changeManagerStatus(
    managerId: string,
    dto:       ChangeManagerStatusDto,
    adminId:   string,
  ): Promise<UserProfile> {
    await this.getManagerById(managerId);
    return usersService.changeUserStatus(managerId, dto, adminId);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // UTILISATEURS (vue globale admin)
  // ══════════════════════════════════════════════════════════════════════════

  async listUsers(filters: AdminUserListFilters): Promise<UserListResult> {
    return usersService.listUsers(filters);
  }

  async changeUserStatus(
    targetUserId: string,
    dto:          ChangeUserStatusDto,
    adminId:      string,
  ): Promise<UserProfile> {
    return usersService.changeUserStatus(targetUserId, dto, adminId);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RÉSERVATIONS (vue globale admin / manager)
  // ══════════════════════════════════════════════════════════════════════════

  async listReservations(filters: ReservationListFilters): Promise<ReservationListResult> {
    return reservationsService.listReservations(filters);
  }

  async assignDriver(
    reservationId: string,
    dto:           AssignDriverDto,
    adminId:       string,
  ) {
    return reservationsService.assignDriver(reservationId, dto, adminId);
  }

  async getAvailableDrivers(scheduledAt?: string, durationMin?: number): Promise<AvailableDriverDto[]> {
    return reservationsService.getAvailableDrivers(scheduledAt, durationMin);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STATISTIQUES
  // ══════════════════════════════════════════════════════════════════════════

  async getStats(): Promise<AdminStatsResult> {
    // Toutes les requêtes en parallèle pour minimiser la latence
    const [
      reservationsRes,
      driversRes,
      onlineDriversRes,
      clientsRes,
      managersRes,
      revenueCompletedRes,
      revenueEstimatedRes,
    ] = await Promise.all([
      // Réservations par statut
      supabaseAdmin
        .from('reservations')
        .select('status'),

      // Total chauffeurs actifs
      supabaseAdmin
        .from('drivers')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active'),

      // Chauffeurs en ligne
      supabaseAdmin
        .from('drivers')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active')
        .eq('is_online', true),

      // Clients
      supabaseAdmin
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'client')
        .is('deleted_at', null),

      // Gestionnaires
      supabaseAdmin
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'manager')
        .is('deleted_at', null),

      // Revenu confirmé (courses terminées — prix final)
      supabaseAdmin
        .from('reservations')
        .select('price_final')
        .eq('status', 'completed')
        .not('price_final', 'is', null),

      // Revenu estimé (toutes courses non annulées)
      supabaseAdmin
        .from('reservations')
        .select('price_estimated')
        .neq('status', 'cancelled'),
    ]);

    // Agrégation des statuts de réservations
    const rows: { status: string }[] = (reservationsRes.data ?? []) as { status: string }[];
    const statusMap: Record<string, number> = {};
    for (const row of rows) {
      statusMap[row.status] = (statusMap[row.status] ?? 0) + 1;
    }

    // Répartition par type de véhicule (via le même dataset)
    const vehicleRes = await supabaseAdmin
      .from('reservations')
      .select('vehicle_type');

    const vehicleBreakdown: Record<string, number> = {};
    for (const row of (vehicleRes.data ?? []) as { vehicle_type: string }[]) {
      vehicleBreakdown[row.vehicle_type] = (vehicleBreakdown[row.vehicle_type] ?? 0) + 1;
    }

    const sumField = <T extends Record<string, unknown>>(rows: T[], field: keyof T): number =>
      rows.reduce((acc, row) => {
        const v = row[field];
        return acc + (typeof v === 'number' ? v : 0);
      }, 0);

    return {
      reservations: {
        total:       rows.length,
        pending:     statusMap['pending']       ?? 0,
        assigned:    statusMap['assigned']      ?? 0,
        in_progress: statusMap['in_progress']   ?? 0,
        completed:   statusMap['completed']     ?? 0,
        cancelled:   statusMap['cancelled']     ?? 0,
      },
      drivers: {
        total:  driversRes.count       ?? 0,
        online: onlineDriversRes.count ?? 0,
      },
      users: {
        clients:  clientsRes.count   ?? 0,
        managers: managersRes.count  ?? 0,
      },
      revenue: {
        confirmed: sumField(
          (revenueCompletedRes.data ?? []) as Record<string, unknown>[],
          'price_final',
        ),
        estimated: sumField(
          (revenueEstimatedRes.data ?? []) as Record<string, unknown>[],
          'price_estimated',
        ),
      },
      vehicle_breakdown: vehicleBreakdown,
    };
  }
}

export const adminService = new AdminService();
