import { randomBytes } from 'crypto';
import { supabaseAdmin } from '../../database/supabase/client.js';
import { sendManagerWelcomeEmail } from '../../utils/email.service.js';
import { reservationsService } from '../reservations/reservations.service.js';
import { usersService } from '../users/users.service.js';
import type {
  CreateManagerDto,
  CreateManagerResult,
  ChangeStatusDto,
  AdminUserListFilters,
  AdminStats,
} from './admin.types.js';
import type {
  ReservationListFilters,
  ReservationListResult,
  ReservationWithRelations,
  AssignDriverDto,
} from '../reservations/reservations.types.js';
import type { UserListResult } from '../users/users.types.js';

// ── Colonnes manager sélectionnées ────────────────────────────────────────────
const MANAGER_COLUMNS = `
  id, email, role, first_name, last_name, phone,
  status, status_changed_by, status_changed_at, status_reason,
  created_at, updated_at
`;

function generateTempPassword(): string {
  // Garantit : uppercase (M), lowercase (gr), chiffres (hex), caractères spéciaux (_!)
  const hex = randomBytes(8).toString('hex').toUpperCase();
  return `Mgr_${hex}!`;
}

// =============================================================================
// SERVICE
// =============================================================================

export class AdminService {

  // ── CRÉER UN GESTIONNAIRE ──────────────────────────────────────────────────
  async createManager(dto: CreateManagerDto): Promise<CreateManagerResult> {
    const tempPassword = generateTempPassword();

    // 1. Créer le compte Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email:         dto.email,
      password:      tempPassword,
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

    // 2. Attendre que le trigger handle_new_user crée le profil (max 2s)
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

    // 3. Fallback : si le trigger n'a pas créé le profil, insertion manuelle
    if (!profileExists) {
      console.warn('[Admin] Trigger handle_new_user timed out — fallback insert manuel');

      const { error: insertError } = await supabaseAdmin
        .from('users')
        .insert({
          id:         userId,
          email:      dto.email,
          first_name: dto.first_name,
          last_name:  dto.last_name,
          phone:      dto.phone ?? null,
          role:       'manager',
        });

      if (insertError) {
        await supabaseAdmin.auth.admin.deleteUser(userId);
        throw { status: 500, message: 'Erreur lors de la création du profil gestionnaire' };
      }
    } else {
      // 4. S'assurer que le rôle est bien 'manager' (le trigger peut l'avoir mis à 'client')
      await supabaseAdmin
        .from('users')
        .update({
          role:       'manager',
          first_name: dto.first_name,
          last_name:  dto.last_name,
          phone:      dto.phone ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);
    }

    // 5. Récupérer le profil final
    const { data: manager, error: fetchError } = await supabaseAdmin
      .from('users')
      .select(MANAGER_COLUMNS)
      .eq('id', userId)
      .single();

    if (fetchError || !manager) {
      throw { status: 500, message: 'Gestionnaire créé mais profil introuvable' };
    }

    // 6. Envoyer l'email avec les identifiants (non bloquant)
    sendManagerWelcomeEmail(dto.email, dto.first_name, tempPassword).catch((err) =>
      console.warn('[Admin] Manager welcome email failed:', err)
    );

    return manager as CreateManagerResult;
  }

  // ── LISTER LES UTILISATEURS ────────────────────────────────────────────────
  async listUsers(filters: AdminUserListFilters): Promise<UserListResult> {
    return usersService.listUsers(filters);
  }

  // ── OBTENIR UN UTILISATEUR PAR ID ─────────────────────────────────────────
  async getUserById(userId: string) {
    return usersService.getUserById(userId);
  }

  // ── CHANGER LE STATUT D'UN UTILISATEUR ────────────────────────────────────
  async changeUserStatus(
    targetUserId: string,
    dto: ChangeStatusDto,
    adminId: string,
  ) {
    // Vérifier que l'admin ne se désactive pas lui-même
    if (targetUserId === adminId && dto.status !== 'active') {
      throw { status: 400, message: 'Vous ne pouvez pas désactiver votre propre compte' };
    }

    // Vérifier que l'utilisateur cible existe
    const { data: target, error: checkError } = await supabaseAdmin
      .from('users')
      .select('id, role')
      .eq('id', targetUserId)
      .single();

    if (checkError || !target) {
      throw { status: 404, message: 'Utilisateur introuvable' };
    }

    // Un admin ne peut pas modifier le statut d'un autre admin
    if (target.role === 'admin' && targetUserId !== adminId) {
      throw { status: 403, message: 'Vous ne pouvez pas modifier le statut d\'un autre administrateur' };
    }

    const { data, error } = await supabaseAdmin
      .from('users')
      .update({
        status:             dto.status,
        status_reason:      dto.reason ?? null,
        status_changed_by:  adminId,
        status_changed_at:  new Date().toISOString(),
        updated_at:         new Date().toISOString(),
      })
      .eq('id', targetUserId)
      .select(MANAGER_COLUMNS)
      .single();

    if (error || !data) {
      throw { status: 500, message: 'Erreur lors de la mise à jour du statut' };
    }

    // Invalider les sessions si le compte est désactivé/verrouillé
    if (dto.status !== 'active') {
      supabaseAdmin.auth.admin.signOut(targetUserId, 'global').catch((err) => {
        console.warn(`[Admin] Impossible d'invalider les sessions de ${targetUserId}:`, err);
      });
    }

    return data;
  }

  // ── LISTER LES RÉSERVATIONS (vue admin/manager) ───────────────────────────
  async listReservations(filters: ReservationListFilters): Promise<ReservationListResult> {
    return reservationsService.listReservations(filters);
  }

  // ── DÉTAIL D'UNE RÉSERVATION ──────────────────────────────────────────────
  async getReservationById(
    reservationId: string,
    adminId: string,
  ): Promise<ReservationWithRelations> {
    return reservationsService.getById(reservationId, adminId, 'admin');
  }

  // ── ASSIGNER UN CHAUFFEUR ─────────────────────────────────────────────────
  async assignDriver(
    reservationId: string,
    dto: AssignDriverDto,
    adminId: string,
  ): Promise<ReservationWithRelations> {
    return reservationsService.assignDriver(reservationId, dto, adminId);
  }

  // ── STATISTIQUES DASHBOARD ────────────────────────────────────────────────
  async getStats(): Promise<AdminStats> {
    const [
      reservationsTotal,
      reservationsPending,
      reservationsAssigned,
      reservationsInProgress,
      reservationsCompleted,
      reservationsCancelled,
      driversTotal,
      driversActive,
      driversOnline,
      usersTotal,
      usersClients,
      usersManagers,
      revenueResult,
      vehiclesStandard,
      vehiclesBerline,
      vehiclesVan,
    ] = await Promise.all([
      supabaseAdmin.from('reservations').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('reservations').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabaseAdmin.from('reservations').select('*', { count: 'exact', head: true }).eq('status', 'assigned'),
      supabaseAdmin.from('reservations').select('*', { count: 'exact', head: true }).eq('status', 'in_progress'),
      supabaseAdmin.from('reservations').select('*', { count: 'exact', head: true }).eq('status', 'completed'),
      supabaseAdmin.from('reservations').select('*', { count: 'exact', head: true }).eq('status', 'cancelled'),
      supabaseAdmin.from('drivers').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('drivers').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabaseAdmin.from('drivers').select('*', { count: 'exact', head: true }).eq('is_online', true),
      supabaseAdmin.from('users').select('*', { count: 'exact', head: true }).is('deleted_at', null),
      supabaseAdmin.from('users').select('*', { count: 'exact', head: true }).eq('role', 'client').is('deleted_at', null),
      supabaseAdmin.from('users').select('*', { count: 'exact', head: true }).eq('role', 'manager').is('deleted_at', null),
      supabaseAdmin.from('reservations').select('price_estimated').eq('status', 'completed'),
      supabaseAdmin.from('reservations').select('*', { count: 'exact', head: true }).eq('vehicle_type', 'standard'),
      supabaseAdmin.from('reservations').select('*', { count: 'exact', head: true }).eq('vehicle_type', 'berline'),
      supabaseAdmin.from('reservations').select('*', { count: 'exact', head: true }).eq('vehicle_type', 'van'),
    ]);

    // Calcul du chiffre d'affaires (somme des prix des courses complétées)
    const totalRevenue = (revenueResult.data ?? []).reduce(
      (sum: number, r: { price_estimated: number | null }) => sum + (r.price_estimated ?? 0),
      0,
    );

    return {
      reservations: {
        total:       reservationsTotal.count ?? 0,
        pending:     reservationsPending.count ?? 0,
        assigned:    reservationsAssigned.count ?? 0,
        in_progress: reservationsInProgress.count ?? 0,
        completed:   reservationsCompleted.count ?? 0,
        cancelled:   reservationsCancelled.count ?? 0,
      },
      drivers: {
        total:  driversTotal.count ?? 0,
        active: driversActive.count ?? 0,
        online: driversOnline.count ?? 0,
      },
      users: {
        total:    usersTotal.count ?? 0,
        clients:  usersClients.count ?? 0,
        managers: usersManagers.count ?? 0,
      },
      revenue: {
        total:    Math.round(totalRevenue * 100) / 100,
        currency: 'EUR',
      },
      vehicles: {
        standard: vehiclesStandard.count ?? 0,
        berline:  vehiclesBerline.count ?? 0,
        van:      vehiclesVan.count ?? 0,
      },
    };
  }
}

export const adminService = new AdminService();
